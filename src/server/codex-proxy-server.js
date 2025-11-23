const express = require('express');
const httpProxy = require('http-proxy');
const http = require('http');
const chalk = require('chalk');
const { getActiveCodexChannel } = require('./services/codex-channels');
const { broadcastLog } = require('./websocket-server');
const { loadConfig } = require('../config/loader');
const { recordRequest } = require('./services/statistics-service');

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

  // 默认使用 GPT-4o 的定价
  if (!pricing) {
    pricing = { input: 2.5, output: 10 };
  }

  return (
    (tokens.input || 0) * pricing.input / 1000000 +
    (tokens.output || 0) * pricing.output / 1000000
  );
}

// 启动 Codex 代理服务器
async function startCodexProxyServer() {
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

    // 监听 proxyReq 事件，修改发往真实API的请求头
    proxy.on('proxyReq', (proxyReq, req, res) => {
      const activeChannel = getActiveCodexChannel();
      if (activeChannel) {
        // 记录请求元数据
        const requestId = `codex-${Date.now()}-${Math.random()}`;
        requestMetadata.set(req, {
          id: requestId,
          channel: activeChannel.name,
          channelId: activeChannel.id,
          startTime: Date.now()
        });

        // 设置真实的 API Key (OpenAI 格式使用 Bearer token)
        proxyReq.removeHeader('authorization');
        proxyReq.setHeader('authorization', `Bearer ${activeChannel.apiKey}`);

        // 添加 OpenAI Responses API 必需的 header
        proxyReq.setHeader('openai-beta', 'responses=experimental');

        // 确保 content-type 正确
        if (!proxyReq.getHeader('content-type')) {
          proxyReq.setHeader('content-type', 'application/json');
        }
      }
    });

    // 代理所有请求
    proxyApp.use((req, res) => {
      const activeChannel = getActiveCodexChannel();

      if (!activeChannel) {
        res.status(500).json({
          error: {
            message: 'No active Codex channel configured',
            type: 'channel_error'
          }
        });
        return;
      }

      // 设置代理目标 (去掉 /v1 后缀，因为请求路径已经包含)
      let target = activeChannel.baseUrl;
      // 确保 target 不以 / 结尾
      if (target.endsWith('/')) {
        target = target.slice(0, -1);
      }
      // 如果 target 以 /v1 结尾，且请求路径以 /v1 开头，去掉 target 的 /v1
      if (target.endsWith('/v1') && req.url.startsWith('/v1')) {
        target = target.slice(0, -3);
      }

      proxy.web(req, res, {
        target,
        changeOrigin: true
      }, (err) => {
        if (err) {
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
    });

    // 监听代理响应 (OpenAI 格式)
    proxy.on('proxyRes', (proxyRes, req, res) => {
      const metadata = requestMetadata.get(req);
      if (!metadata) {
        return;
      }

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

          // 广播日志
          broadcastLog({
            id: metadata.id,
            time: time,
            channel: metadata.channel,
            model: tokenData.model,
            inputTokens: tokenData.inputTokens,
            outputTokens: tokenData.outputTokens,
            cachedTokens: tokenData.cachedTokens,
            reasoningTokens: tokenData.reasoningTokens,
            totalTokens: tokenData.totalTokens,
            source: 'codex'
          });

          // 记录统计数据
          const tokens = {
            input: tokenData.inputTokens,
            output: tokenData.outputTokens,
            total: tokenData.inputTokens + tokenData.outputTokens
          };
          const cost = calculateCost(tokenData.model, tokens);
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
        }

        requestMetadata.delete(req);
      });
    });

    // 处理代理错误
    proxy.on('error', (err, req, res) => {
      console.error('Codex proxy error:', err);
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
async function stopCodexProxyServer() {
  if (!proxyServer) {
    return { success: true, message: 'Codex proxy server not running' };
  }

  requestMetadata.clear();

  return new Promise((resolve) => {
    proxyServer.close(() => {
      console.log('Codex proxy server stopped');
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
  return {
    running: !!proxyServer,
    port: currentPort,
    defaultPort: config.ports?.codexProxy || 10089
  };
}

module.exports = {
  startCodexProxyServer,
  stopCodexProxyServer,
  getCodexProxyStatus
};
