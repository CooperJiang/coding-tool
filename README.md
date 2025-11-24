<div align="center">

<img src="docs/logo.png" alt="Coding-Tool Logo" width="140" />

# Coding-Tool

**Claude Code / Codex / Gemini CLI 增强工具**

智能会话管理 | 多渠道动态切换 | 实时 Token 监控

[![npm version](https://img.shields.io/npm/v/coding-tool.svg?style=flat-square)](https://www.npmjs.com/package/coding-tool)
[![npm downloads](https://img.shields.io/npm/dm/coding-tool.svg?style=flat-square)](https://www.npmjs.com/package/coding-tool)
[![GitHub stars](https://img.shields.io/github/stars/CooperJiang/cc-tool?style=flat-square)](https://github.com/CooperJiang/cc-tool/stargazers)
[![License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen.svg?style=flat-square)](package.json)

<br />

<img src="docs/home.png" alt="Coding-Tool Preview" width="90%" />

<p><sub>现代化 Web 界面 - 项目管理、会话浏览、实时日志监控</sub></p>

</div>

---

## ✨ 特性

| 功能 | 描述 |
|------|------|
| **智能会话管理** | 自动识别 Claude/Codex/Gemini 历史会话，支持命名、搜索、Fork 分支 |
| **动态渠道切换** | 管理多个 API 渠道，一键切换无需重启，成本优化与稳定性兼得 |
| **实时 Token 监控** | 可视化展示每次请求的 Token 消耗（输入/输出/缓存命中） |
| **全局搜索** | `⌘/Ctrl + K` 跨项目搜索会话内容，快速定位历史对话 |
| **现代化 Web UI** | 响应式设计，支持亮色/暗色主题，拖拽排序 |

---

## 📦 安装

### npm（推荐）

```bash
npm install -g coding-tool
```

### 从源码构建

```bash
git clone https://github.com/CooperJiang/cc-tool.git
cd cc-tool
npm install && npm link
```

### 验证安装

```bash
ct --version
```

---

## 🚀 快速开始

### 启动 Web UI（推荐）

```bash
ct ui
```

浏览器自动打开 `http://localhost:9999`，即可开始管理会话和渠道。

### 命令行交互模式

```bash
ct
```

启动交互式菜单，通过键盘完成会话管理和渠道切换。

---

## 📋 命令参考

| 命令 | 描述 |
|------|------|
| `ct` | 启动交互式命令行界面 |
| `ct ui` | 启动 Web UI 管理界面 |
| `ct update` | 检查并更新到最新版本 |
| `ct proxy start` | 启动代理服务（动态切换渠道） |
| `ct proxy stop` | 停止代理服务 |
| `ct status` | 查看代理运行状态 |
| `ct reset` | 重置配置文件 |
| `ct --version` | 显示版本号 |
| `ct --help` | 显示帮助信息 |

---

## 📖 核心功能

### 会话管理

- **多平台支持**：统一管理 Claude Code、Codex CLI、Gemini CLI 的会话
- **会话别名**：为会话设置易记的名称，方便识别
- **Fork 会话**：基于现有对话创建分支，探索不同方向
- **快速启动**：一键在终端中恢复历史会话

### 多渠道管理

- **动态切换**：运行时切换 API 渠道，无需重启 CLI
- **可视化配置**：添加、编辑、删除渠道，拖拽调整优先级
- **安全存储**：API Key 脱敏显示，配置本地加密存储

### 实时监控

- **WebSocket 推送**：实时查看 API 请求详情
- **Token 统计**：输入/输出/缓存写入/缓存命中分类统计
- **成本估算**：基于自定义价格计算 API 调用成本

---

## 🎨 使用技巧

<details>
<summary><b>全局搜索</b></summary>

1. 在任意页面按 `⌘/Ctrl + K`
2. 输入关键词搜索所有项目的会话内容
3. 点击搜索结果直接启动对话

</details>

<details>
<summary><b>动态切换渠道</b></summary>

1. 点击顶部「动态切换」开关
2. 在渠道列表中点击「切换」按钮
3. CLI 自动使用新渠道，无需重启

> **注意**：动态切换期间请勿关闭进程窗口

</details>

<details>
<summary><b>Fork 会话</b></summary>

1. 在会话列表中点击 Fork 按钮
2. 新会话继承原会话的所有历史消息
3. 可以基于相同上下文探索不同方向

</details>

---

## ❓ 常见问题

<details>
<summary>动态切换不生效？</summary>

确保已开启「动态切换」开关，且进程窗口未关闭。

</details>

<details>
<summary>实时日志不显示？</summary>

实时日志需要先开启「动态切换」功能，代理服务运行后才能捕获请求。

</details>

<details>
<summary>如何备份配置？</summary>

直接复制 `~/.claude/cc-tool/` 目录即可备份所有配置和数据。

</details>

---

## 📝 更新日志

查看完整更新日志：**[CHANGELOG.md](docs/CHANGELOG.md)**

---

## 🤝 贡献

欢迎提交 [Issue](https://github.com/CooperJiang/cc-tool/issues) 和 [Pull Request](https://github.com/CooperJiang/cc-tool/pulls)！

---

## 📄 许可证

[MIT License](LICENSE) © 2025 CooperJiang

---

<div align="center">

**如果这个项目对你有帮助，请给它一个 Star ⭐**

[![Star History Chart](https://api.star-history.com/svg?repos=CooperJiang/cc-tool&type=Date)](https://star-history.com/#CooperJiang/cc-tool&Date)

</div>
