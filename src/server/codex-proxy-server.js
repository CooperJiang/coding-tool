const express = require('express');
const httpProxy = require('http-proxy');
const http = require('http');
const chalk = require('chalk');
const { broadcastLog, broadcastSchedulerState } = require('./websocket-server');
const { allocateChannel, releaseChannel, getSchedulerState } = require('./services/channel-scheduler');
const { recordSuccess, recordFailure } = require('./services/channel-health');
const { loadConfig } = require('../config/loader');
const DEFAULT_CONFIG = require('../config/default');
const { resolvePricing } = require('./utils/pricing');
const { recordRequest } = require('./services/statistics-service');
const { saveProxyStartTime, clearProxyStartTime, getProxyStartTime, getProxyRuntime } = require('./services/proxy-runtime');

let proxyServer = null;
let proxyApp = null;
let currentPort = null;

// 用于存储每个请求的元数据
const requestMetadata = new Map();

// OpenAI 模型定价（每百万 tokens 的价格，单位：美元）
const PRICING = {
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-2024-11-20': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4-turbo': { input: 10, output: 30 },
  'gpt-4': { input: 30, output: 60 },
  'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
  'o1': { input: 15, output: 60 },
  'o1-mini': { input: 3, output: 12 },
  'o1-pro': { input: 150, output: 600 },
  'o3': { input: 10, output: 40 },
  'o3-mini': { input: 1.1, output: 4.4 },
  'o4-mini': { input: 1.1, output: 4.4 },
  // Claude 模型（通过 OpenAI 格式访问）
  'claude-sonnet-4-5-20250929': { input: 3, output: 15 },
  'claude-sonnet-4-20250514': { input: 3, output: 15 },
  'claude-opus-4-20250514': { input: 15, output: 75 },
  'claude-3-5-sonnet-20241022': { input: 3, output: 15 },
  'claude-3-5-haiku-20241022': { input: 0.8, output: 4 }
};

const CODEX_BASE_PRICING = DEFAULT_CONFIG.pricing.codex;
const ONE_MILLION = 1000000;

function resolveCodexTarget(baseUrl = '', requestPath = '') {
  let target = baseUrl || '';
  if (target.endsWith('/')) {
    target = target.slice(0, -1);
  }
  if (target.endsWith('/v1') && requestPath.startsWith('/v1')) {
    target = target.slice(0, -3);
  }
  return target;
}

/**
 * 计算请求成本
 */
function calculateCost(model, tokens) {
  // 尝试精确匹配
  let pricing = PRICING[model];

  // 如果没有精确匹配，尝试模糊匹配
  if (!pricing) {
    const modelLower = model.toLowerCase();
    if (modelLower.includes('gpt-4o-mini')) {
      pricing = PRICING['gpt-4o-mini'];
    } else if (modelLower.includes('gpt-4o')) {
      pricing = PRICING['gpt-4o'];
    } else if (modelLower.includes('gpt-4')) {
      pricing = PRICING['gpt-4'];
    } else if (modelLower.includes('gpt-3.5')) {
      pricing = PRICING['gpt-3.5-turbo'];
    } else if (modelLower.includes('o1-mini')) {
      pricing = PRICING['o1-mini'];
    } else if (modelLower.includes('o1-pro')) {
      pricing = PRICING['o1-pro'];
    } else if (modelLower.includes('o1')) {
      pricing = PRICING['o1'];
    } else if (modelLower.includes('o3-mini')) {
      pricing = PRICING['o3-mini'];
    } else if (modelLower.includes('o3')) {
      pricing = PRICING['o3'];
    } else if (modelLower.includes('o4-mini')) {
      pricing = PRICING['o4-mini'];
    } else if (modelLower.includes('claude')) {
      // Claude 模型默认使用 Sonnet 定价
      pricing = PRICING['claude-sonnet-4-5-20250929'];
    }
  }

  // 默认使用基础定价
  pricing = resolvePricing('codex', pricing, CODEX_BASE_PRICING);
  const inputRate = typeof pricing.input === 'number' ? pricing.input : CODEX_BASE_PRICING.input;
  const outputRate = typeof pricing.output === 'number' ? pricing.output : CODEX_BASE_PRICING.output;

  return (
    (tokens.input || 0) * inputRate / ONE_MILLION +
    (tokens.output || 0) * outputRate / ONE_MILLION
  );
}

// 启动 Codex 代理服务器
async function startCodexProxyServer(options = {}) {
  // options.preserveStartTime - 是否保留现有的启动时间（用于切换渠道时）
  const preserveStartTime = options.preserveStartTime || false;

  if (proxyServer) {
    console.log('Codex proxy server already running on port', currentPort);
    return { success: true, port: currentPort };
  }

  try {
    const config = loadConfig();
    const port = config.ports?.codexProxy || 10089;
    currentPort = port;

    proxyApp = express();
    const proxy = httpProxy.createProxyServer({});

    proxy.on('proxyReq', (proxyReq, req) => {
      const activeChannel = req.selectedChannel;
      if (!activeChannel) return;

      const requestId = `codex-${Date.now()}-${Math.random()}`;
      requestMetadata.set(req, {
        id: requestId,
      channel: activeChannel.name,
      channelId: activeChannel.id,
      startTime: Date.now()
      });

      proxyReq.removeHeader('authorization');
      proxyReq.setHeader('authorization', `Bearer ${activeChannel.apiKey}`);
      proxyReq.setHeader('openai-beta', 'responses=experimental');
      if (!proxyReq.getHeader('content-type')) {
        proxyReq.setHeader('content-type', 'application/json');
      }
    });

    proxyApp.use(async (req, res) => {
      try {
        const channel = await allocateChannel({ source: 'codex', enableSessionBinding: false });
        req.selectedChannel = channel;

        const release = (() => {
          let released = false;
          return () => {
            if (released) return;
            released = true;
            releaseChannel(channel.id, 'codex');
            broadcastSchedulerState('codex', getSchedulerState('codex'));
          };
        })();

        res.on('close', release);
        res.on('error', release);

        broadcastSchedulerState('codex', getSchedulerState('codex'));

        const target = resolveCodexTarget(channel.baseUrl, req.url);

        proxy.web(req, res, {
          target,
          changeOrigin: true
        }, (err) => {
          release();
          if (err) {
            recordFailure(channel.id, 'codex', err);
            console.error('Codex proxy error:', err);
            if (res && !res.headersSent) {
              res.status(502).json({
                error: {
                  message: 'Proxy error: ' + err.message,
                  type: 'proxy_error'
                }
              });
            }
          }
        });
      } catch (error) {
        console.error('Codex channel allocation error:', error);
        if (!res.headersSent) {
          res.status(503).json({
            error: {
              message: error.message || 'No Codex channel available',
              type: 'channel_pool_exhausted'
            }
          });
        }
      }
    });

    // 监听代理响应 (OpenAI 格式)
    proxy.on('proxyRes', (proxyRes, req, res) => {
      const metadata = requestMetadata.get(req);
      if (!metadata) {
        return;
      }

      // 检查响应是否已关闭
      if (res.writableEnded || res.destroyed) {
        requestMetadata.delete(req);
        return;
      }

      // 标记响应是否已关闭
      let isResponseClosed = false;

      // 监听响应关闭事件
      res.on('close', () => {
        isResponseClosed = true;
        requestMetadata.delete(req);
      });

      // 监听响应错误事件
      res.on('error', (err) => {
        isResponseClosed = true;
        // 忽略客户端断开连接的常见错误
        if (err.code !== 'EPIPE' && err.code !== 'ECONNRESET') {
          console.error('Response error:', err);
        }
        requestMetadata.delete(req);
      });

      let buffer = '';
      let tokenData = {
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        reasoningTokens: 0,
        totalTokens: 0,
        model: ''
      };

      proxyRes.on('data', (chunk) => {
        // 如果响应已关闭，停止处理
        if (isResponseClosed) {
          return;
        }

        buffer += chunk.toString();

        // 检查是否是 SSE 流
        if (proxyRes.headers['content-type']?.includes('text/event-stream')) {
          // 处理 SSE 事件
          const events = buffer.split('\n\n');
          buffer = events.pop() || '';

          events.forEach((eventText, index) => {
            if (!eventText.trim()) return;

            try {
              const lines = eventText.split('\n');
              let data = '';

              lines.forEach(line => {
                if (line.startsWith('data:')) {
                  data = line.substring(5).trim();
                }
              });

              if (!data) return;

              if (data === '[DONE]') return;

              const parsed = JSON.parse(data);

              // OpenAI Responses API: 在 response.completed 事件中获取 usage
              if (parsed.type === 'response.completed' && parsed.response) {
                // 从 response 对象中提取模型和 usage
                if (parsed.response.model) {
                  tokenData.model = parsed.response.model;
                }

                if (parsed.response.usage) {
                  tokenData.inputTokens = parsed.response.usage.input_tokens || 0;
                  tokenData.outputTokens = parsed.response.usage.output_tokens || 0;
                  tokenData.totalTokens = parsed.response.usage.total_tokens || 0;

                  // 提取详细信息
                  if (parsed.response.usage.input_tokens_details) {
                    tokenData.cachedTokens = parsed.response.usage.input_tokens_details.cached_tokens || 0;
                  }
                  if (parsed.response.usage.output_tokens_details) {
                    tokenData.reasoningTokens = parsed.response.usage.output_tokens_details.reasoning_tokens || 0;
                  }
                }
              }

              // 兼容其他格式：直接在顶层的 model 和 usage
              if (parsed.model && !tokenData.model) {
                tokenData.model = parsed.model;
              }

              if (parsed.usage && tokenData.inputTokens === 0) {
                // 兼容 Responses API 和 Chat Completions API
                tokenData.inputTokens = parsed.usage.input_tokens || parsed.usage.prompt_tokens || 0;
                tokenData.outputTokens = parsed.usage.output_tokens || parsed.usage.completion_tokens || 0;
              }
            } catch (err) {
              // 忽略解析错误
            }
          });
        }
      });

      proxyRes.on('end', () => {
        // 如果不是流式响应，尝试从完整响应中解析
        if (!proxyRes.headers['content-type']?.includes('text/event-stream')) {
          try {
            const parsed = JSON.parse(buffer);
            if (parsed.model) {
              tokenData.model = parsed.model;
            }
            if (parsed.usage) {
              // 兼容两种格式
              tokenData.inputTokens = parsed.usage.input_tokens || parsed.usage.prompt_tokens || 0;
              tokenData.outputTokens = parsed.usage.output_tokens || parsed.usage.completion_tokens || 0;
            }
          } catch (err) {
            // 忽略解析错误
          }
        }

        // 只有当有 token 数据时才记录
        if (tokenData.inputTokens > 0 || tokenData.outputTokens > 0) {
          const now = new Date();
          const time = now.toLocaleTimeString('zh-CN', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          });

          // 记录统计数据（先计算）
          const tokens = {
            input: tokenData.inputTokens,
            output: tokenData.outputTokens,
            total: tokenData.inputTokens + tokenData.outputTokens
          };
          const cost = calculateCost(tokenData.model, tokens);

          // 广播日志（仅当响应仍然开放时）
          if (!isResponseClosed) {
            broadcastLog({
              type: 'log',
              id: metadata.id,
              time: time,
              channel: metadata.channel,
              model: tokenData.model,
              inputTokens: tokenData.inputTokens,
              outputTokens: tokenData.outputTokens,
              cachedTokens: tokenData.cachedTokens,
              reasoningTokens: tokenData.reasoningTokens,
              totalTokens: tokenData.totalTokens,
              cost: cost,
              source: 'codex'
            });
          }

          const duration = Date.now() - metadata.startTime;

          recordRequest({
            id: metadata.id,
            timestamp: new Date(metadata.startTime).toISOString(),
            toolType: 'codex',
            channel: metadata.channel,
            channelId: metadata.channelId,
            model: tokenData.model,
            tokens: tokens,
            duration: duration,
            success: true,
            cost: cost
          });

          recordSuccess(metadata.channelId, 'codex');
        }

        if (!isResponseClosed) {
          requestMetadata.delete(req);
        }
      });

      proxyRes.on('error', (err) => {
        // 忽略代理响应错误（可能是网络问题）
        if (err.code !== 'EPIPE' && err.code !== 'ECONNRESET') {
          console.error('Proxy response error:', err);
        }
        isResponseClosed = true;
        recordFailure(metadata.channelId, 'codex', err);
        requestMetadata.delete(req);
      });
    });

    // 处理代理错误
    proxy.on('error', (err, req, res) => {
      console.error('Codex proxy error:', err);
      if (req && req.selectedChannel) {
        recordFailure(req.selectedChannel.id, 'codex', err);
        releaseChannel(req.selectedChannel.id, 'codex');
        broadcastSchedulerState('codex', getSchedulerState('codex'));
      }
      if (res && !res.headersSent) {
        res.status(502).json({
          error: {
            message: 'Proxy error: ' + err.message,
            type: 'proxy_error'
          }
        });
      }
    });

    // 启动服务器
    proxyServer = http.createServer(proxyApp);

    return new Promise((resolve, reject) => {
      proxyServer.listen(port, '127.0.0.1', () => {
        console.log(`Codex proxy server started on http://127.0.0.1:${port}`);

        // 保存代理启动时间（如果是切换渠道，保留原有启动时间）
        saveProxyStartTime('codex', preserveStartTime);

        resolve({ success: true, port });
      });

      proxyServer.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          console.error(chalk.red(`\nCodex proxy port ${port} is already in use`));
        } else {
          console.error('Failed to start Codex proxy server:', err);
        }
        proxyServer = null;
        proxyApp = null;
        currentPort = null;
        reject(err);
      });
    });
  } catch (err) {
    console.error('Error starting Codex proxy server:', err);
    throw err;
  }
}

// 停止 Codex 代理服务器
async function stopCodexProxyServer(options = {}) {
  // options.clearStartTime - 是否清除启动时间（默认 true）
  const clearStartTime = options.clearStartTime !== false;

  if (!proxyServer) {
    return { success: true, message: 'Codex proxy server not running' };
  }

  requestMetadata.clear();

  return new Promise((resolve) => {
    proxyServer.close(() => {
      console.log('Codex proxy server stopped');

      // 清除代理启动时间（仅当明确要求时）
      if (clearStartTime) {
        clearProxyStartTime('codex');
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
function getCodexProxyStatus() {
  const config = loadConfig();
  const startTime = getProxyStartTime('codex');
  const runtime = getProxyRuntime('codex');

  return {
    running: !!proxyServer,
    port: currentPort,
    defaultPort: config.ports?.codexProxy || 10089,
    startTime,
    runtime
  };
}

module.exports = {
  startCodexProxyServer,
  stopCodexProxyServer,
  getCodexProxyStatus
};
