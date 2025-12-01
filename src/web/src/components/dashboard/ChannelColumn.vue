<template>
  <div class="channel-column">
    <!-- 渠道头部 -->
    <div class="channel-header" :class="channelType">
      <!-- 拖拽手柄 -->
      <div class="drag-handle" title="拖拽排序">
        <n-icon :size="16">
          <ReorderTwoOutline />
        </n-icon>
      </div>

      <div class="header-icon">
        <n-icon :size="20">
          <component :is="channelIcon" />
        </n-icon>
      </div>
      <h2 class="channel-title">{{ channelTitle }}</h2>

      <!-- 锁定按钮 -->
      <n-button
        text
        class="lock-button"
        @click="toggleLock"
        :title="isLocked ? '解锁此列' : '锁定此列'"
      >
        <template #icon>
          <n-icon :size="18">
            <LockClosed v-if="isLocked" />
            <LockOpen v-else />
          </n-icon>
        </template>
      </n-button>
    </div>

    <!-- 滚动内容区 -->
    <div v-if="!isLocked" class="channel-content">
      <!-- 代理控制 -->
      <div class="card">
        <div class="card-header">
          <n-icon :size="16">
            <PowerOutline />
          </n-icon>
          <h3 class="card-title">代理控制</h3>
          <span v-if="proxyState.running && runtimeDisplay" class="runtime-badge">
            {{ runtimeDisplay }}
          </span>
          <n-switch
            v-model:value="proxyState.running"
            @update:value="handleProxyToggle"
            :loading="proxyState.loading"
            size="small"
            style="margin-left: auto;"
          />
        </div>
        <div class="card-body" style="padding: 6px 10px;">
          <div class="proxy-info-row">
            <div class="proxy-status">
              <div class="status-dot" :class="{ active: proxyState.running }"></div>
              <n-text :type="proxyState.running ? 'success' : 'default'" style="font-size: 12px;">
                {{ proxyState.running ? '运行中' : '已停止' }}
              </n-text>
              <span class="proxy-port">端口: {{ proxyState.port }}</span>
            </div>
            <n-popover trigger="click" placement="bottom" :width="320" class="channel-popover">
              <template #trigger>
                <n-button text size="tiny" class="channel-status">
                  <span class="channel-name">{{ statusText }}</span>
                </n-button>
              </template>
              <div class="channel-quick-panel">
                <div class="panel-title">
                  <span>渠道快捷管理</span>
                  <n-text depth="3" style="font-size: 11px;">点击开关切换状态</n-text>
                </div>
                <div v-if="channels.length === 0" class="no-channels">
                  <n-text depth="3">暂无配置渠道</n-text>
                </div>
                <div v-else class="channel-quick-list">
                  <div
                    v-for="channel in channels"
                    :key="channel.id"
                    class="channel-quick-item"
                    :class="{ disabled: channel.enabled === false }"
                  >
                    <div class="channel-quick-info">
                      <span class="channel-quick-name">{{ channel.name }}</span>
                      <n-tag v-if="channel.health?.status === 'frozen'" size="tiny" type="error" :bordered="false">
                        冻结
                      </n-tag>
                      <n-switch
                        size="small"
                        :value="channel.enabled !== false"
                        @update:value="value => handleQuickToggle(channel, value)"
                        style="margin-left: auto;"
                      />
                    </div>
                    <!-- 渠道统计指标 -->
                    <div class="channel-metrics">
                      <span class="metric-item">
                        <span class="metric-label">请求</span>
                        <span class="metric-value">{{ getChannelTodayStats(channel.id).requests }}</span>
                      </span>
                      <span class="metric-item">
                        <span class="metric-label">Tokens</span>
                        <span class="metric-value">{{ formatStatNumber(getChannelTodayStats(channel.id).tokens) }}</span>
                      </span>
                      <span class="metric-item">
                        <span class="metric-label">权重</span>
                        <span class="metric-value">{{ channel.weight || 1 }}</span>
                      </span>
                      <span class="metric-item">
                        <span class="metric-label">并发</span>
                        <span class="metric-value" :class="{ active: getChannelInflight(channel.id) > 0 }">
                          {{ getChannelInflight(channel.id) }}{{ channel.maxConcurrency ? `/${channel.maxConcurrency}` : '' }}
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </n-popover>
          </div>
        </div>
      </div>

      <!-- 快速访问 -->
      <div class="card">
        <div class="card-header compact">
          <n-icon :size="14">
            <RocketOutline />
          </n-icon>
          <h3 class="card-title">快速访问</h3>
        </div>
        <div class="card-body" style="padding: 8px 10px;">
          <div class="quick-access-list">
            <div class="access-card access-card-projects clickable" @click="goToProjects">
              <div class="access-icon">
                <n-icon :size="16"><FolderOutline /></n-icon>
              </div>
              <div class="access-content">
                <span class="access-label">项目</span>
                <span class="access-value">{{ stats.projects }}</span>
              </div>
            </div>
            <div class="access-card access-card-sessions clickable" @click="showRecentSessions = true">
              <div class="access-icon">
                <n-icon :size="16"><ChatbubblesOutline /></n-icon>
              </div>
              <div class="access-content">
                <span class="access-label">最新对话</span>
                <span class="access-value">{{ stats.sessions }}</span>
              </div>
            </div>
            <div class="access-card access-card-goto clickable" @click="goToChannelPage">
              <div class="access-icon">
                <n-icon :size="16"><ArrowForwardOutline /></n-icon>
              </div>
              <div class="access-content">
                <span class="access-label">前往</span>
                <span class="access-goto">{{ channelTypeName }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 今日数据 -->
      <div class="card stats-card" :class="`stats-card-${channelType}`">
        <div class="card-header compact">
          <n-icon :size="14">
            <TrendingUpOutline />
          </n-icon>
          <h3 class="card-title">今日数据</h3>
        </div>
        <div class="card-body" style="padding: 8px 10px;">
          <div class="stats-inline stats-3col">
            <div class="stat-inline-item stat-requests">
              <div class="stat-icon-dot requests"></div>
              <div class="stat-info">
                <span class="stat-label">请求</span>
                <span class="stat-value" :class="{ animating: isAnimating.requests }">{{ animatedStats.requests }}</span>
              </div>
            </div>
            <div class="stat-inline-item stat-input">
              <div class="stat-icon-dot tokens"></div>
              <div class="stat-info">
                <span class="stat-label">总 Tokens</span>
                <span class="stat-value" :class="{ animating: isAnimating.tokens }">{{ formatTokens(animatedStats.tokens) }}</span>
              </div>
            </div>
            <div class="stat-inline-item stat-output">
              <div class="stat-icon-dot cost"></div>
              <div class="stat-info">
                <span class="stat-label">成本 / USD</span>
                <span class="stat-value" :class="{ animating: isAnimating.cost }">{{ formatCurrency(animatedStats.cost) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 实时日志 -->
      <div v-if="showLogs" class="card logs-card">
        <div class="card-header compact">
          <n-icon :size="14">
            <RadioOutline />
          </n-icon>
          <h3 class="card-title">实时日志</h3>
          <n-button text size="tiny" @click="clearLogs" style="margin-left: auto;">
            <template #icon>
              <n-icon :size="14"><TrashOutline /></n-icon>
            </template>
          </n-button>
        </div>
        <div class="logs-table-wrapper">
          <!-- 表头 -->
          <div class="logs-table-header" :class="`logs-header-${channelType}`">
            <div class="log-col col-channel" :class="`col-channel-${channelType}`">渠道</div>
            <div class="log-col col-token" :class="`col-token-${channelType}`">请求</div>
            <div class="log-col col-token" :class="`col-token-${channelType}`">回复</div>
            <template v-if="channelType === 'claude'">
              <div class="log-col col-token" :class="`col-token-${channelType}`">写入</div>
              <div class="log-col col-token" :class="`col-token-${channelType}`">命中</div>
            </template>
            <template v-else-if="channelType === 'codex'">
              <div class="log-col col-token" :class="`col-token-${channelType}`">推理</div>
              <div class="log-col col-token" :class="`col-token-${channelType}`">缓存</div>
            </template>
            <template v-else-if="channelType === 'gemini'">
              <div class="log-col col-token" :class="`col-token-${channelType}`">缓存</div>
              <div class="log-col col-token" :class="`col-token-${channelType}`">总计</div>
            </template>
            <div class="log-col col-time" :class="`col-time-${channelType}`">时间</div>
          </div>
          <!-- 日志内容 -->
          <div class="logs-container" ref="logsContainer">
            <div v-if="logsToDisplay.length === 0" class="empty-logs">
              <n-icon :size="32" depth="3" style="margin-bottom: 8px;">
                <RadioOutline />
              </n-icon>
              <n-text depth="3" style="font-size: 12px; font-weight: 500;">暂无实时日志</n-text>
              <n-text depth="3" style="font-size: 11px; margin-top: 4px;">开启代理后将显示请求记录</n-text>
            </div>

            <div v-for="log in logsToDisplay" :key="log.id" class="log-row" :class="{ 'action-row': log.type === 'action', 'new-log': log.isNew }">
              <!-- Action 类型日志 -->
              <template v-if="log.type === 'action'">
                <div class="action-content">
                  <n-icon :size="12" color="#18a058"><CheckmarkCircleOutline /></n-icon>
                  <span class="action-msg">{{ log.message }}</span>
                  <span class="action-time">{{ log.time }}</span>
                </div>
              </template>
              <!-- 普通日志 -->
              <template v-else>
                <div class="log-col col-channel" :class="`col-channel-${channelType}`">
                  <n-tag size="tiny" type="success">{{ log.channel }}</n-tag>
                </div>
                <div class="log-col col-token" :class="`col-token-${channelType}`">{{ log.tokens?.input || 0 }}</div>
                <div class="log-col col-token" :class="`col-token-${channelType}`">{{ log.tokens?.output || 0 }}</div>
                <template v-if="channelType === 'claude'">
                  <div class="log-col col-token" :class="`col-token-${channelType}`">{{ log.tokens?.cacheCreation || 0 }}</div>
                  <div class="log-col col-token" :class="`col-token-${channelType}`">{{ log.tokens?.cacheRead || 0 }}</div>
                </template>
                <template v-else-if="channelType === 'codex'">
                  <div class="log-col col-token" :class="`col-token-${channelType}`">{{ log.tokens?.reasoning || 0 }}</div>
                  <div class="log-col col-token" :class="`col-token-${channelType}`">{{ log.tokens?.cached || 0 }}</div>
                </template>
                <template v-else-if="channelType === 'gemini'">
                  <div class="log-col col-token" :class="`col-token-${channelType}`">{{ log.tokens?.cached || 0 }}</div>
                  <div class="log-col col-token" :class="`col-token-${channelType}`">{{ log.tokens?.total || 0 }}</div>
                </template>
                <div class="log-col col-time" :class="`col-time-${channelType}`">{{ log.time }}</div>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 锁定状态 UI -->
    <div v-else class="locked-overlay" :class="`locked-${channelType}`">
      <div class="locked-content">
        <div class="lock-icon">
          <n-icon :size="48">
            <LockClosed />
          </n-icon>
        </div>
        <h3 class="locked-title">该渠道已锁定</h3>
        <n-text depth="3" class="locked-hint">
          点击上方按钮解锁以查看内容
        </n-text>
      </div>
    </div>

    <!-- 最新对话抽屉 -->
    <RecentSessionsDrawer v-model:visible="showRecentSessions" :channel="channelType" />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { NIcon, NText, NSwitch, NTag, NButton, NTooltip, NPopover, useMessage } from 'naive-ui'
import {
  ChatboxEllipsesOutline,
  CodeSlashOutline,
  SparklesOutline,
  PowerOutline,
  RocketOutline,
  TrendingUpOutline,
  FlashOutline,
  RadioOutline,
  TrashOutline,
  DocumentTextOutline,
  ChevronForwardOutline,
  ChevronDownOutline,
  SwapHorizontalOutline,
  CheckmarkCircleOutline,
  FolderOutline,
  ChatbubblesOutline,
  ArrowForwardOutline,
  LockClosed,
  LockOpen,
  ReorderTwoOutline
} from '@vicons/ionicons5'
import { useGlobalState } from '../../composables/useGlobalState'
import { useDashboard } from '../../composables/useDashboard'
import RecentSessionsDrawer from '../RecentSessionsDrawer.vue'
import {
  getUIConfig,
  updateNestedUIConfig
} from '../../api/ui-config'
import {
  updateChannel,
  updateCodexChannel,
  updateGeminiChannel
} from '../../api/channels'
import {
  getTodayStatistics,
  getCodexTodayStatistics,
  getGeminiTodayStatistics
} from '../../api/statistics'

const props = defineProps({
  channelType: {
    type: String,
    required: true,
    validator: (value) => ['claude', 'codex', 'gemini'].includes(value)
  }
})

const router = useRouter()
const message = useMessage()
const {
  claudeProxy,
  codexProxy,
  geminiProxy,
  claudeChannels,
  codexChannels,
  geminiChannels,
  schedulerState,
  getProxyState,
  startProxy,
  stopProxy,
  getLogs,
  clearLogsForSource,
  loadChannels: loadGlobalChannels,
  logLimit,
  statsInterval: statsIntervalSetting
} = useGlobalState()

// Dashboard 聚合数据
const { dashboardData, isLoading: dashboardLoading, loadDashboard } = useDashboard()

// 渠道配置
const channelConfig = {
  claude: {
    title: 'ClaudeCode',
    subtitle: '智能编程助手',
    icon: ChatboxEllipsesOutline
  },
  codex: {
    title: 'Codex-CLI',
    subtitle: '高效代码生成',
    icon: CodeSlashOutline
  },
  gemini: {
    title: 'Gemini-CLI',
    subtitle: '多模态AI助手',
    icon: SparklesOutline
  }
}

const channelTitle = computed(() => channelConfig[props.channelType].title)
const channelSubtitle = computed(() => channelConfig[props.channelType].subtitle)
const channelIcon = computed(() => channelConfig[props.channelType].icon)

// 代理状态（根据渠道类型选择）
const proxyState = computed(() => {
  if (props.channelType === 'claude') return claudeProxy.value
  if (props.channelType === 'codex') return codexProxy.value
  if (props.channelType === 'gemini') return geminiProxy.value
  return {}
})

// 渠道类型名称
const channelTypeName = computed(() => {
  if (props.channelType === 'claude') return 'Claude'
  if (props.channelType === 'codex') return 'Codex'
  if (props.channelType === 'gemini') return 'Gemini'
  return ''
})

// 统计数据
const stats = ref({ projects: 0, sessions: 0 })
const todayStats = ref({
  requests: 0,
  tokens: 0,
  cost: 0
})

// 动画数值（用于显示滚动动画）
const animatedStats = ref({
  requests: 0,
  tokens: 0,
  cost: 0
})

const statPrecision = {
  requests: 0,
  tokens: 0,
  cost: 3
}

// 动画计时器ID
let animationFrameIds = {
  requests: null,
  tokens: null,
  cost: null
}

// 跟踪哪些数值正在动画中
const isAnimating = ref({
  requests: false,
  tokens: false,
  cost: false
})

// 数字滚动动画函数
function animateValue(key, startValue, endValue, duration = 600) {
  if (animationFrameIds[key]) {
    cancelAnimationFrame(animationFrameIds[key])
  }

  // 开始动画，触发CSS动画效果
  isAnimating.value[key] = true

  const startTime = Date.now()

  const animate = () => {
    const elapsed = Date.now() - startTime
    const progress = Math.min(elapsed / duration, 1)

    // 使用 easeOutQuad 缓动函数
    const easeProgress = 1 - Math.pow(1 - progress, 2)
    const rawValue = startValue + (endValue - startValue) * easeProgress
    const precision = statPrecision[key] ?? 0
    const factor = Math.pow(10, precision)
    const currentValue = precision > 0
      ? Math.round(rawValue * factor) / factor
      : Math.round(rawValue)

    animatedStats.value[key] = currentValue

    if (progress < 1) {
      animationFrameIds[key] = requestAnimationFrame(animate)
    } else {
      // 动画结束，移除CSS动画效果
      isAnimating.value[key] = false
    }
  }

  animationFrameIds[key] = requestAnimationFrame(animate)
}

// 最新对话抽屉
const showRecentSessions = ref(false)

// localStorage key
const LOCK_STORAGE_KEY = 'channelLocks'

// 从 localStorage 读取锁定状态
function getLockFromStorage() {
  try {
    const stored = localStorage.getItem(LOCK_STORAGE_KEY)
    if (stored) {
      const locks = JSON.parse(stored)
      return locks[props.channelType] || false
    }
  } catch (e) {}
  return false
}

// 保存锁定状态到 localStorage
function saveLockToStorage(locked) {
  try {
    const stored = localStorage.getItem(LOCK_STORAGE_KEY)
    const locks = stored ? JSON.parse(stored) : {}
    locks[props.channelType] = locked
    localStorage.setItem(LOCK_STORAGE_KEY, JSON.stringify(locks))
  } catch (e) {}
}

// 锁定状态 - 初始值从 localStorage 读取，避免闪烁
const isLocked = ref(getLockFromStorage())

// 加载锁定状态（从服务器同步）
async function loadLockState() {
  try {
    let serverLocked = false
    if (dashboardData.value && dashboardData.value.uiConfig) {
      serverLocked = dashboardData.value.uiConfig.channelLocks?.[props.channelType] || false
    } else {
      const response = await getUIConfig()
      if (response.success && response.config) {
        serverLocked = response.config.channelLocks?.[props.channelType] || false
      }
    }
    // 服务器状态同步到本地
    isLocked.value = serverLocked
    saveLockToStorage(serverLocked)
  } catch (err) {
    // 出错时保持 localStorage 的状态
  }
}

// 切换锁定状态
async function toggleLock() {
  isLocked.value = !isLocked.value
  saveLockToStorage(isLocked.value)
  try {
    await updateNestedUIConfig('channelLocks', props.channelType, isLocked.value)
    if (dashboardData.value) {
      const config = dashboardData.value.uiConfig || {}
      const channelLocks = { ...(config.channelLocks || {}) }
      channelLocks[props.channelType] = isLocked.value
      dashboardData.value = {
        ...dashboardData.value,
        uiConfig: {
          ...config,
          channelLocks
        }
      }
    }
  } catch (err) {
    console.error('Failed to save lock state:', err)
  }
}

// 显示实时日志（从服务器读取，默认true）
const showLogs = ref(true)

// 加载显示设置
async function loadShowLogs() {
  try {
    // 优先从 dashboard 数据读取
    if (dashboardData.value && dashboardData.value.uiConfig) {
      showLogs.value = dashboardData.value.uiConfig.panelVisibility?.showLogs !== false
    } else {
      const response = await getUIConfig()
      if (response.success && response.config) {
        showLogs.value = response.config.panelVisibility?.showLogs !== false
      }
    }
  } catch (err) {
    console.error('Failed to load panel settings:', err)
  }
}

// 监听设置变化
function handleVisibilityChange(event) {
  if (event.detail && event.detail.showLogs !== undefined) {
    showLogs.value = event.detail.showLogs
  }
}

// 代理运行时间（实时更新）
const currentTime = ref(Date.now())
const runtimeDisplay = computed(() => {
  if (!proxyState.value.running) return ''

  const startTime = proxyState.value.startTime
  if (!startTime) return ''

  // 使用 currentTime 实时计算运行时长
  const runtime = currentTime.value - startTime
  if (runtime <= 0) return ''

  const totalSeconds = Math.floor(runtime / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  let display = '已运行 '
  if (hours > 0) {
    display += `${hours}小时`
  }
  if (minutes > 0) {
    display += `${minutes}分`
  }
  if (seconds > 0 || (hours === 0 && minutes === 0)) {
    display += `${seconds}秒`
  }

  return display
})

// 日志
const logsContainer = ref(null)
const maxLogs = computed(() => logLimit.value)
const logStreams = {
  claude: getLogs('claude'),
  codex: getLogs('codex'),
  gemini: getLogs('gemini')
}
const logsToDisplay = computed(() => {
  const stream = logStreams[props.channelType] || logStreams.claude
  const list = stream.value || []
  return list.slice(0, maxLogs.value)
})
let latestLogId = null
let statsIntervalId = null
let timeIntervalId = null
let componentMounted = false
let statsDebounceTimer = null

// 渠道列表 - 使用 Pinia store 的共享数据，启用的排前面
const channels = computed(() => {
  let list = []
  if (props.channelType === 'claude') list = claudeChannels.value || []
  else if (props.channelType === 'codex') list = codexChannels.value || []
  else if (props.channelType === 'gemini') list = geminiChannels.value || []

  // 启用的排前面，禁用的排后面
  const enabled = list.filter(ch => ch.enabled !== false)
  const disabled = list.filter(ch => ch.enabled === false)
  return [...enabled, ...disabled]
})

// 获取渠道的实时并发数
function getChannelInflight(channelId) {
  const scheduler = schedulerState[props.channelType]
  if (!scheduler || !scheduler.channels) return 0
  const ch = scheduler.channels.find(c => c.id === channelId)
  return ch ? ch.inflight : 0
}

// 当前状态文本
const statusText = computed(() => {
  const enabledCount = channels.value.filter(ch => ch.enabled !== false).length
  if (proxyState.value.proxy?.running) {
    return `${enabledCount}个渠道调度中`
  }
  return channels.value.length > 0 ? `${enabledCount}个渠道已启用` : '无渠道'
})

// 渠道统计数据
const channelStats = ref({})

// 获取渠道的今日统计
function getChannelTodayStats(channelId) {
  return channelStats.value[channelId] || { requests: 0, tokens: 0, cost: 0 }
}

// 加载渠道统计数据
async function loadChannelStats() {
  try {
    let statsData
    if (props.channelType === 'claude') {
      statsData = await getTodayStatistics()
    } else if (props.channelType === 'codex') {
      statsData = await getCodexTodayStatistics()
    } else if (props.channelType === 'gemini') {
      statsData = await getGeminiTodayStatistics()
    }

    // 从 byChannel 提取各渠道统计
    if (statsData && statsData.byChannel) {
      const stats = {}
      for (const [channelId, data] of Object.entries(statsData.byChannel)) {
        stats[channelId] = {
          requests: data.requests || 0,
          tokens: data.tokens?.total || 0,
          cost: data.cost || 0
        }
      }
      channelStats.value = stats
    }
  } catch (err) {
    console.error('Failed to load channel stats:', err)
  }
}

// 格式化统计数字
function formatStatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
  return num.toString()
}

// 防抖调用渠道统计（避免频繁日志导致大量请求）
function debouncedLoadChannelStats() {
  if (statsDebounceTimer) {
    clearTimeout(statsDebounceTimer)
  }
  // 5秒内的多次调用只执行最后一次
  statsDebounceTimer = setTimeout(() => {
    loadChannelStats()
  }, 5000)
}

watch(logsToDisplay, (newLogs) => {
  const newestId = newLogs[0]?.id || null
  if (!newestId || newestId === latestLogId) {
    latestLogId = newestId
    return
  }
  latestLogId = newestId

  // 有新日志时使用防抖刷新渠道统计（避免大量请求）
  debouncedLoadChannelStats()

  const isNearTop = logsContainer.value ? logsContainer.value.scrollTop < 20 : true
  if (isNearTop) {
    nextTick(() => {
      if (logsContainer.value) {
        logsContainer.value.scrollTop = 0
      }
    })
  }
})

// 监听今日统计数据变化，触发滚动动画
watch(() => todayStats.value.requests, (newVal) => {
  animateValue('requests', animatedStats.value.requests, newVal, 600)
})

watch(() => todayStats.value.tokens, (newVal) => {
  animateValue('tokens', animatedStats.value.tokens, newVal, 600)
})

watch(() => todayStats.value.cost, (newVal) => {
  animateValue('cost', animatedStats.value.cost, newVal, 600)
})

watch(() => props.channelType, () => {
  latestLogId = logsToDisplay.value[0]?.id || null
})

watch(() => dashboardData.value?.counts?.[props.channelType], () => {
  syncCountsFromDashboard()
})

watch(statsIntervalSetting, () => {
  if (componentMounted) {
    setupStatsTimer()
  }
})

// 格式化 Token
function formatTokens(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
  return num.toString()
}

function formatCurrency(value) {
  if (!value || Number.isNaN(value)) return '$0'
  return '$' + Number(value).toFixed(3)
}

// 格式化时间
function formatTime(timestamp) {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// 处理代理切换
async function handleProxyToggle(value) {
  const proxyState = getProxyState(props.channelType)
  proxyState.value.loading = true
  try {
    let result
    if (value) {
      result = await startProxy(props.channelType)
    } else {
      result = await stopProxy(props.channelType)
    }

    if (result.success !== false) {
      message.success(value ? `${channelTitle.value} 代理已启动` : `${channelTitle.value} 代理已停止`)
    } else {
      message.error(result.error || '操作失败')
      // 回滚状态
      proxyState.value.running = !value
    }
  } catch (error) {
    message.error(error.response?.data?.error || error.message || '操作失败')
    // 回滚状态
    proxyState.value.running = !value
  } finally {
    proxyState.value.loading = false
  }
}

// 跳转到项目列表
function goToProjects() {
  router.push({ name: `${props.channelType}-projects` })
}

// 跳转到渠道单独页面
function goToChannelPage() {
  router.push({ name: `${props.channelType}-projects` })
}

// 快捷切换渠道状态
async function handleQuickToggle(channel, enabled) {
  try {
    let updateFn
    if (props.channelType === 'claude') {
      updateFn = updateChannel
    } else if (props.channelType === 'codex') {
      updateFn = updateCodexChannel
    } else if (props.channelType === 'gemini') {
      updateFn = updateGeminiChannel
    }

    if (updateFn) {
      await updateFn(channel.id, { enabled })
      message.success(enabled ? `渠道「${channel.name}」已启用` : `渠道「${channel.name}」已停用`)
      // 使用全局 store 的 loadChannels 刷新数据
      await loadGlobalChannels()
    }
  } catch (error) {
    message.error('操作失败: ' + error.message)
  }
}


function syncCountsFromDashboard() {
  const counts = dashboardData.value?.counts?.[props.channelType]
  stats.value.projects = counts?.projectCount || 0
  stats.value.sessions = counts?.sessionCount || 0
}

// 加载统计数据
async function loadStats() {
  if (dashboardData.value && dashboardData.value.todayStats) {
    const statsData = dashboardData.value.todayStats[props.channelType]
    if (statsData) {
      todayStats.value.requests = statsData.requests || 0
      todayStats.value.tokens = statsData.tokens || 0
      todayStats.value.cost = statsData.cost || 0
    }
  }
  syncCountsFromDashboard()
}

// 清空日志
function clearLogs() {
  clearLogsForSource(props.channelType)
}

function setupStatsTimer() {
  if (statsIntervalId) {
    clearInterval(statsIntervalId)
    statsIntervalId = null
  }
  const intervalSeconds = statsIntervalSetting.value || 30
  const delay = Math.max(intervalSeconds * 1000, 10000)
  statsIntervalId = setInterval(() => {
    loadStats()
    loadChannelStats()  // 同时刷新渠道统计
  }, delay)
}

onMounted(async () => {
  // 先加载 dashboard 聚合数据（只有第一个组件会真正发起请求，其他复用缓存）
  await loadDashboard()

  // 从缓存数据加载
  await loadStats()
  // 加载渠道统计数据
  await loadChannelStats()
  // 渠道数据现在从 Pinia store 获取，由 store 自动管理
  loadShowLogs()
  loadLockState()
  window.addEventListener('panel-visibility-change', handleVisibilityChange)

  // 初始化动画数值
  animatedStats.value = { ...todayStats.value }

  componentMounted = true
  timeIntervalId = setInterval(() => {
    currentTime.value = Date.now()
  }, 1000)
})

onUnmounted(() => {
  componentMounted = false
  if (statsIntervalId) clearInterval(statsIntervalId)
  if (timeIntervalId) clearInterval(timeIntervalId)
  if (statsDebounceTimer) clearTimeout(statsDebounceTimer)
  window.removeEventListener('panel-visibility-change', handleVisibilityChange)

  // 清理动画计时器
  Object.values(animationFrameIds).forEach(id => {
    if (id) cancelAnimationFrame(id)
  })
})
</script>

<style scoped>
.channel-column {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--gradient-card);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}

.channel-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  background: var(--bg-primary);
  position: relative;
}

.drag-handle {
  cursor: grab;
  color: var(--text-tertiary);
  display: flex;
  align-items: center;
  padding: 4px;
  margin: -4px;
  margin-right: 0;
  border-radius: 4px;
  transition: all 0.2s;
}

.drag-handle:hover {
  color: var(--text-secondary);
  background: var(--bg-tertiary);
}

.drag-handle:active {
  cursor: grabbing;
}

.channel-header::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 14px;
  right: 14px;
  height: 2px;
  border-radius: 1px;
}

.channel-header.claude {
  background: linear-gradient(135deg, rgba(24, 160, 88, 0.08) 0%, transparent 100%);
}

.channel-header.claude::after {
  background: linear-gradient(90deg, #18a058, rgba(24, 160, 88, 0.3));
}

.channel-header.codex {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, transparent 100%);
}

.channel-header.codex::after {
  background: linear-gradient(90deg, #3b82f6, rgba(59, 130, 246, 0.3));
}

.channel-header.gemini {
  background: linear-gradient(135deg, rgba(168, 85, 247, 0.08) 0%, transparent 100%);
}

.channel-header.gemini::after {
  background: linear-gradient(90deg, #a855f7, rgba(168, 85, 247, 0.3));
}

.header-icon {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.channel-header.claude .header-icon {
  background: linear-gradient(135deg, #18a058 0%, #15803d 100%);
  color: white;
}

.channel-header.codex .header-icon {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: white;
}

.channel-header.gemini .header-icon {
  background: linear-gradient(135deg, #a855f7 0%, #9333ea 100%);
  color: white;
}

.channel-title {
  font-size: 15px;
  font-weight: 700;
  margin: 0;
  color: var(--text-primary);
  letter-spacing: 0.3px;
}

.channel-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.card {
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  overflow: hidden;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05);
  position: relative;
}

.card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
  opacity: 0;
  transition: opacity 0.3s ease;
}

.card:hover {
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.1);
  border-color: var(--border-secondary);
}

.card:hover::before {
  opacity: 1;
}

.card.clickable {
  cursor: pointer;
}

.card.clickable:hover {
  border-color: #18a058;
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(24, 160, 88, 0.18);
}

.card.clickable::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(24, 160, 88, 0.02) 0%, transparent 100%);
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
}

.card.clickable:hover::after {
  opacity: 1;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: linear-gradient(180deg, var(--bg-secondary) 0%, var(--bg-primary) 100%);
  border-bottom: 1px solid var(--border-primary);
  position: relative;
  min-height: 24px;
}

.card-header.compact {
  padding: 8px 12px;
}

.card-header .n-icon {
  color: var(--text-tertiary);
  transition: color 0.2s ease;
}

.card:hover .card-header .n-icon {
  color: var(--text-secondary);
}

.card-title {
  font-size: 11px;
  font-weight: 700;
  margin: 0;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.8px;
}

.runtime-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  margin-left: 8px;
  font-size: 10px;
  font-weight: 600;
  color: #10b981;
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(52, 211, 153, 0.1) 100%);
  border: 1px solid rgba(16, 185, 129, 0.2);
  border-radius: 4px;
  white-space: nowrap;
  animation: pulse-runtime 2s ease-in-out infinite;
}

@keyframes pulse-runtime {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.8;
    transform: scale(0.98);
  }
}

.card-body {
  padding: 12px;
  background: var(--bg-primary);
}

.card-body.compact {
  padding: 10px 12px;
}

.proxy-control {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.proxy-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.proxy-info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.proxy-status {
  display: flex;
  align-items: center;
  gap: 6px;
}

.proxy-port {
  font-size: 11px;
  color: var(--text-secondary);
  margin-left: 6px;
}

.channel-selector {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  background: linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-tertiary) 100%);
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  color: var(--text-secondary);
  transition: all 0.2s ease;
}

.channel-selector:hover {
  background: var(--hover-bg);
  border-color: var(--border-secondary);
  color: var(--text-primary);
}

.channel-selector:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.channel-name {
  font-size: 11px;
  font-weight: 500;
  max-width: 90px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--border-secondary);
  transition: all 0.3s ease;
}

.status-dot.active {
  background: #18a058;
  box-shadow: 0 0 8px rgba(24, 160, 88, 0.5);
}

.quick-stats {
  display: flex;
  gap: 16px;
  padding: 4px 0;
}

.stat-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 4px 0;
}

.stat-divider {
  width: 1px;
  background: linear-gradient(180deg, transparent 0%, var(--border-primary) 50%, transparent 100%);
}

.quick-access-list {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}

.access-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  min-height: 52px;
  overflow: hidden;
}

.access-card::before {
  content: '';
  position: absolute;
  inset: 0;
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
}

.access-icon {
  width: 32px;
  height: 32px;
  border-radius: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.3s ease;
}

.access-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}

/* 项目卡片 */
.access-card-projects .access-icon {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(139, 92, 246, 0.15));
  color: #6366f1;
}

.access-card-projects::before {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(139, 92, 246, 0.08));
}

.access-card-projects:hover .access-icon {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.25), rgba(139, 92, 246, 0.25));
  transform: scale(1.1) rotate(-5deg);
}

/* 对话卡片 */
.access-card-sessions .access-icon {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(5, 150, 105, 0.15));
  color: #10b981;
}

.access-card-sessions::before {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(5, 150, 105, 0.08));
}

.access-card-sessions:hover .access-icon {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.25), rgba(5, 150, 105, 0.25));
  transform: scale(1.1) rotate(5deg);
}

/* 前往卡片 */
.access-card-goto .access-icon {
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(251, 146, 60, 0.15));
  color: #f59e0b;
}

.access-card-goto::before {
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.08), rgba(251, 146, 60, 0.08));
}

.access-card-goto:hover .access-icon {
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.25), rgba(251, 146, 60, 0.25));
  transform: scale(1.1) translateX(3px);
}

.access-card.clickable:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);
  border-color: var(--border-secondary);
}

.access-card.clickable:hover::before {
  opacity: 1;
}

.access-card.clickable:active {
  transform: translateY(0);
}

.access-label {
  display: block;
  font-size: 10px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.access-value {
  display: block;
  font-size: 18px;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1;
}

.access-goto {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.2;
  white-space: nowrap;
}

.stats-inline {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}

.stats-inline.stats-3col {
  grid-template-columns: repeat(3, 1fr);
}

.stat-inline-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 12px;
  background: linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-tertiary) 100%);
  border-radius: 6px;
  border: 1px solid var(--border-primary);
  transition: all 0.25s ease;
}

.stat-inline-item:hover {
  border-color: var(--border-secondary);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

/* 统计项图标点 */
.stat-icon-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.stat-icon-dot.requests {
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  box-shadow: 0 0 8px rgba(59, 130, 246, 0.4);
}

.stat-icon-dot.tokens {
  background: linear-gradient(135deg, #18a058, #15803d);
  box-shadow: 0 0 8px rgba(24, 160, 88, 0.4);
}

.stat-icon-dot.cost {
  background: linear-gradient(135deg, #f59e0b, #d97706);
  box-shadow: 0 0 8px rgba(245, 158, 11, 0.4);
}

.stat-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.stat-label {
  font-size: 11px;
  color: var(--text-tertiary);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.stat-value {
  font-size: 18px;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1.2;
  transition: all 0.3s ease;
}

/* 数字变化时的动画效果 */
.stat-value.animating {
  animation: numberChange 0.6s ease;
}

@keyframes numberChange {
  0% {
    transform: translateY(-8px);
    opacity: 0.5;
  }
  50% {
    transform: translateY(0);
    opacity: 1;
    color: var(--primary-color);
    text-shadow: 0 0 8px currentColor;
  }
  100% {
    transform: translateY(0);
    opacity: 1;
  }
}

/* 统计卡片特殊样式 */
.stats-card {
  border-left: 3px solid transparent;
}

.stats-card-claude {
  border-left-color: #18a058;
}

.stats-card-codex {
  border-left-color: #3b82f6;
}

.stats-card-gemini {
  border-left-color: #a855f7;
}

/* 请求数值颜色 */
.stat-requests .stat-value {
  color: #3b82f6;
}

/* 输入数值颜色 */
.stat-input .stat-value {
  color: #18a058;
}

/* 输出数值颜色 */
.stat-output .stat-value {
  color: #f59e0b;
}

.token-label {
  display: flex;
  align-items: center;
  gap: 8px;
}

.token-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.logs-card {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border-primary);
  border-radius: 6px;
}

.logs-card .card-header {
  background: linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-tertiary) 100%);
}

.logs-table-wrapper {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-primary);
}

.logs-table-header {
  display: flex;
  padding: 10px 12px;
  background: linear-gradient(180deg, var(--bg-tertiary) 0%, var(--bg-secondary) 100%);
  border-bottom: 2px solid var(--border-primary);
  font-size: 11px;
  font-weight: 700;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.6px;
  flex-shrink: 0;
}

.logs-header-claude .log-col {
  color: #18a058;
  font-weight: 800;
}

.logs-header-codex .log-col {
  color: #3b82f6;
  font-weight: 800;
}

.logs-header-gemini .log-col {
  color: #a855f7;
  font-weight: 800;
}

.logs-container {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

.logs-container::-webkit-scrollbar {
  width: 4px;
}

.logs-container::-webkit-scrollbar-thumb {
  background: rgba(24, 160, 88, 0.3);
  border-radius: 2px;
}

.logs-container::-webkit-scrollbar-thumb:hover {
  background: rgba(24, 160, 88, 0.5);
}

.empty-logs {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  color: var(--text-tertiary);
  min-height: 200px;
  text-align: center;
}

.log-row {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  min-height: 40px;
  border-bottom: 1px solid var(--border-primary);
  font-size: 12px;
  transition: all 0.2s ease;
  background: var(--bg-primary);
  position: relative;
}

.log-row:nth-child(even) {
  background: var(--bg-secondary);
}

.log-row:hover {
  background: var(--hover-bg);
  transform: translateX(2px);
}

/* 新日志高亮动画 - 柔和版本 */
.log-row.new-log {
  animation: newLogPulse 4.5s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
  border-left: 3px solid #18a058;
}

@keyframes newLogPulse {
  0% {
    background: linear-gradient(90deg, rgba(24, 160, 88, 0.15) 0%, rgba(24, 160, 88, 0.06) 100%);
    box-shadow: 0 0 8px 0 rgba(24, 160, 88, 0.2);
  }
  5% {
    background: linear-gradient(90deg, rgba(24, 160, 88, 0.18) 0%, rgba(24, 160, 88, 0.08) 100%);
    box-shadow: 0 0 12px 1px rgba(24, 160, 88, 0.25);
  }
  15% {
    background: linear-gradient(90deg, rgba(24, 160, 88, 0.16) 0%, rgba(24, 160, 88, 0.07) 100%);
    box-shadow: 0 0 10px 1px rgba(24, 160, 88, 0.2);
  }
  30% {
    background: linear-gradient(90deg, rgba(24, 160, 88, 0.12) 0%, rgba(24, 160, 88, 0.05) 100%);
    box-shadow: 0 0 6px 0 rgba(24, 160, 88, 0.15);
  }
  50% {
    background: linear-gradient(90deg, rgba(24, 160, 88, 0.08) 0%, rgba(24, 160, 88, 0.03) 100%);
    box-shadow: 0 0 4px 0 rgba(24, 160, 88, 0.1);
  }
  70% {
    background: linear-gradient(90deg, rgba(24, 160, 88, 0.04) 0%, rgba(24, 160, 88, 0.015) 100%);
    box-shadow: 0 0 2px 0 rgba(24, 160, 88, 0.06);
  }
  85% {
    background: linear-gradient(90deg, rgba(24, 160, 88, 0.02) 0%, rgba(24, 160, 88, 0.008) 100%);
    box-shadow: 0 0 1px 0 rgba(24, 160, 88, 0.03);
  }
  100% {
    background: transparent;
    box-shadow: 0 0 0 0 rgba(24, 160, 88, 0);
    border-left-color: transparent;
  }
}

/* 暗色主题下的新日志高亮 - 柔和版本 */
[data-theme="dark"] .log-row.new-log {
  animation: newLogPulseDark 4.5s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
}

@keyframes newLogPulseDark {
  0% {
    background: linear-gradient(90deg, rgba(24, 160, 88, 0.2) 0%, rgba(24, 160, 88, 0.08) 100%);
    box-shadow: 0 0 10px 0 rgba(24, 160, 88, 0.25);
  }
  5% {
    background: linear-gradient(90deg, rgba(24, 160, 88, 0.24) 0%, rgba(24, 160, 88, 0.1) 100%);
    box-shadow: 0 0 14px 2px rgba(24, 160, 88, 0.3);
  }
  15% {
    background: linear-gradient(90deg, rgba(24, 160, 88, 0.21) 0%, rgba(24, 160, 88, 0.09) 100%);
    box-shadow: 0 0 12px 1px rgba(24, 160, 88, 0.25);
  }
  30% {
    background: linear-gradient(90deg, rgba(24, 160, 88, 0.16) 0%, rgba(24, 160, 88, 0.07) 100%);
    box-shadow: 0 0 8px 1px rgba(24, 160, 88, 0.18);
  }
  50% {
    background: linear-gradient(90deg, rgba(24, 160, 88, 0.11) 0%, rgba(24, 160, 88, 0.045) 100%);
    box-shadow: 0 0 5px 0 rgba(24, 160, 88, 0.12);
  }
  70% {
    background: linear-gradient(90deg, rgba(24, 160, 88, 0.06) 0%, rgba(24, 160, 88, 0.024) 100%);
    box-shadow: 0 0 3px 0 rgba(24, 160, 88, 0.08);
  }
  85% {
    background: linear-gradient(90deg, rgba(24, 160, 88, 0.03) 0%, rgba(24, 160, 88, 0.012) 100%);
    box-shadow: 0 0 1px 0 rgba(24, 160, 88, 0.04);
  }
  100% {
    background: transparent;
    box-shadow: 0 0 0 0 rgba(24, 160, 88, 0);
    border-left-color: transparent;
  }
}

/* 新日志中的 action 样式 */
.log-row.new-log.action-row {
  border-left: 3px solid #18a058;
}

.log-row.action-row {
  background: linear-gradient(90deg, rgba(24, 160, 88, 0.12) 0%, rgba(24, 160, 88, 0.04) 100%);
  border-left: 3px solid #18a058;
  padding-left: 8px;
}

.log-row.action-row:hover {
  background: linear-gradient(90deg, rgba(24, 160, 88, 0.18) 0%, rgba(24, 160, 88, 0.08) 100%);
}

.action-content {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.action-msg {
  flex: 1;
  font-size: 11px;
  color: #18a058;
  font-weight: 600;
  letter-spacing: 0.2px;
}

.action-time {
  font-size: 10px;
  font-family: 'SF Mono', Monaco, monospace;
  color: var(--text-tertiary);
  background: rgba(24, 160, 88, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
}

.log-col {
  display: flex;
  align-items: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 通用列样式 */
.col-channel {
  min-width: 0;
}

.col-channel .n-tag {
  max-width: 100%;
  font-size: 11px;
  font-weight: 600;
  border-radius: 4px;
  padding: 3px 10px;
}

.col-token {
  justify-content: center;
  font-family: 'SF Mono', Monaco, Consolas, monospace;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  background: rgba(0, 0, 0, 0.03);
  padding: 4px 8px;
  border-radius: 4px;
  margin: 0 3px;
}

[data-theme="dark"] .col-token {
  background: rgba(255, 255, 255, 0.06);
}

.col-time {
  justify-content: flex-end;
  font-family: 'SF Mono', Monaco, Consolas, monospace;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-tertiary);
  padding-right: 2px;
  opacity: 0.85;
}

.log-row:hover .col-time {
  opacity: 1;
  color: var(--text-secondary);
}

/* Claude 列宽 (6列: 渠道, 请求, 回复, 写入, 命中, 时间) */
.col-channel-claude {
  flex: 2 1 60px;
  min-width: 50px;
}

.col-token-claude {
  flex: 1 1 40px;
  min-width: 35px;
}

.col-time-claude {
  flex: 1.5 1 55px;
  min-width: 50px;
}

/* Codex 列宽 (6列: 渠道, 请求, 回复, 推理, 缓存, 时间) */
.col-channel-codex {
  flex: 2 1 60px;
  min-width: 50px;
}

.col-token-codex {
  flex: 1 1 40px;
  min-width: 35px;
}

.col-time-codex {
  flex: 1.5 1 55px;
  min-width: 50px;
}

/* Gemini 列宽 (5列: 渠道, 请求, 回复, 缓存, 时间) */
.col-channel-gemini {
  flex: 2.5 1 70px;
  min-width: 55px;
}

.col-token-gemini {
  flex: 1.2 1 45px;
  min-width: 40px;
}

.col-time-gemini {
  flex: 1.8 1 60px;
  min-width: 55px;
}

/* 锁定按钮样式 - 精致版本 */
.lock-button {
  margin-left: auto;
  padding: 6px;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 5px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.lock-button .n-icon {
  color: var(--text-color-3);
  transition: all 0.25s ease;
  transform: scaleY(0.85);
}

.lock-button:hover {
  background: var(--bg-primary);
  border-color: var(--border-secondary);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transform: translateY(-1px);
}

.lock-button:hover .n-icon {
  color: var(--text-color-1);
  transform: scale(1.1) scaleY(0.94);
}

.lock-button:active {
  transform: translateY(0);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

/* 锁定状态覆盖层 - 精致版本 */
.locked-overlay {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  margin: 10px;
  position: relative;
  overflow: hidden;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  backdrop-filter: blur(10px);
}

/* 背景装饰 */
.locked-overlay::before {
  content: '';
  position: absolute;
  width: 400px;
  height: 400px;
  border-radius: 50%;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  opacity: 0.4;
  filter: blur(60px);
  pointer-events: none;
}

/* 根据不同渠道类型设置主题色 */
.locked-claude {
  background: linear-gradient(135deg,
    rgba(24, 160, 88, 0.03) 0%,
    var(--bg-secondary) 50%,
    rgba(24, 160, 88, 0.02) 100%);
}

.locked-claude::before {
  background: radial-gradient(circle, rgba(24, 160, 88, 0.15) 0%, transparent 70%);
}

.locked-codex {
  background: linear-gradient(135deg,
    rgba(59, 130, 246, 0.03) 0%,
    var(--bg-secondary) 50%,
    rgba(59, 130, 246, 0.02) 100%);
}

.locked-codex::before {
  background: radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, transparent 70%);
}

.locked-gemini {
  background: linear-gradient(135deg,
    rgba(168, 85, 247, 0.03) 0%,
    var(--bg-secondary) 50%,
    rgba(168, 85, 247, 0.02) 100%);
}

.locked-gemini::before {
  background: radial-gradient(circle, rgba(168, 85, 247, 0.15) 0%, transparent 70%);
}

/* 锁定内容 */
.locked-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  padding: 60px 40px;
  text-align: center;
  position: relative;
  z-index: 1;
}

.lock-icon {
  width: 96px;
  height: 96px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: var(--bg-primary);
  border: 2px solid var(--border-primary);
  margin-bottom: 8px;
  position: relative;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  animation: lock-float 3s ease-in-out infinite;
}

@keyframes lock-float {
  0%, 100% {
    transform: translateY(0px);
  }
  50% {
    transform: translateY(-6px);
  }
}

/* 光晕效果 */
.lock-icon::before {
  content: '';
  position: absolute;
  inset: -8px;
  border-radius: 20px;
  opacity: 0.6;
  filter: blur(12px);
}

/* Claude 主题色 */
.locked-claude .lock-icon {
  background: linear-gradient(135deg,
    rgba(24, 160, 88, 0.12) 0%,
    var(--bg-primary) 100%);
  border-color: rgba(24, 160, 88, 0.25);
  box-shadow:
    0 8px 24px rgba(24, 160, 88, 0.15),
    0 0 0 1px rgba(24, 160, 88, 0.1) inset;
}

.locked-claude .lock-icon::before {
  background: radial-gradient(circle, rgba(24, 160, 88, 0.3) 0%, transparent 60%);
}

.locked-claude .lock-icon .n-icon {
  color: #18a058;
  filter: drop-shadow(0 2px 4px rgba(24, 160, 88, 0.3));
}

/* Codex 主题色 */
.locked-codex .lock-icon {
  background: linear-gradient(135deg,
    rgba(59, 130, 246, 0.12) 0%,
    var(--bg-primary) 100%);
  border-color: rgba(59, 130, 246, 0.25);
  box-shadow:
    0 8px 24px rgba(59, 130, 246, 0.15),
    0 0 0 1px rgba(59, 130, 246, 0.1) inset;
}

.locked-codex .lock-icon::before {
  background: radial-gradient(circle, rgba(59, 130, 246, 0.3) 0%, transparent 60%);
}

.locked-codex .lock-icon .n-icon {
  color: #3b82f6;
  filter: drop-shadow(0 2px 4px rgba(59, 130, 246, 0.3));
}

/* Gemini 主题色 */
.locked-gemini .lock-icon {
  background: linear-gradient(135deg,
    rgba(168, 85, 247, 0.12) 0%,
    var(--bg-primary) 100%);
  border-color: rgba(168, 85, 247, 0.25);
  box-shadow:
    0 8px 24px rgba(168, 85, 247, 0.15),
    0 0 0 1px rgba(168, 85, 247, 0.1) inset;
}

.locked-gemini .lock-icon::before {
  background: radial-gradient(circle, rgba(168, 85, 247, 0.3) 0%, transparent 60%);
}

.locked-gemini .lock-icon .n-icon {
  color: #a855f7;
  filter: drop-shadow(0 2px 4px rgba(168, 85, 247, 0.3));
}

.lock-icon .n-icon {
  opacity: 0.85;
  position: relative;
  z-index: 1;
}

.locked-title {
  font-size: 17px;
  font-weight: 600;
  color: var(--text-color-1);
  margin: 0;
  letter-spacing: 0.3px;
}

.locked-hint {
  font-size: 13px;
  color: var(--text-color-3);
  max-width: 220px;
  line-height: 1.7;
  opacity: 0.9;
}

/* 渠道快捷管理面板 */
.channel-status {
  cursor: pointer;
  padding: 4px 8px !important;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.channel-status:hover {
  background: var(--hover-bg);
}

.channel-quick-panel {
  padding: 4px 0;
}

.panel-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px 12px 12px;
  border-bottom: 1px solid var(--border-primary);
  margin-bottom: 8px;
}

.panel-title span:first-child {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.no-channels {
  padding: 24px 12px;
  text-align: center;
}

.channel-quick-list {
  max-height: 360px;
  overflow-y: auto;
}

.channel-quick-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 6px;
  margin: 0 4px 6px 4px;
  background: var(--bg-secondary);
  transition: all 0.2s ease;
}

.channel-quick-item:hover {
  background: var(--hover-bg);
}

.channel-quick-item.disabled {
  opacity: 0.6;
}

.channel-quick-info {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.channel-quick-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 渠道指标行 */
.channel-metrics {
  display: flex;
  gap: 6px;
  width: 100%;
}

.channel-metrics .metric-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px 4px;
  background: var(--bg-primary);
  border-radius: 4px;
  border: 1px solid var(--border-primary);
}

.channel-metrics .metric-label {
  font-size: 10px;
  color: var(--text-tertiary);
  font-weight: 500;
}

.channel-metrics .metric-value {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-primary);
  font-family: 'SF Mono', Monaco, monospace;
}

.channel-metrics .metric-value.active {
  color: #f59e0b;
}

.channel-quick-item.disabled .channel-metrics .metric-value {
  color: var(--text-tertiary);
}

.channel-quick-list::-webkit-scrollbar {
  width: 4px;
}

.channel-quick-list::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.15);
  border-radius: 2px;
}

[data-theme="dark"] .channel-quick-list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
}
</style>
