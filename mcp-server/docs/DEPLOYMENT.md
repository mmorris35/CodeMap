# CodeMap MCP Server - Deployment Guide

This guide walks through deploying the CodeMap MCP Server to Cloudflare Workers.

## Prerequisites

- **Cloudflare account** (free tier supported)
- **Wrangler CLI** installed: `npm install -g wrangler` or `npx wrangler`
- **Node.js 18+** and npm 10+
- **CodeMap project built**: Run from `mcp-server/` directory

## Step 1: Authenticate with Cloudflare

Authenticate your Cloudflare account with wrangler:

```bash
npx wrangler login
```

This opens a browser to authorize wrangler. After authorization, your credentials are stored locally in `~/.wrangler/config.toml`.

## Step 2: Create KV Namespace (Production)

Create a production KV namespace for storing CODE_MAP.json files:

```bash
cd mcp-server
npx wrangler kv:namespace create CODEMAP_KV
```

Wrangler will output something like:

```
🌀  Creating namespace with title "codemap-mcp-CODEMAP_KV"
✅  Successfully created namespace with ID: abc123def456...
```

Copy the namespace ID returned by the command.

### Create Preview Namespace

Also create a preview namespace for testing:

```bash
npx wrangler kv:namespace create CODEMAP_KV --preview
```

## Step 3: Update wrangler.toml

Update `mcp-server/wrangler.toml` with the actual KV namespace IDs:

```toml
[[kv_namespaces]]
binding = "CODEMAP_KV"
id = "your-production-namespace-id"
preview_id = "your-preview-namespace-id"
```

Replace the placeholder IDs with the values from Step 2.

## Step 4: Set API Key Secret

Set the API_KEY secret used by the /register endpoint to generate new API keys:

```bash
cd mcp-server
npx wrangler secret put API_KEY
```

Wrangler will prompt you to enter the secret value. This secret is used internally by the /register endpoint - users do not need to know it. Use a strong random string:

```bash
# Generate a secure secret (example)
openssl rand -base64 32
```

Also set it for the production environment:

```bash
npx wrangler secret put API_KEY --env production
```

**Note**: This is different from user API keys. The API_KEY secret is internal to the server and used to authenticate the /register endpoint for generating user API keys.

## Step 5: Deploy to Cloudflare

Build and deploy the worker:

```bash
cd mcp-server
npm run build
npm run deploy
```

Wrangler will compile and upload the worker. Output will show:

```
✅  Successfully published your script to:
https://codemap-mcp.<account-id>.workers.dev
```

Save the deployment URL - you'll need it for testing and Claude Code integration.

## Step 5.5: Enable Self-Service API Key Registration

The /register endpoint is now available for users to self-register for API keys without needing manual setup via wrangler.

Users can register by making a POST request:

```bash
curl -X POST https://codemap-mcp.<account-id>.workers.dev/register
```

This removes the burden of distributing API keys - users can generate their own. Each IP is rate-limited to 5 registrations per hour.

## Step 6: Verify Deployment

Test the health endpoint:

```bash
curl https://codemap-mcp.<account-id>.workers.dev/health
```

Expected response (200 OK):

```json
{
  "status": "healthy",
  "timestamp": "2024-12-17T10:30:45.123Z"
}
```

Test the ready endpoint (checks KV connectivity):

```bash
curl https://codemap-mcp.<account-id>.workers.dev/health/ready
```

Expected response (200 OK):

```json
{
  "status": "ready",
  "kv": "connected"
}
```

## Step 7: Test Registration Endpoint

Test the /register endpoint to verify API key generation works:

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  https://codemap-mcp.<account-id>.workers.dev/register
```

Expected response (201 Created):

```json
{
  "api_key": "cm_...",
  "message": "Save this key - it cannot be retrieved again",
  "created_at": "2024-12-20T12:00:00Z"
}
```

Save the returned API key for testing.

### Test Rate Limiting

The /register endpoint rate-limits requests to prevent abuse. Call it 6 times quickly from the same IP to trigger rate limiting:

```bash
# This should return 429 Too Many Requests after 5 calls
for i in {1..6}; do
  curl -X POST https://codemap-mcp.<account-id>.workers.dev/register
done
```

Expected 429 response:

```json
{
  "error": "Rate limit exceeded",
  "message": "Maximum 5 registrations per hour",
  "retry_after": 3600
}
```

## Step 8: Test MCP Protocol

Test the MCP endpoint with a tools/list request:

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list",
    "params": {}
  }' \
  https://codemap-mcp.<account-id>.workers.dev/mcp
```

Expected response:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [
      {
        "name": "get_dependents",
        "description": "Get all functions that depend on a symbol",
        "inputSchema": { ... }
      },
      ...
    ]
  }
}
```

## Step 9: Upload Test CODE_MAP.json

Use the API key from Step 7 to upload a test project CODE_MAP.json:

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d @path/to/code_map.json \
  https://codemap-mcp.<account-id>.workers.dev/projects/test-project/code_map
```

Response:

```json
{
  "success": true,
  "project_id": "test-project",
  "symbols_count": 42,
  "dependencies_count": 128
}
```

## Step 10: Test All MCP Tools

### Test get_dependents

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "get_dependents",
      "arguments": {
        "project_id": "test-project",
        "symbol": "some.function"
      }
    }
  }' \
  https://codemap-mcp.<account-id>.workers.dev/mcp
```

### Test get_impact_report

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "get_impact_report",
      "arguments": {
        "project_id": "test-project",
        "symbol": "some.function"
      }
    }
  }' \
  https://codemap-mcp.<account-id>.workers.dev/mcp
```

### Test check_breaking_change

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "check_breaking_change",
      "arguments": {
        "project_id": "test-project",
        "symbol": "some.function",
        "new_signature": "def new_signature(a: int) -> str"
      }
    }
  }' \
  https://codemap-mcp.<account-id>.workers.dev/mcp
```

### Test get_architecture

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "get_architecture",
      "arguments": {
        "project_id": "test-project",
        "detail_level": "overview"
      }
    }
  }' \
  https://codemap-mcp.<account-id>.workers.dev/mcp
```

## Monitoring and Logs

View deployment logs:

```bash
npx wrangler tail
```

This streams real-time logs from your worker. Useful for debugging issues.

## Rollback

To rollback to a previous deployment:

1. Revert code changes: `git revert <commit-hash>`
2. Rebuild and redeploy: `npm run build && npm run deploy`

## Custom Domain (Optional)

To use a custom domain instead of `*.workers.dev`:

1. In Cloudflare dashboard, go to Workers Routes
2. Add a route for your domain
3. Set the script to `codemap-mcp`

Example route: `codemap.example.com/mcp*`

## Performance Optimization

The worker respects Cloudflare's limits:

- **Memory**: 128MB (strict)
- **CPU Time**: 30s (paid) / 10ms (free)
- **KV Latency**: ~200ms avg (acceptable for MCP)
- **Response Size**: <6MB typical

Current implementation is optimized for:

- Minimal parsing overhead
- Single KV lookup per request
- Efficient graph traversal with BFS

For large CODE_MAP.json files (>10MB), consider:

- Splitting projects into smaller modules
- Caching frequent queries in KV
- Using Durable Objects for persistent caches

## Troubleshooting

### Worker returns 401 Unauthorized

Ensure the API_KEY is set correctly:

```bash
npx wrangler secret list
```

Verify the client sends the correct API key in the Authorization header:

```
Authorization: Bearer YOUR_API_KEY
```

### KV Namespace not found

Verify the namespace ID in wrangler.toml matches the created namespace:

```bash
npx wrangler kv:namespace list
```

Update wrangler.toml if IDs don't match, then redeploy.

### Deployment fails

Check that all dependencies are installed:

```bash
npm install
npm run typecheck
```

Verify wrangler is authenticated:

```bash
npx wrangler whoami
```

### High latency from clients

KV latency varies by region (~100-300ms). To optimize:

- Enable caching in MCP requests (future enhancement)
- Use regional KV replication if available
- Consider Durable Objects for hot data

## Environment-Specific Configuration

### Development

Runs locally with:

```bash
npm run dev
```

Uses `.dev.vars` for environment variables. See `.dev.vars.example`.

### Production

Deployed via:

```bash
npm run deploy
```

Uses secrets and environment variables from Cloudflare dashboard.

Set production-specific vars:

```bash
npx wrangler secret put API_KEY --env production
```

## Security Considerations

1. **API Key Management**:
   - The `API_KEY` secret (from Step 4) is internal to the server and is NOT distributed to users
   - Users generate their own API keys via the /register endpoint
   - User-generated API keys are stored as salted hashes in KV for security
   - User API keys cannot be retrieved from the server after creation
   - Rotate the internal `API_KEY` secret periodically

2. **User API Key Generation**:
   - Users can self-register without contacting administrators
   - Rate limiting (5 per IP per hour) prevents abuse
   - Each key is cryptographically secure (256+ bits entropy)
   - Keys are prefixed with `cm_` for identification
   - Lost keys cannot be recovered - users must register again

3. **CORS**:
   - Currently allows all origins (see `mcp-server/src/router.ts`)
   - Consider restricting in production to known origins

4. **Rate Limiting**:
   - Implemented on /register endpoint (5 per IP per hour)
   - Consider using Cloudflare WAF for additional rate limiting on other endpoints

5. **Data Privacy**:
   - CODE_MAP.json contains only code structure (no PII)
   - User data isolated via API key hashing
   - KV data encrypted at rest by Cloudflare

## Next Steps

- Configure Claude Code to use the MCP server (see [CLAUDE_CODE_SETUP.md](./CLAUDE_CODE_SETUP.md))
- Set up monitoring and alerting
- Plan for auto-scaling and load balancing
- Consider custom domain for production

## Support

For issues or questions:

1. Check wrangler logs: `npx wrangler tail`
2. Review Cloudflare dashboard: https://dash.cloudflare.com/
3. Check MCP specification: https://modelcontextprotocol.io/
4. File issues on GitHub

---

**Deployed at**: `https://codemap-mcp.<account-id>.workers.dev`
**Last Updated**: 2024-12-17
**Status**: Production Ready
