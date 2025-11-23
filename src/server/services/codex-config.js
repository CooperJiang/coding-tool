const fs = require('fs');
const path = require('path');
const os = require('os');
const toml = require('toml');

/**
 * 获取 Codex 配置目录
 */
function getCodexDir() {
  return path.join(os.homedir(), '.codex');
}

/**
 * 读取 config.toml
 */
function loadConfig() {
  const configPath = path.join(getCodexDir(), 'config.toml');

  if (!fs.existsSync(configPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(configPath, 'utf8');
    return toml.parse(content);
  } catch (err) {
    console.error('[Codex] Failed to parse config.toml:', err);
    return null;
  }
}

/**
 * 读取 auth.json
 */
function loadAuth() {
  const authPath = path.join(getCodexDir(), 'auth.json');

  if (!fs.existsSync(authPath)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(authPath, 'utf8'));
  } catch (err) {
    console.error('[Codex] Failed to parse auth.json:', err);
    return {};
  }
}

/**
 * 读取 history.jsonl
 */
function loadHistory() {
  const historyPath = path.join(getCodexDir(), 'history.jsonl');

  if (!fs.existsSync(historyPath)) {
    return [];
  }

  try {
    const content = fs.readFileSync(historyPath, 'utf8');
    const lines = content.trim().split('\n').filter(line => line);

    return lines.map(line => {
      try {
        return JSON.parse(line);
      } catch (err) {
        return null;
      }
    }).filter(Boolean);
  } catch (err) {
    console.error('[Codex] Failed to read history.jsonl:', err);
    return [];
  }
}

/**
 * 检查 Codex 是否已安装
 */
function isCodexInstalled() {
  return fs.existsSync(getCodexDir());
}

module.exports = {
  getCodexDir,
  loadConfig,
  loadAuth,
  loadHistory,
  isCodexInstalled
};
