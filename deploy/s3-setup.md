# S3 Results Backup Setup

This guide documents how to set up AWS S3 for storing CodeMap analysis results. S3 provides durable, scalable storage within the AWS Free Tier limits.

## Free Tier Limits

- **Storage**: 5 GB total per month
- **Requests**: 20,000 PUT/POST/PATCH/DELETE + 2,000 GET/HEAD requests per month
- **Data Transfer**: 100 GB outbound per month (shared across all AWS services)
- **Lifecycle Rules**: Unlimited

## Step 1: Create S3 Bucket

### Via AWS Console

1. Go to AWS Console > S3 > Buckets
2. Click "Create bucket"
3. Configure bucket settings:
   - **Bucket name**: `codemap-results-{account-id}` (must be globally unique)
     - Replace `{account-id}` with your 12-digit AWS account ID
   - **Region**: `us-west-2` (or your preferred region)
   - **Block Public Access**: ENABLED (keep all settings checked)
   - **Versioning**: DISABLED (we don't need versioning)
   - **Encryption**: AES-256 (default, free)
4. Click "Create bucket"

### Via AWS CLI

```bash
aws s3api create-bucket \
  --bucket codemap-results-$(aws sts get-caller-identity --query Account --output text) \
  --region us-west-2 \
  --create-bucket-configuration LocationConstraint=us-west-2
```

## Step 2: Configure Lifecycle Policy

Automatically delete results older than 30 days to stay within free tier limits.

### Via AWS Console

1. Select your bucket
2. Go to Management > Lifecycle rules
3. Click "Create lifecycle rule"
4. Configure rule:
   - **Rule name**: `DeleteOldResults`
   - **Apply to all objects in bucket**: YES
   - **Expiration**:
     - **Expire current versions of objects**: 30 days
5. Click "Create rule"

### Via AWS CLI

Save the policy to a file (`lifecycle.json`):

```json
{
  "Rules": [
    {
      "Id": "DeleteOldResults",
      "Status": "Enabled",
      "Expiration": {
        "Days": 30
      }
    }
  ]
}
```

Apply it:

```bash
BUCKET_NAME="codemap-results-$(aws sts get-caller-identity --query Account --output text)"
aws s3api put-bucket-lifecycle-configuration \
  --bucket "$BUCKET_NAME" \
  --lifecycle-configuration file://lifecycle.json
```

## Step 3: Configure IAM Permissions for EC2

The EC2 instance needs permission to read/write to the S3 bucket.

### Create IAM Policy

1. Go to AWS Console > IAM > Policies
2. Click "Create policy"
3. Choose JSON editor and paste:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "S3ResultsAccess",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:ListBucket",
        "s3:DeleteObject"
      ],
      "Resource": [
        "arn:aws:s3:::codemap-results-*",
        "arn:aws:s3:::codemap-results-*/*"
      ]
    }
  ]
}
```

4. Click "Next"
5. Name it `CodeMapS3Access`
6. Click "Create policy"

### Attach Policy to EC2 Instance Role

#### Option A: Create New Instance with IAM Role

When launching EC2 in Step 2.1 of `deploy/README.md`:

1. In "Advanced Details" > "IAM instance profile":
2. Create new role:
   - Name: `CodeMapEC2Role`
   - Attach policy: `CodeMapS3Access`

#### Option B: Add to Existing Instance

1. Go to AWS Console > EC2 > Instances
2. Select your CodeMap instance
3. Click Security > Modify IAM role
4. Select or create a role with `CodeMapS3Access` policy attached

### Verify IAM Role Setup

SSH into your EC2 instance:

```bash
# Test S3 access
aws s3 ls codemap-results-$(aws sts get-caller-identity --query Account --output text)

# If you see the bucket, setup is correct
# If you get "Unable to locate credentials", IAM role is not attached
```

## Step 4: Configure CodeMap for S3 Storage

### Update Environment Variables

Edit `/etc/codemap/env` on your EC2 instance:

```bash
# Storage configuration
CODEMAP_STORAGE_TYPE=s3
CODEMAP_S3_BUCKET=codemap-results-YOUR_ACCOUNT_ID
CODEMAP_S3_PREFIX=codemap
CODEMAP_S3_REGION=us-west-2

# AWS will use IAM role credentials automatically
# No need to set AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY
```

Replace `YOUR_ACCOUNT_ID` with your 12-digit AWS account ID.

### Or Update Config File

Edit `~codemap/.codemap.toml`:

```toml
[tool.codemap]
storage_type = "s3"
s3_bucket = "codemap-results-YOUR_ACCOUNT_ID"
s3_prefix = "codemap"
s3_region = "us-west-2"
```

### Restart Service

```bash
sudo systemctl restart codemap
sudo systemctl status codemap

# Check logs
sudo journalctl -u codemap -n 50
```

## Step 5: Test S3 Integration

### Submit a Test Job

```bash
curl -X POST https://YOUR_CLOUDFRONT_DOMAIN/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "repo_url": "https://github.com/user/test-repo.git",
    "branch": "main"
  }'

# Save the job_id from response
JOB_ID="abc12345"
```

### Check Results in S3

```bash
# List all jobs in S3
aws s3 ls s3://codemap-results-YOUR_ACCOUNT_ID/codemap/ --recursive

# Check specific job
aws s3 ls s3://codemap-results-YOUR_ACCOUNT_ID/codemap/JOB_ID/

# Download CODE_MAP.json
aws s3 cp s3://codemap-results-YOUR_ACCOUNT_ID/codemap/JOB_ID/CODE_MAP.json .
```

### Verify via API

```bash
curl https://YOUR_CLOUDFRONT_DOMAIN/results/JOB_ID
curl https://YOUR_CLOUDFRONT_DOMAIN/results/JOB_ID/graph/module
```

## Step 6: Monitor S3 Storage

### View Storage Usage

```bash
aws s3 ls s3://codemap-results-YOUR_ACCOUNT_ID --recursive --summarize --human-readable
```

### Set Up Billing Alerts

1. Go to AWS Console > Billing > Billing preferences
2. Check "Receive Free Tier Usage Alerts"
3. Check "Receive Billing Alerts"
4. Set alert threshold: $5.00

This ensures you get notified if you exceed free tier limits.

### CloudWatch Metrics

Monitor S3 bucket metrics:

1. Go to AWS Console > CloudWatch > Metrics > S3
2. Select your bucket
3. View:
   - **NumberOfObjects**: Should stay under ~100 with 30-day lifecycle
   - **BucketSizeBytes**: Should stay under 5 GB

## Step 7: Backup Strategy

### Daily Backup to Second Location (Optional)

For additional durability, periodically copy results to a secondary location:

```bash
#!/bin/bash
# Weekly backup to another bucket
BACKUP_BUCKET="codemap-backups-$(aws sts get-caller-identity --query Account --output text)"
RESULTS_BUCKET="codemap-results-$(aws sts get-caller-identity --query Account --output text)"

aws s3 sync \
  "s3://$RESULTS_BUCKET/codemap/" \
  "s3://$BACKUP_BUCKET/$(date +%Y-%m-%d)/" \
  --delete
```

Add to crontab on EC2:
```bash
0 2 * * 0 /opt/codemap/backup-to-s3.sh >> /var/log/codemap-backup.log 2>&1
```

## Disaster Recovery

### Restore Results from S3

If local results are lost:

```bash
# Download all results for a job
aws s3 sync \
  s3://codemap-results-YOUR_ACCOUNT_ID/codemap/JOB_ID/ \
  /opt/codemap/results/JOB_ID/

# Verify download
ls -la /opt/codemap/results/JOB_ID/
```

### Restore from Backup

If using secondary backup bucket:

```bash
BACKUP_DATE="2024-01-15"  # Choose date to restore
BACKUP_BUCKET="codemap-backups-YOUR_ACCOUNT_ID"
RESULTS_BUCKET="codemap-results-YOUR_ACCOUNT_ID"

aws s3 sync \
  "s3://$BACKUP_BUCKET/$BACKUP_DATE/" \
  "s3://$RESULTS_BUCKET/codemap/" \
  --delete
```

## Troubleshooting

### Error: "Unable to locate credentials"

**Cause**: EC2 instance doesn't have IAM role attached.

**Fix**:
```bash
# Check IAM role
aws sts get-caller-identity

# If this fails, attach IAM role to EC2 instance (see Step 3)
```

### Error: "AccessDenied: User is not authorized to perform: s3:*"

**Cause**: IAM policy not attached or insufficient permissions.

**Fix**:
```bash
# Verify role
aws iam get-role --role-name CodeMapEC2Role

# Verify policy
aws iam list-role-policies --role-name CodeMapEC2Role

# Verify inline policy content
aws iam get-role-policy --role-name CodeMapEC2Role --policy-name CodeMapS3Access
```

### Error: "NoSuchBucket: The specified bucket does not exist"

**Cause**: Bucket name mismatch or bucket doesn't exist.

**Fix**:
```bash
# List your buckets
aws s3 ls

# Create bucket if missing
aws s3api create-bucket \
  --bucket codemap-results-YOUR_ACCOUNT_ID \
  --region us-west-2 \
  --create-bucket-configuration LocationConstraint=us-west-2
```

### Results Not Appearing in S3

**Cause**: Storage backend not configured or service not restarted.

**Fix**:
```bash
# Check configuration
cat /etc/codemap/env | grep CODEMAP_STORAGE

# Verify service restarted
sudo systemctl restart codemap
sleep 5

# Check service status
sudo systemctl status codemap

# Check logs
sudo journalctl -u codemap | grep "S3Storage"
```

### Storage Quota Exceeded

**Cause**: More than 5 GB of results or lifecycle policy not working.

**Fix**:
```bash
# Check bucket size
aws s3 ls s3://codemap-results-YOUR_ACCOUNT_ID --recursive --summarize --human-readable

# Manually delete old results
aws s3 rm s3://codemap-results-YOUR_ACCOUNT_ID/codemap/OLD_JOB_ID --recursive

# Verify lifecycle rule is enabled
aws s3api get-bucket-lifecycle-configuration --bucket codemap-results-YOUR_ACCOUNT_ID
```

## Cost Estimation

With typical usage:

- **30 jobs per month**, 100 KB each = 3 MB storage = **$0.00** (free tier)
- **200 API requests per month** = **$0.00** (free tier)
- **50 GB data transfer** = **$0.00** (free tier)

**Total**: Free within AWS Free Tier limits

If you exceed free tier:
- S3 Storage: $0.023 per GB (overage)
- API Requests: $0.0004 per 1,000 requests (overage)
- Data Transfer: $0.09 per GB (overage)

With the 30-day lifecycle policy and typical usage, you should stay well within free tier limits.

## Next Steps

1. ✅ S3 bucket created
2. ✅ Lifecycle policy configured (30-day expiration)
3. ✅ IAM permissions configured on EC2
4. ✅ CodeMap configured to use S3 storage
5. ✅ Test job submitted and verified in S3
6. See `PRODUCTION_CHECKLIST.md` for final pre-production steps

## Additional Resources

- [AWS S3 Free Tier](https://aws.amazon.com/s3/pricing/)
- [S3 Lifecycle Policies](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lifecycle-mgmt.html)
- [IAM Best Practices](https://docs.aws.amazon.com/IAM/latest/userguide/best-practices.html)
- [AWS CLI S3 Commands](https://docs.aws.amazon.com/cli/latest/reference/s3/)
