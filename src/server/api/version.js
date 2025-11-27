const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { checkForUpdates, getCurrentVersion } = require('../../utils/version-check');

/**
 * GET /api/version/check
 * 检查是否有新版本
 * 支持本地 mock 模式: ?mock=true 会模拟有新版本更新
 */
router.get('/check', async (req, res) => {
  try {
    // 支持本地 mock 模式，便于开发测试
    if (req.query.mock === 'true') {
      const { getCurrentVersion } = require('../../utils/version-check');
      const current = getCurrentVersion();

      return res.json({
        hasUpdate: true,
        current: current,
        latest: '1.5.2', // mock 返回最新版本
        mock: true
      });
    }

    const result = await checkForUpdates();
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: true,
      message: error.message
    });
  }
});

/**
 * GET /api/version/current
 * 获取当前版本号
 */
router.get('/current', (req, res) => {
  try {
    const version = getCurrentVersion();
    res.json({
      version
    });
  } catch (error) {
    res.status(500).json({
      error: true,
      message: error.message
    });
  }
});

/**
 * GET /api/version/changelog/:version
 * 获取指定版本的更新日志（从 GitHub Release 获取）
 */
router.get('/changelog/:version', async (req, res) => {
  try {
    const { version } = req.params;
    const owner = 'CooperJiang';
    const repo = 'coding-tool';

    // 调用 GitHub API 获取 release 信息
    const url = `https://api.github.com/repos/${owner}/${repo}/releases/tag/v${version}`;

    const response = await fetch(url, {
      timeout: 5000,
      headers: {
        'User-Agent': 'coding-tool'
      }
    });

    if (!response.ok) {
      // 如果从 GitHub 获取失败，尝试从本地 CHANGELOG.md 获取
      console.log(`[Version] GitHub release not found for v${version}, trying local CHANGELOG.md`);
      return getChangelogFromLocal(version, res);
    }

    const release = await response.json();

    res.json({
      success: true,
      version,
      changelog: release.body || '',
      url: release.html_url
    });
  } catch (error) {
    console.error('[Version] Failed to fetch from GitHub:', error.message);
    // 如果 GitHub 请求出错，尝试从本地文件获取
    const version = req.params.version;
    getChangelogFromLocal(version, res);
  }
});

/**
 * 从本地 CHANGELOG.md 获取指定版本的更新日志
 */
function getChangelogFromLocal(version, res) {
  try {
    const changelogPath = path.join(__dirname, '../../..', 'CHANGELOG.md');

    if (!fs.existsSync(changelogPath)) {
      return res.status(404).json({
        error: true,
        message: '找不到 CHANGELOG 文件'
      });
    }

    const content = fs.readFileSync(changelogPath, 'utf-8');

    // 解析 Markdown，提取指定版本的内容
    const versionRegex = new RegExp(`## \\[${escapeRegExp(version)}\\][\\s\\S]*?(?=## \\[|$)`, 'i');
    const match = content.match(versionRegex);

    if (!match) {
      return res.status(404).json({
        error: true,
        message: `未找到版本 ${version} 的更新日志`
      });
    }

    res.json({
      success: true,
      version,
      changelog: match[0]
    });
  } catch (error) {
    res.status(500).json({
      error: true,
      message: error.message
    });
  }
}

/**
 * 转义正则表达式特殊字符
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * GET /api/version/changelog
 * 获取完整的更新日志
 */
router.get('/changelog', (req, res) => {
  try {
    // 读取 changelog.json
    const changelogPath = path.join(__dirname, '../../..', 'changelog.json');

    if (!fs.existsSync(changelogPath)) {
      return res.status(404).json({
        error: true,
        message: '找不到 changelog.json'
      });
    }

    const changelogContent = fs.readFileSync(changelogPath, 'utf-8');
    const changelog = JSON.parse(changelogContent);

    res.json({
      success: true,
      changelog
    });
  } catch (error) {
    res.status(500).json({
      error: true,
      message: error.message
    });
  }
});

/**
 * POST /api/version/update
 * 执行自动更新
 * 1. 使用 npm 更新包
 * 2. 重启 pm2 服务
 * 3. 返回成功状态
 */
router.post('/update', async (req, res) => {
  try {
    // 在后台执行更新，立即返回响应，避免超时
    res.json({
      success: true,
      message: '更新已启动，应用将自动重启...'
    });

    // 在后台异步执行更新
    setTimeout(() => {
      try {
        console.log('[Update] 开始更新 coding-tool 包...');

        // 获取包的安装目录
        const packageJsonPath = path.join(__dirname, '../../..', 'package.json');
        const projectDir = path.dirname(packageJsonPath);

        // 执行 npm update 命令
        console.log(`[Update] 执行命令: npm update coding-tool --save`);
        execSync('npm update coding-tool --save', {
          cwd: projectDir,
          stdio: 'pipe',
          timeout: 300000 // 5分钟超时
        });

        console.log('[Update] npm update 完成');

        // 使用 pm2 重启所有应用
        console.log('[Update] 正在重启 pm2 应用...');
        try {
          execSync('pm2 restart all', {
            timeout: 60000
          });
          console.log('[Update] pm2 应用重启成功');
        } catch (pmErr) {
          console.warn('[Update] pm2 重启失败或应用未在 pm2 中运行:', pmErr.message);
          // 不是致命错误，继续
        }

        console.log('[Update] 更新过程完成');
      } catch (error) {
        console.error('[Update] 更新失败:', error.message);
      }
    }, 1000);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
