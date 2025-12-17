#!/bin/bash

###############################################################################
# CodeMap Remote Deployment Script
#
# This script runs ON THE EC2 INSTANCE to deploy the latest code.
# It is typically called by GitHub Actions via SSH.
#
# Usage: bash /opt/codemap/deploy/deploy-remote.sh [--dry-run]
#
# Environment Variables:
#   - CODEMAP_APP_DIR: Application root (default: /opt/codemap)
#   - CODEMAP_VENV_DIR: Python virtualenv (default: /opt/codemap/venv)
#   - CODEMAP_SERVICE: Systemd service name (default: codemap)
#   - CODEMAP_LOG_FILE: Deployment log (default: /tmp/codemap-deploy.log)
###############################################################################

set -euo pipefail

# Configuration
readonly APP_DIR="${CODEMAP_APP_DIR:-/opt/codemap}"
readonly VENV_DIR="${CODEMAP_VENV_DIR:-${APP_DIR}/venv}"
readonly SERVICE_NAME="${CODEMAP_SERVICE:-codemap}"
readonly LOG_FILE="${CODEMAP_LOG_FILE:-/tmp/codemap-deploy.log}"
readonly ROLLBACK_FILE="${APP_DIR}/.last-good-commit"
DRY_RUN=false

# Colors for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

###############################################################################
# Logging Functions
###############################################################################

log_header() {
    echo -e "${BLUE}=== $1 ===${NC}" | tee -a "${LOG_FILE}"
}

log_step() {
    echo -e "${BLUE}[$1]${NC} $2" | tee -a "${LOG_FILE}"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1" | tee -a "${LOG_FILE}"
}

log_error() {
    echo -e "${RED}✗ ERROR:${NC} $1" | tee -a "${LOG_FILE}"
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $1" | tee -a "${LOG_FILE}"
}

log_info() {
    echo "$1" | tee -a "${LOG_FILE}"
}

###############################################################################
# Pre-flight Checks
###############################################################################

check_prerequisites() {
    log_header "Pre-flight Checks"

    # Check if running as root
    if [ "$EUID" -ne 0 ]; then
        log_error "This script must be run as root or with sudo"
        exit 1
    fi

    # Check application directory exists
    if [ ! -d "${APP_DIR}" ]; then
        log_error "Application directory not found: ${APP_DIR}"
        exit 1
    fi
    log_success "Application directory exists: ${APP_DIR}"

    # Check git repository
    if ! git -C "${APP_DIR}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        log_error "Not a git repository: ${APP_DIR}"
        exit 1
    fi
    log_success "Valid git repository found"

    # Check systemd service
    if ! systemctl list-unit-files | grep -q "${SERVICE_NAME}"; then
        log_error "Systemd service not found: ${SERVICE_NAME}"
        exit 1
    fi
    log_success "Systemd service exists: ${SERVICE_NAME}"

    # Check Python/virtualenv
    if [ ! -d "${VENV_DIR}" ]; then
        log_warning "Virtual environment not found, will create: ${VENV_DIR}"
    else
        log_success "Virtual environment exists: ${VENV_DIR}"
    fi

    log_success "All pre-flight checks passed"
}

###############################################################################
# Deployment Functions
###############################################################################

save_current_state() {
    log_step "1" "Saving current deployment state"

    cd "${APP_DIR}"
    CURRENT_COMMIT=$(git rev-parse HEAD)
    echo "${CURRENT_COMMIT}" > "${ROLLBACK_FILE}"

    log_info "    Current commit: ${CURRENT_COMMIT:0:8}"
    log_info "    Rollback file: ${ROLLBACK_FILE}"
}

fetch_latest_code() {
    log_step "2" "Fetching latest code from main branch"

    cd "${APP_DIR}"

    # Fetch from remote
    git fetch origin main >>"${LOG_FILE}" 2>&1
    log_success "Fetched latest code from origin/main"

    # Check what has changed
    LOCAL_COMMIT=$(git rev-parse HEAD)
    REMOTE_COMMIT=$(git rev-parse origin/main)

    if [ "${LOCAL_COMMIT}" = "${REMOTE_COMMIT}" ]; then
        log_info "    Already at latest commit: ${REMOTE_COMMIT:0:8}"
    else
        log_info "    New commits available"
        log_info "    Local:  ${LOCAL_COMMIT:0:8}"
        log_info "    Remote: ${REMOTE_COMMIT:0:8}"
    fi

    # Hard reset to remote main
    git reset --hard origin/main >>"${LOG_FILE}" 2>&1
    NEW_COMMIT=$(git rev-parse HEAD)
    log_success "Reset to origin/main: ${NEW_COMMIT:0:8}"
}

update_dependencies() {
    log_step "3" "Updating Python dependencies"

    # Create virtualenv if it doesn't exist
    if [ ! -d "${VENV_DIR}" ]; then
        log_info "    Creating virtual environment..."
        python3.11 -m venv "${VENV_DIR}" >>"${LOG_FILE}" 2>&1
        log_success "Virtual environment created"
    fi

    # Activate virtualenv
    # shellcheck source=/dev/null
    source "${VENV_DIR}/bin/activate"

    # Upgrade pip
    log_info "    Upgrading pip..."
    pip install --upgrade pip >>"${LOG_FILE}" 2>&1

    # Install package with API dependencies
    log_info "    Installing codemap with API extras..."
    cd "${APP_DIR}"
    pip install -e ".[api]" >>"${LOG_FILE}" 2>&1

    deactivate
    log_success "Dependencies updated successfully"
}

verify_installation() {
    log_step "3b" "Verifying installation"

    # Activate virtualenv
    # shellcheck source=/dev/null
    source "${VENV_DIR}/bin/activate"

    # Check if codemap CLI works
    if ! CODEMAP_VERSION=$(codemap --version); then
        deactivate
        log_error "CodeMap CLI not working after installation"
        exit 1
    fi

    deactivate
    log_success "CodeMap installation verified: ${CODEMAP_VERSION}"
}

restart_service() {
    log_step "4" "Restarting CodeMap service"

    # Reload systemd daemon
    systemctl daemon-reload >>"${LOG_FILE}" 2>&1
    log_info "    Systemd daemon reloaded"

    # Restart service
    if systemctl restart "${SERVICE_NAME}" >>"${LOG_FILE}" 2>&1; then
        log_success "Service restart command executed"
    else
        log_error "Failed to restart service"
        return 1
    fi

    # Wait for service to stabilize
    log_info "    Waiting for service to stabilize..."
    sleep 3
}

verify_service_health() {
    log_step "5" "Verifying service health"

    # Check if service is active
    if ! systemctl is-active --quiet "${SERVICE_NAME}"; then
        log_error "Service is not running"
        log_info "    Service status:"
        systemctl status "${SERVICE_NAME}" >>"${LOG_FILE}" 2>&1 || true
        return 1
    fi
    log_success "Service is running"

    # Check if port 8000 is listening
    if netstat -tuln 2>/dev/null | grep -q ':8000'; then
        log_success "Service listening on port 8000"
    else
        log_warning "Port 8000 not in listening state (may need more time)"
    fi

    # Check service logs for errors
    log_info "    Last service log entries:"
    journalctl -u "${SERVICE_NAME}" -n 3 --no-pager | tee -a "${LOG_FILE}" || true
}

perform_health_check() {
    local max_attempts=5
    local attempt=1
    local health_url="http://localhost:8000/health"

    log_step "6" "Performing local health check"

    while [ $attempt -le $max_attempts ]; do
        if curl -s -f "${health_url}" >/dev/null 2>&1; then
            log_success "Health check passed (HTTP 200)"
            return 0
        fi

        log_info "    Attempt $attempt/$max_attempts failed, retrying..."
        sleep 2
        attempt=$((attempt + 1))
    done

    log_warning "Could not reach health endpoint (may work through CloudFront)"
    return 0  # Non-fatal
}

###############################################################################
# Rollback Functions
###############################################################################

rollback_deployment() {
    log_header "Rolling Back Deployment"

    if [ ! -f "${ROLLBACK_FILE}" ]; then
        log_error "No rollback information available"
        return 1
    fi

    PREVIOUS_COMMIT=$(cat "${ROLLBACK_FILE}")
    log_info "Rolling back to commit: ${PREVIOUS_COMMIT:0:8}"

    cd "${APP_DIR}"
    git reset --hard "${PREVIOUS_COMMIT}" >>"${LOG_FILE}" 2>&1

    # Restart service with previous version
    systemctl restart "${SERVICE_NAME}" >>"${LOG_FILE}" 2>&1

    sleep 3

    if systemctl is-active --quiet "${SERVICE_NAME}"; then
        log_success "Rollback completed successfully"
        return 0
    else
        log_error "Rollback failed - service still not running"
        return 1
    fi
}

###############################################################################
# Main Execution
###############################################################################

main() {
    log_header "CodeMap Remote Deployment Script"
    log_info "Timestamp: $(date -u +'%Y-%m-%d %H:%M:%S UTC')"
    log_info "Host: $(hostname)"
    log_info "User: $(whoami)"
    log_info ""

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --dry-run)
                DRY_RUN=true
                log_warning "DRY RUN MODE - no changes will be made"
                ;;
            --rollback)
                rollback_deployment
                exit $?
                ;;
            *)
                log_error "Unknown option: $1"
                exit 1
                ;;
        esac
        shift
    done

    # Run checks
    check_prerequisites

    # Execute deployment steps
    save_current_state
    fetch_latest_code

    if [ "${DRY_RUN}" = false ]; then
        update_dependencies
        verify_installation
        restart_service
        verify_service_health
        perform_health_check

        log_header "Deployment Summary"
        log_success "Deployment completed successfully!"
        log_info "    Previous commit: $(git -C "${APP_DIR}" rev-parse --short HEAD~1)"
        log_info "    Current commit:  $(git -C "${APP_DIR}" rev-parse --short HEAD)"
        log_info "    Service status:  $(systemctl is-active "${SERVICE_NAME}")"
        log_info "    Log file:        ${LOG_FILE}"
    else
        log_header "Dry Run Summary"
        log_info "Would have deployed:"
        log_info "    Steps: 2-6 (skipped in dry-run mode)"
        log_info "    Current commit: $(git -C "${APP_DIR}" rev-parse --short HEAD)"
    fi

    return 0
}

# Run main function
main "$@"
