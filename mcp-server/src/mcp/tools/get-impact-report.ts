/**
 * MCP Tool: get_impact_report
 * Comprehensive impact analysis for code changes
 * Calculates risk scores, identifies affected files, and suggests tests
 */

import type { CodeMapStorage, Symbol } from "../../storage";
import { getDependents } from "./get-dependents";
import type { ToolCallResponse } from "../types";

/**
 * Risk levels based on risk score
 */
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/**
 * Result structure for get_impact_report tool
 */
export interface ImpactReport {
  symbol: string;
  risk_score: number;
  risk_level: RiskLevel;
  direct_dependents: Array<{
    symbol: string;
    file: string;
    line: number;
  }>;
  transitive_dependents: Array<{
    symbol: string;
    file: string;
    line: number;
  }>;
  affected_files: string[];
  file_summary: Record<string, number>; // file -> count of affected symbols
  suggested_tests: string[];
  summary: string;
}

/**
 * Calculate risk score based on impact factors
 *
 * Formula: min(100, (directCount * 10) + (transitiveCount * 3) + (fileCount * 5))
 *
 * @param directCount - Number of direct dependents
 * @param transitiveCount - Number of transitive dependents
 * @param fileCount - Number of affected files
 * @returns Risk score in range 0-100
 */
function calculateRiskScore(
  directCount: number,
  transitiveCount: number,
  fileCount: number,
): number {
  const score = directCount * 10 + transitiveCount * 3 + fileCount * 5;
  return Math.min(100, score);
}

/**
 * Determine risk level from risk score
 *
 * @param riskScore - Risk score (0-100)
 * @returns Risk level
 */
export function getRiskLevel(riskScore: number): RiskLevel {
  if (riskScore < 25) return "LOW";
  if (riskScore < 50) return "MEDIUM";
  if (riskScore < 75) return "HIGH";
  return "CRITICAL";
}

/**
 * Check if a file is a test file based on naming patterns
 *
 * @param filePath - File path to check
 * @returns True if file appears to be a test file
 */
function isTestFile(filePath: string): boolean {
  const fileName = filePath.split("/").pop() || "";
  return (
    fileName.startsWith("test_") ||
    fileName.endsWith("_test.ts") ||
    fileName.endsWith("_test.js") ||
    fileName.endsWith(".test.ts") ||
    fileName.endsWith(".test.js")
  );
}

/**
 * Extract unique files from a list of symbols
 *
 * @param symbols - Array of symbols with file information
 * @returns Array of unique file paths
 */
function extractUniqueFiles(symbols: Array<{ file: string }>): string[] {
  const files = new Set<string>();
  for (const sym of symbols) {
    files.add(sym.file);
  }
  return Array.from(files).sort();
}

/**
 * Create a summary of files with count of affected symbols per file
 *
 * @param symbols - Array of symbols with file information
 * @returns Record mapping file paths to count of affected symbols
 */
function createFileSummary(
  symbols: Array<{ file: string }>,
): Record<string, number> {
  const summary: Record<string, number> = {};
  for (const sym of symbols) {
    summary[sym.file] = (summary[sym.file] || 0) + 1;
  }
  return summary;
}

/**
 * Find potential test files based on naming patterns
 *
 * @param affectedFiles - List of affected source files
 * @param allSymbols - All symbols in the codebase
 * @param includeTests - Whether to include test files in suggestions
 * @returns Array of suggested test file paths
 */
function findTestFiles(
  affectedFiles: string[],
  allSymbols: Symbol[],
  includeTests: boolean,
): string[] {
  if (!includeTests) {
    return [];
  }

  const testFiles = new Set<string>();

  // For each affected file, look for corresponding test files
  for (const affectedFile of affectedFiles) {
    // Extract the base name (e.g., 'api' from 'src/api.ts')
    const baseName =
      affectedFile
        .replace(/\.[^.]+$/, "")
        .split("/")
        .pop() || "";

    // Find all test files that match this base name
    for (const symbol of allSymbols) {
      if (isTestFile(symbol.file)) {
        // Check if the test file name contains the module base name
        if (symbol.file.includes(baseName)) {
          testFiles.add(symbol.file);
        }
      }
    }
  }

  return Array.from(testFiles).sort();
}

/**
 * Generate a human-readable summary of the impact
 *
 * @param symbol - The symbol being analyzed
 * @param directCount - Number of direct dependents
 * @param transitiveCount - Number of transitive dependents
 * @param fileCount - Number of affected files
 * @param riskLevel - The calculated risk level
 * @returns Human-readable summary string
 */
function generateSummary(
  symbol: string,
  directCount: number,
  transitiveCount: number,
  fileCount: number,
  riskLevel: RiskLevel,
): string {
  const totalCount = directCount + transitiveCount;
  return (
    `Changing ${symbol} is ${riskLevel} risk. ` +
    `Affects ${totalCount} function(s) (${directCount} direct, ${transitiveCount} transitive) ` +
    `across ${fileCount} file(s).`
  );
}

/**
 * Generate comprehensive impact analysis for a symbol
 *
 * @param storage - Storage service for accessing CodeMap
 * @param userId - User ID for scoped access
 * @param projectId - Project identifier
 * @param symbol - Target symbol to analyze impact for
 * @param includeTests - Whether to include test files (default: true)
 * @returns Complete impact report
 * @throws Error if project or symbol not found
 */
export async function getImpactReport(
  storage: CodeMapStorage,
  userId: string,
  projectId: string,
  symbol: string,
  includeTests: boolean = true,
): Promise<ImpactReport> {
  // Get dependents using the existing tool
  const dependents = await getDependents(storage, userId, projectId, symbol);

  // Load CodeMap for symbol information
  const codeMap = await storage.getCodeMap(userId, projectId);
  if (!codeMap) {
    throw new Error(`Project not found: ${projectId}`);
  }

  // Extract affected files (exclude test files for non-test impact)
  const allAffectedSymbols = [...dependents.direct, ...dependents.transitive];
  const affectedFiles = extractUniqueFiles(allAffectedSymbols);

  // Calculate risk score
  const directCount = dependents.direct.length;
  const transitiveCount = dependents.transitive.length;
  const fileCount = affectedFiles.length;
  const riskScore = calculateRiskScore(directCount, transitiveCount, fileCount);
  const riskLevel = getRiskLevel(riskScore);

  // Find suggested test files
  const suggestedTests = findTestFiles(
    affectedFiles,
    codeMap.symbols,
    includeTests,
  );

  // Create file summary
  const fileSummary = createFileSummary(allAffectedSymbols);

  // Generate summary text
  const summaryText = generateSummary(
    symbol,
    directCount,
    transitiveCount,
    fileCount,
    riskLevel,
  );

  return {
    symbol,
    risk_score: riskScore,
    risk_level: riskLevel,
    direct_dependents: dependents.direct,
    transitive_dependents: dependents.transitive,
    affected_files: affectedFiles,
    file_summary: fileSummary,
    suggested_tests: suggestedTests,
    summary: summaryText,
  };
}

/**
 * Handle get_impact_report tool call from MCP request
 *
 * @param storage - Storage service
 * @param userId - User ID for scoped access
 * @param args - Tool arguments including projectId, symbol, and optional includeTests
 * @returns MCP tool response with structured result or error
 */
export async function handleGetImpactReport(
  storage: CodeMapStorage,
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolCallResponse> {
  try {
    // Validate required arguments
    const projectId = args.project_id;
    const symbol = args.symbol;
    const includeTests = args.include_tests;

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

    if (typeof symbol !== "string" || !symbol.trim()) {
      return {
        content: [
          {
            type: "text",
            text: "Error: symbol must be a non-empty string",
          },
        ],
        isError: true,
      };
    }

    let includeTestsFlag = true;
    if (includeTests !== undefined) {
      if (typeof includeTests !== "boolean") {
        return {
          content: [
            {
              type: "text",
              text: "Error: include_tests must be a boolean",
            },
          ],
          isError: true,
        };
      }
      includeTestsFlag = includeTests;
    }

    // Call the tool implementation
    const result = await getImpactReport(
      storage,
      userId,
      projectId,
      symbol,
      includeTestsFlag,
    );

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
