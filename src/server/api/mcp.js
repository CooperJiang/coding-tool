/**
 * MCP 服务器管理 API 路由
 */

const express = require('express');
const router = express.Router();
const mcpService = require('../services/mcp-service');

/**
 * GET /api/mcp/servers
 * 获取所有 MCP 服务器
 */
router.get('/servers', (req, res) => {
  try {
    const servers = mcpService.getAllServers();
    res.json({
      success: true,
      servers
    });
  } catch (error) {
    console.error('[MCP API] Get servers failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/mcp/servers/:id
 * 获取单个 MCP 服务器
 */
router.get('/servers/:id', (req, res) => {
  try {
    const server = mcpService.getServer(req.params.id);
    if (!server) {
      return res.status(404).json({
        success: false,
        error: `MCP 服务器 "${req.params.id}" 不存在`
      });
    }
    res.json({
      success: true,
      server
    });
  } catch (error) {
    console.error('[MCP API] Get server failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/mcp/servers
 * 添加或更新 MCP 服务器
 */
router.post('/servers', async (req, res) => {
  try {
    const server = req.body;

    if (!server.id) {
      return res.status(400).json({
        success: false,
        error: 'MCP 服务器 ID 不能为空'
      });
    }

    if (!server.server) {
      return res.status(400).json({
        success: false,
        error: '服务器配置不能为空'
      });
    }

    const result = await mcpService.saveServer(server);
    res.json({
      success: true,
      server: result
    });
  } catch (error) {
    console.error('[MCP API] Save server failed:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/mcp/servers/:id
 * 删除 MCP 服务器
 */
router.delete('/servers/:id', async (req, res) => {
  try {
    const deleted = await mcpService.deleteServer(req.params.id);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: `MCP 服务器 "${req.params.id}" 不存在`
      });
    }
    res.json({
      success: true
    });
  } catch (error) {
    console.error('[MCP API] Delete server failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/mcp/servers/:id/toggle
 * 切换 MCP 服务器在某平台的启用状态
 */
router.post('/servers/:id/toggle', async (req, res) => {
  try {
    const { app, enabled } = req.body;

    if (!app) {
      return res.status(400).json({
        success: false,
        error: '必须指定平台 (app)'
      });
    }

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: '必须指定启用状态 (enabled)'
      });
    }

    const server = await mcpService.toggleServerApp(req.params.id, app, enabled);
    res.json({
      success: true,
      server
    });
  } catch (error) {
    console.error('[MCP API] Toggle server failed:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/mcp/presets
 * 获取 MCP 预设模板列表
 */
router.get('/presets', (req, res) => {
  try {
    const presets = mcpService.getPresets();
    res.json({
      success: true,
      presets
    });
  } catch (error) {
    console.error('[MCP API] Get presets failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/mcp/import/:platform
 * 从指定平台导入 MCP 配置
 */
router.post('/import/:platform', async (req, res) => {
  try {
    const { platform } = req.params;

    if (!['claude', 'codex', 'gemini'].includes(platform)) {
      return res.status(400).json({
        success: false,
        error: `无效的平台: ${platform}`
      });
    }

    const count = await mcpService.importFromPlatform(platform);
    res.json({
      success: true,
      imported: count,
      message: count > 0
        ? `成功从 ${platform} 导入 ${count} 个 MCP 服务器`
        : `${platform} 没有可导入的 MCP 服务器`
    });
  } catch (error) {
    console.error('[MCP API] Import failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/mcp/stats
 * 获取 MCP 统计信息
 */
router.get('/stats', (req, res) => {
  try {
    const stats = mcpService.getStats();
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('[MCP API] Get stats failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/mcp/servers/:id/test
 * 测试 MCP 服务器连接
 */
router.post('/servers/:id/test', async (req, res) => {
  try {
    const result = await mcpService.testServer(req.params.id);

    // 更新服务器状态
    const status = result.success ? 'online' : 'error';
    await mcpService.updateServerStatus(req.params.id, status);

    res.json({
      success: true,
      result
    });
  } catch (error) {
    console.error('[MCP API] Test server failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/mcp/servers/order
 * 更新服务器排序
 */
router.post('/servers/order', (req, res) => {
  try {
    const { serverIds } = req.body;

    if (!Array.isArray(serverIds)) {
      return res.status(400).json({
        success: false,
        error: 'serverIds 必须是数组'
      });
    }

    const servers = mcpService.updateServerOrder(serverIds);
    res.json({
      success: true,
      servers
    });
  } catch (error) {
    console.error('[MCP API] Update order failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/mcp/export
 * 导出 MCP 配置
 */
router.get('/export', (req, res) => {
  try {
    const format = req.query.format || 'json';

    if (!['json', 'claude', 'codex'].includes(format)) {
      return res.status(400).json({
        success: false,
        error: `无效的导出格式: ${format}`
      });
    }

    const result = mcpService.exportServers(format);
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('[MCP API] Export failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/mcp/export/download
 * 下载导出的配置文件
 */
router.get('/export/download', (req, res) => {
  try {
    const format = req.query.format || 'json';

    if (!['json', 'claude', 'codex'].includes(format)) {
      return res.status(400).json({
        success: false,
        error: `无效的导出格式: ${format}`
      });
    }

    const result = mcpService.exportServers(format);

    res.setHeader('Content-Type', format === 'codex' ? 'application/toml' : 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.content);
  } catch (error) {
    console.error('[MCP API] Export download failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
