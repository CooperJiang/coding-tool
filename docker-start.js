#!/usr/bin/env node

/**
 * Docker container startup script
 * Starts the web server directly without interactive prompts
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const chalk = require('chalk');

const { loadConfig } = require('./src/config/loader');
const { startWebSocketServer: attachWebSocketServer } = require('./src/server/websocket-server');
const { startProxyServer } = require('./src/server/proxy-server');
const { startCodexProxyServer } = require('./src/server/codex-proxy-server');
const { startGeminiProxyServer } = require('./src/server/gemini-proxy-server');

// Docker mode flag
process.env.CT_DOCKER = 'true';

// Ensure required directories exist
function ensureDirectories() {
  const os = require('os');
  const dirs = [
    path.join(os.homedir(), '.claude', 'cc-tool'),
    path.join(os.homedir(), '.claude', 'logs'),
    path.join(os.homedir(), '.claude', 'projects'),
    path.join(os.homedir(), '.codex'),
    path.join(os.homedir(), '.gemini')
  ];

  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(chalk.gray(`Created directory: ${dir}`));
    }
  });
}

async function startDockerServer() {
  ensureDirectories();
  const config = loadConfig();
  const port = parseInt(process.env.CT_WEB_PORT) || config.ports?.webUI || 10099;

  console.log(chalk.cyan('\n🐳 Starting Coding-Tool in Docker mode...\n'));

  const app = express();

  // Middleware
  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ limit: '100mb', extended: true }));

  // CORS
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // API Routes
  app.use('/api/projects', require('./src/server/api/projects')(config));
  app.use('/api/sessions', require('./src/server/api/sessions')(config));
  app.use('/api/codex/projects', require('./src/server/api/codex-projects')(config));
  app.use('/api/codex/sessions', require('./src/server/api/codex-sessions')(config));
  app.use('/api/codex/channels', require('./src/server/api/codex-channels')(config));
  app.use('/api/gemini/projects', require('./src/server/api/gemini-projects')(config));
  app.use('/api/gemini/sessions', require('./src/server/api/gemini-sessions')(config));
  app.use('/api/gemini/channels', require('./src/server/api/gemini-channels')(config));
  app.use('/api/gemini/proxy', require('./src/server/api/gemini-proxy'));
  app.use('/api/aliases', require('./src/server/api/aliases')());
  app.use('/api/favorites', require('./src/server/api/favorites'));
  app.use('/api/ui-config', require('./src/server/api/ui-config'));
  app.use('/api/channels', require('./src/server/api/channels'));
  app.use('/api/proxy', require('./src/server/api/proxy'));
  app.use('/api/codex/proxy', require('./src/server/api/codex-proxy'));
  app.use('/api/settings', require('./src/server/api/settings'));
  app.use('/api/config', require('./src/server/api/config'));
  app.use('/api/statistics', require('./src/server/api/statistics'));
  app.use('/api/codex/statistics', require('./src/server/api/codex-statistics'));
  app.use('/api/gemini/statistics', require('./src/server/api/gemini-statistics'));
  app.use('/api/version', require('./src/server/api/version'));
  app.use('/api/pm2-autostart', require('./src/server/api/pm2-autostart')());
  app.use('/api/dashboard', require('./src/server/api/dashboard'));
  app.use('/api/mcp', require('./src/server/api/mcp'));
  app.use('/api/prompts', require('./src/server/api/prompts'));
  app.use('/api/env', require('./src/server/api/env'));
  app.use('/api/skills', require('./src/server/api/skills'));
  const claudeHooks = require('./src/server/api/claude-hooks');
  app.use('/api/claude/hooks', claudeHooks);
  claudeHooks.initDefaultHooks();

  // Serve static files
  const distPath = path.join(__dirname, 'dist/web');
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    console.log(chalk.yellow('⚠️  Web UI not built. Run: npm run build:web'));
  }

  // Start server
  const server = app.listen(port, '0.0.0.0', () => {
    console.log(chalk.green(`\n🚀 Coding-Tool Web UI running at:`));
    console.log(chalk.cyan(`   http://0.0.0.0:${port}`));

    attachWebSocketServer(server);
    console.log(chalk.cyan(`   ws://0.0.0.0:${port}/ws\n`));

    // Auto-start proxies
    autoStartProxies(config);
  });

  server.on('error', (err) => {
    console.error(chalk.red('Server error:'), err);
    process.exit(1);
  });
}

async function autoStartProxies(config) {
  const os = require('os');
  const ccToolDir = path.join(os.homedir(), '.claude', 'cc-tool');

  // Claude proxy
  const claudeActiveFile = path.join(ccToolDir, 'active-channel.json');
  if (fs.existsSync(claudeActiveFile)) {
    const proxyPort = parseInt(process.env.CT_CLAUDE_PROXY_PORT) || config.ports?.proxy || 10088;
    try {
      await startProxyServer(proxyPort);
      console.log(chalk.green(`✅ Claude proxy started on port ${proxyPort}`));
    } catch (err) {
      console.error(chalk.red(`❌ Claude proxy failed: ${err.message}`));
    }
  }

  // Codex proxy
  const codexActiveFile = path.join(ccToolDir, 'codex-active-channel.json');
  if (fs.existsSync(codexActiveFile)) {
    const codexPort = parseInt(process.env.CT_CODEX_PROXY_PORT) || config.ports?.codexProxy || 10089;
    try {
      await startCodexProxyServer(codexPort);
      console.log(chalk.green(`✅ Codex proxy started on port ${codexPort}`));
    } catch (err) {
      console.error(chalk.red(`❌ Codex proxy failed: ${err.message}`));
    }
  }

  // Gemini proxy
  const geminiActiveFile = path.join(ccToolDir, 'gemini-active-channel.json');
  if (fs.existsSync(geminiActiveFile)) {
    const geminiPort = parseInt(process.env.CT_GEMINI_PROXY_PORT) || config.ports?.geminiProxy || 10090;
    try {
      const result = await startGeminiProxyServer(geminiPort);
      if (result.success) {
        console.log(chalk.green(`✅ Gemini proxy started on port ${result.port}`));
      }
    } catch (err) {
      console.error(chalk.red(`❌ Gemini proxy failed: ${err.message}`));
    }
  }
}

// Handle signals
process.on('SIGTERM', () => {
  console.log(chalk.yellow('\n👋 Received SIGTERM, shutting down...'));
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log(chalk.yellow('\n👋 Received SIGINT, shutting down...'));
  process.exit(0);
});

// Start
startDockerServer().catch((err) => {
  console.error(chalk.red('Failed to start:'), err);
  process.exit(1);
});
