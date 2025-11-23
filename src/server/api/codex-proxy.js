const express = require('express');
const router = express.Router();
const {
  startCodexProxyServer,
  stopCodexProxyServer,
  getCodexProxyStatus
} = require('../codex-proxy-server');
const {
  setProxyConfig,
  restoreSettings,
  isProxyConfig,
  getCurrentProxyPort,
  configExists,
  hasBackup
} = require('../services/codex-settings-manager');
const { getChannels, getActiveChannel } = require('../services/codex-channels');
const { clearAllLogs } = require('../websocket-server');
const fs = require('fs');
const path = require('path');
const os = require('os');

// 保存激活渠道ID
function saveActiveChannelId(channelId) {
  const dir = path.join(os.homedir(), '.claude', 'cc-tool');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const filePath = path.join(dir, 'codex-active-channel.json');
  fs.writeFileSync(filePath, JSON.stringify({ activeChannelId: channelId }, null, 2), 'utf8');
}

// 获取代理状态
router.get('/status', (req, res) => {
  try {
    const proxyStatus = getCodexProxyStatus();
    const configStatus = {
      isProxyConfig: isProxyConfig(),
      configExists: configExists(),
      hasBackup: hasBackup(),
      currentProxyPort: getCurrentProxyPort()
    };

    res.json({
      proxy: proxyStatus,
      config: configStatus
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 启动代理
router.post('/start', async (req, res) => {
  try {
    // 1. 检查 Codex 配置文件是否存在
    if (!configExists()) {
      return res.status(400).json({
        error: 'Codex config.toml not found. Please run Codex CLI at least once.'
      });
    }

    // 2. 获取当前激活的渠道
    const currentChannel = getActiveChannel();
    if (!currentChannel) {
      return res.status(400).json({
        error: 'No active Codex channel found. Please create and activate a channel first.'
      });
    }

    // 3. 保存当前激活渠道ID（用于代理模式）
    saveActiveChannelId(currentChannel.id);
    console.log(`[Codex Proxy] Saved active channel: ${currentChannel.name} (${currentChannel.id})`);

    // 4. 启动代理服务器
    const proxyResult = await startCodexProxyServer();

    if (!proxyResult.success) {
      return res.status(500).json({ error: 'Failed to start Codex proxy server' });
    }

    // 5. 设置代理配置（备份并修改 config.toml 和 auth.json）
    setProxyConfig(proxyResult.port);

    res.json({
      success: true,
      port: proxyResult.port,
      activeChannel: currentChannel.name,
      message: `Codex proxy started on port ${proxyResult.port}, active channel: ${currentChannel.name}`
    });
  } catch (error) {
    console.error('[Codex Proxy] Error starting proxy:', error);
    res.status(500).json({ error: error.message });
  }
});

// 停止代理
router.post('/stop', async (req, res) => {
  try {
    // 1. 获取当前激活的渠道
    const { channels, activeChannelId } = getChannels();
    const activeChannel = channels.find(ch => ch.id === activeChannelId);

    // 2. 停止代理服务器
    const proxyResult = await stopCodexProxyServer();

    // 3. 恢复原始配置
    if (hasBackup()) {
      restoreSettings();
      console.log('[Codex Proxy] Restored settings from backup');

      // 删除 active-channel.json
      const activeChannelPath = path.join(os.homedir(), '.claude', 'cc-tool', 'codex-active-channel.json');
      if (fs.existsSync(activeChannelPath)) {
        fs.unlinkSync(activeChannelPath);
        console.log('[Codex Proxy] Removed codex-active-channel.json');
      }

      res.json({
        success: true,
        message: `Codex proxy stopped, settings restored${activeChannel ? ' (channel: ' + activeChannel.name + ')' : ''}`,
        port: proxyResult.port,
        restoredChannel: activeChannel?.name
      });
    } else {
      res.json({
        success: true,
        message: 'Codex proxy stopped (no backup to restore)',
        port: proxyResult.port
      });
    }
  } catch (error) {
    console.error('[Codex Proxy] Error stopping proxy:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
