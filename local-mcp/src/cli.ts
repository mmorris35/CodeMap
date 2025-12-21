#!/usr/bin/env node
/**
 * CLI for CodeMap MCP server
 * Commands: install, serve, analyze
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { analyzeProject, saveCodeMap, listProjects, loadCodeMap } from './analyzer.js';
import { startServer } from './mcp-server.js';

const program = new Command();

program
  .name('codemap-mcp')
  .description('Local MCP server for Python code dependency analysis')
  .version('1.0.0');

/**
 * Install command - configures Claude Code to use this MCP server
 */
program
  .command('install')
  .description('Configure Claude Code to use the CodeMap MCP server')
  .option('--global', 'Install globally for all projects', false)
  .action(async (options) => {
    const configDir = options.global
      ? path.join(os.homedir(), '.claude')
      : path.join(process.cwd(), '.claude');

    const configFile = path.join(configDir, 'settings.json');

    // Ensure config directory exists
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    // Load existing config or create new one
    let config: Record<string, unknown> = {};
    if (fs.existsSync(configFile)) {
      try {
        config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
      } catch {
        console.error('Warning: Could not parse existing settings.json, creating new one');
      }
    }

    // Get the path to this CLI
    const cliPath = process.argv[1];
    const nodePath = process.argv[0];

    // Add MCP server configuration
    const mcpServers = (config.mcpServers || {}) as Record<string, unknown>;
    mcpServers['codemap'] = {
      command: nodePath,
      args: [cliPath, 'serve'],
    };
    config.mcpServers = mcpServers;

    // Write config
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2));

    console.log('✓ CodeMap MCP server configured successfully!');
    console.log(`  Config file: ${configFile}`);
    console.log('');
    console.log('Available tools:');
    console.log('  • analyze_project - Analyze a Python project');
    console.log('  • get_dependents - Find callers of a symbol');
    console.log('  • get_impact_report - Assess change impact');
    console.log('  • check_breaking_change - Check signature compatibility');
    console.log('  • get_architecture - View module structure');
    console.log('');
    console.log('To use in Claude Code, ask:');
    console.log('  "Analyze this Python project for dependencies"');
    console.log('  "What calls the function handle_request?"');
    console.log('  "Show me the impact of changing user.authenticate"');
  });

/**
 * Serve command - runs the MCP server
 */
program
  .command('serve')
  .description('Run the MCP server (stdio mode)')
  .option('--project <id>', 'Load a previously analyzed project')
  .action(async (options) => {
    if (options.project) {
      const codeMap = loadCodeMap(options.project);
      if (!codeMap) {
        console.error(`Project not found: ${options.project}`);
        console.error('Run "codemap-mcp list" to see available projects');
        process.exit(1);
      }
    }

    await startServer();
  });

/**
 * Analyze command - analyzes a Python project
 */
program
  .command('analyze')
  .description('Analyze a Python project and generate code map')
  .argument('<path>', 'Path to the Python project')
  .option('--id <name>', 'Project identifier (defaults to directory name)')
  .option('--exclude <patterns...>', 'Glob patterns to exclude', [
    '**/node_modules/**',
    '**/__pycache__/**',
    '**/venv/**',
    '**/.venv/**',
  ])
  .option('--json', 'Output raw JSON instead of summary')
  .action(async (projectPath: string, options) => {
    const absolutePath = path.resolve(projectPath);

    if (!fs.existsSync(absolutePath)) {
      console.error(`Path not found: ${absolutePath}`);
      process.exit(1);
    }

    const projectId = options.id || path.basename(absolutePath);

    console.log(`Analyzing ${absolutePath}...`);

    try {
      const codeMap = await analyzeProject(absolutePath, options.exclude);
      saveCodeMap(projectId, codeMap);

      if (options.json) {
        console.log(JSON.stringify(codeMap, null, 2));
      } else {
        const modules = new Set(codeMap.symbols.map((s) => s.file));
        const functions = codeMap.symbols.filter((s) => s.kind === 'function').length;
        const classes = codeMap.symbols.filter((s) => s.kind === 'class').length;
        const methods = codeMap.symbols.filter((s) => s.kind === 'method').length;

        console.log('');
        console.log('✓ Analysis complete!');
        console.log('');
        console.log(`Project ID: ${projectId}`);
        console.log(`Files: ${modules.size}`);
        console.log(`Symbols:`);
        console.log(`  Classes: ${classes}`);
        console.log(`  Functions: ${functions}`);
        console.log(`  Methods: ${methods}`);
        console.log(`Dependencies: ${codeMap.dependencies.length}`);
        console.log('');
        console.log('The code map has been saved. You can now use the MCP tools.');
      }
    } catch (error) {
      console.error('Analysis failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

/**
 * List command - shows analyzed projects
 */
program
  .command('list')
  .description('List previously analyzed projects')
  .action(() => {
    const projects = listProjects();

    if (projects.length === 0) {
      console.log('No projects analyzed yet.');
      console.log('Run "codemap-mcp analyze <path>" to analyze a project.');
      return;
    }

    console.log('Analyzed projects:');
    console.log('');
    for (const projectId of projects) {
      const codeMap = loadCodeMap(projectId);
      if (codeMap) {
        console.log(`  ${projectId}`);
        console.log(`    Symbols: ${codeMap.symbols.length}`);
        console.log(`    Dependencies: ${codeMap.dependencies.length}`);
        console.log(`    Generated: ${codeMap.generated_at}`);
        console.log('');
      }
    }
  });

/**
 * Show command - displays details about a project
 */
program
  .command('show')
  .description('Show details about an analyzed project')
  .argument('<project-id>', 'Project identifier')
  .option('--symbols', 'List all symbols')
  .option('--deps', 'List all dependencies')
  .action((projectId: string, options) => {
    const codeMap = loadCodeMap(projectId);

    if (!codeMap) {
      console.error(`Project not found: ${projectId}`);
      console.error('Run "codemap-mcp list" to see available projects.');
      process.exit(1);
    }

    console.log(`Project: ${projectId}`);
    console.log(`Source: ${codeMap.source_root}`);
    console.log(`Generated: ${codeMap.generated_at}`);
    console.log(`Version: ${codeMap.version}`);
    console.log('');

    if (options.symbols) {
      console.log('Symbols:');
      for (const sym of codeMap.symbols) {
        console.log(`  ${sym.kind.padEnd(8)} ${sym.qualified_name}`);
        console.log(`           ${sym.file}:${sym.line}`);
        if (sym.signature) {
          console.log(`           ${sym.signature}`);
        }
      }
    } else if (options.deps) {
      console.log('Dependencies:');
      for (const dep of codeMap.dependencies) {
        console.log(`  ${dep.from_sym} --[${dep.kind}]--> ${dep.to_sym}`);
      }
    } else {
      // Summary
      const modules = new Set(codeMap.symbols.map((s) => s.file));
      const byKind: Record<string, number> = {};
      for (const sym of codeMap.symbols) {
        byKind[sym.kind] = (byKind[sym.kind] || 0) + 1;
      }

      console.log('Summary:');
      console.log(`  Files: ${modules.size}`);
      console.log(`  Symbols: ${codeMap.symbols.length}`);
      for (const [kind, count] of Object.entries(byKind)) {
        console.log(`    ${kind}: ${count}`);
      }
      console.log(`  Dependencies: ${codeMap.dependencies.length}`);
      console.log('');
      console.log('Use --symbols or --deps for full listings.');
    }
  });

program.parse();
