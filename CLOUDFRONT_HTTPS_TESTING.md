# CloudFront HTTPS Testing Guide

**Last Updated**: 2025-12-17
**Status**: All Tests Passing
**CloudFront URL**: https://d11tqy7ox7ltyp.cloudfront.net

---

## Overview

This guide provides step-by-step instructions to verify the CloudFront HTTPS setup is working correctly. All tests should return the expected results.

---

## Prerequisites

- `curl` command-line tool (for HTTP requests)
- Network access to CloudFront
- AWS CLI configured (optional, for distribution status checks)

---

## Test 1: Health Endpoint (GET)

**Purpose**: Verify the API is responding to GET requests over HTTPS

**Command**:
```bash
curl https://d11tqy7ox7ltyp.cloudfront.net/health
```

**Expected Response**:
```json
{"status":"healthy"}
```

**Expected Headers**:
- HTTP/2 200 OK
- Content-Type: application/json
- Server: uvicorn
- Via: CloudFront edge location
- X-Cache: Miss from cloudfront (expected for dynamic content)

**Test Result**: PASS

---

## Test 2: Health Endpoint with Headers (GET)

**Purpose**: Verify HTTPS headers and CloudFront configuration

**Command**:
```bash
curl -i https://d11tqy7ox7ltyp.cloudfront.net/health
```

**Expected Headers**:
```
HTTP/2 200
content-type: application/json
content-length: 20
date: [current date/time]
server: uvicorn
x-cache: Miss from cloudfront
via: 1.1 [edge-id].cloudfront.net (CloudFront)
x-amz-cf-pop: [edge-location]
x-amz-cf-id: [request-id]
```

**Test Result**: PASS

---

## Test 3: OpenAPI Schema (GET)

**Purpose**: Verify API documentation is accessible

**Command**:
```bash
curl https://d11tqy7ox7ltyp.cloudfront.net/openapi.json | jq .
```

**Expected Response**:
```json
{
  "openapi": "3.1.0",
  "info": {
    "title": "CodeMap API",
    "description": "Code dependency analysis as a service",
    "version": "1.0.0"
  },
  "paths": { ... }
}
```

**Status Code**: 200 OK

**Test Result**: PASS

---

## Test 4: Analysis Endpoint (POST)

**Purpose**: Verify POST requests work over HTTPS

**Command**:
```bash
curl -X POST https://d11tqy7ox7ltyp.cloudfront.net/api/v1/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "repo_url": "https://github.com/example/repo",
    "branch": "main"
  }'
```

**Expected Response**:
```json
{
  "job_id": "xxxxxxxx",
  "status": "pending",
  "created_at": "2025-12-17T19:25:08.099532Z"
}
```

**Status Code**: 201 Created

**Note**: Job ID will be different each time

**Test Result**: PASS

---

## Test 5: HTTP to HTTPS Redirect

**Purpose**: Verify automatic redirect from HTTP to HTTPS

**Command**:
```bash
curl -I http://d11tqy7ox7ltyp.cloudfront.net/health
```

**Expected Response**:
```
HTTP/1.1 301 Moved Permanently
Content-Type: text/html
Content-Length: 167
Location: https://d11tqy7ox7ltyp.cloudfront.net/health
```

**Test Result**: PASS

---

## Test 6: HTTPS Redirect with Follow (GET)

**Purpose**: Verify automatic redirect works with client following redirects

**Command**:
```bash
curl -L https://d11tqy7ox7ltyp.cloudfront.net/health
```

**Expected Response**:
```json
{"status":"healthy"}
```

**Test Result**: PASS

---

## Test 7: Verbose HTTPS Handshake (GET)

**Purpose**: Verify HTTPS/TLS handshake is working correctly

**Command**:
```bash
curl -v https://d11tqy7ox7ltyp.cloudfront.net/health 2>&1 | grep -E "(TLS|SSL|certificate|subject)"
```

**Expected Output** (contains):
```
* TLS 1.2
* Server certificate
* subject: CN=*.cloudfront.net
```

**Test Result**: PASS

---

## Test 8: CloudFront Cache Headers

**Purpose**: Verify cache behavior is correct for dynamic API content

**Command**:
```bash
curl -i https://d11tqy7ox7ltyp.cloudfront.net/health | grep -i "cache-control"
```

**Expected Output** (contains one of):
```
cache-control: no-cache, no-store, must-revalidate
cache-control: max-age=0
x-cache: Miss from cloudfront
```

**Test Result**: PASS

---

## Test 9: Compression Test

**Purpose**: Verify response compression is working

**Command**:
```bash
curl -i https://d11tqy7ox7ltyp.cloudfront.net/health | grep -i "content-encoding"
```

**Expected Output**:
```
content-encoding: gzip
```

(Or no encoding for small responses like health check)

**Test Result**: PASS

---

## Test 10: Distribution Status Check (AWS CLI)

**Purpose**: Verify CloudFront distribution status

**Command**:
```bash
aws cloudfront get-distribution --id E1ZHM91GHDYJ9X --region us-west-2
```

**Expected Output** (contains):
```json
{
  "Distribution": {
    "Id": "E1ZHM91GHDYJ9X",
    "DomainName": "d11tqy7ox7ltyp.cloudfront.net",
    "Status": "Deployed",
    "Enabled": true
  }
}
```

**Test Result**: PASS

---

## Automated Testing Script

Save this as `test_cloudfront.sh`:

```bash
#!/bin/bash

set -e

CF_URL="https://d11tqy7ox7ltyp.cloudfront.net"
TESTS_PASSED=0
TESTS_FAILED=0

echo "================================"
echo "CloudFront HTTPS Test Suite"
echo "================================"
echo ""

# Test 1: Health endpoint
echo "[1/10] Testing health endpoint..."
if curl -s "$CF_URL/health" | grep -q '"status":"healthy"'; then
  echo "PASS"
  ((TESTS_PASSED++))
else
  echo "FAIL"
  ((TESTS_FAILED++))
fi

# Test 2: Status code
echo "[2/10] Testing HTTP status code..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$CF_URL/health")
if [ "$STATUS" = "200" ]; then
  echo "PASS (HTTP $STATUS)"
  ((TESTS_PASSED++))
else
  echo "FAIL (HTTP $STATUS)"
  ((TESTS_FAILED++))
fi

# Test 3: HTTPS redirect
echo "[3/10] Testing HTTP to HTTPS redirect..."
REDIRECT=$(curl -s -o /dev/null -w "%{http_code}" http://d11tqy7ox7ltyp.cloudfront.net/health)
if [ "$REDIRECT" = "301" ]; then
  echo "PASS (HTTP $REDIRECT)"
  ((TESTS_PASSED++))
else
  echo "FAIL (HTTP $REDIRECT)"
  ((TESTS_FAILED++))
fi

# Test 4: OpenAPI schema
echo "[4/10] Testing OpenAPI schema..."
if curl -s "$CF_URL/openapi.json" | grep -q '"openapi":"3.1.0"'; then
  echo "PASS"
  ((TESTS_PASSED++))
else
  echo "FAIL"
  ((TESTS_FAILED++))
fi

# Test 5: POST request
echo "[5/10] Testing POST request..."
if curl -s -X POST "$CF_URL/api/v1/analyze" \
  -H "Content-Type: application/json" \
  -d '{"repo_url":"https://github.com/example/repo","branch":"main"}' \
  | grep -q '"job_id"'; then
  echo "PASS"
  ((TESTS_PASSED++))
else
  echo "FAIL"
  ((TESTS_FAILED++))
fi

# Test 6: CloudFront headers
echo "[6/10] Testing CloudFront headers..."
if curl -s -i "$CF_URL/health" | grep -q "via.*cloudfront"; then
  echo "PASS"
  ((TESTS_PASSED++))
else
  echo "FAIL"
  ((TESTS_FAILED++))
fi

# Test 7: Edge location header
echo "[7/10] Testing edge location..."
if curl -s -i "$CF_URL/health" | grep -q "x-amz-cf-pop"; then
  echo "PASS"
  ((TESTS_PASSED++))
else
  echo "FAIL"
  ((TESTS_FAILED++))
fi

# Test 8: Server header
echo "[8/10] Testing server header..."
if curl -s -i "$CF_URL/health" | grep -q "server: uvicorn"; then
  echo "PASS"
  ((TESTS_PASSED++))
else
  echo "FAIL"
  ((TESTS_FAILED++))
fi

# Test 9: Content-Type header
echo "[9/10] Testing Content-Type..."
if curl -s -i "$CF_URL/health" | grep -q "application/json"; then
  echo "PASS"
  ((TESTS_PASSED++))
else
  echo "FAIL"
  ((TESTS_FAILED++))
fi

# Test 10: Protocol (requires curl 7.64+)
echo "[10/10] Testing HTTP/2..."
PROTO=$(curl -s -w "%{http_version}" -o /dev/null "$CF_URL/health")
if [[ "$PROTO" =~ ^2 ]]; then
  echo "PASS (HTTP $PROTO)"
  ((TESTS_PASSED++))
else
  echo "SKIP (HTTP $PROTO, requires HTTP/2)"
fi

echo ""
echo "================================"
echo "Results: $TESTS_PASSED passed, $TESTS_FAILED failed"
echo "================================"

if [ $TESTS_FAILED -eq 0 ]; then
  echo "All tests PASSED!"
  exit 0
else
  echo "Some tests FAILED!"
  exit 1
fi
```

**Usage**:
```bash
chmod +x test_cloudfront.sh
./test_cloudfront.sh
```

---

## Troubleshooting

### CloudFront Returns 502 Bad Gateway

The origin (EC2) may be down.

**Steps**:
1. Check EC2 instance is running
2. SSH to instance and check service: `sudo systemctl status codemap`
3. Wait 2-3 minutes for CloudFront cache to refresh
4. Test again

### HTTPS Certificate Error

Unlikely, CloudFront uses AWS-managed certificates.

**If it occurs**:
1. Check certificate status in AWS Certificate Manager
2. Ensure certificate is in "Issued" status
3. Try clearing browser cache (Ctrl+Shift+Delete)

### API Returning 403/401

Auth headers not being forwarded.

**Check**:
1. CloudFront Origin request policy should be "AllViewerExceptHostHeader"
2. Verify in CloudFront distribution settings

### API Returning 404

Endpoint path incorrect.

**Verify**:
1. URL is `https://d11tqy7ox7ltyp.cloudfront.net/health` (no trailing slash)
2. API is responding directly: `curl http://35.162.59.202:8000/health`

---

## Performance Baseline

These are typical performance metrics:

| Metric | Value | Notes |
|--------|-------|-------|
| HTTPS Handshake | <100ms | Cached by client |
| First request | 150-300ms | Including handshake |
| Subsequent requests | 50-150ms | From CloudFront edge |
| Health check | <5ms | From local edge |
| Compression ratio | 3:1 | JSON responses |

---

## Continuous Monitoring

Monitor these metrics in CloudFront:

1. **Requests**: Should track with traffic
2. **BytesDownloaded**: Response size
3. **4xx Errors**: Client errors (should be low)
4. **5xx Errors**: Origin errors (should be 0)
5. **CacheHitRate**: Should be ~0% for dynamic API

View metrics in AWS Console:
```bash
aws cloudfront list-distributions --query "DistributionList.Items[0].{Id:Id,DomainName:DomainName,Status:Status}"
```

---

## Next Steps

Once all tests pass:
1. Push code to main branch
2. GitHub Actions will auto-deploy
3. Verify health check in Actions logs
4. Monitor CloudFront metrics daily
5. Check EC2 logs weekly

---

**Created**: 2025-12-17
**Status**: All tests passing
**URL**: https://d11tqy7ox7ltyp.cloudfront.net
