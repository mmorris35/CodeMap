#!/usr/bin/env node

/**
 * CodeMap MCP Server - End-to-End Test Script
 * Usage: npx tsx scripts/e2e-test.ts [SERVER_URL] [API_KEY]
 */

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
}

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

class E2ETester {
  serverUrl: string;
  apiKey: string;
  results: TestResult[] = [];
  passCount = 0;
  failCount = 0;

  constructor(serverUrl = 'http://localhost:8787', apiKey = 'test-key') {
    this.serverUrl = serverUrl;
    this.apiKey = apiKey;
  }

  log(message: string, color = colors.reset) {
    console.log(`${color}${message}${colors.reset}`);
  }

  logInfo(message: string) {
    this.log(`[INFO] ${message}`, colors.blue);
  }

  logSuccess(message: string) {
    this.log(`[PASS] ${message}`, colors.green);
  }

  logError(message: string) {
    this.log(`[FAIL] ${message}`, colors.red);
  }

  logWarn(message: string) {
    this.log(`[WARN] ${message}`, colors.yellow);
  }

  async recordTest(name: string, fn: () => Promise<void>): Promise<void> {
    const start = Date.now();
    try {
      await fn();
      const duration = Date.now() - start;
      this.results.push({ name, passed: true, duration });
      this.passCount++;
      this.logSuccess(`${name} (${duration}ms)`);
    } catch (error) {
      const duration = Date.now() - start;
      this.results.push({
        name,
        passed: false,
        duration,
        error: String(error),
      });
      this.failCount++;
      this.logError(`${name}: ${error}`);
    }
  }

  async fetch(
    path: string,
    options: RequestInit = {}
  ): Promise<{ status: number; body: string }> {
    const url = `${this.serverUrl}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    const body = await response.text();
    return { status: response.status, body };
  }

  async testHealthEndpoint(): Promise<void> {
    const { status, body } = await this.fetch('/health');
    if (status !== 200) {
      throw new Error(`Expected 200, got ${status}`);
    }
    const json = JSON.parse(body);
    if (json.status !== 'healthy') {
      throw new Error(`Expected status "healthy", got "${json.status}"`);
    }
  }

  async testHealthReadyEndpoint(): Promise<void> {
    const { status, body } = await this.fetch('/health/ready');
    if (status !== 200) {
      throw new Error(`Expected 200, got ${status}`);
    }
    const json = JSON.parse(body);
    if (json.status !== 'ready') {
      throw new Error(`Expected status "ready", got "${json.status}"`);
    }
  }

  async testInitializeMethod(): Promise<void> {
    const { status, body } = await this.fetch('/mcp', {
      method: 'POST',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {},
      }),
    });
    if (status !== 200) {
      throw new Error(`Expected 200, got ${status}`);
    }
    const json = JSON.parse(body);
    if (!json.result) {
      throw new Error('No result in response');
    }
  }

  async testToolsList(): Promise<void> {
    const { status, body } = await this.fetch('/mcp', {
      method: 'POST',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      }),
    });
    if (status !== 200) {
      throw new Error(`Expected 200, got ${status}`);
    }
    const json = JSON.parse(body);
    if (!json.result || !json.result.tools) {
      throw new Error('No tools in response');
    }
    const toolNames = json.result.tools.map((t: { name: string }) => t.name);
    const expectedTools = [
      'get_dependents',
      'get_impact_report',
      'check_breaking_change',
      'get_architecture',
    ];
    for (const tool of expectedTools) {
      if (!toolNames.includes(tool)) {
        throw new Error(`Missing tool: ${tool}`);
      }
    }
  }

  async testResourcesList(): Promise<void> {
    const { status, body } = await this.fetch('/mcp', {
      method: 'POST',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'resources/list',
        params: {},
      }),
    });
    if (status !== 200) {
      throw new Error(`Expected 200, got ${status}`);
    }
    const json = JSON.parse(body);
    if (!json.result || !json.result.resources) {
      throw new Error('No resources in response');
    }
  }

  async testInvalidMethod(): Promise<void> {
    const { status, body } = await this.fetch('/mcp', {
      method: 'POST',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 4,
        method: 'invalid_method',
        params: {},
      }),
    });
    if (status !== 200) {
      throw new Error(`Expected 200, got ${status}`);
    }
    const json = JSON.parse(body);
    if (!json.error) {
      throw new Error('Expected error for invalid method');
    }
  }

  async testProjectUpload(): Promise<void> {
    const codeMap = {
      version: '1.0.0',
      generated_at: '2024-12-17T10:00:00Z',
      source_root: '/test/project',
      symbols: [
        {
          qualified_name: 'auth.validate_user',
          kind: 'function',
          file: 'auth.py',
          line: 10,
          docstring: 'Validate user credentials',
          signature: 'def validate_user(username: str, password: str) -> bool',
        },
        {
          qualified_name: 'app.login',
          kind: 'function',
          file: 'app.py',
          line: 30,
          docstring: 'Handle login',
          signature: 'def login(username: str, password: str) -> bool',
        },
      ],
      dependencies: [
        {
          from: 'app.login',
          to: 'auth.validate_user',
          kind: 'calls',
        },
      ],
    };

    const { status, body } = await this.fetch(
      '/projects/e2e-test/code_map',
      {
        method: 'POST',
        body: JSON.stringify(codeMap),
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      }
    );
    if (status !== 200) {
      throw new Error(`Expected 200, got ${status}`);
    }
    const json = JSON.parse(body);
    if (json.project_id !== 'e2e-test') {
      throw new Error(`Expected project_id "e2e-test", got "${json.project_id}"`);
    }
  }

  async testGetDependents(): Promise<void> {
    const { status, body } = await this.fetch('/mcp', {
      method: 'POST',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'get_dependents',
          arguments: {
            project_id: 'e2e-test',
            symbol: 'auth.validate_user',
          },
        },
      }),
    });
    if (status !== 200) {
      throw new Error(`Expected 200, got ${status}`);
    }
    const json = JSON.parse(body);
    if (json.error) {
      throw new Error(`Tool call failed: ${json.error.message}`);
    }
  }

  async testGetImpactReport(): Promise<void> {
    const { status, body } = await this.fetch('/mcp', {
      method: 'POST',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: {
          name: 'get_impact_report',
          arguments: {
            project_id: 'e2e-test',
            symbol: 'auth.validate_user',
          },
        },
      }),
    });
    if (status !== 200) {
      throw new Error(`Expected 200, got ${status}`);
    }
    const json = JSON.parse(body);
    if (json.error) {
      throw new Error(`Tool call failed: ${json.error.message}`);
    }
  }

  async testCheckBreakingChange(): Promise<void> {
    const { status, body } = await this.fetch('/mcp', {
      method: 'POST',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: {
          name: 'check_breaking_change',
          arguments: {
            project_id: 'e2e-test',
            symbol: 'auth.validate_user',
            new_signature: 'def validate_user(username: str, password: str, mfa_code: str) -> bool',
          },
        },
      }),
    });
    if (status !== 200) {
      throw new Error(`Expected 200, got ${status}`);
    }
    const json = JSON.parse(body);
    if (json.error) {
      throw new Error(`Tool call failed: ${json.error.message}`);
    }
  }

  async testGetArchitecture(): Promise<void> {
    const { status, body } = await this.fetch('/mcp', {
      method: 'POST',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 8,
        method: 'tools/call',
        params: {
          name: 'get_architecture',
          arguments: {
            project_id: 'e2e-test',
            detail_level: 'overview',
          },
        },
      }),
    });
    if (status !== 200) {
      throw new Error(`Expected 200, got ${status}`);
    }
    const json = JSON.parse(body);
    if (json.error) {
      throw new Error(`Tool call failed: ${json.error.message}`);
    }
  }

  async testMissingProject(): Promise<void> {
    const { status, body } = await this.fetch('/mcp', {
      method: 'POST',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 9,
        method: 'tools/call',
        params: {
          name: 'get_dependents',
          arguments: {
            project_id: 'nonexistent-project',
            symbol: 'some.symbol',
          },
        },
      }),
    });
    if (status !== 200) {
      throw new Error(`Expected 200, got ${status}`);
    }
    const json = JSON.parse(body);
    if (!json.error) {
      throw new Error('Expected error for nonexistent project');
    }
  }

  async testInvalidJson(): Promise<void> {
    const response = await fetch(`${this.serverUrl}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'invalid json',
    });
    if (response.status !== 400) {
      throw new Error(`Expected 400 for invalid JSON, got ${response.status}`);
    }
  }

  async testMissingAuthorization(): Promise<void> {
    const response = await fetch(
      `${this.serverUrl}/projects/test/code_map`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }
    );
    if (response.status !== 401) {
      throw new Error(
        `Expected 401 for missing auth, got ${response.status}`
      );
    }
  }

  async runAllTests(): Promise<void> {
    console.log('');
    this.log(
      '╔════════════════════════════════════════════════════════════════╗',
      colors.blue
    );
    this.log(
      '║   CodeMap MCP Server - End-to-End Test Suite                 ║',
      colors.blue
    );
    this.log(
      '╚════════════════════════════════════════════════════════════════╝',
      colors.blue
    );
    console.log('');
    this.logInfo(`Server URL: ${this.serverUrl}`);
    this.logInfo(`API Key: ${this.apiKey.substring(0, 10)}...`);
    console.log('');

    // Health checks
    this.log(
      'Test Suite 1: Health Checks',
      colors.blue
    );
    console.log(
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
    );
    await this.recordTest('GET /health', () => this.testHealthEndpoint());
    await this.recordTest('GET /health/ready', () => this.testHealthReadyEndpoint());
    console.log('');

    // MCP protocol
    this.log(
      'Test Suite 2: MCP Protocol',
      colors.blue
    );
    console.log(
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
    );
    await this.recordTest('POST /mcp initialize', () =>
      this.testInitializeMethod()
    );
    await this.recordTest('POST /mcp tools/list', () => this.testToolsList());
    await this.recordTest('POST /mcp resources/list', () =>
      this.testResourcesList()
    );
    await this.recordTest('POST /mcp invalid method', () =>
      this.testInvalidMethod()
    );
    console.log('');

    // Project upload
    this.log(
      'Test Suite 3: Project Upload',
      colors.blue
    );
    console.log(
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
    );
    await this.recordTest('POST /projects/:id/code_map', () =>
      this.testProjectUpload()
    );
    console.log('');

    // MCP tools
    this.log(
      'Test Suite 4: MCP Tools',
      colors.blue
    );
    console.log(
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
    );
    await this.recordTest('Tool: get_dependents', () =>
      this.testGetDependents()
    );
    await this.recordTest('Tool: get_impact_report', () =>
      this.testGetImpactReport()
    );
    await this.recordTest('Tool: check_breaking_change', () =>
      this.testCheckBreakingChange()
    );
    await this.recordTest('Tool: get_architecture', () =>
      this.testGetArchitecture()
    );
    console.log('');

    // Error handling
    this.log(
      'Test Suite 5: Error Handling',
      colors.blue
    );
    console.log(
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
    );
    await this.recordTest('Handle missing project', () =>
      this.testMissingProject()
    );
    await this.recordTest('Handle invalid JSON', () =>
      this.testInvalidJson()
    );
    await this.recordTest('Handle missing authorization', () =>
      this.testMissingAuthorization()
    );
    console.log('');

    // Summary
    this.log(
      '╔════════════════════════════════════════════════════════════════╗',
      colors.blue
    );
    this.log(
      '║                         Test Summary                            ║',
      colors.blue
    );
    this.log(
      '╠════════════════════════════════════════════════════════════════╣',
      colors.blue
    );
    this.log(`│ Total Tests:  ${this.results.length}`, colors.blue);
    this.log(
      `│ Passed:       ${this.passCount}`,
      this.passCount === this.results.length ? colors.green : colors.reset
    );
    this.log(`│ Failed:       ${this.failCount}`, this.failCount > 0 ? colors.red : colors.reset);
    this.log(
      '╚════════════════════════════════════════════════════════════════╝',
      colors.blue
    );
    console.log('');

    if (this.failCount === 0) {
      this.logSuccess('All tests passed!');
      process.exit(0);
    } else {
      this.logError('Some tests failed');
      process.exit(1);
    }
  }
}

const serverUrl = process.argv[2] || 'http://localhost:8787';
const apiKey = process.argv[3] || 'test-key';
const tester = new E2ETester(serverUrl, apiKey);
tester.runAllTests().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
