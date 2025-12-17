/**
 * CodeMap MCP Server entry point
 * Runs as a Cloudflare Worker providing MCP tools for dependency analysis
 */

import app from './router';

/**
 * Default export for Cloudflare Workers
 */
export default app;
