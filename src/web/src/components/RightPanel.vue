<template>
  <div class="right-panel">
    <!-- 上半部分：API 渠道管理 -->
    <div v-if="showChannels" class="channels-section" :class="{ 'full-height': !showLogs || !proxyRunning }">
      <!-- 动作按钮区域 -->
      <div class="actions-section">
        <div class="action-buttons">
          <!-- 代理切换 -->
          <div class="action-item">
            <n-text depth="3" style="font-size: 13px; margin-right: 8px;">动态切换</n-text>
            <n-switch
              :value="proxyRunning"
              :loading="proxyLoading"
              size="small"
              @update:value="handleProxyToggle"
            />
          </div>

          <!-- 最近对话 -->
          <n-tooltip trigger="hover">
            <template #trigger>
              <n-button
                text
                size="small"
                @click="handleShowRecent"
                class="recent-sessions-icon-btn"
              >
                <template #icon>
                  <n-icon :size="18"><ChatbubblesOutline /></n-icon>
                </template>
              </n-button>
            </template>
            最新对话
          </n-tooltip>
        </div>
      </div>

      <!-- 固定的标题栏 -->
      <div class="panel-header">
        <div class="header-title">
          <h3>{{ channelTitle }}</h3>
          <n-text depth="3" style="font-size: 12px; margin-left: 8px;">拖拽可调整顺序</n-text>
        </div>
        <n-button type="primary" size="small" @click="handleAddClick">
          <template #icon>
            <n-icon><AddOutline /></n-icon>
          </template>
          添加渠道
        </n-button>
      </div>

      <!-- 可滚动的渠道列表区域 -->
      <div class="channels-scroll-area">
        <!-- Claude 渠道列表 -->
        <template v-if="currentChannel === 'claude'">
          <ClaudeChannelPanel ref="claudePanelRef" @open-website="openWebsite" />
        </template>

        <template v-else-if="currentChannel === 'codex'">
          <CodexChannelPanel ref="codexPanelRef" @open-website="openWebsite" />
        </template>
        <template v-else-if="currentChannel === 'gemini'">
          <GeminiChannelPanel ref="geminiPanelRef" @open-website="openWebsite" />
        </template>
      </div>
    </div>

    <!-- 下半部分：实时日志（用户开启日志显示时显示） -->
    <div
      v-if="showLogs"
      class="logs-section"
      :class="{ 'full-height': !showChannels }"
    >
      <ProxyLogs :source="currentChannel" />
    </div>

  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  NButton, NIcon, NText, NSwitch, NTooltip
} from 'naive-ui'
import { AddOutline, ChatbubblesOutline } from '@vicons/ionicons5'
import ClaudeChannelPanel from './channel/ClaudeChannelPanel.vue'
import CodexChannelPanel from './channel/CodexChannelPanel.vue'
import GeminiChannelPanel from './channel/GeminiChannelPanel.vue'
import ProxyLogs from './ProxyLogs.vue'
import { useGlobalStore } from '../stores/global'

const route = useRoute()
const globalStore = useGlobalStore()

// Props for panel visibility
defineProps({
  showChannels: {
    type: Boolean,
    default: true
  },
  showLogs: {
    type: Boolean,
    default: true
  },
  proxyRunning: {
    type: Boolean,
    default: false
  },
  proxyLoading: {
    type: Boolean,
    default: false
  }
})

// Emits
const emit = defineEmits(['proxy-toggle', 'show-recent'])

// Get current channel from route
const currentChannel = computed(() => route.meta.channel || 'claude')

const claudePanelRef = ref(null)
const codexPanelRef = ref(null)
const geminiPanelRef = ref(null)

const channelRefs = {
  claude: claudePanelRef,
  codex: codexPanelRef,
  gemini: geminiPanelRef
}

const channelTitles = {
  claude: 'Claude 渠道管理',
  codex: 'Codex 渠道管理',
  gemini: 'Gemini 渠道管理'
}

const channelTitle = computed(() => channelTitles[currentChannel.value] || 'Claude 渠道管理')

function openWebsite(url) {
  window.open(url, '_blank')
}

function handleAddClick() {
  channelRefs[currentChannel.value]?.value?.openAddDialog?.()
}

// 处理代理切换
function handleProxyToggle(value) {
  emit('proxy-toggle', value)
}

// 处理显示最近对话
function handleShowRecent() {
  emit('show-recent')
}

function refreshChannel(channel) {
  channelRefs[channel]?.value?.refresh?.()
}

watch(() => currentChannel.value, refreshChannel)
</script>

<style scoped>
.right-panel {
  width: 520px;
  min-width: 520px;
  border-left: 1px solid var(--border-primary);
  background: var(--gradient-bg);
  height: 100vh;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.03);
}

/* 动作按钮区域 */
.actions-section {
  flex-shrink: 0;
  padding: 16px 18px 12px 18px;
  border-bottom: 1px solid var(--border-primary);
  background: var(--gradient-card);
}

.action-buttons {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.action-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.action-item :deep(.n-switch) {
  flex-shrink: 0;
}

.recent-sessions-icon-btn {
  padding: 6px !important;
  border-radius: 8px;
  transition: all 0.2s ease;
  color: var(--text-secondary);
}

.recent-sessions-icon-btn:hover {
  background: var(--hover-bg);
  color: #18a058;
  transform: scale(1.1);
}

[data-theme="dark"] .recent-sessions-icon-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #34d399;
}

/* 上半部分：API 渠道管理 */
.channels-section {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: flex 0.3s ease-out, min-height 0.3s ease-out, max-height 0.3s ease-out;
}

/* 当渠道列表占据全部高度时（日志面板隐藏或代理未运行） */
.channels-section.full-height {
  flex: 1;
  min-height: 0;
  max-height: none;
}

/* 固定的标题栏 */
.panel-header {
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px 18px 16px 18px;
  background: var(--gradient-card);
  border-bottom: 1px solid var(--border-primary);
  position: relative;
}

.panel-header::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 18px;
  right: 18px;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(24, 160, 88, 0.08), transparent);
}

.header-title {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

/* 可滚动的渠道列表区域 */
.channels-scroll-area {
  flex: 1;
  min-height: 0;
  padding: 12px;
  overflow-y: auto;
  overflow-x: hidden;
}

/* 下半部分：实时日志 */
.logs-section {
  flex: 0 0 400px;
  min-height: 400px;
  max-height: 400px;
  overflow: hidden;
  transition: flex 0.3s ease-out, min-height 0.3s ease-out, max-height 0.3s ease-out;
}

/* 当日志面板占据全部高度时（渠道列表隐藏） */
.logs-section.full-height {
  flex: 1;
  min-height: 0;
  max-height: none;
}

.panel-header h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.3px;
}

.panel-header :deep(.n-button--primary-type) {
  border-radius: 8px;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(24, 160, 88, 0.25);
}

.panel-header :deep(.n-button--primary-type:hover) {
  box-shadow: 0 4px 12px rgba(24, 160, 88, 0.35);
  transform: translateY(-1px);
}

</style>
