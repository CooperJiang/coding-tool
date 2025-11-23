const fs = require('fs');
const path = require('path');
const { getCodexDir } = require('./codex-config');
const { parseSession, parseSessionMeta, extractSessionMeta, readJSONL } = require('./codex-parser');

/**
 * 获取会话目录
 */
function getSessionsDir() {
  return path.join(getCodexDir(), 'sessions');
}

/**
 * 递归扫描目录查找所有会话文件
 * @param {string} dir - 目录路径
 * @returns {Array} 会话文件路径数组
 */
function scanDirectoryRecursive(dir) {
  const results = [];

  if (!fs.existsSync(dir)) {
    return results;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // 递归扫描子目录
      results.push(...scanDirectoryRecursive(fullPath));
    } else if (entry.isFile() && entry.name.match(/^rollout-.*\.jsonl$/)) {
      // 匹配会话文件
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * 扫描所有会话文件
 * @returns {Array} 会话文件路径数组
 */
function scanSessionFiles() {
  const sessionsDir = getSessionsDir();
  const files = scanDirectoryRecursive(sessionsDir);

  return files.map(filePath => {
    const filename = path.basename(filePath);
    // Codex 文件名格式：rollout-YYYY-MM-DDTHH-MM-SS-uuid.jsonl
    // 时间戳：19个字符（2025-11-22T12-34-56）
    const match = filename.match(/rollout-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})-([\w-]+)\.jsonl/);

    if (!match) return null;

    return {
      filePath,
      timestamp: match[1],
      sessionId: match[2],
      date: match[1].split('T')[0]
    };
  }).filter(Boolean);
}

/**
 * 获取所有会话（轻量级，仅元数据）
 * @returns {Array} 会话对象数组
 */
function getAllSessions() {
  const files = scanSessionFiles();

  return files.map(file => {
    // 使用轻量级解析，只获取元数据
    const session = parseSessionMeta(file.filePath);

    if (!session) return null;

    return {
      ...session,
      sessionId: file.sessionId,
      date: file.date
    };
  }).filter(Boolean);
}

/**
 * 归一化会话数据为 Claude Code 格式
 * @param {Object} codexSession - Codex 会话对象
 * @returns {Object} 归一化后的会话对象
 */
function normalizeSession(codexSession) {
  const { meta, sessionId, preview, filePath } = codexSession;

  // 获取文件大小和修改时间
  let size = 0;
  let mtime = meta.timestamp;
  try {
    if (filePath && fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      size = stats.size;
      mtime = stats.mtime.toISOString();
    }
  } catch (err) {
    // 忽略错误
  }

  return {
    sessionId,
    mtime,
    size,
    filePath: filePath || '',
    gitBranch: meta.git?.branch || null,
    firstMessage: preview || null,
    forkedFrom: null, // Codex 不支持 fork

    // 额外的 Codex 特有字段（前端可能需要）
    source: 'codex'
  };
}

/**
 * 聚合项目列表
 * @returns {Array} 项目对象数组
 */
function getProjects() {
  const sessions = getAllSessions();
  const projectMap = new Map();

  sessions.forEach(session => {
    const meta = session.meta;

    // 优先使用 Git 仓库名，否则使用 cwd 的最后一级目录
    let projectName;
    let projectPath = meta.cwd;

    if (meta.git?.repositoryUrl) {
      // 从 Git URL 提取项目名
      const repoUrl = meta.git.repositoryUrl;
      projectName = repoUrl.split('/').pop().replace('.git', '');
    } else {
      // 使用目录名
      projectName = path.basename(meta.cwd);
    }

    if (!projectMap.has(projectName)) {
      projectMap.set(projectName, {
        name: projectName,
        displayName: projectName,
        fullPath: projectPath,
        path: projectPath,
        gitRepo: meta.git?.repositoryUrl,
        branch: meta.git?.branch,
        sessions: [],
        sessionCount: 0,
        lastUsed: null,
        source: 'codex'
      });
    }

    const project = projectMap.get(projectName);
    project.sessions.push(session);
    project.sessionCount++;

    // 更新最后活动时间
    const sessionTime = new Date(session.meta.timestamp).getTime();
    if (!project.lastUsed || sessionTime > project.lastUsed) {
      project.lastUsed = sessionTime;
    }
  });

  // 获取保存的排序
  const savedOrder = getProjectOrder();
  const projects = Array.from(projectMap.values());

  // 应用保存的排序
  if (savedOrder.length > 0) {
    const ordered = [];
    const projectsMap = new Map(projects.map(p => [p.name, p]));

    // 按保存的顺序添加项目
    for (const projectName of savedOrder) {
      if (projectsMap.has(projectName)) {
        ordered.push(projectsMap.get(projectName));
        projectsMap.delete(projectName);
      }
    }

    // 添加剩余的新项目（不在保存顺序中的）
    ordered.push(...projectsMap.values());
    return ordered;
  }

  // 默认按最后活动时间排序
  return projects.sort((a, b) => b.lastUsed - a.lastUsed);
}

/**
 * 根据项目名获取会话列表（归一化格式）
 * @param {string} projectName - 项目名称
 * @returns {Array} 归一化的会话数组
 */
function getSessionsByProject(projectName) {
  const sessions = getAllSessions();

  // 获取 fork 关系
  const { getForkRelations } = require('./sessions');
  const forkRelations = getForkRelations();

  // 获取保存的排序
  const savedOrder = getSessionOrder(projectName);

  // 过滤并归一化会话
  const filteredSessions = sessions
    .filter(session => {
      // 根据 Git 仓库名或目录名匹配
      let sessionProjectName;
      if (session.meta.git?.repositoryUrl) {
        sessionProjectName = session.meta.git.repositoryUrl.split('/').pop().replace('.git', '');
      } else {
        sessionProjectName = path.basename(session.meta.cwd);
      }
      return sessionProjectName === projectName;
    })
    .map(session => {
      const normalized = normalizeSession(session);
      // 添加 fork 关系
      normalized.forkedFrom = forkRelations[normalized.sessionId] || null;
      return normalized;
    });

  // 应用保存的排序
  let orderedSessions = filteredSessions;
  if (savedOrder.length > 0) {
    const ordered = [];
    const sessionMap = new Map(filteredSessions.map(s => [s.sessionId, s]));

    // 提取新会话（不在保存顺序中的），按时间倒序排列
    const newSessions = [];
    for (const sessionId of savedOrder) {
      if (sessionMap.has(sessionId)) {
        sessionMap.delete(sessionId);
      }
    }
    newSessions.push(...sessionMap.values());
    newSessions.sort((a, b) => {
      return new Date(b.mtime).getTime() - new Date(a.mtime).getTime();
    });

    // 新会话在前，旧会话在后（按保存顺序）
    ordered.push(...newSessions);

    for (const sessionId of savedOrder) {
      const session = filteredSessions.find(s => s.sessionId === sessionId);
      if (session) {
        ordered.push(session);
      }
    }

    orderedSessions = ordered;
  } else {
    // 默认按时间倒序
    orderedSessions.sort((a, b) => {
      return new Date(b.mtime).getTime() - new Date(a.mtime).getTime();
    });
  }

  return orderedSessions;
}

/**
 * 根据 sessionId 获取会话（归一化格式）
 * @param {string} sessionId - 会话 ID
 * @returns {Object|null} 归一化的会话对象
 */
function getSessionById(sessionId) {
  const files = scanSessionFiles();
  const file = files.find(f => f.sessionId === sessionId);

  if (!file) {
    return null;
  }

  const session = parseSession(file.filePath);
  if (!session) {
    return null;
  }

  return {
    ...normalizeSession(session),
    messages: session.messages, // 包含完整消息
    filePath: file.filePath
  };
}

/**
 * 搜索会话（全局）
 * @param {string} keyword - 搜索关键词
 * @returns {Array} 搜索结果
 */
function searchSessions(keyword) {
  const sessions = getAllSessions();
  const results = [];

  sessions.forEach(session => {
    session.messages.forEach((message, index) => {
      if (message.role !== 'user' && message.role !== 'assistant') {
        return;
      }

      const content = message.content.toLowerCase();
      const keywordLower = keyword.toLowerCase();

      if (content.includes(keywordLower)) {
        // 提取上下文
        const startIndex = Math.max(0, content.indexOf(keywordLower) - 50);
        const endIndex = Math.min(content.length, content.indexOf(keywordLower) + keyword.length + 50);
        const context = content.substring(startIndex, endIndex);

        // 确定项目名
        let projectName;
        if (session.meta.git?.repositoryUrl) {
          projectName = session.meta.git.repositoryUrl.split('/').pop().replace('.git', '');
        } else {
          projectName = path.basename(session.meta.cwd);
        }

        results.push({
          sessionId: session.sessionId,
          projectName,
          messageIndex: index,
          role: message.role,
          context: (startIndex > 0 ? '...' : '') + context + (endIndex < content.length ? '...' : ''),
          timestamp: message.timestamp,
          source: 'codex'
        });
      }
    });
  });

  return results;
}

/**
 * 删除项目（删除项目下所有会话）
 * @param {string} projectName - 项目名称
 * @returns {Object} 删除结果 { success: true, deletedCount: number }
 */
function deleteProject(projectName) {
  const sessions = getAllSessions();

  // 找到该项目下的所有会话
  const projectSessions = sessions.filter(session => {
    let sessionProjectName;
    if (session.meta.git?.repositoryUrl) {
      sessionProjectName = session.meta.git.repositoryUrl.split('/').pop().replace('.git', '');
    } else {
      sessionProjectName = path.basename(session.meta.cwd);
    }
    return sessionProjectName === projectName;
  });

  if (projectSessions.length === 0) {
    throw new Error('Project not found or has no sessions');
  }

  // 删除所有会话文件
  let deletedCount = 0;
  const { getForkRelations, saveForkRelations } = require('./sessions');
  const { deleteAlias } = require('./alias');
  const forkRelations = getForkRelations();
  let forkRelationsModified = false;

  projectSessions.forEach(session => {
    try {
      // 删除会话文件
      if (fs.existsSync(session.filePath)) {
        fs.unlinkSync(session.filePath);
        deletedCount++;
      }

      // 清理 fork 关系
      if (forkRelations[session.sessionId]) {
        delete forkRelations[session.sessionId];
        forkRelationsModified = true;
      }

      // 清理指向该会话的 fork 关系
      Object.keys(forkRelations).forEach(key => {
        if (forkRelations[key] === session.sessionId) {
          delete forkRelations[key];
          forkRelationsModified = true;
        }
      });

      // 清理别名
      try {
        deleteAlias(session.sessionId);
      } catch (err) {
        // 忽略别名不存在的错误
      }
    } catch (err) {
      console.error(`[Codex] Failed to delete session ${session.sessionId}:`, err.message);
    }
  });

  // 保存清理后的 fork 关系
  if (forkRelationsModified) {
    saveForkRelations(forkRelations);
  }

  // 清理项目排序配置
  try {
    const currentOrder = getProjectOrder();
    const newOrder = currentOrder.filter(name => name !== projectName);
    if (newOrder.length !== currentOrder.length) {
      saveProjectOrder(newOrder);
    }
  } catch (err) {
    console.error('[Codex] Failed to clean project order:', err.message);
  }

  // 清理会话排序配置
  try {
    saveSessionOrder(projectName, []);
  } catch (err) {
    console.error('[Codex] Failed to clean session order:', err.message);
  }

  return { success: true, deletedCount };
}

/**
 * 获取最近的会话（跨项目）
 * @param {number} limit - 返回数量限制，默认 5
 * @returns {Array} 最近会话数组
 */
function getRecentSessions(limit = 5) {
  const sessions = getAllSessions();

  // 获取 fork 关系和别名
  const { getForkRelations } = require('./sessions');
  const { loadAliases } = require('./alias');
  const forkRelations = getForkRelations();
  const aliases = loadAliases();

  // 归一化所有会话
  const allNormalizedSessions = sessions.map(session => {
    const normalized = normalizeSession(session);

    // 添加项目信息
    let projectName;
    let projectPath = session.meta.cwd;

    if (session.meta.git?.repositoryUrl) {
      projectName = session.meta.git.repositoryUrl.split('/').pop().replace('.git', '');
    } else {
      projectName = path.basename(session.meta.cwd);
    }

    return {
      ...normalized,
      forkedFrom: forkRelations[normalized.sessionId] || null,
      alias: aliases[normalized.sessionId] || null,
      projectName: projectName,
      projectDisplayName: projectName,
      projectFullPath: projectPath
    };
  });

  // 按 mtime 倒序排序，取前 N 个
  return allNormalizedSessions
    .sort((a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime())
    .slice(0, limit);
}

/**
 * 删除一个会话
 * @param {string} sessionId - 会话 ID
 * @returns {Object} 删除结果 { success: true }
 */
function deleteSession(sessionId) {
  const files = scanSessionFiles();
  const targetFile = files.find(f => f.sessionId === sessionId);

  if (!targetFile) {
    throw new Error('Session not found');
  }

  // 删除会话文件
  fs.unlinkSync(targetFile.filePath);

  // 清理 fork 关系
  const { getForkRelations, saveForkRelations } = require('./sessions');
  const forkRelations = getForkRelations();

  // 删除作为源的 fork 关系
  delete forkRelations[sessionId];

  // 删除所有指向该会话的 fork 关系
  Object.keys(forkRelations).forEach(key => {
    if (forkRelations[key] === sessionId) {
      delete forkRelations[key];
    }
  });

  saveForkRelations(forkRelations);

  // 清理别名
  const { deleteAlias } = require('./alias');
  try {
    deleteAlias(sessionId);
  } catch (err) {
    // 忽略别名不存在的错误
  }

  return { success: true };
}

/**
 * Fork 一个会话（创建副本）
 * @param {string} sessionId - 原会话 ID
 * @returns {Object} Fork 结果 { newSessionId, forkedFrom }
 */
function forkSession(sessionId) {
  const files = scanSessionFiles();
  const sourceFile = files.find(f => f.sessionId === sessionId);

  if (!sourceFile) {
    throw new Error('Session not found');
  }

  // 读取原会话文件内容
  const content = fs.readFileSync(sourceFile.filePath, 'utf8');

  // 生成新的 session ID (使用 crypto.randomUUID 生成 v4 UUID)
  const crypto = require('crypto');
  const newSessionId = crypto.randomUUID();

  // 生成新的时间戳（Codex 格式：YYYY-MM-DDTHH-MM-SS）
  const now = new Date();
  const timestamp = now.toISOString()
    .replace(/\.\d{3}Z$/, '')  // 移除毫秒和 Z
    .replace(/:/g, '-');        // 将冒号替换为破折号

  // 生成新文件路径（按当前日期组织）
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  const targetDir = path.join(getSessionsDir(), String(year), month, day);

  // 确保目标目录存在
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const newFileName = `rollout-${timestamp}-${newSessionId}.jsonl`;
  const newFilePath = path.join(targetDir, newFileName);

  // 写入新文件
  fs.writeFileSync(newFilePath, content, 'utf8');

  // 保存 fork 关系（复用 Claude Code 的 fork 关系存储）
  const { getForkRelations, saveForkRelations } = require('./sessions');
  const forkRelations = getForkRelations();
  forkRelations[newSessionId] = sessionId;
  saveForkRelations(forkRelations);

  return {
    newSessionId,
    forkedFrom: sessionId,
    newFilePath
  };
}

/**
 * 获取会话排序（按项目）
 * @param {string} projectName - 项目名称
 * @returns {Array} 会话 ID 数组
 */
function getSessionOrder(projectName) {
  const { getSessionOrder: getClaudeSessionOrder } = require('./sessions');
  // 复用 Claude Code 的排序存储，使用 "codex-" 前缀区分
  return getClaudeSessionOrder(`codex-${projectName}`);
}

/**
 * 保存会话排序
 * @param {string} projectName - 项目名称
 * @param {Array} order - 会话 ID 数组
 */
function saveSessionOrder(projectName, order) {
  const { saveSessionOrder: saveClaudeSessionOrder } = require('./sessions');
  // 复用 Claude Code 的排序存储，使用 "codex-" 前缀区分
  saveClaudeSessionOrder(`codex-${projectName}`, order);
}

/**
 * 获取项目排序
 * @returns {Array} 项目名称数组
 */
function getProjectOrder() {
  const { getProjectOrder: getClaudeProjectOrder } = require('./sessions');
  const { getCodexDir } = require('./codex-config');
  // 复用 Claude Code 的排序存储，使用特殊的配置对象标识 Codex
  return getClaudeProjectOrder({ projectsDir: getCodexDir() });
}

/**
 * 保存项目排序
 * @param {Array} order - 项目名称数组
 */
function saveProjectOrder(order) {
  const { saveProjectOrder: saveClaudeProjectOrder } = require('./sessions');
  const { getCodexDir } = require('./codex-config');
  // 复用 Claude Code 的排序存储
  saveClaudeProjectOrder({ projectsDir: getCodexDir() }, order);
}

module.exports = {
  getSessionsDir,
  scanSessionFiles,
  getAllSessions,
  getProjects,
  getSessionsByProject,
  getSessionById,
  searchSessions,
  normalizeSession,
  forkSession,
  deleteSession,
  deleteProject,
  getRecentSessions,
  getSessionOrder,
  saveSessionOrder,
  getProjectOrder,
  saveProjectOrder
};
