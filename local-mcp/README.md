# CodeMap MCP

Local MCP server for Python code dependency analysis. Works with Claude Code to analyze your Python projects and answer questions about code dependencies.

## Installation

```bash
npm install -g codemap-mcp
```

## Quick Start

1. **Install the MCP server for Claude Code:**

```bash
codemap-mcp install --global
```

This configures Claude Code to use the CodeMap MCP server.

2. **Use in Claude Code:**

Simply ask Claude about your Python code dependencies:

- "Analyze this Python project for dependencies"
- "What functions call `handle_request`?"
- "Show me the impact of changing `user.authenticate`"
- "Is removing the `password` parameter a breaking change?"

## How It Works

The CodeMap MCP server uses [tree-sitter](https://tree-sitter.github.io/tree-sitter/) to parse Python code and build a dependency graph. This graph is then exposed to Claude Code through the MCP (Model Context Protocol), allowing Claude to answer questions about:

- **Dependencies**: What functions call what?
- **Impact**: What would break if I change this function?
- **Breaking Changes**: Is my signature change backwards compatible?
- **Architecture**: What's the module structure of my codebase?

All analysis happens **locally** on your machine - your code never leaves your computer.

## CLI Commands

### `codemap-mcp install`

Configure Claude Code to use the CodeMap MCP server.

```bash
# Install for current project only
codemap-mcp install

# Install globally (recommended)
codemap-mcp install --global
```

### `codemap-mcp analyze <path>`

Analyze a Python project and save the code map.

```bash
codemap-mcp analyze ./my-project

# With custom project ID
codemap-mcp analyze ./my-project --id my-project-name

# Output raw JSON
codemap-mcp analyze ./my-project --json
```

### `codemap-mcp list`

List previously analyzed projects.

```bash
codemap-mcp list
```

### `codemap-mcp show <project-id>`

Show details about an analyzed project.

```bash
codemap-mcp show my-project
codemap-mcp show my-project --symbols
codemap-mcp show my-project --deps
```

### `codemap-mcp serve`

Run the MCP server (stdio mode). This is called automatically by Claude Code.

```bash
codemap-mcp serve
```

## MCP Tools

When connected to Claude Code, the following tools become available:

### `analyze_project`

Analyze a Python project to generate the code map. Run this first before using other tools.

**Parameters:**
- `path` (required): Path to the Python project root
- `project_id` (optional): Unique identifier for this project

### `get_dependents`

Find all symbols that depend on (call) a given symbol.

**Parameters:**
- `symbol` (required): The qualified symbol name (e.g., "module.ClassName.method_name")
- `max_depth` (optional): Maximum depth for transitive analysis. 0 = unlimited.

### `get_impact_report`

Generate a comprehensive impact report for changing a symbol.

**Parameters:**
- `symbol` (required): The qualified symbol name
- `include_tests` (optional): Whether to include test file suggestions

### `check_breaking_change`

Check if a proposed signature change would break existing callers.

**Parameters:**
- `symbol` (required): The qualified symbol name
- `new_signature` (required): The proposed new function signature

### `get_architecture`

Get an architecture overview showing modules, dependencies, and hotspots.

**Parameters:**
- `level` (optional): "module" for files, "package" for directories

## Data Storage

Code maps are stored locally in `~/.codemap/`. Each project gets its own JSON file.

## Requirements

- Node.js >= 18.0.0
- Python source code to analyze

## Privacy

All code analysis happens locally on your machine. Your source code is never uploaded anywhere.

## License

MIT
