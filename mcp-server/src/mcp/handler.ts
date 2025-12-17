/**
 * MCP Protocol Handler
 * Implements JSON-RPC 2.0 message handling for the MCP protocol
 */

import type {
  JSONRPCRequest,
  JSONRPCResponseType,
  InitializeResponse,
  ToolsListResponse,
  ResourcesListResponse,
  Tool,
  Resource,
} from './types';
import {
  METHOD_NOT_FOUND_CODE,
  createParseError,
  createInvalidRequest,
} from './errors';
import type { CodeMapStorage } from '../storage';
import { handleGetDependents } from './tools/get-dependents';
import { handleGetImpactReport } from './tools/get-impact-report';
import { handleCheckBreakingChange } from './tools/check-breaking-change';

/**
 * Server information
 */
const SERVER_INFO = {
  name: 'codemap-mcp',
  version: '1.0.0',
};

/**
 * Available tools in the MCP server
 * Each tool describes what it does and what parameters it accepts
 */
const TOOLS: Tool[] = [
  {
    name: 'get_dependents',
    description: 'Get all functions/methods that depend on (call) a specified symbol. Returns both direct callers and transitive dependents.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: {
          type: 'string',
          description: 'The project ID containing the symbol',
        },
        symbol: {
          type: 'string',
          description: 'Fully qualified symbol name (e.g., "auth.validate_token")',
        },
        depth: {
          type: 'number',
          description: 'Optional maximum traversal depth for transitive dependents (default: unlimited)',
        },
      },
      required: ['project_id', 'symbol'],
    },
  },
  {
    name: 'get_impact_report',
    description: 'Get a comprehensive impact analysis for changing a symbol. Includes risk scoring, affected files, and suggested tests.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: {
          type: 'string',
          description: 'The project ID containing the symbol',
        },
        symbol: {
          type: 'string',
          description: 'Fully qualified symbol name to analyze impact for',
        },
        include_tests: {
          type: 'boolean',
          description: 'Whether to include test files in impact analysis (default: true)',
        },
      },
      required: ['project_id', 'symbol'],
    },
  },
  {
    name: 'check_breaking_change',
    description: 'Check if a proposed signature change would break existing callers. Analyzes parameter changes and returns affected callers.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: {
          type: 'string',
          description: 'The project ID containing the symbol',
        },
        symbol: {
          type: 'string',
          description: 'Fully qualified symbol name',
        },
        new_signature: {
          type: 'string',
          description: 'The proposed new signature (e.g., "def validate(token: str, realm: str = None) -> bool")',
        },
      },
      required: ['project_id', 'symbol', 'new_signature'],
    },
  },
  {
    name: 'get_architecture',
    description: 'Get high-level architecture overview of the codebase. Returns module/package structure, dependencies, and hotspots.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: {
          type: 'string',
          description: 'The project ID to analyze',
        },
        level: {
          type: 'string',
          enum: ['module', 'package'],
          description: 'Aggregation level for architecture view (default: module)',
        },
      },
      required: ['project_id'],
    },
  },
];

/**
 * Available resources in the MCP server
 */
const RESOURCES: Resource[] = [
  {
    uri: 'codemap://project',
    name: 'Project CodeMap',
    description: 'The CODE_MAP.json for the currently analyzed project',
    mimeType: 'application/json',
  },
];

/**
 * Handler function for MCP requests
 * Implements JSON-RPC 2.0 message handling
 *
 * @param request - The incoming request (may be raw JSON string or parsed object)
 * @param storage - Storage service for accessing project data
 * @param userId - User ID for data access control
 * @returns JSON-RPC 2.0 response
 */
export async function handleMcpRequest(
  request: unknown,
  storage: CodeMapStorage,
  userId: string
): Promise<JSONRPCResponseType> {
  let parsedRequest: JSONRPCRequest;

  // Parse request if it's a string
  if (typeof request === 'string') {
    try {
      parsedRequest = JSON.parse(request);
    } catch {
      return createParseError() as JSONRPCResponseType;
    }
  } else if (typeof request === 'object' && request !== null) {
    parsedRequest = request as JSONRPCRequest;
  } else {
    return createInvalidRequest() as JSONRPCResponseType;
  }

  // Validate JSON-RPC 2.0 format
  if (!isValidRequest(parsedRequest)) {
    return {
      ...createInvalidRequest(),
      id: (parsedRequest as any)?.id || null,
    } as JSONRPCResponseType;
  }

  const { id, method, params } = parsedRequest;

  try {
    // Route to appropriate handler
    switch (method) {
      case 'initialize':
        return handleInitialize(id);

      case 'tools/list':
        return handleToolsList(id);

      case 'tools/call':
        return await handleToolCall(id, params, storage, userId);

      case 'resources/list':
        return handleResourcesList(id);

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: METHOD_NOT_FOUND_CODE,
            message: `Method not found: ${method}`,
          },
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32603, // Internal error
        message: `Internal error: ${message}`,
      },
    };
  }
}

/**
 * Validate that a request is a properly formatted JSON-RPC 2.0 request
 */
function isValidRequest(request: unknown): request is JSONRPCRequest {
  if (typeof request !== 'object' || request === null) return false;

  const req = request as any;

  // Must have jsonrpc: '2.0'
  if (req.jsonrpc !== '2.0') return false;

  // Must have string or number id (null is not valid for request)
  if (typeof req.id !== 'string' && typeof req.id !== 'number') return false;

  // Must have string method
  if (typeof req.method !== 'string') return false;

  // Params must be object (excluding null) or undefined
  if (req.params !== undefined && (typeof req.params !== 'object' || req.params === null)) {
    return false;
  }

  return true;
}

/**
 * Handle initialize request
 * Returns server capabilities and information
 */
function handleInitialize(id: string | number | null): JSONRPCResponseType {
  const response: InitializeResponse = {
    protocolVersion: '2024-11-05',
    capabilities: {
      tools: {},
      resources: {},
    },
    serverInfo: SERVER_INFO,
  };

  return {
    jsonrpc: '2.0',
    id,
    result: response,
  };
}

/**
 * Handle tools/list request
 * Returns list of available tools
 */
function handleToolsList(id: string | number | null): JSONRPCResponseType {
  const response: ToolsListResponse = {
    tools: TOOLS,
  };

  return {
    jsonrpc: '2.0',
    id,
    result: response,
  };
}

/**
 * Handle resources/list request
 * Returns list of available resources
 */
function handleResourcesList(id: string | number | null): JSONRPCResponseType {
  const response: ResourcesListResponse = {
    resources: RESOURCES,
  };

  return {
    jsonrpc: '2.0',
    id,
    result: response,
  };
}

/**
 * Handle tools/call request
 * Routes to specific tool handlers
 */
async function handleToolCall(
  id: string | number | null,
  params: unknown,
  storage: CodeMapStorage,
  userId: string
): Promise<JSONRPCResponseType> {
  if (typeof params !== 'object' || params === null) {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32602,
        message: 'Invalid params: expected object',
      },
    };
  }

  const toolParams = params as Record<string, unknown>;
  const toolName = toolParams.name;

  if (typeof toolName !== 'string') {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32602,
        message: 'Invalid params: missing or invalid "name" field',
      },
    };
  }

  const toolArgs = toolParams.arguments;

  if (typeof toolArgs !== 'object' || toolArgs === null) {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32602,
        message: 'Invalid params: missing or invalid "arguments" field',
      },
    };
  }

  // Route to tool implementation
  let result: unknown;

  switch (toolName) {
    case 'get_dependents':
      result = await handleGetDependents(storage, userId, toolArgs as Record<string, unknown>);
      break;

    case 'get_impact_report':
      result = await handleGetImpactReport(storage, userId, toolArgs as Record<string, unknown>);
      break;

    case 'check_breaking_change':
      result = await handleCheckBreakingChange(
        storage,
        userId,
        toolArgs as Record<string, unknown>
      );
      break;

    case 'get_architecture':
      result = {
        content: [
          {
            type: 'text',
            text: 'get_architecture tool not yet implemented',
          },
        ],
      };
      break;

    default:
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32601,
          message: `Tool not found: ${toolName}`,
        },
      };
  }

  return {
    jsonrpc: '2.0',
    id,
    result,
  };
}
