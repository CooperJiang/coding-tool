const express = require('express');
const router = express.Router();
const {
  getChannels,
  createChannel,
  updateChannel,
  deleteChannel,
  activateChannel,
  getActiveChannel,
  saveChannelOrder
} = require('../services/codex-channels');
const { isCodexInstalled } = require('../services/codex-config');

module.exports = (config) => {
  /**
   * GET /api/codex/channels
   * 获取所有 Codex 渠道
   */
  router.get('/', (req, res) => {
    try {
      if (!isCodexInstalled()) {
        return res.json({
          channels: [],
          activeChannelId: null,
          error: 'Codex CLI not installed'
        });
      }

      const data = getChannels();
      res.json(data);
    } catch (err) {
      console.error('[Codex Channels API] Failed to get channels:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /api/codex/channels
   * 创建新渠道
   * Body: { name, providerKey, baseUrl, apiKey, websiteUrl }
   */
  router.post('/', (req, res) => {
    try {
      if (!isCodexInstalled()) {
        return res.status(404).json({ error: 'Codex CLI not installed' });
      }

      const { name, providerKey, baseUrl, apiKey, websiteUrl } = req.body;

      if (!name || !providerKey || !baseUrl || !apiKey) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // wireApi 固定为 'responses' (OpenAI Responses API 格式)
      const channel = createChannel(name, providerKey, baseUrl, apiKey, 'responses', { websiteUrl });
      res.json(channel);
    } catch (err) {
      console.error('[Codex Channels API] Failed to create channel:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * PUT /api/codex/channels/:channelId
   * 更新渠道
   */
  router.put('/:channelId', (req, res) => {
    try {
      if (!isCodexInstalled()) {
        return res.status(404).json({ error: 'Codex CLI not installed' });
      }

      const { channelId } = req.params;
      const updates = req.body;

      const channel = updateChannel(channelId, updates);
      res.json(channel);
    } catch (err) {
      console.error('[Codex Channels API] Failed to update channel:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * DELETE /api/codex/channels/:channelId
   * 删除渠道
   */
  router.delete('/:channelId', (req, res) => {
    try {
      if (!isCodexInstalled()) {
        return res.status(404).json({ error: 'Codex CLI not installed' });
      }

      const { channelId } = req.params;
      const result = deleteChannel(channelId);
      res.json(result);
    } catch (err) {
      console.error('[Codex Channels API] Failed to delete channel:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /api/codex/channels/:channelId/activate
   * 激活渠道(切换)
   */
  router.post('/:channelId/activate', (req, res) => {
    try {
      if (!isCodexInstalled()) {
        return res.status(404).json({ error: 'Codex CLI not installed' });
      }

      const { channelId } = req.params;
      const result = activateChannel(channelId);

      // 广播切换日志
      const { broadcastLog } = require('../websocket-server');
      broadcastLog({
        type: 'action',
        action: 'switch_codex_channel',
        message: `切换到 Codex 渠道: ${result.channel.name}`,
        channelId: result.channel.id,
        channelName: result.channel.name,
        timestamp: Date.now(),
        source: 'codex'
      });

      res.json(result);
    } catch (err) {
      console.error('[Codex Channels API] Failed to activate channel:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /api/codex/channels/order
   * 保存渠道顺序
   */
  router.post('/order', (req, res) => {
    try {
      if (!isCodexInstalled()) {
        return res.status(404).json({ error: 'Codex CLI not installed' });
      }

      const { order } = req.body;

      if (!Array.isArray(order)) {
        return res.status(400).json({ error: 'order must be an array' });
      }

      saveChannelOrder(order);
      res.json({ success: true });
    } catch (err) {
      console.error('[Codex Channels API] Failed to save channel order:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/codex/channels/active
   * 获取当前激活的渠道
   */
  router.get('/active', (req, res) => {
    try {
      if (!isCodexInstalled()) {
        return res.json({ channel: null });
      }

      const channel = getActiveChannel();
      res.json({ channel });
    } catch (err) {
      console.error('[Codex Channels API] Failed to get active channel:', err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
