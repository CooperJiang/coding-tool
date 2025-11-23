const fs = require('fs');
const path = require('path');
const os = require('os');
const toml = require('toml');

// Codex 配置文件路径
function getConfigPath() {
  return path.join(os.homedir(), '.codex', 'config.toml');
}

function getAuthPath() {
  return path.join(os.homedir(), '.codex', 'auth.json');
}

// 备份文件路径
function getConfigBackupPath() {
  return path.join(os.homedir(), '.codex', 'config.toml.cc-tool-backup');
}

function getAuthBackupPath() {
  return path.join(os.homedir(), '.codex', 'auth.json.cc-tool-backup');
}

// 检查配置文件是否存在
function configExists() {
  return fs.existsSync(getConfigPath());
}

function authExists() {
  return fs.existsSync(getAuthPath());
}

// 检查是否已经有备份
function hasBackup() {
  return fs.existsSync(getConfigBackupPath()) || fs.existsSync(getAuthBackupPath());
}

// 读取 config.toml
function readConfig() {
  try {
    const content = fs.readFileSync(getConfigPath(), 'utf8');
    return toml.parse(content);
  } catch (err) {
    throw new Error('Failed to read config.toml: ' + err.message);
  }
}

// 将配置对象转换为 TOML 字符串
function configToToml(config) {
  let content = `# Codex Configuration
# Managed by CC-Tool (Proxy Mode)

`;

  // 写入顶级字段
  for (const [key, value] of Object.entries(config)) {
    if (key === 'model_providers') continue; // 稍后处理
    if (typeof value === 'string') {
      content += `${key} = "${value}"\n`;
    } else if (typeof value === 'boolean') {
      content += `${key} = ${value}\n`;
    } else if (typeof value === 'number') {
      content += `${key} = ${value}\n`;
    }
  }

  content += '\n';

  // 写入 model_providers
  if (config.model_providers) {
    for (const [providerKey, providerConfig] of Object.entries(config.model_providers)) {
      content += `[model_providers.${providerKey}]\n`;
      for (const [key, value] of Object.entries(providerConfig)) {
        if (typeof value === 'string') {
          content += `${key} = "${value}"\n`;
        } else if (typeof value === 'boolean') {
          content += `${key} = ${value}\n`;
        } else if (typeof value === 'number') {
          content += `${key} = ${value}\n`;
        }
      }
      content += '\n';
    }
  }

  return content;
}

// 写入 config.toml
function writeConfig(config) {
  try {
    const content = configToToml(config);
    fs.writeFileSync(getConfigPath(), content, 'utf8');
  } catch (err) {
    throw new Error('Failed to write config.toml: ' + err.message);
  }
}

// 读取 auth.json
function readAuth() {
  try {
    if (!authExists()) {
      return {};
    }
    const content = fs.readFileSync(getAuthPath(), 'utf8');
    return JSON.parse(content);
  } catch (err) {
    throw new Error('Failed to read auth.json: ' + err.message);
  }
}

// 写入 auth.json
function writeAuth(auth) {
  try {
    const content = JSON.stringify(auth, null, 2);
    fs.writeFileSync(getAuthPath(), content, 'utf8');
  } catch (err) {
    throw new Error('Failed to write auth.json: ' + err.message);
  }
}

// 备份当前配置
function backupSettings() {
  try {
    if (!configExists()) {
      throw new Error('config.toml not found');
    }

    // 如果已经有备份，不覆盖
    if (hasBackup()) {
      console.log('Backup already exists, skipping backup');
      return { success: true, alreadyExists: true };
    }

    // 备份 config.toml
    const configContent = fs.readFileSync(getConfigPath(), 'utf8');
    fs.writeFileSync(getConfigBackupPath(), configContent, 'utf8');

    // 备份 auth.json (如果存在)
    if (authExists()) {
      const authContent = fs.readFileSync(getAuthPath(), 'utf8');
      fs.writeFileSync(getAuthBackupPath(), authContent, 'utf8');
    }

    console.log('Codex settings backed up');
    return { success: true, alreadyExists: false };
  } catch (err) {
    throw new Error('Failed to backup settings: ' + err.message);
  }
}

// 恢复配置
function restoreSettings() {
  try {
    if (!hasBackup()) {
      throw new Error('No backup found');
    }

    // 恢复 config.toml
    if (fs.existsSync(getConfigBackupPath())) {
      const content = fs.readFileSync(getConfigBackupPath(), 'utf8');
      fs.writeFileSync(getConfigPath(), content, 'utf8');
      fs.unlinkSync(getConfigBackupPath());
    }

    // 恢复 auth.json
    if (fs.existsSync(getAuthBackupPath())) {
      const content = fs.readFileSync(getAuthBackupPath(), 'utf8');
      fs.writeFileSync(getAuthPath(), content, 'utf8');
      fs.unlinkSync(getAuthBackupPath());
    }

    console.log('Codex settings restored from backup');
    return { success: true };
  } catch (err) {
    throw new Error('Failed to restore settings: ' + err.message);
  }
}

// 设置代理配置
function setProxyConfig(proxyPort) {
  try {
    // 先备份
    backupSettings();

    // 读取当前配置
    const config = readConfig();

    // 设置 model_provider 为 proxy
    config.model_provider = 'cc-proxy';

    // 确保 model_providers 对象存在
    if (!config.model_providers) {
      config.model_providers = {};
    }

    // 添加代理 provider
    config.model_providers['cc-proxy'] = {
      name: 'cc-proxy',
      base_url: `http://127.0.0.1:${proxyPort}/v1`,
      wire_api: 'responses',
      env_key: 'CC_PROXY_KEY'
    };

    // 写入配置
    writeConfig(config);

    // 写入 auth.json
    const auth = readAuth();
    auth.CC_PROXY_KEY = 'PROXY_KEY';
    writeAuth(auth);

    console.log(`Codex settings updated to use proxy on port ${proxyPort}`);
    return { success: true, port: proxyPort };
  } catch (err) {
    throw new Error('Failed to set proxy config: ' + err.message);
  }
}

// 检查当前是否是代理配置
function isProxyConfig() {
  try {
    if (!configExists()) {
      return false;
    }

    const config = readConfig();

    // 检查是否使用 cc-proxy provider
    if (config.model_provider === 'cc-proxy') {
      return true;
    }

    // 检查当前 provider 的 base_url 是否指向本地代理
    const currentProvider = config.model_provider;
    if (currentProvider && config.model_providers && config.model_providers[currentProvider]) {
      const baseUrl = config.model_providers[currentProvider].base_url || '';
      if (baseUrl.includes('127.0.0.1') && baseUrl.includes('10089')) {
        return true;
      }
    }

    return false;
  } catch (err) {
    return false;
  }
}

// 获取当前代理端口（如果是代理配置）
function getCurrentProxyPort() {
  try {
    if (!isProxyConfig()) {
      return null;
    }

    const config = readConfig();
    const proxyProvider = config.model_providers?.['cc-proxy'];
    if (proxyProvider) {
      const baseUrl = proxyProvider.base_url || '';
      const match = baseUrl.match(/:(\d+)/);
      return match ? parseInt(match[1]) : null;
    }

    return null;
  } catch (err) {
    return null;
  }
}

module.exports = {
  getConfigPath,
  getAuthPath,
  getConfigBackupPath,
  getAuthBackupPath,
  configExists,
  authExists,
  hasBackup,
  readConfig,
  writeConfig,
  readAuth,
  writeAuth,
  backupSettings,
  restoreSettings,
  setProxyConfig,
  isProxyConfig,
  getCurrentProxyPort
};
