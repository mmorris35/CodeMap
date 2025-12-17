# PROJECT_BRIEF.md

## Basic Information

- **Project Name**: CodeMap MCP Server
- **Project Type**: MCP Server / Cloudflare Worker
- **Primary Goal**: Provide CodeMap dependency analysis as an MCP server that Claude Code can call directly, deployed globally on Cloudflare Workers.
- **Target Users**: Claude Code users wanting architectural awareness before code changes, AI coding assistants needing dependency context, Developers using MCP-compatible tools
- **Timeline**: 1 week
- **Team Size**: 1

## Functional Requirements

### Key Features (MVP)

1. **MCP tool: `get_dependents(symbol)`** - Returns all functions that depend on a symbol
2. **MCP tool: `get_impact_report(symbol)`** - Full impact analysis with risk score, affected files, suggested tests
3. **MCP tool: `check_breaking_change(symbol, new_signature)`** - List callers that would break with signature change
4. **MCP tool: `get_architecture()`** - Returns full dependency graph summary (modules, edges, hotspots)
5. **MCP resource: `codemap://project/{id}/code_map.json`** - Exposes CODE_MAP.json as MCP resource
6. **Project upload endpoint** - `POST /projects/{id}/code_map` to upload CODE_MAP.json
7. **Cloudflare KV caching** - Cache parsed graphs for fast queries
8. **Multi-project support** - Isolated analysis per project_id
9. **Multi-tenant user isolation** - Each API key gets its own namespace (users cannot see each other's projects)

### Nice-to-Have Features (v2)

- Real-time analysis via WebSocket (re-analyze on file changes)
- GitHub App integration (auto-analyze on push, PR comments)
- Webhook to trigger re-analysis from CI/CD
- GraphQL API alongside MCP tools
- Rate limiting per API key
- Project sharing with team tokens

## Technical Constraints

### Must Use

- TypeScript (strict mode)
- Cloudflare Workers runtime
- MCP SDK (`@modelcontextprotocol/sdk`)
- Hono (lightweight web framework for Workers)
- Cloudflare KV (caching CODE_MAP.json)
- Wrangler (deployment CLI)
- Vitest (testing)
- ESLint + Prettier

### Cannot Use

- Express.js (too heavy for Workers)
- Node.js `fs` module (not available in Workers)
- Python (must be TypeScript for Workers edge runtime)
- Heavy npm packages (128MB memory limit)

## Other Constraints

- Must run within Cloudflare Workers limits:
  - 128MB memory
  - 30s CPU time (free tier: 10ms)
  - 100k requests/day (free tier)
- CODE_MAP.json must be uploaded via API (no local filesystem in Workers)
- MCP protocol compliance required (JSON-RPC 2.0)
- Response time under 200ms for cached queries
- CORS enabled for browser-based MCP clients

## Security & Privacy

### Data Stored

- **CODE_MAP.json**: Symbol names, file paths, line numbers, dependencies (code structure only)
- **No secrets**: CODE_MAP.json contains no credentials, API keys, or environment variables
- **No PII**: No usernames, emails, IP addresses, or personal information stored

### User Isolation

- **API key hashing**: Keys are SHA-256 hashed immediately; plain text never stored
- **User-scoped storage**: KV keys are `user:{hash}:project:{id}` - users cannot access others' data
- **No IP logging**: Cloudflare Workers do not log or expose client IP addresses to the application
- **No cross-tenant access**: Storage layer enforces user ID on all operations

### Multi-Tenancy

Two users with the same project name (e.g., "my-app") get separate storage:

- User A (key hash `abc123...`): `user:abc123:project:my-app`
- User B (key hash `def456...`): `user:def456:project:my-app`

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Claude Code / MCP Client                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ MCP Protocol (JSON-RPC 2.0)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Cloudflare Workers (Edge)                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                    Hono Router                         │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐   │  │
│  │  │ MCP Handler │  │ REST API    │  │ Health Check │   │  │
│  │  │ /mcp        │  │ /projects/* │  │ /health      │   │  │
│  │  └──────┬──────┘  └──────┬──────┘  └──────────────┘   │  │
│  │         │                │                             │  │
│  │         ▼                ▼                             │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │              Auth Middleware                      │  │  │
│  │  │  - Validate API key                              │  │  │
│  │  │  - Derive user ID from key hash (SHA-256)        │  │  │
│  │  └──────────────────────┬──────────────────────────┘  │  │
│  │                         │                             │  │
│  │                         ▼                             │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │              CodeMap Service                     │  │  │
│  │  │  - getDependents(userId, projectId, ...)        │  │  │
│  │  │  - getImpactReport(userId, projectId, ...)      │  │  │
│  │  │  - checkBreakingChange(userId, projectId, ...)  │  │  │
│  │  └──────────────────────┬──────────────────────────┘  │  │
│  │                         │                             │  │
│  │                         ▼                             │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │              Cloudflare KV (User-Scoped)         │  │  │
│  │  │  - user:{userId}:project:{projectId} → data     │  │  │
│  │  │  - user:{userId}:cache:{hash} → result          │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## MCP Tools Specification

### `get_dependents`

```typescript
{
  name: "get_dependents",
  description: "Get all functions that depend on a symbol (callers)",
  inputSchema: {
    type: "object",
    properties: {
      project_id: { type: "string", description: "Project identifier" },
      symbol: { type: "string", description: "Qualified symbol name (e.g., 'auth.validate_user')" },
      depth: { type: "number", description: "Max traversal depth (default: unlimited)" }
    },
    required: ["project_id", "symbol"]
  }
}
```

### `get_impact_report`

```typescript
{
  name: "get_impact_report",
  description: "Full impact analysis for changing a symbol",
  inputSchema: {
    type: "object",
    properties: {
      project_id: { type: "string" },
      symbol: { type: "string" },
      include_tests: { type: "boolean", default: true }
    },
    required: ["project_id", "symbol"]
  }
}
// Returns: { risk_score, direct_dependents, transitive_dependents, affected_files, suggested_tests }
```

### `check_breaking_change`

```typescript
{
  name: "check_breaking_change",
  description: "Check which callers would break if signature changes",
  inputSchema: {
    type: "object",
    properties: {
      project_id: { type: "string" },
      symbol: { type: "string" },
      old_signature: { type: "string", description: "Current function signature" },
      new_signature: { type: "string", description: "Proposed new signature" }
    },
    required: ["project_id", "symbol", "new_signature"]
  }
}
// Returns: { breaking_callers: [...], safe_callers: [...], suggestion: "..." }
```

### `get_architecture`

```typescript
{
  name: "get_architecture",
  description: "Get high-level architecture overview",
  inputSchema: {
    type: "object",
    properties: {
      project_id: { type: "string" },
      level: { type: "string", enum: ["module", "package"], default: "module" }
    },
    required: ["project_id"]
  }
}
// Returns: { modules, dependencies, hotspots, cycles }
```

## Success Criteria

- All 4 MCP tools implemented and working
- MCP resource endpoint serves CODE_MAP.json
- Project upload/retrieval via REST API
- Deployed to Cloudflare Workers
- Response time < 200ms (cached)
- Passes MCP protocol compliance tests
- TypeScript strict mode, ESLint clean
- Documentation with usage examples
- Claude Code integration tested

## Dependencies

- **CodeMap CLI**: Generates CODE_MAP.json that this server consumes
- **Claude Code**: Primary consumer via MCP protocol

---

_Generated by DevPlan MCP Server_
