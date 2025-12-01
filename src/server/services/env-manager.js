/**
 * 环境变量管理服务
 *
 * 负责备份、删除和恢复环境变量
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// 备份目录
const BACKUP_DIR = path.join(os.homedir(), '.claude', 'cc-tool', 'env-backups');

/**
 * 确保备份目录存在
 */
function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

/**
 * 删除环境变量（带自动备份）
 * @param {Array} conflicts - 要删除的冲突列表
 * @returns {Object} 备份信息
 */
function deleteEnvVars(conflicts) {
  if (!conflicts || conflicts.length === 0) {
    throw new Error('没有选择要删除的环境变量');
  }

  // 只处理文件类型的环境变量（进程环境变量无法删除）
  const fileConflicts = conflicts.filter(c => c.sourceType === 'file');
  const processConflicts = conflicts.filter(c => c.sourceType === 'process');

  if (fileConflicts.length === 0 && processConflicts.length > 0) {
    throw new Error('进程环境变量无法直接删除，请手动从配置文件中移除');
  }

  // 1. 创建备份
  const backupInfo = createBackup(conflicts);

  // 2. 从文件中删除
  const results = [];
  const fileGroups = groupByFile(fileConflicts);

  for (const [filePath, vars] of Object.entries(fileGroups)) {
    try {
      removeVarsFromFile(filePath, vars);
      results.push({
        filePath,
        success: true,
        removedVars: vars.map(v => v.varName)
      });
    } catch (err) {
      results.push({
        filePath,
        success: false,
        error: err.message
      });
    }
  }

  return {
    backupPath: backupInfo.backupPath,
    timestamp: backupInfo.timestamp,
    results,
    processConflictsSkipped: processConflicts.length
  };
}

/**
 * 创建备份
 */
function createBackup(conflicts) {
  ensureBackupDir();

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(BACKUP_DIR, `env-backup-${timestamp}.json`);

  const backupData = {
    timestamp,
    createdAt: Date.now(),
    conflicts: conflicts.map(c => ({
      ...c,
      // 存储完整值用于恢复（不遮蔽）
      originalValue: getOriginalValue(c)
    }))
  };

  fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2), 'utf-8');

  return {
    backupPath: backupFile,
    timestamp
  };
}

/**
 * 获取原始值（从文件中重新读取）
 */
function getOriginalValue(conflict) {
  if (conflict.sourceType !== 'file' || !conflict.filePath || !conflict.lineNumber) {
    return null;
  }

  try {
    const content = fs.readFileSync(conflict.filePath, 'utf-8');
    const lines = content.split('\n');
    const line = lines[conflict.lineNumber - 1];

    if (line) {
      const match = line.match(/^(?:export\s+)?[A-Z_][A-Z0-9_]*=(.*)$/);
      if (match) {
        return cleanValue(match[1]);
      }
    }
  } catch (err) {
    // 忽略
  }

  return null;
}

/**
 * 清理变量值
 */
function cleanValue(value) {
  let cleaned = value.trim();
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) ||
      (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1);
  }
  return cleaned;
}

/**
 * 按文件分组
 */
function groupByFile(conflicts) {
  const groups = {};

  for (const conflict of conflicts) {
    if (conflict.filePath) {
      if (!groups[conflict.filePath]) {
        groups[conflict.filePath] = [];
      }
      groups[conflict.filePath].push(conflict);
    }
  }

  return groups;
}

/**
 * 从文件中移除环境变量
 */
function removeVarsFromFile(filePath, vars) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`文件不存在: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  // 收集要删除的行号
  const lineNumbersToRemove = new Set(vars.map(v => v.lineNumber));

  // 过滤掉要删除的行
  const newLines = lines.filter((_, index) => !lineNumbersToRemove.has(index + 1));

  // 写回文件
  fs.writeFileSync(filePath, newLines.join('\n'), 'utf-8');

  console.log(`[EnvManager] Removed ${vars.length} var(s) from ${filePath}`);
}

/**
 * 获取备份列表
 */
function getBackupList() {
  ensureBackupDir();

  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('env-backup-') && f.endsWith('.json'))
    .sort()
    .reverse(); // 最新的在前

  return files.map(fileName => {
    const filePath = path.join(BACKUP_DIR, fileName);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content);
      return {
        fileName,
        filePath,
        timestamp: data.timestamp,
        createdAt: data.createdAt,
        conflictCount: data.conflicts?.length || 0
      };
    } catch (err) {
      return {
        fileName,
        filePath,
        error: err.message
      };
    }
  });
}

/**
 * 从备份恢复
 */
function restoreFromBackup(backupPath) {
  if (!fs.existsSync(backupPath)) {
    throw new Error(`备份文件不存在: ${backupPath}`);
  }

  const content = fs.readFileSync(backupPath, 'utf-8');
  const backupData = JSON.parse(content);

  const results = [];

  for (const conflict of backupData.conflicts) {
    if (conflict.sourceType !== 'file' || !conflict.filePath || !conflict.originalValue) {
      results.push({
        varName: conflict.varName,
        success: false,
        error: '无法恢复非文件类型的环境变量'
      });
      continue;
    }

    try {
      restoreVarToFile(conflict.filePath, conflict.varName, conflict.originalValue);
      results.push({
        varName: conflict.varName,
        filePath: conflict.filePath,
        success: true
      });
    } catch (err) {
      results.push({
        varName: conflict.varName,
        success: false,
        error: err.message
      });
    }
  }

  return { results };
}

/**
 * 恢复环境变量到文件
 */
function restoreVarToFile(filePath, varName, value) {
  let content = '';

  if (fs.existsSync(filePath)) {
    content = fs.readFileSync(filePath, 'utf-8');
    // 确保末尾有换行
    if (!content.endsWith('\n')) {
      content += '\n';
    }
  }

  // 添加环境变量
  const exportLine = `export ${varName}="${value}"`;
  content += exportLine + '\n';

  fs.writeFileSync(filePath, content, 'utf-8');

  console.log(`[EnvManager] Restored ${varName} to ${filePath}`);
}

/**
 * 删除备份文件
 */
function deleteBackup(backupPath) {
  if (!fs.existsSync(backupPath)) {
    throw new Error(`备份文件不存在: ${backupPath}`);
  }

  // 安全检查：确保是备份目录下的文件
  if (!backupPath.startsWith(BACKUP_DIR)) {
    throw new Error('无效的备份文件路径');
  }

  fs.unlinkSync(backupPath);
  return true;
}

module.exports = {
  deleteEnvVars,
  getBackupList,
  restoreFromBackup,
  deleteBackup,
  BACKUP_DIR
};
