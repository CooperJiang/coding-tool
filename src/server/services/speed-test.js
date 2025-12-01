/**
 * 速度测试服务
 * 用于测试渠道 API 的响应延迟
 * 参考 cc-switch 的实现方式
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

// 测试结果缓存
const testResultsCache = new Map();

// 超时配置（毫秒）
const DEFAULT_TIMEOUT = 8000;
const MIN_TIMEOUT = 2000;
const MAX_TIMEOUT = 30000;

/**
 * 规范化超时时间
 */
function sanitizeTimeout(timeout) {
  const ms = timeout || DEFAULT_TIMEOUT;
  return Math.min(Math.max(ms, MIN_TIMEOUT), MAX_TIMEOUT);
}

/**
 * 测试单个渠道的连接速度
 * @param {Object} channel - 渠道配置
 * @param {number} timeout - 超时时间（毫秒）
 * @returns {Promise<Object>} 测试结果
 */
async function testChannelSpeed(channel, timeout = DEFAULT_TIMEOUT) {
  const sanitizedTimeout = sanitizeTimeout(timeout);

  try {
    if (!channel.baseUrl) {
      return {
        channelId: channel.id,
        channelName: channel.name,
        success: false,
        error: 'URL 不能为空',
        latency: null,
        statusCode: null
      };
    }

    // 规范化 URL（去除末尾斜杠）
    let testUrl;
    try {
      const url = new URL(channel.baseUrl.trim());
      testUrl = url.toString().replace(/\/+$/, '');
    } catch (urlError) {
      return {
        channelId: channel.id,
        channelName: channel.name,
        success: false,
        error: `URL 无效: ${urlError.message}`,
        latency: null,
        statusCode: null
      };
    }

    // 先进行一次热身请求，忽略结果，用于复用连接/绕过首包延迟
    await makeRequest(testUrl, channel.apiKey, sanitizedTimeout).catch(() => {});

    // 第二次请求开始计时
    const startTime = Date.now();
    const result = await makeRequest(testUrl, channel.apiKey, sanitizedTimeout);
    const latency = Date.now() - startTime;

    // 只要收到 HTTP 响应就算成功（网络可达）
    const success = result.statusCode !== null;

    // 缓存结果
    const finalResult = {
      channelId: channel.id,
      channelName: channel.name,
      success,
      statusCode: result.statusCode,
      error: result.error,
      latency: success ? latency : null,
      testedAt: Date.now()
    };

    testResultsCache.set(channel.id, finalResult);

    return finalResult;
  } catch (error) {
    return {
      channelId: channel.id,
      channelName: channel.name,
      success: false,
      error: error.message || '连接失败',
      latency: null,
      statusCode: null
    };
  }
}

/**
 * 发起 HTTP 请求
 */
function makeRequest(url, apiKey, timeout) {
  return new Promise((resolve) => {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const httpModule = isHttps ? https : http;

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      timeout,
      headers: {
        'x-api-key': apiKey || '',
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
        'User-Agent': 'Coding-Tool-SpeedTest/1.0'
      }
    };

    const req = httpModule.request(options, (res) => {
      // 收到响应就读取完毕
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        // 只要收到 HTTP 响应就认为网络可达
        resolve({
          statusCode: res.statusCode,
          error: null
        });
      });
    });

    req.on('error', (error) => {
      let errorMsg;
      if (error.code === 'ECONNREFUSED') {
        errorMsg = '连接被拒绝';
      } else if (error.code === 'ETIMEDOUT') {
        errorMsg = '连接超时';
      } else if (error.code === 'ENOTFOUND') {
        errorMsg = 'DNS 解析失败';
      } else if (error.code === 'ECONNRESET') {
        errorMsg = '连接被重置';
      } else {
        errorMsg = error.message || '连接失败';
      }

      resolve({
        statusCode: null,
        error: errorMsg
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        statusCode: null,
        error: '请求超时'
      });
    });

    req.end();
  });
}

/**
 * 批量测试多个渠道
 * @param {Array} channels - 渠道列表
 * @param {number} timeout - 超时时间
 * @returns {Promise<Array>} 测试结果列表
 */
async function testMultipleChannels(channels, timeout = DEFAULT_TIMEOUT) {
  const results = await Promise.all(
    channels.map(channel => testChannelSpeed(channel, timeout))
  );

  // 按延迟排序（成功的在前，按延迟升序）
  results.sort((a, b) => {
    if (a.success && !b.success) return -1;
    if (!a.success && b.success) return 1;
    if (a.success && b.success) return (a.latency || Infinity) - (b.latency || Infinity);
    return 0;
  });

  return results;
}

/**
 * 获取缓存的测试结果
 * @param {string} channelId - 渠道 ID
 * @returns {Object|null} 缓存的测试结果
 */
function getCachedResult(channelId) {
  const cached = testResultsCache.get(channelId);
  // 5 分钟内的缓存有效
  if (cached && Date.now() - cached.testedAt < 5 * 60 * 1000) {
    return cached;
  }
  return null;
}

/**
 * 清除测试结果缓存
 */
function clearCache() {
  testResultsCache.clear();
}

/**
 * 获取延迟等级
 * @param {number} latency - 延迟毫秒数
 * @returns {string} 等级：excellent/good/fair/poor
 */
function getLatencyLevel(latency) {
  if (!latency) return 'unknown';
  if (latency < 300) return 'excellent';   // < 300ms 优秀
  if (latency < 500) return 'good';        // < 500ms 良好
  if (latency < 800) return 'fair';        // < 800ms 一般
  return 'poor';                           // >= 800ms 较差
}

module.exports = {
  testChannelSpeed,
  testMultipleChannels,
  getCachedResult,
  clearCache,
  getLatencyLevel
};
