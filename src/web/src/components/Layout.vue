<template>
  <div class="layout">
    <!-- 环境变量冲突弹窗 -->
    <EnvConflictModal
      v-model:visible="showEnvModal"
      :conflicts="envConflicts"
      @deleted="handleEnvDeleted"
      @close="showEnvModal = false"
      @ignore="handleEnvIgnore"
      @never-remind="handleEnvNeverRemind"
    />

    <!-- Global Header -->
    <header class="header">
      <div class="logo-section" @click="goHome">
        <div class="logo-wrapper">
          <img src="/logo.png" alt="Coding Tool Logo" class="logo-image" />
        </div>
        <div class="title-group">
          <h1 class="title-main">Coding-Tool</h1>
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
          <span class="nav-label">Home</span>
        </div>
        <div
          class="nav-tab"
          :class="{ active: currentChannel === 'claude' }"
          @click="router.push({ name: 'claude-projects' })"
        >
          <n-icon :size="18" class="nav-icon">
            <ChatboxEllipsesOutline />
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
        <div
          class="nav-tab"
          :class="{ active: currentChannel === 'gemini' }"
          @click="router.push({ name: 'gemini-projects' })"
        >
          <n-icon :size="18" class="nav-icon">
            <SparklesOutline />
          </n-icon>
          <span class="nav-label">Gemini</span>
        </div>
      </div>

      <div class="header-actions">
        <!-- Env Conflict Warning -->
        <n-tooltip v-if="envConflicts.length > 0" trigger="hover">
          <template #trigger>
            <div class="env-warning-btn" @click="showEnvModal = true">
              <n-icon :size="18" class="env-warning-icon">
                <WarningOutline />
              </n-icon>
              <span class="env-warning-count">{{ envConflicts.length }}</span>
            </div>
          </template>
          检测到 {{ envConflicts.length }} 个环境变量冲突，点击查看
        </n-tooltip>

        <!-- Update Notification -->
        <div v-if="updateInfo" class="update-notification">
          <div class="update-badge" @click="handleUpdateClick">
            <n-icon :size="18">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="currentColor">
                <path d="M256 48C141.13 48 48 141.13 48 256s93.13 208 208 208 208-93.13 208-208S370.87 48 256 48zm-80 288v-32h160v32H176zm48-112h-48v-32h48v-48h32v48h48v32h-48v48h-32v-48z"/>
              </svg>
            </n-icon>
            <span class="update-text">有更新</span>
          </div>
        </div>

        <!-- Theme Toggle -->
        <HeaderButton
          :icon="isDark ? SunnyOutline : MoonOutline"
          :tooltip="isDark ? '切换到亮色主题' : '切换到暗色主题'"
          @click="toggleTheme"
        />

        <!-- Favorites Button -->
        <div class="favorites-button-wrapper">
          <HeaderButton
            :icon="BookmarkOutline"
            :tooltip="`我的收藏 (${totalFavorites})`"
            @click="showFavoritesDrawer = true"
          />
          <div v-if="totalFavorites > 0" class="favorites-badge">
            {{ totalFavorites }}
          </div>
        </div>

        <!-- Prompts Button -->
        <HeaderButton
          :icon="ChatboxOutline"
          tooltip="Prompts 管理"
          @click="showPromptsDrawer = true"
        />

        <!-- MCP Button -->
        <HeaderButton
          :icon="ExtensionPuzzleOutline"
          tooltip="MCP 服务器管理"
          @click="showMcpDrawer = true"
        />

        <!-- Speed Test Button -->
        <HeaderButton
          :icon="SpeedometerOutline"
          tooltip="渠道速度测试"
          @click="showSpeedTestDrawer = true"
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

      <!-- Left Content Area (Router View) -->
      <div class="left-content">
        <router-view />
      </div>

      <!-- Right Panel (Global) - Only show if not on home page and at least one panel is enabled -->
      <!-- 首页不显示过渡动画，避免页面从窄变宽的卡顿感 -->
      <RightPanel
        v-if="shouldShowRightPanel"
        :show-channels="showChannels"
        :show-logs="showLogs"
        :proxy-running="effectiveProxyRunning"
        :proxy-loading="effectiveProxyLoading"
        @proxy-toggle="handleProxyToggle"
        @show-recent="showRecentDrawer = true"
      />
    </div>

    <!-- Recent Sessions Drawer -->
    <RecentSessionsDrawer v-model:visible="showRecentDrawer" :channel="currentChannel" />

    <!-- Favorites Drawer -->
    <FavoritesDrawer v-model:visible="showFavoritesDrawer" />

    <!-- Settings Drawer -->
    <SettingsDrawer v-model:visible="showSettingsDrawer" />

    <!-- MCP Drawer -->
    <McpDrawer v-model:visible="showMcpDrawer" />

    <!-- Prompts Drawer -->
    <PromptsDrawer v-model:visible="showPromptsDrawer" />

    <!-- Speed Test Drawer -->
    <SpeedTestDrawer v-model:visible="showSpeedTestDrawer" />

    <!-- Help Modal -->
    <n-modal v-model:show="showHelpModal" preset="card" title="CODING-TOOL 使用帮助" style="width: 800px; max-width: 90vw;">
      <div class="help-content">
        <div class="help-section">
          <h4>🚀 快速开始</h4>
          <p>CODING-TOOL 是 AI 编程工具的增强管理助手，支持 Claude Code、Codex 和 Gemini 三种 AI 工具，提供智能会话管理、动态渠道切换、全局搜索和实时监控功能。</p>

          <h5 style="margin: 12px 0 8px 0; font-size: 13px; color: #18a058;">⭐ 最简单的启动方式：</h5>
          <div style="background: var(--bg-primary); padding: 12px; border-radius: 6px; margin: 8px 0; border-left: 3px solid #18a058;">
            <p style="margin: 0; font-family: 'Courier New', monospace; font-size: 13px; font-weight: 600; color: var(--primary-color);">ct start</p>
            <p style="margin: 4px 0 0 0; font-size: 12px; color: var(--text-secondary);">• 后台启动所有服务<br/>• 可以关闭终端窗口<br/>• 代理服务保持运行</p>
          </div>

          <h5 style="margin: 12px 0 8px 0; font-size: 13px; color: #18a058;">📋 日常工作流：</h5>
          <div style="font-size: 12px; line-height: 1.8; color: var(--text-secondary);">
            <code style="background: var(--bg-primary); padding: 2px 6px; border-radius: 3px; color: var(--primary-color);">ct start</code> 启动服务<br/>
            <code style="background: var(--bg-primary); padding: 2px 6px; border-radius: 3px; color: var(--primary-color);">ct status</code> 查看状态<br/>
            <code style="background: var(--bg-primary); padding: 2px 6px; border-radius: 3px; color: var(--primary-color);">ct logs</code> 查看日志<br/>
            <code style="background: var(--bg-primary); padding: 2px 6px; border-radius: 3px; color: var(--primary-color);">ct stop</code> 停止服务
          </div>
        </div>

        <div class="help-section">
          <h4>🤖 支持的 AI 工具</h4>
          <ul>
            <li><strong>Claude Code</strong>：Anthropic 官方命令行工具，支持 Claude 系列模型</li>
            <li><strong>Codex</strong>：支持 OpenAI GPT 系列和 Claude 模型（通过 OpenAI 兼容格式）</li>
            <li><strong>Gemini</strong>：支持 Google Gemini 系列模型</li>
          </ul>
        </div>

        <div class="help-section">
          <h4>📋 命令行用法</h4>

          <h5 style="margin: 16px 0 8px 0; font-size: 14px; color: var(--primary-color);">🚀 服务管理</h5>
          <div class="command-list">
            <div class="command-item">
              <code>ct start</code>
              <span>后台启动所有服务（推荐）</span>
            </div>
            <div class="command-item">
              <code>ct stop</code>
              <span>停止所有服务</span>
            </div>
            <div class="command-item">
              <code>ct restart</code>
              <span>重启所有服务</span>
            </div>
            <div class="command-item">
              <code>ct status</code>
              <span>查看服务状态</span>
            </div>
          </div>

          <h5 style="margin: 16px 0 8px 0; font-size: 14px; color: var(--primary-color);">🔌 代理管理</h5>
          <div class="command-list">
            <div class="command-item">
              <code>ct claude start</code>
              <span>启动 Claude 代理</span>
            </div>
            <div class="command-item">
              <code>ct codex start</code>
              <span>启动 Codex 代理</span>
            </div>
            <div class="command-item">
              <code>ct gemini start</code>
              <span>启动 Gemini 代理</span>
            </div>
            <div class="command-item">
              <code>ct claude stop</code>
              <span>停止指定代理（支持 stop/restart/status）</span>
            </div>
          </div>

          <h5 style="margin: 16px 0 8px 0; font-size: 14px; color: var(--primary-color);">📋 日志管理</h5>
          <div class="command-list">
            <div class="command-item">
              <code>ct logs</code>
              <span>查看所有日志</span>
            </div>
            <div class="command-item">
              <code>ct logs claude</code>
              <span>查看 Claude 日志（支持 ui/codex/gemini）</span>
            </div>
            <div class="command-item">
              <code>ct logs --follow</code>
              <span>实时跟踪日志</span>
            </div>
            <div class="command-item">
              <code>ct logs --clear</code>
              <span>清空日志</span>
            </div>
          </div>

          <h5 style="margin: 16px 0 8px 0; font-size: 14px; color: var(--primary-color);">📊 其他命令</h5>
          <div class="command-list">
            <div class="command-item">
              <code>ct stats</code>
              <span>查看统计信息</span>
            </div>
            <div class="command-item">
              <code>ct doctor</code>
              <span>系统诊断</span>
            </div>
            <div class="command-item">
              <code>ct update</code>
              <span>检查更新</span>
            </div>
            <div class="command-item">
              <code>ct -h</code>
              <span>完整帮助</span>
            </div>
          </div>
        </div>

        <div class="help-section">
          <h4>🎯 Web UI 功能</h4>
          <ul>
            <li><strong>多类型支持</strong>：统一管理 Claude Code、Codex、Gemini 三种工具的项目和会话</li>
            <li><strong>项目管理</strong>：查看所有项目，支持拖拽排序、搜索过滤、删除项目</li>
            <li><strong>会话管理</strong>：查看项目会话列表，支持搜索、Fork、删除、重命名</li>
            <li><strong>快速启动</strong>：点击会话直接在终端中启动对应的 AI 工具</li>
            <li><strong>动态切换</strong>：每种工具独立的渠道管理，可在右侧面板快速切换 API 渠道</li>
            <li><strong>实时日志</strong>：查看各类型代理的实时请求日志、token 消耗和成本统计</li>
            <li><strong>全局搜索</strong>：使用 <kbd>⌘/Ctrl</kbd> + <kbd>K</kbd> 在所有项目中搜索对话内容</li>
          </ul>
        </div>

        <div class="help-section">
          <h4>⚡ 代理服务与渠道管理</h4>
          <p>每种 AI 工具都有独立的代理服务和渠道配置：</p>
          <ul>
            <li><strong>Claude 代理</strong>：端口 10088，支持 Anthropic API 格式</li>
            <li><strong>Codex 代理</strong>：端口 10089，支持 OpenAI API 格式（兼容 Claude）</li>
            <li><strong>Gemini 代理</strong>：端口 10090，支持 Gemini API 格式</li>
          </ul>
          <p>在 Dashboard 或各工具详情页，可以添加多个渠道并快速切换，无需修改配置文件或重启工具。</p>
        </div>

        <div class="help-section">
          <h4>⭐ 后台启动与开机自启</h4>

          <h5 style="margin: 12px 0 8px 0; font-size: 13px; color: #18a058;">后台启动服务</h5>
          <p style="font-size: 12px; line-height: 1.8;">使用 <code style="background: var(--bg-primary); padding: 2px 6px;">ct start</code> 命令后台启动所有服务，可以安全关闭终端窗口而不影响代理服务的运行。</p>

          <h5 style="margin: 12px 0 8px 0; font-size: 13px; color: #18a058;">配置开机自启（可选）</h5>
          <p style="font-size: 12px; color: var(--text-secondary); margin: 0 0 8px 0;">第一次启用开机自启只需三个步骤：</p>
          <div style="background: var(--bg-primary); padding: 12px; border-radius: 6px; margin: 8px 0; border-left: 3px solid #18a058; font-family: 'Courier New', monospace; font-size: 11px; line-height: 1.8; color: var(--text-secondary);">
            # 第 1 步：启用 PM2 开机自启<br/>
            <span style="color: var(--primary-color);">pm2 startup</span><br/>
            <br/>
            # 第 2 步：保存配置<br/>
            <span style="color: var(--primary-color);">pm2 save</span><br/>
            <br/>
            # 第 3 步：重启电脑，服务自动启动 ✓
          </div>

          <h5 style="margin: 12px 0 8px 0; font-size: 13px; color: #18a058;">相关命令</h5>
          <div style="font-size: 12px; color: var(--text-secondary); line-height: 1.8;">
            <code style="background: var(--bg-primary); padding: 2px 6px;">ct start</code> 后台启动<br/>
            <code style="background: var(--bg-primary); padding: 2px 6px;">ct status</code> 查看状态<br/>
            <code style="background: var(--bg-primary); padding: 2px 6px;">ct logs</code> 查看日志<br/>
            <code style="background: var(--bg-primary); padding: 2px 6px;">pm2 list</code> 查看所有后台进程<br/>
            <code style="background: var(--bg-primary); padding: 2px 6px;">pm2 unstartup</code> 禁用开机自启
          </div>

          <p style="color: #18a058; font-size: 12px; margin-top: 8px;">💡 提示：配置开机自启后，重启电脑时 Coding-Tool 会自动启动，无需手动运行命令。</p>
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
import { ref, computed, onMounted, onUnmounted, h } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { NTooltip, NSwitch, NSpin, NModal, NIcon } from 'naive-ui'
import { ChatbubblesOutline, ServerOutline, TerminalOutline, LogoGithub, HelpCircleOutline, MoonOutline, SunnyOutline, SettingsOutline, HomeOutline, ChatboxEllipsesOutline, CodeSlashOutline, SparklesOutline, BookmarkOutline, ExtensionPuzzleOutline, ChatboxOutline, SpeedometerOutline, WarningOutline } from '@vicons/ionicons5'
import RightPanel from './RightPanel.vue'
import RecentSessionsDrawer from './RecentSessionsDrawer.vue'
import FavoritesDrawer from './FavoritesDrawer.vue'
import SettingsDrawer from './SettingsDrawer.vue'
import McpDrawer from './McpDrawer.vue'
import PromptsDrawer from './PromptsDrawer.vue'
import SpeedTestDrawer from './SpeedTestDrawer.vue'
import HeaderButton from './HeaderButton.vue'
import UpdateDialog from './UpdateDialog.vue'
import EnvConflictModal from './EnvConflictModal.vue'
import { updateNestedUIConfig } from '../api/ui-config'
import { checkForUpdates as checkForUpdatesApi, getChangelog } from '../api/version'
import { checkEnvConflicts } from '../api/env'
import message, { dialog } from '../utils/message'
import { useTheme } from '../composables/useTheme'
import { useGlobalState } from '../composables/useGlobalState'
import { useFavorites } from '../composables/useFavorites'
import { useDashboard } from '../composables/useDashboard'

// 使用主题 composable
const { isDark, toggleTheme } = useTheme()

// 使用全局状态 composable
const {
  claudeProxy,
  codexProxy,
  geminiProxy,
  startProxy,
  stopProxy
} = useGlobalState()

// 使用收藏功能
const { totalFavorites } = useFavorites()

// 使用 dashboard 聚合数据
const { dashboardData, isLoading: dashboardLoading, loadDashboard } = useDashboard()

const router = useRouter()
const route = useRoute()

// 导航状态
const currentRoute = computed(() => route.name)
const currentChannel = computed(() => route.meta.channel || null)

// 是否显示右侧面板（首页不显示）
const shouldShowRightPanel = computed(() => {
  return currentChannel.value && (showChannels.value || (showLogs.value && effectiveProxyRunning.value))
})

const showRecentDrawer = ref(false)
const showFavoritesDrawer = ref(false)
const showSettingsDrawer = ref(false)
const showMcpDrawer = ref(false)
const showPromptsDrawer = ref(false)
const showSpeedTestDrawer = ref(false)
const showHelpModal = ref(false)

// 环境变量冲突检测
const envConflicts = ref([])
const showEnvModal = ref(false)

// 检测环境变量冲突
async function checkEnvConflictsOnLoad() {
  try {
    const result = await checkEnvConflicts()
    if (result.success && result.conflicts?.length > 0) {
      envConflicts.value = result.conflicts

      // 检查是否用户选择了"不再提醒"，如果没有则自动弹出
      const neverRemind = localStorage.getItem('envConflictNeverRemind')
      if (neverRemind !== 'true') {
        showEnvModal.value = true
      }
    }
  } catch (err) {
    console.error('Check env conflicts failed:', err)
  }
}

// 处理删除后
async function handleEnvDeleted() {
  try {
    const result = await checkEnvConflicts()
    if (result.success) {
      envConflicts.value = result.conflicts || []
      if (envConflicts.value.length === 0) {
        showEnvModal.value = false
      }
    }
  } catch (err) {
    console.error('Recheck env conflicts failed:', err)
  }
}

// 暂时忽略
function handleEnvIgnore() {
  showEnvModal.value = false
}

// 不再提醒（只是不自动弹出，顶部图标还在）
function handleEnvNeverRemind() {
  showEnvModal.value = false
  localStorage.setItem('envConflictNeverRemind', 'true')
}
const globalLoading = ref(false) // 全局 loading 状态
const updateInfo = ref(null) // 版本更新信息

// ===== 临时测试：用于本地 mock 更新弹窗 =====
// 如果需要测试更新弹窗效果，取消下面的注释即可
// updateInfo.value = { current: '1.5.3', latest: '1.5.2', hasUpdate: true }
// ============================================

// 根据当前 channel 计算有效的代理状态
const effectiveProxyRunning = computed(() => {
  if (currentChannel.value === 'codex') return codexProxy.value.running
  if (currentChannel.value === 'gemini') return geminiProxy.value.running
  return claudeProxy.value.running
})
const effectiveProxyLoading = computed(() => {
  if (currentChannel.value === 'codex') return codexProxy.value.loading
  if (currentChannel.value === 'gemini') return geminiProxy.value.loading
  return claudeProxy.value.loading
})

// Panel visibility settings (with file persistence)
const showChannels = ref(true)
const showLogs = ref(true)

// Load panel visibility from server using dashboard API
async function loadPanelSettings() {
  try {
    const data = await loadDashboard()
    if (data && data.uiConfig) {
      showChannels.value = data.uiConfig.panelVisibility?.showChannels !== false
      showLogs.value = data.uiConfig.panelVisibility?.showLogs !== false
    }
  } catch (err) {
    console.error('Failed to load dashboard data:', err)
  }
}

// Save panel visibility to server
async function savePanelSettings() {
  try {
    await updateNestedUIConfig('panelVisibility', 'showChannels', showChannels.value)
    await updateNestedUIConfig('panelVisibility', 'showLogs', showLogs.value)
  } catch (err) {
    console.error('Failed to save panel settings:', err)
  }
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

// 统一的代理切换处理器（根据当前 channel 路由到正确的代理）
async function handleProxyToggle(newValue) {
  const channelType = currentChannel.value || 'claude'

  try {
    let result
    if (newValue) {
      result = await startProxy(channelType)
    } else {
      result = await stopProxy(channelType)
    }

    // 处理结果
    if (result.success !== false) {
      message.success(newValue ? '代理已启动' : '代理已停止')
      // 自动展示/隐藏日志面板
      if (newValue) {
        showLogs.value = true
      }
      savePanelSettings()
    } else {
      message.error(result.error || '操作失败')
    }
  } catch (error) {
    message.error(error.response?.data?.error || error.message || '操作失败')
  }
}

// 监听来自 SettingsDrawer 的面板可见性变化
function handlePanelVisibilityChange(event) {
  const { showChannels: newShowChannels, showLogs: newShowLogs } = event.detail
  showChannels.value = newShowChannels
  showLogs.value = newShowLogs
}

// 检查版本更新
async function checkForUpdates() {
  try {
    const result = await checkForUpdatesApi()
    if (result.hasUpdate && !result.error) {
      updateInfo.value = result
    }
  } catch (err) {
    // 静默失败，不影响用户体验
    console.error('Version check failed:', err)
  }
}

// 处理更新点击
async function handleUpdateClick() {
  if (!updateInfo.value) return

  // 获取更新日志
  let changelogData = null
  try {
    const result = await getChangelog(updateInfo.value.latest)
    if (result.success) {
      changelogData = result.changelog
    }
  } catch (err) {
    console.error('Failed to load changelog:', err)
  }

  // 使用 dialog.create 方法显示更新弹窗
  dialog.create({
    title: '✨ 发现新版本',
    content: () => h(UpdateDialog, {
      currentVersion: updateInfo.value.current,
      latestVersion: updateInfo.value.latest,
      changelog: changelogData
    }),
    maskClosable: true,
    closable: true,
    showIcon: false,
    style: {
      width: '580px'
    }
  })
}

onMounted(() => {
  // 加载面板可见性设置
  loadPanelSettings()

  // 监听面板可见性变化事件
  window.addEventListener('panel-visibility-change', handlePanelVisibilityChange)

  // 检测环境变量冲突
  checkEnvConflictsOnLoad()

  // 延迟检查版本更新，等页面完全加载后再执行
  // 使用 requestIdleCallback 在浏览器空闲时执行，或者延迟到 2 秒后
  if (window.requestIdleCallback) {
    window.requestIdleCallback(() => {
      checkForUpdates().catch(err => {
        console.warn('Version check failed:', err)
      })
    })
  } else {
    // 降级方案：延迟 2 秒后执行
    setTimeout(() => {
      checkForUpdates().catch(err => {
        console.warn('Version check failed:', err)
      })
    }, 2000)
  }
})

onUnmounted(() => {
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

.env-warning-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  background: rgba(245, 158, 11, 0.12);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.env-warning-btn:hover {
  background: rgba(245, 158, 11, 0.2);
}

.env-warning-icon {
  color: #f59e0b;
}

.env-warning-count {
  font-size: 12px;
  font-weight: 600;
  color: #f59e0b;
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
  gap: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
  padding: 6px 12px;
  border-radius: 6px;
  margin-left: -12px;
}

.logo-section:hover {
  background: var(--hover-bg);
}

.logo-wrapper {
  width: 36px;
  height: 36px;
  border-radius: 6px;
  background: linear-gradient(135deg, rgba(24, 160, 88, 0.15) 0%, rgba(24, 160, 88, 0.05) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(24, 160, 88, 0.15);
  transition: all 0.2s ease;
}

.logo-section:hover .logo-wrapper {
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(24, 160, 88, 0.25);
}

.logo-image {
  width: 24px;
  height: 24px;
  object-fit: contain;
}

.title-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.title-main {
  margin: 0;
  font-size: 18px;
  font-weight: 800;
  background: linear-gradient(135deg, #18a058 0%, #10b981 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  user-select: none;
  letter-spacing: -0.3px;
  line-height: 1.2;
}

.title-sub {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-tertiary);
  user-select: none;
  letter-spacing: 0.2px;
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
  border-radius: 6px;
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
  height: calc(100vh - 64px);
  min-height: 0;
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
  height: 100%;
  overflow: hidden;
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
  border-radius: 8px;
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

/* 更新提示样式 */
.update-notification {
  margin-right: 8px;
}

.update-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(251, 146, 60, 0.15));
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  animation: pulse-update 2s ease-in-out infinite;
}

.update-badge:hover {
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.25), rgba(251, 146, 60, 0.25));
  border-color: rgba(245, 158, 11, 0.5);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
}

.update-badge .n-icon {
  color: #f59e0b;
}

.update-text {
  font-size: 12px;
  font-weight: 600;
  color: #f59e0b;
  white-space: nowrap;
}

@keyframes pulse-update {
  0%, 100% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.4);
  }
  50% {
    transform: scale(1.02);
    box-shadow: 0 0 0 6px rgba(245, 158, 11, 0);
  }
}

[data-theme="dark"] .update-badge {
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(251, 146, 60, 0.2));
  border-color: rgba(245, 158, 11, 0.4);
}

[data-theme="dark"] .update-badge:hover {
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.3), rgba(251, 146, 60, 0.3));
  border-color: rgba(245, 158, 11, 0.6);
}

/* 收藏按钮样式 */
.favorites-button-wrapper {
  position: relative;
}

.favorites-badge {
  position: absolute;
  top: -2px;
  right: -6px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #ff4d4f;
  color: white;
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  border-radius: 8px;
  box-shadow: 0 0 0 2px var(--bg-primary);
  pointer-events: none;
}

/* 版本更新对话框样式 */
:deep(.n-dialog__action) {
  display: none;
}
</style>
