/**
 * MCP (Model Context Protocol) types and interfaces
 * Implements JSON-RPC 2.0 specification for MCP server protocol
 */

/**
 * JSON-RPC 2.0 request object
 * @see https://www.jsonrpc.org/specification
 */
export interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: string | number | null;
  method: string;
  params?: unknown;
}

/**
 * JSON-RPC 2.0 response object (success case)
 */
export interface JSONRPCResponse<T = unknown> {
  jsonrpc: '2.0';
  id: string | number | null;
  result: T;
}

/**
 * JSON-RPC 2.0 error object
 */
export interface JSONRPCError {
  code: number;
  message: string;
  data?: unknown;
}

/**
 * JSON-RPC 2.0 response object (error case)
 */
export interface JSONRPCErrorResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  error: JSONRPCError;
}

/**
 * Union of possible JSON-RPC responses
 */
export type JSONRPCResponseType<T = unknown> = JSONRPCResponse<T> | JSONRPCErrorResponse;

/**
 * MCP server capabilities
 * Describes what features this server supports
 */
export interface ServerCapabilities {
  tools?: unknown;
  resources?: unknown;
  prompts?: unknown;
}

/**
 * MCP server info returned by initialize
 */
export interface ServerInfo {
  name: string;
  version: string;
}

/**
 * MCP initialize response
 */
export interface InitializeResponse {
  protocolVersion: string;
  capabilities: ServerCapabilities;
  serverInfo: ServerInfo;
}

/**
 * Tool definition for MCP
 */
export interface Tool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * MCP tools/list response
 */
export interface ToolsListResponse {
  tools: Tool[];
}

/**
 * MCP resource
 */
export interface Resource {
  uri: string;
  name: string;
  description: string;
  mimeType?: string;
}

/**
 * MCP resources/list response
 */
export interface ResourcesListResponse {
  resources: Resource[];
}

/**
 * Tool call result
 */
export interface ToolContent {
  type: 'text' | 'image' | 'resource';
  text?: string;
  data?: string;
  mimeType?: string;
}

/**
 * MCP tool call response
 */
export interface ToolCallResponse {
  content: ToolContent[];
  isError?: boolean;
}
