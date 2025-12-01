/**
 * MCP 服务器管理服务
 *
 * 负责 MCP 服务器的 CRUD 操作和多平台配置同步
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const toml = require('@iarna/toml');
const { spawn } = require('child_process');
const http = require('http');
const https = require('https');

// MCP 配置文件路径
const CC_TOOL_DIR = path.join(os.homedir(), '.claude', 'cc-tool');
const MCP_SERVERS_FILE = path.join(CC_TOOL_DIR, 'mcp-servers.json');

// 各平台配置文件路径
const CLAUDE_CONFIG_PATH = path.join(os.homedir(), '.claude.json');
const CODEX_CONFIG_PATH = path.join(os.homedir(), '.codex', 'config.toml');
const GEMINI_CONFIG_PATH = path.join(os.homedir(), '.gemini', 'settings.json');

// MCP 预设模板
const MCP_PRESETS = [
  {
    id: 'fetch',
    name: 'mcp-server-fetch',
    description: '获取网页内容',
    tags: ['http', 'web', 'fetch'],
    server: {
      type: 'stdio',
      command: 'uvx',
      args: ['mcp-server-fetch']
    },
    homepage: 'https://github.com/modelcontextprotocol/servers',
    docs: 'https://github.com/modelcontextprotocol/servers/tree/main/src/fetch'
  },
  {
    id: 'time',
    name: '@modelcontextprotocol/server-time',
    description: '获取当前时间和时区信息',
    tags: ['time', 'utility'],
    server: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-time']
    },
    homepage: 'https://github.com/modelcontextprotocol/servers',
    docs: 'https://github.com/modelcontextprotocol/servers/tree/main/src/time'
  },
  {
    id: 'memory',
    name: '@modelcontextprotocol/server-memory',
    description: '知识图谱记忆存储',
    tags: ['memory', 'graph', 'knowledge'],
    server: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-memory']
    },
    homepage: 'https://github.com/modelcontextprotocol/servers',
    docs: 'https://github.com/modelcontextprotocol/servers/tree/main/src/memory'
  },
  {
    id: 'sequential-thinking',
    name: '@modelcontextprotocol/server-sequential-thinking',
    description: '顺序思维推理',
    tags: ['thinking', 'reasoning'],
    server: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-sequential-thinking']
    },
    homepage: 'https://github.com/modelcontextprotocol/servers',
    docs: 'https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking'
  },
  {
    id: 'filesystem',
    name: '@anthropic/mcp-server-filesystem',
    description: '文件系统读写访问',
    tags: ['filesystem', 'files'],
    server: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@anthropic/mcp-server-filesystem', '/tmp']
    },
    homepage: 'https://github.com/anthropics/anthropic-quickstarts',
    docs: 'https://github.com/anthropics/anthropic-quickstarts/tree/main/mcp-server-filesystem'
  },
  {
    id: 'context7',
    name: '@upstash/context7-mcp',
    description: '文档搜索和上下文增强',
    tags: ['docs', 'search', 'context'],
    server: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@upstash/context7-mcp']
    },
    homepage: 'https://context7.com',
    docs: 'https://github.com/upstash/context7/blob/master/README.md'
  },
  {
    id: 'brave-search',
    name: '@anthropic/mcp-server-brave-search',
    description: 'Brave 搜索引擎',
    tags: ['search', 'web'],
    server: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@anthropic/mcp-server-brave-search'],
      env: {
        BRAVE_API_KEY: '<your-api-key>'
      }
    },
    homepage: 'https://github.com/anthropics/anthropic-quickstarts',
    docs: 'https://brave.com/search/api/'
  },
  {
    id: 'github',
    name: '@modelcontextprotocol/server-github',
    description: 'GitHub API 集成',
    tags: ['github', 'git', 'api'],
    server: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: {
        GITHUB_PERSONAL_ACCESS_TOKEN: '<your-token>'
      }
    },
    homepage: 'https://github.com/modelcontextprotocol/servers',
    docs: 'https://github.com/modelcontextprotocol/servers/tree/main/src/github'
  },
  {
    id: 'puppeteer',
    name: '@anthropic/mcp-server-puppeteer',
    description: '浏览器自动化',
    tags: ['browser', 'automation', 'web'],
    server: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@anthropic/mcp-server-puppeteer']
    },
    homepage: 'https://github.com/anthropics/anthropic-quickstarts',
    docs: 'https://pptr.dev/'
  },
  {
    id: 'playwright',
    name: '@anthropic/mcp-server-playwright',
    description: 'Playwright 浏览器自动化',
    tags: ['browser', 'automation', 'testing'],
    server: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@anthropic/mcp-server-playwright']
    },
    homepage: 'https://github.com/anthropics/anthropic-quickstarts',
    docs: 'https://playwright.dev/'
  },
  {
    id: 'sqlite',
    name: '@anthropic/mcp-server-sqlite',
    description: 'SQLite 数据库访问',
    tags: ['database', 'sql', 'sqlite'],
    server: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@anthropic/mcp-server-sqlite', '--db-path', '/path/to/database.db']
    },
    homepage: 'https://github.com/anthropics/anthropic-quickstarts',
    docs: 'https://www.sqlite.org/docs.html'
  },
  {
    id: 'postgres',
    name: '@anthropic/mcp-server-postgres',
    description: 'PostgreSQL 数据库访问',
    tags: ['database', 'sql', 'postgres'],
    server: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@anthropic/mcp-server-postgres'],
      env: {
        POSTGRES_CONNECTION_STRING: 'postgresql://user:pass@localhost:5432/db'
      }
    },
    homepage: 'https://github.com/anthropics/anthropic-quickstarts',
    docs: 'https://www.postgresql.org/docs/'
  },
  {
    id: 'slack',
    name: '@modelcontextprotocol/server-slack',
    description: 'Slack 消息和频道访问',
    tags: ['slack', 'chat', 'messaging'],
    server: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-slack'],
      env: {
        SLACK_BOT_TOKEN: '<your-bot-token>',
        SLACK_TEAM_ID: '<your-team-id>'
      }
    },
    homepage: 'https://github.com/modelcontextprotocol/servers',
    docs: 'https://api.slack.com/docs'
  },
  {
    id: 'google-drive',
    name: '@modelcontextprotocol/server-gdrive',
    description: 'Google Drive 文件访问',
    tags: ['google', 'drive', 'files'],
    server: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-gdrive']
    },
    homepage: 'https://github.com/modelcontextprotocol/servers',
    docs: 'https://developers.google.com/drive'
  },
  {
    id: 'everart',
    name: '@modelcontextprotocol/server-everart',
    description: 'AI 图片生成',
    tags: ['image', 'art', 'generation'],
    server: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-everart'],
      env: {
        EVERART_API_KEY: '<your-api-key>'
      }
    },
    homepage: 'https://github.com/modelcontextprotocol/servers',
    docs: 'https://everart.ai/docs'
  }
];

/**
 * 确保目录存在
 */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * 安全读取 JSON 文件
 */
function readJsonFile(filePath, defaultValue = {}) {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.error(`[MCP] Failed to read ${filePath}:`, err.message);
  }
  return defaultValue;
}

/**
 * 安全写入 JSON 文件（原子写入）
 */
function writeJsonFile(filePath, data) {
  ensureDir(path.dirname(filePath));
  const tempPath = filePath + '.tmp';
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tempPath, filePath);
}

/**
 * 安全读取 TOML 文件
 */
function readTomlFile(filePath, defaultValue = {}) {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return toml.parse(content);
    }
  } catch (err) {
    console.error(`[MCP] Failed to read ${filePath}:`, err.message);
  }
  return defaultValue;
}

/**
 * 安全写入 TOML 文件（原子写入）
 */
function writeTomlFile(filePath, data) {
  ensureDir(path.dirname(filePath));
  const tempPath = filePath + '.tmp';
  fs.writeFileSync(tempPath, toml.stringify(data), 'utf-8');
  fs.renameSync(tempPath, filePath);
}

// ============================================================================
// MCP 数据管理
// ============================================================================

/**
 * 获取所有 MCP 服务器
 */
function getAllServers() {
  return readJsonFile(MCP_SERVERS_FILE, {});
}

/**
 * 获取单个 MCP 服务器
 */
function getServer(id) {
  const servers = getAllServers();
  return servers[id] || null;
}

/**
 * 保存 MCP 服务器（添加或更新）
 */
async function saveServer(server) {
  if (!server.id || !server.id.trim()) {
    throw new Error('MCP 服务器 ID 不能为空');
  }

  // 验证服务器配置
  validateServerSpec(server.server);

  const servers = getAllServers();

  // 如果是新服务器，设置默认值
  if (!servers[server.id]) {
    server.createdAt = Date.now();
  }
  server.updatedAt = Date.now();

  // 确保 apps 字段存在
  if (!server.apps) {
    server.apps = { claude: true, codex: false, gemini: false };
  }

  servers[server.id] = server;
  writeJsonFile(MCP_SERVERS_FILE, servers);

  // 同步到各平台配置
  await syncServerToAllPlatforms(server);

  return server;
}

/**
 * 删除 MCP 服务器
 */
async function deleteServer(id) {
  const servers = getAllServers();
  const server = servers[id];

  if (!server) {
    return false;
  }

  delete servers[id];
  writeJsonFile(MCP_SERVERS_FILE, servers);

  // 从所有平台配置中移除
  await removeServerFromAllPlatforms(id);

  return true;
}

/**
 * 切换 MCP 服务器在某平台的启用状态
 */
async function toggleServerApp(serverId, app, enabled) {
  const servers = getAllServers();
  const server = servers[serverId];

  if (!server) {
    throw new Error(`MCP 服务器 "${serverId}" 不存在`);
  }

  if (!['claude', 'codex', 'gemini'].includes(app)) {
    throw new Error(`无效的平台: ${app}`);
  }

  server.apps[app] = enabled;
  server.updatedAt = Date.now();

  writeJsonFile(MCP_SERVERS_FILE, servers);

  // 同步到对应平台
  if (enabled) {
    await syncServerToPlatform(server, app);
  } else {
    await removeServerFromPlatform(serverId, app);
  }

  return server;
}

/**
 * 获取 MCP 预设模板列表
 */
function getPresets() {
  return MCP_PRESETS;
}

// ============================================================================
// 服务器配置验证
// ============================================================================

/**
 * 验证 MCP 服务器配置
 */
function validateServerSpec(spec) {
  if (!spec || typeof spec !== 'object') {
    throw new Error('服务器配置必须是对象');
  }

  const type = spec.type || 'stdio';

  if (!['stdio', 'http', 'sse'].includes(type)) {
    throw new Error(`无效的服务器类型: ${type}，必须是 stdio、http 或 sse`);
  }

  if (type === 'stdio') {
    if (!spec.command || !spec.command.trim()) {
      throw new Error('stdio 类型必须指定 command');
    }
  } else if (type === 'http' || type === 'sse') {
    if (!spec.url || !spec.url.trim()) {
      throw new Error(`${type} 类型必须指定 url`);
    }
  }
}

// ============================================================================
// 平台配置同步
// ============================================================================

/**
 * 同步服务器到所有已启用的平台
 */
async function syncServerToAllPlatforms(server) {
  const { apps } = server;

  if (apps.claude) {
    await syncServerToPlatform(server, 'claude');
  } else {
    await removeServerFromPlatform(server.id, 'claude');
  }

  if (apps.codex) {
    await syncServerToPlatform(server, 'codex');
  } else {
    await removeServerFromPlatform(server.id, 'codex');
  }

  if (apps.gemini) {
    await syncServerToPlatform(server, 'gemini');
  } else {
    await removeServerFromPlatform(server.id, 'gemini');
  }
}

/**
 * 从所有平台移除服务器
 */
async function removeServerFromAllPlatforms(serverId) {
  await removeServerFromPlatform(serverId, 'claude');
  await removeServerFromPlatform(serverId, 'codex');
  await removeServerFromPlatform(serverId, 'gemini');
}

/**
 * 同步服务器到指定平台
 */
async function syncServerToPlatform(server, platform) {
  try {
    switch (platform) {
      case 'claude':
        syncToClaudeConfig(server);
        break;
      case 'codex':
        syncToCodexConfig(server);
        break;
      case 'gemini':
        syncToGeminiConfig(server);
        break;
    }
    console.log(`[MCP] Synced "${server.id}" to ${platform}`);
  } catch (err) {
    console.error(`[MCP] Failed to sync "${server.id}" to ${platform}:`, err.message);
    throw err;
  }
}

/**
 * 从指定平台移除服务器
 */
async function removeServerFromPlatform(serverId, platform) {
  try {
    switch (platform) {
      case 'claude':
        removeFromClaudeConfig(serverId);
        break;
      case 'codex':
        removeFromCodexConfig(serverId);
        break;
      case 'gemini':
        removeFromGeminiConfig(serverId);
        break;
    }
    console.log(`[MCP] Removed "${serverId}" from ${platform}`);
  } catch (err) {
    console.error(`[MCP] Failed to remove "${serverId}" from ${platform}:`, err.message);
  }
}

// ============================================================================
// Claude 配置同步
// ============================================================================

/**
 * 同步到 Claude 配置
 */
function syncToClaudeConfig(server) {
  const config = readJsonFile(CLAUDE_CONFIG_PATH, {});

  if (!config.mcpServers) {
    config.mcpServers = {};
  }

  // 只写入 server spec，不写入元数据
  config.mcpServers[server.id] = extractServerSpec(server.server);

  writeJsonFile(CLAUDE_CONFIG_PATH, config);
}

/**
 * 从 Claude 配置移除
 */
function removeFromClaudeConfig(serverId) {
  const config = readJsonFile(CLAUDE_CONFIG_PATH, {});

  if (config.mcpServers && config.mcpServers[serverId]) {
    delete config.mcpServers[serverId];
    writeJsonFile(CLAUDE_CONFIG_PATH, config);
  }
}

// ============================================================================
// Codex 配置同步 (TOML 格式)
// ============================================================================

/**
 * 同步到 Codex 配置
 */
function syncToCodexConfig(server) {
  const config = readTomlFile(CODEX_CONFIG_PATH, {});

  if (!config.mcp_servers) {
    config.mcp_servers = {};
  }

  // 转换为 Codex TOML 格式
  config.mcp_servers[server.id] = convertToCodexFormat(server.server);

  writeTomlFile(CODEX_CONFIG_PATH, config);
}

/**
 * 从 Codex 配置移除
 */
function removeFromCodexConfig(serverId) {
  const config = readTomlFile(CODEX_CONFIG_PATH, {});

  if (config.mcp_servers && config.mcp_servers[serverId]) {
    delete config.mcp_servers[serverId];
    writeTomlFile(CODEX_CONFIG_PATH, config);
  }
}

/**
 * 转换为 Codex TOML 格式
 */
function convertToCodexFormat(spec) {
  const result = {
    type: spec.type || 'stdio'
  };

  if (result.type === 'stdio') {
    result.command = spec.command || '';
    if (spec.args && spec.args.length > 0) {
      result.args = spec.args;
    }
    if (spec.env && Object.keys(spec.env).length > 0) {
      result.env = spec.env;
    }
    if (spec.cwd) {
      result.cwd = spec.cwd;
    }
  } else if (result.type === 'http' || result.type === 'sse') {
    result.url = spec.url || '';
    if (spec.headers && Object.keys(spec.headers).length > 0) {
      result.http_headers = spec.headers;
    }
  }

  return result;
}

// ============================================================================
// Gemini 配置同步
// ============================================================================

/**
 * 同步到 Gemini 配置
 */
function syncToGeminiConfig(server) {
  const config = readJsonFile(GEMINI_CONFIG_PATH, {});

  if (!config.mcpServers) {
    config.mcpServers = {};
  }

  // 只写入 server spec，不写入元数据
  config.mcpServers[server.id] = extractServerSpec(server.server);

  writeJsonFile(GEMINI_CONFIG_PATH, config);
}

/**
 * 从 Gemini 配置移除
 */
function removeFromGeminiConfig(serverId) {
  const config = readJsonFile(GEMINI_CONFIG_PATH, {});

  if (config.mcpServers && config.mcpServers[serverId]) {
    delete config.mcpServers[serverId];
    writeJsonFile(GEMINI_CONFIG_PATH, config);
  }
}

// ============================================================================
// 导入功能
// ============================================================================

/**
 * 从指定平台导入 MCP 配置
 */
async function importFromPlatform(platform) {
  let importedCount = 0;
  const servers = getAllServers();

  switch (platform) {
    case 'claude':
      importedCount = importFromClaude(servers);
      break;
    case 'codex':
      importedCount = importFromCodex(servers);
      break;
    case 'gemini':
      importedCount = importFromGemini(servers);
      break;
    default:
      throw new Error(`无效的平台: ${platform}`);
  }

  if (importedCount > 0) {
    writeJsonFile(MCP_SERVERS_FILE, servers);
  }

  return importedCount;
}

/**
 * 从 Claude 导入
 */
function importFromClaude(servers) {
  const config = readJsonFile(CLAUDE_CONFIG_PATH, {});
  const mcpServers = config.mcpServers || {};
  let count = 0;

  for (const [id, spec] of Object.entries(mcpServers)) {
    if (servers[id]) {
      // 已存在，只启用 Claude
      if (!servers[id].apps.claude) {
        servers[id].apps.claude = true;
        count++;
      }
    } else {
      // 新服务器
      servers[id] = {
        id,
        name: id,
        server: spec,
        apps: { claude: true, codex: false, gemini: false },
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      count++;
    }
  }

  return count;
}

/**
 * 从 Codex 导入
 */
function importFromCodex(servers) {
  const config = readTomlFile(CODEX_CONFIG_PATH, {});
  const mcpServers = config.mcp_servers || {};
  let count = 0;

  for (const [id, spec] of Object.entries(mcpServers)) {
    // 转换 Codex 格式到通用格式
    const convertedSpec = convertFromCodexFormat(spec);

    if (servers[id]) {
      // 已存在，只启用 Codex
      if (!servers[id].apps.codex) {
        servers[id].apps.codex = true;
        count++;
      }
    } else {
      // 新服务器
      servers[id] = {
        id,
        name: id,
        server: convertedSpec,
        apps: { claude: false, codex: true, gemini: false },
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      count++;
    }
  }

  return count;
}

/**
 * 从 Gemini 导入
 */
function importFromGemini(servers) {
  const config = readJsonFile(GEMINI_CONFIG_PATH, {});
  const mcpServers = config.mcpServers || {};
  let count = 0;

  for (const [id, spec] of Object.entries(mcpServers)) {
    if (servers[id]) {
      // 已存在，只启用 Gemini
      if (!servers[id].apps.gemini) {
        servers[id].apps.gemini = true;
        count++;
      }
    } else {
      // 新服务器
      servers[id] = {
        id,
        name: id,
        server: spec,
        apps: { claude: false, codex: false, gemini: true },
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      count++;
    }
  }

  return count;
}

/**
 * 从 Codex 格式转换
 */
function convertFromCodexFormat(spec) {
  const result = {
    type: spec.type || 'stdio'
  };

  if (result.type === 'stdio') {
    result.command = spec.command || '';
    if (spec.args) {
      result.args = spec.args;
    }
    if (spec.env) {
      result.env = spec.env;
    }
    if (spec.cwd) {
      result.cwd = spec.cwd;
    }
  } else if (result.type === 'http' || result.type === 'sse') {
    result.url = spec.url || '';
    if (spec.http_headers) {
      result.headers = spec.http_headers;
    } else if (spec.headers) {
      result.headers = spec.headers;
    }
  }

  return result;
}

/**
 * 提取纯净的服务器规范（移除元数据）
 */
function extractServerSpec(spec) {
  const result = { ...spec };
  // 移除可能存在的非规范字段
  delete result.id;
  delete result.name;
  delete result.description;
  delete result.tags;
  delete result.homepage;
  delete result.docs;
  delete result.apps;
  delete result.createdAt;
  delete result.updatedAt;
  return result;
}

/**
 * 获取统计信息
 */
function getStats() {
  const servers = getAllServers();
  const serverList = Object.values(servers);

  return {
    total: serverList.length,
    claude: serverList.filter(s => s.apps?.claude).length,
    codex: serverList.filter(s => s.apps?.codex).length,
    gemini: serverList.filter(s => s.apps?.gemini).length
  };
}

// ============================================================================
// 服务器测试功能
// ============================================================================

/**
 * 测试 MCP 服务器连接
 * @param {string} serverId - 服务器 ID
 * @returns {Promise<{success: boolean, message: string, duration?: number}>}
 */
async function testServer(serverId) {
  const server = getServer(serverId);
  if (!server) {
    throw new Error(`MCP 服务器 "${serverId}" 不存在`);
  }

  const spec = server.server;
  const type = spec.type || 'stdio';
  const startTime = Date.now();

  try {
    if (type === 'stdio') {
      return await testStdioServer(spec);
    } else if (type === 'http' || type === 'sse') {
      return await testHttpServer(spec);
    } else {
      return { success: false, message: `不支持的服务器类型: ${type}` };
    }
  } catch (err) {
    return {
      success: false,
      message: err.message,
      duration: Date.now() - startTime
    };
  }
}

/**
 * 测试 stdio 类型服务器
 */
async function testStdioServer(spec) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const timeout = 10000; // 10 秒超时

    // 检查命令是否存在
    const command = spec.command;
    const args = spec.args || [];

    let child;
    let resolved = false;
    let stdout = '';
    let stderr = '';

    const cleanup = () => {
      if (child && !child.killed) {
        child.kill('SIGTERM');
        setTimeout(() => {
          if (!child.killed) child.kill('SIGKILL');
        }, 1000);
      }
    };

    const done = (result) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(result);
    };

    try {
      child = spawn(command, args, {
        env: { ...process.env, ...spec.env },
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: spec.cwd || process.cwd()
      });

      child.stdout.on('data', (data) => {
        stdout += data.toString();
        // MCP 服务器启动成功通常会输出 JSON-RPC 相关内容
        if (stdout.includes('{') || stdout.length > 0) {
          done({
            success: true,
            message: '服务器启动成功',
            duration: Date.now() - startTime
          });
        }
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('error', (err) => {
        if (err.code === 'ENOENT') {
          done({
            success: false,
            message: `命令 "${command}" 未找到，请确保已安装`,
            duration: Date.now() - startTime
          });
        } else {
          done({
            success: false,
            message: `启动失败: ${err.message}`,
            duration: Date.now() - startTime
          });
        }
      });

      child.on('close', (code) => {
        if (code === 0 || stdout.length > 0) {
          done({
            success: true,
            message: '服务器测试通过',
            duration: Date.now() - startTime
          });
        } else {
          done({
            success: false,
            message: stderr || `进程退出码: ${code}`,
            duration: Date.now() - startTime
          });
        }
      });

      // 超时处理
      setTimeout(() => {
        // 如果进程还在运行，说明服务器正常启动了
        if (!resolved && child && !child.killed) {
          done({
            success: true,
            message: '服务器正常运行中',
            duration: Date.now() - startTime
          });
        }
      }, 3000); // 3 秒后如果还在运行就认为成功

      // 最终超时
      setTimeout(() => {
        done({
          success: false,
          message: '测试超时',
          duration: timeout
        });
      }, timeout);

    } catch (err) {
      done({
        success: false,
        message: `测试失败: ${err.message}`,
        duration: Date.now() - startTime
      });
    }
  });
}

/**
 * 测试 http/sse 类型服务器
 */
async function testHttpServer(spec) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const timeout = 10000;

    try {
      const url = new URL(spec.url);
      const isHttps = url.protocol === 'https:';
      const client = isHttps ? https : http;

      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: 'GET',
        timeout: timeout,
        headers: {
          ...spec.headers
        }
      };

      const req = client.request(options, (res) => {
        resolve({
          success: res.statusCode >= 200 && res.statusCode < 500,
          message: res.statusCode >= 200 && res.statusCode < 400
            ? `服务器响应正常 (HTTP ${res.statusCode})`
            : `服务器响应异常 (HTTP ${res.statusCode})`,
          duration: Date.now() - startTime
        });
      });

      req.on('error', (err) => {
        resolve({
          success: false,
          message: `连接失败: ${err.message}`,
          duration: Date.now() - startTime
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          success: false,
          message: '连接超时',
          duration: timeout
        });
      });

      req.end();
    } catch (err) {
      resolve({
        success: false,
        message: `URL 无效: ${err.message}`,
        duration: Date.now() - startTime
      });
    }
  });
}

/**
 * 更新服务器状态
 */
async function updateServerStatus(serverId, status) {
  const servers = getAllServers();
  const server = servers[serverId];

  if (!server) {
    throw new Error(`MCP 服务器 "${serverId}" 不存在`);
  }

  server.status = status;
  server.lastChecked = Date.now();

  writeJsonFile(MCP_SERVERS_FILE, servers);
  return server;
}

// ============================================================================
// 排序功能
// ============================================================================

/**
 * 更新服务器排序
 * @param {string[]} serverIds - 按顺序排列的服务器 ID 数组
 */
function updateServerOrder(serverIds) {
  const servers = getAllServers();

  // 更新每个服务器的排序索引
  serverIds.forEach((id, index) => {
    if (servers[id]) {
      servers[id].order = index;
    }
  });

  writeJsonFile(MCP_SERVERS_FILE, servers);
  return servers;
}

// ============================================================================
// 导出功能
// ============================================================================

/**
 * 导出所有 MCP 配置
 * @param {string} format - 导出格式: 'json' | 'claude' | 'codex'
 */
function exportServers(format = 'json') {
  const servers = getAllServers();

  switch (format) {
    case 'claude':
      return exportForClaude(servers);
    case 'codex':
      return exportForCodex(servers);
    case 'json':
    default:
      return exportAsJson(servers);
  }
}

/**
 * 导出为通用 JSON 格式
 */
function exportAsJson(servers) {
  const mcpServers = {};

  for (const [id, server] of Object.entries(servers)) {
    mcpServers[id] = extractServerSpec(server.server);
  }

  return {
    format: 'json',
    content: JSON.stringify({ mcpServers }, null, 2),
    filename: 'mcp-servers.json'
  };
}

/**
 * 导出为 Claude 格式
 */
function exportForClaude(servers) {
  const mcpServers = {};

  for (const [id, server] of Object.entries(servers)) {
    if (server.apps?.claude) {
      mcpServers[id] = extractServerSpec(server.server);
    }
  }

  return {
    format: 'claude',
    content: JSON.stringify({ mcpServers }, null, 2),
    filename: 'claude-mcp-config.json'
  };
}

/**
 * 导出为 Codex 格式
 */
function exportForCodex(servers) {
  const mcp_servers = {};

  for (const [id, server] of Object.entries(servers)) {
    if (server.apps?.codex) {
      mcp_servers[id] = convertToCodexFormat(server.server);
    }
  }

  return {
    format: 'codex',
    content: toml.stringify({ mcp_servers }),
    filename: 'codex-mcp-config.toml'
  };
}

module.exports = {
  getAllServers,
  getServer,
  saveServer,
  deleteServer,
  toggleServerApp,
  getPresets,
  importFromPlatform,
  getStats,
  validateServerSpec,
  // 新增功能
  testServer,
  updateServerStatus,
  updateServerOrder,
  exportServers
};
