# CloudFront HTTPS Configuration for CodeMap API

**Configure free HTTPS termination and global distribution using AWS CloudFront**

This guide covers creating a CloudFront distribution to provide HTTPS access to your CodeMap API running on EC2, with automatic SSL certificate management via AWS Certificate Manager.

## Overview

CloudFront provides:
- Free HTTPS/SSL termination
- Global edge caching (reduces latency)
- Free AWS-managed SSL certificates (via ACM)
- Request throttling and DDoS protection
- Forced HTTPS redirect (HTTP -> HTTPS)

**Key Architecture:**
```
Internet (HTTPS) -> CloudFront -> EC2 (HTTP:8000) -> Uvicorn
```

Traffic enters via HTTPS on CloudFront, which forwards to EC2 over HTTP (port 8000). This is safe because CloudFront-to-EC2 traffic stays within AWS.

## Prerequisites

- [ ] EC2 instance running CodeMap API (`sudo systemctl status codemap` shows active)
- [ ] EC2 instance has Elastic IP assigned
- [ ] Security group allows HTTP traffic to port 8000 from CloudFront
- [ ] API responding on port 8000 (test: `curl http://localhost:8000/health`)
- [ ] AWS Account with permissions to create CloudFront distributions and request ACM certificates

## Step 1: Get EC2 Instance Public IP

### 1.1 Find Elastic IP

1. Go to [AWS Console - EC2 Instances](https://console.aws.amazon.com/ec2/v2/home?region=us-west-2#Instances:)
2. Select your `codemap-api` instance
3. In the Details panel, find **Public IPv4 address**
   - Example: `54.212.123.45`
4. **Important**: If you don't have an Elastic IP, allocate one:
   - Go to **EC2 Dashboard > Elastic IPs**
   - Click **Allocate Elastic IP address**
   - Select your VPC
   - Click **Allocate**
   - Select the new Elastic IP
   - Click **Associate Elastic IP address**
   - Select your instance and primary network interface
5. Save this IP for use as CloudFront origin

### 1.2 Verify Security Group

Ensure security group allows traffic to port 8000 from CloudFront:

1. Select instance
2. In Details panel, click Security Group name
3. Click **Inbound rules**
4. Add rule if missing:
   - Type: HTTP
   - Port: 8000
   - Source: 0.0.0.0/0 (or restrict to CloudFront IP ranges)

## Step 2: Request Free SSL Certificate via ACM

### 2.1 Go to AWS Certificate Manager

1. Navigate to [AWS Console - Certificate Manager](https://console.aws.amazon.com/acm/home?region=us-west-2)
2. **IMPORTANT**: Ensure region is **us-west-2** (top-right dropdown)
3. Click **Request a certificate**

### 2.2 Certificate Configuration

**Certificate type**: Select **Request a public certificate**

**Domain names**:
- Add domain: `*.cloudfront.net` (wildcard for all CloudFront domains)
- This automatically covers your specific CloudFront domain (e.g., `d123abc.cloudfront.net`)

**Validation method**: Select **DNS validation**
- CloudFront automatically validates DNS for you

**Add tags** (optional):
- Key: `Application`, Value: `codemap`
- Key: `Environment`, Value: `production`

**Click "Request"**

### 2.3 Wait for Certificate Validation

The certificate will show status "Pending validation". AWS automatically validates the certificate for CloudFront domains.

**Check status:**
1. Go to [Certificate Manager](https://console.aws.amazon.com/acm/home?region=us-west-2)
2. Look for your certificate in the list
3. Status should change to **Issued** within minutes
4. Once **Issued**, you can use it in CloudFront

**Note**: You can proceed to Step 3 while waiting for certificate validation (may take 5-15 minutes).

## Step 3: Create CloudFront Distribution

### 3.1 Go to CloudFront Console

1. Navigate to [AWS Console - CloudFront](https://console.aws.amazon.com/cloudfront/v4/home)
2. Click **Create a distribution**

### 3.2 Distribution Configuration

**Origin Configuration**:

1. **Origin domain**: Enter your EC2 Elastic IP
   - Example: `54.212.123.45`
   - CloudFront will add `:80` automatically for HTTP

2. **Origin name**: Auto-filled (keep default or change to `codemap-origin`)

3. **Protocol**: Select **HTTP only**
   - CloudFront handles HTTPS to clients
   - EC2 backend uses HTTP (port 8000)

4. **HTTP port**: Change to `8000`
   - Default is 80, but CodeMap runs on 8000

5. **Port 8000**: Ensure it's selected

**Viewer Protocol Policy**:

1. Scroll down to find **Viewer Protocol Policy**
2. Select **Redirect HTTP to HTTPS**
   - Forces all HTTP requests to HTTPS
   - Best security practice

**Cache Behavior Settings**:

1. **Cache key and origin requests**:
   - Click to expand this section
   - Under "Cache policy", select **Caching Disabled**
   - This prevents caching of API responses

2. **Origin request policy**:
   - Select **AllViewerExceptHostHeader** (or **AllViewer**)
   - This forwards all headers to EC2 (needed for API headers)

3. **Compress objects automatically**: Keep enabled

**Allowed HTTP Methods**:

1. Scroll to "Allowed HTTP methods"
2. Select **GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE**
   - Allows full API operations

**Response Headers Policy** (optional):

1. Click **Response headers policy**
2. Select **Managed-SecurityHeadersPolicy** (recommended)
   - Adds security headers

### 3.3 Distribution Details

**Default root object**:
- Leave empty (API doesn't have a root object)

**Alternate domain names** (optional):

If you have a custom domain (e.g., `api.yourdomain.com`), add it:
1. Click in "Alternate domain name" field
2. Enter your custom domain
3. You must have an SSL certificate for this domain
4. Skip this if using CloudFront default domain

**Custom SSL certificate**:

1. Under "Custom SSL certificate", click the dropdown
2. Select the certificate you requested in Step 2
3. It will show: `*.cloudfront.net` or your custom domain
4. If certificate not showing, it may still be validating (wait 5-10 minutes)

**Logging** (optional):

Enable logging to S3 to monitor CloudFront requests:
1. Check "Enable logging"
2. Bucket: Create new bucket `codemap-cloudfront-logs-ACCOUNT-ID`
3. Prefix: `cloudfront/`

### 3.4 Create Distribution

Click **Create distribution**

**Wait for deployment**: Status will show **Deploying** (usually 5-15 minutes)

Monitor progress in the distributions list. Once status changes to **Enabled**, your CloudFront domain is ready.

## Step 3.5: Configure Custom Error Responses (Optional)

CloudFront can display custom error pages when the origin is unavailable.

### 3.5.1 Create Custom Error Responses

1. In CloudFront distribution settings, find **Error responses**
2. Click **Create custom error response**

**For 502 Bad Gateway (origin down):**

- HTTP error code: **502**
- Error caching minimum TTL: **60** (cache error for 60 seconds)
- Customize error response: **Yes**
- Response page path: `/error502.html` (optional, or leave default)
- HTTP response code: **502** (keep same as error)

This prevents CloudFront from hammering a dead origin with requests.

**For 503 Service Unavailable:**

- HTTP error code: **503**
- Error caching minimum TTL: **30**

### 3.5.2 Custom Error Content

You can serve custom HTML files on error. To use custom errors:

1. Create error pages (e.g., `/error502.html`) in your CodeMap API
2. In error response config, set Response page path
3. CloudFront will fetch and serve this page when errors occur

**Example error page to add to your API:**

Create `/opt/codemap/error502.html`:
```html
<!DOCTYPE html>
<html>
<head>
    <title>CodeMap API - Service Unavailable</title>
</head>
<body>
    <h1>502 - Bad Gateway</h1>
    <p>The CodeMap API is temporarily unavailable.</p>
    <p>Please try again in a few moments.</p>
</body>
</html>
```

Then in CloudFront, set Response page path to `/error502.html`.

## Step 3.6: Configure Health Check (Optional but Recommended)

CloudFront health checks monitor your origin and remove it from rotation if unhealthy.

### 3.6.1 Create Health Check

1. Go to [CloudFront Distributions](https://console.aws.amazon.com/cloudfront/v4/home)
2. Select your distribution
3. Click **Origins** tab
4. Select your origin
5. Click **Edit**

### 3.6.2 Health Check Settings

Under **Origin custom headers** section:

- **Health checks enabled**: **Yes**
- **Health check path**: `/health`
- **Protocol**: **HTTP**
- **Port**: **8000**
- **Interval**: **30** seconds
- **Failure threshold**: **3** (remove origin after 3 failed checks)
- **Timeout**: **4** seconds

This configuration:
- Checks `/health` endpoint every 30 seconds
- Removes origin from rotation if 3 checks fail in a row
- Uses 4-second timeout (must respond within 4 seconds)
- Falls back to origin if health improves

### 3.6.3 Monitor Health Status

1. Go to CloudFront distribution
2. Click **Origins** tab
3. Check **Status** column
4. Should show **Healthy** in green

**What makes an origin unhealthy:**

- API not responding to `/health`
- Response code is not 200
- Response takes > 4 seconds
- 3 consecutive failures

**If unhealthy:**

1. SSH into EC2
2. Check service: `sudo systemctl status codemap`
3. Review logs: `sudo journalctl -u codemap -n 50`
4. Restart: `sudo systemctl restart codemap`
5. CloudFront will detect health recovery

### 3.6.4 Health Check Best Practices

1. Ensure `/health` endpoint:
   - Returns 200 status code
   - Responds quickly (< 1 second)
   - Is lightweight (doesn't trigger heavy processing)
   - Never requires authentication

2. Monitor health check frequency:
   - 30-second interval = 2,880 checks/day
   - Included in API metrics
   - Should not significantly impact quota

## Step 4: Test CloudFront Endpoint

### 4.1 Get CloudFront Domain

1. Go to [CloudFront Distributions](https://console.aws.amazon.com/cloudfront/v4/home)
2. Select your distribution
3. Copy the **Distribution domain name** (e.g., `d123abc.cloudfront.net`)

### 4.2 Test Health Endpoint

```bash
# Test via HTTP (will redirect to HTTPS)
curl -L http://d123abc.cloudfront.net/health

# Test via HTTPS directly
curl https://d123abc.cloudfront.net/health

# Should return:
# {"status":"healthy"}

# Test with verbose output to see redirect
curl -v https://d123abc.cloudfront.net/health

# Test with headers
curl -i https://d123abc.cloudfront.net/health
```

### 4.3 Test API Documentation

```bash
# Access Swagger UI
curl https://d123abc.cloudfront.net/docs

# Access ReDoc
curl https://d123abc.cloudfront.net/redoc

# Get OpenAPI schema
curl https://d123abc.cloudfront.net/openapi.json | jq
```

### 4.4 Test API Endpoints

```bash
# Test analyze endpoint
curl -X POST https://d123abc.cloudfront.net/analyze \
  -H "Content-Type: application/json" \
  -d '{"repo_url":"https://github.com/example/repo","branch":"main"}'

# Get results (if job_id available)
curl https://d123abc.cloudfront.net/results/{job_id}
```

## Step 5: Configure Custom Domain (Optional)

If you own a domain, you can use it instead of CloudFront's default `*.cloudfront.net`:

### 5.1 Request Custom Domain Certificate

1. Go to [Certificate Manager](https://console.aws.amazon.com/acm/home?region=us-west-2)
2. Click **Request a certificate**
3. Enter your domain: `api.yourdomain.com`
4. Use DNS validation
5. Add DNS CNAME record in your domain registrar (AWS provides instructions)

### 5.2 Update CloudFront Distribution

1. Go to [CloudFront Distributions](https://console.aws.amazon.com/cloudfront/v4/home)
2. Select your distribution
3. Click **Edit**
4. Under **Alternate domain names (CNAMEs)**, add: `api.yourdomain.com`
5. Under **Custom SSL certificate**, select your certificate
6. Click **Save changes**

### 5.3 Point Domain to CloudFront

In your domain registrar DNS settings, create a CNAME record:

**Type**: CNAME
**Name**: `api`
**Value**: `d123abc.cloudfront.net` (your CloudFront domain)

Example (for Route 53):
```
Name: api.yourdomain.com
Type: CNAME
Value: d123abc.cloudfront.net
TTL: 300
```

### 5.4 Test Custom Domain

```bash
curl https://api.yourdomain.com/health
```

## Step 6: Configure Cache Behavior

### 6.1 Review Cache Settings

CloudFront should be configured to NOT cache API responses. To verify:

1. Go to CloudFront distribution
2. Click **Behaviors** tab
3. Select the default behavior (path: `*`)
4. Click **Edit**
5. Verify:
   - **Cache policy**: `Caching Disabled`
   - **Allowed HTTP methods**: `GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE`

### 6.2 Customize Cache Per Path (Optional)

For advanced caching (e.g., cache `/docs`, but not `/analyze`):

1. Create additional behaviors:
   - Path pattern: `/docs`
   - Cache policy: `Managed-CachingOptimized`
   - Allowed methods: `GET, HEAD`

2. CloudFront applies most-specific path first, so `/docs` uses its policy, others use default

3. When finished, the default behavior (`*`) should still have caching disabled

## Step 7: Security and Monitoring

### 7.1 Enable Security Headers

These are set automatically if you selected the managed security headers policy. Verify:

1. Go to CloudFront distribution > **Response headers policies**
2. Should show `Managed-SecurityHeadersPolicy`

Headers included:
- `Strict-Transport-Security` (enforce HTTPS)
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection`

### 7.2 Enable CloudFront Logging

Monitor requests and troubleshoot issues:

1. Go to distribution > **General** tab
2. Click **Edit**
3. Under **Standard logging** (for CloudFront requests):
   - Enable logging to S3 bucket
   - Create bucket: `codemap-logs-ACCOUNT-ID`
   - Prefix: `cloudfront-requests/`

### 7.3 Set Up CloudWatch Monitoring

Monitor CloudFront metrics:

1. Go to [CloudWatch Console](https://console.aws.amazon.com/cloudwatch/home?region=us-west-2)
2. Click **Metrics** > **CloudFront**
3. View metrics:
   - **Requests**: Total requests
   - **BytesDownloaded**: Data sent to users
   - **BytesUploaded**: Data received from users
   - **4xxErrorRate**: Client errors
   - **5xxErrorRate**: Origin errors

### 7.4 Create CloudWatch Alarms

Alert on issues:

```
Create alarm: High 5xx Error Rate
- Metric: 5xxErrorRate
- Threshold: > 5%
- Evaluation period: 5 minutes
- Action: Send SNS notification
```

See [cloudwatch-alarms.md](./cloudwatch-alarms.md) for details.

## Step 8: Troubleshooting

### CloudFront Shows 502 Bad Gateway

**Cause**: Origin (EC2) is unreachable

**Fix**:
```bash
# 1. Check EC2 instance status
sudo systemctl status codemap

# 2. Check if port 8000 is listening
sudo netstat -tlnp | grep 8000

# 3. Check security group allows port 8000
# EC2 Dashboard > Security Groups > Inbound Rules
# Should have: Type=HTTP, Port=8000, Source=0.0.0.0/0

# 4. Restart service
sudo systemctl restart codemap

# 5. Wait 2-3 minutes for CloudFront cache to update
# Then test again
curl https://d123abc.cloudfront.net/health
```

### Certificate Shows "Pending Validation"

**Cause**: ACM still validating certificate

**Fix**:
- Wait 5-15 minutes for AWS to validate
- Check status in [Certificate Manager](https://console.aws.amazon.com/acm/home?region=us-west-2)
- Once status is **Issued**, it will appear in CloudFront's SSL certificate dropdown

### HTTP Requests Not Redirecting to HTTPS

**Cause**: Viewer protocol policy not set to redirect

**Fix**:
1. Go to CloudFront distribution > **Behaviors**
2. Select default behavior
3. Click **Edit**
4. Under **Viewer Protocol Policy**, select **Redirect HTTP to HTTPS**
5. Click **Save**

### API Returns 503 Service Unavailable

**Cause**: Origin request policy not forwarding headers

**Fix**:
1. Go to distribution > **Behaviors**
2. Select default behavior > **Edit**
3. Under **Origin request policy**, select **AllViewerExceptHostHeader**
4. Click **Save**

## Performance Optimization

### 7.1 Verify Cache Settings

Ensure API responses aren't cached:

```bash
# Test cache control headers
curl -i https://d123abc.cloudfront.net/health | grep -i cache

# Should show:
# Cache-Control: no-cache, no-store, must-revalidate
# OR similar headers indicating no caching
```

### 7.2 Monitor Request Latency

In CloudFront distribution metrics, check:
- **Origin latency**: Time for EC2 to respond
- Should be < 100ms typically
- Spikes indicate EC2 is overloaded

### 7.3 Compression

CloudFront should automatically compress responses:

```bash
# Check if response is compressed
curl -i https://d123abc.cloudfront.net/health | grep -i encoding

# Should show:
# Content-Encoding: gzip
```

## Cost Monitoring

### Monitor Free Tier Usage

CloudFront is free up to:
- 1 TB of data transfer out per month
- 10 million HTTP/HTTPS requests per month

**Check usage in AWS Billing**:

1. Go to [AWS Billing Console](https://console.aws.amazon.com/billing/home)
2. Click **Bills** > current month
3. Find **CloudFront** line item
4. Should show $0.00 if within free tier limits

**Monitor per-distribution**:

1. Go to CloudFront distribution
2. Click **Metrics** tab
3. View: Requests, BytesDownloaded, BytesUploaded

### Alerts for Free Tier

Set up alerts in Billing Console:
1. Go to [Billing Preferences](https://console.aws.amazon.com/billing/home?#/preferences)
2. Enable **Free Tier Usage Alerts**
3. Add email
4. Set threshold (recommended: $5.00)

## Next Steps

1. **GitHub Actions Deployment** → See [.github/workflows/deploy.yml](./../.github/workflows/deploy.yml)
2. **Production Checklist** → See [PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md)
3. **Monitoring** → See [cloudwatch-alarms.md](./cloudwatch-alarms.md)
4. **Custom Domain** → Follow Step 5 in this guide

## Maintenance

### Update Certificate Before Expiration

AWS automatically renews ACM certificates, so no action needed. CloudFront will use the renewed certificate automatically.

**Verify certificate renewal:**
1. Go to [Certificate Manager](https://console.aws.amazon.com/acm/home?region=us-west-2)
2. Check certificate status (should show **Issued**)
3. If status changes, CloudFront automatically uses renewed certificate

### Invalidate CloudFront Cache

If you need to clear cached content before TTL expires:

1. Go to CloudFront distribution
2. Click **Invalidations** tab
3. Click **Create invalidation**
4. Path: `/*` (invalidate all)
5. Click **Create invalidation**

**Use cases for invalidation:**
- After emergency code fixes
- When security headers change
- When testing cache behavior

### Monitor CloudFront Logs

Review access logs to troubleshoot issues:

1. Go to S3 bucket: `codemap-logs-ACCOUNT-ID`
2. View log files in `cloudfront-requests/` prefix
3. Analyze requests and responses

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                       Internet (HTTPS)                          │
└────────────────────┬──────────────────────────────────────────┘
                     │
                     ▼
        ┌─────────────────────────────────┐
        │   CloudFront (HTTPS)            │
        │   d123abc.cloudfront.net        │
        │   + Free SSL/TLS Certificate    │
        │   + Global Edge Locations       │
        │   + DDoS Protection             │
        │   + No caching for API          │
        │   + Compress responses          │
        └─────────────┬────────────────────┘
                      │ HTTP (port 8000)
        ┌─────────────▼────────────────────┐
        │  EC2 t2.micro (us-west-2)       │
        │  54.212.123.45                  │
        │  + Elastic IP                   │
        │  + Security Group (port 8000)   │
        │  + Systemd Service              │
        │  ┌─────────────────────────┐    │
        │  │ Uvicorn (2 workers)     │    │
        │  │ ┌───────────────────┐   │    │
        │  │ │ FastAPI App       │   │    │
        │  │ │ /health /docs     │   │    │
        │  │ │ /analyze /results │   │    │
        │  │ └───────────────────┘   │    │
        │  └─────────────────────────┘    │
        │  /opt/codemap/                  │
        │  /opt/codemap/results/          │
        │  /etc/codemap/env               │
        └─────────────────────────────────┘
```

## Additional Resources

- [AWS CloudFront Documentation](https://docs.aws.amazon.com/cloudfront/)
- [AWS Certificate Manager](https://docs.aws.amazon.com/acm/)
- [CloudFront Best Practices](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/BestPractices.html)
- [CodeMap API Documentation](https://github.com/your-username/codemap)

---

**Last Updated**: 2024-12-17
**Version**: 1.0.0
**Region**: us-west-2
**Architecture**: CloudFront -> EC2 (free tier optimized)
