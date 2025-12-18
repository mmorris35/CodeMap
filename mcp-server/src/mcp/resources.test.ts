/**
 * Tests for MCP Resource Handler
 * Tests URI parsing, summary generation, and resource reading
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  parseResourceUri,
  generateSummary,
  readResource,
} from "./resources";
import type { CodeMapStorage, CodeMap } from "../storage";

// Mock storage
const createMockStorage = (): CodeMapStorage => {
  return {
    saveCodeMap: vi.fn(),
    getCodeMap: vi.fn(),
    deleteCodeMap: vi.fn(),
    listProjects: vi.fn(),
    saveCache: vi.fn(),
    getCache: vi.fn(),
    deleteCache: vi.fn(),
  } as unknown as CodeMapStorage;
};

// Sample CodeMap for testing
const sampleCodeMap: CodeMap = {
  version: "1.0",
  generated_at: "2024-01-01T00:00:00Z",
  source_root: "/app/src",
  symbols: [
    {
      qualified_name: "auth.validate_token",
      kind: "function",
      file: "auth.ts",
      line: 10,
      docstring: "Validates JWT tokens",
      signature: "function validate_token(token: string): boolean",
    },
    {
      qualified_name: "auth.AuthService",
      kind: "class",
      file: "auth.ts",
      line: 30,
      docstring: "Authentication service",
    },
    {
      qualified_name: "auth.AuthService.login",
      kind: "method",
      file: "auth.ts",
      line: 35,
      docstring: "Login method",
      signature: "login(username: string, password: string): void",
    },
    {
      qualified_name: "db.query",
      kind: "function",
      file: "db.ts",
      line: 5,
      docstring: "Execute database query",
    },
    {
      qualified_name: "main.start",
      kind: "function",
      file: "main.ts",
      line: 1,
      docstring: "Application entry point",
    },
  ],
  dependencies: [
    {
      from_sym: "main.start",
      to_sym: "auth.AuthService.login",
      kind: "calls",
    },
    {
      from_sym: "auth.AuthService.login",
      to_sym: "auth.validate_token",
      kind: "calls",
    },
    {
      from_sym: "auth.validate_token",
      to_sym: "db.query",
      kind: "calls",
    },
  ],
};

describe("Resource URI Parsing", () => {
  it("should parse code_map.json URIs correctly", () => {
    const result = parseResourceUri(
      "codemap://project/my-app/code_map.json",
    );

    expect(result).not.toBeNull();
    expect(result?.projectId).toBe("my-app");
    expect(result?.resourceType).toBe("code_map");
  });

  it("should parse summary URIs correctly", () => {
    const result = parseResourceUri("codemap://project/my-app/summary");

    expect(result).not.toBeNull();
    expect(result?.projectId).toBe("my-app");
    expect(result?.resourceType).toBe("summary");
  });

  it("should handle project IDs with underscores and hyphens", () => {
    const result = parseResourceUri(
      "codemap://project/my_app-v2/code_map.json",
    );

    expect(result).not.toBeNull();
    expect(result?.projectId).toBe("my_app-v2");
  });

  it("should return null for invalid URIs", () => {
    expect(parseResourceUri("invalid://uri")).toBeNull();
    expect(parseResourceUri("codemap://invalid")).toBeNull();
    expect(parseResourceUri("codemap://project/my-app")).toBeNull();
    expect(parseResourceUri("codemap://project/my-app/invalid")).toBeNull();
  });

  it("should be case-sensitive for protocol", () => {
    const result = parseResourceUri("CODEMAP://project/my-app/code_map.json");
    expect(result).toBeNull();
  });

  it("should handle empty project IDs", () => {
    const result = parseResourceUri("codemap://project//code_map.json");
    expect(result).toBeNull();
  });
});

describe("Summary Generation", () => {
  it("should generate a summary with project information", () => {
    const summary = generateSummary(sampleCodeMap);

    expect(summary).toContain("# Architecture Summary");
    expect(summary).toContain("Source Root: /app/src");
    expect(summary).toContain("Generated: 2024-01-01T00:00:00Z");
    expect(summary).toContain("Schema Version: 1.0");
  });

  it("should include statistics in the summary", () => {
    const summary = generateSummary(sampleCodeMap);

    expect(summary).toContain("## Statistics");
    expect(summary).toContain("Total Symbols: 5");
    expect(summary).toContain("Total Dependencies: 3");
    expect(summary).toContain("Classes: 1");
    expect(summary).toContain("Functions: 3");
    expect(summary).toContain("Methods: 1");
  });

  it("should include module structure in the summary", () => {
    const summary = generateSummary(sampleCodeMap);

    expect(summary).toContain("## Module Structure");
    expect(summary).toContain("auth: ");
    expect(summary).toContain("db: ");
    expect(summary).toContain("main: ");
  });

  it("should identify dependency hotspots", () => {
    const summary = generateSummary(sampleCodeMap);

    expect(summary).toContain("## Dependency Hotspots");
    expect(summary).toContain("auth.validate_token");
    expect(summary).toContain("auth.AuthService.login");
  });

  it("should handle CodeMap with no dependencies", () => {
    const codeMapNoDeps: CodeMap = {
      version: "1.0",
      generated_at: "2024-01-01T00:00:00Z",
      source_root: "/app",
      symbols: [
        {
          qualified_name: "module.func",
          kind: "function",
          file: "module.ts",
          line: 1,
          docstring: null,
        },
      ],
      dependencies: [],
    };

    const summary = generateSummary(codeMapNoDeps);

    expect(summary).toContain("No dependency hotspots detected");
  });

  it("should handle CodeMap with no modules", () => {
    const codeMapNoModules: CodeMap = {
      version: "1.0",
      generated_at: "2024-01-01T00:00:00Z",
      source_root: "/app",
      symbols: [
        {
          qualified_name: "standalone_function",
          kind: "function",
          file: "file.ts",
          line: 1,
          docstring: null,
        },
      ],
      dependencies: [],
    };

    const summary = generateSummary(codeMapNoModules);

    expect(summary).toContain("## Module Structure");
    expect(summary).toContain("Total Symbols: 1");
  });
});

describe("Resource Reading", () => {
  let storage: CodeMapStorage;
  const userId = "test-user";

  beforeEach(() => {
    storage = createMockStorage();
  });

  it("should return code_map.json resource", async () => {
    const getCodeMapMock = vi.fn().mockResolvedValue(sampleCodeMap);
    (storage as any).getCodeMap = getCodeMapMock;

    const result = await readResource(
      "codemap://project/test-app/code_map.json",
      storage,
      userId,
    );

    expect("error" in result).toBe(false);
    if ("error" in result) {
      throw new Error("Expected success");
    }

    expect(result.uri).toBe("codemap://project/test-app/code_map.json");
    expect(result.mimeType).toBe("application/json");

    const parsed = JSON.parse(result.text);
    expect(parsed.version).toBe("1.0");
    expect(parsed.symbols.length).toBe(5);
    expect(parsed.dependencies.length).toBe(3);

    expect(getCodeMapMock).toHaveBeenCalledWith(userId, "test-app");
  });

  it("should return summary resource", async () => {
    const getCodeMapMock = vi.fn().mockResolvedValue(sampleCodeMap);
    (storage as any).getCodeMap = getCodeMapMock;

    const result = await readResource(
      "codemap://project/test-app/summary",
      storage,
      userId,
    );

    expect("error" in result).toBe(false);
    if ("error" in result) {
      throw new Error("Expected success");
    }

    expect(result.uri).toBe("codemap://project/test-app/summary");
    expect(result.mimeType).toBe("text/plain");
    expect(result.text).toContain("# Architecture Summary");
    expect(result.text).toContain("Total Symbols: 5");

    expect(getCodeMapMock).toHaveBeenCalledWith(userId, "test-app");
  });

  it("should return error for invalid URI", async () => {
    const result = await readResource(
      "invalid://uri",
      storage,
      userId,
    );

    expect("error" in result).toBe(true);
    if (!("error" in result)) {
      throw new Error("Expected error");
    }

    expect(result.error).toContain("Invalid resource URI");
    expect(result.code).toBe(-32602);
  });

  it("should return error for non-existent project", async () => {
    const getCodeMapMock = vi.fn().mockResolvedValue(null);
    (storage as any).getCodeMap = getCodeMapMock;

    const result = await readResource(
      "codemap://project/non-existent/code_map.json",
      storage,
      userId,
    );

    expect("error" in result).toBe(true);
    if (!("error" in result)) {
      throw new Error("Expected error");
    }

    expect(result.error).toContain("Project not found");
    expect(result.code).toBe(-32602);

    expect(getCodeMapMock).toHaveBeenCalledWith(userId, "non-existent");
  });

  it("should return error if storage throws", async () => {
    const getCodeMapMock = vi
      .fn()
      .mockRejectedValue(new Error("Storage error"));
    (storage as any).getCodeMap = getCodeMapMock;

    const result = await readResource(
      "codemap://project/test-app/code_map.json",
      storage,
      userId,
    );

    expect("error" in result).toBe(true);
    if (!("error" in result)) {
      throw new Error("Expected error");
    }

    expect(result.error).toContain("Failed to read project");
    expect(result.code).toBe(-32603);
  });

  it("should handle CodeMap with missing optional fields", async () => {
    const minimalCodeMap: CodeMap = {
      version: "1.0",
      generated_at: "2024-01-01T00:00:00Z",
      source_root: "/app",
      symbols: [],
      dependencies: [],
    };

    const getCodeMapMock = vi.fn().mockResolvedValue(minimalCodeMap);
    (storage as any).getCodeMap = getCodeMapMock;

    const result = await readResource(
      "codemap://project/test-app/code_map.json",
      storage,
      userId,
    );

    expect("error" in result).toBe(false);
    if ("error" in result) {
      throw new Error("Expected success");
    }

    const parsed = JSON.parse(result.text);
    expect(parsed.symbols).toEqual([]);
    expect(parsed.dependencies).toEqual([]);
  });

  it("should preserve JSON formatting in code_map.json resource", async () => {
    const getCodeMapMock = vi.fn().mockResolvedValue(sampleCodeMap);
    (storage as any).getCodeMap = getCodeMapMock;

    const result = await readResource(
      "codemap://project/test-app/code_map.json",
      storage,
      userId,
    );

    expect("error" in result).toBe(false);
    if ("error" in result) {
      throw new Error("Expected success");
    }

    // Check that JSON is formatted with indentation
    expect(result.text).toContain("\n");
    expect(result.text).toMatch(/^{/);
    expect(result.text).toContain('"version"');
  });
});

describe("Resource URI Edge Cases", () => {
  it("should accept numeric project IDs", () => {
    const result = parseResourceUri(
      "codemap://project/12345/code_map.json",
    );

    expect(result).not.toBeNull();
    expect(result?.projectId).toBe("12345");
  });

  it("should not accept special characters in project ID", () => {
    const result = parseResourceUri(
      "codemap://project/my@app/code_map.json",
    );

    expect(result).toBeNull();
  });

  it("should not accept paths with trailing slashes", () => {
    const result = parseResourceUri(
      "codemap://project/my-app/code_map.json/",
    );

    expect(result).toBeNull();
  });

  it("should handle URIs with different orderings correctly", () => {
    // This should still work - the regex is order-specific
    const result1 = parseResourceUri(
      "codemap://project/my-app/summary",
    );
    const result2 = parseResourceUri(
      "codemap://project/my-app/code_map.json",
    );

    expect(result1?.resourceType).toBe("summary");
    expect(result2?.resourceType).toBe("code_map");
  });
});

describe("Summary Generation Edge Cases", () => {
  it("should handle very long symbol names", () => {
    const longNameCodeMap: CodeMap = {
      version: "1.0",
      generated_at: "2024-01-01T00:00:00Z",
      source_root: "/app",
      symbols: [
        {
          qualified_name:
            "very.long.nested.module.structure.with.many.parts.VeryLongClassName.veryLongMethodNameWithManyWords",
          kind: "method",
          file: "file.ts",
          line: 1,
          docstring: null,
        },
      ],
      dependencies: [],
    };

    const summary = generateSummary(longNameCodeMap);

    expect(summary).toContain("Total Symbols: 1");
    expect(summary).toContain("Methods: 1");
  });

  it("should count all symbol kinds correctly", () => {
    const allKindsCodeMap: CodeMap = {
      version: "1.0",
      generated_at: "2024-01-01T00:00:00Z",
      source_root: "/app",
      symbols: [
        {
          qualified_name: "mod",
          kind: "module",
          file: "mod.ts",
          line: 1,
          docstring: null,
        },
        {
          qualified_name: "MyClass",
          kind: "class",
          file: "file.ts",
          line: 2,
          docstring: null,
        },
        {
          qualified_name: "func",
          kind: "function",
          file: "file.ts",
          line: 3,
          docstring: null,
        },
        {
          qualified_name: "MyClass.method",
          kind: "method",
          file: "file.ts",
          line: 4,
          docstring: null,
        },
      ],
      dependencies: [],
    };

    const summary = generateSummary(allKindsCodeMap);

    expect(summary).toContain("Classes: 1");
    expect(summary).toContain("Functions: 1");
    expect(summary).toContain("Methods: 1");
  });

  it("should handle symbols with many dependents", () => {
    const manyDepsCodeMap: CodeMap = {
      version: "1.0",
      generated_at: "2024-01-01T00:00:00Z",
      source_root: "/app",
      symbols: [
        {
          qualified_name: "core.util",
          kind: "function",
          file: "util.ts",
          line: 1,
          docstring: null,
        },
        {
          qualified_name: "a.caller1",
          kind: "function",
          file: "a.ts",
          line: 1,
          docstring: null,
        },
        {
          qualified_name: "b.caller2",
          kind: "function",
          file: "b.ts",
          line: 1,
          docstring: null,
        },
        {
          qualified_name: "c.caller3",
          kind: "function",
          file: "c.ts",
          line: 1,
          docstring: null,
        },
      ],
      dependencies: [
        {
          from_sym: "a.caller1",
          to_sym: "core.util",
          kind: "calls",
        },
        {
          from_sym: "b.caller2",
          to_sym: "core.util",
          kind: "calls",
        },
        {
          from_sym: "c.caller3",
          to_sym: "core.util",
          kind: "calls",
        },
      ],
    };

    const summary = generateSummary(manyDepsCodeMap);

    expect(summary).toContain("core.util: 3 dependents");
  });
});
