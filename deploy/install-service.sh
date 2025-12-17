#!/bin/bash
#
# CodeMap Service Installer
# Installs and enables the CodeMap systemd service
#
# Usage: sudo bash deploy/install-service.sh
#
# This script:
# - Copies the service file to systemd directory
# - Verifies the service file with systemd-analyze
# - Enables the service to start on boot
# - Starts the service
# - Provides status information and next steps
#

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_FILE="$SCRIPT_DIR/codemap.service"
SERVICE_TARGET="/etc/systemd/system/codemap.service"
SYSTEMD_DROP_IN_DIR="/etc/systemd/system/codemap.service.d"
CODEMAP_USER="codemap"
CODEMAP_HOME="/opt/codemap"
CODEMAP_RESULTS_DIR="/opt/codemap/results"

# Helper functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_blue() {
    echo -e "${BLUE}$1${NC}"
}

# Main installation
main() {
    log_blue "=== CodeMap Service Installation ==="
    log_info "Installing CodeMap systemd service..."
    log_info ""

    # Check if running as root
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root"
        echo "Usage: sudo bash deploy/install-service.sh"
        exit 1
    fi

    # Verify service file exists
    if [[ ! -f "$SERVICE_FILE" ]]; then
        log_error "Service file not found at $SERVICE_FILE"
        exit 1
    fi

    # Verify CodeMap home directory exists
    if [[ ! -d "$CODEMAP_HOME" ]]; then
        log_error "CodeMap home directory not found at $CODEMAP_HOME"
        log_error "Run deploy/ec2-setup.sh first"
        exit 1
    fi

    # Verify virtualenv exists
    if [[ ! -f "$CODEMAP_HOME/venv/bin/uvicorn" ]]; then
        log_error "Uvicorn not found in virtualenv at $CODEMAP_HOME/venv"
        log_error "Run deploy/ec2-setup.sh first"
        exit 1
    fi

    # Verify environment file exists
    if [[ ! -f /etc/codemap/env ]]; then
        log_warn "Environment file not found at /etc/codemap/env"
        log_info "Creating default environment file..."
        mkdir -p /etc/codemap
        cat > /etc/codemap/env << 'EOF'
# CodeMap API Configuration
CODEMAP_ENV=production
CODEMAP_LOG_LEVEL=INFO
CODEMAP_RESULTS_DIR=/opt/codemap/results

# AWS Configuration (optional)
AWS_DEFAULT_REGION=us-west-2

# Storage Backend: local or s3
CODEMAP_STORAGE=local
# CODEMAP_S3_BUCKET=codemap-results-ACCOUNT_ID
EOF
        chmod 640 /etc/codemap/env
        chown root:"$CODEMAP_USER" /etc/codemap/env
        log_info "Created environment file at /etc/codemap/env"
    fi

    # Create results directory if it doesn't exist
    if [[ ! -d "$CODEMAP_RESULTS_DIR" ]]; then
        log_info "Creating results directory at $CODEMAP_RESULTS_DIR..."
        mkdir -p "$CODEMAP_RESULTS_DIR"
    fi

    # Set proper permissions on results directory
    log_info "Setting directory permissions..."
    chown -R "$CODEMAP_USER:$CODEMAP_USER" "$CODEMAP_RESULTS_DIR"
    chmod 750 "$CODEMAP_RESULTS_DIR"
    chown -R "$CODEMAP_USER:$CODEMAP_USER" "$CODEMAP_HOME"
    chmod 755 "$CODEMAP_HOME"

    # Create systemd drop-in directory for local customizations
    if [[ ! -d "$SYSTEMD_DROP_IN_DIR" ]]; then
        log_info "Creating systemd drop-in directory at $SYSTEMD_DROP_IN_DIR..."
        mkdir -p "$SYSTEMD_DROP_IN_DIR"
    fi

    # Copy service file
    log_info "Copying service file to $SERVICE_TARGET..."
    cp "$SERVICE_FILE" "$SERVICE_TARGET"
    chmod 644 "$SERVICE_TARGET"

    # Verify service file syntax
    log_info "Verifying service file syntax with systemd-analyze..."
    if systemd-analyze verify "$SERVICE_TARGET" > /dev/null 2>&1; then
        log_info "Service file syntax is valid"
    else
        log_error "Service file failed validation. Output:"
        systemd-analyze verify "$SERVICE_TARGET" || true
        exit 1
    fi

    # Reload systemd daemon
    log_info "Reloading systemd daemon..."
    systemctl daemon-reload

    # Enable service to start on boot
    log_info "Enabling service to start on boot..."
    systemctl enable codemap

    # Start the service
    log_info "Starting CodeMap service..."
    systemctl start codemap

    # Wait for service to start
    sleep 2

    # Check service status
    log_blue ""
    log_blue "=== Service Installation Complete ==="
    log_blue ""

    if systemctl is-active --quiet codemap; then
        log_info "Service is running successfully!"
        log_blue ""
        log_info "Service Status:"
        systemctl status codemap --no-pager || true
    else
        log_error "Service failed to start!"
        log_blue ""
        log_info "Service Status:"
        systemctl status codemap --no-pager || true
        log_blue ""
        log_info "Checking logs for errors:"
        journalctl -u codemap -n 20 --no-pager || true
        exit 1
    fi

    log_blue ""
    log_info "Next Steps:"
    echo "  1. Verify API is responding:"
    echo "     curl http://localhost:8000/health"
    echo ""
    echo "  2. View API documentation:"
    echo "     curl http://localhost:8000/docs"
    echo ""
    echo "  3. Monitor logs in real-time:"
    echo "     sudo journalctl -u codemap -f"
    echo ""
    echo "  4. Common service commands:"
    echo "     sudo systemctl status codemap         # Check status"
    echo "     sudo systemctl restart codemap        # Restart service"
    echo "     sudo systemctl stop codemap           # Stop service"
    echo "     sudo systemctl start codemap          # Start service"
    echo ""
    echo "  5. For CloudFront setup, see deploy/README.md"
    echo ""
    log_blue "=== Done ===${NC}"
}

# Run main function
main "$@"
