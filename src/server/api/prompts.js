/**
 * Prompts 管理 API 路由
 */

const express = require('express');
const router = express.Router();
const promptsService = require('../services/prompts-service');

/**
 * GET /api/prompts/presets
 * 获取所有预设
 */
router.get('/presets', (req, res) => {
  try {
    const result = promptsService.getAllPresets();
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('[Prompts API] Get presets failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/prompts/presets/active
 * 获取当前激活的预设
 */
router.get('/presets/active', (req, res) => {
  try {
    const result = promptsService.getActivePreset();
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('[Prompts API] Get active preset failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/prompts/presets/:id
 * 获取单个预设
 */
router.get('/presets/:id', (req, res) => {
  try {
    const preset = promptsService.getPreset(req.params.id);
    if (!preset) {
      return res.status(404).json({
        success: false,
        error: `预设 "${req.params.id}" 不存在`
      });
    }
    res.json({
      success: true,
      preset
    });
  } catch (error) {
    console.error('[Prompts API] Get preset failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/prompts/presets
 * 添加或更新预设
 */
router.post('/presets', (req, res) => {
  try {
    const preset = req.body;

    if (!preset.id) {
      return res.status(400).json({
        success: false,
        error: '预设 ID 不能为空'
      });
    }

    if (!preset.name) {
      return res.status(400).json({
        success: false,
        error: '预设名称不能为空'
      });
    }

    const result = promptsService.savePreset(preset);
    res.json({
      success: true,
      preset: result
    });
  } catch (error) {
    console.error('[Prompts API] Save preset failed:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/prompts/presets/:id
 * 删除预设
 */
router.delete('/presets/:id', (req, res) => {
  try {
    const deleted = promptsService.deletePreset(req.params.id);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: `预设 "${req.params.id}" 不存在`
      });
    }
    res.json({
      success: true
    });
  } catch (error) {
    console.error('[Prompts API] Delete preset failed:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/prompts/presets/:id/activate
 * 激活预设
 */
router.post('/presets/:id/activate', async (req, res) => {
  try {
    const preset = await promptsService.activatePreset(req.params.id);
    res.json({
      success: true,
      preset,
      message: `已激活预设 "${preset.name}"`
    });
  } catch (error) {
    console.error('[Prompts API] Activate preset failed:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/prompts/deactivate
 * 停用/移除提示词（删除各平台文件）
 */
router.post('/deactivate', async (req, res) => {
  try {
    const result = await promptsService.deactivatePrompt();
    res.json({
      success: true,
      result,
      message: '已移除所有平台的提示词'
    });
  } catch (error) {
    console.error('[Prompts API] Deactivate prompt failed:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/prompts/platform-status
 * 获取各平台提示词状态
 */
router.get('/platform-status', (req, res) => {
  try {
    const status = promptsService.getPlatformStatus();
    res.json({
      success: true,
      status
    });
  } catch (error) {
    console.error('[Prompts API] Get platform status failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/prompts/platform/:platform
 * 读取指定平台的提示词
 */
router.get('/platform/:platform', (req, res) => {
  try {
    const { platform } = req.params;

    if (!['claude', 'codex', 'gemini'].includes(platform)) {
      return res.status(400).json({
        success: false,
        error: `无效的平台: ${platform}`
      });
    }

    const content = promptsService.readPlatformPrompt(platform);
    res.json({
      success: true,
      platform,
      content
    });
  } catch (error) {
    console.error('[Prompts API] Read platform prompt failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/prompts/import/:platform
 * 从指定平台导入提示词
 */
router.post('/import/:platform', (req, res) => {
  try {
    const { platform } = req.params;
    const { name } = req.body;

    if (!['claude', 'codex', 'gemini'].includes(platform)) {
      return res.status(400).json({
        success: false,
        error: `无效的平台: ${platform}`
      });
    }

    const preset = promptsService.importFromPlatform(platform, name);
    res.json({
      success: true,
      preset,
      message: `成功从 ${platform} 导入提示词`
    });
  } catch (error) {
    console.error('[Prompts API] Import failed:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/prompts/stats
 * 获取统计信息
 */
router.get('/stats', (req, res) => {
  try {
    const stats = promptsService.getStats();
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('[Prompts API] Get stats failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
