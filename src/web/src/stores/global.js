import { defineStore } from 'pinia'
import { ref, reactive, computed } from 'vue'
import axios from 'axios'

const ADVANCED_CONFIG_FLAG = '__ccAdvancedConfigBound__'
let ws = null
let reconnectAttempts = 0
let isReceivingHistory = false
let historyTimer = null

function computeTodayRange() {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  return {
    start: start.getTime(),
    end: start.getTime() + 24 * 60 * 60 * 1000
  }
}

export const useGlobalStore = defineStore('global', () => {
  const claudeProxy = ref({
    running: false,
    activeChannel: null,
    port: 10088,
    runtime: null,
    startTime: null,
    defaultPort: 10088
  })

  const codexProxy = ref({
    running: false,
    activeChannel: null,
    port: 10089,
    runtime: null,
    startTime: null,
    defaultPort: 10089
  })

  const geminiProxy = ref({
    running: false,
    activeChannel: null,
    port: 10090,
    runtime: null,
    startTime: null,
    defaultPort: 10090
  })

  const claudeChannels = ref([])
  const codexChannels = ref([])
  const geminiChannels = ref([])

  // 调度状态（实时并发信息）
  const schedulerState = reactive({
    claude: { channels: [], pending: 0 },
    codex: { channels: [], pending: 0 },
    gemini: { channels: [], pending: 0 }
  })

  const logsBySource = reactive({
    claude: [],
    codex: [],
    gemini: []
  })
  const wsConnected = ref(false)
  const logLimit = ref(100)
  const statsInterval = ref(30)
  let maxLogsLimit = 100
  let todayRange = computeTodayRange()

  function ensureTodayRange() {
    const now = Date.now()
    if (now < todayRange.start || now >= todayRange.end) {
      todayRange = computeTodayRange()
      clearLogsState()
    }
  }

  function isToday(timestamp) {
    ensureTodayRange()
    return timestamp >= todayRange.start && timestamp < todayRange.end
  }

  function trimBuffer(buffer) {
    while (buffer.length > maxLogsLimit) {
      buffer.pop()
    }
  }

  function setMaxLogsLimit(limit) {
    maxLogsLimit = limit
    logLimit.value = limit
    Object.values(logsBySource).forEach(trimBuffer)
  }

  function setStatsIntervalValue(interval) {
    const parsed = parseInt(interval, 10)
    if (Number.isNaN(parsed)) return
    const clamped = Math.min(Math.max(parsed, 10), 300)
    if (statsInterval.value !== clamped) {
      statsInterval.value = clamped
    }
  }

  async function loadAdvancedConfig() {
    try {
      const response = await fetch('/api/config/advanced')
      if (response.ok) {
        const data = await response.json()
        setMaxLogsLimit(data.maxLogs || 100)
        if (data.statsInterval) {
          setStatsIntervalValue(data.statsInterval)
        }
      }
    } catch (err) {
      console.error('Failed to load advanced config:', err)
    }
  }

  function detectLogSource(data) {
    if (data.source) return data.source

    if (data.toolType === 'codex') return 'codex'
    if (data.toolType === 'gemini') return 'gemini'
    if (data.toolType === 'claude' || data.toolType === 'claude-code') return 'claude'

    if (data.model) {
      const model = data.model.toLowerCase()
      if (model.includes('claude')) return 'claude'
      if (model.includes('gpt') || model.includes('o1') || model.includes('o3')) return 'codex'
      if (model.includes('gemini')) return 'gemini'
    }

    if (data.channel) {
      if (claudeChannels.value.find(ch => ch.name === data.channel)) return 'claude'
      if (codexChannels.value.find(ch => ch.name === data.channel)) return 'codex'
      if (geminiChannels.value.find(ch => ch.name === data.channel)) return 'gemini'
    }

    if (data.action?.includes('codex')) return 'codex'
    if (data.action?.includes('gemini')) return 'gemini'
    return 'claude'
  }

  function appendLogEntry(data) {
    const source = detectLogSource(data)
    const buffer = logsBySource[source]
    if (!buffer) {
      console.warn('[GlobalState] 未识别来源日志，丢弃: ', data)
      return
    }

    const timestamp = data.timestamp || Date.now()
    if (!isToday(timestamp)) {
      console.warn('[GlobalState] 丢弃非今日日志:', new Date(timestamp).toISOString())
      return
    }
    const time = data.time || new Date(timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })

    const entry = {
      id: data.id || `${Date.now()}-${Math.random()}`,
      source,
      type: data.type || (data.action ? 'action' : 'log'),
      action: data.action || null,
      channel: data.channel || data.channelName || 'Unknown',
      model: data.model,
      message: data.message,
      timestamp,
      time,
      tokens: {
        input: data.inputTokens || 0,
        output: data.outputTokens || 0,
        cacheCreation: data.cacheCreation || 0,
        cacheRead: data.cacheRead || 0,
        cached: data.cachedTokens || 0,
        reasoning: data.reasoningTokens || 0,
        total: data.totalTokens || ((data.inputTokens || 0) + (data.outputTokens || 0))
      },
      cost: data.cost || 0,
      isHistory: isReceivingHistory,
      isNew: !isReceivingHistory
    }

    buffer.unshift(entry)
    trimBuffer(buffer)

    if (entry.isNew) {
      setTimeout(() => {
        entry.isNew = false
      }, 4500)
    }
  }

  function clearLogsState() {
    Object.keys(logsBySource).forEach((key) => {
      logsBySource[key].splice(0, logsBySource[key].length)
    })
  }

  function getLogs(source) {
    return computed(() => logsBySource[source] || [])
  }

  function clearLogsForSource(source) {
    if (logsBySource[source]) {
      logsBySource[source].splice(0, logsBySource[source].length)
    }
  }

  function patchProxyState(targetRef, proxy = {}, activeChannel) {
    targetRef.value = {
      ...targetRef.value,
      ...proxy,
      activeChannel: activeChannel || targetRef.value.activeChannel
    }
  }

  if (typeof window !== 'undefined' && !window[ADVANCED_CONFIG_FLAG]) {
    window.addEventListener('advanced-config-change', (event) => {
      if (event.detail?.maxLogs) {
        setMaxLogsLimit(event.detail.maxLogs)
      }
      if (event.detail?.statsInterval) {
        setStatsIntervalValue(event.detail.statsInterval)
      }
    })
    window[ADVANCED_CONFIG_FLAG] = true
  }

  function handleProxyStateUpdate(data) {
    const { source, proxy, activeChannel, channels } = data

    if (source === 'claude') {
      patchProxyState(claudeProxy, proxy, activeChannel)
      if (channels) claudeChannels.value = channels
    } else if (source === 'codex') {
      patchProxyState(codexProxy, proxy, activeChannel)
      if (channels) codexChannels.value = channels
    } else if (source === 'gemini') {
      patchProxyState(geminiProxy, proxy, activeChannel)
      if (channels) geminiChannels.value = channels
    }
  }

  function handleSchedulerStateUpdate(data) {
    const { source, scheduler } = data
    if (schedulerState[source] && scheduler) {
      schedulerState[source] = scheduler
    }
  }

  async function initializeState() {
    try {
      const [claudeRes, codexRes, geminiRes] = await Promise.all([
        axios.get('/api/proxy/status').catch(() => ({})),
        axios.get('/api/codex/proxy/status').catch(() => ({})),
        axios.get('/api/gemini/proxy/status').catch(() => ({}))
      ])

      if (claudeRes.data?.proxy) {
        patchProxyState(claudeProxy, claudeRes.data.proxy, claudeRes.data.activeChannel)
      }
      if (codexRes.data?.proxy) {
        patchProxyState(codexProxy, codexRes.data.proxy, codexRes.data.activeChannel)
      }
      if (geminiRes.data?.proxy) {
        patchProxyState(geminiProxy, geminiRes.data.proxy, geminiRes.data.activeChannel)
      }
    } catch (error) {
      console.error('Failed to initialize global state:', error)
    }
  }

  async function loadChannels() {
    try {
      const [claudeRes, codexRes, geminiRes, claudePool, codexPool, geminiPool] = await Promise.all([
        axios.get('/api/channels').catch(() => ({ data: { channels: [] } })),
        axios.get('/api/codex/channels').catch(() => ({ data: { channels: [] } })),
        axios.get('/api/gemini/channels').catch(() => ({ data: { channels: [] } })),
        axios.get('/api/channels/pool/status?source=claude').catch(() => ({ data: null })),
        axios.get('/api/channels/pool/status?source=codex').catch(() => ({ data: null })),
        axios.get('/api/channels/pool/status?source=gemini').catch(() => ({ data: null }))
      ])

      claudeChannels.value = claudeRes.data.channels || []
      codexChannels.value = codexRes.data.channels || []
      geminiChannels.value = geminiRes.data.channels || []

      if (claudePool.data?.scheduler) {
        schedulerState.claude = claudePool.data.scheduler
      }
      if (codexPool.data?.scheduler) {
        schedulerState.codex = codexPool.data.scheduler
      }
      if (geminiPool.data?.scheduler) {
        schedulerState.gemini = geminiPool.data.scheduler
      }
    } catch (error) {
      console.error('Failed to load channels:', error)
    }
  }

  function getProxyState(type) {
    if (type === 'codex') return codexProxy
    if (type === 'gemini') return geminiProxy
    return claudeProxy
  }

  function getChannels(type) {
    if (type === 'codex') return codexChannels
    if (type === 'gemini') return geminiChannels
    return claudeChannels
  }

  function getSchedulerState(type) {
    return schedulerState[type] || { channels: [], pending: 0 }
  }

  async function startProxy(type) {
    let endpoint
    if (type === 'codex') {
      endpoint = '/api/codex/proxy/start'
    } else if (type === 'gemini') {
      endpoint = '/api/gemini/proxy/start'
    } else {
      endpoint = '/api/proxy/start'
    }

    const response = await axios.post(endpoint)
    if (response.data.success) {
      const proxyState = getProxyState(type)
      proxyState.value.running = true
      proxyState.value.activeChannel = response.data.activeChannel
      proxyState.value.startTime = Date.now()
    }
    return response.data
  }

  async function stopProxy(type) {
    let endpoint
    if (type === 'codex') {
      endpoint = '/api/codex/proxy/stop'
    } else if (type === 'gemini') {
      endpoint = '/api/gemini/proxy/stop'
    } else {
      endpoint = '/api/proxy/stop'
    }

    const response = await axios.post(endpoint)
    const proxyState = getProxyState(type)
    proxyState.value.running = false
    proxyState.value.activeChannel = null
    proxyState.value.startTime = null
    proxyState.value.runtime = null
    return response.data
  }

  function connectWebSocket() {
    if (ws && ws.readyState === WebSocket.OPEN) {
      return
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws`

    try {
      ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        reconnectAttempts = 0
        wsConnected.value = true
        isReceivingHistory = true
        clearTimeout(historyTimer)
        historyTimer = setTimeout(() => {
          isReceivingHistory = false
        }, 2000)
        initializeState()
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === 'proxy-state') {
            handleProxyStateUpdate(data)
          } else if (data.type === 'scheduler-state') {
            handleSchedulerStateUpdate(data)
          } else {
            appendLogEntry(data)
          }
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err)
        }
      }

      ws.onclose = () => {
        wsConnected.value = false
        ws = null
        isReceivingHistory = false
        clearTimeout(historyTimer)
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000)
        reconnectAttempts += 1
        setTimeout(connectWebSocket, delay)
      }

      ws.onerror = (error) => {
        wsConnected.value = false
        console.error('WebSocket error:', error)
      }
    } catch (error) {
      wsConnected.value = false
      console.error('Failed to connect WebSocket:', error)
    }
  }

  return {
    claudeProxy,
    codexProxy,
    geminiProxy,
    claudeChannels,
    codexChannels,
    geminiChannels,
    schedulerState,
    connectWebSocket,
    initializeState,
    loadChannels,
    getProxyState,
    getChannels,
    getSchedulerState,
    handleProxyStateUpdate,
    startProxy,
    stopProxy,
    getLogs,
    wsConnected,
    clearLogsState,
    clearLogsForSource,
    logLimit,
    statsInterval,
    loadAdvancedConfig
  }
})

let isInitialized = false

export function initializeGlobalStore() {
  if (isInitialized) return
  const store = useGlobalStore()
  store.connectWebSocket()
  store.loadChannels()
  store.loadAdvancedConfig()
  isInitialized = true
}
