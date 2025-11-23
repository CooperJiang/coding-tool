const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const toml = require('toml');
const { getCodexDir } = require('./codex-config');
const { isProxyConfig } = require('./codex-settings-manager');

/**
 * Codex 渠道管理服务
 *
 * Codex 配置结构:
 * - config.toml: 主配置,包含 model_provider 和各提供商配置
 * - auth.json: API Key 存储
 * - 我们的 codex-channels.json: 完整渠道信息(用于管理)
 */

// 获取渠道存储文件路径
function getChannelsFilePath() {
  const ccToolDir = path.join(os.homedir(), '.claude', 'cc-tool');
  if (!fs.existsSync(ccToolDir)) {
    fs.mkdirSync(ccToolDir, { recursive: true });
  }
  return path.join(ccToolDir, 'codex-channels.json');
}

// 获取激活渠道 ID 文件路径（代理模式使用）
function getActiveChannelIdPath() {
  const ccToolDir = path.join(os.homedir(), '.claude', 'cc-tool');
  if (!fs.existsSync(ccToolDir)) {
    fs.mkdirSync(ccToolDir, { recursive: true });
  }
  return path.join(ccToolDir, 'codex-active-channel.json');
}

// 保存激活渠道 ID（代理模式使用）
function saveActiveChannelId(channelId) {
  const filePath = getActiveChannelIdPath();
  fs.writeFileSync(filePath, JSON.stringify({ activeChannelId: channelId }, null, 2), 'utf8');
}

// 加载激活渠道 ID（代理模式使用）
function loadActiveChannelId() {
  const filePath = getActiveChannelIdPath();
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(content);
      return data.activeChannelId || null;
    }
  } catch (error) {
    console.error('[Codex Channels] Error loading active channel ID:', error);
  }
  return null;
}

// 读取所有渠道(从我们的存储文件)
function loadChannels() {
  const filePath = getChannelsFilePath();

  if (!fs.existsSync(filePath)) {
    // 尝试从 config.toml 初始化
    return initializeFromConfig();
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    console.error('[Codex Channels] Failed to parse channels file:', err);
    return { channels: [], activeChannelId: null };
  }
}

// 从现有 config.toml 初始化渠道
function initializeFromConfig() {
  const configPath = path.join(getCodexDir(), 'config.toml');
  const authPath = path.join(getCodexDir(), 'auth.json');

  const defaultData = { channels: [], activeChannelId: null };

  if (!fs.existsSync(configPath)) {
    saveChannels(defaultData);
    return defaultData;
  }

  try {
    // 读取 config.toml
    const configContent = fs.readFileSync(configPath, 'utf8');
    const config = toml.parse(configContent);

    // 读取 auth.json
    let auth = {};
    if (fs.existsSync(authPath)) {
      auth = JSON.parse(fs.readFileSync(authPath, 'utf8'));
    }

    // 从 model_providers 提取渠道
    const channels = [];
    if (config.model_providers) {
      for (const [providerKey, providerConfig] of Object.entries(config.model_providers)) {
        // env_key 优先级：配置的 env_key > PROVIDER_API_KEY > OPENAI_API_KEY
        let envKey = providerConfig.env_key || `${providerKey.toUpperCase()}_API_KEY`;
        let apiKey = auth[envKey] || '';

        // 如果没找到，尝试 OPENAI_API_KEY 作为通用 fallback
        if (!apiKey && auth['OPENAI_API_KEY']) {
          apiKey = auth['OPENAI_API_KEY'];
          envKey = 'OPENAI_API_KEY';
        }

        channels.push({
          id: crypto.randomUUID(),
          name: providerConfig.name || providerKey,
          providerKey,
          baseUrl: providerConfig.base_url || '',
          wireApi: providerConfig.wire_api || 'responses',
          envKey,
          apiKey,
          websiteUrl: providerConfig.website_url || '',
          requiresOpenaiAuth: providerConfig.requires_openai_auth !== false,
          queryParams: providerConfig.query_params || null,
          isActive: config.model_provider === providerKey,
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
      }
    }

    const activeChannel = channels.find(c => c.isActive);
    const data = {
      channels,
      activeChannelId: activeChannel ? activeChannel.id : null
    };

    saveChannels(data);
    return data;
  } catch (err) {
    console.error('[Codex Channels] Failed to initialize from config:', err);
    saveChannels(defaultData);
    return defaultData;
  }
}

// 保存渠道数据
function saveChannels(data) {
  const filePath = getChannelsFilePath();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// 获取所有渠道
function getChannels() {
  const data = loadChannels();

  // 检查是否在代理模式
  let activeChannelId = data.activeChannelId;
  if (isProxyConfig()) {
    // 代理模式：使用保存的激活渠道 ID
    const savedActiveId = loadActiveChannelId();
    if (savedActiveId) {
      activeChannelId = savedActiveId;
    }
  }

  // 标记当前激活的渠道
  const channels = data.channels.map(channel => ({
    ...channel,
    isActive: channel.id === activeChannelId
  }));

  return {
    channels,
    activeChannelId
  };
}

// 添加渠道
function createChannel(name, providerKey, baseUrl, apiKey, wireApi = 'responses', extraConfig = {}) {
  const data = loadChannels();

  // 检查 providerKey 是否已存在
  const existing = data.channels.find(c => c.providerKey === providerKey);
  if (existing) {
    throw new Error(`Provider key "${providerKey}" already exists`);
  }

  const envKey = extraConfig.envKey || `${providerKey.toUpperCase()}_API_KEY`;

  const newChannel = {
    id: crypto.randomUUID(),
    name,
    providerKey,
    baseUrl,
    wireApi,
    envKey,
    apiKey,
    websiteUrl: extraConfig.websiteUrl || '',
    requiresOpenaiAuth: extraConfig.requiresOpenaiAuth !== false,
    queryParams: extraConfig.queryParams || null,
    isActive: false,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  data.channels.push(newChannel);

  // 如果是第一个渠道，自动激活
  if (data.channels.length === 1 && !data.activeChannelId) {
    data.activeChannelId = newChannel.id;
    newChannel.isActive = true;
  }

  saveChannels(data);

  // 写入 Codex 配置文件
  const activeChannel = data.channels.find(c => c.id === data.activeChannelId);
  if (activeChannel) {
    writeCodexConfig(activeChannel, data.channels);
  }

  return newChannel;
}

// 更新渠道
function updateChannel(channelId, updates) {
  const data = loadChannels();
  const index = data.channels.findIndex(c => c.id === channelId);

  if (index === -1) {
    throw new Error('Channel not found');
  }

  const channel = data.channels[index];
  const isActive = data.activeChannelId === channelId;

  // 不允许修改正在使用的渠道的关键配置
  if (isActive) {
    // 只允许修改名称
    data.channels[index] = {
      ...channel,
      name: updates.name || channel.name,
      updatedAt: Date.now()
    };
  } else {
    // 检查 providerKey 冲突
    if (updates.providerKey && updates.providerKey !== channel.providerKey) {
      const existing = data.channels.find(c => c.providerKey === updates.providerKey && c.id !== channelId);
      if (existing) {
        throw new Error(`Provider key "${updates.providerKey}" already exists`);
      }
    }

    data.channels[index] = {
      ...channel,
      ...updates,
      id: channelId, // 保持 ID 不变
      createdAt: channel.createdAt, // 保持创建时间
      updatedAt: Date.now()
    };
  }

  saveChannels(data);

  // 更新 Codex 配置文件
  const activeChannel = data.channels.find(c => c.id === data.activeChannelId);
  if (activeChannel) {
    writeCodexConfig(activeChannel, data.channels);
  }

  return data.channels[index];
}

// 删除渠道
function deleteChannel(channelId) {
  const data = loadChannels();

  // 不能删除当前使用的渠道
  if (data.activeChannelId === channelId) {
    throw new Error('Cannot delete active channel');
  }

  const index = data.channels.findIndex(c => c.id === channelId);
  if (index === -1) {
    throw new Error('Channel not found');
  }

  data.channels.splice(index, 1);
  saveChannels(data);

  // 更新 Codex 配置文件（删除对应的 provider）
  const activeChannel = data.channels.find(c => c.id === data.activeChannelId);
  if (activeChannel) {
    writeCodexConfig(activeChannel, data.channels);
  }

  return { success: true };
}

// 激活渠道(切换)
function activateChannel(channelId) {
  const data = loadChannels();
  const channel = data.channels.find(c => c.id === channelId);

  if (!channel) {
    throw new Error('Channel not found');
  }

  // 检查是否在代理模式
  if (isProxyConfig()) {
    // 代理模式：只保存激活渠道 ID，不修改 Codex 配置文件
    saveActiveChannelId(channelId);
    console.log(`[Codex Channels] Activated channel in proxy mode: ${channel.name}`);
  } else {
    // 普通模式：更新 Codex 配置文件
    data.activeChannelId = channelId;
    saveChannels(data);

    // 写入 Codex 配置文件
    try {
      writeCodexConfig(channel, data.channels);
    } catch (err) {
      console.error('[Codex Channels] Failed to write Codex config:', err);
      // 回滚
      data.activeChannelId = data.channels.find(c => c.isActive)?.id || null;
      saveChannels(data);
      throw new Error('Failed to update Codex configuration: ' + err.message);
    }
    console.log(`[Codex Channels] Activated channel in normal mode: ${channel.name}`);
  }

  return {
    success: true,
    channel: {
      ...channel,
      isActive: true
    }
  };
}

// 写入 Codex 配置文件
function writeCodexConfig(activeChannel, allChannels) {
  const codexDir = getCodexDir();

  if (!fs.existsSync(codexDir)) {
    fs.mkdirSync(codexDir, { recursive: true });
  }

  const configPath = path.join(codexDir, 'config.toml');
  const authPath = path.join(codexDir, 'auth.json');

  // 读取现有配置(保留其他字段)
  let existingConfig = {
    model: 'gpt-4',
    model_reasoning_effort: 'high',
    model_reasoning_summary_format: 'experimental',
    network_access: 'enabled',
    disable_response_storage: false,
    show_raw_agent_reasoning: true
  };

  if (fs.existsSync(configPath)) {
    try {
      const content = fs.readFileSync(configPath, 'utf8');
      existingConfig = { ...existingConfig, ...toml.parse(content) };
    } catch (err) {
      console.warn('[Codex Channels] Failed to read existing config, using defaults');
    }
  }

  // 构建新的 config.toml
  let tomlContent = `# Codex Configuration
# Managed by CC-Tool

# 当前使用的模型提供商
model_provider = "${activeChannel.providerKey}"

# 使用的模型
model = "${existingConfig.model || 'gpt-4'}"

# 推理强度 (low/medium/high)
model_reasoning_effort = "${existingConfig.model_reasoning_effort || 'high'}"

# 推理摘要格式
model_reasoning_summary_format = "${existingConfig.model_reasoning_summary_format || 'experimental'}"

# 网络访问 (enabled/restricted)
network_access = "${existingConfig.network_access || 'enabled'}"

# 是否禁用响应存储
disable_response_storage = ${existingConfig.disable_response_storage || false}

# 显示原始推理过程
show_raw_agent_reasoning = ${existingConfig.show_raw_agent_reasoning !== false}

`;

  // 添加所有提供商配置
  for (const channel of allChannels) {
    tomlContent += `\n[model_providers.${channel.providerKey}]
name = "${channel.name}"
base_url = "${channel.baseUrl}"
wire_api = "${channel.wireApi}"
env_key = "${channel.envKey}"
requires_openai_auth = ${channel.requiresOpenaiAuth !== false}
`;

    // 添加额外查询参数(如 Azure 的 api-version)
    if (channel.queryParams && Object.keys(channel.queryParams).length > 0) {
      tomlContent += `\n[model_providers.${channel.providerKey}.query_params]\n`;
      for (const [key, value] of Object.entries(channel.queryParams)) {
        tomlContent += `${key} = "${value}"\n`;
      }
    }
  }

  fs.writeFileSync(configPath, tomlContent, 'utf8');

  // 更新 auth.json
  let auth = {};
  if (fs.existsSync(authPath)) {
    try {
      auth = JSON.parse(fs.readFileSync(authPath, 'utf8'));
    } catch (err) {
      console.warn('[Codex Channels] Failed to read auth.json, creating new');
    }
  }

  // 更新所有渠道的 API Key
  for (const channel of allChannels) {
    if (channel.apiKey) {
      auth[channel.envKey] = channel.apiKey;
    }
  }

  fs.writeFileSync(authPath, JSON.stringify(auth, null, 2), 'utf8');
}

// 获取当前激活的渠道
function getActiveChannel() {
  const data = loadChannels();

  // 检查是否在代理模式
  let activeChannelId = data.activeChannelId;
  if (isProxyConfig()) {
    // 代理模式：使用保存的激活渠道 ID
    const savedActiveId = loadActiveChannelId();
    if (savedActiveId) {
      activeChannelId = savedActiveId;
    }
  }

  if (!activeChannelId) {
    return null;
  }

  const channel = data.channels.find(c => c.id === activeChannelId);

  if (!channel) {
    return null;
  }

  return {
    ...channel,
    isActive: true
  };
}

// 别名：供代理服务器使用
function getActiveCodexChannel() {
  return getActiveChannel();
}

// 保存渠道顺序
function saveChannelOrder(order) {
  const data = loadChannels();

  // 按照给定的顺序重新排列
  const orderedChannels = [];
  for (const id of order) {
    const channel = data.channels.find(c => c.id === id);
    if (channel) {
      orderedChannels.push(channel);
    }
  }

  // 添加不在顺序中的渠道(新添加的)
  for (const channel of data.channels) {
    if (!orderedChannels.find(c => c.id === channel.id)) {
      orderedChannels.push(channel);
    }
  }

  data.channels = orderedChannels;
  saveChannels(data);
}

module.exports = {
  getChannels,
  createChannel,
  updateChannel,
  deleteChannel,
  activateChannel,
  getActiveChannel,
  getActiveCodexChannel,
  saveChannelOrder
};
