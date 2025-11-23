const express = require('express');
const httpProxy = require('http-proxy');
const http = require('http');
const net = require('net');
const chalk = require('chalk');
const { getActiveChannel } = require('./services/channels');
const { broadcastLog } = require('./websocket-server');
const { loadConfig } = require('../config/loader');
const { recordRequest } = require('./services/statistics-service');

let proxyServer = null;
let proxyApp = null;
let currentPort = null;

// 用于存储每个请求的元数据（用于 WebSocket 日志）
const requestMetadata = new Map();

// Claude API 定价（每百万 tokens 的价格，单位：美元）
const PRICING = {
  'claude-sonnet-4-5-20250929': { input: 3, output: 15, cacheCreation: 3.75, cacheRead: 0.30 },
  'claude-sonnet-4-20250514': { input: 3, output: 15, cacheCreation: 3.75, cacheRead: 0.30 },
  'claude-sonnet-3-5-20241022': { input: 3, output: 15, cacheCreation: 3.75, cacheRead: 0.30 },
  'claude-sonnet-3-5-20240620': { input: 3, output: 15, cacheCreation: 3.75, cacheRead: 0.30 },
  'claude-opus-4-20250514': { input: 15, output: 75, cacheCreation: 18.75, cacheRead: 1.50 },
  'claude-opus-3-20240229': { input: 15, output: 75, cacheCreation: 18.75, cacheRead: 1.50 },
  'claude-haiku-3-5-20241022': { input: 0.8, output: 4, cacheCreation: 1, cacheRead: 0.08 },
  'claude-3-5-haiku-20241022': { input: 0.8, output: 4, cacheCreation: 1, cacheRead: 0.08 }
};

/**
 * 计算请求成本
 * @param {string} model - 模型名称
 * @param {object} tokens - token 使用情况
 * @returns {number} 成本（美元）
 */
function calculateCost(model, tokens) {
  const pricing = PRICING[model];
  if (!pricing) {
    // 如果没有定价信息，使用 Sonnet 的默认定价
    return (
      (tokens.input || 0) * 3 / 1000000 +
      (tokens.output || 0) * 15 / 1000000 +
      (tokens.cacheCreation || 0) * 3.75 / 1000000 +
      (tokens.cacheRead || 0) * 0.30 / 1000000
    );
  }

  return (
    (tokens.input || 0) * pricing.input / 1000000 +
    (tokens.output || 0) * pricing.output / 1000000 +
    (tokens.cacheCreation || 0) * pricing.cacheCreation / 1000000 +
    (tokens.cacheRead || 0) * pricing.cacheRead / 1000000
  );
}

// 启动代理服务器
async function startProxyServer() {
  if (proxyServer) {
    console.log('Proxy server already running on port', currentPort);
    return { success: true, port: currentPort };
  }

  try {
    // 加载配置获取端口
    const config = loadConfig();
    const port = config.ports?.proxy || 10088;
    currentPort = port;

    proxyApp = express();
    const proxy = httpProxy.createProxyServer({});

    // 监听 proxyReq 事件，修改发往真实API的请求头
    proxy.on('proxyReq', (proxyReq, req, res) => {
      const activeChannel = getActiveChannel();
      if (activeChannel) {
        // 记录请求元数据（用于 WebSocket 日志和统计）
        const requestId = `${Date.now()}-${Math.random()}`;
        requestMetadata.set(req, {
          id: requestId,
          channel: activeChannel.name,
          channelId: activeChannel.id,
          startTime: Date.now()
        });

        // 删除原有的 PROXY_KEY，设置真实的 API Key
        proxyReq.removeHeader('x-api-key');
        proxyReq.setHeader('x-api-key', activeChannel.apiKey);

        // 同时替换 Authorization header (Claude Code 会同时发送这两个 header)
        proxyReq.removeHeader('authorization');
        proxyReq.setHeader('authorization', `Bearer ${activeChannel.apiKey}`);

        // 确保必需的 Anthropic API headers 存在
        if (!proxyReq.getHeader('anthropic-version')) {
          proxyReq.setHeader('anthropic-version', '2023-06-01');
        }

        // 确保 content-type 正确
        if (!proxyReq.getHeader('content-type')) {
          proxyReq.setHeader('content-type', 'application/json');
        }
      }
    });

    // 代理所有请求
    proxyApp.use((req, res) => {
      const activeChannel = getActiveChannel();

      if (!activeChannel) {
        res.status(500).json({
          error: 'No active channel configured',
          type: 'channel_error'
        });
        return;
      }

      // 设置代理目标
      const target = activeChannel.baseUrl;

      // 代理请求
      proxy.web(req, res, {
        target,
        changeOrigin: true
      }, (err) => {
        if (err) {
          console.error('Proxy error:', err);
          if (res && !res.headersSent) {
            res.status(502).json({
              error: 'Proxy error: ' + err.message,
              type: 'proxy_error'
            });
          }
        }
      });
    });

    // 监听代理响应
    proxy.on('proxyRes', (proxyRes, req, res) => {
      // 获取请求元数据
      const metadata = requestMetadata.get(req);
      if (!metadata) {
        return;
      }

      // 解析 SSE 流以提取 token 数据
      let buffer = '';
      let tokenData = {
        inputTokens: 0,
        outputTokens: 0,
        cacheCreation: 0,
        cacheRead: 0,
        model: ''
      };

      proxyRes.on('data', (chunk) => {
        buffer += chunk.toString();

        // 处理完整的 SSE 事件
        const events = buffer.split('\n\n');
        buffer = events.pop() || ''; // 保留未完成的部分

        events.forEach(eventText => {
          if (!eventText.trim()) return;

          try {
            // 解析 SSE 格式: "event: xxx\ndata: {...}"
            const lines = eventText.split('\n');
            let eventType = '';
            let data = '';

            lines.forEach(line => {
              if (line.startsWith('event:')) {
                eventType = line.substring(6).trim();
              } else if (line.startsWith('data:')) {
                data = line.substring(5).trim();
              }
            });

            if (!data) return;

            const parsed = JSON.parse(data);

            // 提取模型名称（在 message_start 事件中）
            if (eventType === 'message_start' && parsed.message && parsed.message.model) {
              tokenData.model = parsed.message.model;
            }

            // 提取 usage 数据
            if (parsed.usage) {
              if (parsed.usage.input_tokens !== undefined) {
                tokenData.inputTokens = parsed.usage.input_tokens;
              }
              if (parsed.usage.output_tokens !== undefined) {
                tokenData.outputTokens = parsed.usage.output_tokens;
              }
              if (parsed.usage.cache_creation_input_tokens !== undefined) {
                tokenData.cacheCreation = parsed.usage.cache_creation_input_tokens;
              }
              if (parsed.usage.cache_read_input_tokens !== undefined) {
                tokenData.cacheRead = parsed.usage.cache_read_input_tokens;
              }
            }

            // 如果是 message_delta 事件，通常包含最终的 usage
            if (eventType === 'message_delta' && parsed.usage) {
              // 格式化时间为 HH:MM:SS
              const now = new Date();
              const time = now.toLocaleTimeString('zh-CN', {
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
              });

              // 广播日志
              broadcastLog({
                id: metadata.id,
                time: time,
                channel: metadata.channel,
                model: tokenData.model,
                inputTokens: tokenData.inputTokens,
                outputTokens: tokenData.outputTokens,
                cacheCreation: tokenData.cacheCreation,
                cacheRead: tokenData.cacheRead,
                source: 'claude'
              });

              // 记录统计数据
              const tokens = {
                input: tokenData.inputTokens,
                output: tokenData.outputTokens,
                cacheCreation: tokenData.cacheCreation,
                cacheRead: tokenData.cacheRead,
                total: tokenData.inputTokens + tokenData.outputTokens + tokenData.cacheCreation + tokenData.cacheRead
              };
              const cost = calculateCost(tokenData.model, tokens);
              const duration = Date.now() - metadata.startTime;

              recordRequest({
                id: metadata.id,
                timestamp: new Date(metadata.startTime).toISOString(),
                toolType: 'claude-code',
                channel: metadata.channel,
                channelId: metadata.channelId,
                model: tokenData.model,
                tokens: tokens,
                duration: duration,
                success: true,
                cost: cost
              });
            }
          } catch (err) {
            // 忽略解析错误
          }
        });
      });

      proxyRes.on('end', () => {
        // 清理元数据
        requestMetadata.delete(req);
      });
    });

    // 处理代理错误
    proxy.on('error', (err, req, res) => {
      console.error('Proxy error:', err);
      if (res && !res.headersSent) {
        res.status(502).json({
          error: 'Proxy error: ' + err.message,
          type: 'proxy_error'
        });
      }
    });

    // 启动服务器
    proxyServer = http.createServer(proxyApp);

    return new Promise((resolve, reject) => {
      proxyServer.listen(port, '127.0.0.1', () => {
        console.log(`✅ Proxy server started on http://127.0.0.1:${port}`);

        // WebSocket 服务器已经在 Web UI 启动时附加到 HTTP 服务器了
        // 不需要在这里重复启动

        resolve({ success: true, port });
      });

      proxyServer.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          console.error(chalk.red(`\n❌ 代理服务端口 ${port} 已被占用`));
          console.error(chalk.yellow('\n💡 解决方案:'));
          console.error(chalk.gray('   1. 运行 cc 命令，选择"配置端口"修改端口'));
          console.error(chalk.gray(`   2. 或关闭占用端口 ${port} 的程序\n`));
        } else {
          console.error('Failed to start proxy server:', err);
        }
        proxyServer = null;
        proxyApp = null;
        currentPort = null;
        reject(err);
      });
    });
  } catch (err) {
    console.error('Error starting proxy server:', err);
    throw err;
  }
}

// 停止代理服务器
async function stopProxyServer() {
  if (!proxyServer) {
    return { success: true, message: 'Proxy server not running' };
  }

  // 注意：不要停止 WebSocket 服务器！
  // WebSocket 服务器附加到 Web UI 的 HTTP 服务器上，
  // 应该始终保持运行，直到 Web UI 停止

  // 清理请求元数据
  requestMetadata.clear();

  return new Promise((resolve) => {
    proxyServer.close(() => {
      console.log('✅ Proxy server stopped');
      proxyServer = null;
      proxyApp = null;
      const stoppedPort = currentPort;
      currentPort = null;
      resolve({ success: true, port: stoppedPort });
    });
  });
}

// 获取代理服务器状态
function getProxyStatus() {
  const config = loadConfig();
  return {
    running: !!proxyServer,
    port: currentPort,
    defaultPort: config.ports?.proxy || 10088
  };
}

module.exports = {
  startProxyServer,
  stopProxyServer,
  getProxyStatus
};
