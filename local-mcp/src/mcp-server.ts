/**
 * MCP Server implementation using stdio transport
 * Handles JSON-RPC 2.0 protocol for Claude Code integration
 */

import * as readline from 'readline';
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  McpToolDefinition,
  McpToolResponse,
  CodeMap,
} from './types.js';
import { analyzeProject, loadCodeMap, saveCodeMap } from './analyzer.js';
import {
  getDependents,
  getImpactReport,
  checkBreakingChange,
  getArchitecture,
} from './tools.js';

// Tool definitions for MCP
const TOOL_DEFINITIONS: McpToolDefinition[] = [
  {
    name: 'get_dependents',
    description:
      'Find all symbols that depend on (call) a given symbol. Returns both direct callers and transitive dependents.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'The qualified symbol name (e.g., "module.ClassName.method_name")',
        },
        max_depth: {
          type: 'number',
          description: 'Maximum depth for transitive analysis. 0 = unlimited.',
        },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'get_impact_report',
    description:
      'Generate a comprehensive impact report for changing a symbol. Includes risk scoring, affected files, and suggested tests.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'The qualified symbol name to analyze',
        },
        include_tests: {
          type: 'boolean',
          description: 'Whether to include test file suggestions',
        },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'check_breaking_change',
    description:
      'Check if a proposed signature change would break existing callers.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'The qualified symbol name',
        },
        new_signature: {
          type: 'string',
          description: 'The proposed new function signature',
        },
      },
      required: ['symbol', 'new_signature'],
    },
  },
  {
    name: 'get_architecture',
    description:
      'Get an architecture overview of the codebase showing modules, dependencies, and hotspots.',
    inputSchema: {
      type: 'object',
      properties: {
        level: {
          type: 'string',
          enum: ['module', 'package'],
          description: 'Level of granularity: "module" for files, "package" for directories',
        },
      },
      required: [],
    },
  },
  {
    name: 'analyze_project',
    description:
      'Analyze a Python project to generate the code map. Run this first before using other tools.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the Python project root directory',
        },
        project_id: {
          type: 'string',
          description: 'Unique identifier for this project (defaults to directory name)',
        },
      },
      required: ['path'],
    },
  },
];

// Resource definitions
const RESOURCE_DEFINITIONS = [
  {
    uri: 'codemap://current/code_map',
    name: 'Current Code Map',
    description: 'The full CODE_MAP.json for the currently analyzed project',
    mimeType: 'application/json',
  },
  {
    uri: 'codemap://current/summary',
    name: 'Project Summary',
    description: 'A summary of the current project structure',
    mimeType: 'text/plain',
  },
];

/**
 * MCP Server class handling stdio communication
 */
export class McpServer {
  private currentProjectId: string | null = null;
  private currentCodeMap: CodeMap | null = null;

  constructor() {}

  /**
   * Start the server and listen on stdin
   */
  async start(): Promise<void> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    // Process each line as a JSON-RPC request
    rl.on('line', async (line) => {
      if (!line.trim()) return;

      try {
        const request = JSON.parse(line) as JsonRpcRequest;
        const response = await this.handleRequest(request);
        this.sendResponse(response);
      } catch (error) {
        const errorResponse: JsonRpcResponse = {
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32700,
            message: 'Parse error',
            data: error instanceof Error ? error.message : String(error),
          },
        };
        this.sendResponse(errorResponse);
      }
    });

    rl.on('close', () => {
      process.exit(0);
    });
  }

  /**
   * Send a JSON-RPC response to stdout
   */
  private sendResponse(response: JsonRpcResponse): void {
    console.log(JSON.stringify(response));
  }

  /**
   * Handle a JSON-RPC request
   */
  private async handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const { id, method, params } = request;

    try {
      let result: unknown;

      switch (method) {
        case 'initialize':
          result = await this.handleInitialize(params);
          break;

        case 'tools/list':
          result = { tools: TOOL_DEFINITIONS };
          break;

        case 'tools/call':
          result = await this.handleToolCall(params);
          break;

        case 'resources/list':
          result = { resources: RESOURCE_DEFINITIONS };
          break;

        case 'resources/read':
          result = await this.handleResourceRead(params);
          break;

        case 'notifications/initialized':
          // Client acknowledgment, no response needed
          return { jsonrpc: '2.0', id, result: {} };

        default:
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32601,
              message: `Method not found: ${method}`,
            },
          };
      }

      return { jsonrpc: '2.0', id, result };
    } catch (error) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  /**
   * Handle initialize request
   */
  private async handleInitialize(
    _params: Record<string, unknown> | undefined
  ): Promise<Record<string, unknown>> {
    return {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {},
        resources: {},
      },
      serverInfo: {
        name: 'codemap-mcp',
        version: '1.0.0',
      },
    };
  }

  /**
   * Handle tool calls
   */
  private async handleToolCall(
    params: Record<string, unknown> | undefined
  ): Promise<McpToolResponse> {
    if (!params || typeof params.name !== 'string') {
      return {
        content: [{ type: 'text', text: 'Missing tool name' }],
        isError: true,
      };
    }

    const toolName = params.name;
    const toolArgs = (params.arguments || {}) as Record<string, unknown>;

    try {
      switch (toolName) {
        case 'analyze_project':
          return await this.toolAnalyzeProject(toolArgs);

        case 'get_dependents':
          return this.toolGetDependents(toolArgs);

        case 'get_impact_report':
          return this.toolGetImpactReport(toolArgs);

        case 'check_breaking_change':
          return this.toolCheckBreakingChange(toolArgs);

        case 'get_architecture':
          return this.toolGetArchitecture(toolArgs);

        default:
          return {
            content: [{ type: 'text', text: `Unknown tool: ${toolName}` }],
            isError: true,
          };
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Analyze a project and store the code map
   */
  private async toolAnalyzeProject(
    args: Record<string, unknown>
  ): Promise<McpToolResponse> {
    const projectPath = args.path as string;
    if (!projectPath) {
      return {
        content: [{ type: 'text', text: 'Missing required parameter: path' }],
        isError: true,
      };
    }

    const projectId =
      (args.project_id as string) || projectPath.split('/').pop() || 'project';

    const codeMap = await analyzeProject(projectPath);
    saveCodeMap(projectId, codeMap);

    this.currentProjectId = projectId;
    this.currentCodeMap = codeMap;

    const summary = `Analyzed ${codeMap.symbols.length} symbols and ${codeMap.dependencies.length} dependencies in ${projectPath}`;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              project_id: projectId,
              symbols_count: codeMap.symbols.length,
              dependencies_count: codeMap.dependencies.length,
              summary,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  /**
   * Get dependents of a symbol
   */
  private toolGetDependents(args: Record<string, unknown>): McpToolResponse {
    const codeMap = this.ensureCodeMap();
    const symbol = args.symbol as string;
    const maxDepth = (args.max_depth as number) || 0;

    if (!symbol) {
      return {
        content: [{ type: 'text', text: 'Missing required parameter: symbol' }],
        isError: true,
      };
    }

    const result = getDependents(codeMap, symbol, maxDepth);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }

  /**
   * Get impact report for a symbol
   */
  private toolGetImpactReport(args: Record<string, unknown>): McpToolResponse {
    const codeMap = this.ensureCodeMap();
    const symbol = args.symbol as string;
    const includeTests = (args.include_tests as boolean) ?? true;

    if (!symbol) {
      return {
        content: [{ type: 'text', text: 'Missing required parameter: symbol' }],
        isError: true,
      };
    }

    const result = getImpactReport(codeMap, symbol, includeTests);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }

  /**
   * Check for breaking changes
   */
  private toolCheckBreakingChange(args: Record<string, unknown>): McpToolResponse {
    const codeMap = this.ensureCodeMap();
    const symbol = args.symbol as string;
    const newSignature = args.new_signature as string;

    if (!symbol || !newSignature) {
      return {
        content: [
          { type: 'text', text: 'Missing required parameters: symbol, new_signature' },
        ],
        isError: true,
      };
    }

    const result = checkBreakingChange(codeMap, symbol, newSignature);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }

  /**
   * Get architecture overview
   */
  private toolGetArchitecture(args: Record<string, unknown>): McpToolResponse {
    const codeMap = this.ensureCodeMap();
    const level = (args.level as 'module' | 'package') || 'module';

    const result = getArchitecture(codeMap, level);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }

  /**
   * Handle resource read requests
   */
  private async handleResourceRead(
    params: Record<string, unknown> | undefined
  ): Promise<Record<string, unknown>> {
    if (!params || typeof params.uri !== 'string') {
      throw new Error('Missing resource URI');
    }

    const uri = params.uri;

    if (uri === 'codemap://current/code_map') {
      const codeMap = this.ensureCodeMap();
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(codeMap, null, 2),
          },
        ],
      };
    }

    if (uri === 'codemap://current/summary') {
      const codeMap = this.ensureCodeMap();
      const modules = new Set(codeMap.symbols.map((s) => s.file));
      const functions = codeMap.symbols.filter((s) => s.kind === 'function').length;
      const classes = codeMap.symbols.filter((s) => s.kind === 'class').length;
      const methods = codeMap.symbols.filter((s) => s.kind === 'method').length;

      const summary = `
Project Summary
===============
Source Root: ${codeMap.source_root}
Generated: ${codeMap.generated_at}

Symbols:
  - Modules: ${modules.size}
  - Classes: ${classes}
  - Functions: ${functions}
  - Methods: ${methods}
  - Total: ${codeMap.symbols.length}

Dependencies: ${codeMap.dependencies.length}
`.trim();

      return {
        contents: [
          {
            uri,
            mimeType: 'text/plain',
            text: summary,
          },
        ],
      };
    }

    throw new Error(`Unknown resource: ${uri}`);
  }

  /**
   * Ensure a code map is loaded
   */
  private ensureCodeMap(): CodeMap {
    if (this.currentCodeMap) {
      return this.currentCodeMap;
    }

    // Try to load the most recently used project
    if (this.currentProjectId) {
      const loaded = loadCodeMap(this.currentProjectId);
      if (loaded) {
        this.currentCodeMap = loaded;
        return loaded;
      }
    }

    throw new Error(
      'No project analyzed. Use the analyze_project tool first to analyze a Python project.'
    );
  }

  /**
   * Load a specific project
   */
  loadProject(projectId: string): boolean {
    const codeMap = loadCodeMap(projectId);
    if (codeMap) {
      this.currentProjectId = projectId;
      this.currentCodeMap = codeMap;
      return true;
    }
    return false;
  }
}

/**
 * Start the MCP server
 */
export async function startServer(): Promise<void> {
  const server = new McpServer();
  await server.start();
}
