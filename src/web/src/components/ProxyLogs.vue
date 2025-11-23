<template>
  <div class="proxy-logs">
    <div class="logs-header">
      <div class="header-left">
        <h3 class="title">实时日志</h3>
        <div class="today-stats">
          <n-tag size="tiny" :bordered="false" type="info">
            今日请求: {{ todayStats.requests }}
          </n-tag>
          <n-tag size="tiny" :bordered="false" type="success">
            今日Token: {{ formatNumber(todayStats.tokens) }}
          </n-tag>
        </div>
      </div>
      <n-button text size="small" @click="clearLogs">
        <n-icon size="16"><TrashOutline /></n-icon>
        清空
      </n-button>
    </div>

    <div class="logs-table">
      <!-- 表头 -->
      <div class="table-header">
        <div class="col col-channel">渠道</div>
        <div class="col col-token">请求</div>
        <div class="col col-token">回复</div>
        <template v-if="source === 'claude'">
          <div class="col col-token">写入</div>
          <div class="col col-token">命中</div>
        </template>
        <template v-else>
          <div class="col col-token">推理</div>
          <div class="col col-token">缓存</div>
          <div class="col col-token">总计</div>
        </template>
        <div class="col col-time">时间</div>
      </div>

      <!-- 内容区域（可滚动） -->
      <div class="table-body" ref="tableBody">
        <div v-if="filteredLogs.length === 0" class="empty-state">
          暂无日志
        </div>

        <!-- 行为日志 - 占一整行 -->
        <div
          v-for="log in filteredLogs"
          :key="log.id"
          :class="log.type === 'action' ? 'action-row' : 'table-row'"
        >
          <!-- 行为日志样式 -->
          <template v-if="log.type === 'action'">
            <n-icon size="16" style="color: #18a058; margin-right: 8px;">
              <CheckmarkCircle />
            </n-icon>
            <span class="action-message">{{ log.message }}</span>
            <span class="action-time">{{ log.time }}</span>
          </template>

          <!-- 普通日志样式 -->
          <template v-else>
            <n-tooltip placement="top" :style="{ maxWidth: '300px' }">
              <template #trigger>
                <div class="table-row-content">
                  <div class="col col-channel" :title="log.channel">
                    <n-tag size="small" type="success">{{ log.channel }}</n-tag>
                  </div>
                  <div class="col col-token">{{ log.inputTokens }}</div>
                  <div class="col col-token">{{ log.outputTokens }}</div>
                  <template v-if="source === 'claude'">
                    <div class="col col-token">{{ log.cacheCreation }}</div>
                    <div class="col col-token">{{ log.cacheRead }}</div>
                  </template>
                  <template v-else>
                    <div class="col col-token">{{ log.reasoningTokens || 0 }}</div>
                    <div class="col col-token">{{ log.cachedTokens || 0 }}</div>
                    <div class="col col-token">{{ log.totalTokens || 0 }}</div>
                  </template>
                  <div class="col col-time">{{ log.time }}</div>
                </div>
              </template>
              <div v-if="log.model">
                <div style="font-weight: 600; margin-bottom: 4px;">模型信息</div>
                <div style="font-family: monospace; font-size: 12px;">{{ log.model }}</div>
              </div>
              <div v-else>暂无模型信息</div>
            </n-tooltip>
          </template>
        </div>
      </div>
    </div>

    <div class="logs-footer">
      <span class="status" :class="{ connected: wsConnected }">
        <n-icon size="14">
          <component :is="wsConnected ? CheckmarkCircle : CloseCircle" />
        </n-icon>
        {{ wsConnected ? '已连接' : '未连接' }}
      </span>
      <span class="count">共 {{ filteredLogs.length }} 条</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { NButton, NIcon, NTag, NTooltip } from 'naive-ui'
import { TrashOutline, CheckmarkCircle, CloseCircle } from '@vicons/ionicons5'
import api from '../api'
import message from '../utils/message'

// Props
const props = defineProps({
  source: {
    type: String,
    default: 'claude' // 'claude' or 'codex'
  }
})

const logs = ref([])

// 根据 source 过滤日志
const filteredLogs = computed(() => {
  return logs.value.filter(log => {
    // 如果日志没有 source 字段，默认当作 claude 的日志
    const logSource = log.source || 'claude'
    return logSource === props.source
  })
})

const wsConnected = ref(false)
const tableBody = ref(null)
const todayStats = ref({
  requests: 0,
  tokens: 0
})
let ws = null
let isInitialConnection = true // 标记是否是初次连接
let reconnectAttempts = 0 // 重连尝试次数
const MAX_RECONNECT_ATTEMPTS = 3 // 最大重连次数
let reconnectTimer = null // 重连定时器
let isConnecting = false // 是否正在连接中
let statsUpdateTimer = null // 统计数据更新定时器

// 格式化数字（添加千位分隔符）
function formatNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M'
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K'
  }
  return num.toString()
}

// 加载今日统计数据（根据 source 过滤）
async function loadTodayStats() {
  try {
    const stats = await api.getTodayStatistics()

    // 根据 source 获取对应工具类型的统计
    // Claude 的 toolType 是 'claude-code'，Codex 的是 'codex'
    const toolType = props.source === 'codex' ? 'codex' : 'claude-code'
    const toolStats = stats.byToolType?.[toolType]

    if (toolStats) {
      todayStats.value = {
        requests: toolStats.requests || 0,
        tokens: toolStats.tokens?.total || 0
      }
    } else {
      todayStats.value = {
        requests: 0,
        tokens: 0
      }
    }
  } catch (err) {
    // 静默失败，不影响日志功能
    console.error('Failed to load today statistics:', err)
  }
}

// 启动定时更新统计数据（每30秒更新一次）
function startStatsUpdate() {
  loadTodayStats() // 立即加载一次
  statsUpdateTimer = setInterval(() => {
    loadTodayStats()
  }, 30000) // 30秒更新一次
}

// 连接 WebSocket
function connectWebSocket() {
  // 避免重复连接
  if (isConnecting || (ws && ws.readyState === WebSocket.CONNECTING)) {
    return
  }

  // 如果已有连接且是打开状态，直接返回
  if (ws && ws.readyState === WebSocket.OPEN) {
    return
  }

  // 如果已有连接但未完全关闭，先关闭
  if (ws && ws.readyState !== WebSocket.CLOSED) {
    try {
      ws.close()
    } catch (err) {
      // 忽略关闭错误
    }
    ws = null
  }

  try {
    isConnecting = true

    // 根据当前环境构建 WebSocket URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    const wsUrl = `${protocol}//${host}/ws`

    ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      wsConnected.value = true
      isConnecting = false
      reconnectAttempts = 0 // 重置重连次数

      // 初次连接时清空日志，准备接收历史日志
      if (isInitialConnection) {
        logs.value = []
        isInitialConnection = false
      }
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)

        // 格式化时间
        const time = new Date(data.timestamp || Date.now()).toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        })

        // 添加唯一 ID
        const log = {
          ...data,
          id: `${Date.now()}-${Math.random()}`,
          time
        }

        logs.value.push(log)

        // 限制日志数量（最多保留 100 条）
        if (logs.value.length > 100) {
          logs.value.shift()
        }

        // 如果是普通日志（非行为日志），更新统计数据
        if (log.type !== 'action') {
          loadTodayStats()
        }

        // 自动滚动到底部，确保最后一条完全可见
        nextTick(() => {
          if (tableBody.value) {
            // 立即滚动到底部，确保新日志可见
            tableBody.value.scrollTop = tableBody.value.scrollHeight
          }
        })
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err)
      }
    }

    ws.onerror = (error) => {
      // 不要打印错误，避免控制台刷屏
      wsConnected.value = false
      isConnecting = false
    }

    ws.onclose = () => {
      wsConnected.value = false
      isConnecting = false

      // 清除之前的重连定时器
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }

      // 限制重连次数，避免无限重连
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++

        // 延迟重连，时间递增（5秒、10秒、15秒）
        const delay = reconnectAttempts * 5000
        reconnectTimer = setTimeout(() => {
          if (!wsConnected.value) {
            connectWebSocket()
          }
        }, delay)
      }
    }
  } catch (err) {
    console.error('Failed to connect WebSocket:', err)
    isConnecting = false
    wsConnected.value = false
  }
}

// 清空日志
async function clearLogs() {
  try {
    await api.clearProxyLogs()
    logs.value = []
    message.success('日志已清空')
  } catch (err) {
    message.error('清空失败: ' + err.message)
  }
}

// 重置连接（可在代理开启时调用）
function resetConnection() {
  reconnectAttempts = 0
  if (!wsConnected.value) {
    connectWebSocket()
  }
}

// 监听 source 变化，重新加载统计数据
watch(() => props.source, () => {
  loadTodayStats()
})

onMounted(() => {
  connectWebSocket()
  startStatsUpdate() // 启动统计数据更新
})

onUnmounted(() => {
  // 清除重连定时器
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }

  // 清除统计数据更新定时器
  if (statsUpdateTimer) {
    clearInterval(statsUpdateTimer)
    statsUpdateTimer = null
  }

  // 关闭 WebSocket 连接
  if (ws) {
    ws.close()
    ws = null
  }

  // 重置状态
  isConnecting = false
  wsConnected.value = false
})

// 暴露给父组件
defineExpose({
  resetConnection
})
</script>

<style scoped>
.proxy-logs {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #ffffff;
  border-top: 1px solid #e5e7eb;
}

.logs-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #e5e7eb;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #18181b;
}

.today-stats {
  display: flex;
  align-items: center;
  gap: 6px;
}

.today-stats :deep(.n-tag) {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
}

.logs-table {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.table-header {
  flex-shrink: 0;
  display: flex;
  padding: 8px 12px;
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
  font-size: 11px;
  font-weight: 600;
  color: #6b7280;
  white-space: nowrap;
}

.table-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding-bottom: 40px;
  scroll-padding-bottom: 40px;
}

.table-row {
  display: flex;
  padding: 8px 12px;
  border-bottom: 1px solid #f3f4f6;
  font-size: 12px;
  transition: background-color 0.2s;
  cursor: pointer;
}

.table-row:hover {
  background: #f9fafb;
}

.table-row-content {
  display: flex;
  width: 100%;
}

/* 行为日志样式 */
.action-row {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid #f3f4f6;
  background: #f0fdf4;
  font-size: 13px;
  color: #166534;
  border-left: 3px solid #18a058;
}

.action-message {
  flex: 1;
  font-weight: 500;
}

.action-time {
  font-size: 11px;
  font-family: monospace;
  color: #6b7280;
  margin-left: 12px;
  margin-right: 7px;
}

.col {
  display: flex;
  align-items: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.col-channel {
  flex: 0 0 120px;
  min-width: 0;
  overflow: hidden;
}

.col-channel .n-tag {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}

.col-token {
  flex: 0 0 65px;
  justify-content: center;
  min-width: 0;
}

.col-time {
  flex: 0 0 70px;
  min-width: 0;
  font-family: monospace;
  font-size: 11px;
  justify-content: flex-end;
}

.empty-state {
  padding: 40px 16px;
  text-align: center;
  font-size: 13px;
  color: #9ca3af;
}

.logs-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  border-top: 1px solid #e5e7eb;
  font-size: 12px;
  color: #6b7280;
}

.status {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #ef4444;
}

.status.connected {
  color: #10b981;
}

.count {
  color: #6b7280;
}
</style>
