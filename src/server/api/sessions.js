const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const os = require('os');
const readline = require('readline');
const { getSessionsForProject, deleteSession, forkSession, saveSessionOrder, parseRealProjectPath, searchSessions, getRecentSessions, searchSessionsAcrossProjects, hasActualMessages } = require('../services/sessions');
const { loadAliases } = require('../services/alias');
const { broadcastLog } = require('../websocket-server');

module.exports = (config) => {
  // GET /api/sessions/search/global - Search sessions across all projects
  router.get('/search/global', (req, res) => {
    try {
      const { keyword, context } = req.query;

      if (!keyword) {
        return res.status(400).json({ error: 'Keyword is required' });
      }

      const contextLength = context ? parseInt(context) : 35;
      const results = searchSessionsAcrossProjects(config, keyword, contextLength);

      res.json({
        keyword,
        totalMatches: results.reduce((sum, r) => sum + r.matchCount, 0),
        sessions: results
      });
    } catch (error) {
      console.error('Error searching sessions globally:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/sessions/recent - Get recent sessions across all projects
  router.get('/recent/list', (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 5;
      const sessions = getRecentSessions(config, limit);
      res.json({ sessions });
    } catch (error) {
      console.error('Error fetching recent sessions:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/sessions/:projectName - Get sessions for a project
  router.get('/:projectName', (req, res) => {
    try {
      const { projectName } = req.params;
      const result = getSessionsForProject(config, projectName);
      const aliases = loadAliases();

      // Parse project path info
      const { fullPath, projectName: displayName } = parseRealProjectPath(projectName);

      res.json({
        sessions: result.sessions,
        totalSize: result.totalSize,
        aliases,
        projectInfo: {
          name: projectName,
          displayName,
          fullPath
        }
      });
    } catch (error) {
      console.error('Error fetching sessions:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /api/sessions/:projectName/:sessionId - Delete a session
  router.delete('/:projectName/:sessionId', (req, res) => {
    try {
      const { projectName, sessionId } = req.params;
      const result = deleteSession(config, projectName, sessionId);
      res.json(result);
    } catch (error) {
      console.error('Error deleting session:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/sessions/:projectName/:sessionId/fork - Fork a session
  router.post('/:projectName/:sessionId/fork', (req, res) => {
    try {
      const { projectName, sessionId } = req.params;
      const result = forkSession(config, projectName, sessionId);
      res.json(result);
    } catch (error) {
      console.error('Error forking session:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/sessions/:projectName/order - Save session order
  router.post('/:projectName/order', (req, res) => {
    try {
      const { projectName } = req.params;
      const { order } = req.body;
      saveSessionOrder(projectName, order);
      res.json({ success: true });
    } catch (error) {
      console.error('Error saving session order:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/sessions/:projectName/search - Search sessions content
  router.get('/:projectName/search', (req, res) => {
    try {
      const { projectName } = req.params;
      const { keyword, context } = req.query;

      if (!keyword) {
        return res.status(400).json({ error: 'Keyword is required' });
      }

      const contextLength = context ? parseInt(context) : 15;
      const results = searchSessions(config, projectName, keyword, contextLength);

      res.json({
        keyword,
        totalMatches: results.reduce((sum, r) => sum + r.matchCount, 0),
        sessions: results
      });
    } catch (error) {
      console.error('Error searching sessions:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/sessions/:projectName/:sessionId/messages - Get session messages with pagination
router.get('/:projectName/:sessionId/messages', async (req, res) => {
  try {
      const { projectName, sessionId } = req.params;
      const { page = 1, limit = 20, order = 'desc' } = req.query;

      console.log(`[Messages API] Request for ${projectName}/${sessionId}, page=${page}, limit=${limit}`);

      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);

      // Parse real project path
      const { fullPath } = parseRealProjectPath(projectName);
      console.log(`[Messages API] Parsed project path: ${fullPath}`);

      // Try to find session file
      let sessionFile = null;
      const possiblePaths = [
        path.join(fullPath, '.claude', 'sessions', sessionId + '.jsonl'),
        path.join(os.homedir(), '.claude', 'projects', projectName, sessionId + '.jsonl')
      ];

      console.log(`[Messages API] Trying paths:`, possiblePaths);

      for (const testPath of possiblePaths) {
        if (fs.existsSync(testPath)) {
          sessionFile = testPath;
          console.log(`[Messages API] Found session file: ${sessionFile}`);
          break;
        }
      }

      if (!sessionFile) {
        console.error(`[Messages API] Session file not found for: ${sessionId}`);
        return res.status(404).json({
          error: `Session file not found: ${sessionId}`,
          triedPaths: possiblePaths
        });
      }

      // Check if session has actual messages (not just file-history-snapshots)
      if (!hasActualMessages(sessionFile)) {
        console.warn(`[Messages API] Session ${sessionId} has no actual messages (only file-history-snapshots)`);
        return res.status(404).json({
          error: `Session has no conversation messages: ${sessionId}`,
          reason: 'This session contains only file history snapshots, not actual conversation data'
        });
      }

      // Read and parse session file
    const allMessages = [];
    const metadata = {};

    const stream = fs.createReadStream(sessionFile, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    try {
      for await (const line of rl) {
        if (!line.trim()) continue;
        try {
          const json = JSON.parse(line);

          if (json.type === 'summary' && json.summary) {
            metadata.summary = json.summary;
          }
          if (json.gitBranch) {
            metadata.gitBranch = json.gitBranch;
          }
          if (json.cwd) {
            metadata.cwd = json.cwd;
          }

          if (json.type === 'user' || json.type === 'assistant') {
            const message = {
              type: json.type,
              content: null,
              timestamp: json.timestamp || null,
              model: json.model || null
            };

            if (json.type === 'user') {
              if (typeof json.message?.content === 'string') {
                message.content = json.message.content;
              } else if (Array.isArray(json.message?.content)) {
                const parts = [];
                for (const item of json.message.content) {
                  if (item.type === 'text' && item.text) {
                    parts.push(item.text);
                  } else if (item.type === 'tool_result') {
                    const resultContent = typeof item.content === 'string'
                      ? item.content
                      : JSON.stringify(item.content, null, 2);
                    parts.push(`**[工具结果]**\n\`\`\`\n${resultContent}\n\`\`\``);
                  } else if (item.type === 'image') {
                    parts.push('[图片]');
                  }
                }
                message.content = parts.join('\n\n') || '[工具交互]';
              }
            } else if (json.type === 'assistant') {
              if (Array.isArray(json.message?.content)) {
                const parts = [];
                for (const item of json.message.content) {
                  if (item.type === 'text' && item.text) {
                    parts.push(item.text);
                  } else if (item.type === 'tool_use') {
                    const inputStr = JSON.stringify(item.input, null, 2);
                    parts.push(`**[调用工具: ${item.name}]**\n\`\`\`json\n${inputStr}\n\`\`\``);
                  } else if (item.type === 'thinking' && item.thinking) {
                    parts.push(`**[思考]**\n${item.thinking}`);
                  }
                }
                message.content = parts.join('\n\n') || '[处理中...]';
              } else if (typeof json.message?.content === 'string') {
                message.content = json.message.content;
              }
            }

            if (message.content && message.content !== 'Warmup') {
              allMessages.push(message);
            }
          }
        } catch (err) {
          // Skip invalid lines
        }
      }
    } finally {
      rl.close();
      stream.destroy();
    }

      // Sort messages (desc = newest first)
      if (order === 'desc') {
        allMessages.reverse();
      }

      console.log(`[Messages API] Parsed ${allMessages.length} total messages`);

      // Pagination
      const total = allMessages.length;
      const startIndex = (pageNum - 1) * limitNum;
      const endIndex = startIndex + limitNum;
      const messages = allMessages.slice(startIndex, endIndex);
      const hasMore = endIndex < total;

      console.log(`[Messages API] Returning ${messages.length} messages (page ${pageNum}, total ${total})`);

      res.json({
        messages,
        metadata,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          hasMore
        }
      });
    } catch (error) {
      console.error('Error fetching session messages:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/sessions/:projectName/:sessionId/launch - Launch terminal with session
  router.post('/:projectName/:sessionId/launch', (req, res) => {
    try {
      const { projectName, sessionId } = req.params;
      const { exec } = require('child_process');
      const path = require('path');
      const fs = require('fs');
      const os = require('os');

      // Parse real project path (important for cross-project sessions)
      const { fullPath } = parseRealProjectPath(projectName);

      const projectSessionsDir = path.join(fullPath, '.claude', 'sessions');
      const projectSessionFile = path.join(projectSessionsDir, sessionId + '.jsonl');

      // Try to find session file in multiple possible locations
      let sessionFile = null;
      const possiblePaths = [
        projectSessionFile,
        // Location 2: User's .claude/projects directory (ClaudeCode default)
        path.join(os.homedir(), '.claude', 'projects', projectName, sessionId + '.jsonl')
      ];

      for (const testPath of possiblePaths) {
        if (fs.existsSync(testPath)) {
          sessionFile = testPath;
          break;
        }
      }

      // 如果会话只存在于全局目录，则复制到项目的 .claude/sessions 目录，避免 claude -r 找不到文件
      if (sessionFile && sessionFile !== projectSessionFile) {
        try {
          if (!fs.existsSync(projectSessionsDir)) {
            fs.mkdirSync(projectSessionsDir, { recursive: true });
          }
          fs.copyFileSync(sessionFile, projectSessionFile);
          sessionFile = projectSessionFile;
        } catch (copyError) {
          console.warn('Failed to sync session file to project directory:', copyError.message);
        }
      }

      if (!sessionFile) {
        console.error(`Session file not found in any location for session: ${sessionId}`);
        console.error('Tried paths:', possiblePaths);
        return res.status(404).json({
          error: `No conversation found with session ID: ${sessionId}`,
          details: `Tried locations: ${possiblePaths.join(', ')}`
        });
      }

      // Extract working directory from session file
      let cwd = fullPath; // Default to project directory
      try {
        const content = fs.readFileSync(sessionFile, 'utf8');
        const firstLine = content.split('\n')[0];
        if (firstLine) {
          const json = JSON.parse(firstLine);
          if (json.cwd) {
            cwd = json.cwd;
          }
        }
      } catch (e) {
        console.warn('Unable to extract cwd from session, using project path:', e.message);
      }

      // Get alias
      const aliases = loadAliases();
      const alias = aliases[sessionId];

      // 广播行为日志
      broadcastLog({
        type: 'action',
        action: 'launch_session',
        message: `启动会话 ${alias || sessionId.substring(0, 8)}`,
        sessionId: sessionId,
        alias: alias || null,
        timestamp: Date.now()
      });

      // 使用配置的终端工具启动
      const { getTerminalLaunchCommand } = require('../services/terminal-config');

      try {
        // Windows 路径需要转换为反斜杠格式
        const normalizedCwd = process.platform === 'win32' ? cwd.replace(/\//g, '\\') : cwd;

        // 获取启动命令
        const { command, terminalId, terminalName } = getTerminalLaunchCommand(normalizedCwd, sessionId);

        console.log(`Launching terminal: ${terminalName} (${terminalId})`);
        console.log(`Command: ${command}`);

        // 异步执行命令，不等待结果
        const shellOption = process.platform === 'win32' ? { shell: 'cmd.exe' } : { shell: true };
        exec(command, shellOption, (error, stdout, stderr) => {
          if (error) {
            console.error(`Failed to launch terminal ${terminalName}:`, error.message);
          }
        });

        // 立即返回成功响应
        res.json({
          success: true,
          cwd,
          sessionFile,
          terminal: terminalName,
          terminalId
        });
      } catch (terminalError) {
        console.error('Failed to get terminal command:', terminalError);
        return res.status(500).json({
          error: '无法启动终端：' + terminalError.message
        });
      }
    } catch (error) {
      console.error('Error launching terminal:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
