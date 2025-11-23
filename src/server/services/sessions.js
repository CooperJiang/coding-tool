const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { getAllSessions, parseSessionInfoFast } = require('../../utils/session');
const { loadAliases } = require('./alias');

// Base directory for cc-tool data
function getCcToolDir() {
  return path.join(os.homedir(), '.claude', 'cc-tool');
}

// Get path for storing project order
function getOrderFilePath() {
  return path.join(getCcToolDir(), 'project-order.json');
}

// Get path for storing fork relations
function getForkRelationsFilePath() {
  return path.join(getCcToolDir(), 'fork-relations.json');
}

// Get path for storing session order
function getSessionOrderFilePath() {
  return path.join(getCcToolDir(), 'session-order.json');
}

// Get saved project order
function getProjectOrder(config) {
  const orderFile = getOrderFilePath();
  try {
    if (fs.existsSync(orderFile)) {
      const data = fs.readFileSync(orderFile, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    // Ignore errors
  }
  return [];
}

// Save project order
function saveProjectOrder(config, order) {
  const orderFile = getOrderFilePath();
  const dir = path.dirname(orderFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(orderFile, JSON.stringify(order, null, 2), 'utf8');
}

// Get fork relations
function getForkRelations() {
  const relationsFile = getForkRelationsFilePath();
  try {
    if (fs.existsSync(relationsFile)) {
      const data = fs.readFileSync(relationsFile, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    // Ignore errors
  }
  return {};
}

// Save fork relations
function saveForkRelations(relations) {
  const relationsFile = getForkRelationsFilePath();
  const dir = path.dirname(relationsFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(relationsFile, JSON.stringify(relations, null, 2), 'utf8');
}

// Get all projects with stats
function getProjects(config) {
  const projectsDir = config.projectsDir;

  if (!fs.existsSync(projectsDir)) {
    return [];
  }

  const entries = fs.readdirSync(projectsDir, { withFileTypes: true });
  return entries
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name);
}

// Parse real project path from encoded name
// macOS/Linux: "-Users-lilithgames-work-project" -> "/Users/lilithgames/work/project"
// Windows: "C--Users-admin-Desktop-project" -> "C:\Users\admin\Desktop\project"
function parseRealProjectPath(encodedName) {
  const isWindows = process.platform === 'win32';

  // Detect Windows drive letter (e.g., "C--Users-admin")
  const windowsDriveMatch = encodedName.match(/^([A-Z])--(.+)$/);

  if (isWindows && windowsDriveMatch) {
    // Windows path with drive letter
    const driveLetter = windowsDriveMatch[1];
    const restPath = windowsDriveMatch[2];

    // Split by '-' to get segments
    const segments = restPath.split('-').filter(s => s);

    // Build path from left to right, checking existence
    let realSegments = [];
    let accumulated = '';
    let currentPath = '';

    for (let i = 0; i < segments.length; i++) {
      if (accumulated) {
        accumulated += '-' + segments[i];
      } else {
        accumulated = segments[i];
      }

      const testPath = driveLetter + ':\\' + realSegments.concat(accumulated).join('\\');

      // Check if this path exists
      if (fs.existsSync(testPath)) {
        realSegments.push(accumulated);
        accumulated = '';
        currentPath = testPath;
      }
    }

    // If there's remaining accumulated segment, add it
    if (accumulated) {
      realSegments.push(accumulated);
      currentPath = driveLetter + ':\\' + realSegments.join('\\');
    }

    return {
      fullPath: currentPath || (driveLetter + ':\\' + restPath.replace(/-/g, '\\')),
      projectName: realSegments[realSegments.length - 1] || encodedName
    };
  } else {
    // Unix-like path (macOS/Linux) or fallback
    const pathStr = encodedName.replace(/^-/, '/').replace(/-/g, '/');
    const segments = pathStr.split('/').filter(s => s);

    // Build path from left to right, checking existence
    let currentPath = '';
    const realSegments = [];
    let accumulated = '';

    for (let i = 0; i < segments.length; i++) {
      if (accumulated) {
        accumulated += '-' + segments[i];
      } else {
        accumulated = segments[i];
      }

      const testPath = '/' + realSegments.concat(accumulated).join('/');

      // Check if this path exists
      if (fs.existsSync(testPath)) {
        realSegments.push(accumulated);
        accumulated = '';
        currentPath = testPath;
      }
    }

    // If there's remaining accumulated segment, add it
    if (accumulated) {
      realSegments.push(accumulated);
      currentPath = '/' + realSegments.join('/');
    }

    return {
      fullPath: currentPath || pathStr,
      projectName: realSegments[realSegments.length - 1] || encodedName
    };
  }
}

// Get projects with detailed stats
function getProjectsWithStats(config) {
  const projectsDir = config.projectsDir;

  if (!fs.existsSync(projectsDir)) {
    return [];
  }

  const entries = fs.readdirSync(projectsDir, { withFileTypes: true });

  return entries
    .filter(entry => entry.isDirectory())
    .map(entry => {
      const projectName = entry.name;
      const projectPath = path.join(projectsDir, projectName);

      // Parse real project path
      const { fullPath, projectName: displayName } = parseRealProjectPath(projectName);

      // Get session files
      let sessionCount = 0;
      let lastUsed = null;

      try {
        const files = fs.readdirSync(projectPath);
        const jsonlFiles = files.filter(f => f.endsWith('.jsonl') && !f.startsWith('agent-'));
        sessionCount = jsonlFiles.length;

        // Find most recent session
        if (jsonlFiles.length > 0) {
          const stats = jsonlFiles.map(f => {
            const filePath = path.join(projectPath, f);
            const stat = fs.statSync(filePath);
            return stat.mtime.getTime();
          });
          lastUsed = Math.max(...stats);
        }
      } catch (err) {
        // Ignore errors
      }

      return {
        name: projectName, // Keep encoded name for API operations
        displayName, // Project name for display
        fullPath, // Real full path for display
        sessionCount,
        lastUsed
      };
    })
    .sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0)); // Sort by last used
}

// Get sessions for a project
function getSessionsForProject(config, projectName) {
  const projectConfig = { ...config, currentProject: projectName };
  const sessions = getAllSessions(projectConfig);
  const forkRelations = getForkRelations();
  const savedOrder = getSessionOrder(projectName);

  // Parse session info and calculate total size
  let totalSize = 0;
  const sessionsWithInfo = sessions.map(session => {
    const info = parseSessionInfoFast(session.filePath);
    totalSize += session.size || 0;
    return {
      sessionId: session.sessionId,
      mtime: session.mtime,
      size: session.size,
      filePath: session.filePath,
      gitBranch: info.gitBranch || null,
      firstMessage: info.firstMessage || null,
      forkedFrom: forkRelations[session.sessionId] || null
    };
  });

  // Apply saved order if exists
  let orderedSessions = sessionsWithInfo;
  if (savedOrder.length > 0) {
    const ordered = [];
    const sessionMap = new Map(sessionsWithInfo.map(s => [s.sessionId, s]));

    // Add sessions in saved order
    for (const sessionId of savedOrder) {
      if (sessionMap.has(sessionId)) {
        ordered.push(sessionMap.get(sessionId));
        sessionMap.delete(sessionId);
      }
    }

    // Add remaining sessions (new ones not in saved order)
    ordered.push(...sessionMap.values());
    orderedSessions = ordered;
  }

  return {
    sessions: orderedSessions,
    totalSize
  };
}

// Delete a session
function deleteSession(config, projectName, sessionId) {
  const projectDir = path.join(config.projectsDir, projectName);
  const sessionFile = path.join(projectDir, sessionId + '.jsonl');

  if (!fs.existsSync(sessionFile)) {
    throw new Error('Session not found');
  }

  fs.unlinkSync(sessionFile);
  return { success: true };
}

// Fork a session
function forkSession(config, projectName, sessionId) {
  const projectDir = path.join(config.projectsDir, projectName);
  const sessionFile = path.join(projectDir, sessionId + '.jsonl');

  if (!fs.existsSync(sessionFile)) {
    throw new Error('Session not found');
  }

  // Read the original session
  const content = fs.readFileSync(sessionFile, 'utf8');

  // Generate new session ID (UUID v4)
  const newSessionId = crypto.randomUUID();
  const newSessionFile = path.join(projectDir, newSessionId + '.jsonl');

  // Write to new file
  fs.writeFileSync(newSessionFile, content, 'utf8');

  // Save fork relation
  const forkRelations = getForkRelations();
  forkRelations[newSessionId] = sessionId;
  saveForkRelations(forkRelations);

  return { newSessionId, forkedFrom: sessionId };
}

// Get session order for a project
function getSessionOrder(projectName) {
  const orderFile = getSessionOrderFilePath();
  try {
    if (fs.existsSync(orderFile)) {
      const data = fs.readFileSync(orderFile, 'utf8');
      const allOrders = JSON.parse(data);
      return allOrders[projectName] || [];
    }
  } catch (err) {
    // Ignore errors
  }
  return [];
}

// Save session order for a project
function saveSessionOrder(projectName, order) {
  const orderFile = getSessionOrderFilePath();
  const dir = path.dirname(orderFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Read existing orders
  let allOrders = {};
  try {
    if (fs.existsSync(orderFile)) {
      const data = fs.readFileSync(orderFile, 'utf8');
      allOrders = JSON.parse(data);
    }
  } catch (err) {
    // Ignore errors
  }

  // Update order for this project
  allOrders[projectName] = order;
  fs.writeFileSync(orderFile, JSON.stringify(allOrders, null, 2), 'utf8');
}

// Delete a project (remove the entire project directory)
function deleteProject(config, projectName) {
  const projectDir = path.join(config.projectsDir, projectName);

  if (!fs.existsSync(projectDir)) {
    throw new Error('Project not found');
  }

  // Recursively delete the directory
  fs.rmSync(projectDir, { recursive: true, force: true });

  // Remove from order file if exists
  const order = getProjectOrder(config);
  const newOrder = order.filter(name => name !== projectName);
  if (newOrder.length !== order.length) {
    saveProjectOrder(config, newOrder);
  }

  return { success: true };
}

// Search sessions for keyword
function searchSessions(config, projectName, keyword, contextLength = 15) {
  const projectDir = path.join(config.projectsDir, projectName);

  if (!fs.existsSync(projectDir)) {
    return [];
  }

  const results = [];
  const files = fs.readdirSync(projectDir);
  const jsonlFiles = files.filter(f => f.endsWith('.jsonl') && !f.startsWith('agent-'));
  const aliases = loadAliases();

  for (const file of jsonlFiles) {
    const sessionId = file.replace('.jsonl', '');
    const filePath = path.join(projectDir, file);

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      const matches = [];

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const json = JSON.parse(line);

          // Search in message content
          if (json.message && json.message.content) {
            const text = json.message.content;
            const lowerText = text.toLowerCase();
            const lowerKeyword = keyword.toLowerCase();
            let index = 0;

            while ((index = lowerText.indexOf(lowerKeyword, index)) !== -1) {
              // Extract context
              const start = Math.max(0, index - contextLength);
              const end = Math.min(text.length, index + keyword.length + contextLength);
              const context = text.substring(start, end);

              matches.push({
                role: json.message.role || 'unknown',
                context: (start > 0 ? '...' : '') + context + (end < text.length ? '...' : ''),
                position: index
              });

              index += keyword.length;
            }
          }
        } catch (e) {
          // Skip invalid JSON lines
        }
      }

      if (matches.length > 0) {
        results.push({
          sessionId,
          alias: aliases[sessionId] || null,
          matchCount: matches.length,
          matches: matches.slice(0, 5) // Limit to 5 matches per session
        });
      }
    } catch (e) {
      // Skip files that can't be read
    }
  }

  // Sort by match count
  results.sort((a, b) => b.matchCount - a.matchCount);

  return results;
}

// Get recent sessions across all projects
function getRecentSessions(config, limit = 5) {
  const projects = getProjects(config);
  const allSessions = [];
  const forkRelations = getForkRelations();
  const aliases = loadAliases();

  // Collect all sessions from all projects
  projects.forEach(projectName => {
    const projectConfig = { ...config, currentProject: projectName };
    const sessions = getAllSessions(projectConfig);
    const { projectName: displayName, fullPath } = parseRealProjectPath(projectName);

    sessions.forEach(session => {
      const info = parseSessionInfoFast(session.filePath);
      allSessions.push({
        sessionId: session.sessionId,
        projectName: projectName,
        projectDisplayName: displayName,
        projectFullPath: fullPath,
        mtime: session.mtime,
        size: session.size,
        filePath: session.filePath,
        gitBranch: info.gitBranch || null,
        firstMessage: info.firstMessage || null,
        forkedFrom: forkRelations[session.sessionId] || null,
        alias: aliases[session.sessionId] || null
      });
    });
  });

  // Sort by mtime descending (most recent first)
  allSessions.sort((a, b) => b.mtime - a.mtime);

  // Return top N sessions
  return allSessions.slice(0, limit);
}

// Search sessions across all projects
function searchSessionsAcrossProjects(config, keyword, contextLength = 35) {
  const projects = getProjects(config);
  const allResults = [];

  projects.forEach(projectName => {
    const projectResults = searchSessions(config, projectName, keyword, contextLength);
    const { projectName: displayName, fullPath } = parseRealProjectPath(projectName);

    // Add project info to each result
    projectResults.forEach(result => {
      allResults.push({
        ...result,
        projectName: projectName,
        projectDisplayName: displayName,
        projectFullPath: fullPath
      });
    });
  });

  // Sort by match count
  allResults.sort((a, b) => b.matchCount - a.matchCount);

  return allResults;
}

module.exports = {
  getProjects,
  getProjectsWithStats,
  getSessionsForProject,
  deleteSession,
  forkSession,
  getRecentSessions,
  getProjectOrder,
  saveProjectOrder,
  getSessionOrder,
  saveSessionOrder,
  deleteProject,
  parseRealProjectPath,
  searchSessions,
  searchSessionsAcrossProjects,
  getForkRelations,
  saveForkRelations
};
