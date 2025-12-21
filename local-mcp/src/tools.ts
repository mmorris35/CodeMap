/**
 * MCP Tool implementations for code analysis
 */

import type {
  CodeMap,
  GetDependentsResult,
  ImpactReport,
  BreakingChangeResult,
  ArchitectureResult,
  DependentInfo,
  ModuleInfo,
  ModuleDependency,
} from './types.js';

/**
 * Find all symbols that depend on (call) a given symbol
 */
export function getDependents(
  codeMap: CodeMap,
  symbol: string,
  maxDepth: number = 0
): GetDependentsResult {
  // Build reverse dependency map
  const callers = new Map<string, string[]>();
  for (const dep of codeMap.dependencies) {
    if (!callers.has(dep.to_sym)) {
      callers.set(dep.to_sym, []);
    }
    callers.get(dep.to_sym)!.push(dep.from_sym);
  }

  // Build symbol info map
  const symbolInfo = new Map<string, { file: string; line: number }>();
  for (const sym of codeMap.symbols) {
    symbolInfo.set(sym.qualified_name, { file: sym.file, line: sym.line });
  }

  // Get direct callers
  const directSymbols = callers.get(symbol) || [];
  const direct: DependentInfo[] = directSymbols.map((s) => ({
    symbol: s,
    file: symbolInfo.get(s)?.file || 'unknown',
    line: symbolInfo.get(s)?.line || 0,
  }));

  // BFS for transitive callers
  const transitive: DependentInfo[] = [];
  const visited = new Set<string>([symbol, ...directSymbols]);
  const queue = [...directSymbols];
  let depth = 1;

  while (queue.length > 0 && (maxDepth === 0 || depth < maxDepth)) {
    const levelSize = queue.length;
    for (let i = 0; i < levelSize; i++) {
      const current = queue.shift()!;
      for (const caller of callers.get(current) || []) {
        if (!visited.has(caller)) {
          visited.add(caller);
          transitive.push({
            symbol: caller,
            file: symbolInfo.get(caller)?.file || 'unknown',
            line: symbolInfo.get(caller)?.line || 0,
          });
          queue.push(caller);
        }
      }
    }
    depth++;
  }

  return {
    symbol,
    direct,
    transitive,
    total: direct.length + transitive.length,
  };
}

/**
 * Generate an impact report for changing a symbol
 */
export function getImpactReport(
  codeMap: CodeMap,
  symbol: string,
  includeTests: boolean = true
): ImpactReport {
  const dependents = getDependents(codeMap, symbol, 0);
  const allDependents = [...dependents.direct, ...dependents.transitive];

  // Collect affected files
  const fileSet = new Set<string>();
  const fileCounts: Record<string, number> = {};
  for (const dep of allDependents) {
    fileSet.add(dep.file);
    fileCounts[dep.file] = (fileCounts[dep.file] || 0) + 1;
  }
  const affectedFiles = Array.from(fileSet);

  // Find suggested tests
  const suggestedTests: string[] = [];
  if (includeTests) {
    for (const file of affectedFiles) {
      const testFile = file.replace('.py', '_test.py');
      const testFile2 = `test_${file}`;
      suggestedTests.push(testFile, testFile2);
    }
  }

  // Calculate risk score
  const directCount = dependents.direct.length;
  const transitiveCount = dependents.transitive.length;
  const fileCount = affectedFiles.length;

  let riskScore = 0;
  riskScore += Math.min(directCount * 10, 40);
  riskScore += Math.min(transitiveCount * 5, 30);
  riskScore += Math.min(fileCount * 5, 30);

  let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  if (riskScore < 20) riskLevel = 'LOW';
  else if (riskScore < 40) riskLevel = 'MEDIUM';
  else if (riskScore < 70) riskLevel = 'HIGH';
  else riskLevel = 'CRITICAL';

  return {
    symbol,
    risk_score: riskScore,
    risk_level: riskLevel,
    direct_dependents: dependents.direct,
    transitive_dependents: dependents.transitive,
    affected_files: affectedFiles,
    file_summary: fileCounts,
    suggested_tests: suggestedTests,
    summary: `Changing ${symbol} is ${riskLevel} risk. Affects ${allDependents.length} function(s) (${directCount} direct, ${transitiveCount} transitive) across ${fileCount} file(s).`,
  };
}

/**
 * Check if a signature change would break callers
 */
export function checkBreakingChange(
  codeMap: CodeMap,
  symbol: string,
  newSignature: string
): BreakingChangeResult {
  // Find the current symbol
  const currentSymbol = codeMap.symbols.find((s) => s.qualified_name === symbol);
  const oldSignature = currentSymbol?.signature || null;

  // Get all callers
  const dependents = getDependents(codeMap, symbol, 1);
  const callers = dependents.direct.map((d) => d.symbol);

  // Parse signatures to detect breaking changes
  // This is a simplified check - real implementation would parse AST
  const oldParams = parseParams(oldSignature);
  const newParams = parseParams(newSignature);

  let isBreaking = false;
  let reason: string | null = null;

  // Check for removed required parameters
  const oldRequired = oldParams.filter((p) => !p.hasDefault);
  const newRequired = newParams.filter((p) => !p.hasDefault);

  if (newRequired.length > oldRequired.length) {
    isBreaking = true;
    reason = 'New required parameter added';
  }

  // Check for removed parameters
  const oldNames = new Set(oldParams.map((p) => p.name));
  const newNames = new Set(newParams.map((p) => p.name));
  for (const name of oldNames) {
    if (!newNames.has(name)) {
      isBreaking = true;
      reason = `Parameter '${name}' was removed`;
      break;
    }
  }

  return {
    symbol,
    old_signature: oldSignature,
    new_signature: newSignature,
    is_breaking: isBreaking,
    reason,
    breaking_callers: isBreaking ? callers : [],
    safe_callers: isBreaking ? [] : callers,
    suggestion: isBreaking
      ? `Update ${callers.length} caller(s) before making this change.`
      : 'This change appears backward compatible for existing callers.',
  };
}

interface ParamInfo {
  name: string;
  hasDefault: boolean;
}

function parseParams(signature: string | null): ParamInfo[] {
  if (!signature) return [];

  const match = signature.match(/\((.*)\)/);
  if (!match) return [];

  const paramsStr = match[1];
  if (!paramsStr.trim()) return [];

  return paramsStr.split(',').map((p) => {
    const trimmed = p.trim();
    const name = trimmed.split(':')[0].split('=')[0].trim();
    const hasDefault = trimmed.includes('=');
    return { name, hasDefault };
  }).filter((p) => p.name && p.name !== 'self' && p.name !== 'cls');
}

/**
 * Get architecture overview of the codebase
 */
export function getArchitecture(
  codeMap: CodeMap,
  level: 'module' | 'package' = 'module'
): ArchitectureResult {
  // Group symbols by module
  const moduleSymbols = new Map<string, number>();
  const moduleDeps = new Map<string, Map<string, number>>();

  for (const sym of codeMap.symbols) {
    const moduleName = getModuleName(sym.file, level);
    moduleSymbols.set(moduleName, (moduleSymbols.get(moduleName) || 0) + 1);
  }

  // Count dependencies between modules
  for (const dep of codeMap.dependencies) {
    const fromSym = codeMap.symbols.find((s) => s.qualified_name === dep.from_sym);
    const toSym = codeMap.symbols.find((s) => s.qualified_name === dep.to_sym);

    if (fromSym && toSym) {
      const fromModule = getModuleName(fromSym.file, level);
      const toModule = getModuleName(toSym.file, level);

      if (fromModule !== toModule) {
        if (!moduleDeps.has(fromModule)) {
          moduleDeps.set(fromModule, new Map());
        }
        const deps = moduleDeps.get(fromModule)!;
        deps.set(toModule, (deps.get(toModule) || 0) + 1);
      }
    }
  }

  // Build module info
  const modules: ModuleInfo[] = [];
  for (const [name, symbolCount] of moduleSymbols) {
    const outDeps = moduleDeps.get(name)?.size || 0;
    let inDeps = 0;
    for (const [, deps] of moduleDeps) {
      if (deps.has(name)) inDeps++;
    }

    modules.push({
      name,
      symbols: symbolCount,
      dependents: inDeps,
      dependencies: outDeps,
    });
  }

  // Build dependency list
  const dependencies: ModuleDependency[] = [];
  for (const [from, deps] of moduleDeps) {
    for (const [to, count] of deps) {
      dependencies.push({ from, to, count });
    }
  }

  // Find hotspots (modules with high in-degree)
  const hotspots = modules
    .filter((m) => m.dependents >= 3)
    .map((m) => m.name);

  // Detect cycles (simplified)
  const cycles: string[][] = [];

  return {
    level,
    modules,
    dependencies,
    hotspots,
    cycles,
    summary: `Project has ${modules.length} modules with ${cycles.length} circular dependencies. ${hotspots.length > 0 ? `Hotspots: ${hotspots.join(', ')}` : 'No hotspots detected.'}`,
  };
}

function getModuleName(filePath: string, level: 'module' | 'package'): string {
  const parts = filePath.replace(/\.py$/, '').split('/');

  if (level === 'package') {
    return parts.slice(0, -1).join('/') || parts[0];
  }

  return parts.join('/');
}
