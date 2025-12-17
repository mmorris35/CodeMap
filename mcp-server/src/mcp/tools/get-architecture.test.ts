/**
 * Tests for get_architecture MCP tool
 * Comprehensive tests for architecture analysis functionality
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { getArchitecture, handleGetArchitecture } from "./get-architecture";
import type { CodeMapStorage, CodeMap } from "../../storage";

// Mock CodeMap data for testing
const mockCodeMap: CodeMap = {
  version: "1.0",
  generated_at: "2024-12-17T00:00:00Z",
  source_root: "/app",
  symbols: [
    // Auth module
    {
      qualified_name: "auth.validators.validate_token",
      kind: "function",
      file: "auth/validators.py",
      line: 10,
      docstring: "Validate JWT token",
    },
    {
      qualified_name: "auth.utils.decode_jwt",
      kind: "function",
      file: "auth/utils.py",
      line: 20,
      docstring: "Decode JWT",
    },
    // API module
    {
      qualified_name: "api.routes.login",
      kind: "function",
      file: "api/routes.py",
      line: 30,
      docstring: "Login endpoint",
    },
    {
      qualified_name: "api.routes.protected",
      kind: "function",
      file: "api/routes.py",
      line: 40,
      docstring: "Protected endpoint",
    },
    // Middleware module
    {
      qualified_name: "middleware.check_auth",
      kind: "function",
      file: "middleware.py",
      line: 50,
      docstring: "Check authentication",
    },
    // Services module (multiple files)
    {
      qualified_name: "services.user_service",
      kind: "class",
      file: "services/user.py",
      line: 60,
      docstring: "User service",
    },
    {
      qualified_name: "services.auth_service",
      kind: "class",
      file: "services/auth.py",
      line: 70,
      docstring: "Auth service",
    },
    // Database module
    {
      qualified_name: "database.connection",
      kind: "function",
      file: "database.py",
      line: 80,
      docstring: "Get DB connection",
    },
  ],
  dependencies: [
    // API routes depend on auth validators
    {
      from_sym: "api.routes.login",
      to_sym: "auth.validators.validate_token",
      kind: "calls",
    },
    {
      from_sym: "api.routes.protected",
      to_sym: "auth.validators.validate_token",
      kind: "calls",
    },
    // API routes depend on auth utils
    {
      from_sym: "api.routes.login",
      to_sym: "auth.utils.decode_jwt",
      kind: "calls",
    },
    // Middleware depends on auth validators
    {
      from_sym: "middleware.check_auth",
      to_sym: "auth.validators.validate_token",
      kind: "calls",
    },
    // Services depend on API routes
    {
      from_sym: "services.user_service",
      to_sym: "api.routes.login",
      kind: "calls",
    },
    // Services depend on database
    {
      from_sym: "services.user_service",
      to_sym: "database.connection",
      kind: "calls",
    },
    {
      from_sym: "services.auth_service",
      to_sym: "database.connection",
      kind: "calls",
    },
    // Middleware depends on API routes
    {
      from_sym: "middleware.check_auth",
      to_sym: "api.routes.protected",
      kind: "calls",
    },
  ],
};

// CodeMap with circular dependencies for testing
const mockCodeMapWithCycles: CodeMap = {
  version: "1.0",
  generated_at: "2024-12-17T00:00:00Z",
  source_root: "/app",
  symbols: [
    {
      qualified_name: "mod_a.func_a",
      kind: "function",
      file: "mod_a.py",
      line: 10,
    },
    {
      qualified_name: "mod_b.func_b",
      kind: "function",
      file: "mod_b.py",
      line: 20,
    },
    {
      qualified_name: "mod_c.func_c",
      kind: "function",
      file: "mod_c.py",
      line: 30,
    },
  ],
  dependencies: [
    // mod_a -> mod_b -> mod_c -> mod_a (cycle)
    {
      from_sym: "mod_a.func_a",
      to_sym: "mod_b.func_b",
      kind: "calls",
    },
    {
      from_sym: "mod_b.func_b",
      to_sym: "mod_c.func_c",
      kind: "calls",
    },
    {
      from_sym: "mod_c.func_c",
      to_sym: "mod_a.func_a",
      kind: "calls",
    },
  ],
};

// CodeMap with hotspots (many dependents)
const mockCodeMapWithHotspots: CodeMap = {
  version: "1.0",
  generated_at: "2024-12-17T00:00:00Z",
  source_root: "/app",
  symbols: [
    {
      qualified_name: "common.utils",
      kind: "function",
      file: "common.py",
      line: 10,
    },
    ...Array.from({ length: 15 }, (_, i) => ({
      qualified_name: `module${i}.func`,
      kind: "function" as const,
      file: `module${i}.py`,
      line: 20 + i,
    })),
  ],
  dependencies: [
    ...Array.from({ length: 15 }, (_, i) => ({
      from_sym: `module${i}.func`,
      to_sym: "common.utils",
      kind: "calls" as const,
    })),
  ],
};

// Create mock storage
const createMockStorage = (codeMapData?: CodeMap | null): CodeMapStorage => {
  return {
    saveCodeMap: vi.fn(),
    getCodeMap: vi
      .fn()
      .mockResolvedValue(
        codeMapData !== null ? codeMapData || mockCodeMap : null,
      ),
    deleteCodeMap: vi.fn(),
    listProjects: vi.fn(),
    saveCache: vi.fn(),
    getCache: vi.fn(),
    deleteCache: vi.fn(),
  } as unknown as CodeMapStorage;
};

describe("getArchitecture tool", () => {
  let storage: CodeMapStorage;
  const userId = "test-user";
  const projectId = "test-project";

  beforeEach(() => {
    storage = createMockStorage();
  });

  describe("Module-level aggregation (default)", () => {
    it("should aggregate symbols by full file path", async () => {
      const result = await getArchitecture(
        storage,
        userId,
        projectId,
        "module",
      );

      expect(result.level).toBe("module");
      expect(result.modules).toHaveLength(7);

      // Check specific modules
      const authValidators = result.modules.find(
        (m) => m.name === "auth/validators",
      );
      expect(authValidators?.symbols).toBe(1);

      const apiRoutes = result.modules.find((m) => m.name === "api/routes");
      expect(apiRoutes?.symbols).toBe(2);
    });

    it("should calculate module-level dependencies correctly", async () => {
      const result = await getArchitecture(
        storage,
        userId,
        projectId,
        "module",
      );

      // api/routes should depend on auth/validators
      const apiToAuthDep = result.dependencies.find(
        (d) => d.from === "api/routes" && d.to === "auth/validators",
      );
      expect(apiToAuthDep).toBeDefined();
      expect(apiToAuthDep?.count).toBe(2); // login and protected both call validate_token

      // services/user should depend on api/routes
      const servicesToApiDep = result.dependencies.find(
        (d) => d.from === "services/user" && d.to === "api/routes",
      );
      expect(servicesToApiDep).toBeDefined();
    });

    it("should calculate dependent counts correctly", async () => {
      const result = await getArchitecture(
        storage,
        userId,
        projectId,
        "module",
      );

      // auth/validators is called by api/routes and middleware
      const authValidators = result.modules.find(
        (m) => m.name === "auth/validators",
      );
      expect(authValidators?.dependents).toBe(2); // api/routes and middleware

      // api/routes is called by services/user and middleware
      const apiRoutes = result.modules.find((m) => m.name === "api/routes");
      expect(apiRoutes?.dependents).toBe(2); // services/user and middleware
    });

    it("should calculate dependency counts correctly", async () => {
      const result = await getArchitecture(
        storage,
        userId,
        projectId,
        "module",
      );

      // api/routes depends on auth/validators and auth/utils
      const apiRoutes = result.modules.find((m) => m.name === "api/routes");
      expect(apiRoutes?.dependencies).toBe(2); // auth/validators and auth/utils

      // services/user depends on api/routes and database
      const servicesUser = result.modules.find(
        (m) => m.name === "services/user",
      );
      expect(servicesUser?.dependencies).toBe(2);
    });

    it("should exclude self-dependencies", async () => {
      const result = await getArchitecture(
        storage,
        userId,
        projectId,
        "module",
      );

      // Check that no module has itself in dependencies
      for (const dep of result.dependencies) {
        expect(dep.from).not.toBe(dep.to);
      }
    });

    it("should sort modules by name", async () => {
      const result = await getArchitecture(
        storage,
        userId,
        projectId,
        "module",
      );

      // Check that modules are sorted
      for (let i = 1; i < result.modules.length; i++) {
        expect(result.modules[i - 1].name <= result.modules[i].name).toBe(true);
      }
    });
  });

  describe("Package-level aggregation", () => {
    it("should aggregate symbols by top-level directory", async () => {
      const result = await getArchitecture(
        storage,
        userId,
        projectId,
        "package",
      );

      expect(result.level).toBe("package");

      // Should have fewer packages than modules
      expect(result.modules.length).toBeLessThan(8);

      // Check specific packages
      const authPkg = result.modules.find((m) => m.name === "auth");
      expect(authPkg?.symbols).toBe(2); // validate_token + decode_jwt

      const apiPkg = result.modules.find((m) => m.name === "api");
      expect(apiPkg?.symbols).toBe(2); // login + protected

      const servicesPkg = result.modules.find((m) => m.name === "services");
      expect(servicesPkg?.symbols).toBe(2); // user_service + auth_service
    });

    it("should aggregate dependencies at package level", async () => {
      const result = await getArchitecture(
        storage,
        userId,
        projectId,
        "package",
      );

      // api should depend on auth
      const apiToAuthDep = result.dependencies.find(
        (d) => d.from === "api" && d.to === "auth",
      );
      expect(apiToAuthDep).toBeDefined();
      expect(apiToAuthDep?.count).toBe(3); // login->validate_token, login->decode_jwt, protected->validate_token
    });
  });

  describe("Dependency structure", () => {
    it("should count multiple dependencies between same modules", async () => {
      const result = await getArchitecture(
        storage,
        userId,
        projectId,
        "module",
      );

      // api/routes has multiple calls to auth/validators
      const dep = result.dependencies.find(
        (d) => d.from === "api/routes" && d.to === "auth/validators",
      );
      expect(dep?.count).toBeGreaterThan(1);
    });

    it("should include all module dependencies", async () => {
      const result = await getArchitecture(
        storage,
        userId,
        projectId,
        "module",
      );

      // Verify we have dependencies from the mock data
      expect(result.dependencies.length).toBeGreaterThan(0);

      // Check specific dependencies exist
      const deps = result.dependencies;
      expect(
        deps.some((d) => d.from === "middleware" && d.to === "auth/validators"),
      ).toBe(true);
      expect(deps.some((d) => d.from === "services/user")).toBe(true);
    });
  });

  describe("Hotspot detection", () => {
    it("should identify modules with many dependents as hotspots", async () => {
      const codeMapWithHotspots = createMockStorage(mockCodeMapWithHotspots);
      const result = await getArchitecture(
        codeMapWithHotspots,
        userId,
        projectId,
        "module",
      );

      // common should be a hotspot (15 dependents)
      const hotspot = result.hotspots.find((h) => h.name === "common");
      expect(hotspot).toBeDefined();
      expect(hotspot?.dependents).toBe(15);
    });

    it("should classify risk level based on dependent count", async () => {
      const codeMapWithHotspots = createMockStorage(mockCodeMapWithHotspots);
      const result = await getArchitecture(
        codeMapWithHotspots,
        userId,
        projectId,
        "module",
      );

      const hotspot = result.hotspots.find((h) => h.name === "common");
      // 15 dependents > 10, so should be HIGH risk
      expect(hotspot?.risk).toBe("HIGH");
    });

    it("should mark medium risk for 6-10 dependents", async () => {
      const mediumHotspotMap: CodeMap = {
        version: "1.0",
        generated_at: "2024-12-17T00:00:00Z",
        source_root: "/app",
        symbols: [
          {
            qualified_name: "core.utils",
            kind: "function",
            file: "core.py",
            line: 10,
          },
          ...Array.from({ length: 8 }, (_, i) => ({
            qualified_name: `mod${i}.func`,
            kind: "function" as const,
            file: `mod${i}.py`,
            line: 20 + i,
          })),
        ],
        dependencies: Array.from({ length: 8 }, (_, i) => ({
          from_sym: `mod${i}.func`,
          to_sym: "core.utils",
          kind: "calls" as const,
        })),
      };

      const codeMapWithMedium = createMockStorage(mediumHotspotMap);
      const result = await getArchitecture(
        codeMapWithMedium,
        userId,
        projectId,
        "module",
      );

      const hotspot = result.hotspots.find((h) => h.name === "core");
      expect(hotspot?.risk).toBe("MEDIUM");
    });

    it("should not include modules with <= 5 dependents", async () => {
      const result = await getArchitecture(
        storage,
        userId,
        projectId,
        "module",
      );

      // All hotspots should have > 5 dependents
      for (const hotspot of result.hotspots) {
        expect(hotspot.dependents).toBeGreaterThan(5);
      }
    });

    it("should sort hotspots by dependent count descending", async () => {
      const codeMapWithHotspots = createMockStorage(mockCodeMapWithHotspots);
      const result = await getArchitecture(
        codeMapWithHotspots,
        userId,
        projectId,
        "module",
      );

      // Check that hotspots are sorted descending
      for (let i = 1; i < result.hotspots.length; i++) {
        expect(
          result.hotspots[i - 1].dependents >= result.hotspots[i].dependents,
        ).toBe(true);
      }
    });
  });

  describe("Cycle detection", () => {
    it("should detect circular dependencies", async () => {
      const codeMapWithCycles = createMockStorage(mockCodeMapWithCycles);
      const result = await getArchitecture(
        codeMapWithCycles,
        userId,
        projectId,
        "module",
      );

      expect(result.cycles.length).toBeGreaterThan(0);
    });

    it("should return cycle paths as arrays", async () => {
      const codeMapWithCycles = createMockStorage(mockCodeMapWithCycles);
      const result = await getArchitecture(
        codeMapWithCycles,
        userId,
        projectId,
        "module",
      );

      for (const cycle of result.cycles) {
        expect(Array.isArray(cycle)).toBe(true);
        expect(cycle.length).toBeGreaterThan(1);
        // Cycle should start and end with same module
        expect(cycle[0]).toBe(cycle[cycle.length - 1]);
      }
    });

    it("should not detect cycles in acyclic graphs", async () => {
      const result = await getArchitecture(
        storage,
        userId,
        projectId,
        "module",
      );

      expect(result.cycles.length).toBe(0);
    });
  });

  describe("Summary generation", () => {
    it("should generate summary with module count", async () => {
      const result = await getArchitecture(
        storage,
        userId,
        projectId,
        "module",
      );

      expect(result.summary).toContain("modules");
      expect(result.summary).toContain(result.modules.length.toString());
    });

    it("should mention cycles in summary", async () => {
      const result = await getArchitecture(
        storage,
        userId,
        projectId,
        "module",
      );

      const cycleWord =
        result.cycles.length === 1 ? "dependency" : "dependencies";
      expect(result.summary).toContain(cycleWord);
      expect(result.summary).toContain(result.cycles.length.toString());
    });

    it("should mention hotspots in summary", async () => {
      const codeMapWithHotspots = createMockStorage(mockCodeMapWithHotspots);
      const result = await getArchitecture(
        codeMapWithHotspots,
        userId,
        projectId,
        "module",
      );

      if (result.hotspots.length > 0) {
        expect(result.summary).toContain("hotspot");
      }
    });

    it("should indicate no hotspots when none exist", async () => {
      const result = await getArchitecture(
        storage,
        userId,
        projectId,
        "module",
      );

      if (result.hotspots.length === 0) {
        expect(result.summary).toContain("No hotspots");
      }
    });
  });

  describe("Error handling", () => {
    it("should throw error for non-existent project", async () => {
      const emptyStorage = createMockStorage(null);
      await expect(
        getArchitecture(emptyStorage, userId, projectId, "module"),
      ).rejects.toThrow("Project not found");
    });

    it("should handle empty CodeMap gracefully", async () => {
      const emptyCodeMap: CodeMap = {
        version: "1.0",
        generated_at: "2024-12-17T00:00:00Z",
        source_root: "/app",
        symbols: [],
        dependencies: [],
      };

      const emptyStorage = createMockStorage(emptyCodeMap);
      const result = await getArchitecture(
        emptyStorage,
        userId,
        projectId,
        "module",
      );

      expect(result.modules).toHaveLength(0);
      expect(result.dependencies).toHaveLength(0);
      expect(result.hotspots).toHaveLength(0);
      expect(result.cycles).toHaveLength(0);
    });
  });
});

describe("handleGetArchitecture tool handler", () => {
  let storage: CodeMapStorage;
  const userId = "test-user";

  beforeEach(() => {
    storage = createMockStorage();
  });

  describe("Argument validation", () => {
    it("should reject missing project_id", async () => {
      const result = await handleGetArchitecture(storage, userId, {});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("project_id");
    });

    it("should reject empty project_id", async () => {
      const result = await handleGetArchitecture(storage, userId, {
        project_id: "",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("project_id");
    });

    it("should reject non-string project_id", async () => {
      const result = await handleGetArchitecture(storage, userId, {
        project_id: 123,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("project_id");
    });

    it("should reject invalid level value", async () => {
      const result = await handleGetArchitecture(storage, userId, {
        project_id: "test",
        level: "invalid",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("module");
      expect(result.content[0].text).toContain("package");
    });

    it("should reject non-string level", async () => {
      const result = await handleGetArchitecture(storage, userId, {
        project_id: "test",
        level: 123,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("string");
    });
  });

  describe("Success cases", () => {
    it("should return valid response with project_id only", async () => {
      const result = await handleGetArchitecture(storage, userId, {
        project_id: "test",
      });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].type).toBe("text");

      const parsed = JSON.parse(result.content[0].text!);
      expect(parsed.level).toBe("module");
      expect(parsed.modules).toBeDefined();
      expect(parsed.dependencies).toBeDefined();
      expect(parsed.hotspots).toBeDefined();
      expect(parsed.cycles).toBeDefined();
      expect(parsed.summary).toBeDefined();
    });

    it("should return valid response with module level", async () => {
      const result = await handleGetArchitecture(storage, userId, {
        project_id: "test",
        level: "module",
      });

      expect(result.isError).not.toBe(true);
      const parsed = JSON.parse(result.content[0].text!);
      expect(parsed.level).toBe("module");
    });

    it("should return valid response with package level", async () => {
      const result = await handleGetArchitecture(storage, userId, {
        project_id: "test",
        level: "package",
      });

      expect(result.isError).not.toBe(true);
      const parsed = JSON.parse(result.content[0].text!);
      expect(parsed.level).toBe("package");
    });
  });

  describe("Error handling", () => {
    it("should handle project not found error", async () => {
      const emptyStorage = createMockStorage(null);
      const result = await handleGetArchitecture(emptyStorage, userId, {
        project_id: "nonexistent",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error");
      expect(result.content[0].text).toContain("not found");
    });
  });

  describe("Response format", () => {
    it("should format response as valid JSON", async () => {
      const result = await handleGetArchitecture(storage, userId, {
        project_id: "test",
      });

      expect(() => JSON.parse(result.content[0].text!)).not.toThrow();
    });

    it("should include all required fields in response", async () => {
      const result = await handleGetArchitecture(storage, userId, {
        project_id: "test",
      });

      const parsed = JSON.parse(result.content[0].text!);
      expect(parsed).toHaveProperty("level");
      expect(parsed).toHaveProperty("modules");
      expect(parsed).toHaveProperty("dependencies");
      expect(parsed).toHaveProperty("hotspots");
      expect(parsed).toHaveProperty("cycles");
      expect(parsed).toHaveProperty("summary");
    });

    it("should properly format modules", async () => {
      const result = await handleGetArchitecture(storage, userId, {
        project_id: "test",
      });

      const parsed = JSON.parse(result.content[0].text!);
      for (const module of parsed.modules) {
        expect(module).toHaveProperty("name");
        expect(module).toHaveProperty("symbols");
        expect(module).toHaveProperty("dependents");
        expect(module).toHaveProperty("dependencies");
      }
    });

    it("should properly format dependencies", async () => {
      const result = await handleGetArchitecture(storage, userId, {
        project_id: "test",
      });

      const parsed = JSON.parse(result.content[0].text!);
      for (const dep of parsed.dependencies) {
        expect(dep).toHaveProperty("from");
        expect(dep).toHaveProperty("to");
        expect(dep).toHaveProperty("count");
        expect(typeof dep.count).toBe("number");
      }
    });
  });
});
