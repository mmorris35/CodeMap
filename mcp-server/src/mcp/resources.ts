/**
 * MCP Resource Handler
 * Implements resource reading and summary generation for CodeMap projects
 */

import type { CodeMap, CodeMapStorage } from "../storage";

/**
 * Resource content response
 */
export interface ResourceContent {
  uri: string;
  mimeType: string;
  text: string;
}

/**
 * Parse a resource URI and extract project ID and resource type
 *
 * Supported URI formats:
 * - codemap://project/{projectId}/code_map.json
 * - codemap://project/{projectId}/summary
 *
 * @param uri - The resource URI to parse
 * @returns Object with projectId and resourceType, or null if invalid
 */
export function parseResourceUri(uri: string): {
  projectId: string;
  resourceType: "code_map" | "summary";
} | null {
  // Match codemap://project/{projectId}/code_map.json
  const codeMapMatch = uri.match(
    /^codemap:\/\/project\/([a-zA-Z0-9_\-]+)\/code_map\.json$/,
  );
  if (codeMapMatch) {
    return {
      projectId: codeMapMatch[1],
      resourceType: "code_map",
    };
  }

  // Match codemap://project/{projectId}/summary
  const summaryMatch = uri.match(
    /^codemap:\/\/project\/([a-zA-Z0-9_\-]+)\/summary$/,
  );
  if (summaryMatch) {
    return {
      projectId: summaryMatch[1],
      resourceType: "summary",
    };
  }

  return null;
}

/**
 * Generate a text summary of the CodeMap
 *
 * Creates a human-readable summary of the project architecture,
 * including module structure, key symbols, and dependency statistics.
 *
 * @param codeMap - The CodeMap object to summarize
 * @returns Text summary of the architecture
 */
export function generateSummary(codeMap: CodeMap): string {
  const modules = extractModules(codeMap);
  const stats = calculateStats(codeMap);

  const lines: string[] = [
    "# Architecture Summary",
    "",
    `## Project Information`,
    `- Source Root: ${codeMap.source_root}`,
    `- Generated: ${codeMap.generated_at}`,
    `- Schema Version: ${codeMap.version}`,
    "",
    `## Statistics`,
    `- Total Symbols: ${codeMap.symbols.length}`,
    `- Total Dependencies: ${codeMap.dependencies.length}`,
    `- Modules: ${modules.size}`,
    `- Classes: ${stats.classes}`,
    `- Functions: ${stats.functions}`,
    `- Methods: ${stats.methods}`,
    "",
    `## Module Structure`,
  ];

  // Group symbols by module
  const byModule = new Map<string, string[]>();
  for (const symbol of codeMap.symbols) {
    const parts = symbol.qualified_name.split(".");
    const module = parts.slice(0, -1).join(".") || symbol.qualified_name;

    if (!byModule.has(module)) {
      byModule.set(module, []);
    }
    byModule.get(module)!.push(symbol.qualified_name);
  }

  // Add modules to summary
  const sortedModules = Array.from(byModule.keys()).sort();
  for (const module of sortedModules) {
    const symbols = byModule.get(module) || [];
    lines.push(`- ${module}: ${symbols.length} symbols`);
  }

  lines.push("");
  lines.push(`## Dependency Hotspots`);
  const hotspots = findHotspots(codeMap);
  if (hotspots.length > 0) {
    for (const [symbol, count] of hotspots.slice(0, 5)) {
      lines.push(`- ${symbol}: ${count} dependents`);
    }
  } else {
    lines.push("- No dependency hotspots detected");
  }

  return lines.join("\n");
}

/**
 * Extract unique modules from CodeMap
 *
 * @param codeMap - The CodeMap object
 * @returns Set of module names
 */
function extractModules(codeMap: CodeMap): Set<string> {
  const modules = new Set<string>();

  for (const symbol of codeMap.symbols) {
    const parts = symbol.qualified_name.split(".");
    if (parts.length > 1) {
      modules.add(parts[0]);
    }
  }

  return modules;
}

/**
 * Calculate statistics about symbols in CodeMap
 *
 * @param codeMap - The CodeMap object
 * @returns Statistics object
 */
function calculateStats(codeMap: CodeMap): {
  classes: number;
  functions: number;
  methods: number;
} {
  let classes = 0;
  let functions = 0;
  let methods = 0;

  for (const symbol of codeMap.symbols) {
    switch (symbol.kind) {
      case "class":
        classes++;
        break;
      case "function":
        functions++;
        break;
      case "method":
        methods++;
        break;
    }
  }

  return { classes, functions, methods };
}

/**
 * Find symbols with the most dependents (hotspots)
 *
 * Returns symbols that are called by many other symbols,
 * indicating they are critical to the codebase.
 *
 * @param codeMap - The CodeMap object
 * @returns Array of [symbol, count] tuples, sorted by count descending
 */
function findHotspots(
  codeMap: CodeMap,
): Array<[string, number]> {
  const dependents = new Map<string, number>();

  // Count how many times each symbol is depended on
  for (const dep of codeMap.dependencies) {
    const current = dependents.get(dep.to_sym) ?? 0;
    dependents.set(dep.to_sym, current + 1);
  }

  // Sort by count descending
  return Array.from(dependents.entries()).sort((a, b) => b[1] - a[1]);
}

/**
 * Read a resource and return its content
 *
 * Supports two resource types:
 * - code_map: Returns the full CODE_MAP.json
 * - summary: Returns a text summary of the architecture
 *
 * @param uri - The resource URI to read
 * @param storage - Storage service for accessing project data
 * @param userId - User ID for data access control
 * @returns Resource content, or error object
 */
export async function readResource(
  uri: string,
  storage: CodeMapStorage,
  userId: string,
): Promise<ResourceContent | { error: string; code: number }> {
  // Parse the URI
  const parsed = parseResourceUri(uri);
  if (!parsed) {
    return {
      error: `Invalid resource URI: ${uri}`,
      code: -32602,
    };
  }

  const { projectId, resourceType } = parsed;

  // Fetch the CodeMap
  let codeMap: CodeMap | null;
  try {
    codeMap = await storage.getCodeMap(userId, projectId);
  } catch {
    return {
      error: `Failed to read project: ${projectId}`,
      code: -32603,
    };
  }

  if (!codeMap) {
    return {
      error: `Project not found: ${projectId}`,
      code: -32602,
    };
  }

  // Generate the appropriate resource content
  if (resourceType === "code_map") {
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(codeMap, null, 2),
    };
  } else if (resourceType === "summary") {
    return {
      uri,
      mimeType: "text/plain",
      text: generateSummary(codeMap),
    };
  }

  return {
    error: `Unknown resource type: ${resourceType}`,
    code: -32602,
  };
}
