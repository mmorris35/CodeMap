# CodeMap MCP Server

[![Deployed on Cloudflare Workers](https://img.shields.io/badge/deployed%20on-Cloudflare%20Workers-f38020?logo=cloudflare)](https://workers.cloudflare.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178c6?logo=typescript)](https://www.typescriptlang.org/)
[![MCP Protocol](https://img.shields.io/badge/MCP%20Protocol-1.0-4a7c59)](https://modelcontextprotocol.io/)

An MCP (Model Context Protocol) server deployed on Cloudflare Workers that provides dependency analysis and impact assessment tools for Claude Code and other MCP-compatible clients.

## Overview

CodeMap MCP Server exposes CODE_MAP.json dependency data as MCP tools, allowing Claude Code to analyze project dependencies before making code changes. It runs as a serverless function on Cloudflare's global edge network.

## Features

- **MCP Tools** for dependency analysis:
  - `get_dependents`: Find all functions that depend on a symbol
  - `get_impact_report`: Full impact analysis with risk score
  - `check_breaking_change`: Check which callers would break with signature changes
  - `get_architecture`: Get high-level architecture overview
- **Multi-tenant**: User isolation via API key hashing
- **Low latency**: Runs on Cloudflare edge globally
- **KV caching**: Fast lookups via Cloudflare KV
- **TypeScript**: Strict type safety

## Prerequisites

- Node.js 18+ and npm 10+
- Cloudflare account (free tier works)
- Wrangler CLI installed globally: `npm install -g wrangler`

## Getting Started

### 1. Register for an API Key

New users can self-register for an API key without manual setup:

```bash
curl -X POST https://codemap-mcp.mike-c63.workers.dev/register
```

Response:

```json
{
  "api_key": "cm_abc123...",
  "message": "Save this key - it cannot be retrieved again",
  "created_at": "2024-12-20T12:00:00Z"
}
```

Save the returned `api_key` securely - it cannot be retrieved again if lost.

### 2. Upload Your CODE_MAP.json

Generate your project's CODE_MAP.json (see [CodeMap CLI documentation](../)) and upload it:

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d @CODE_MAP.json \
  https://codemap-mcp.mike-c63.workers.dev/projects/my-project/code_map
```

Replace `YOUR_API_KEY` with the key from Step 1 and `my-project` with your project name.

### 3. Start Using the Tools

Configure Claude Code (see [CLAUDE_CODE_SETUP.md](./docs/CLAUDE_CODE_SETUP.md)) and start analyzing dependencies:

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
        "project_id": "my-project",
        "symbol": "module.function"
      }
    }
  }' \
  https://codemap-mcp.mike-c63.workers.dev/mcp
```

## Local Development

### Setup

1. Install dependencies:

```bash
cd mcp-server
npm install
```

2. Create `.dev.vars` from example:

```bash
cp .dev.vars.example .dev.vars
```

3. For local development, generate a test API key:

```bash
# Generate a secure random key for testing
node -e "console.log('cm_' + require('crypto').randomBytes(24).toString('base64').replace(/[+/]/g, m => m === '+' ? '-' : '_').substring(0, 30))"
```

Update `.dev.vars` with the generated key:

```bash
API_KEY=cm_your-generated-key
ENVIRONMENT=development
```

### Running Locally

Start the development server:

```bash
npm run dev
```

The worker runs at `http://localhost:8787`

Test it:

```bash
curl http://localhost:8787/health
```

Response:

```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:45.123Z"
}
```

### Building

Compile TypeScript:

```bash
npm run build
```

Type check without building:

```bash
npm run typecheck
```

### Testing

Run test suite:

```bash
npm test
```

With coverage report:

```bash
npm run test:coverage
```

## Project Structure

```
mcp-server/
├── src/
│   ├── index.ts                  # Worker entry point
│   ├── router.ts                 # Hono app with routes
│   ├── types.ts                  # Shared TypeScript types
│   ├── storage.ts                # KV wrapper
│   ├── storage.test.ts           # Storage tests
│   ├── auth.ts                   # API key generation and hashing
│   ├── routes/
│   │   ├── register.ts           # Self-service API key registration
│   │   └── register.test.ts      # Registration endpoint tests
│   └── mcp/                      # MCP protocol implementation
│       ├── handler.ts
│       ├── types.ts
│       ├── resources.ts
│       └── tools/
│           ├── get-dependents.ts
│           ├── get-impact-report.ts
│           ├── check-breaking-change.ts
│           └── get-architecture.ts
├── docs/
│   ├── DEPLOYMENT.md             # Deployment guide
│   └── CLAUDE_CODE_SETUP.md      # Claude Code integration guide
├── package.json
├── tsconfig.json
├── wrangler.toml
├── .gitignore
├── .dev.vars.example
└── README.md
```

## API Endpoints

### Health Check

**GET /health**

```bash
curl http://localhost:8787/health
```

Response:

```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:45.123Z"
}
```

### API Info

**GET /**

```bash
curl http://localhost:8787/
```

Response:

```json
{
  "name": "CodeMap MCP Server",
  "version": "1.0.0",
  "endpoints": ["/health", "/health/ready", "/register", "/mcp", "/projects"],
  "environment": "development"
}
```

### Register for API Key

**POST /register**

Self-service API key registration (no authentication required):

```bash
curl -X POST https://codemap-mcp.mike-c63.workers.dev/register
```

Response:

```json
{
  "api_key": "cm_abc123...",
  "message": "Save this key - it cannot be retrieved again",
  "created_at": "2024-12-20T12:00:00Z"
}
```

Rate limiting: Maximum 5 registrations per IP per hour. Exceeding this returns 429 Too Many Requests.

### MCP Protocol

**POST /mcp**

Send JSON-RPC 2.0 requests following the MCP specification. See [MCP Protocol Implementation](#mcp-protocol-implementation) section.

### Project Management

**POST /projects/{project_id}/code_map**

Upload a CODE_MAP.json file (requires API key):

```bash
curl -X POST \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d @code_map.json \
  http://localhost:8787/projects/my-app/code_map
```

## MCP Protocol Implementation

The server implements JSON-RPC 2.0 for MCP protocol compliance.

### Request Format

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list",
  "params": {}
}
```

### Response Format

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
      }
    ]
  }
}
```

### Available Tools

See individual tool documentation in `/mcp/tools/`.

## Deployment

For complete deployment instructions, see [**docs/DEPLOYMENT.md**](./docs/DEPLOYMENT.md).

Quick start:

```bash
# 1. Authenticate with Cloudflare
npx wrangler login

# 2. Create KV namespace
npx wrangler kv:namespace create CODEMAP_KV
npx wrangler kv:namespace create CODEMAP_KV --preview

# 3. Update wrangler.toml with the namespace IDs

# 4. Set API key secret (used for the /register endpoint)
npx wrangler secret put API_KEY

# 5. Deploy
npm run deploy
```

The worker will be available at: `https://codemap-mcp.<account-id>.workers.dev`

After deployment, users can self-register for API keys:

```bash
curl -X POST https://codemap-mcp.<account-id>.workers.dev/register
```

### Claude Code Integration

After deployment, configure Claude Code to use the MCP server. See [**docs/CLAUDE_CODE_SETUP.md**](./docs/CLAUDE_CODE_SETUP.md) for detailed integration instructions.

Example configuration:

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

## Configuration

### wrangler.toml

Key configuration options:

- `name`: Worker name (must be unique within Cloudflare account)
- `main`: Entry point file
- `compatibility_date`: Cloudflare runtime version
- `kv_namespaces`: Bindings to KV storage
- `vars`: Environment variables

### Environment Variables

- `ENVIRONMENT`: "development" or "production"
- `API_KEY`: Expected API key for requests (set via secret)

## TypeScript Configuration

The project uses TypeScript strict mode:

- `strict: true` - All strict type checking options enabled
- `noUnusedLocals: true` - Error on unused variables
- `noUnusedParameters: true` - Error on unused parameters
- `noImplicitReturns: true` - Error on missing return statements

## Security

- **API Key Authentication**: All requests to `/projects/*` and `/mcp` endpoints require API key
- **User Isolation**: KV keys scoped by user ID (derived from API key hash)
- **Input Validation**: All external input validated with Zod
- **No PII Stored**: CODE_MAP.json contains only code structure (symbols, dependencies, file paths)

## Limits

Cloudflare Workers has limits:

- **Memory**: 128MB
- **CPU Time**: 30s (paid) / 10ms (free)
- **KV Value Size**: 25MB per entry
- **Request Body**: 100MB

All requests must complete within CPU time limits.

## Troubleshooting

### Port already in use

If port 8787 is already in use:

```bash
npm run dev -- --port 8788
```

### KV Namespace not found

Ensure KV namespace is created and ID matches in `wrangler.toml`:

```bash
wrangler kv:namespace list
```

### TypeScript errors

Run type checking:

```bash
npm run typecheck
```

Fix any issues before deploying.

### Tests failing

Run tests with verbose output:

```bash
npm test -- --reporter=verbose
```

## Testing

### Unit Tests

Run the test suite:

```bash
npm test
```

With coverage:

```bash
npm run test:coverage
```

### End-to-End Tests

After deploying to Cloudflare or running locally, test all endpoints:

```bash
# Against local development server
./scripts/e2e-test.sh http://localhost:8787 your-api-key

# Against production deployment
./scripts/e2e-test.sh https://codemap-mcp.<account-id>.workers.dev your-api-key
```

The test suite checks:
- Health endpoints
- MCP protocol compliance
- All 4 MCP tools (get_dependents, get_impact_report, check_breaking_change, get_architecture)
- Project upload and retrieval
- Error handling and edge cases

## Development Roadmap

- [x] 6.1.1 - Cloudflare Workers Project Setup
- [x] 6.1.2 - Hono Router and Health Endpoints
- [x] 6.1.3 - Cloudflare KV Integration
- [x] 6.2.1 - MCP Protocol Handler
- [x] 6.2.2 - MCP Tool: get_dependents
- [x] 6.2.3 - MCP Tool: get_impact_report
- [x] 6.2.4 - MCP Tool: check_breaking_change
- [x] 6.2.5 - MCP Tool: get_architecture
- [x] 6.3.1 - Project Upload REST API
- [x] 6.3.2 - MCP Resource Endpoint
- [x] 6.3.3 - Cloudflare Deployment and Testing

## Contributing

When adding new features:

1. Create a branch: `git checkout -b feature/description`
2. Write TypeScript with strict mode compliance
3. Add tests for all new functionality
4. Run `npm run typecheck && npm test` before committing
5. Update this README if adding new endpoints/tools

## License

Same as parent CodeMap project (see root LICENSE)

## Related

- [CodeMap CLI](../) - Generates CODE_MAP.json files
- [MCP Protocol](https://modelcontextprotocol.io/) - Specification
- [Cloudflare Workers](https://workers.cloudflare.com/) - Deployment platform
- [Hono](https://hono.dev/) - Web framework
