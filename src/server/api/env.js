/**
 * 环境变量检测 API 路由
 */

const express = require('express');
const router = express.Router();
const envChecker = require('../services/env-checker');
const envManager = require('../services/env-manager');

/**
 * GET /api/env/check
 * 检测环境变量冲突
 * Query: platform (可选) - claude/codex/gemini
 */
router.get('/check', (req, res) => {
  try {
    const { platform } = req.query;
    const conflicts = envChecker.checkEnvConflicts(platform || null);
    const stats = envChecker.getConflictStats(conflicts);

    res.json({
      success: true,
      conflicts,
      stats
    });
  } catch (error) {
    console.error('[Env API] Check failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/env/delete
 * 删除选中的环境变量（带自动备份）
 * Body: { conflicts: Array }
 */
router.post('/delete', (req, res) => {
  try {
    const { conflicts } = req.body;

    if (!conflicts || !Array.isArray(conflicts) || conflicts.length === 0) {
      return res.status(400).json({
        success: false,
        error: '请选择要删除的环境变量'
      });
    }

    const result = envManager.deleteEnvVars(conflicts);

    res.json({
      success: true,
      ...result,
      message: `已删除 ${result.results.filter(r => r.success).length} 个环境变量，备份已保存`
    });
  } catch (error) {
    console.error('[Env API] Delete failed:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/env/backups
 * 获取备份列表
 */
router.get('/backups', (req, res) => {
  try {
    const backups = envManager.getBackupList();

    res.json({
      success: true,
      backups
    });
  } catch (error) {
    console.error('[Env API] Get backups failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/env/restore
 * 从备份恢复
 * Body: { backupPath: string }
 */
router.post('/restore', (req, res) => {
  try {
    const { backupPath } = req.body;

    if (!backupPath) {
      return res.status(400).json({
        success: false,
        error: '请指定备份文件路径'
      });
    }

    const result = envManager.restoreFromBackup(backupPath);

    res.json({
      success: true,
      ...result,
      message: '环境变量已恢复'
    });
  } catch (error) {
    console.error('[Env API] Restore failed:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/env/backups/:fileName
 * 删除备份文件
 */
router.delete('/backups/:fileName', (req, res) => {
  try {
    const { fileName } = req.params;
    const backupPath = `${envManager.BACKUP_DIR}/${fileName}`;

    envManager.deleteBackup(backupPath);

    res.json({
      success: true,
      message: '备份已删除'
    });
  } catch (error) {
    console.error('[Env API] Delete backup failed:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
