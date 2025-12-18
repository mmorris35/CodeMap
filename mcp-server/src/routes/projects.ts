/**
 * REST API routes for project management
 * Handles CODE_MAP.json upload, retrieval, and deletion with user isolation
 */

import { Hono } from "hono";
import type { Bindings } from "../types";
import { CodeMapStorage } from "../storage";
import { validateApiKey } from "../auth";

/**
 * Projects router with API key authentication middleware
 * Routes are user-scoped - users can only access their own projects
 */
export const projects = new Hono<{
  Bindings: Bindings;
  Variables: { userId: string };
}>();

/**
 * Authentication middleware - validates API key and extracts user ID
 *
 * Checks Authorization header for Bearer token (API key).
 * Returns 401 if key is missing or invalid.
 * Sets userId context variable for downstream handlers.
 */
projects.use("*", async (c, next) => {
  // Extract API key from Authorization header
  const authHeader = c.req.header("Authorization");
  const apiKey = authHeader?.replace("Bearer ", "");

  // Validate key against stored hash
  const { valid, userId } = await validateApiKey(c.env.CODEMAP_KV, apiKey);

  if (!valid || !userId) {
    return c.json(
      {
        error: "Unauthorized",
        message: "Invalid or missing API key",
        help: "Get an API key with: curl https://codemap-mcp.workers.dev/register",
      },
      401,
    );
  }

  // Set userId in context for downstream handlers
  c.set("userId", userId);
  return await next();
});

/**
 * GET /projects - List user's projects
 *
 * Returns all project IDs belonging to the authenticated user.
 * Uses user-scoped prefix to prevent listing other users' projects.
 *
 * @returns JSON array of project IDs
 *
 * @example
 * ```bash
 * curl -H "Authorization: Bearer cm_abc123..." \
 *   https://codemap-mcp.workers.dev/projects
 *
 * # Returns:
 * # {"projects": ["my-app", "another-project"]}
 * ```
 */
projects.get("/", async (c) => {
  const userId = c.get("userId");
  const storage = new CodeMapStorage(c.env.CODEMAP_KV);

  const projectIds = await storage.listProjects(userId);

  return c.json({
    projects: projectIds,
    count: projectIds.length,
  });
});

/**
 * POST /projects/:id/code_map - Upload CODE_MAP.json
 *
 * Stores a CODE_MAP.json file in user-scoped KV storage.
 * Validates structure against CodeMapSchema.
 * Returns 201 Created on success.
 *
 * @param id - Project identifier (URL parameter)
 * @param body - CODE_MAP.json object (JSON body)
 * @returns Created project info
 *
 * @example
 * ```bash
 * curl -X POST \
 *   -H "Authorization: Bearer cm_abc123..." \
 *   -H "Content-Type: application/json" \
 *   -d @CODE_MAP.json \
 *   https://codemap-mcp.workers.dev/projects/my-app/code_map
 *
 * # Returns:
 * # {"message": "Uploaded", "project_id": "my-app", "status": 201}
 * ```
 */
projects.post("/:id/code_map", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("id");

  try {
    // Parse request body as JSON
    const body = await c.req.json();

    // Create storage instance and save
    const storage = new CodeMapStorage(c.env.CODEMAP_KV);
    await storage.saveCodeMap(userId, projectId, body);

    return c.json(
      {
        message: "Uploaded",
        project_id: projectId,
        user_id: userId,
      },
      201,
    );
  } catch (error) {
    // Handle JSON parse errors
    if (error instanceof SyntaxError) {
      return c.json(
        {
          error: "Invalid JSON",
          message: "Request body must be valid JSON",
        },
        400,
      );
    }

    // Handle Zod validation errors (schema mismatch)
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      if (
        message.includes("validation") ||
        message.includes("required") ||
        message.includes("invalid") ||
        message.includes("did not match")
      ) {
        return c.json(
          {
            error: "Invalid CODE_MAP.json structure",
            message: error.message,
          },
          400,
        );
      }
    }

    // Generic error
    throw error;
  }
});

/**
 * GET /projects/:id/code_map - Retrieve CODE_MAP.json
 *
 * Returns the stored CODE_MAP.json for a project.
 * Only accessible to the user who owns the project.
 * Returns 404 if project not found.
 *
 * @param id - Project identifier (URL parameter)
 * @returns CODE_MAP.json object
 *
 * @example
 * ```bash
 * curl -H "Authorization: Bearer cm_abc123..." \
 *   https://codemap-mcp.workers.dev/projects/my-app/code_map
 *
 * # Returns: Full CODE_MAP.json
 * ```
 */
projects.get("/:id/code_map", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("id");

  const storage = new CodeMapStorage(c.env.CODEMAP_KV);
  const codeMap = await storage.getCodeMap(userId, projectId);

  if (!codeMap) {
    return c.json(
      {
        error: "Not Found",
        message: `Project '${projectId}' not found`,
      },
      404,
    );
  }

  return c.json(codeMap);
});

/**
 * DELETE /projects/:id - Delete a project
 *
 * Removes a project and all its data from storage.
 * Only accessible to the user who owns the project.
 * Returns 204 No Content on success, even if project didn't exist.
 *
 * @param id - Project identifier (URL parameter)
 * @returns No content on success
 *
 * @example
 * ```bash
 * curl -X DELETE \
 *   -H "Authorization: Bearer cm_abc123..." \
 *   https://codemap-mcp.workers.dev/projects/my-app
 *
 * # Returns: 204 No Content
 * ```
 */
projects.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("id");

  const storage = new CodeMapStorage(c.env.CODEMAP_KV);
  await storage.deleteCodeMap(userId, projectId);

  return c.body(null, 204);
});

export default projects;
