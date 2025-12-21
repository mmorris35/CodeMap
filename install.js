#!/usr/bin/env node
/**
 * CodeMap MCP Server Installer for Claude Code
 *
 * This script:
 * 1. Builds the local-mcp TypeScript code
 * 2. Installs it as a global CLI tool
 * 3. Configures Claude Code to use the MCP server
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const localMcpDir = path.join(__dirname, 'local-mcp');

console.log('CodeMap MCP Server Installer');
console.log('============================\n');

// Check if local-mcp directory exists
if (!fs.existsSync(localMcpDir)) {
  console.error('Error: local-mcp directory not found');
  console.error(`Expected at: ${localMcpDir}`);
  process.exit(1);
}

try {
  // Step 1: Install dependencies in local-mcp
  console.log('Step 1: Installing dependencies...');
  execSync('npm install', { cwd: localMcpDir, stdio: 'inherit' });
  console.log('✓ Dependencies installed\n');

  // Step 2: Build TypeScript
  console.log('Step 2: Building TypeScript...');
  execSync('npm run build', { cwd: localMcpDir, stdio: 'inherit' });
  console.log('✓ Build complete\n');

  // Step 3: Install globally (if --global flag or using npx)
  console.log('Step 3: Installing codemap-mcp globally...');
  const isGlobal = process.argv.includes('--global') || process.env.NPM_CONFIG_PREFIX !== undefined;

  if (isGlobal) {
    execSync('npm install -g .', { cwd: localMcpDir, stdio: 'inherit' });
    console.log('✓ Installed globally\n');
  } else {
    // Fallback: ensure it's in node_modules
    console.log('(Install skipped - running from npx)\n');
  }

  // Step 4: Run the install command to configure Claude Code
  console.log('Step 4: Configuring Claude Code...');

  // Determine the path to the CLI
  let cliPath;
  if (isGlobal) {
    // When installed globally, try to find the global npm bin
    try {
      const npmBin = execSync('npm config get prefix', { encoding: 'utf-8' }).trim();
      cliPath = path.join(npmBin, 'bin', 'codemap-mcp');
    } catch {
      cliPath = 'codemap-mcp';
    }
  } else {
    // When running from npx, use the local path
    cliPath = path.join(localMcpDir, 'bin', 'cli.js');
  }

  // Check if cli is executable
  const nodePath = process.argv[0];

  // Call the install command
  try {
    if (isGlobal) {
      execSync(`${nodePath} ${cliPath} install --global`, { stdio: 'inherit' });
    } else {
      execSync(`${nodePath} ${cliPath} install --global`, { stdio: 'inherit' });
    }
  } catch {
    // Try alternative approach
    console.log('Attempting alternative configuration...');
    execSync(`${nodePath} ${path.join(localMcpDir, 'bin', 'cli.js')} install --global`, {
      stdio: 'inherit'
    });
  }

  console.log('');
  console.log('✓ Installation complete!\n');
  console.log('Next steps:');
  console.log('  1. Restart Claude Code');
  console.log('  2. In Claude Code, ask to analyze a Python project');
  console.log('  3. Example: "Analyze this Python project for dependencies"\n');

  process.exit(0);
} catch (error) {
  console.error('\nInstallation failed:');
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(error);
  }
  process.exit(1);
}
