/**
 * 环境变量检测服务
 *
 * 检测系统中可能导致 API 配置冲突的环境变量
 * 支持 macOS/Linux 的 shell 配置文件检测
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// 各平台需要检测的环境变量关键词
const PLATFORM_KEYWORDS = {
  claude: ['ANTHROPIC'],
  codex: ['OPENAI'],
  gemini: ['GEMINI', 'GOOGLE_GEMINI']
};

// 敏感变量后缀模式 - 只有同时匹配关键词和这些后缀的变量才会被检测
// 这样可以过滤掉 IDE 集成等无害变量（如 GEMINI_CLI_IDE_WORKSPACE_PATH）
const SENSITIVE_PATTERNS = [
  '_API_KEY',
  '_SECRET_KEY',
  '_ACCESS_TOKEN',
  '_AUTH_TOKEN',
  '_BASE_URL',
  '_API_BASE',
  '_API_URL',
  '_ENDPOINT',
  '_API_ENDPOINT'
];

// 精确匹配的敏感变量名（不需要后缀匹配）
const EXACT_SENSITIVE_VARS = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_BASE_URL',
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'OPENAI_API_BASE',
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
  'GOOGLE_GEMINI_API_KEY'
];

// 需要检测的 shell 配置文件
const SHELL_CONFIG_FILES = [
  '.bashrc',
  '.bash_profile',
  '.zshrc',
  '.zprofile',
  '.profile'
];

// 系统级配置文件
const SYSTEM_CONFIG_FILES = [
  '/etc/profile',
  '/etc/bashrc',
  '/etc/zshrc'
];

/**
 * 检测环境变量冲突
 * @param {string} platform - 平台名称: claude/codex/gemini，不传则检测所有
 * @returns {Array} 冲突列表
 */
function checkEnvConflicts(platform = null) {
  const keywords = getKeywords(platform);
  const conflicts = [];

  // 1. 检测当前进程环境变量
  conflicts.push(...checkProcessEnv(keywords));

  // 2. 检测用户 shell 配置文件
  conflicts.push(...checkShellConfigs(keywords));

  // 3. 检测系统配置文件
  conflicts.push(...checkSystemConfigs(keywords));

  // 去重（同一变量可能在多处定义）
  return deduplicateConflicts(conflicts);
}

/**
 * 获取需要检测的关键词
 */
function getKeywords(platform) {
  if (platform && PLATFORM_KEYWORDS[platform]) {
    return PLATFORM_KEYWORDS[platform];
  }
  // 返回所有关键词
  return Object.values(PLATFORM_KEYWORDS).flat();
}

/**
 * 检测当前进程环境变量
 */
function checkProcessEnv(keywords) {
  const conflicts = [];

  for (const [key, value] of Object.entries(process.env)) {
    if (matchesKeywords(key, keywords)) {
      conflicts.push({
        varName: key,
        varValue: maskSensitiveValue(value),
        sourceType: 'process',
        sourcePath: 'Process Environment',
        platform: detectPlatform(key)
      });
    }
  }

  return conflicts;
}

/**
 * 检测用户 shell 配置文件
 */
function checkShellConfigs(keywords) {
  const conflicts = [];
  const homeDir = os.homedir();

  for (const fileName of SHELL_CONFIG_FILES) {
    const filePath = path.join(homeDir, fileName);
    const fileConflicts = parseConfigFile(filePath, keywords);
    conflicts.push(...fileConflicts);
  }

  return conflicts;
}

/**
 * 检测系统配置文件
 */
function checkSystemConfigs(keywords) {
  const conflicts = [];

  for (const filePath of SYSTEM_CONFIG_FILES) {
    const fileConflicts = parseConfigFile(filePath, keywords);
    conflicts.push(...fileConflicts);
  }

  return conflicts;
}

/**
 * 解析配置文件，查找环境变量定义
 */
function parseConfigFile(filePath, keywords) {
  const conflicts = [];

  try {
    if (!fs.existsSync(filePath)) {
      return conflicts;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // 跳过注释行
      if (trimmed.startsWith('#')) {
        continue;
      }

      // 匹配 export VAR=value 或 VAR=value 格式
      const exportMatch = trimmed.match(/^(?:export\s+)?([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (exportMatch) {
        const [, varName, varValue] = exportMatch;

        if (matchesKeywords(varName, keywords)) {
          conflicts.push({
            varName,
            varValue: maskSensitiveValue(cleanValue(varValue)),
            sourceType: 'file',
            sourcePath: `${filePath}:${i + 1}`,
            filePath,
            lineNumber: i + 1,
            platform: detectPlatform(varName)
          });
        }
      }
    }
  } catch (err) {
    // 忽略无法读取的文件
    console.debug(`[EnvChecker] Cannot read ${filePath}:`, err.message);
  }

  return conflicts;
}

/**
 * 检查变量名是否匹配关键词且为敏感变量
 *
 * 双重过滤逻辑：
 * 1. 变量名必须包含平台关键词（ANTHROPIC/OPENAI/GEMINI）
 * 2. 同时满足以下条件之一：
 *    - 精确匹配已知敏感变量名
 *    - 变量名以敏感后缀结尾（如 _API_KEY, _BASE_URL）
 *
 * 这样可以过滤掉无害的 IDE 集成变量（如 GEMINI_CLI_IDE_WORKSPACE_PATH）
 */
function matchesKeywords(varName, keywords) {
  const upperName = varName.toUpperCase();

  // 首先检查是否包含平台关键词
  const hasKeyword = keywords.some(keyword => upperName.includes(keyword));
  if (!hasKeyword) {
    return false;
  }

  // 检查是否精确匹配已知敏感变量
  if (EXACT_SENSITIVE_VARS.includes(upperName)) {
    return true;
  }

  // 检查是否以敏感后缀结尾
  const hasSensitiveSuffix = SENSITIVE_PATTERNS.some(suffix =>
    upperName.endsWith(suffix)
  );

  return hasSensitiveSuffix;
}

/**
 * 检测变量属于哪个平台
 */
function detectPlatform(varName) {
  const upperName = varName.toUpperCase();

  for (const [platform, keywords] of Object.entries(PLATFORM_KEYWORDS)) {
    if (keywords.some(k => upperName.includes(k))) {
      return platform;
    }
  }

  return 'unknown';
}

/**
 * 清理变量值（去除引号）
 */
function cleanValue(value) {
  let cleaned = value.trim();
  // 去除首尾引号
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) ||
      (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1);
  }
  return cleaned;
}

/**
 * 遮蔽敏感值
 */
function maskSensitiveValue(value) {
  if (!value) return '';
  if (value.length <= 8) return '****';
  return value.substring(0, 4) + '****' + value.substring(value.length - 4);
}

/**
 * 去重冲突列表
 */
function deduplicateConflicts(conflicts) {
  const seen = new Map();

  for (const conflict of conflicts) {
    const key = `${conflict.varName}:${conflict.sourcePath}`;
    if (!seen.has(key)) {
      seen.set(key, conflict);
    }
  }

  return Array.from(seen.values());
}

/**
 * 获取冲突统计
 */
function getConflictStats(conflicts) {
  const stats = {
    total: conflicts.length,
    byPlatform: {},
    bySourceType: {}
  };

  for (const conflict of conflicts) {
    // 按平台统计
    stats.byPlatform[conflict.platform] = (stats.byPlatform[conflict.platform] || 0) + 1;
    // 按来源类型统计
    stats.bySourceType[conflict.sourceType] = (stats.bySourceType[conflict.sourceType] || 0) + 1;
  }

  return stats;
}

module.exports = {
  checkEnvConflicts,
  getConflictStats,
  PLATFORM_KEYWORDS,
  SHELL_CONFIG_FILES,
  SENSITIVE_PATTERNS,
  EXACT_SENSITIVE_VARS
};
