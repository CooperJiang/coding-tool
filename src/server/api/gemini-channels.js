const express = require('express');
const router = express.Router();
const {
  getChannels,
  createChannel,
  updateChannel,
  deleteChannel,
  getEnabledChannels,
  saveChannelOrder
} = require('../services/gemini-channels');
const { getSchedulerState } = require('../services/channel-scheduler');
const { broadcastSchedulerState } = require('../websocket-server');
const { isGeminiInstalled } = require('../services/gemini-config');
const { testChannelSpeed, testMultipleChannels, getLatencyLevel } = require('../services/speed-test');

module.exports = (config) => {
  /**
   * GET /api/gemini/channels
   * 获取所有 Gemini 渠道
   */
  router.get('/', (req, res) => {
    try {
      if (!isGeminiInstalled()) {
        return res.json({
          channels: [],
          error: 'Gemini CLI not installed'
        });
      }

      const data = getChannels();
      res.json(data);
    } catch (err) {
      console.error('[Gemini Channels API] Failed to get channels:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /api/gemini/channels
   * 创建新渠道
   * Body: { name, baseUrl, apiKey, model, websiteUrl }
   */
  router.post('/', (req, res) => {
    try {
      if (!isGeminiInstalled()) {
        return res.status(404).json({ error: 'Gemini CLI not installed' });
      }

      const { name, baseUrl, apiKey, model, websiteUrl, enabled, weight, maxConcurrency } = req.body;

      if (!name || !baseUrl || !apiKey) {
        return res.status(400).json({ error: 'Missing required fields: name, baseUrl, apiKey' });
      }

      const channel = createChannel(name, baseUrl, apiKey, model || 'gemini-2.5-pro', {
        websiteUrl,
        enabled,
        weight,
        maxConcurrency
      });
      res.json(channel);
      broadcastSchedulerState('gemini', getSchedulerState('gemini'));
    } catch (err) {
      console.error('[Gemini Channels API] Failed to create channel:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * PUT /api/gemini/channels/:channelId
   * 更新渠道
   */
  router.put('/:channelId', (req, res) => {
    try {
      if (!isGeminiInstalled()) {
        return res.status(404).json({ error: 'Gemini CLI not installed' });
      }

      const { channelId } = req.params;
      const updates = req.body;

      const channel = updateChannel(channelId, updates);
      res.json(channel);
      broadcastSchedulerState('gemini', getSchedulerState('gemini'));
    } catch (err) {
      console.error('[Gemini Channels API] Failed to update channel:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * DELETE /api/gemini/channels/:channelId
   * 删除渠道
   */
  router.delete('/:channelId', (req, res) => {
    try {
      if (!isGeminiInstalled()) {
        return res.status(404).json({ error: 'Gemini CLI not installed' });
      }

      const { channelId } = req.params;
      const result = deleteChannel(channelId);
      res.json(result);
      broadcastSchedulerState('gemini', getSchedulerState('gemini'));
    } catch (err) {
      console.error('[Gemini Channels API] Failed to delete channel:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /api/gemini/channels/order
   * 保存渠道顺序
   */
  router.post('/order', (req, res) => {
    try {
      if (!isGeminiInstalled()) {
        return res.status(404).json({ error: 'Gemini CLI not installed' });
      }

      const { order } = req.body;

      if (!Array.isArray(order)) {
        return res.status(400).json({ error: 'order must be an array' });
      }

      saveChannelOrder(order);
      res.json({ success: true });
    } catch (err) {
      console.error('[Gemini Channels API] Failed to save channel order:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/gemini/channels/enabled
   * 获取所有启用的渠道（供调度器使用）
   */
  router.get('/enabled', (req, res) => {
    try {
      if (!isGeminiInstalled()) {
        return res.json({ channels: [] });
      }

      const channels = getEnabledChannels();
      res.json({ channels });
    } catch (err) {
      console.error('[Gemini Channels API] Failed to get enabled channels:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /api/gemini/channels/:channelId/speed-test
   * 测试单个渠道速度
   */
  router.post('/:channelId/speed-test', async (req, res) => {
    try {
      if (!isGeminiInstalled()) {
        return res.status(404).json({ error: 'Gemini CLI not installed' });
      }

      const { channelId } = req.params;
      const { timeout = 10000 } = req.body;
      const data = getChannels();
      const channel = data.channels.find(ch => ch.id === channelId);

      if (!channel) {
        return res.status(404).json({ error: '渠道不存在' });
      }

      const result = await testChannelSpeed(channel, timeout);
      result.level = getLatencyLevel(result.latency);

      res.json(result);
    } catch (error) {
      console.error('[Gemini Channels API] Error testing channel speed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/gemini/channels/speed-test-all
   * 测试所有渠道速度
   */
  router.post('/speed-test-all', async (req, res) => {
    try {
      if (!isGeminiInstalled()) {
        return res.json({ results: [], message: 'Gemini CLI not installed' });
      }

      const { timeout = 10000 } = req.body;
      const data = getChannels();
      const channels = data.channels || [];

      if (channels.length === 0) {
        return res.json({ results: [], message: '没有可测试的渠道' });
      }

      const results = await testMultipleChannels(channels, timeout);
      results.forEach(r => {
        r.level = getLatencyLevel(r.latency);
      });

      res.json({
        results,
        summary: {
          total: results.length,
          success: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length,
          avgLatency: calculateAvgLatency(results)
        }
      });
    } catch (error) {
      console.error('[Gemini Channels API] Error testing all channels speed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};

// 计算平均延迟
function calculateAvgLatency(results) {
  const successResults = results.filter(r => r.success && r.latency);
  if (successResults.length === 0) return null;
  const sum = successResults.reduce((acc, r) => acc + r.latency, 0);
  return Math.round(sum / successResults.length);
}
