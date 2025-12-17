#!/bin/bash
# CodeMap Results Backup to S3
#
# Purpose: Backup local results directory to S3 bucket
# Handles compression, versioning, and lifecycle management
#
# Usage:
#   sudo bash backup-to-s3.sh              # Full backup
#   sudo bash backup-to-s3.sh --dry-run    # Show what would happen
#   sudo bash backup-to-s3.sh --restore    # Restore from S3 to local
#   sudo bash backup-to-s3.sh --list       # List backup contents
#
# Prerequisites:
#   - AWS CLI installed: aws --version
#   - IAM role on EC2 with S3 permissions
#   - S3 bucket created: s3://codemap-results-ACCOUNT-ID
#   - Configuration in /etc/codemap/env:
#       CODEMAP_STORAGE=s3
#       CODEMAP_S3_BUCKET=codemap-results-ACCOUNT-ID
#       AWS_DEFAULT_REGION=us-west-2

set -euo pipefail

##############################################################################
# Configuration
##############################################################################

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Load environment configuration
ENV_FILE="/etc/codemap/env"
RESULTS_DIR="/opt/codemap/results"
LOG_FILE="/var/log/codemap-backup.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

##############################################################################
# Logging Functions
##############################################################################

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*" | tee -a "$LOG_FILE"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $*" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" | tee -a "$LOG_FILE"
}

##############################################################################
# Utility Functions
##############################################################################

check_prerequisites() {
    local missing_tools=()

    # Check required tools
    if ! command -v aws &> /dev/null; then
        missing_tools+=("aws CLI")
    fi

    if ! command -v tar &> /dev/null; then
        missing_tools+=("tar")
    fi

    if [ ${#missing_tools[@]} -gt 0 ]; then
        log_error "Missing required tools: ${missing_tools[*]}"
        log_error "Install with: sudo dnf install -y tar awscli"
        return 1
    fi

    # Check if running as root
    if [ "$EUID" -ne 0 ]; then
        log_error "This script must run as root (use sudo)"
        return 1
    fi

    return 0
}

load_configuration() {
    if [ ! -f "$ENV_FILE" ]; then
        log_error "Configuration file not found: $ENV_FILE"
        return 1
    fi

    # Source environment file
    # shellcheck source=/dev/null
    source "$ENV_FILE"

    # Verify required variables
    if [ -z "${CODEMAP_S3_BUCKET:-}" ]; then
        log_error "CODEMAP_S3_BUCKET not set in $ENV_FILE"
        return 1
    fi

    if [ -z "${AWS_DEFAULT_REGION:-}" ]; then
        log_warn "AWS_DEFAULT_REGION not set, using us-west-2"
        AWS_DEFAULT_REGION="us-west-2"
    fi

    return 0
}

check_s3_connectivity() {
    log_info "Checking S3 bucket connectivity..."

    if ! aws s3 ls "s3://${CODEMAP_S3_BUCKET}/" --region "${AWS_DEFAULT_REGION}" &> /dev/null; then
        log_error "Cannot access S3 bucket: s3://${CODEMAP_S3_BUCKET}/"
        log_error "Verify:"
        log_error "  1. Bucket exists: aws s3 ls --region ${AWS_DEFAULT_REGION}"
        log_error "  2. IAM role has permissions: Check EC2 instance profile"
        log_error "  3. Region is correct: Currently using ${AWS_DEFAULT_REGION}"
        return 1
    fi

    log_success "S3 bucket accessible"
    return 0
}

get_instance_id() {
    # Try to get instance ID from EC2 metadata
    if curl -s --connect-timeout 1 http://169.254.169.254/latest/meta-data/instance-id &> /dev/null; then
        curl -s http://169.254.169.254/latest/meta-data/instance-id
    else
        # Fallback to hostname
        hostname
    fi
}

##############################################################################
# Backup Functions
##############################################################################

backup_results() {
    local dry_run=${1:-false}

    log_info "Starting backup of $RESULTS_DIR..."

    # Check if results directory exists
    if [ ! -d "$RESULTS_DIR" ]; then
        log_warn "Results directory not found: $RESULTS_DIR"
        log_info "Nothing to backup"
        return 0
    fi

    # Check if results directory is empty
    if [ -z "$(find "$RESULTS_DIR" -maxdepth 1 -type f -o -type d -not -name .)" ]; then
        log_info "Results directory is empty, skipping backup"
        return 0
    fi

    # Generate backup filename
    local timestamp
    timestamp=$(date +%Y%m%d-%H%M%S)
    local instance_id
    instance_id=$(get_instance_id)
    local backup_name="codemap-results-${instance_id}-${timestamp}.tar.gz"
    local s3_path="s3://${CODEMAP_S3_BUCKET}/backups/${backup_name}"

    log_info "Backup name: $backup_name"
    log_info "S3 destination: $s3_path"

    if [ "$dry_run" = true ]; then
        log_info "[DRY RUN] Would create backup"
        log_info "[DRY RUN] Would compress results directory"
        log_info "[DRY RUN] Would upload to S3"
        return 0
    fi

    # Create temporary directory for tarball
    local temp_dir
    temp_dir=$(mktemp -d)
    trap "rm -rf $temp_dir" EXIT

    local temp_tarball="$temp_dir/$backup_name"

    log_info "Compressing results directory..."
    if ! tar -czf "$temp_tarball" -C "$RESULTS_DIR" . 2> /dev/null; then
        log_error "Failed to compress results"
        return 1
    fi

    local file_size
    file_size=$(du -h "$temp_tarball" | cut -f1)
    log_info "Compressed size: $file_size"

    log_info "Uploading to S3..."
    if ! aws s3 cp "$temp_tarball" "$s3_path" \
        --region "${AWS_DEFAULT_REGION}" \
        --storage-class STANDARD_IA \
        --metadata "backed-up-by=$(whoami),timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)"; then
        log_error "Failed to upload to S3"
        return 1
    fi

    log_success "Backup completed successfully"
    log_info "Location: $s3_path"

    return 0
}

##############################################################################
# Restore Functions
##############################################################################

restore_results() {
    local dry_run=${1:-false}

    log_info "Starting restore from S3..."

    # List available backups
    log_info "Available backups:"
    if ! aws s3 ls "s3://${CODEMAP_S3_BUCKET}/backups/" \
        --region "${AWS_DEFAULT_REGION}" | tail -10; then
        log_error "No backups found in S3"
        return 1
    fi

    if [ "$dry_run" = true ]; then
        log_info "[DRY RUN] Would prompt user to select backup"
        log_info "[DRY RUN] Would download selected backup"
        log_info "[DRY RUN] Would extract to results directory"
        return 0
    fi

    log_info "Enter full S3 path of backup to restore (e.g., s3://bucket/backups/file.tar.gz):"
    read -r backup_path

    if [ -z "$backup_path" ]; then
        log_error "No backup path provided"
        return 1
    fi

    # Create temporary directory for download
    local temp_dir
    temp_dir=$(mktemp -d)
    trap "rm -rf $temp_dir" EXIT

    local backup_file="$temp_dir/backup.tar.gz"

    log_info "Downloading backup from S3..."
    if ! aws s3 cp "$backup_path" "$backup_file" --region "${AWS_DEFAULT_REGION}"; then
        log_error "Failed to download backup from S3"
        return 1
    fi

    log_info "Extracting backup..."
    if ! tar -xzf "$backup_file" -C "$RESULTS_DIR"; then
        log_error "Failed to extract backup"
        return 1
    fi

    log_info "Fixing permissions..."
    chown -R codemap:codemap "$RESULTS_DIR"
    chmod 750 "$RESULTS_DIR"

    log_success "Restore completed successfully"
    log_info "Results restored to: $RESULTS_DIR"

    return 0
}

##############################################################################
# List and Management Functions
##############################################################################

list_backups() {
    log_info "Backups in S3:"
    log_info "=============="

    if aws s3 ls "s3://${CODEMAP_S3_BUCKET}/backups/" \
        --region "${AWS_DEFAULT_REGION}" \
        --human-readable --summarize; then
        return 0
    else
        log_warn "No backups found"
        return 1
    fi
}

delete_old_backups() {
    local days_to_keep=${1:-30}

    log_info "Deleting backups older than $days_to_keep days..."

    # Note: S3 lifecycle policies handle this automatically
    # This is a manual utility function for ad-hoc cleanup

    local retention_seconds=$((days_to_keep * 86400))
    local current_time
    current_time=$(date +%s)
    local cutoff_time=$((current_time - retention_seconds))

    # List all backups and delete old ones
    aws s3api list-objects-v2 \
        --bucket "${CODEMAP_S3_BUCKET}" \
        --prefix "backups/" \
        --region "${AWS_DEFAULT_REGION}" \
        --query "Contents[?LastModified<'$(date -d @$cutoff_time -u +%Y-%m-%dT%H:%M:%SZ)'].Key" \
        --output text | \
    while read -r key; do
        if [ -n "$key" ]; then
            log_info "Deleting: $key"
            aws s3 rm "s3://${CODEMAP_S3_BUCKET}/${key}" \
                --region "${AWS_DEFAULT_REGION}"
        fi
    done

    log_success "Old backups deleted"
}

get_backup_stats() {
    log_info "Backup statistics:"
    log_info "=================="

    local count
    count=$(aws s3api list-objects-v2 \
        --bucket "${CODEMAP_S3_BUCKET}" \
        --prefix "backups/" \
        --region "${AWS_DEFAULT_REGION}" \
        --query "length(Contents)" \
        --output text || echo 0)

    log_info "Total backups: $count"

    local total_size
    total_size=$(aws s3api list-objects-v2 \
        --bucket "${CODEMAP_S3_BUCKET}" \
        --prefix "backups/" \
        --region "${AWS_DEFAULT_REGION}" \
        --query "sum(Contents[].Size)" \
        --output text || echo 0)

    if [ "$total_size" != "None" ] && [ "$total_size" != "0" ]; then
        local size_mb=$((total_size / 1024 / 1024))
        log_info "Total backup size: ${size_mb} MB"
    fi

    log_info ""
    log_info "Recent backups:"
    aws s3 ls "s3://${CODEMAP_S3_BUCKET}/backups/" \
        --region "${AWS_DEFAULT_REGION}" \
        --human-readable | tail -5
}

##############################################################################
# Schedule Functions
##############################################################################

install_cron_job() {
    log_info "Installing daily backup cron job..."

    local cron_schedule="0 2 * * *"  # 2 AM daily
    local cron_job="$cron_schedule cd /opt/codemap && bash deploy/backup-to-s3.sh >> /var/log/codemap-backup.log 2>&1"

    # Check if cron job already exists
    if sudo crontab -l 2>/dev/null | grep -q "backup-to-s3.sh"; then
        log_warn "Cron job already installed"
        return 0
    fi

    # Install cron job
    (sudo crontab -l 2>/dev/null || echo ""; echo "$cron_job") | sudo crontab -

    log_success "Cron job installed"
    log_info "Schedule: Daily at 2:00 AM"
    log_info "View crontab: sudo crontab -l"

    return 0
}

remove_cron_job() {
    log_info "Removing backup cron job..."

    # Remove cron job
    sudo crontab -l 2>/dev/null | grep -v "backup-to-s3.sh" | sudo crontab -

    log_success "Cron job removed"

    return 0
}

##############################################################################
# Help and Main
##############################################################################

show_help() {
    cat << EOF
CodeMap Results Backup to S3

USAGE:
    sudo bash backup-to-s3.sh [COMMAND] [OPTIONS]

COMMANDS:
    (default)               Run full backup to S3
    --dry-run              Show what would be backed up without uploading
    --restore              Restore results from S3 backup
    --list                 List available backups in S3
    --stats                Show backup statistics
    --cleanup N            Delete backups older than N days (default: 30)
    --install-cron         Install daily backup cron job (2 AM)
    --remove-cron          Remove backup cron job
    --help                 Show this help message

EXAMPLES:
    # Create backup (or restore, run manually)
    sudo bash backup-to-s3.sh

    # Dry run to see what would happen
    sudo bash backup-to-s3.sh --dry-run

    # Restore from backup
    sudo bash backup-to-s3.sh --restore

    # List all backups
    sudo bash backup-to-s3.sh --list

    # Show statistics
    sudo bash backup-to-s3.sh --stats

    # Schedule automatic daily backups
    sudo bash backup-to-s3.sh --install-cron

CONFIGURATION:
    Environment file: /etc/codemap/env
    Results directory: /opt/codemap/results
    Log file: /var/log/codemap-backup.log

PREREQUISITES:
    - AWS CLI installed (aws --version)
    - IAM role on EC2 with S3 permissions
    - S3 bucket created (s3://codemap-results-ACCOUNT-ID)
    - Environment variables in /etc/codemap/env:
        CODEMAP_S3_BUCKET=codemap-results-ACCOUNT-ID
        AWS_DEFAULT_REGION=us-west-2

TROUBLESHOOTING:
    Check logs: tail -f /var/log/codemap-backup.log
    Test S3 access: aws s3 ls --region us-west-2
    Verify IAM role: curl http://169.254.169.254/latest/meta-data/iam/security-credentials/

EOF
}

##############################################################################
# Main Script
##############################################################################

main() {
    local command="${1:-backup}"

    # Create log file
    touch "$LOG_FILE"
    chmod 644 "$LOG_FILE"

    log_info "CodeMap Results Backup Script"
    log_info "=============================="

    # Check prerequisites
    if ! check_prerequisites; then
        return 1
    fi

    # Load configuration
    if ! load_configuration; then
        return 1
    fi

    log_info "S3 Bucket: $CODEMAP_S3_BUCKET"
    log_info "Region: $AWS_DEFAULT_REGION"
    log_info "Results Dir: $RESULTS_DIR"

    # Check S3 connectivity
    if ! check_s3_connectivity; then
        return 1
    fi

    # Execute command
    case "$command" in
        backup|"")
            backup_results false
            ;;
        --dry-run)
            backup_results true
            ;;
        --restore)
            restore_results false
            ;;
        --list)
            list_backups
            ;;
        --stats)
            get_backup_stats
            ;;
        --cleanup)
            local days="${2:-30}"
            delete_old_backups "$days"
            ;;
        --install-cron)
            install_cron_job
            ;;
        --remove-cron)
            remove_cron_job
            ;;
        --help|-h)
            show_help
            ;;
        *)
            log_error "Unknown command: $command"
            show_help
            return 1
            ;;
    esac

    return 0
}

# Run main function with all arguments
main "$@"
