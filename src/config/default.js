// 默认配置
const path = require('path');
const os = require('os');

const DEFAULT_CONFIG = {
  projectsDir: path.join(os.homedir(), '.claude', 'projects'),
  defaultProject: null,
  maxDisplaySessions: 100,
  pageSize: 15,
  ports: {
    webUI: 10099,      // Web UI 页面端口 (同时用于 WebSocket)
    proxy: 10088,      // Claude 代理服务端口
    codexProxy: 10089  // Codex 代理服务端口
  }
};

module.exports = DEFAULT_CONFIG;
