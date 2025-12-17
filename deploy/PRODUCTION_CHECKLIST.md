# CodeMap Production Checklist

**Purpose**: Complete this checklist before deploying CodeMap to production. Ensure all security, monitoring, and operational requirements are met.

**Region**: us-west-2
**Instance Type**: EC2 t2.micro
**Timeline**: 1-2 hours to complete all items

---

## Pre-Deployment: Infrastructure

### EC2 Instance Setup

- [ ] EC2 t2.micro instance launched in us-west-2
  - Instance name: `codemap-api`
  - Amazon Linux 2023 AMI
  - 30 GB gp3 EBS volume
  - Auto-assign public IP: Enabled
  - Delete on termination: Checked

- [ ] Elastic IP allocated and associated with instance
  - Static IP prevents CloudFront origin changes after reboot
  - Verify in EC2 Dashboard: Elastic IPs
  - Cost: Free if attached to running instance

- [ ] Security group configured correctly
  ```
  Inbound Rules:
  - SSH (22): ALLOW from your IP (restrict if possible)
  - HTTP (80): ALLOW from 0.0.0.0/0 (for CloudFront only)
  - HTTPS (443): ALLOW from 0.0.0.0/0 (optional, not used)

  Outbound Rules:
  - All traffic: ALLOW 0.0.0.0/0 (default, for package updates)
  ```
  Verify in EC2 > Security Groups > Select group

- [ ] SSH key pair created and saved locally
  - Permissions: `chmod 600 your-key.pem`
  - Stored in safe location (not in git repo)
  - Test SSH connection: `ssh -i your-key.pem ec2-user@<PUBLIC-IP>`

---

## Application Deployment

### CodeMap Installation

- [ ] EC2 setup script executed successfully
  ```bash
  ssh -i your-key.pem ec2-user@<PUBLIC-IP>
  cd ~
  git clone https://github.com/YOUR-USERNAME/codemap.git
  cd codemap
  bash deploy/ec2-setup.sh
  ```
  Check for no errors in output (warnings are OK)

- [ ] Application directory permissions correct
  ```bash
  ls -la /opt/codemap
  # Should be: drwxr-xr-x root:root
  ```

- [ ] Python virtualenv created and tested
  ```bash
  /opt/codemap/venv/bin/python --version
  # Should be: Python 3.11.x or higher
  ```

- [ ] CodeMap package installed in virtualenv
  ```bash
  /opt/codemap/venv/bin/pip list | grep codemap
  # Should show: codemap (1.0.0)
  ```

- [ ] Results directory created and writable
  ```bash
  ls -la /opt/codemap/results
  # Should be: drwxrwx--- codemap:codemap
  ```

### Systemd Service Setup

- [ ] Systemd service installed
  ```bash
  sudo systemctl is-enabled codemap
  # Output: enabled
  ```

- [ ] Service unit file syntax validated
  ```bash
  sudo systemd-analyze verify /etc/systemd/system/codemap.service
  # Output: (no errors)
  ```

- [ ] Service file has correct permissions
  ```bash
  ls -la /etc/systemd/system/codemap.service
  # Should be: -rw-r--r-- root:root
  ```

- [ ] Environment file created and readable
  ```bash
  sudo cat /etc/codemap/env
  # Verify: CODEMAP_ENV=production, CODEMAP_LOG_LEVEL=INFO
  ```

- [ ] Service starts and stays running
  ```bash
  sudo systemctl restart codemap
  sleep 5
  sudo systemctl is-active codemap
  # Output: active
  ```

- [ ] Service auto-restarts on failure
  ```bash
  # Get PID
  PID=$(sudo systemctl show -p MainPID --value codemap)

  # Kill the process
  sudo kill -9 $PID

  # Wait 5 seconds
  sleep 5

  # Check if restarted with new PID
  NEW_PID=$(sudo systemctl show -p MainPID --value codemap)
  [ "$PID" != "$NEW_PID" ] && echo "Auto-restart works"
  ```

---

## Security Hardening

### SSH Configuration

- [ ] SSH key authentication enabled
  ```bash
  sudo grep "^PubkeyAuthentication yes" /etc/ssh/sshd_config
  # Should find: PubkeyAuthentication yes
  ```

- [ ] SSH password authentication disabled
  ```bash
  sudo grep "^PasswordAuthentication no" /etc/ssh/sshd_config
  # Should find: PasswordAuthentication no
  ```

- [ ] SSH service reloaded after changes
  ```bash
  sudo systemctl reload sshd
  ```

- [ ] Test SSH still works with key
  ```bash
  ssh -i your-key.pem ec2-user@<PUBLIC-IP> "echo Success"
  # Should output: Success
  ```

### Firewall Configuration

- [ ] UFW firewall enabled
  ```bash
  sudo ufw status
  # Output should contain: Status: active
  ```

- [ ] UFW rules configured
  ```bash
  sudo ufw status numbered
  ```
  Should show:
  ```
  1. 22/tcp (SSH)
  2. 80/tcp (HTTP)
  3. 443/tcp (HTTPS)
  ```

### Fail2ban Installation

- [ ] Fail2ban installed
  ```bash
  sudo dnf list installed | grep fail2ban
  # Should show: fail2ban
  ```

- [ ] Fail2ban service enabled
  ```bash
  sudo systemctl is-enabled fail2ban
  # Output: enabled
  ```

- [ ] Fail2ban service running
  ```bash
  sudo systemctl is-active fail2ban
  # Output: active
  ```

- [ ] SSH jail configured
  ```bash
  sudo fail2ban-client status sshd
  # Should show: Status for jail sshd: active
  ```

### Automatic Security Updates

- [ ] dnf-automatic installed
  ```bash
  sudo dnf list installed | grep dnf-automatic
  # Should show: dnf-automatic
  ```

- [ ] Automatic updates timer enabled
  ```bash
  sudo systemctl is-enabled dnf-automatic.timer
  # Output: enabled
  ```

- [ ] Automatic updates timer running
  ```bash
  sudo systemctl is-active dnf-automatic.timer
  # Output: active
  ```

---

## CloudFront HTTPS Configuration

### SSL Certificate

- [ ] ACM certificate requested in AWS Certificate Manager
  - Region: us-east-1 (required for CloudFront)
  - Domain: `*.your-domain.com` (if using custom domain)
  - Validation: Email or DNS (follow prompts)
  - Status: **Issued** (not Pending Validation)

- [ ] Certificate verified in AWS Console
  ```
  ACM > Certificates > Select certificate
  Status should be: Issued
  Domain(s) should include your domain
  ```

### CloudFront Distribution

- [ ] CloudFront distribution created
  - Origin: EC2 Elastic IP (or public IP)
  - Origin protocol: HTTP (port 8000)
  - Viewer protocol: Redirect HTTP to HTTPS
  - Allowed HTTP methods: GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE

- [ ] CloudFront cache policy configured
  - Cache disabled for API responses (use CachingDisabled policy)
  - Origin header forwarding: Forward all headers
  - Query string forwarding: Forward all

- [ ] CloudFront distribution deployed
  ```bash
  # In AWS Console:
  # CloudFront > Distributions > Select distribution
  # Status should be: Deployed (not In Progress)
  # Domain name: d123abc.cloudfront.net (note this value)
  ```

- [ ] CloudFront HTTPS certificate attached
  - Distribution settings > SSL certificate: Select ACM certificate

---

## Application Verification

### API Health Endpoint

- [ ] Local health endpoint responds (via EC2)
  ```bash
  curl http://localhost:8000/health
  # Should return: {"status":"healthy"}
  ```

- [ ] CloudFront health endpoint responds
  ```bash
  curl https://YOUR-CLOUDFRONT-DOMAIN/health
  # Should return: {"status":"healthy"}
  # Note: May take 1-2 minutes for distribution to be fully deployed
  ```

- [ ] HTTP status code is 200
  ```bash
  curl -w "%{http_code}" https://YOUR-CLOUDFRONT-DOMAIN/health
  # Should be: 200
  ```

### API Documentation

- [ ] Swagger UI accessible
  ```bash
  curl https://YOUR-CLOUDFRONT-DOMAIN/docs -L
  # Should return HTML with Swagger interface
  ```

- [ ] OpenAPI schema accessible
  ```bash
  curl https://YOUR-CLOUDFRONT-DOMAIN/openapi.json
  # Should return valid JSON schema
  ```

### API Endpoints

- [ ] POST /analyze endpoint works
  ```bash
  curl -X POST https://YOUR-CLOUDFRONT-DOMAIN/analyze \
    -H "Content-Type: application/json" \
    -d '{"repo_url":"https://github.com/example/repo","branch":"main"}'
  # Should return job ID and status
  ```

- [ ] GET /results/{job_id} endpoint works
  ```bash
  # After getting job_id from analyze endpoint
  curl https://YOUR-CLOUDFRONT-DOMAIN/results/YOUR-JOB-ID
  # Should return job status and results (or 404 if not found)
  ```

---

## Monitoring and Logging

### CloudWatch Agent Installation

- [ ] CloudWatch agent installed
  ```bash
  sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
    -a query -m ec2 -c default -s
  # Should output agent status
  ```

- [ ] CloudWatch agent configuration created
  ```bash
  # See deploy/cloudwatch-alarms.md for agent setup
  ```

- [ ] CloudWatch agent running and sending metrics
  ```bash
  sudo systemctl is-active amazon-cloudwatch-agent
  # Output: active
  ```

### System Logging

- [ ] Application logs available via journalctl
  ```bash
  sudo journalctl -u codemap -n 10
  # Should show recent application logs
  ```

- [ ] Log levels configured correctly
  ```bash
  grep "CODEMAP_LOG_LEVEL" /etc/codemap/env
  # Should show: CODEMAP_LOG_LEVEL=INFO
  ```

- [ ] Log rotation configured
  ```bash
  sudo ls -la /etc/logrotate.d/ | grep codemap
  # Should show logrotate configuration
  ```

---

## Monitoring Setup

### CloudWatch Metrics

- [ ] CPU Utilization alarm configured
  - Threshold: 80%
  - Evaluation period: 5 minutes
  - Datapoints to alarm: 2
  - Action: SNS notification

- [ ] Disk Space alarm configured
  - Threshold: 80% of 30 GB
  - Evaluation period: 5 minutes
  - Datapoints to alarm: 2
  - Action: SNS notification

- [ ] Memory Usage alarm configured
  - Threshold: 80%
  - Evaluation period: 5 minutes
  - Datapoints to alarm: 2
  - Action: SNS notification

Verify in AWS Console:
```
CloudWatch > Alarms > All Alarms
Should show: codemap-cpu-high, codemap-disk-high, codemap-memory-high
All states: OK (not ALARM)
```

### SNS Notifications

- [ ] SNS topic created for alarms
  - Topic name: `codemap-alarms`
  - Verify in SNS > Topics

- [ ] Email subscription added to SNS topic
  - Check inbox for confirmation email
  - Click "Confirm subscription" link
  - Status should be: Confirmed (not PendingConfirmation)

- [ ] Test SNS notification
  - SNS > Topics > Select codemap-alarms > Publish message
  - Should receive email shortly after

---

## S3 Results Storage (Optional)

### S3 Bucket Setup

- [ ] S3 bucket created
  - Name: `codemap-results-ACCOUNT-ID`
  - Region: us-west-2
  - Blocking public access: All enabled
  - Versioning: Enabled (optional)

- [ ] S3 lifecycle policy configured
  - Rule: Delete objects after 30 days
  - Verify in S3 > Bucket > Lifecycle rules

- [ ] S3 bucket IAM permissions set
  ```bash
  # See deploy/s3-setup.md for complete policy
  ```

### EC2 IAM Role

- [ ] IAM role created for EC2
  - Role name: `CodeMapEC2Role`
  - Trust policy allows EC2 service
  - Permissions allow S3 bucket read/write

- [ ] IAM role attached to EC2 instance
  ```bash
  # AWS Console: EC2 > Instances > Select instance
  # Security > IAM instance profile: CodeMapEC2Role
  ```

- [ ] S3 storage configured in environment
  ```bash
  sudo nano /etc/codemap/env
  # Add: CODEMAP_STORAGE=s3
  # Add: CODEMAP_S3_BUCKET=codemap-results-ACCOUNT-ID
  # Add: AWS_DEFAULT_REGION=us-west-2
  ```

- [ ] Service restarted to pick up S3 config
  ```bash
  sudo systemctl restart codemap
  ```

- [ ] S3 storage tested
  ```bash
  # Run a test analysis that creates a result
  # Verify result is stored in S3 bucket
  aws s3 ls s3://codemap-results-ACCOUNT-ID/
  ```

---

## Cost Monitoring

### Billing Alerts

- [ ] Free Tier usage alerts enabled
  ```
  AWS Console > Billing > Preferences
  Alert Type: Free Tier Usage Alerts (Enabled)
  Threshold: $0.00 (any overage)
  Email: Your email address
  ```

- [ ] Monthly budget alert set
  ```
  AWS Console > Billing > Budgets
  Budget Type: Monthly cost
  Budget amount: $5.00 (safety threshold)
  Notification threshold: $2.50 and $5.00
  ```

- [ ] Cost anomaly detection enabled
  ```
  AWS Console > Billing > Cost Anomaly Detection
  Frequency: Daily
  Alert threshold: $5.00 increase
  ```

### Usage Monitoring

- [ ] CloudFront data transfer monitored
  ```bash
  # AWS Console > CloudFront > Distributions
  # Select distribution > Monitor tab
  # Check: Bytes downloaded, Requests
  ```

- [ ] EC2 running hours tracked
  ```bash
  # AWS Console > EC2 > Instances
  # Note instance ID and launch time
  # Expected: 744 hours/month for always-on t2.micro
  ```

- [ ] EC2 data transfer monitored
  ```bash
  # AWS Console > EC2 Dashboard > Instances
  # Select instance > Monitor > Network tab
  ```

---

## Backup and Disaster Recovery

### Local Backups

- [ ] Backup script created
  ```bash
  ls -la deploy/backup-to-s3.sh
  # Should exist and be executable: -rwxr-xr-x
  ```

- [ ] Backup script tested
  ```bash
  sudo bash deploy/backup-to-s3.sh --dry-run
  # Should show what would be backed up, no errors
  ```

- [ ] Backup cron job scheduled
  ```bash
  sudo crontab -e
  # Add: 0 2 * * * cd /opt/codemap && bash deploy/backup-to-s3.sh
  # (2 AM daily backup)
  ```

### S3 Backup Verification

- [ ] First backup executed
  ```bash
  sudo bash deploy/backup-to-s3.sh
  # Should complete without errors
  ```

- [ ] Backup contents verified in S3
  ```bash
  aws s3 ls s3://codemap-results-ACCOUNT-ID/ --recursive
  # Should show backup files
  ```

### Disaster Recovery Test

- [ ] EC2 instance can be restored from AMI
  - Ensure backups are tested periodically (quarterly minimum)

---

## GitHub Actions Deployment

### GitHub Secrets Configured

- [ ] EC2_HOST secret set
  ```
  GitHub > Settings > Secrets and variables > Actions
  Name: EC2_HOST
  Value: <EC2-PUBLIC-IP>
  ```

- [ ] EC2_USER secret set
  ```
  Name: EC2_USER
  Value: ec2-user
  ```

- [ ] EC2_SSH_KEY secret set
  ```
  Name: EC2_SSH_KEY
  Value: <FULL-PEM-FILE-CONTENTS>
  (Include BEGIN and END lines)
  ```

- [ ] CLOUDFRONT_URL secret set (optional)
  ```
  Name: CLOUDFRONT_URL
  Value: d123abc.cloudfront.net
  ```

### Deployment Workflow Tested

- [ ] Create test commit and push to main
  ```bash
  git commit --allow-empty -m "test: trigger deployment workflow"
  git push origin main
  ```

- [ ] GitHub Actions workflow executed
  ```
  GitHub > Actions > Find "Deploy to Production" workflow run
  Status should be: ✓ Success (all steps green)
  ```

- [ ] Deployment completed successfully
  - Test step passed
  - Lint step passed
  - Typecheck step passed
  - Deploy step executed without errors
  - Health check passed

- [ ] API still responds after deployment
  ```bash
  curl https://YOUR-CLOUDFRONT-DOMAIN/health
  # Should return: {"status":"healthy"}
  ```

---

## Final Verification

### All Endpoints Working

- [ ] Health endpoint responds via CloudFront
  ```bash
  curl https://YOUR-CLOUDFRONT-DOMAIN/health
  ```

- [ ] Swagger UI loads in browser
  ```
  https://YOUR-CLOUDFRONT-DOMAIN/docs
  ```

- [ ] ReDoc documentation loads
  ```
  https://YOUR-CLOUDFRONT-DOMAIN/redoc
  ```

- [ ] Analyze endpoint accepts requests
  ```bash
  curl -X POST https://YOUR-CLOUDFRONT-DOMAIN/analyze \
    -H "Content-Type: application/json" \
    -d '{"repo_url":"https://github.com/example/repo","branch":"main"}'
  # Should return job_id
  ```

### Performance and Resource Usage

- [ ] CPU utilization stable (should be <10% at idle)
  ```bash
  top -b -n 1 | grep Cpu
  ```

- [ ] Memory usage stable (should be <50% at idle)
  ```bash
  free -h
  ```

- [ ] Disk usage acceptable (should be <50% of 30 GB)
  ```bash
  df -h /
  ```

- [ ] No errors in application logs
  ```bash
  sudo journalctl -u codemap -p err
  # Should return: (nothing or only warnings)
  ```

### SSL/TLS Certificate

- [ ] HTTPS works with valid certificate
  ```bash
  curl -I https://YOUR-CLOUDFRONT-DOMAIN/health
  # HTTP/1.1 200 OK
  # Should NOT show certificate errors
  ```

- [ ] Certificate is not self-signed
  ```bash
  openssl s_client -connect YOUR-CLOUDFRONT-DOMAIN:443 </dev/null | \
    grep "Issuer:"
  # Should show: Issuer: CN=Amazon
  ```

---

## Go-Live Sign-Off

### Technical Checklist Complete

- [ ] All infrastructure checks passed
- [ ] All security hardening measures in place
- [ ] All monitoring and alarms configured
- [ ] All endpoints verified working
- [ ] Backup and disaster recovery tested
- [ ] GitHub Actions deployment workflow tested

### Documentation Complete

- [ ] README.md links to all deployment docs
- [ ] PRODUCTION_CHECKLIST.md completed (this document)
- [ ] cloudwatch-alarms.md reviewed for monitoring setup
- [ ] s3-setup.md reviewed for backup procedure
- [ ] All scripts tested and documented

### Team Notification

- [ ] Development team notified of production deployment
- [ ] Operations team has CloudWatch dashboard access
- [ ] On-call procedures documented (see runbook below)
- [ ] Rollback procedure tested and documented

---

## Post-Deployment Monitoring (First 24 Hours)

Monitor these metrics closely for first 24 hours after go-live:

- [ ] Check CloudWatch dashboard every 1 hour
  - CPU utilization should be <20%
  - Memory utilization should be <60%
  - Disk utilization should be stable
  - No alarms should trigger

- [ ] Monitor API response times
  - Health endpoint: <100ms
  - Analyze endpoint: <2 seconds
  - Results endpoint: <1 second

- [ ] Check error logs hourly
  ```bash
  sudo journalctl -u codemap -p err --since "1 hour ago"
  # Should be empty or minimal
  ```

- [ ] Verify CloudFront CDN is working
  - Distribution status: Deployed
  - Requests increasing normally
  - Cache hit rate: >60%

---

## Runbook: Common Issues and Solutions

### Issue: API not responding via CloudFront (502 Bad Gateway)

**Diagnosis Steps:**
1. Check service status: `sudo systemctl status codemap`
2. Check if port 8000 is listening: `sudo netstat -tlnp | grep 8000`
3. Check recent logs: `sudo journalctl -u codemap -n 50`

**Solutions:**
- If service is down: `sudo systemctl restart codemap`
- If port 8000 not listening: Check for startup errors in logs
- If certificate issue: Verify CloudFront distribution settings

**Rollback if needed:**
```bash
cd /opt/codemap
sudo bash deploy/deploy-remote.sh --rollback
```

### Issue: High CPU Utilization (Alarm Triggered)

**Diagnosis Steps:**
1. Check what process is using CPU: `top -b -n 1`
2. Check if specific job is stuck: `ps aux | grep codemap`
3. Check for infinite loops: `sudo journalctl -u codemap -n 100`

**Solutions:**
- Restart service: `sudo systemctl restart codemap`
- Kill stuck job process if needed: `sudo kill -9 <PID>`
- Check recent code changes for performance regressions

**Prevention:**
- Monitor /analyze endpoint for long-running jobs
- Consider adding job timeout and cancellation

### Issue: High Memory Usage (Alarm Triggered)

**Diagnosis Steps:**
1. Check memory breakdown: `free -h`
2. Check if process has memory leak: `top -b -n 1 | head -20`
3. Check for large result files: `du -sh /opt/codemap/results`

**Solutions:**
- Restart service to clear memory: `sudo systemctl restart codemap`
- Clean up old results: `sudo rm -rf /opt/codemap/results/*`
- Verify S3 backup is working (should be cleaning up local results)

**Prevention:**
- Enable S3 storage and results cleanup
- Set up log rotation for journalctl
- Monitor and archive results periodically

### Issue: Disk Space Low (>80% Used)

**Diagnosis Steps:**
1. Check disk usage: `df -h /`
2. Find large files: `du -sh /opt/codemap/results`
3. Check system logs: `sudo du -sh /var/log`

**Solutions:**
- Clean up old results: `sudo rm -rf /opt/codemap/results/*`
- Clean up system logs: `sudo journalctl --vacuum=1G`
- Enable log rotation if not active

**Prevention:**
- Enable S3 storage for results (automatic cleanup)
- Set up cron job for regular cleanup
- Monitor disk usage trend in CloudWatch

### Issue: SSH Connection Fails

**Diagnosis Steps:**
1. Verify instance is running: `aws ec2 describe-instances --instance-ids i-xxx`
2. Check security group rules: `aws ec2 describe-security-groups`
3. Verify SSH key permissions: `ls -la your-key.pem`

**Solutions:**
- Check instance status in EC2 Dashboard (should be "running")
- Verify security group allows SSH from your IP
- Ensure SSH key has permissions 600: `chmod 600 your-key.pem`
- Try SSH with verbose output: `ssh -vvv -i your-key.pem ec2-user@<IP>`

### Issue: Deployment via GitHub Actions Failed

**Diagnosis Steps:**
1. Check GitHub Actions logs: `GitHub > Actions > Select workflow run > See detailed logs`
2. Common failure points:
   - Tests failed: Check pytest output
   - Linting failed: Check ruff output
   - Deploy step failed: Check SSH connection details
   - Health check failed: Verify CloudFront domain is correct

**Solutions:**
- If tests failed: Fix code locally, commit, and push again
- If deploy step failed: Verify EC2_HOST, EC2_USER, EC2_SSH_KEY secrets
- If health check failed: Give CloudFront more time to deploy (2-3 minutes)

**Manual deployment if GitHub Actions fails:**
```bash
ssh -i your-key.pem ec2-user@<PUBLIC-IP>
cd /opt/codemap
git fetch origin main
git reset --hard origin/main
source venv/bin/activate
pip install -e ".[api]"
sudo systemctl restart codemap
curl http://localhost:8000/health
```

### Issue: Results Not Storing in S3

**Diagnosis Steps:**
1. Check S3 storage is enabled: `grep CODEMAP_STORAGE /etc/codemap/env`
2. Check S3 bucket exists: `aws s3 ls s3://codemap-results-ACCOUNT-ID/`
3. Check IAM role has permissions: Check EC2 instance IAM role in AWS Console
4. Check recent errors: `sudo journalctl -u codemap -p err --since "10 minutes ago"`

**Solutions:**
- Verify S3 bucket name is correct in /etc/codemap/env
- Verify IAM role has S3 read/write permissions
- Verify AWS credentials are configured (IAM role or env vars)
- Restart service: `sudo systemctl restart codemap`

**Testing S3 access:**
```bash
# Test S3 access with AWS CLI
aws s3 ls s3://codemap-results-ACCOUNT-ID/

# If this fails, IAM role permissions are missing
```

---

## Post-Incident Procedures

After any incident or alarm trigger:

1. **Document the incident**
   - What happened
   - How it was detected (CloudWatch alarm, customer report, etc.)
   - How it was resolved
   - Root cause analysis
   - Time to resolution

2. **Review logs**
   ```bash
   sudo journalctl -u codemap > /tmp/incident-logs.txt
   # Store for analysis
   ```

3. **Update runbook**
   - If new issue discovered, add to this runbook
   - Document solutions for future reference

4. **Communicate resolution**
   - Notify team of incident and resolution
   - Update status page if public
   - Share lessons learned

---

## Maintenance Schedule

### Daily
- [ ] Check CloudWatch dashboard for alarms
- [ ] Spot-check health endpoint: `curl https://YOUR-CLOUDFRONT-DOMAIN/health`

### Weekly
- [ ] Review application logs: `sudo journalctl -u codemap --since "1 week ago"`
- [ ] Check disk usage: `df -h /`
- [ ] Verify backup jobs completed successfully

### Monthly
- [ ] Review CloudWatch metrics for trends
- [ ] Test rollback procedure
- [ ] Review AWS Billing Dashboard for unexpected charges
- [ ] Update this checklist based on lessons learned

### Quarterly
- [ ] Review and update security configurations
- [ ] Test disaster recovery (restore from backup)
- [ ] Review and update runbook
- [ ] Audit access logs and security group rules

---

## Contact and Escalation

**Development Team**: [contact info]
**Operations Team**: [contact info]
**AWS Support**: https://console.aws.amazon.com/support/
**On-Call Schedule**: [link to schedule]

---

**Last Updated**: 2024-12-17
**Version**: 1.0.0
**Status**: Ready for Production
