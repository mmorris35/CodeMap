/**
 * MCP Tool: get_architecture
 * Analyzes code structure to provide high-level architecture overview
 */

import type {
  CodeMapStorage,
  Dependency,
  Symbol as CodeMapSymbol,
} from "../../storage";
import type { ToolCallResponse } from "../types";

/**
 * Module or package-level aggregation in the architecture
 */
export interface ArchitectureModule {
  name: string;
  symbols: number;
  dependents: number;
  dependencies: number;
}

/**
 * Module-level dependency
 */
export interface ModuleDependency {
  from: string;
  to: string;
  count: number;
}

/**
 * Module with many dependents (risk hotspot)
 */
export interface Hotspot {
  name: string;
  dependents: number;
  risk: "HIGH" | "MEDIUM";
}

/**
 * Complete architecture overview
 */
export interface ArchitectureOverview {
  level: "module" | "package";
  modules: ArchitectureModule[];
  dependencies: ModuleDependency[];
  hotspots: Hotspot[];
  cycles: string[][];
  summary: string;
}

/**
 * Extract module name from file path based on aggregation level
 *
 * @param file - File path (e.g., "auth/validators.py")
 * @param level - Aggregation level: 'module' uses full path (auth/validators),
 *                'package' uses top-level directory (auth)
 * @returns Module name at the specified level
 */
function getModuleName(file: string, level: "module" | "package"): string {
  // Remove file extension
  const withoutExt = file.replace(/\.[^/.]+$/, "");

  if (level === "package") {
    // Get top-level directory
    const parts = withoutExt.split("/");
    return parts[0] || "root";
  }

  // level === 'module': return full path without extension
  return withoutExt;
}

/**
 * Aggregate symbols by module or package
 *
 * Groups all symbols by their module/package and counts them.
 * Returns map of module name to symbol count.
 *
 * @param symbols - All symbols from CodeMap
 * @param level - Aggregation level
 * @returns Map of module name to symbol count
 */
function aggregateSymbols(
  symbols: CodeMapSymbol[],
  level: "module" | "package",
): Map<string, number> {
  const moduleMap = new Map<string, number>();

  for (const symbol of symbols) {
    const moduleName = getModuleName(symbol.file, level);
    const count = moduleMap.get(moduleName) || 0;
    moduleMap.set(moduleName, count + 1);
  }

  return moduleMap;
}

/**
 * Build symbol-to-module mapping
 *
 * Creates a map from symbol name to its module for quick lookup.
 *
 * @param symbols - All symbols from CodeMap
 * @param level - Aggregation level
 * @returns Map of symbol name to module name
 */
function buildSymbolToModuleMap(
  symbols: CodeMapSymbol[],
  level: "module" | "package",
): Map<string, string> {
  const map = new Map<string, string>();

  for (const symbol of symbols) {
    const moduleName = getModuleName(symbol.file, level);
    map.set(symbol.qualified_name, moduleName);
  }

  return map;
}

/**
 * Calculate module-level dependencies
 *
 * Converts symbol-level dependencies to module-level dependencies.
 * Multiple symbol dependencies between the same two modules are counted.
 *
 * @param dependencies - Symbol-level dependencies from CodeMap
 * @param symbolToModule - Mapping of symbols to their modules
 * @returns Array of module-level dependencies with counts
 */
function calculateModuleDependencies(
  dependencies: Dependency[],
  symbolToModule: Map<string, string>,
): ModuleDependency[] {
  const depMap = new Map<string, number>();

  for (const dep of dependencies) {
    const fromModule = symbolToModule.get(dep.from_sym);
    const toModule = symbolToModule.get(dep.to_sym);

    // Skip if either symbol's module is not found
    if (!fromModule || !toModule) {
      continue;
    }

    // Skip self-dependencies
    if (fromModule === toModule) {
      continue;
    }

    // Use a composite key to track unique dependencies
    const key = `${fromModule}→${toModule}`;
    const count = depMap.get(key) || 0;
    depMap.set(key, count + 1);
  }

  // Convert to array of dependencies
  const result: ModuleDependency[] = [];
  for (const [key, count] of depMap) {
    const [from, to] = key.split("→");
    result.push({
      from: from || "",
      to: to || "",
      count,
    });
  }

  return result;
}

/**
 * Calculate dependent count for each module
 *
 * Counts how many other modules depend on (import/call) each module.
 *
 * @param moduleDeps - Module-level dependencies
 * @param allModules - Set of all module names
 * @returns Map of module name to dependent count
 */
function calculateDependentCounts(
  moduleDeps: ModuleDependency[],
  allModules: Set<string>,
): Map<string, number> {
  const dependentMap = new Map<string, number>();

  // Initialize all modules with 0 dependents
  for (const module of allModules) {
    dependentMap.set(module, 0);
  }

  // Count dependents
  for (const dep of moduleDeps) {
    const currentCount = dependentMap.get(dep.to) || 0;
    dependentMap.set(dep.to, currentCount + 1);
  }

  return dependentMap;
}

/**
 * Calculate dependency count for each module
 *
 * Counts how many other modules each module depends on.
 *
 * @param moduleDeps - Module-level dependencies
 * @param allModules - Set of all module names
 * @returns Map of module name to dependency count
 */
function calculateDependencyCounts(
  moduleDeps: ModuleDependency[],
  allModules: Set<string>,
): Map<string, number> {
  const dependencyMap = new Map<string, number>();

  // Initialize all modules with 0 dependencies
  for (const module of allModules) {
    dependencyMap.set(module, 0);
  }

  // Count dependencies
  for (const dep of moduleDeps) {
    const currentCount = dependencyMap.get(dep.from) || 0;
    dependencyMap.set(dep.from, currentCount + 1);
  }

  return dependencyMap;
}

/**
 * Find hotspot modules with many dependents
 *
 * A module is a hotspot if it has more than 5 dependents.
 * Risk is HIGH if > 10 dependents, MEDIUM if 6-10.
 *
 * @param modules - Array of modules with metadata
 * @param dependentCounts - Map of module to dependent count
 * @returns Array of hotspot modules, sorted by dependents descending
 */
function findHotspots(
  modules: ArchitectureModule[],
  dependentCounts: Map<string, number>,
): Hotspot[] {
  const hotspots: Hotspot[] = [];

  for (const module of modules) {
    const dependents = dependentCounts.get(module.name) || 0;

    // Hotspot threshold is > 5 dependents
    if (dependents > 5) {
      const risk = dependents > 10 ? "HIGH" : "MEDIUM";
      hotspots.push({
        name: module.name,
        dependents,
        risk,
      });
    }
  }

  // Sort by dependent count descending
  hotspots.sort((a, b) => b.dependents - a.dependents);

  return hotspots;
}

/**
 * Detect cycles in module dependency graph using DFS
 *
 * Finds all circular dependency paths in the module graph.
 * Uses depth-first search to identify cycles.
 *
 * @param moduleDeps - Module-level dependencies
 * @param modules - Set of all module names
 * @returns Array of cycle paths, where each path is an array of module names
 */
function detectCycles(
  moduleDeps: ModuleDependency[],
  modules: Set<string>,
): string[][] {
  // Build adjacency list
  const graph = new Map<string, Set<string>>();
  for (const module of modules) {
    graph.set(module, new Set());
  }

  for (const dep of moduleDeps) {
    const deps = graph.get(dep.from) || new Set();
    deps.add(dep.to);
    graph.set(dep.from, deps);
  }

  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  /**
   * DFS helper function to detect cycles
   * @param node - Current node being visited
   * @param path - Current path from start node
   */
  function dfs(node: string, path: string[]): void {
    visited.add(node);
    recursionStack.add(node);
    path.push(node);

    const neighbors = graph.get(node) || new Set();
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs(neighbor, [...path]);
      } else if (recursionStack.has(neighbor)) {
        // Found a cycle - extract the cycle path
        const cycleStart = path.indexOf(neighbor);
        if (cycleStart !== -1) {
          const cyclePath = path.slice(cycleStart);
          cyclePath.push(neighbor); // Complete the cycle
          cycles.push(cyclePath);
        }
      }
    }

    recursionStack.delete(node);
  }

  // Run DFS from all unvisited nodes
  for (const module of modules) {
    if (!visited.has(module)) {
      dfs(module, []);
    }
  }

  // Remove duplicate cycles
  const uniqueCycles = new Map<string, string[]>();
  for (const cycle of cycles) {
    const key = cycle.slice(0, -1).sort().join("→");
    if (!uniqueCycles.has(key)) {
      uniqueCycles.set(key, cycle);
    }
  }

  return Array.from(uniqueCycles.values());
}

/**
 * Analyze code architecture from CodeMap
 *
 * Provides high-level overview of module structure, dependencies, hotspots,
 * and circular dependencies. Can aggregate at module (file) or package (directory) level.
 *
 * @param storage - Storage service for accessing CodeMap
 * @param userId - User ID for scoped access
 * @param projectId - Project identifier
 * @param level - Aggregation level: 'module' (file) or 'package' (directory), default 'module'
 * @returns Architecture overview with modules, dependencies, hotspots, and cycles
 * @throws Error if project not found
 */
export async function getArchitecture(
  storage: CodeMapStorage,
  userId: string,
  projectId: string,
  level: "module" | "package" = "module",
): Promise<ArchitectureOverview> {
  // Load CodeMap from storage
  const codeMap = await storage.getCodeMap(userId, projectId);
  if (!codeMap) {
    throw new Error(`Project not found: ${projectId}`);
  }

  // Aggregate symbols by module/package
  const symbolCountMap = aggregateSymbols(codeMap.symbols, level);
  const symbolToModuleMap = buildSymbolToModuleMap(codeMap.symbols, level);

  // Calculate module-level dependencies
  const moduleDeps = calculateModuleDependencies(
    codeMap.dependencies,
    symbolToModuleMap,
  );

  // Get all module names
  const allModules = new Set(symbolCountMap.keys());

  // Calculate dependent and dependency counts
  const dependentCounts = calculateDependentCounts(moduleDeps, allModules);
  const dependencyCounts = calculateDependencyCounts(moduleDeps, allModules);

  // Build module array with metadata
  const modules: ArchitectureModule[] = Array.from(allModules).map(
    (moduleName) => ({
      name: moduleName,
      symbols: symbolCountMap.get(moduleName) || 0,
      dependents: dependentCounts.get(moduleName) || 0,
      dependencies: dependencyCounts.get(moduleName) || 0,
    }),
  );

  // Sort modules by name for consistency
  modules.sort((a, b) => a.name.localeCompare(b.name));

  // Find hotspots
  const hotspots = findHotspots(modules, dependentCounts);

  // Detect cycles
  const cycles = detectCycles(moduleDeps, allModules);

  // Generate summary
  const summary = `Project has ${modules.length} ${level}s with ${cycles.length} circular ${
    cycles.length === 1 ? "dependency" : "dependencies"
  }. ${hotspots.length > 0 ? `${hotspots.length} hotspot(s) detected.` : "No hotspots detected."}`;

  return {
    level,
    modules,
    dependencies: moduleDeps,
    hotspots,
    cycles,
    summary,
  };
}

/**
 * Handle get_architecture tool call from MCP request
 *
 * @param storage - Storage service
 * @param userId - User ID for scoped access
 * @param args - Tool arguments including projectId and optional level
 * @returns MCP tool response with architecture overview or error
 */
export async function handleGetArchitecture(
  storage: CodeMapStorage,
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolCallResponse> {
  try {
    // Validate required arguments
    const projectId = args.project_id;
    const levelArg = args.level;

    if (typeof projectId !== "string" || !projectId.trim()) {
      return {
        content: [
          {
            type: "text",
            text: "Error: project_id must be a non-empty string",
          },
        ],
        isError: true,
      };
    }

    let level: "module" | "package" = "module";
    if (levelArg !== undefined) {
      if (typeof levelArg !== "string") {
        return {
          content: [
            {
              type: "text",
              text: 'Error: level must be a string ("module" or "package")',
            },
          ],
          isError: true,
        };
      }

      if (levelArg !== "module" && levelArg !== "package") {
        return {
          content: [
            {
              type: "text",
              text: 'Error: level must be either "module" or "package"',
            },
          ],
          isError: true,
        };
      }

      level = levelArg;
    }

    // Call the tool implementation
    const result = await getArchitecture(storage, userId, projectId, level);

    // Format response as JSON
    const responseText = JSON.stringify(result, null, 2);

    return {
      content: [
        {
          type: "text",
          text: responseText,
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `Error: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
}
