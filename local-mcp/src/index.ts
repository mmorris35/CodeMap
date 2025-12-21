/**
 * CodeMap MCP - Local MCP server for Python code dependency analysis
 *
 * This package provides a local MCP server that can analyze Python projects
 * using tree-sitter and expose dependency information to Claude Code.
 *
 * @module codemap-mcp
 */

export { analyzeProject, saveCodeMap, loadCodeMap, listProjects, getStorageDir } from './analyzer.js';

export {
  getDependents,
  getImpactReport,
  checkBreakingChange,
  getArchitecture,
} from './tools.js';

export { McpServer, startServer } from './mcp-server.js';

export type {
  CodeMap,
  Symbol,
  Dependency,
  DependentInfo,
  GetDependentsResult,
  ImpactReport,
  BreakingChangeResult,
  ArchitectureResult,
  ModuleInfo,
  ModuleDependency,
  McpToolDefinition,
  McpToolResponse,
  JsonRpcRequest,
  JsonRpcResponse,
} from './types.js';
