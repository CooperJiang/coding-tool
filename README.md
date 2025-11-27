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

### 核心命令

| 命令 | 描述 |
|------|------|
| `ct` | 启动交互式命令行界面 |
| `ct ui` | 启动 Web UI 管理界面 |
| `ct update` | 检查并更新到最新版本 |
| `ct --version` | 显示版本号 |
| `ct --help` | 显示帮助信息 |

### 代理管理

| 命令 | 描述 |
|------|------|
| `ct proxy start` | 启动代理服务（动态切换渠道） |
| `ct proxy stop` | 停止代理服务 |
| `ct proxy status` | 查看代理运行状态 |

### 后台运行（基于 PM2）

| 命令 | 描述 |
|------|------|
| `ct daemon start` | 后台启动服务（可关闭终端） |
| `ct daemon stop` | 停止后台服务 |
| `ct daemon restart` | 重启后台服务 |
| `ct daemon status` | 查看后台服务状态 |
| `ct daemon logs` | 查看 PM2 运行日志 |

### 日志管理

| 命令 | 描述 |
|------|------|
| `ct logs` | 查看所有日志 |
| `ct logs ui` | 查看 Web UI 日志 |
| `ct logs claude` | 查看 Claude 代理日志 |
| `ct logs codex` | 查看 Codex 代理日志 |
| `ct logs gemini` | 查看 Gemini 代理日志 |
| `ct logs --follow` | 实时跟踪日志输出 |
| `ct logs --lines 100` | 显示最后 100 行日志 |
| `ct logs --clear` | 清空所有日志文件 |

### 系统工具

| 命令 | 描述 |
|------|------|
| `ct doctor` | 运行系统诊断，检查配置和环境 |
| `ct stats` | 查看使用统计（会话数、Token 等） |
| `ct reset` | 重置配置文件 |

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

### 后台运行模式

- **PM2 集成**：基于 PM2 进程管理，稳定可靠
- **持久化运行**：启动后可关闭终端，服务持续运行
- **开机自启**：支持系统启动时自动启动服务
- **日志管理**：统一日志存储，支持实时查看和清理
- **状态监控**：随时查看后台服务运行状态

### 系统诊断与监控

- **健康检查**：`ct doctor` 一键诊断系统健康状态
  - Node.js 版本兼容性检查
  - 配置文件完整性验证
  - 端口占用情况检测
  - 磁盘空间监控
- **日志管理**：`ct logs` 查看和管理各类日志
  - 支持按类型筛选（UI/Claude/Codex/Gemini）
  - 实时跟踪模式（--follow）
  - 灵活的行数控制
- **使用统计**：`ct stats` 查看详细统计信息
  - 会话数量和分布
  - Token 使用情况
  - API 调用统计

### 实时监控

- **WebSocket 推送**：实时查看 API 请求详情
- **Token 统计**：输入/输出/缓存写入/缓存命中分类统计
- **成本估算**：基于自定义价格计算 API 调用成本

---

## 🎨 使用技巧

<details>
<summary><b>后台运行服务</b></summary>

1. 使用 `ct daemon start` 启动后台服务
2. 服务启动后，可以安全关闭终端窗口
3. 使用 `ct daemon status` 随时查看运行状态
4. 使用 `ct daemon logs` 查看实时日志

> **优势**：无需保持终端窗口打开，服务持久运行

</details>

<details>
<summary><b>系统诊断</b></summary>

遇到问题时，首先运行 `ct doctor` 进行全面诊断：

```bash
ct doctor
```

诊断工具会自动检查：
- Node.js 版本是否兼容
- 配置文件是否正常
- 端口是否被占用
- 磁盘空间是否充足

并提供针对性的修复建议。

</details>

<details>
<summary><b>日志管理</b></summary>

查看实时日志，排查问题：

```bash
# 实时跟踪所有日志
ct logs --follow

# 查看 Claude 代理日志的最后 100 行
ct logs claude --lines 100

# 清空所有日志文件
ct logs --clear
```

</details>

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

> **注意**：如果使用 `ct daemon start` 后台运行，可以随时切换渠道

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
<summary>如何后台运行服务？</summary>

使用 `ct daemon start` 启动后台服务，基于 PM2 进程管理，启动后可以安全关闭终端窗口。

查看状态：`ct daemon status`
查看日志：`ct daemon logs`
停止服务：`ct daemon stop`

</details>

<details>
<summary>后台服务如何开机自启？</summary>

在 Web UI 的设置中，开启"开机自启"选项，或使用 API：

```bash
ct daemon start
# 然后在 Web UI 设置中启用开机自启
```

</details>

<details>
<summary>如何查看运行日志？</summary>

使用 `ct logs` 命令：

```bash
ct logs              # 查看所有日志
ct logs claude       # 查看 Claude 代理日志
ct logs --follow     # 实时跟踪日志
ct logs --clear      # 清空日志
```

日志文件存储在 `~/.claude/logs/` 目录。

</details>

<details>
<summary>遇到问题如何诊断？</summary>

运行 `ct doctor` 进行系统诊断，会自动检查：
- Node.js 版本
- 配置文件
- 端口占用
- 磁盘空间
- 进程状态

并提供针对性的修复建议。

</details>

<details>
<summary>动态切换不生效？</summary>

确保已开启「动态切换」开关。如果使用 `ct daemon start` 后台运行，切换会更稳定。

</details>

<details>
<summary>实时日志不显示？</summary>

实时日志需要先开启「动态切换」功能，代理服务运行后才能捕获请求。

推荐使用 `ct daemon start` 后台运行，然后通过 `ct logs --follow` 查看实时日志。

</details>

<details>
<summary>如何备份配置？</summary>

直接复制以下目录即可备份所有配置和数据：
- 配置：`~/.claude/cc-tool/`
- 日志：`~/.claude/logs/`

</details>

---

## 📝 更新日志

查看完整更新日志：**[CHANGELOG.md](CHANGELOG.md)**

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
