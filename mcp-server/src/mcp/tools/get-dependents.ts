/**
 * MCP Tool: get_dependents
 * Analyzes dependency graph to find all symbols that depend on (call) a given symbol
 */

import type { CodeMapStorage, Dependency } from '../../storage';
import type { ToolCallResponse } from '../types';

/**
 * Result structure for get_dependents tool
 */
export interface GetDependentsResult {
  symbol: string;
  direct: Array<{
    symbol: string;
    file: string;
    line: number;
  }>;
  transitive: Array<{
    symbol: string;
    file: string;
    line: number;
  }>;
  total: number;
}

/**
 * Find all symbols that depend on (call) a given symbol
 *
 * Uses BFS traversal to discover both direct and transitive dependents.
 * Returns caller information including file location for each dependent.
 *
 * @param storage - Storage service for accessing CodeMap
 * @param userId - User ID for scoped access
 * @param projectId - Project identifier
 * @param symbol - Target symbol to find dependents for
 * @param depth - Optional maximum traversal depth (undefined = unlimited)
 * @returns Result with direct and transitive dependents
 * @throws Error if project or symbol not found
 */
export async function getDependents(
  storage: CodeMapStorage,
  userId: string,
  projectId: string,
  symbol: string,
  depth?: number
): Promise<GetDependentsResult> {
  // Load CodeMap from storage
  const codeMap = await storage.getCodeMap(userId, projectId);
  if (!codeMap) {
    throw new Error(`Project not found: ${projectId}`);
  }

  // Check if symbol exists in the codebase
  const symbolExists = codeMap.symbols.some((s) => s.qualified_name === symbol);
  if (!symbolExists) {
    throw new Error(`Symbol not found: ${symbol}`);
  }

  // Build reverse dependency map (who calls whom)
  // Map from "to_sym" (callee) to list of "from_sym" (callers)
  const callersMap = new Map<string, Array<{ symbol: string; dependency: Dependency }>>();
  for (const dep of codeMap.dependencies) {
    if (!callersMap.has(dep.to_sym)) {
      callersMap.set(dep.to_sym, []);
    }
    callersMap.get(dep.to_sym)!.push({
      symbol: dep.from_sym,
      dependency: dep,
    });
  }

  // Get direct callers
  const directCallers = callersMap.get(symbol) || [];
  const directSymbols = directCallers.map((item) => item.symbol);

  // BFS to find transitive dependents
  const transitiveSymbols: string[] = [];
  const visited = new Set<string>([symbol, ...directSymbols]);
  const queue = [...directSymbols];
  let currentDepth = 1;

  // Continue traversal if depth is unlimited (undefined) or if we haven't reached the limit
  // depth=0 or undefined means unlimited; depth=1 means only direct; depth=2 means one level of transitive, etc.
  while (queue.length > 0 && (depth === undefined || depth === 0 || currentDepth < depth)) {
    const levelSize = queue.length;

    for (let i = 0; i < levelSize; i++) {
      const current = queue.shift();
      if (!current) break;

      const callers = callersMap.get(current) || [];
      for (const item of callers) {
        if (!visited.has(item.symbol)) {
          visited.add(item.symbol);
          transitiveSymbols.push(item.symbol);
          queue.push(item.symbol);
        }
      }
    }

    currentDepth++;
  }

  // Enrich results with file and line information
  const symbolMap = new Map(codeMap.symbols.map((s) => [s.qualified_name, s]));

  const directResults = directCallers.map((item) => {
    const sym = symbolMap.get(item.symbol);
    return {
      symbol: item.symbol,
      file: sym?.file || 'unknown',
      line: sym?.line || 0,
    };
  });

  const transitiveResults = transitiveSymbols.map((sym) => {
    const s = symbolMap.get(sym);
    return {
      symbol: sym,
      file: s?.file || 'unknown',
      line: s?.line || 0,
    };
  });

  return {
    symbol,
    direct: directResults,
    transitive: transitiveResults,
    total: directResults.length + transitiveResults.length,
  };
}

/**
 * Handle get_dependents tool call from MCP request
 *
 * @param storage - Storage service
 * @param userId - User ID for scoped access
 * @param args - Tool arguments including projectId, symbol, and optional depth
 * @returns MCP tool response with structured result or error
 */
export async function handleGetDependents(
  storage: CodeMapStorage,
  userId: string,
  args: Record<string, unknown>
): Promise<ToolCallResponse> {
  try {
    // Validate required arguments
    const projectId = args.project_id;
    const symbol = args.symbol;
    const depthArg = args.depth;

    if (typeof projectId !== 'string' || !projectId.trim()) {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: project_id must be a non-empty string',
          },
        ],
        isError: true,
      };
    }

    if (typeof symbol !== 'string' || !symbol.trim()) {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: symbol must be a non-empty string',
          },
        ],
        isError: true,
      };
    }

    let depth: number | undefined;
    if (depthArg !== undefined) {
      if (typeof depthArg !== 'number' || depthArg < 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'Error: depth must be a non-negative number',
            },
          ],
          isError: true,
        };
      }
      depth = depthArg;
    }

    // Call the tool implementation
    const result = await getDependents(storage, userId, projectId, symbol, depth);

    // Format response as JSON
    const responseText = JSON.stringify(result, null, 2);

    return {
      content: [
        {
          type: 'text',
          text: responseText,
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
}
