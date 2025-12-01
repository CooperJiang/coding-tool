const express = require('express');
const path = require('path');
const chalk = require('chalk');
const inquirer = require('inquirer');
const { loadConfig } = require('../config/loader');
const { startWebSocketServer: attachWebSocketServer } = require('./websocket-server');
const { isPortInUse, killProcessByPort, waitForPortRelease } = require('../utils/port-helper');
const { isProxyConfig } = require('./services/settings-manager');
const { isProxyConfig: isCodexProxyConfig } = require('./services/codex-settings-manager');
const { startProxyServer } = require('./proxy-server');
const { startCodexProxyServer } = require('./codex-proxy-server');
const { startGeminiProxyServer } = require('./gemini-proxy-server');

async function startServer(port) {
  const config = loadConfig();
  // 使用配置的端口，如果没有传入参数
  if (!port) {
    port = config.ports?.webUI || 10099;
  }

  // 检查端口是否被占用
  const portInUse = await isPortInUse(port);
  if (portInUse) {
    console.log(chalk.yellow(`\n⚠️  端口 ${port} 已被占用\n`));

    // 询问用户是否关闭占用端口的进程
    const { shouldKill } = await inquirer.prompt([
      {
        type: 'list',
        name: 'shouldKill',
        message: '是否关闭占用该端口的进程并启动服务？',
        choices: [
          { name: '是，关闭进程并启动', value: true },
          { name: '否，取消启动', value: false }
        ],
        default: 0 // 默认选择"是"
      }
    ]);

    if (!shouldKill) {
      console.log(chalk.gray('\n已取消启动'));
      console.log(chalk.yellow('\n💡 解决方案:'));
      console.log(chalk.gray('   1. 运行 ct 命令，选择"配置端口"修改端口'));
      console.log(chalk.gray(`   2. 或手动关闭占用端口 ${port} 的程序\n`));
      process.exit(0);
    }

    // 尝试杀掉占用端口的进程
    console.log(chalk.cyan('正在关闭占用端口的进程...'));
    const killed = killProcessByPort(port);

    if (!killed) {
      console.error(chalk.red('\n❌ 无法关闭占用端口的进程'));
      console.error(chalk.yellow('\n💡 请手动关闭占用端口的程序，或使用其他端口\n'));
      process.exit(1);
    }

    // 等待端口释放
    console.log(chalk.cyan('等待端口释放...'));
    const released = await waitForPortRelease(port);

    if (!released) {
      console.error(chalk.red('\n❌ 端口释放超时'));
      console.error(chalk.yellow('\n💡 请稍后重试，或手动检查端口占用情况\n'));
      process.exit(1);
    }

    console.log(chalk.green('✓ 端口已释放\n'));
  }

  const app = express();

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // CORS for development
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
  app.use('/api/projects', require('./api/projects')(config));
  app.use('/api/sessions', require('./api/sessions')(config));

  // Codex API Routes
  app.use('/api/codex/projects', require('./api/codex-projects')(config));
  app.use('/api/codex/sessions', require('./api/codex-sessions')(config));
  app.use('/api/codex/channels', require('./api/codex-channels')(config));

  // Gemini API Routes
  app.use('/api/gemini/projects', require('./api/gemini-projects')(config));
  app.use('/api/gemini/sessions', require('./api/gemini-sessions')(config));
  app.use('/api/gemini/channels', require('./api/gemini-channels')(config));
  app.use('/api/gemini/proxy', require('./api/gemini-proxy'));

  app.use('/api/aliases', require('./api/aliases')());
  app.use('/api/favorites', require('./api/favorites'));
  app.use('/api/ui-config', require('./api/ui-config'));
  app.use('/api/channels', require('./api/channels'));
  app.use('/api/proxy', require('./api/proxy'));
  app.use('/api/codex/proxy', require('./api/codex-proxy'));
  app.use('/api/settings', require('./api/settings'));
  app.use('/api/config', require('./api/config'));
  app.use('/api/statistics', require('./api/statistics'));
  app.use('/api/version', require('./api/version'));
  app.use('/api/pm2-autostart', require('./api/pm2-autostart')());
  app.use('/api/dashboard', require('./api/dashboard'));
  app.use('/api/mcp', require('./api/mcp'));
  app.use('/api/prompts', require('./api/prompts'));
  app.use('/api/env', require('./api/env'));

  // Serve static files in production
  const distPath = path.join(__dirname, '../../dist/web');
  if (require('fs').existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Start server
  const server = app.listen(port, () => {
    console.log(`\n🚀 Coding-Tool Web UI running at:`);
    console.log(`   http://localhost:${port}`);

    // 附加 WebSocket 服务器到同一个端口
    attachWebSocketServer(server);
    console.log(`   ws://localhost:${port}/ws\n`);

    // 自动恢复代理状态
    autoRestoreProxies();
  });

  // 监听端口占用错误
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(chalk.red(`\n❌ 端口 ${port} 已被占用`));
      console.error(chalk.yellow('\n💡 解决方案:'));
      console.error(chalk.gray('   1. 运行 ct 命令，选择"配置端口"修改端口'));
      console.error(chalk.gray(`   2. 或关闭占用端口 ${port} 的程序\n`));
      process.exit(1);
    }
  });

  return server;
}

// 自动恢复代理状态
function autoRestoreProxies() {
  const config = loadConfig();
  const os = require('os');
  const fs = require('fs');
  const path = require('path');

  const ccToolDir = path.join(os.homedir(), '.claude', 'cc-tool');

  // 检查 Claude 代理状态文件
  const claudeActiveFile = path.join(ccToolDir, 'active-channel.json');
  if (fs.existsSync(claudeActiveFile)) {
    console.log(chalk.cyan('\n🔄 检测到 Claude 代理状态文件，正在自动启动...'));
    const proxyPort = config.ports?.proxy || 10088;
    startProxyServer(proxyPort)
      .then(() => {
        console.log(chalk.green(`✅ Claude 代理已自动启动，端口: ${proxyPort}`));
      })
      .catch((err) => {
        console.error(chalk.red(`❌ Claude 代理启动失败: ${err.message}`));
      });
  }

  // 检查 Codex 代理状态文件
  const codexActiveFile = path.join(ccToolDir, 'codex-active-channel.json');
  if (fs.existsSync(codexActiveFile)) {
    console.log(chalk.cyan('\n🔄 检测到 Codex 代理状态文件，正在自动启动...'));
    const codexProxyPort = config.ports?.codexProxy || 10089;
    startCodexProxyServer(codexProxyPort)
      .then(() => {
        console.log(chalk.green(`✅ Codex 代理已自动启动，端口: ${codexProxyPort}`));
      })
      .catch((err) => {
        console.error(chalk.red(`❌ Codex 代理启动失败: ${err.message}`));
      });
  }

  // 检查 Gemini 代理状态文件
  const geminiActiveFile = path.join(ccToolDir, 'gemini-active-channel.json');
  if (fs.existsSync(geminiActiveFile)) {
    console.log(chalk.cyan('\n🔄 检测到 Gemini 代理状态文件，正在自动启动...'));
    const geminiProxyPort = config.ports?.geminiProxy || 10090;
    startGeminiProxyServer(geminiProxyPort)
      .then((result) => {
        if (result.success) {
          console.log(chalk.green(`✅ Gemini 代理已自动启动，端口: ${result.port}`));
        } else {
          console.error(chalk.red(`❌ Gemini 代理启动失败: ${result.error || 'Unknown error'}`));
        }
      })
      .catch((err) => {
        console.error(chalk.red(`❌ Gemini 代理启动失败: ${err.message}`));
      });
  } else {
    console.log(chalk.gray('\n💡 提示: 如需使用 Gemini 代理，请在前端界面激活 Gemini 渠道'));
  }
}

module.exports = { startServer };
