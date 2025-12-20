# Claude Code MCP Server Integration Guide

This guide explains how to configure Claude Code to use the CodeMap MCP Server for dependency analysis and impact assessment.

## Overview

The CodeMap MCP Server provides four powerful tools to Claude Code:

1. **get_dependents**: Find all functions that depend on a specific symbol
2. **get_impact_report**: Get a full impact analysis with risk score
3. **check_breaking_change**: Check which callers would break with signature changes
4. **get_architecture**: Get high-level architecture overview

These tools help Claude Code understand codebase structure before making changes, reducing the risk of breaking dependent code.

## Prerequisites

1. **Claude Code** (CLI tool for making code changes)
2. **CodeMap MCP Server deployed** (see [DEPLOYMENT.md](./DEPLOYMENT.md))
3. **CODE_MAP.json** uploaded for your project

## Step 1: Register for an API Key

Self-register to get an API key (no manual setup required):

```bash
curl -X POST https://codemap-mcp.mike-c63.workers.dev/register
```

Response:

```json
{
  "api_key": "cm_abc123def456...",
  "message": "Save this key - it cannot be retrieved again",
  "created_at": "2024-12-20T12:00:00Z"
}
```

**Important**: Save the API key immediately - it cannot be retrieved again if lost.

If you're using a different deployment URL:

```bash
curl -X POST https://codemap-mcp.<your-account-id>.workers.dev/register
```

### Rate Limiting

The /register endpoint has rate limiting to prevent abuse:
- Maximum 5 registrations per IP address per hour
- If you exceed this limit, wait 1 hour before trying again

## Step 2: Find Claude Code Configuration File

Claude Code uses a configuration file at:

**macOS/Linux:**
```
~/.config/Claude/claude.json
```

**Windows:**
```
%APPDATA%\Claude\claude.json
```

If the file doesn't exist, create it.

## Step 3: Add MCP Server Configuration

Use the API key from Step 1 and the production URL (`https://codemap-mcp.mike-c63.workers.dev`) or your custom deployment URL.

Add or update the `mcpServers` section in `claude.json`:

```json
{
  "mcpServers": {
    "codemap": {
      "url": "https://codemap-mcp.<account-id>.workers.dev/mcp",
      "transport": "http",
      "apiKey": "YOUR_API_KEY"
    }
  }
}
```

### Configuration Options

| Option | Description | Required |
|--------|-------------|----------|
| `url` | Full MCP endpoint URL (must end with `/mcp`) | Yes |
| `transport` | Use `"http"` for HTTP transport | Yes |
| `apiKey` | API key for authentication | Yes |

### Full Example

```json
{
  "mcpServers": {
    "codemap": {
      "url": "https://codemap-mcp.abc123def456.workers.dev/mcp",
      "transport": "http",
      "apiKey": "sk-proj-1234567890abcdefghijklmnopqrstuvwxyz"
    }
  }
}
```

## Step 4: Upload CODE_MAP.json for Your Project

Before using the MCP server with Claude Code, you need to upload your project's CODE_MAP.json.

First, generate it from your project root:

```bash
codemap analyze --output CODE_MAP.json
```

Then upload it using the API key from Step 1:

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d @CODE_MAP.json \
  https://codemap-mcp.mike-c63.workers.dev/projects/my-project/code_map
```

Replace:
- `YOUR_API_KEY` with the key from Step 1
- `my-project` with a descriptive project ID (used in MCP requests)
- URL with your deployment URL if not using the default

The `project_id` is used when making MCP requests. Use something descriptive like your project name or repository name.

## Step 5: Test the Integration

### Test Health Endpoint

```bash
curl https://codemap-mcp.<account-id>.workers.dev/health
```

Expected response:

```json
{
  "status": "healthy",
  "timestamp": "2024-12-17T10:30:45.123Z"
}
```

### Test MCP Tools

Test that the tools are available:

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

Expected response includes all 4 tools with schemas.

## Step 6: Using Claude Code with the MCP Server

Once configured, Claude Code can use the tools directly. For example:

```bash
# Claude Code initiates an analysis
claude code my-file.py
```

When Claude Code detects code changes, it can call:

```
get_impact_report(project_id="my-project", symbol="module.function")
```

To understand what will break. The MCP server responds with:

```json
{
  "symbol": "module.function",
  "affected_symbols": ["caller1", "caller2"],
  "affected_files": ["file1.py", "file2.py"],
  "risk_score": 45,
  "depth": 2
}
```

## Understanding the Tools

### get_dependents

Find all functions/methods that call or depend on a symbol.

**Request:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "get_dependents",
    "arguments": {
      "project_id": "my-project",
      "symbol": "auth.validate_user",
      "depth": 2
    }
  }
}
```

**Response:**

```json
{
  "symbol": "auth.validate_user",
  "direct": ["app.login_handler", "api.verify_session"],
  "transitive": ["app.main", "middleware.check_auth"],
  "total": 4
}
```

**Parameters:**

- `project_id` (string, required): The uploaded project ID
- `symbol` (string, required): Fully qualified symbol name (e.g., `module.function`)
- `depth` (number, optional): Maximum traversal depth (default: unlimited)

### get_impact_report

Comprehensive impact analysis when changing a symbol.

**Request:**

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "get_impact_report",
    "arguments": {
      "project_id": "my-project",
      "symbol": "auth.validate_user",
      "include_tests": false
    }
  }
}
```

**Response:**

```json
{
  "symbol": "auth.validate_user",
  "affected_symbols": ["app.login_handler", "api.verify_session"],
  "affected_files": ["app.py", "api.py"],
  "risk_score": 45,
  "depth": 2
}
```

**Parameters:**

- `project_id` (string, required): The uploaded project ID
- `symbol` (string, required): Fully qualified symbol name
- `include_tests` (boolean, optional): Include test files (default: true)

**Risk Score Scale:**

- 0-20: Low risk (isolated changes)
- 21-50: Medium risk (affects multiple modules)
- 51-80: High risk (affects core functionality)
- 81-100: Critical risk (widespread impact)

### check_breaking_change

Check which callers would break if you change the signature.

**Request:**

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "check_breaking_change",
    "arguments": {
      "project_id": "my-project",
      "symbol": "auth.validate_user",
      "new_signature": "def validate_user(user_id: str, strict_mode: bool = True) -> bool"
    }
  }
}
```

**Response:**

```json
{
  "symbol": "auth.validate_user",
  "is_breaking": true,
  "breaking_callers": ["app.login_handler"],
  "safe_callers": ["api.verify_session"],
  "suggestions": [
    "Add new parameter with default value for backward compatibility",
    "Create new function validate_user_v2() for new signature"
  ]
}
```

**Parameters:**

- `project_id` (string, required): The uploaded project ID
- `symbol` (string, required): Fully qualified symbol name
- `new_signature` (string, required): Proposed new function signature

### get_architecture

Get high-level architecture overview.

**Request:**

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": {
    "name": "get_architecture",
    "arguments": {
      "project_id": "my-project",
      "detail_level": "overview"
    }
  }
}
```

**Response:**

```json
{
  "modules": [
    {
      "name": "auth",
      "symbols": 8,
      "dependencies": ["utils", "database"],
      "dependents": ["app", "api"]
    },
    {
      "name": "app",
      "symbols": 12,
      "dependencies": ["auth", "logging"],
      "dependents": []
    }
  ],
  "total_symbols": 42,
  "total_dependencies": 128
}
```

**Parameters:**

- `project_id` (string, required): The uploaded project ID
- `detail_level` (string, optional): `"overview"` or `"detailed"` (default: "overview")

## Workflow Example

Here's how Claude Code would use these tools in practice:

1. **User**: "Update the login validation to be more strict"

2. **Claude Code**: Calls `get_impact_report("my-project", "auth.validate_user")`
   - Learns that 3 other functions depend on this
   - Gets risk score of 45

3. **Claude Code**: Calls `check_breaking_change("my-project", "auth.validate_user", new_signature)`
   - Identifies that 1 caller would break
   - Gets suggestions for backward compatibility

4. **Claude Code**: Makes changes carefully:
   - Updates the function
   - Updates the 1 affected caller
   - Adds tests for both functions

5. **Result**: Change made safely with full understanding of impact

## Troubleshooting

### Cannot register for API key

If the /register endpoint returns an error:

**429 Too Many Requests:**
```json
{
  "error": "Rate limit exceeded",
  "message": "Maximum 5 registrations per hour",
  "retry_after": 3600
}
```

Solution: Wait 1 hour and try again. Each IP address is limited to 5 registrations per hour.

**Other errors:**
1. Verify the deployment URL is correct: `curl https://codemap-mcp.mike-c63.workers.dev/health`
2. Check that the server is deployed: `npx wrangler tail` (view logs)
3. Ensure API_KEY secret is set: `npx wrangler secret list`

### Lost API key

API keys cannot be retrieved after registration. If you lose your key:

1. Register again from a different IP address or wait 1 hour
2. Use the new API key for future requests
3. Old API key will stop working (no grace period)

### MCP Server not responding

1. Check deployment: `curl https://codemap-mcp.<account-id>.workers.dev/health`
2. Verify the URL in `claude.json` is correct
3. Check the API key is correct
4. View server logs: `npx wrangler tail`

### Tools not available

1. Verify the `/mcp` endpoint is accessible
2. Check that `tools/list` returns all 4 tools
3. Look for JSON-RPC error messages in response

### Project not found

1. Verify project was uploaded: `curl https://codemap-mcp.<account-id>.workers.dev/projects/my-project/code_map`
2. Use the correct `project_id` in requests
3. Check API key is correct

### Outdated dependency information

1. Regenerate CODE_MAP.json: `codemap analyze --output CODE_MAP.json`
2. Re-upload: `curl -X POST -H "Authorization: Bearer YOUR_API_KEY" -d @CODE_MAP.json https://codemap-mcp.<account-id>.workers.dev/projects/my-project/code_map`

## Advanced Configuration

### Multiple Projects

Add multiple MCP servers or projects:

```json
{
  "mcpServers": {
    "codemap-primary": {
      "url": "https://codemap-mcp.<account-id>.workers.dev/mcp",
      "transport": "http",
      "apiKey": "primary-api-key"
    },
    "codemap-secondary": {
      "url": "https://codemap-mcp.<account-id>.workers.dev/mcp",
      "transport": "http",
      "apiKey": "secondary-api-key"
    }
  }
}
```

When using multiple servers, specify which one in the tool call:

```
get_impact_report(project_id="secondary-project", symbol="module.function")
```

### Custom Domain

If using a custom domain (see [DEPLOYMENT.md](./DEPLOYMENT.md)):

```json
{
  "mcpServers": {
    "codemap": {
      "url": "https://codemap.example.com/mcp",
      "transport": "http",
      "apiKey": "YOUR_API_KEY"
    }
  }
}
```

## Performance Tips

1. **Keep CODE_MAP.json fresh**: Regenerate after major refactoring
2. **Use appropriate depth**: Limit depth for faster queries (e.g., depth: 2)
3. **Cache results**: Claude Code may cache tool responses
4. **Monitor latency**: Check `npx wrangler tail` for slow requests

## Security Best Practices

1. **Store API key securely**:
   - Never commit API keys to git
   - Use environment variables if possible
   - Rotate keys periodically

2. **Restrict access**:
   - Consider using Cloudflare WAF rules
   - Limit API key to specific source IPs if possible
   - Monitor unusual activity in logs

3. **Data privacy**:
   - CODE_MAP.json contains only code structure
   - No personal/sensitive data should be in CODE_MAP
   - Review logs regularly for anomalies

## Next Steps

1. Register for an API key (Step 1)
2. Configure Claude Code with the setup from Step 2-3
3. Upload your project's CODE_MAP.json (Step 4)
4. Test with sample queries (Step 5)
5. Start using Claude Code with the MCP server

## Support and Feedback

For issues or feature requests:

1. Check MCP protocol: https://modelcontextprotocol.io/
2. Review logs: `npx wrangler tail`
3. Test tools manually with curl (examples in [DEPLOYMENT.md](./DEPLOYMENT.md))

---

**Version**: 1.0.0
**Last Updated**: 2024-12-17
**Status**: Production Ready

Claude Code + CodeMap = Smart, safe code changes
