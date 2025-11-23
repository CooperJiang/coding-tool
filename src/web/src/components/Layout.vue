<template>
  <div class="layout">
    <!-- Global Header -->
    <header class="header">
      <div class="logo-section" @click="goHome">
        <img src="/logo.png" alt="Coding Tool Logo" class="logo-image" />
        <div class="title-group">
          <h1 class="title-main">Coding-Tool</h1>
          <span class="title-divider">-</span>
          <span class="title-sub">Vibe Coding增强工作助手</span>
        </div>
      </div>

      <!-- Navigation Tabs -->
      <div class="nav-tabs">
        <div
          class="nav-tab"
          :class="{ active: currentRoute === 'home' }"
          @click="router.push({ name: 'home' })"
        >
          <n-icon :size="18" class="nav-icon">
            <HomeOutline />
          </n-icon>
          <span class="nav-label">首页</span>
        </div>
        <div
          class="nav-tab"
          :class="{ active: currentChannel === 'claude' }"
          @click="router.push({ name: 'claude-projects' })"
        >
          <n-icon :size="18" class="nav-icon">
            <LayersOutline />
          </n-icon>
          <span class="nav-label">Claude</span>
        </div>
        <div
          class="nav-tab"
          :class="{ active: currentChannel === 'codex' }"
          @click="router.push({ name: 'codex-projects' })"
        >
          <n-icon :size="18" class="nav-icon">
            <CodeSlashOutline />
          </n-icon>
          <span class="nav-label">Codex</span>
        </div>
      </div>

      <div class="header-actions">
        <!-- Theme Toggle -->
        <HeaderButton
          :icon="isDark ? SunnyOutline : MoonOutline"
          :tooltip="isDark ? '切换到亮色主题' : '切换到暗色主题'"
          @click="toggleTheme"
        />

        <!-- Settings Button -->
        <HeaderButton
          :icon="SettingsOutline"
          tooltip="设置"
          @click="showSettingsDrawer = true"
        />

        <!-- Help Button -->
        <HeaderButton
          :icon="HelpCircleOutline"
          :icon-size="24"
          tooltip="使用帮助"
          @click="showHelpModal = true"
        />

        <!-- GitHub Link -->
        <HeaderButton
          :icon="LogoGithub"
          tooltip="访问 GitHub 仓库"
          @click="openGithub"
        />
      </div>
    </header>

    <div class="main-container">
      <!-- Global Loading Overlay -->
      <div v-if="globalLoading" class="global-loading-overlay">
        <n-spin size="large">
          <template #description>
            加载配置中...
          </template>
        </n-spin>
      </div>

      <!-- Left Content Area (Router View) - Always mounted -->
      <div class="left-content">
        <router-view />
      </div>

      <!-- Right Panel (Global) - Only show if at least one panel is enabled -->
      <transition name="slide-right">
        <RightPanel
          v-if="showChannels || (showLogs && effectiveProxyRunning)"
          :show-channels="showChannels"
          :show-logs="showLogs"
          :proxy-running="effectiveProxyRunning"
          :proxy-loading="effectiveProxyLoading"
          @proxy-toggle="handleProxyToggle"
          @show-recent="showRecentDrawer = true"
        />
      </transition>
    </div>

    <!-- Recent Sessions Drawer -->
    <RecentSessionsDrawer v-model:visible="showRecentDrawer" :channel="currentChannel" />

    <!-- Settings Drawer -->
    <SettingsDrawer v-model:visible="showSettingsDrawer" />

    <!-- Help Modal -->
    <n-modal v-model:show="showHelpModal" preset="card" title="CODING-TOOL 使用帮助" style="width: 800px; max-width: 90vw;">
      <div class="help-content">
        <div class="help-section">
          <h4>🚀 快速开始</h4>
          <p>CODING-TOOL 是 Vibe Coding 的增强工作助手，提供智能会话管理、动态渠道切换、全局搜索和实时监控功能。</p>
        </div>

        <div class="help-section">
          <h4>📋 命令行用法</h4>
          <div class="command-list">
            <div class="command-item">
              <code>ct</code>
              <span>启动交互式命令行界面</span>
            </div>
            <div class="command-item">
              <code>ct ui</code>
              <span>启动 Web 可视化界面（推荐）</span>
            </div>
            <div class="command-item">
              <code>ct reset</code>
              <span>重置配置文件到默认状态</span>
            </div>
            <div class="command-item">
              <code>ct proxy start</code>
              <span>启动代理服务</span>
            </div>
            <div class="command-item">
              <code>ct proxy stop</code>
              <span>停止代理服务</span>
            </div>
            <div class="command-item">
              <code>ct status</code>
              <span>查看代理状态</span>
            </div>
            <div class="command-item">
              <code>ct -v</code>
              <span>显示版本号</span>
            </div>
            <div class="command-item">
              <code>ct -h</code>
              <span>显示帮助信息</span>
            </div>
          </div>
        </div>

        <div class="help-section">
          <h4>🎯 Web UI 功能</h4>
          <ul>
            <li><strong>项目管理</strong>：查看所有项目，支持拖拽排序、搜索过滤、删除项目</li>
            <li><strong>会话管理</strong>：查看项目会话列表，支持搜索、Fork、删除、重命名</li>
            <li><strong>快速启动</strong>：点击会话直接在终端中启动 ClaudeCode</li>
            <li><strong>动态切换</strong>：开启后可在右侧面板快速切换 API 渠道，无需修改配置文件</li>
            <li><strong>实时日志</strong>：查看代理请求的实时日志和状态</li>
            <li><strong>全局搜索</strong>：使用 <kbd>⌘/Ctrl</kbd> + <kbd>K</kbd> 在所有项目中搜索对话内容</li>
          </ul>
        </div>

        <div class="help-section">
          <h4>⚡ 动态渠道切换</h4>
          <p>开启「动态切换」后，会在本地启动代理服务。您可以在右侧面板添加多个 API 渠道，快速切换而无需修改配置文件或重启 ClaudeCode。</p>
          <p style="color: #f59e0b; font-size: 13px; margin-top: 8px;">⚠️ 注意：开启期间请勿关闭 CC 进程窗口。</p>
        </div>

        <div class="help-section">
          <h4>🔗 相关链接</h4>
          <div class="link-list">
            <a href="https://github.com/CooperJiang/cc-tool" target="_blank">GitHub 仓库</a>
            <a href="https://github.com/CooperJiang/cc-tool/issues" target="_blank">问题反馈</a>
          </div>
        </div>
      </div>
    </n-modal>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { NTooltip, NSwitch, NSpin, NModal, NIcon } from 'naive-ui'
import { ChatbubblesOutline, ServerOutline, TerminalOutline, LogoGithub, HelpCircleOutline, MoonOutline, SunnyOutline, SettingsOutline, HomeOutline, LayersOutline, CodeSlashOutline } from '@vicons/ionicons5'
import RightPanel from './RightPanel.vue'
import RecentSessionsDrawer from './RecentSessionsDrawer.vue'
import SettingsDrawer from './SettingsDrawer.vue'
import HeaderButton from './HeaderButton.vue'
import api from '../api'
import message from '../utils/message'
import { useTheme } from '../composables/useTheme'

// 使用主题 composable
const { isDark, toggleTheme } = useTheme()

const router = useRouter()
const route = useRoute()

// 导航状态
const currentRoute = computed(() => route.name)
const currentChannel = computed(() => route.meta.channel || null)

const showRecentDrawer = ref(false)
const showSettingsDrawer = ref(false)
const showHelpModal = ref(false)
const proxyRunning = ref(false)
const proxyLoading = ref(false)
const codexProxyRunning = ref(false)
const codexProxyLoading = ref(false)
const globalLoading = ref(true) // 全局 loading 状态
let statusCheckInterval = null

// 根据当前 channel 计算有效的代理状态
const effectiveProxyRunning = computed(() => {
  return currentChannel.value === 'codex' ? codexProxyRunning.value : proxyRunning.value
})
const effectiveProxyLoading = computed(() => {
  return currentChannel.value === 'codex' ? codexProxyLoading.value : proxyLoading.value
})

// Panel visibility settings (with localStorage persistence)
const showChannels = ref(true)
const showLogs = ref(true)

// Load panel visibility from localStorage
function loadPanelSettings() {
  const saved = localStorage.getItem('cc-panel-visibility')
  if (saved) {
    try {
      const settings = JSON.parse(saved)
      showChannels.value = settings.showChannels !== false // default true
      showLogs.value = settings.showLogs !== false // default true
    } catch (e) {
      // Ignore parse errors
    }
  }
}

// Save panel visibility to localStorage
function savePanelSettings() {
  localStorage.setItem('cc-panel-visibility', JSON.stringify({
    showChannels: showChannels.value,
    showLogs: showLogs.value
  }))
}

// Toggle handlers
function toggleChannels() {
  showChannels.value = !showChannels.value
  savePanelSettings()
}

function toggleLogs() {
  showLogs.value = !showLogs.value
  savePanelSettings()
}

function goHome() {
  router.push({ name: 'home' })
}

function openGithub() {
  window.open('https://github.com/CooperJiang/cc-tool', '_blank')
}

// 检查代理状态
async function checkProxyStatus(isInitial = false) {
  try {
    const status = await api.getProxyStatus()
    proxyRunning.value = status.proxy.running
  } catch (err) {
    console.error('Failed to check proxy status:', err)
    // 即使失败也要关闭 loading
  } finally {
    // 初次加载完成后关闭全局 loading
    if (isInitial) {
      globalLoading.value = false
    }
  }
}

// 切换代理状态
async function toggleProxy(newValue) {
  proxyLoading.value = true

  // 保存旧值，如果失败需要恢复
  const oldValue = !newValue

  try {
    if (newValue) {
      // 启动代理
      const result = await api.startProxy()
      message.success(`代理已启动，端口: ${result.port}`)

      // 立即更新状态，让日志面板立即显示（不等待后台检查）
      proxyRunning.value = true

      // 自动展示日志面板
      showLogs.value = true
      savePanelSettings()

      // 后台异步检查状态确认，不阻塞 UI
      checkProxyStatus().catch(err => console.error('Background status check failed:', err))
    } else {
      // 停止代理
      await api.stopProxy()
      message.success('代理已停止并恢复配置')

      // 立即更新状态，让日志面板立即隐藏
      proxyRunning.value = false

      // 后台异步检查状态确认
      checkProxyStatus().catch(err => console.error('Background status check failed:', err))
    }
  } catch (err) {
    message.error('操作失败: ' + err.message)
    // 恢复旧值
    proxyRunning.value = oldValue
  } finally {
    proxyLoading.value = false
  }
}

// 检查 Codex 代理状态
async function checkCodexProxyStatus() {
  try {
    const status = await api.getCodexProxyStatus()
    codexProxyRunning.value = status.proxy.running
  } catch (err) {
    console.error('Failed to check Codex proxy status:', err)
  }
}

// 切换 Codex 代理状态
async function toggleCodexProxy(newValue) {
  codexProxyLoading.value = true
  const oldValue = !newValue

  try {
    if (newValue) {
      const result = await api.startCodexProxy()
      message.success(`Codex 代理已启动，端口: ${result.port}`)
      codexProxyRunning.value = true
      showLogs.value = true
      savePanelSettings()
      checkCodexProxyStatus().catch(err => console.error('Background status check failed:', err))
    } else {
      await api.stopCodexProxy()
      message.success('Codex 代理已停止并恢复配置')
      codexProxyRunning.value = false
      checkCodexProxyStatus().catch(err => console.error('Background status check failed:', err))
    }
  } catch (err) {
    message.error('操作失败: ' + err.message)
    codexProxyRunning.value = oldValue
  } finally {
    codexProxyLoading.value = false
  }
}

// 统一的代理切换处理器（根据当前 channel 路由到正确的代理）
function handleProxyToggle(newValue) {
  if (currentChannel.value === 'codex') {
    toggleCodexProxy(newValue)
  } else {
    toggleProxy(newValue)
  }
}

// 监听来自 SettingsDrawer 的面板可见性变化
function handlePanelVisibilityChange(event) {
  const { showChannels: newShowChannels, showLogs: newShowLogs } = event.detail
  showChannels.value = newShowChannels
  showLogs.value = newShowLogs
}

onMounted(() => {
  // 加载面板可见性设置
  loadPanelSettings()

  // 监听面板可见性变化事件
  window.addEventListener('panel-visibility-change', handlePanelVisibilityChange)

  // 初始检查状态（传入 isInitial = true）
  checkProxyStatus(true)
  checkCodexProxyStatus() // 也检查 Codex 代理状态

  // 每30秒检查一次状态（降低请求频率）
  statusCheckInterval = setInterval(() => {
    checkProxyStatus(false)
    checkCodexProxyStatus()
  }, 30000)

  // 添加超时保护，确保 3 秒后无论如何都关闭 loading
  setTimeout(() => {
    if (globalLoading.value) {
      console.warn('Global loading timeout, forcing to hide')
      globalLoading.value = false
    }
  }, 3000)
})

onUnmounted(() => {
  if (statusCheckInterval) {
    clearInterval(statusCheckInterval)
  }
  // 移除事件监听
  window.removeEventListener('panel-visibility-change', handlePanelVisibilityChange)
})
</script>

<style scoped>
.layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg-primary);
}

.header {
  height: 64px;
  border-bottom: 1px solid var(--border-primary);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  background: var(--gradient-header);
  box-shadow: 0 2px 12px rgba(24, 160, 88, 0.06), var(--shadow-sm);
  z-index: 10;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 16px;
}

.proxy-control {
  display: flex;
  align-items: center;
  gap: 8px;
}

.proxy-label {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 600;
  user-select: none;
  letter-spacing: 0.3px;
}

.logo-section {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  transition: opacity 0.2s;
}

.logo-section:hover {
  opacity: 0.8;
}

.logo-image {
  width: 32px;
  height: 32px;
  object-fit: contain;
}

.title-group {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.title-main {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  color: #18a058;
  user-select: none;
  letter-spacing: -0.5px;
}

.title-divider {
  font-size: 18px;
  font-weight: 400;
  color: var(--border-secondary);
  user-select: none;
}

.title-sub {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-tertiary);
  user-select: none;
}

/* 导航标签 */
.nav-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 40px;
}

.nav-tab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;
  position: relative;
}

.nav-tab:hover {
  background: var(--hover-bg);
}

[data-theme="dark"] .nav-tab:hover {
  background: rgba(255, 255, 255, 0.09);
}

.nav-tab.active {
  background: rgba(24, 160, 88, 0.1);
  color: #18a058;
}

[data-theme="dark"] .nav-tab.active {
  background: rgba(24, 160, 88, 0.15);
  color: #34d399;
}

.nav-tab.active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 12px;
  right: 12px;
  height: 2px;
  background: #18a058;
  border-radius: 2px 2px 0 0;
}

[data-theme="dark"] .nav-tab.active::after {
  background: #34d399;
}

.nav-icon {
  color: var(--text-tertiary);
  transition: all 0.2s ease;
}

.nav-tab:hover .nav-icon {
  color: var(--text-secondary);
}

.nav-tab.active .nav-icon {
  color: #18a058;
}

[data-theme="dark"] .nav-tab.active .nav-icon {
  color: #34d399;
}

.nav-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
  transition: all 0.2s ease;
}

.nav-tab:hover .nav-label {
  color: var(--text-primary);
}

.nav-tab.active .nav-label {
  color: #18a058;
  font-weight: 600;
}

[data-theme="dark"] .nav-tab.active .nav-label {
  color: #34d399;
}

.main-container {
  display: flex;
  flex: 1;
  overflow: hidden;
  position: relative;
}

.global-loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  background: var(--bg-overlay);
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.left-content {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  transition: all 0.3s ease-out;
}

/* Slide in from right animation */
.slide-right-enter-active,
.slide-right-leave-active {
  transition: transform 0.3s ease-out, opacity 0.3s ease-out;
}

.slide-right-enter-from {
  transform: translateX(100%);
  opacity: 0;
}

.slide-right-leave-to {
  transform: translateX(100%);
  opacity: 0;
}

.slide-right-enter-to,
.slide-right-leave-from {
  transform: translateX(0);
  opacity: 1;
}

/* Help Modal Styles */
.help-content {
  max-height: 70vh;
  overflow-y: auto;
  padding: 4px; /* 为滚动条留出空间 */
}

.help-section {
  margin-bottom: 28px;
  padding: 20px;
  background: var(--bg-secondary);
  border-radius: 12px;
  border: 1px solid var(--border-primary);
  transition: all 0.2s ease;
}

.help-section:hover {
  border-color: rgba(24, 160, 88, 0.3);
  box-shadow: 0 2px 8px rgba(24, 160, 88, 0.08);
}

.help-section:last-child {
  margin-bottom: 0;
}

.help-section h4 {
  margin: 0 0 16px 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 12px;
  border-bottom: 2px solid rgba(24, 160, 88, 0.2);
}

.help-section p {
  margin: 0 0 12px 0;
  font-size: 14px;
  line-height: 1.8;
  color: var(--text-secondary);
}

.help-section p:last-child {
  margin-bottom: 0;
}

.help-section ul {
  margin: 8px 0 0 0;
  padding-left: 24px;
}

.help-section li {
  font-size: 14px;
  line-height: 2;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.help-section li:last-child {
  margin-bottom: 0;
}

.help-section li strong {
  color: #18a058;
  font-weight: 600;
}

.command-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.command-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  transition: all 0.2s ease;
}

.command-item:hover {
  border-color: rgba(24, 160, 88, 0.4);
  transform: translateX(4px);
  box-shadow: 0 2px 8px rgba(24, 160, 88, 0.1);
}

.command-item code {
  min-width: 160px;
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-size: 13px;
  font-weight: 600;
  color: #18a058;
  background: rgba(24, 160, 88, 0.1);
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid rgba(24, 160, 88, 0.2);
}

[data-theme="dark"] .command-item code {
  background: rgba(24, 160, 88, 0.15);
  border-color: rgba(24, 160, 88, 0.3);
  color: #36ad6a;
}

.command-item span {
  font-size: 14px;
  color: var(--text-secondary);
  flex: 1;
}

.help-section kbd {
  display: inline-block;
  padding: 3px 8px;
  font-family: 'SF Mono', Monaco, monospace;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  background: var(--bg-primary);
  border: 1px solid var(--border-secondary);
  border-radius: 4px;
  box-shadow: 0 2px 0 var(--border-primary), 0 1px 2px rgba(0, 0, 0, 0.1);
  margin: 0 2px;
}

[data-theme="dark"] .help-section kbd {
  background: var(--bg-elevated);
  box-shadow: 0 2px 0 var(--border-secondary), 0 1px 2px rgba(0, 0, 0, 0.3);
}

.link-list {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
}

.link-list a {
  font-size: 14px;
  font-weight: 500;
  color: #18a058;
  text-decoration: none;
  padding: 6px 12px;
  border-radius: 6px;
  background: rgba(24, 160, 88, 0.08);
  border: 1px solid rgba(24, 160, 88, 0.2);
  transition: all 0.2s ease;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.link-list a:hover {
  background: rgba(24, 160, 88, 0.15);
  border-color: rgba(24, 160, 88, 0.4);
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(24, 160, 88, 0.2);
}

.link-list a::before {
  content: '→';
  font-weight: 700;
}

[data-theme="dark"] .link-list a {
  background: rgba(24, 160, 88, 0.12);
  border-color: rgba(24, 160, 88, 0.3);
}

[data-theme="dark"] .link-list a:hover {
  background: rgba(24, 160, 88, 0.2);
  border-color: rgba(24, 160, 88, 0.5);
}
</style>
