# CodeMap AWS Deployment Guide

**Deploy CodeMap as a web-accessible API service on AWS Free Tier**

This guide covers the complete deployment process from EC2 instance launch through CloudFront HTTPS configuration.

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    Internet (HTTPS)                 │
└────────────────────┬────────────────────────────────┘
                     │
         ┌───────────▼────────────┐
         │  CloudFront (HTTPS)    │
         │  *.cloudfront.net      │
         │  ACM Certificate       │
         └───────────┬────────────┘
                     │ HTTP (port 80)
         ┌───────────▼────────────────────┐
         │  EC2 t2.micro (Amazon Linux)   │
         │  ┌──────────────────────────┐  │
         │  │  Systemd Service         │  │
         │  │  ┌────────────────────┐  │  │
         │  │  │ Uvicorn (port 8000)│  │  │
         │  │  │ ┌────────────────┐ │  │  │
         │  │  │ │ FastAPI App    │ │  │  │
         │  │  │ │ /health /docs  │ │  │  │
         │  │  │ │ /analyze       │ │  │  │
         │  │  │ └────────────────┘ │  │  │
         │  │  └────────────────────┘  │  │
         │  └──────────────────────────┘  │
         │  /opt/codemap/ (application)   │
         │  /opt/codemap/results/ (data)  │
         │  /etc/codemap/env (config)     │
         └────────────────┬───────────────┘
                          │
         ┌────────────────▼─────────────┐
         │  S3 (optional, future)       │
         │  Results backup & archival   │
         └──────────────────────────────┘
```

## Prerequisites

- AWS Account with Free Tier eligibility
- EC2 key pair created in AWS Console
- Recommended: Basic AWS/Linux knowledge

## AWS Free Tier Limits

Be aware of these limits to avoid unexpected charges:

| Service | Free Tier | Our Usage | Status |
|---------|-----------|-----------|--------|
| EC2 t2.micro | 750 hrs/mo | 744 hrs (24/7) | ✓ OK |
| EBS | 30 GB SSD | ~10 GB | ✓ OK |
| CloudFront | 1 TB out + 10M req/mo | Variable | ⚠️ Monitor |
| Data Transfer | 100 GB out/mo | Variable | ⚠️ Monitor |
| CloudWatch | 10 metrics, 10 alarms | Basic only | ✓ OK |

**Important: Never use NAT Gateway or ALB/ELB - NOT FREE (~$30+/mo)**

## Step 1: Launch EC2 Instance

### 1.1 Log into AWS Console

1. Navigate to [AWS Console](https://console.aws.amazon.com)
2. Go to **EC2 Dashboard**
3. Click **Launch Instance**

### 1.2 Instance Configuration

**Name and Tags**
- Instance name: `codemap-api`
- Add tag: `Environment: production`
- Add tag: `Application: codemap`

**AMI Selection**
- Search for "Amazon Linux 2023"
- Select **Amazon Linux 2023 AMI** (free tier eligible)
- Architecture: **64-bit (x86)**

**Instance Type**
- Type: **t2.micro** (Free Tier eligible)
- ✓ Only t2.micro qualifies for free tier

**Key Pair**
- Select or create SSH key pair
- Download and save the `.pem` file locally
- Set permissions: `chmod 600 your-key.pem`

**Network Settings**
- Create or select VPC (default is fine)
- Auto-assign public IP: **Enable**
- Create or select Security Group
  - Inbound Rules:
    - Type: SSH, Source: Your IP (or 0.0.0.0/0 for testing)
    - Type: HTTP, Source: 0.0.0.0/0
    - Type: HTTPS, Source: 0.0.0.0/0

**Storage**
- Size: **30 GB** (maximum free tier)
- Type: **gp3** (default, performance)
- Delete on termination: ✓ Checked

**Review and Launch**
- Review all settings
- Click **Launch Instance**
- Wait 1-2 minutes for instance to start

### 1.3 Get Instance Details

1. Go to EC2 Dashboard > Instances
2. Select your instance
3. Note the following:
   - **Public IPv4 address**: Used for SSH and CloudFront origin
   - **Private IPv4 address**: Internal only
   - **Instance ID**: For reference

## Step 2: SSH into EC2 Instance

### 2.1 Connect via SSH

```bash
# SSH into instance
ssh -i your-key.pem ec2-user@<PUBLIC-IP>

# Replace <PUBLIC-IP> with the actual public IP from AWS Console
# Example: ssh -i my-key.pem ec2-user@54.123.45.67
```

### 2.2 Run EC2 Setup Script

Once connected, run the automated setup:

```bash
# Download and run setup script
curl -fsSL https://raw.githubusercontent.com/YOUR-USERNAME/codemap/main/deploy/ec2-setup.sh | bash
# OR
cd ~
git clone https://github.com/YOUR-USERNAME/codemap.git
cd codemap
bash deploy/ec2-setup.sh
```

**What the script does:**
- Updates system packages
- Installs Python 3.11, git, pip
- Creates `codemap` system user
- Clones repository to `/opt/codemap`
- Creates Python virtualenv
- Installs CodeMap with API dependencies
- Configures firewall (UFW) to allow ports 22, 80, 443
- Sets up log rotation

**Troubleshooting:**
- If script fails, review `/var/log/messages` for details
- Ensure you have internet connectivity
- Check disk space: `df -h` (should have >5 GB free)

## Step 3: Configure Systemd Service

### 3.1 Review Environment File

The setup script creates `/etc/codemap/env` with default settings. Review and edit if needed:

```bash
sudo nano /etc/codemap/env
```

Available options:
```bash
# Deployment environment
CODEMAP_ENV=production

# Logging level: DEBUG, INFO, WARNING, ERROR
CODEMAP_LOG_LEVEL=INFO

# Results storage directory (automatically created by setup)
CODEMAP_RESULTS_DIR=/opt/codemap/results

# AWS settings (optional, for future S3 integration)
AWS_DEFAULT_REGION=us-west-2

# Storage backend: local (default) or s3
CODEMAP_STORAGE=local
```

### 3.2 Install and Enable Service

```bash
# Install systemd service
cd /opt/codemap
sudo bash deploy/install-service.sh

# This script:
# - Validates all prerequisites
# - Copies /etc/systemd/system/codemap.service
# - Verifies service file syntax
# - Enables service to start on boot
# - Starts the service
# - Displays status and next steps
```

**What the script does:**
- Verifies CodeMap home directory and virtualenv exist
- Creates/verifies environment file at `/etc/codemap/env`
- Sets proper permissions on `/opt/codemap/results`
- Copies systemd service file to `/etc/systemd/system/`
- Validates service file with `systemd-analyze verify`
- Enables service for auto-start on reboot
- Starts the service immediately

### 3.3 Manage the Service

**Check Status:**
```bash
# Check if service is running
sudo systemctl status codemap

# Check if service is enabled for auto-start
sudo systemctl is-enabled codemap

# Check if service is active
sudo systemctl is-active codemap
```

**Control Service:**
```bash
# Start service
sudo systemctl start codemap

# Stop service
sudo systemctl stop codemap

# Restart service (after code updates)
sudo systemctl restart codemap

# Reload configuration (without restarting)
sudo systemctl reload codemap

# Check service on next boot
systemctl is-enabled codemap  # Returns 'enabled' or 'disabled'
```

**View Logs:**
```bash
# View logs in real-time (follow mode)
sudo journalctl -u codemap -f

# View last 50 lines of logs
sudo journalctl -u codemap -n 50

# View logs from last 1 hour
sudo journalctl -u codemap --since "1 hour ago"

# View logs with timestamps
sudo journalctl -u codemap -o short

# Export all logs to file
sudo journalctl -u codemap > codemap-logs.txt

# View error level and above
sudo journalctl -u codemap -p err
```

**Service Configuration:**
```bash
# Edit environment variables
sudo nano /etc/codemap/env

# After editing, restart service to apply changes
sudo systemctl restart codemap

# Create drop-in override directory for local customizations
# (useful for per-instance configuration)
sudo mkdir -p /etc/systemd/system/codemap.service.d
sudo nano /etc/systemd/system/codemap.service.d/override.conf
sudo systemctl daemon-reload
sudo systemctl restart codemap
```

### 3.4 Test the API

**Local Testing:**
```bash
# Test health endpoint (JSON response)
curl http://localhost:8000/health

# Should return:
# {"status":"healthy"}

# Test with verbose output
curl -v http://localhost:8000/health

# Get response headers
curl -i http://localhost:8000/health
```

**View API Documentation:**
```bash
# Swagger UI (interactive API docs)
curl http://localhost:8000/docs

# ReDoc alternative documentation
curl http://localhost:8000/redoc

# OpenAPI JSON schema
curl http://localhost:8000/openapi.json
```

**Test with specific endpoints:**
```bash
# Test analyze endpoint (example)
curl -X POST http://localhost:8000/analyze \
  -H "Content-Type: application/json" \
  -d '{"repo_url":"https://github.com/example/repo","branch":"main"}'

# Get job results
curl http://localhost:8000/results/{job_id}
```

### 3.5 Verify Service Persistence

**Test auto-restart on failure:**
```bash
# Get service PID
PID=$(systemctl show -p MainPID --value codemap)
echo "Service PID: $PID"

# Kill the service process
sudo kill -9 $PID

# Check if service auto-restarts (wait 5 seconds)
sleep 5
sudo systemctl status codemap

# Service should show as active (running) with a new PID
```

**Test persistence across reboots:**
```bash
# Make a note of the service status
sudo systemctl status codemap

# Simulate what will happen after reboot
sudo systemctl reboot

# After reboot, SSH back and verify:
sudo systemctl status codemap  # Should be active (running)
sudo journalctl -u codemap -n 5  # Should show startup logs
```

## Step 4: Configure CloudFront HTTPS

See [CloudFront Setup Instructions](./cloudfront-setup.md) for complete step-by-step guide.

**Quick Summary:**
1. Request free SSL certificate via AWS Certificate Manager (ACM)
2. Create CloudFront distribution pointing to EC2 Elastic IP
3. Configure origin to use HTTP on port 8000
4. Set viewer protocol to redirect HTTP to HTTPS
5. Disable caching for API responses (use CachingDisabled policy)
6. Allow all HTTP methods (GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE)
7. Test endpoints via CloudFront domain (*.cloudfront.net)

**Configuration Resources:**
- [cloudfront-setup.md](./cloudfront-setup.md) - Detailed AWS Console walkthrough
- [cloudfront-policy.json](./cloudfront-policy.json) - Cache policy for API (no caching)

## Step 5: Security Hardening (Optional but Recommended)

### 5.1 SSH Hardening

```bash
# Disable password authentication (key-only)
sudo nano /etc/ssh/sshd_config

# Set these lines:
PasswordAuthentication no
PubkeyAuthentication yes

# Reload SSH
sudo systemctl reload sshd
```

### 5.2 Firewall Configuration

The setup script configures UFW. Verify:

```bash
# Check firewall status
sudo ufw status

# Should show:
# Status: active
# To                         Action      From
# --                         ------      ----
# 22/tcp                     ALLOW       Anywhere
# 80/tcp                     ALLOW       Anywhere
# 443/tcp                    ALLOW       Anywhere
```

### 5.3 Install Fail2Ban (SSH Brute-Force Protection)

```bash
sudo dnf install -y fail2ban

# Enable and start
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

### 5.4 Enable Automatic Security Updates

```bash
# Install unattended-upgrades
sudo dnf install -y dnf-automatic

# Enable automatic updates
sudo systemctl enable dnf-automatic.timer
sudo systemctl start dnf-automatic.timer
```

## Step 6: S3 Backup (Optional, for Free Tier Expansion)

For automatic results backup to S3:

1. Create S3 bucket: `codemap-results-YOUR-ACCOUNT-ID`
2. Set up IAM role on EC2 instance
3. Enable S3 storage in `/etc/codemap/env`:
   ```bash
   CODEMAP_STORAGE=s3
   CODEMAP_S3_BUCKET=codemap-results-YOUR-ACCOUNT-ID
   ```
4. See [S3 Setup Instructions](./s3-setup.md)

## Monitoring and Maintenance

### Health Checks

```bash
# Test API endpoint
curl -f https://YOUR-CLOUDFRONT-DOMAIN/health || echo "API DOWN"

# Via CloudFront (once configured)
curl https://d123abc.cloudfront.net/health

# Check system resources
free -h          # Memory usage
df -h             # Disk usage
top -b -n 1       # Top processes
```

### Log Review

```bash
# Follow application logs
sudo journalctl -u codemap -f

# Filter by log level
sudo journalctl -u codemap -p warn

# Export logs to file
sudo journalctl -u codemap > codemap-logs.txt
```

### Common Issues

**Service won't start**
```bash
# Check service status for error messages
sudo systemctl status codemap -l --full

# Review logs for specific errors
sudo journalctl -u codemap -n 100
```

**API returns 502 Bad Gateway**
```bash
# Check if service is running
sudo systemctl is-active codemap

# Check if port 8000 is listening
sudo netstat -tlnp | grep 8000

# Restart service
sudo systemctl restart codemap
```

**High memory usage**
```bash
# Check memory usage
free -h

# Restart service to clear memory
sudo systemctl restart codemap
```

**Disk space full**
```bash
# Check disk usage
df -h

# Clean up old results
sudo rm -rf /opt/codemap/results/*

# Check log size
du -sh /var/log/*

# Rotate logs if needed
sudo logrotate -f /etc/logrotate.d/codemap
```

## Step 7: GitHub Actions Continuous Deployment

### 7.1 Automated Deployment via GitHub Actions

CodeMap includes a complete CI/CD pipeline that automatically deploys to EC2 on every push to `main`.

**Deployment Workflow:**
1. Code pushed to `main` branch
2. GitHub Actions runs: tests, linting, type checking
3. On success, deploys to EC2 via SSH
4. Verifies deployment via health check
5. Sends deployment status notifications

**Workflow File:** `.github/workflows/deploy.yml`

### 7.2 Configure GitHub Secrets

To enable automated deployments, add these secrets to your GitHub repository:

**Required Secrets:**
- `EC2_HOST`: EC2 instance public IP (e.g., `54.123.45.67`)
- `EC2_USER`: SSH username (e.g., `ec2-user` for Amazon Linux)
- `EC2_SSH_KEY`: Private SSH key (paste full `.pem` file contents)

**Optional Secrets:**
- `CLOUDFRONT_URL`: CloudFront domain for health checks (e.g., `d123abc.cloudfront.net`)

**Adding Secrets:**
1. Go to GitHub repo > Settings > Secrets and variables > Actions
2. Click "New repository secret"
3. Add each secret with its value
4. Note: Private key should include BEGIN/END lines

**Safety Tips:**
- EC2 SSH key is never logged or displayed
- Secrets are encrypted at rest and in transit
- Rotate EC2 key pair periodically
- Restrict SSH access by IP in security group (optional)

### 7.3 Manual Deployment Trigger

You can manually trigger a deployment without pushing code:

```bash
# Using GitHub CLI (requires gh installed and authenticated)
gh workflow run deploy.yml -r main

# Or via GitHub web UI:
# 1. Go to Actions tab
# 2. Select "Deploy to Production" workflow
# 3. Click "Run workflow" button
# 4. Select "main" branch
# 5. Click green "Run workflow" button
```

### 7.4 Monitoring Deployment

**View Deployment Status:**
1. Go to GitHub repo > Actions tab
2. Find "Deploy to Production" workflow run
3. Click to see detailed logs
4. Check individual steps for errors

**Deployment Steps:**
1. **test**: Runs pytest with coverage (required)
2. **lint**: Runs ruff linting (required)
3. **typecheck**: Runs mypy type checking (required)
4. **deploy**: Executes on EC2 (requires above to pass)
   - Fetches latest code from main
   - Updates Python dependencies
   - Restarts systemd service
   - Verifies service health
5. **Health check**: Confirms API responds via CloudFront

**Sample Workflow Output:**
```
[1/5] Entering application directory: /opt/codemap
[2/5] Fetching latest code from main branch...
      Current commit: abc1234
[3/5] Updating Python dependencies...
      Dependencies updated successfully
[4/5] Restarting CodeMap service...
      Service is running
[5/5] Verifying service health...
      Last service log entries:
      2024-01-15 10:30:45 INFO Started Uvicorn server
      2024-01-15 10:30:46 INFO Application startup complete
```

### 7.5 Automatic Rollback on Failure

If deployment fails:
1. GitHub Actions marks workflow as failed
2. EC2 instance keeps running previous version
3. Health check failures prevent deployment from completing

**Manual Rollback:**
```bash
ssh -i your-key.pem ec2-user@<PUBLIC-IP>

# View recent commits
cd /opt/codemap
git log --oneline -5

# Rollback to previous version
sudo bash deploy/deploy-remote.sh --rollback

# Or manually:
git reset --hard HEAD~1
source venv/bin/activate
pip install -e ".[api]"
sudo systemctl restart codemap
```

### 7.6 Deployment Remote Script

The file `deploy/deploy-remote.sh` runs on EC2 during deployments:

**Features:**
- Pre-flight checks (verify directories, git repo, service exists)
- Safe state management (saves current commit for rollback)
- Code pulling and dependency updates
- Service restart with health verification
- Detailed logging to `/tmp/codemap-deploy.log`
- Rollback capability with `--rollback` flag

**Manual Usage (for testing):**
```bash
# Dry run (shows what would happen, no changes)
sudo bash deploy/deploy-remote.sh --dry-run

# Full deployment
sudo bash deploy/deploy-remote.sh

# Rollback to previous version
sudo bash deploy/deploy-remote.sh --rollback

# View logs
tail -f /tmp/codemap-deploy.log
```

## Deployment Updates

### Deploy New Code

**Automatic (Recommended):**
- Push to `main` branch
- GitHub Actions deploys automatically
- Check Actions tab for status

**Manual (if needed):**
```bash
# SSH into instance
ssh -i your-key.pem ec2-user@<PUBLIC-IP>

# Run deployment script
cd /opt/codemap
sudo bash deploy/deploy-remote.sh

# Or manually:
cd /opt/codemap
git fetch origin main
git reset --hard origin/main

# Reinstall dependencies (if changed)
source venv/bin/activate
pip install -e ".[api]"

# Restart service
sudo systemctl restart codemap

# Verify
curl https://YOUR-CLOUDFRONT-DOMAIN/health
```

### Rollback to Previous Version

**Automatic Rollback (after deployment failure):**
- Previous version remains running
- Health checks prevented bad code from going live

**Manual Rollback:**
```bash
ssh -i your-key.pem ec2-user@<PUBLIC-IP>

# Using rollback script
sudo bash deploy/deploy-remote.sh --rollback

# OR: Manual rollback to specific commit
cd /opt/codemap
git revert HEAD --no-edit
git push origin main

# OR: Reset to specific commit
git reset --hard <COMMIT-HASH>
git push origin main --force-with-lease

# Restart service
sudo systemctl restart codemap
```

## Cost Monitoring

### Set Up Billing Alerts

1. Go to [AWS Billing Console](https://console.aws.amazon.com/billing)
2. Click **Billing Preferences**
3. Enable **Alert Type: Free Tier Usage Alerts**
4. Set threshold: $5.00
5. Add email address for notifications

### Monitor Usage

```bash
# Check EC2 costs (in AWS Console):
# - EC2 Dashboard > Instances > Right-click instance > Cost allocation tags

# Important metrics:
# - EC2 running hours (should be ~744/month for t2.micro)
# - Data transfer out (CloudFront counts here)
# - CloudFront requests (monitor for unexpected usage)
```

## Disaster Recovery

### Backup Results

```bash
# Manual backup to local machine
scp -i your-key.pem -r ec2-user@<PUBLIC-IP>:/opt/codemap/results ./codemap-backup

# Automated backup to S3 (if configured)
# See s3-setup.md for backup script
```

### Restore from Backup

```bash
# SCP backup back to instance
scp -i your-key.pem -r ./codemap-backup ec2-user@<PUBLIC-IP>:/opt/codemap/results

# Fix permissions
ssh -i your-key.pem ec2-user@<PUBLIC-IP>
sudo chown -R codemap:codemap /opt/codemap/results
```

### Terminate Instance (if needed)

```bash
# WARNING: This deletes everything on the instance!
# Make sure you have backups.

# In AWS Console:
# 1. EC2 Dashboard > Instances
# 2. Right-click instance > Instance State > Terminate
# 3. Confirm termination
```

## Next Steps

1. **CloudFront Setup** → See [CloudFront Setup](./cloudfront-setup.md)
2. **GitHub Actions Deployment** → See [Deploy Workflow](./../.github/workflows/deploy.yml)
3. **Production Checklist** → See [Production Checklist](./PRODUCTION_CHECKLIST.md)
4. **Monitoring** → See [CloudWatch Alarms](./cloudwatch-alarms.md)

## Environment Variables Reference

Create `/etc/codemap/env` with the following variables:

```bash
# Required
CODEMAP_ENV=production
CODEMAP_RESULTS_DIR=/opt/codemap/results

# Optional
CODEMAP_LOG_LEVEL=INFO
CODEMAP_STORAGE=local
AWS_DEFAULT_REGION=us-west-2

# For S3 Storage
CODEMAP_S3_BUCKET=codemap-results-ACCOUNT-ID
AWS_ACCESS_KEY_ID=xxx (if not using IAM role)
AWS_SECRET_ACCESS_KEY=xxx (if not using IAM role)
```

## Troubleshooting

### Instance won't connect via SSH

```bash
# 1. Check instance status in AWS Console
#    Should be "running" and status checks "2/2 passed"

# 2. Verify security group allows SSH from your IP
#    EC2 > Security Groups > Select group > Inbound Rules
#    Should have SSH (port 22) rule

# 3. Check SSH key permissions
chmod 600 your-key.pem

# 4. Verify correct IP and username
ssh -i your-key.pem ec2-user@<PUBLIC-IP>  # NOT ubuntu, NOT root
```

### Setup script fails

```bash
# Check if running as root
whoami  # Should be "root"

# Run with sudo if not
sudo bash deploy/ec2-setup.sh

# Check for disk space
df -h  # Need >5 GB free

# Check for internet connectivity
ping 8.8.8.8

# View system logs
tail -50 /var/log/messages
```

### Service won't start

```bash
# Check for syntax errors
systemd-analyze verify /etc/systemd/system/codemap.service

# Check permissions on directories
ls -la /opt/codemap
ls -la /opt/codemap/results

# Ensure codemap user can write to results
sudo chown -R codemap:codemap /opt/codemap/results
```

### API returns 502 Bad Gateway via CloudFront

```bash
# 1. Check if service is running
sudo systemctl status codemap

# 2. Check if port 8000 is listening
sudo netstat -tlnp | grep 8000

# 3. Check logs
sudo journalctl -u codemap -n 50

# 4. Verify CloudFront origin is correct
#    CloudFront > Distributions > Select distribution > Origins
#    Origin domain should be EC2 public IP
```

## Getting Help

- **AWS Documentation**: https://docs.aws.amazon.com/
- **CodeMap GitHub**: https://github.com/your-username/codemap
- **Issues**: https://github.com/your-username/codemap/issues
- **FastAPI Docs**: https://fastapi.tiangolo.com/

---

**Last Updated**: 2024-12-17
**Version**: 1.0.0
**Maintained by**: CodeMap Team
