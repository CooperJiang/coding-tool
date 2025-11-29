const express = require('express');
const httpProxy = require('http-proxy');
const http = require('http');
const net = require('net');
const chalk = require('chalk');
const { allocateChannel, releaseChannel, getSchedulerState } = require('./services/channel-scheduler');
const { recordSuccess, recordFailure } = require('./services/channel-health');
const { broadcastLog, broadcastSchedulerState } = require('./websocket-server');
const { loadConfig } = require('../config/loader');
const DEFAULT_CONFIG = require('../config/default');
const { resolvePricing } = require('./utils/pricing');
const { recordRequest } = require('./services/statistics-service');
const { saveProxyStartTime, clearProxyStartTime, getProxyStartTime, getProxyRuntime } = require('./services/proxy-runtime');

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

const CLAUDE_BASE_PRICING = DEFAULT_CONFIG.pricing.claude;
const ONE_MILLION = 1000000;

/**
 * 计算请求成本
 * @param {string} model - 模型名称
 * @param {object} tokens - token 使用情况
 * @returns {number} 成本（美元）
 */
function calculateCost(model, tokens) {
  const basePricing = PRICING[model] || {};
  const pricing = resolvePricing('claude', basePricing, CLAUDE_BASE_PRICING);

  const inputRate = typeof pricing.input === 'number' ? pricing.input : CLAUDE_BASE_PRICING.input;
  const outputRate = typeof pricing.output === 'number' ? pricing.output : CLAUDE_BASE_PRICING.output;
  const cacheCreationRate = typeof pricing.cacheCreation === 'number' ? pricing.cacheCreation : CLAUDE_BASE_PRICING.cacheCreation;
  const cacheReadRate = typeof pricing.cacheRead === 'number' ? pricing.cacheRead : CLAUDE_BASE_PRICING.cacheRead;

  return (
    (tokens.input || 0) * inputRate / ONE_MILLION +
    (tokens.output || 0) * outputRate / ONE_MILLION +
    (tokens.cacheCreation || 0) * cacheCreationRate / ONE_MILLION +
    (tokens.cacheRead || 0) * cacheReadRate / ONE_MILLION
  );
}

const jsonBodyParser = express.json({
  limit: '10mb',
  verify: (req, res, buf) => {
    req.rawBody = Buffer.from(buf);
  }
});

function shouldParseJson(req) {
  const contentType = req.headers['content-type'] || '';
  return req.method === 'POST' && contentType.includes('application/json');
}

function extractSessionIdFromBody(body = {}) {
  if (!body || typeof body !== 'object') return null;
  return (
    body.session_id ||
    body.sessionId ||
    body.conversation_id ||
    body.conversationId ||
    body.metadata?.session_id ||
    body.metadata?.sessionId ||
    body.metadata?.conversation_id ||
    body.workspace?.workspace_id ||
    body.project_id ||
    null
  );
}

function extractSessionId(req) {
  const headerSession =
    req.headers['x-session-id'] ||
    req.headers['x-claude-session'] ||
    req.headers['x-cc-session'];
  if (headerSession) return String(headerSession);
  if (req.body) {
    return extractSessionIdFromBody(req.body);
  }
  return null;
}

async function startProxyServer(options = {}) {
  const preserveStartTime = options.preserveStartTime || false;

  if (proxyServer) {
    console.log('Proxy server already running on port', currentPort);
    return { success: true, port: currentPort };
  }

  try {
    const config = loadConfig();
    const port = config.ports?.proxy || 10088;
    currentPort = port;

    proxyApp = express();
    proxyApp.use((req, res, next) => {
      if (shouldParseJson(req)) {
        return jsonBodyParser(req, res, next);
      }
      return next();
    });
    const proxy = httpProxy.createProxyServer({});

    proxy.on('proxyReq', (proxyReq, req, res) => {
      const selectedChannel = req.selectedChannel;
      if (selectedChannel) {
        const requestId = `${Date.now()}-${Math.random()}`;
        requestMetadata.set(req, {
          id: requestId,
          channel: selectedChannel.name,
          channelId: selectedChannel.id,
          startTime: Date.now(),
          sessionId: req.sessionId || null
        });

        proxyReq.removeHeader('x-api-key');
        proxyReq.setHeader('x-api-key', selectedChannel.apiKey);
        proxyReq.removeHeader('authorization');
        proxyReq.setHeader('authorization', `Bearer ${selectedChannel.apiKey}`);

        if (!proxyReq.getHeader('anthropic-version')) {
          proxyReq.setHeader('anthropic-version', '2023-06-01');
        }
        if (!proxyReq.getHeader('content-type')) {
          proxyReq.setHeader('content-type', 'application/json');
        }
      }

      if (shouldParseJson(req) && (req.rawBody || req.body)) {
        const bodyBuffer = req.rawBody
          ? Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from(req.rawBody)
          : Buffer.from(JSON.stringify(req.body));
        proxyReq.setHeader('Content-Length', bodyBuffer.length);
        proxyReq.write(bodyBuffer);
        proxyReq.end();
      }
    });

    proxyApp.use(async (req, res) => {
      try {
        const sessionId = extractSessionId(req);
        const config = loadConfig();
        const enableSessionBinding = config.enableSessionBinding !== false; // 默认开启
        const channel = await allocateChannel({ source: 'claude', sessionId, enableSessionBinding });

        // 广播调度状态（请求开始）
        broadcastSchedulerState('claude', getSchedulerState('claude'));

        req.selectedChannel = channel;
        req.sessionId = sessionId || null;
        let released = false;

        const release = () => {
          if (released) return;
          released = true;
          releaseChannel(channel.id, 'claude');
          // 广播调度状态（请求结束）
          broadcastSchedulerState('claude', getSchedulerState('claude'));
        };

        req.__releaseChannel = release;

        res.on('close', release);
        res.on('error', release);

        proxy.web(req, res, {
          target: channel.baseUrl,
          changeOrigin: true
        }, (err) => {
          release();
          if (err) {
            // 记录请求失败
            recordFailure(channel.id, 'claude', err);
            console.error('Proxy error:', err);
            if (res && !res.headersSent) {
              res.status(502).json({
                error: 'Proxy error: ' + err.message,
                type: 'proxy_error'
              });
            }
          }
        });
      } catch (error) {
        console.error('Channel allocation error:', error);
        if (!res.headersSent) {
          res.status(503).json({
            error: error.message || '所有渠道暂时不可用',
            type: 'channel_pool_exhausted'
          });
        }
      }
    });

    proxy.on('proxyRes', (proxyRes, req, res) => {
      const metadata = requestMetadata.get(req);
      if (!metadata) return;

      if (res.writableEnded || res.destroyed) {
        requestMetadata.delete(req);
        return;
      }

      let isResponseClosed = false;

      res.on('close', () => {
        isResponseClosed = true;
        requestMetadata.delete(req);
      });

      res.on('error', (err) => {
        isResponseClosed = true;
        if (err.code !== 'EPIPE' && err.code !== 'ECONNRESET') {
          console.error('Response error:', err);
        }
        requestMetadata.delete(req);
      });

      let buffer = '';
      let tokenData = {
        inputTokens: 0,
        outputTokens: 0,
        cacheCreation: 0,
        cacheRead: 0,
        model: ''
      };

      proxyRes.on('data', (chunk) => {
        if (isResponseClosed) return;

        buffer += chunk.toString();

        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        events.forEach(eventText => {
          if (!eventText.trim()) return;

          try {
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

            if (eventType === 'message_start' && parsed.message && parsed.message.model) {
              tokenData.model = parsed.message.model;
            }

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

            if (eventType === 'message_delta' && parsed.usage) {
              const now = new Date();
              const time = now.toLocaleTimeString('zh-CN', {
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
              });

              const tokens = {
                input: tokenData.inputTokens,
                output: tokenData.outputTokens,
                cacheCreation: tokenData.cacheCreation,
                cacheRead: tokenData.cacheRead,
                total: tokenData.inputTokens + tokenData.outputTokens + tokenData.cacheCreation + tokenData.cacheRead
              };
              const cost = calculateCost(tokenData.model, tokens);

              if (!isResponseClosed) {
                broadcastLog({
                  type: 'log',
                  id: metadata.id,
                  time: time,
                  channel: metadata.channel,
                  model: tokenData.model,
                  inputTokens: tokenData.inputTokens,
                  outputTokens: tokenData.outputTokens,
                  cacheCreation: tokenData.cacheCreation,
                  cacheRead: tokenData.cacheRead,
                  cost: cost,
                  source: 'claude'
                });
              }

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

              // 记录请求成功（用于健康检查）
              recordSuccess(metadata.channelId, 'claude');
            }
          } catch (err) {
          }
        });
      });

      const finalize = () => {
        if (!isResponseClosed) {
          requestMetadata.delete(req);
        }
        if (typeof req.__releaseChannel === 'function') {
          req.__releaseChannel();
        }
      };

      proxyRes.on('end', finalize);

      proxyRes.on('error', (err) => {
        if (err.code !== 'EPIPE' && err.code !== 'ECONNRESET') {
          console.error('Proxy response error:', err);
        }
        // 记录响应错误
        if (metadata && metadata.channelId) {
          recordFailure(metadata.channelId, 'claude', err);
        }
        isResponseClosed = true;
        finalize();
      });
    });

    proxy.on('error', (err, req, res) => {
      console.error('Proxy error:', err);
      // 记录请求失败（用于健康检查）
      if (req && req.selectedChannel && req.selectedChannel.id) {
        recordFailure(req.selectedChannel.id, 'claude', err);
      }
      if (res && !res.headersSent) {
        res.status(502).json({
          error: 'Proxy error: ' + err.message,
          type: 'proxy_error'
        });
      }
    });

    proxyServer = http.createServer(proxyApp);

    return new Promise((resolve, reject) => {
      proxyServer.listen(port, '127.0.0.1', () => {
        console.log(`✅ Proxy server started on http://127.0.0.1:${port}`);
        saveProxyStartTime('claude', preserveStartTime);
        resolve({ success: true, port });
      });

      proxyServer.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          console.error(chalk.red(`\n❌ 代理服务端口 ${port} 已被占用`));
          console.error(chalk.yellow('\n💡 解决方案:'));
          console.error(chalk.gray('   1. 运行 ct 命令，选择"配置端口"修改端口'));
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

async function stopProxyServer(options = {}) {
  const clearStartTime = options.clearStartTime !== false;

  if (!proxyServer) {
    return { success: true, message: 'Proxy server not running' };
  }

  requestMetadata.clear();

  return new Promise((resolve) => {
    proxyServer.close(() => {
      console.log('✅ Proxy server stopped');
      if (clearStartTime) {
        clearProxyStartTime('claude');
      }
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
  const startTime = getProxyStartTime('claude');
  const runtime = getProxyRuntime('claude');

  return {
    running: !!proxyServer,
    port: currentPort,
    defaultPort: config.ports?.proxy || 10088,
    startTime,
    runtime
  };
}

module.exports = {
  startProxyServer,
  stopProxyServer,
  getProxyStatus
};
