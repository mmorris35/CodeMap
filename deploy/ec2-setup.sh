#!/bin/bash
#
# CodeMap EC2 Setup Script
# Initial configuration for Amazon Linux 2023 instance
#
# Usage: bash ec2-setup.sh
#
# This script:
# - Updates system packages
# - Installs Python 3.11, git, and build tools
# - Creates codemap system user
# - Clones CodeMap repository
# - Sets up Python virtualenv with dependencies
# - Configures firewall to allow HTTP/HTTPS/SSH
# - Sets up log rotation
#

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
CODEMAP_USER="codemap"
CODEMAP_GROUP="codemap"
CODEMAP_HOME="/opt/codemap"
CODEMAP_RESULTS_DIR="/opt/codemap/results"
REPO_URL="${REPO_URL:-https://github.com/your-username/codemap.git}"
BRANCH="${BRANCH:-main}"

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

# Main setup
main() {
    log_info "=== CodeMap EC2 Setup Script ==="
    log_info "Starting CodeMap EC2 bootstrap..."

    # Check if running as root
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root"
        exit 1
    fi

    log_info "Step 1: Update system packages..."
    dnf update -y > /dev/null 2>&1 || true

    log_info "Step 2: Install Python 3.11 and development tools..."
    dnf install -y python3.11 python3.11-pip python3.11-devel git curl wget > /dev/null 2>&1

    log_info "Step 3: Verify Python 3.11 installation..."
    python3.11 --version

    log_info "Step 4: Create codemap system user..."
    if id "$CODEMAP_USER" &>/dev/null; then
        log_warn "User $CODEMAP_USER already exists"
    else
        useradd -r -s /bin/false -d "$CODEMAP_HOME" "$CODEMAP_USER"
        log_info "Created user $CODEMAP_USER"
    fi

    log_info "Step 5: Create directory structure..."
    mkdir -p "$CODEMAP_HOME"
    mkdir -p "$CODEMAP_RESULTS_DIR"
    mkdir -p /etc/codemap

    log_info "Step 6: Clone CodeMap repository..."
    if [[ -d "$CODEMAP_HOME/.git" ]]; then
        log_warn "Repository already exists at $CODEMAP_HOME, pulling updates..."
        cd "$CODEMAP_HOME"
        git fetch origin "$BRANCH"
        git checkout "$BRANCH"
        git reset --hard "origin/$BRANCH"
    else
        git clone --depth 1 -b "$BRANCH" "$REPO_URL" "$CODEMAP_HOME"
    fi

    log_info "Step 7: Create Python virtualenv..."
    cd "$CODEMAP_HOME"
    python3.11 -m venv venv

    log_info "Step 8: Upgrade pip in virtualenv..."
    "$CODEMAP_HOME/venv/bin/pip" install --upgrade pip setuptools wheel > /dev/null 2>&1

    log_info "Step 9: Install CodeMap with API dependencies..."
    "$CODEMAP_HOME/venv/bin/pip" install -e ".[api]" > /dev/null 2>&1

    log_info "Step 10: Verify CodeMap installation..."
    "$CODEMAP_HOME/venv/bin/codemap" --version

    log_info "Step 11: Set directory permissions..."
    chown -R "$CODEMAP_USER:$CODEMAP_GROUP" "$CODEMAP_HOME"
    chmod 750 "$CODEMAP_HOME"
    chmod 750 "$CODEMAP_RESULTS_DIR"
    chown -R "$CODEMAP_USER:$CODEMAP_GROUP" /etc/codemap
    chmod 750 /etc/codemap

    log_info "Step 12: Create environment configuration file..."
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
    chown root:"$CODEMAP_GROUP" /etc/codemap/env
    log_info "Created environment file at /etc/codemap/env"

    log_info "Step 13: Install and configure firewall (ufw)..."
    dnf install -y ufw > /dev/null 2>&1

    # Enable ufw
    systemctl enable ufw > /dev/null 2>&1 || true
    systemctl start ufw > /dev/null 2>&1 || true

    # Configure firewall rules
    ufw default deny incoming > /dev/null 2>&1 || true
    ufw default allow outgoing > /dev/null 2>&1 || true
    ufw allow 22/tcp > /dev/null 2>&1 || true    # SSH
    ufw allow 80/tcp > /dev/null 2>&1 || true    # HTTP
    ufw allow 443/tcp > /dev/null 2>&1 || true   # HTTPS

    # Enable firewall
    yes | ufw enable > /dev/null 2>&1 || true

    log_info "Firewall configured:"
    ufw status | grep -E "Status:|22|80|443" || true

    log_info "Step 14: Configure log rotation for results directory..."
    cat > /etc/logrotate.d/codemap << 'EOF'
/opt/codemap/results/*.log {
    daily
    missingok
    rotate 7
    compress
    delaycompress
    notifempty
    create 0640 codemap codemap
    sharedscripts
}
EOF
    log_info "Log rotation configured"

    log_info "Step 15: Create systemd drop-in directory..."
    mkdir -p /etc/systemd/system/codemap.service.d

    log_info ""
    log_info "=== Setup Complete ==="
    log_info ""
    log_info "Next Steps:"
    log_info "1. Review and edit /etc/codemap/env for your environment"
    log_info "2. Install systemd service: bash /opt/codemap/deploy/install-service.sh"
    log_info "3. Start the service: sudo systemctl start codemap"
    log_info "4. Check service status: sudo systemctl status codemap"
    log_info "5. View logs: sudo journalctl -u codemap -f"
    log_info ""
    log_info "For AWS CloudFront setup, see /opt/codemap/deploy/README.md"
    log_info ""
}

# Run main function
main "$@"
