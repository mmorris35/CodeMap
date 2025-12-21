/**
 * TypeScript types for CodeMap local MCP server
 */

export interface Symbol {
  qualified_name: string;
  kind: 'module' | 'class' | 'function' | 'method';
  file: string;
  line: number;
  docstring: string | null;
  signature?: string;
}

export interface Dependency {
  from_sym: string;
  to_sym: string;
  kind: 'calls' | 'imports' | 'inherits';
}

export interface CodeMap {
  version: string;
  generated_at: string;
  source_root: string;
  symbols: Symbol[];
  dependencies: Dependency[];
}

export interface DependentInfo {
  symbol: string;
  file: string;
  line: number;
}

export interface GetDependentsResult {
  symbol: string;
  direct: DependentInfo[];
  transitive: DependentInfo[];
  total: number;
}

export interface ImpactReport {
  symbol: string;
  risk_score: number;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  direct_dependents: DependentInfo[];
  transitive_dependents: DependentInfo[];
  affected_files: string[];
  file_summary: Record<string, number>;
  suggested_tests: string[];
  summary: string;
}

export interface BreakingChangeResult {
  symbol: string;
  old_signature: string | null;
  new_signature: string;
  is_breaking: boolean;
  reason: string | null;
  breaking_callers: string[];
  safe_callers: string[];
  suggestion: string;
}

export interface ModuleInfo {
  name: string;
  symbols: number;
  dependents: number;
  dependencies: number;
}

export interface ModuleDependency {
  from: string;
  to: string;
  count: number;
}

export interface ArchitectureResult {
  level: 'module' | 'package';
  modules: ModuleInfo[];
  dependencies: ModuleDependency[];
  hotspots: string[];
  cycles: string[][];
  summary: string;
}

// MCP Protocol Types
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface McpToolResponse {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}
