# CloudWatch Monitoring and Alarms Setup

**Purpose**: Configure AWS CloudWatch to monitor CodeMap API performance, resource usage, and health status.

**AWS Free Tier Limits**:
- Custom metrics: 10 maximum (we'll use 3-5)
- Alarms: 10 maximum (we'll use 5)
- Log storage: Included
- Dashboard: 3 free dashboards

**Region**: us-west-2
**Cost**: Free (within limits)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                       CloudWatch                             │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────┐      ┌──────────────────┐             │
│  │   EC2 Metrics    │      │  Application     │             │
│  │                  │      │  Logs (journald) │             │
│  │ • CPU %          │      │                  │             │
│  │ • Memory %       │  → → │ codemap service  │ → →         │
│  │ • Disk %         │      │ system logs      │             │
│  │ • Network I/O    │      │                  │             │
│  └──────────────────┘      └──────────────────┘             │
│           ↓                           ↓                      │
│    (CloudWatch Agent)     (CloudWatch Logs Agent)           │
│                                                               │
└─────────────────────────────────────────────────────────────┘
                          ↓
           ┌──────────────────────────┐
           │   Alarms (Thresholds)    │
           ├──────────────────────────┤
           │ • CPU > 80%              │
           │ • Disk > 80%             │
           │ • Memory > 80%           │
           │ • API errors > threshold │
           │ • Health check failure   │
           └──────────────────────────┘
                          ↓
           ┌──────────────────────────┐
           │   SNS Notifications      │
           ├──────────────────────────┤
           │ • Email alerts           │
           │ • SMS (optional)         │
           │ • Slack (optional)       │
           └──────────────────────────┘
```

---

## Part 1: Install and Configure CloudWatch Agent

### 1.1 Download CloudWatch Agent

Connect to EC2 instance and download the agent:

```bash
ssh -i your-key.pem ec2-user@<PUBLIC-IP>

# Download CloudWatch agent for Amazon Linux 2
cd /tmp
wget https://s3.amazonaws.com/amazoncloudwatch-agent/amazon_linux/amd64/latest/amazon-cloudwatch-agent.rpm

# Install
sudo rpm -U ./amazon-cloudwatch-agent.rpm

# Verify installation
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a query -m ec2 -c default -s
```

**Expected Output**:
```
{
  "status": "stopped"
}
```

### 1.2 Create CloudWatch Agent Configuration

The CloudWatch agent requires a JSON configuration file. Create it:

```bash
cat << 'EOF' | sudo tee /opt/aws/amazon-cloudwatch-agent/etc/cloudwatch-config.json
{
  "agent": {
    "metrics_collection_interval": 60,
    "run_as_user": "root"
  },
  "metrics": {
    "namespace": "CodeMap",
    "metrics_collected": {
      "cpu": {
        "measurement": [
          {
            "name": "cpu_usage_idle",
            "rename": "CPU_Usage_Idle",
            "unit": "Percent"
          },
          {
            "name": "cpu_usage_iowait",
            "rename": "CPU_Usage_IOWait",
            "unit": "Percent"
          },
          "cpu_usage_system",
          "cpu_usage_active"
        ],
        "metrics_collection_interval": 60,
        "aggregation_dimensions": [
          [
            "InstanceId"
          ]
        ]
      },
      "disk": {
        "measurement": [
          {
            "name": "used_percent",
            "rename": "Disk_Used_Percent",
            "unit": "Percent"
          },
          {
            "name": "free",
            "rename": "Disk_Free_GB",
            "unit": "Gigabytes"
          },
          {
            "name": "used",
            "rename": "Disk_Used_GB",
            "unit": "Gigabytes"
          }
        ],
        "metrics_collection_interval": 60,
        "resources": [
          "/"
        ],
        "aggregation_dimensions": [
          [
            "InstanceId",
            "path"
          ]
        ]
      },
      "mem": {
        "measurement": [
          {
            "name": "mem_used_percent",
            "rename": "Memory_Used_Percent",
            "unit": "Percent"
          },
          {
            "name": "mem_available",
            "rename": "Memory_Available_GB",
            "unit": "Gigabytes"
          },
          {
            "name": "mem_used",
            "rename": "Memory_Used_GB",
            "unit": "Gigabytes"
          }
        ],
        "metrics_collection_interval": 60,
        "aggregation_dimensions": [
          [
            "InstanceId"
          ]
        ]
      },
      "netstat": {
        "measurement": [
          {
            "name": "tcp_established",
            "rename": "TCP_Connections_Established",
            "unit": "Count"
          },
          {
            "name": "tcp_time_wait",
            "rename": "TCP_Connections_TimeWait",
            "unit": "Count"
          }
        ],
        "metrics_collection_interval": 60,
        "aggregation_dimensions": [
          [
            "InstanceId"
          ]
        ]
      },
      "processes": {
        "measurement": [
          {
            "name": "running",
            "rename": "Processes_Running",
            "unit": "Count"
          },
          {
            "name": "total",
            "rename": "Processes_Total",
            "unit": "Count"
          }
        ],
        "metrics_collection_interval": 60,
        "aggregation_dimensions": [
          [
            "InstanceId"
          ]
        ]
      }
    }
  },
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "/var/log/messages",
            "log_group_name": "/aws/ec2/codemap",
            "log_stream_name": "{instance_id}/system",
            "retention_in_days": 7
          }
        ]
      }
    }
  }
}
EOF

# Verify configuration is valid
sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a fetch-config -m ec2 \
  -s -c file:/opt/aws/amazon-cloudwatch-agent/etc/cloudwatch-config.json
```

### 1.3 Start CloudWatch Agent

```bash
# Start the agent
sudo systemctl start amazon-cloudwatch-agent

# Enable on boot
sudo systemctl enable amazon-cloudwatch-agent

# Verify it's running
sudo systemctl status amazon-cloudwatch-agent

# Query status (should show "running")
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a query -m ec2 -c default -s
```

**Expected Output**:
```
{
  "status": "running"
}
```

### 1.4 Verify Metrics Appear in CloudWatch

Wait 2-3 minutes for metrics to appear, then check:

```bash
# In AWS Console:
# CloudWatch > Metrics > CodeMap namespace
# Should see: CPU_Usage_Active, Disk_Used_Percent, Memory_Used_Percent
```

---

## Part 2: Create SNS Topic for Notifications

### 2.1 Create SNS Topic

```bash
# Create SNS topic (via AWS Console or CLI)
aws sns create-topic \
  --name codemap-alarms \
  --region us-west-2

# Output will show: TopicArn (save this for next steps)
# Format: arn:aws:sns:us-west-2:123456789012:codemap-alarms
```

Or via AWS Console:
```
SNS > Topics > Create topic
  Name: codemap-alarms
  Display name: CodeMap Alarms
  Click Create topic
```

### 2.2 Subscribe to SNS Topic (Email)

```bash
# Subscribe via CLI
aws sns subscribe \
  --topic-arn arn:aws:sns:us-west-2:123456789012:codemap-alarms \
  --protocol email \
  --notification-endpoint your-email@example.com \
  --region us-west-2
```

Or via AWS Console:
```
SNS > Topics > Select codemap-alarms > Create subscription
  Protocol: Email
  Endpoint: your-email@example.com
  Click Create subscription
```

**Verification**:
- Check inbox for subscription confirmation email
- Click "Confirm subscription" link
- Status should change from PendingConfirmation to Confirmed

### 2.3 Test SNS Topic

```bash
# Publish test message
aws sns publish \
  --topic-arn arn:aws:sns:us-west-2:123456789012:codemap-alarms \
  --subject "CloudWatch Test" \
  --message "This is a test message. Alarms are configured correctly." \
  --region us-west-2
```

You should receive an email within 1-2 minutes.

---

## Part 3: Create CloudWatch Alarms

### 3.1 CPU Utilization Alarm

Create alarm for high CPU usage:

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name codemap-cpu-high \
  --alarm-description "Alert when CPU > 80% for 10 minutes" \
  --metric-name CPU_Usage_Active \
  --namespace CodeMap \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2 \
  --alarm-actions arn:aws:sns:us-west-2:123456789012:codemap-alarms \
  --dimensions Name=InstanceId,Value=i-xxxxxxxxx \
  --region us-west-2

# Replace i-xxxxxxxxx with your EC2 instance ID
```

Get your instance ID:
```bash
curl http://169.254.169.254/latest/meta-data/instance-id
# Example output: i-0a1b2c3d4e5f6g7h8
```

**Configuration Breakdown**:
- `--alarm-name`: Unique identifier for this alarm
- `--metric-name`: Which metric to monitor (CPU_Usage_Active)
- `--namespace`: Where to find the metric (CodeMap)
- `--statistic`: How to aggregate (Average over period)
- `--period`: Check every 300 seconds (5 minutes)
- `--threshold`: Alert if value exceeds 80
- `--comparison-operator`: GreaterThanThreshold
- `--evaluation-periods`: Must exceed threshold for 2 consecutive periods (10 min)
- `--alarm-actions`: SNS topic to notify

### 3.2 Memory Utilization Alarm

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name codemap-memory-high \
  --alarm-description "Alert when memory > 80% for 10 minutes" \
  --metric-name Memory_Used_Percent \
  --namespace CodeMap \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2 \
  --alarm-actions arn:aws:sns:us-west-2:123456789012:codemap-alarms \
  --dimensions Name=InstanceId,Value=i-xxxxxxxxx \
  --region us-west-2
```

### 3.3 Disk Space Alarm

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name codemap-disk-high \
  --alarm-description "Alert when disk > 80% for 10 minutes" \
  --metric-name Disk_Used_Percent \
  --namespace CodeMap \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2 \
  --alarm-actions arn:aws:sns:us-west-2:123456789012:codemap-alarms \
  --dimensions Name=InstanceId,Value=i-xxxxxxxxx Name=path,Value=/ \
  --region us-west-2
```

### 3.4 Low Disk Space Alarm (Early Warning)

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name codemap-disk-warning \
  --alarm-description "Alert when disk > 60% (early warning)" \
  --metric-name Disk_Used_Percent \
  --namespace CodeMap \
  --statistic Average \
  --period 600 \
  --threshold 60 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 1 \
  --alarm-actions arn:aws:sns:us-west-2:123456789012:codemap-alarms \
  --dimensions Name=InstanceId,Value=i-xxxxxxxxx Name=path,Value=/ \
  --region us-west-2
```

### 3.5 Billing Alarm

Monitor for unexpected costs (CloudFront data transfer is the main concern):

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name codemap-billing-warning \
  --alarm-description "Alert if estimated monthly bill exceeds $5" \
  --metric-name EstimatedCharges \
  --namespace AWS/Billing \
  --statistic Maximum \
  --period 86400 \
  --threshold 5.00 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 1 \
  --alarm-actions arn:aws:sns:us-west-2:123456789012:codemap-alarms \
  --dimensions Name=Currency,Value=USD \
  --region us-west-2
```

### Verify All Alarms Created

```bash
# List all alarms
aws cloudwatch describe-alarms --region us-west-2

# Should show all 5 alarms:
# - codemap-cpu-high
# - codemap-memory-high
# - codemap-disk-high
# - codemap-disk-warning
# - codemap-billing-warning
```

Or verify in AWS Console:
```
CloudWatch > Alarms > All Alarms
Status: OK (or INSUFFICIENT_DATA for billing initially)
```

---

## Part 4: Create CloudWatch Dashboard

### 4.1 Create Dashboard (via Console)

AWS Console method is easiest:

```
CloudWatch > Dashboards > Create dashboard
Name: codemap-monitoring
Click Create
```

### 4.2 Add CPU Metric

Click **Add widget** > **Line** (or Area)

Configure:
- **Namespace**: CodeMap
- **Metric**: CPU_Usage_Active
- **Dimensions**: Instance ID
- **Statistics**: Average
- **Period**: 5 minutes
- **Title**: CPU Utilization
- **Y-axis label**: Percent (0-100)

### 4.3 Add Memory Metric

Click **Add widget** > **Line**

Configure:
- **Namespace**: CodeMap
- **Metric**: Memory_Used_Percent
- **Dimensions**: Instance ID
- **Statistics**: Average
- **Period**: 5 minutes
- **Title**: Memory Usage
- **Y-axis label**: Percent (0-100)

### 4.4 Add Disk Metric

Click **Add widget** > **Line**

Configure:
- **Namespace**: CodeMap
- **Metric**: Disk_Used_Percent
- **Dimensions**: Instance ID, path=/
- **Statistics**: Average
- **Period**: 5 minutes
- **Title**: Disk Usage
- **Y-axis label**: Percent (0-100)

### 4.5 Add Alarms Widget

Click **Add widget** > **Number** (or Alarm Status)

Configure:
- Select all 5 codemap-* alarms
- **Title**: Alarm Status
- Shows current state of all alarms

### 4.6 Save Dashboard

Click **Save dashboard**

You can now view all metrics on one page:
```
CloudWatch > Dashboards > codemap-monitoring
```

---

## Part 5: CloudWatch Logs Setup

### 5.1 Install CloudWatch Logs Agent

Already included in EC2 setup script, but verify:

```bash
# Create log group
aws logs create-log-group \
  --log-group-name /aws/ec2/codemap \
  --region us-west-2

# Set retention
aws logs put-retention-policy \
  --log-group-name /aws/ec2/codemap \
  --retention-in-days 7 \
  --region us-west-2
```

### 5.2 Configure Application Logs

For application logs (CodeMap service), configure in CloudWatch agent:

```bash
# Update CloudWatch agent config to include application logs
# Add to /opt/aws/amazon-cloudwatch-agent/etc/cloudwatch-config.json

cat << 'EOF' | sudo tee -a /opt/aws/amazon-cloudwatch-agent/etc/cloudwatch-config.json
{
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "/var/log/messages",
            "log_group_name": "/aws/ec2/codemap",
            "log_stream_name": "{instance_id}/system",
            "retention_in_days": 7
          },
          {
            "file_path": "/var/log/codemap.log",
            "log_group_name": "/aws/ec2/codemap",
            "log_stream_name": "{instance_id}/application",
            "retention_in_days": 7
          }
        ]
      }
    }
  }
}
EOF
```

### 5.3 View Application Logs in CloudWatch

```
CloudWatch > Logs > Log groups > /aws/ec2/codemap
Select log stream to view entries
Filter for errors: [code != 200, code != 304]
```

---

## Part 6: Custom Metrics (Optional Advanced)

### Create Custom Application Metric

If you want to track custom metrics (e.g., API request count), use CloudWatch API:

```bash
# Example: Track API requests
aws cloudwatch put-metric-data \
  --namespace CodeMap \
  --metric-name APIRequests \
  --value 1 \
  --unit Count \
  --region us-west-2
```

Or from within application code (Python):

```python
import boto3
from datetime import datetime

cloudwatch = boto3.client('cloudwatch', region_name='us-west-2')

cloudwatch.put_metric_data(
    Namespace='CodeMap',
    MetricData=[
        {
            'MetricName': 'APIRequests',
            'Value': 1,
            'Unit': 'Count',
            'Timestamp': datetime.utcnow()
        }
    ]
)
```

---

## Monitoring and Alert Response

### Typical Alert Response

When you receive an alert:

1. **Read the alert email**
   - Alarm name: Which threshold was exceeded
   - Metric name: Which value triggered it
   - Current value: The actual value at alarm time
   - Timestamp: When alarm triggered

2. **Investigate in CloudWatch Dashboard**
   ```
   CloudWatch > Dashboards > codemap-monitoring
   Look at the specific metric chart
   Check timeline (last hour, 3 hours, 24 hours)
   ```

3. **Check EC2 Instance Status**
   ```
   EC2 > Instances > Select instance
   Monitor tab > CPU, Network, Disk
   See detailed breakdown
   ```

4. **Check Application Logs**
   ```
   CloudWatch > Logs > Log groups > /aws/ec2/codemap
   Search for errors or warnings
   Look for correlation with metric spike
   ```

5. **Take Action**
   - If CPU high: Check for stuck jobs, restart service if needed
   - If memory high: Restart service to clear memory
   - If disk high: Clean up old results or enable S3 storage
   - See PRODUCTION_CHECKLIST.md for full runbook

### Alert Thresholds Explained

| Alarm | Threshold | Why This Value | Action |
|-------|-----------|----------------|--------|
| CPU > 80% | 80% | 20% headroom for spikes | Investigate slow job, consider scaling |
| Memory > 80% | 80% | Avoid OOM killer | Restart service, check for leaks |
| Disk > 80% | 80% of 30GB = 24GB | Leave 6GB free | Clean results, enable S3 backup |
| Disk > 60% | 60% of 30GB = 18GB | Early warning | Prepare for cleanup |
| Billing > $5 | $5.00 | Safety threshold | Investigate CloudFront traffic |

---

## Metric Retention and Costs

### CloudWatch Metric Retention

Metrics are automatically retained:
- 1-minute granularity: 15 days
- 5-minute granularity: 63 days
- 1-hour granularity: 455 days (15 months)
- 1-day granularity: 10 years

Since we use 5-minute and 1-minute periods, metrics are available for 15-63 days.

### Free Tier Usage

Current setup uses:
- **Metrics**: 6 custom metrics (CPU, Memory, Disk, Network, Processes, Billing)
- **Alarms**: 5 alarms
- **Log storage**: ~100 MB/month for 7-day retention
- **Dashboard**: 1 dashboard

All within free tier limits!

### Cost Monitoring Commands

```bash
# Check custom metrics count
aws cloudwatch list-metrics \
  --namespace CodeMap \
  --region us-west-2 | grep -c MetricName

# Check alarm count
aws cloudwatch describe-alarms \
  --region us-west-2 | grep -c AlarmName

# Check log group size
aws logs describe-log-groups \
  --region us-west-2 | grep "/aws/ec2/codemap"
```

---

## Troubleshooting

### CloudWatch Agent Not Starting

```bash
# Check agent status
sudo systemctl status amazon-cloudwatch-agent

# View agent logs
sudo cat /opt/aws/amazon-cloudwatch-agent/logs/amazon-cloudwatch-agent.log

# Restart agent
sudo systemctl restart amazon-cloudwatch-agent
```

### Metrics Not Appearing

```bash
# Wait 2-3 minutes after agent start
# Check if metrics are being collected
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a query -m ec2 -c default -s

# Output should show "running"
```

### SNS Notifications Not Received

1. Check subscription is confirmed
   ```
   SNS > Topics > codemap-alarms > Subscriptions
   Status should be: Confirmed (not PendingConfirmation)
   ```

2. Check email spam folder
   - AWS emails may end up in spam

3. Resend confirmation
   ```bash
   aws sns set-subscription-attributes \
     --subscription-arn arn:aws:sns:us-west-2:123456789012:codemap-alarms:xxxxx \
     --attribute-name PendingConfirmation \
     --attribute-value true
   ```

### Alarms Stuck in INSUFFICIENT_DATA

```bash
# Wait 10-15 minutes for metric data to arrive
# Alarms need at least 1 evaluation period of data before firing
```

### High CloudWatch Costs

If you see unexpected CloudWatch charges:

1. Check for excessive log volume
   ```bash
   aws logs describe-log-streams \
     --log-group-name /aws/ec2/codemap \
     --region us-west-2
   ```

2. Reduce log retention
   ```bash
   aws logs put-retention-policy \
     --log-group-name /aws/ec2/codemap \
     --retention-in-days 3 \
     --region us-west-2
   ```

3. Disable custom metrics if not needed
   ```bash
   # Reduce metric collection interval in config
   # "metrics_collection_interval": 300  # 5 minutes instead of 60 seconds
   ```

---

## Advanced: Log Insights Queries

CloudWatch Logs Insights lets you query logs. Examples:

### Find Errors
```
fields @timestamp, @message
| filter @message like /ERROR/
| stats count() by bin(5m)
```

### Find Slow Requests
```
fields @timestamp, @duration
| filter @duration > 1000
| stats avg(@duration), max(@duration) by @logStream
```

### Count Requests by Status Code
```
fields @statusCode
| stats count() as requests by @statusCode
```

Access these at:
```
CloudWatch > Logs > Logs Insights
Select log group: /aws/ec2/codemap
Paste query and run
```

---

## Integration with External Monitoring (Optional)

### Slack Notifications

For Slack alerts instead of (or in addition to) email:

1. Create AWS Lambda function to format and send to Slack
2. Subscribe Lambda to SNS topic
3. Lambda calls Slack webhook with alarm details

See AWS documentation for Lambda + SNS + Slack integration.

### PagerDuty Integration

For on-call alerting:

1. Create PagerDuty integration in SNS topic
2. PagerDuty receives SNS notifications
3. PagerDuty pages on-call engineer

Setup: https://docs.pagerduty.com/docs/aws-integration

---

## Maintenance

### Monthly Maintenance

- [ ] Review alarm threshold accuracy (too many false alarms? adjust thresholds)
- [ ] Review log retention (7 days good? adjust if needed)
- [ ] Check for unused metrics (delete if not needed)
- [ ] Test SNS notifications still work

### Quarterly Maintenance

- [ ] Review all metrics for trends
- [ ] Check dashboard still shows useful information
- [ ] Archive logs to S3 for long-term storage
- [ ] Review and update this documentation

---

## Related Documentation

- [PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md) - Pre-deployment checks
- [README.md](./README.md) - Main deployment guide
- [s3-setup.md](./s3-setup.md) - S3 backup setup

---

**Last Updated**: 2024-12-17
**Version**: 1.0.0
**AWS Region**: us-west-2
**CloudWatch Namespace**: CodeMap
**Next Steps**: Follow PRODUCTION_CHECKLIST.md to verify all monitoring is working
