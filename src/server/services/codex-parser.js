const fs = require('fs');

/**
 * 读取 JSONL 文件
 * @param {string} filePath - JSONL 文件路径
 * @returns {Array} JSON 对象数组
 */
function readJSONL(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.trim().split('\n').filter(line => line);

    return lines.map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (err) {
        console.error(`[Codex] Failed to parse line ${index + 1} in ${filePath}:`, err.message);
        return null;
      }
    }).filter(Boolean);
  } catch (err) {
    console.error('[Codex] Failed to read JSONL file:', filePath, err);
    return [];
  }
}

/**
 * 提取会话元数据
 * @param {Array} lines - JSONL 行数组
 * @returns {Object|null} 会话元数据
 */
function extractSessionMeta(lines) {
  const metaLine = lines.find(line => line.type === 'session_meta');

  if (!metaLine || !metaLine.payload) {
    return null;
  }

  const payload = metaLine.payload;

  return {
    sessionId: payload.id,
    timestamp: payload.timestamp,
    cwd: payload.cwd,
    cliVersion: payload.cli_version,
    provider: payload.model_provider,
    git: payload.git ? {
      branch: payload.git.branch,
      commitHash: payload.git.commit_hash,
      repositoryUrl: payload.git.repository_url
    } : null
  };
}

/**
 * 提取对话消息
 * @param {Array} lines - JSONL 行数组
 * @returns {Array} 消息数组
 */
function extractMessages(lines) {
  const messages = [];

  lines.forEach(line => {
    if (line.type !== 'response_item') return;

    const payload = line.payload;

    // 用户/助手消息
    if (payload.type === 'message') {
      const contentParts = payload.content || [];
      const text = contentParts
        .map(c => c.text || c.input_text || '')
        .join('\n')
        .trim();

      if (text) {
        messages.push({
          role: payload.role,
          content: text,
          timestamp: line.timestamp
        });
      }
    }

    // 工具调用
    if (payload.type === 'function_call') {
      // 解析 arguments 字段（它是一个序列化的 JSON 字符串）
      let parsedArguments = payload.arguments;
      try {
        parsedArguments = JSON.parse(payload.arguments);
      } catch (err) {
        // 如果解析失败，保持原样
        console.warn('[Codex Parser] Failed to parse function_call arguments:', err.message);
      }

      messages.push({
        role: 'tool_call',
        name: payload.name,
        arguments: parsedArguments,
        callId: payload.call_id,
        timestamp: line.timestamp
      });
    }

    // 工具输出
    if (payload.type === 'function_call_output') {
      // 解析 output 字段（它是一个序列化的 JSON 字符串）
      let parsedOutput = payload.output;
      try {
        parsedOutput = JSON.parse(payload.output);
      } catch (err) {
        // 如果解析失败，保持原样
        console.warn('[Codex Parser] Failed to parse function_call_output:', err.message);
      }

      messages.push({
        role: 'tool_output',
        callId: payload.call_id,
        output: parsedOutput,
        timestamp: line.timestamp
      });
    }

    // 推理内容
    if (payload.type === 'reasoning') {
      const summary = payload.summary || [];
      const text = summary
        .map(s => s.text || '')
        .join('\n')
        .trim();

      if (text) {
        messages.push({
          role: 'reasoning',
          content: text,
          timestamp: line.timestamp
        });
      }
    }
  });

  return messages;
}

/**
 * 提取 Token 统计
 * @param {Array} lines - JSONL 行数组
 * @returns {Object|null} Token 统计
 */
function extractTokenUsage(lines) {
  // 找到最后一个有效的 token_count 事件（info 和 total_token_usage 都存在）
  const tokenEvents = lines.filter(line =>
    line.type === 'event_msg' &&
    line.payload?.type === 'token_count' &&
    line.payload.info &&
    line.payload.info.total_token_usage
  );

  if (tokenEvents.length === 0) {
    return null;
  }

  const lastEvent = tokenEvents[tokenEvents.length - 1];
  const usage = lastEvent.payload.info.total_token_usage;

  return {
    input: usage.input_tokens || 0,
    output: usage.output_tokens || 0,
    cacheRead: usage.cached_input_tokens || 0,
    cacheCreation: usage.cache_creation_input_tokens || 0,
    reasoning: usage.reasoning_output_tokens || 0,
    total: usage.total_tokens || 0
  };
}

/**
 * 轻量级解析会话元数据（不解析完整消息，用于列表展示）
 * @param {string} filePath - JSONL 文件路径
 * @returns {Object} 会话元数据对象
 */
function parseSessionMeta(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter(line => line.trim());

    if (lines.length === 0) {
      return null;
    }

    let meta = null;
    let tokens = null;
    let messageCount = 0;
    let firstUserMessage = null;

    // 只读取前面的行，获取元数据和第一条消息
    for (let i = 0; i < Math.min(lines.length, 50); i++) {
      try {
        const json = JSON.parse(lines[i]);

        // 提取 session_meta
        if (!meta && json.type === 'session_meta' && json.payload) {
          const payload = json.payload;
          meta = {
            sessionId: payload.id,
            timestamp: payload.timestamp,
            cwd: payload.cwd,
            cliVersion: payload.cli_version,
            provider: payload.model_provider,
            git: payload.git ? {
              branch: payload.git.branch,
              commitHash: payload.git.commit_hash,
              repositoryUrl: payload.git.repository_url
            } : null
          };
        }

        // 获取第一条用户消息作为预览
        if (!firstUserMessage && json.type === 'response_item' && json.payload?.type === 'message' && json.payload?.role === 'user') {
          const contentParts = json.payload.content || [];
          const text = contentParts
            .map(c => c.text || c.input_text || '')
            .join('\n')
            .trim();
          // 跳过环境上下文、Warmup 等非真实用户消息
          if (text &&
              text !== 'Warmup' &&
              !text.startsWith('<environment_context>')) {
            firstUserMessage = text.substring(0, 100);
          }
        }
      } catch (err) {
        // 跳过无效行
      }
    }

    // 快速统计消息数量（只统计 response_item）
    for (const line of lines) {
      if (line.includes('"type":"response_item"')) {
        messageCount++;
      }
    }

    // 从最后几行提取 token 统计
    for (let i = lines.length - 1; i >= Math.max(0, lines.length - 20); i--) {
      try {
        const json = JSON.parse(lines[i]);
        if (json.type === 'event_msg' &&
            json.payload?.type === 'token_count' &&
            json.payload.info &&
            json.payload.info.total_token_usage) {
          const usage = json.payload.info.total_token_usage;
          tokens = {
            input: usage.input_tokens || 0,
            output: usage.output_tokens || 0,
            cacheRead: usage.cached_input_tokens || 0,
            cacheCreation: usage.cache_creation_input_tokens || 0,
            reasoning: usage.reasoning_output_tokens || 0,
            total: usage.total_tokens || 0
          };
          break;
        }
      } catch (err) {
        // 跳过无效行
      }
    }

    if (!meta) {
      return null;
    }

    return {
      filePath,
      meta,
      tokens,
      messageCount,
      preview: firstUserMessage || ''
    };
  } catch (err) {
    console.error(`[Codex Parser] Failed to parse session meta for ${filePath}:`, err.message);
    return null;
  }
}

/**
 * 解析完整会话（包含所有消息，用于查看详情）
 * @param {string} filePath - JSONL 文件路径
 * @returns {Object} 会话对象
 */
function parseSession(filePath) {
  const lines = readJSONL(filePath);

  if (lines.length === 0) {
    return null;
  }

  const meta = extractSessionMeta(lines);
  const messages = extractMessages(lines);
  const tokens = extractTokenUsage(lines);

  if (!meta) {
    return null;
  }

  return {
    filePath,
    meta,
    messages,
    tokens,
    messageCount: messages.filter(m => m.role === 'user' || m.role === 'assistant').length
  };
}

module.exports = {
  readJSONL,
  extractSessionMeta,
  extractMessages,
  extractTokenUsage,
  parseSession,
  parseSessionMeta
};
