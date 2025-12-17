/**
 * MCP Tool: check_breaking_change
 * Detects breaking changes in function/method signatures
 * Analyzes parameter changes and identifies affected callers
 */

import type { CodeMapStorage } from '../../storage';
import { getDependents, type GetDependentsResult } from './get-dependents';
import type { ToolCallResponse } from '../types';

/**
 * Parameter information extracted from a signature
 */
interface ParameterInfo {
  name: string;
  isRequired: boolean;
  hasDefaultValue: boolean;
  type?: string;
}

/**
 * Signature analysis result
 */
interface SignatureAnalysis {
  isBreaking: boolean;
  reason: string | null;
  details: string[];
}

/**
 * Result structure for check_breaking_change tool
 */
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

/**
 * Extract parameters from a function signature string
 *
 * Simple regex-based parsing for common function signature formats:
 * - Python: def func(a: int, b: str = None) -> bool:
 * - TypeScript: function func(a: number, b?: string): boolean
 * - TypeScript arrow: (a: number, b?: string) => boolean
 *
 * @param signature - Function signature string
 * @returns Array of extracted parameters with metadata
 */
function extractParameters(signature: string): ParameterInfo[] {
  if (!signature || signature.trim().length === 0) {
    return [];
  }

  // Find the parameter list within parentheses
  const paramMatch = signature.match(/\(([^)]*)\)/);
  if (!paramMatch || !paramMatch[1]) {
    return [];
  }

  const paramString = paramMatch[1];
  const parameters: ParameterInfo[] = [];

  // Split by comma, but be careful of nested structures
  let depth = 0;
  let current = '';

  for (const char of paramString) {
    if (char === '[' || char === '{' || char === '<') {
      depth++;
    } else if (char === ']' || char === '}' || char === '>') {
      depth--;
    } else if (char === ',' && depth === 0) {
      if (current.trim()) {
        parameters.push(parseParameter(current.trim()));
      }
      current = '';
      continue;
    }
    current += char;
  }

  if (current.trim()) {
    parameters.push(parseParameter(current.trim()));
  }

  return parameters;
}

/**
 * Parse a single parameter string and extract metadata
 *
 * @param paramString - Single parameter string (e.g., "name: str = None")
 * @returns Parsed parameter information
 */
function parseParameter(paramString: string): ParameterInfo {
  // Remove leading/trailing whitespace
  paramString = paramString.trim();

  // Skip *args, **kwargs, etc.
  if (paramString.startsWith('*') || paramString.startsWith('...')) {
    return {
      name: paramString,
      isRequired: false,
      hasDefaultValue: true,
      type: 'variadic',
    };
  }

  // Extract parameter name (before : or =)
  const nameMatch = paramString.match(/^(\w+)/);
  const name = nameMatch ? nameMatch[1] : paramString;

  // Check if parameter is optional (has ? or default value)
  const hasQuestionMark = paramString.includes('?');
  const hasDefaultValue = paramString.includes('=') || hasQuestionMark;

  // Extract type if present
  const typeMatch = paramString.match(/:\s*([^=]+)(?:=|$)/);
  const type = typeMatch ? typeMatch[1].trim() : undefined;

  return {
    name,
    isRequired: !hasDefaultValue && !hasQuestionMark,
    hasDefaultValue,
    type,
  };
}

/**
 * Analyze if a signature change is breaking
 *
 * Breaking changes:
 * - Required parameters added
 * - Parameters removed
 * - Parameter order changed (different names at same position)
 * - Parameter type changed
 *
 * Safe changes:
 * - Optional parameters added at end
 * - Return type changed only
 * - Type narrowed (e.g., str -> int)
 *
 * @param oldSignature - Previous function signature (or null if new symbol)
 * @param newSignature - Proposed function signature
 * @returns Analysis result with breaking status and reason
 */
function analyzeSignatureChange(
  oldSignature: string | null,
  newSignature: string
): SignatureAnalysis {
  const details: string[] = [];

  // If no old signature (null), cannot be breaking (it's a new function)
  // If empty string, still treat as no old signature
  if (!oldSignature || oldSignature.trim().length === 0) {
    return {
      isBreaking: false,
      reason: null,
      details: ['New symbol, no previous signature to compare'],
    };
  }

  const oldParams = extractParameters(oldSignature);
  const newParams = extractParameters(newSignature);

  // Check if required parameters were removed
  for (const oldParam of oldParams) {
    if (oldParam.isRequired) {
      const newParam = newParams.find((p) => p.name === oldParam.name);
      if (!newParam) {
        details.push(
          `Required parameter '${oldParam.name}' was removed`
        );
        return {
          isBreaking: true,
          reason: `Required parameter '${oldParam.name}' was removed`,
          details,
        };
      }
    }
  }

  // Check if new required parameters were added before variadic parameters
  // Filter out variadic params for proper comparison
  const oldRegularParams = oldParams.filter((p) => p.type !== 'variadic');
  const newRegularParams = newParams.filter((p) => p.type !== 'variadic');

  // Check if required parameters were added in new signature
  for (let i = oldRegularParams.length; i < newRegularParams.length; i++) {
    const newParam = newRegularParams[i];
    if (newParam.isRequired) {
      // New required parameter added (breaking)
      details.push(
        `New required parameter '${newParam.name}' added at position ${i}`
      );
      return {
        isBreaking: true,
        reason: `New required parameter '${newParam.name}' added (breaking for existing callers)`,
        details,
      };
    }
  }

  // Check if parameter order changed (different names at same position)
  const minLen = Math.min(oldRegularParams.length, newRegularParams.length);
  for (let i = 0; i < minLen; i++) {
    const oldParam = oldRegularParams[i];
    const newParam = newRegularParams[i];

    // If parameter names differ at the same position, and old param was required
    if (oldParam.name !== newParam.name && oldParam.isRequired) {
      details.push(
        `Parameter at position ${i} changed from '${oldParam.name}' to '${newParam.name}'`
      );
      return {
        isBreaking: true,
        reason: `Parameter order/names changed at position ${i}`,
        details,
      };
    }
  }

  // Check for type changes on existing parameters
  for (let i = 0; i < minLen; i++) {
    const oldParam = oldRegularParams[i];
    const newParam = newRegularParams[i];

    if (
      oldParam.type &&
      newParam.type &&
      oldParam.type !== newParam.type &&
      oldParam.name === newParam.name
    ) {
      // Type change detected
      details.push(
        `Type of parameter '${oldParam.name}' changed from '${oldParam.type}' to '${newParam.type}'`
      );
      // Note: Not always breaking (could be compatible type), but flag for review
      return {
        isBreaking: true,
        reason: `Type change in parameter '${oldParam.name}': ${oldParam.type} -> ${newParam.type}`,
        details,
      };
    }
  }

  // Safe: only optional parameters added, or return type changed
  return {
    isBreaking: false,
    reason: null,
    details: ['Signature change appears backward compatible'],
  };
}

/**
 * Check if a proposed signature change would break existing callers
 *
 * Analyzes the old and new signatures and identifies all callers that
 * would be affected. Returns them separated into breaking_callers and
 * safe_callers depending on whether the change is breaking.
 *
 * @param storage - Storage service for accessing CodeMap
 * @param userId - User ID for scoped access
 * @param projectId - Project identifier
 * @param symbol - Target symbol to check
 * @param newSignature - Proposed new signature
 * @returns Breaking change analysis with affected callers
 * @throws Error if project or symbol not found
 */
export async function checkBreakingChange(
  storage: CodeMapStorage,
  userId: string,
  projectId: string,
  symbol: string,
  newSignature: string
): Promise<BreakingChangeResult> {
  // Load CodeMap from storage
  const codeMap = await storage.getCodeMap(userId, projectId);
  if (!codeMap) {
    throw new Error(`Project not found: ${projectId}`);
  }

  // Find the symbol to check
  const symbolData = codeMap.symbols.find((s) => s.qualified_name === symbol);
  if (!symbolData) {
    throw new Error(`Symbol not found: ${symbol}`);
  }

  // Get the old signature (preserve empty string as distinct from null)
  const oldSignature = symbolData.signature !== undefined ? symbolData.signature : null;

  // Analyze if the change is breaking
  const analysis = analyzeSignatureChange(oldSignature, newSignature);

  // Get all dependents (callers) of this symbol
  let dependents: GetDependentsResult;
  try {
    dependents = await getDependents(
      storage,
      userId,
      projectId,
      symbol,
      undefined
    );
  } catch {
    // If symbol has no dependents, that's okay
    dependents = {
      symbol,
      direct: [],
      transitive: [],
      total: 0,
    };
  }

  // Combine all callers
  const allCallers = [
    ...dependents.direct.map((d) => d.symbol),
    ...dependents.transitive.map((d) => d.symbol),
  ];

  // Categorize callers based on breaking status
  const breakingCallers = analysis.isBreaking ? allCallers : [];
  const safeCallers = analysis.isBreaking ? [] : allCallers;

  // Generate suggestion
  let suggestion = '';
  if (analysis.isBreaking) {
    if (allCallers.length === 0) {
      suggestion = 'This change is breaking, but there are no known callers.';
    } else {
      suggestion = `This change is breaking. Update ${allCallers.length} caller(s) before applying this change.`;
    }
  } else {
    suggestion = 'This change appears backward compatible for existing callers.';
  }

  return {
    symbol,
    old_signature: oldSignature,
    new_signature: newSignature,
    is_breaking: analysis.isBreaking,
    reason: analysis.reason,
    breaking_callers: breakingCallers,
    safe_callers: safeCallers,
    suggestion,
  };
}

/**
 * Handle check_breaking_change tool call from MCP request
 *
 * @param storage - Storage service
 * @param userId - User ID for scoped access
 * @param args - Tool arguments including projectId, symbol, and newSignature
 * @returns MCP tool response with structured result or error
 */
export async function handleCheckBreakingChange(
  storage: CodeMapStorage,
  userId: string,
  args: Record<string, unknown>
): Promise<ToolCallResponse> {
  try {
    // Validate required arguments
    const projectId = args.project_id;
    const symbol = args.symbol;
    const newSignature = args.new_signature;

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

    if (typeof newSignature !== 'string' || !newSignature.trim()) {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: new_signature must be a non-empty string',
          },
        ],
        isError: true,
      };
    }

    // Call the tool implementation
    const result = await checkBreakingChange(
      storage,
      userId,
      projectId,
      symbol,
      newSignature
    );

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
