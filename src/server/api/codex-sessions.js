const express = require('express');
const router = express.Router();
const {
  getSessionsByProject,
  getSessionById,
  searchSessions,
  forkSession,
  deleteSession,
  getRecentSessions,
  saveSessionOrder
} = require('../services/codex-sessions');
const { isCodexInstalled } = require('../services/codex-config');
const { loadAliases } = require('../services/alias');

module.exports = (config) => {
  /**
   * GET /api/codex/sessions/:projectName
   * 获取项目的所有会话
   */
  router.get('/:projectName', (req, res) => {
    try {
      if (!isCodexInstalled()) {
        return res.status(404).json({ error: 'Codex CLI not installed' });
      }

      const { projectName } = req.params;
      const sessions = getSessionsByProject(projectName);

      // 计算总大小
      const totalSize = sessions.reduce((sum, session) => {
        return sum + (session.size || 0);
      }, 0);

      // 获取别名
      const aliases = loadAliases();

      res.json({
        sessions,
        totalSize,
        aliases, // 返回所有别名
        projectInfo: {
          name: projectName,
          fullPath: projectName,
          displayName: projectName
        }
      });
    } catch (err) {
      console.error('[Codex API] Failed to get sessions:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/codex/sessions/:projectName/:sessionId/messages
   * 获取会话的消息列表
   */
  router.get('/:projectName/:sessionId/messages', (req, res) => {
    try {
      if (!isCodexInstalled()) {
        return res.status(404).json({ error: 'Codex CLI not installed' });
      }

      const { sessionId } = req.params;
      const { page = 1, limit = 20, order = 'desc' } = req.query;

      const session = getSessionById(sessionId);

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      // 转换消息格式为前端期望的格式
      const convertedMessages = [];

      for (const msg of session.messages) {
        // 用户消息
        if (msg.role === 'user') {
          convertedMessages.push({
            type: 'user',
            content: msg.content || '[空消息]',
            timestamp: msg.timestamp,
            model: null
          });
        }
        // 助手消息（普通回复）
        else if (msg.role === 'assistant') {
          convertedMessages.push({
            type: 'assistant',
            content: msg.content || '[空消息]',
            timestamp: msg.timestamp,
            model: session.provider || 'codex'
          });
        }
        // 推理内容
        else if (msg.role === 'reasoning') {
          convertedMessages.push({
            type: 'assistant',
            content: `**[推理]**\n${msg.content || '[空推理]'}`,
            timestamp: msg.timestamp,
            model: session.provider || 'codex'
          });
        }
        // 工具调用
        else if (msg.role === 'tool_call') {
          const argsStr = typeof msg.arguments === 'object'
            ? JSON.stringify(msg.arguments, null, 2)
            : msg.arguments;
          convertedMessages.push({
            type: 'assistant',
            content: `**[调用工具: ${msg.name}]**\n\`\`\`json\n${argsStr}\n\`\`\``,
            timestamp: msg.timestamp,
            model: session.provider || 'codex'
          });
        }
        // 工具输出
        else if (msg.role === 'tool_output') {
          let outputStr = '';
          if (typeof msg.output === 'object' && msg.output.output) {
            // 标准格式：{ output: '...', metadata: {...} }
            outputStr = msg.output.output;
            if (msg.output.metadata) {
              const meta = msg.output.metadata;
              outputStr += `\n\n**[元数据]**\n- 退出码: ${meta.exit_code || 0}\n- 耗时: ${meta.duration_seconds || 0}s`;
            }
          } else if (typeof msg.output === 'string') {
            outputStr = msg.output;
          } else {
            outputStr = JSON.stringify(msg.output, null, 2);
          }

          convertedMessages.push({
            type: 'user',
            content: `**[工具结果]**\n\`\`\`\n${outputStr}\n\`\`\``,
            timestamp: msg.timestamp,
            model: null
          });
        }
      }

      // 分页处理
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);

      // 排序
      let messages = convertedMessages;
      if (order === 'desc') {
        messages = [...messages].reverse();
      }

      // 分页
      const totalMessages = messages.length;
      const start = (pageNum - 1) * limitNum;
      const end = start + limitNum;
      const paginatedMessages = messages.slice(start, end);

      res.json({
        messages: paginatedMessages,
        metadata: {
          gitBranch: session.gitBranch,
          gitRepository: session.gitRepository,
          cwd: session.cwd,
          provider: session.provider
        },
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: totalMessages,
          hasMore: end < totalMessages
        }
      });
    } catch (err) {
      console.error('[Codex API] Failed to get session messages:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/codex/sessions/search/global?keyword=xxx
   * 全局搜索
   */
  router.get('/search/global', (req, res) => {
    try {
      if (!isCodexInstalled()) {
        return res.status(404).json({ error: 'Codex CLI not installed' });
      }

      const { keyword } = req.query;

      if (!keyword) {
        return res.status(400).json({ error: 'Keyword is required' });
      }

      const results = searchSessions(keyword);

      res.json({
        keyword,
        results,
        source: 'codex'
      });
    } catch (err) {
      console.error('[Codex API] Failed to search sessions:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/codex/sessions/recent/list?limit=10
   * 获取最近会话
   */
  router.get('/recent/list', (req, res) => {
    try {
      if (!isCodexInstalled()) {
        return res.status(404).json({ error: 'Codex CLI not installed' });
      }

      const limit = parseInt(req.query.limit) || 5;
      const sessions = getRecentSessions(limit);

      res.json({
        sessions,
        source: 'codex'
      });
    } catch (err) {
      console.error('[Codex API] Failed to get recent sessions:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * DELETE /api/codex/sessions/:projectName/:sessionId
   * 删除会话
   */
  router.delete('/:projectName/:sessionId', (req, res) => {
    try {
      if (!isCodexInstalled()) {
        return res.status(404).json({ error: 'Codex CLI not installed' });
      }

      const { sessionId } = req.params;
      const result = deleteSession(sessionId);

      res.json(result);
    } catch (err) {
      console.error('[Codex API] Failed to delete session:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /api/codex/sessions/:projectName/:sessionId/fork
   * Fork 一个会话
   */
  router.post('/:projectName/:sessionId/fork', (req, res) => {
    try {
      if (!isCodexInstalled()) {
        return res.status(404).json({ error: 'Codex CLI not installed' });
      }

      const { sessionId } = req.params;
      const result = forkSession(sessionId);

      res.json(result);
    } catch (err) {
      console.error('[Codex API] Failed to fork session:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /api/codex/sessions/:projectName/order
   * 保存会话排序
   */
  router.post('/:projectName/order', (req, res) => {
    try {
      if (!isCodexInstalled()) {
        return res.status(404).json({ error: 'Codex CLI not installed' });
      }

      const { projectName } = req.params;
      const { order } = req.body;

      if (!Array.isArray(order)) {
        return res.status(400).json({ error: 'order must be an array' });
      }

      saveSessionOrder(projectName, order);

      res.json({ success: true });
    } catch (err) {
      console.error('[Codex API] Failed to save session order:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /api/codex/sessions/:projectName/:sessionId/launch
   * 启动会话（打开终端）
   */
  router.post('/:projectName/:sessionId/launch', (req, res) => {
    try {
      if (!isCodexInstalled()) {
        return res.status(404).json({ error: 'Codex CLI not installed' });
      }

      const { sessionId } = req.params;
      const { exec } = require('child_process');
      const fs = require('fs');
      const path = require('path');

      // 获取会话详情
      const session = getSessionById(sessionId);

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      // 从会话文件提取 cwd
      let cwd = null;
      try {
        if (session.filePath && fs.existsSync(session.filePath)) {
          const content = fs.readFileSync(session.filePath, 'utf8');
          const firstLine = content.split('\n')[0];
          if (firstLine) {
            const json = JSON.parse(firstLine);
            if (json.type === 'session_meta' && json.payload?.cwd) {
              cwd = json.payload.cwd;
            }
          }
        }
      } catch (e) {
        console.warn('Unable to extract cwd from Codex session:', e.message);
      }

      if (!cwd) {
        return res.status(400).json({
          error: 'Unable to determine working directory from session'
        });
      }

      // 获取别名
      const { loadAliases } = require('../services/alias');
      const aliases = loadAliases();
      const alias = aliases[sessionId];

      // 广播行为日志
      const { broadcastLog } = require('../websocket-server');
      broadcastLog({
        type: 'action',
        action: 'launch_codex_session',
        message: `启动 Codex 会话 ${alias || sessionId.substring(0, 8)}`,
        sessionId: sessionId,
        alias: alias || null,
        timestamp: Date.now()
      });

      // 使用配置的终端工具启动
      const { getTerminalLaunchCommand } = require('../services/terminal-config');

      try {
        // Windows 路径需要转换为反斜杠格式
        const normalizedCwd = process.platform === 'win32' ? cwd.replace(/\//g, '\\') : cwd;

        // 获取启动命令（使用 sessionId 作为占位符）
        const { command, terminalId, terminalName } = getTerminalLaunchCommand(normalizedCwd, sessionId);

        // 将命令中的 'claude -r' 替换为 'codex resume'
        const codexCommand = command
          .replace(/claude\s+-r\s+/g, 'codex resume ')
          .replace(/claude\s+--resume\s+/g, 'codex resume ');

        console.log(`[Codex] Launching terminal: ${terminalName} (${terminalId})`);
        console.log(`[Codex] Command: ${codexCommand}`);

        // 异步执行命令，不等待结果
        const shellOption = process.platform === 'win32' ? { shell: 'cmd.exe' } : { shell: true };
        exec(codexCommand, shellOption, (error, stdout, stderr) => {
          if (error) {
            console.error(`[Codex] Failed to launch terminal ${terminalName}:`, error.message);
          }
        });

        // 立即返回成功响应
        res.json({
          success: true,
          cwd,
          sessionFile: session.filePath,
          terminal: terminalName,
          terminalId,
          sessionId
        });
      } catch (terminalError) {
        console.error('[Codex] Failed to get terminal command:', terminalError);
        return res.status(500).json({
          error: '无法启动终端：' + terminalError.message
        });
      }
    } catch (err) {
      console.error('[Codex API] Failed to launch session:', err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
