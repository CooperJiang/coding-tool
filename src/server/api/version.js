const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { checkForUpdates, getCurrentVersion } = require('../../utils/version-check');

/**
 * GET /api/version/check
 * 检查是否有新版本
 * 注意：版本检查可能需要 2+ 秒，建议前端异步调用
 */
router.get('/check', async (req, res) => {
  try {
    // 设置响应超时为 3 秒，如果 npm 请求超过 2 秒会自动失败
    const timeoutPromise = new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          hasUpdate: false,
          current: getCurrentVersion(),
          latest: null,
          error: true,
          reason: 'version check timeout'
        });
      }, 2500);
    });

    const resultPromise = checkForUpdates();
    const result = await Promise.race([resultPromise, timeoutPromise]);

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
 * 获取指定版本的更新日志（从 GitHub CHANGELOG.md 或本地获取）
 */
router.get('/changelog/:version', async (req, res) => {
  try {
    const { version } = req.params;
    const owner = 'CooperJiang';
    const repo = 'coding-tool';

    // 先尝试从 GitHub CHANGELOG.md 获取
    const changelogUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/CHANGELOG.md`;

    const response = await fetch(changelogUrl, {
      timeout: 5000,
      headers: {
        'User-Agent': 'coding-tool'
      }
    });

    if (response.ok) {
      const content = await response.text();

      // 解析 Markdown，提取指定版本的内容
      const versionRegex = new RegExp(`## \\[${escapeRegExp(version)}\\][\\s\\S]*?(?=## \\[|$)`, 'i');
      const match = content.match(versionRegex);

      if (match) {
        return res.json({
          success: true,
          version,
          changelog: match[0],
          source: 'github'
        });
      }
    }

    console.log(`[Version] Failed to get changelog from GitHub for v${version}, trying local CHANGELOG.md`);
    // 如果从 GitHub 获取失败，尝试从本地 CHANGELOG.md 获取
    getChangelogFromLocal(version, res);
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
