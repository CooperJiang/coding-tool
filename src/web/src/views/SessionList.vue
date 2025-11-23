<template>
  <div class="session-list-container">
      <!-- Fixed Header -->
      <div class="header">
      <div class="title-bar">
        <n-button size="small" @click="goBack" class="back-button">
          <template #icon>
            <n-icon size="18"><ArrowBackOutline /></n-icon>
          </template>
        </n-button>

        <div class="title-section">
          <div class="title-with-count">
            <n-h2>{{ projectDisplayName }}</n-h2>
            <n-text depth="3" class="session-count">({{ store.sessions.length }} 个对话)</n-text>
            <n-tag size="small" :bordered="false" type="info" class="total-size-tag">
              {{ formatSize(store.totalSize) }}
            </n-tag>
          </div>
          <n-text depth="3" class="project-path">{{ displayProjectPath }}</n-text>
        </div>

        <!-- Search Bar -->
        <n-input
          v-model:value="searchQuery"
          placeholder="搜索会话..."
          clearable
          class="search-input"
          @keyup.enter="handleSearch"
          :disabled="searching"
        >
          <template #prefix>
            <n-icon><SearchOutline /></n-icon>
          </template>
          <template #suffix>
            <n-button text @click="handleSearch" :disabled="!searchQuery || searching" :loading="searching">
              搜索
            </n-button>
          </template>
        </n-input>
      </div>
    </div>

    <!-- Scrollable Content -->
    <div class="content" ref="contentEl">
      <!-- Loading -->
      <div v-if="store.loading" class="loading-container">
        <n-spin size="large">
          <template #description>
            加载会话列表...
          </template>
        </n-spin>
      </div>

      <!-- Error -->
      <n-alert v-else-if="store.error" type="error" title="加载失败" style="margin-bottom: 16px;">
        {{ store.error }}
      </n-alert>

      <!-- Sessions List with Draggable -->
      <draggable
      v-else-if="filteredSessions.length > 0"
      v-model="orderedSessions"
      item-key="sessionId"
      handle=".drag-handle"
      ghost-class="ghost"
      chosen-class="chosen"
      animation="200"
      @end="handleDragEnd"
    >
      <template #item="{ element: session }">
        <div
          class="session-item"
          @mouseenter="hoveredSession = session.sessionId"
          @mouseleave="hoveredSession = null"
          @click="handleViewChatHistory(session)"
        >
          <!-- Drag Handle -->
          <div class="drag-handle">
            <n-icon size="16" color="#999">
              <ReorderThreeOutline />
            </n-icon>
          </div>

          <!-- Left Content -->
          <div class="session-left">
            <div class="session-icon">
              <n-icon size="24" color="#18a058">
                <ChatbubbleEllipsesOutline />
              </n-icon>
            </div>

            <div class="session-info">
              <div class="session-header">
                <div class="session-title-row">
                  <span class="session-title">
                    {{ session.alias ? `${session.alias} (${session.sessionId.substring(0, 8)})` : session.sessionId }}
                  </span>
                  <n-tooltip v-if="session.forkedFrom" placement="top">
                    <template #trigger>
                      <n-tag size="small" type="warning" :bordered="false" style="margin-left: 8px; cursor: help;">
                        <template #icon>
                          <n-icon><GitBranchOutline /></n-icon>
                        </template>
                        Fork
                      </n-tag>
                    </template>
                    Fork 自: {{ session.forkedFrom }}
                  </n-tooltip>
                </div>
              </div>

              <div class="session-meta">
                <n-text depth="3">{{ formatTime(session.mtime) }}</n-text>
                <n-text depth="3">•</n-text>
                <n-tag size="small" :bordered="false">{{ formatSize(session.size) }}</n-tag>
              </div>

              <n-text depth="3" class="session-message" v-if="session.firstMessage">
                {{ session.firstMessage }}
              </n-text>
              <n-text depth="3" class="session-message session-message-empty" v-else>
                暂未读取到对话首条消息记录
              </n-text>
            </div>
          </div>

          <!-- Right Content (上下布局) -->
          <div class="session-right">
            <!-- 上部：分支标签区域 -->
            <div class="session-tags-area">
              <n-tag v-if="session.gitBranch" size="small" type="info" :bordered="false">
                <template #icon>
                  <n-icon><GitBranchOutline /></n-icon>
                </template>
                {{ session.gitBranch }}
              </n-tag>
            </div>

            <!-- 下部：操作按钮 -->
            <div class="session-actions">
              <n-space>
                <n-button
                  v-show="hoveredSession === session.sessionId"
                  size="small"
                  type="error"
                  @click.stop="handleDelete(session.sessionId)"
                >
                  <template #icon>
                    <n-icon><TrashOutline /></n-icon>
                  </template>
                  删除
                </n-button>
                <n-button size="small" @click.stop="handleSetAlias(session)">
                  <template #icon>
                    <n-icon><CreateOutline /></n-icon>
                  </template>
                  别名
                </n-button>
                <n-button size="small" @click.stop="handleFork(session.sessionId)">
                  <template #icon>
                    <n-icon><GitBranchOutline /></n-icon>
                  </template>
                  Fork
                </n-button>
                <n-button size="small" type="primary" @click.stop="handleLaunchTerminal(session.sessionId)">
                  <template #icon>
                    <n-icon><TerminalOutline /></n-icon>
                  </template>
                  使用对话
                </n-button>
              </n-space>
            </div>
          </div>
        </div>
      </template>
    </draggable>

      <!-- Empty State -->
      <n-empty
        v-else
        description="没有找到会话"
        style="margin-top: 60px;"
      >
        <template #icon>
          <n-icon><DocumentTextOutline /></n-icon>
        </template>
      </n-empty>
    </div>

    <!-- Alias Dialog -->
    <n-modal v-model:show="showAliasDialog" preset="dialog" title="设置别名">
      <n-input
        v-model:value="editingAlias"
        placeholder="输入别名（留空删除）"
        @keyup.enter="confirmAlias"
      />
      <template #action>
        <n-space>
          <n-button @click="showAliasDialog = false">取消</n-button>
          <n-button type="primary" @click="confirmAlias">确定</n-button>
        </n-space>
      </template>
    </n-modal>

    <!-- Search Results Dialog -->
    <n-modal v-model:show="showSearchResults" preset="card" title="搜索结果" style="width: 1200px;">
      <div v-if="searchResults" style="max-height: 70vh; overflow-y: auto;">
        <n-alert type="info" style="margin-bottom: 16px;">
          关键词 "{{ searchResults.keyword }}" 共找到 {{ searchResults.totalMatches }} 处匹配
        </n-alert>

        <div v-for="session in searchResults.sessions" :key="session.sessionId" class="search-result-item">
          <div class="search-result-header">
            <div class="search-result-title">
              <n-text strong>
                {{ session.alias ? `${session.alias} (${session.sessionId.substring(0, 8)})` : session.sessionId.substring(0, 8) }}
              </n-text>
              <n-tag size="small" :bordered="false">{{ session.matchCount }} 个匹配</n-tag>
            </div>
            <n-button size="small" type="primary" @click="handleLaunchTerminal(session.sessionId)">
              <template #icon>
                <n-icon><TerminalOutline /></n-icon>
              </template>
              使用对话
            </n-button>
          </div>
          <div v-for="(match, idx) in session.matches" :key="idx" class="search-match">
            <n-tag size="tiny" :type="match.role === 'user' ? 'info' : 'success'" :bordered="false">
              {{ match.role === 'user' ? '用户' : '助手' }}
            </n-tag>
            <n-text depth="3" class="search-match-text" v-html="highlightKeyword(match.context, searchResults.keyword)"></n-text>
          </div>
        </div>

        <n-empty v-if="searchResults.sessions.length === 0" description="没有找到匹配的内容" />
      </div>
    </n-modal>

    <!-- Chat History Drawer -->
    <ChatHistoryDrawer
      ref="chatHistoryRef"
      v-if="selectedSessionId"
      v-model:show="showChatHistory"
      :project-name="props.projectName"
      :session-id="selectedSessionId"
      :session-alias="selectedSessionAlias"
      :channel="currentChannel"
      @error="handleChatHistoryError"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  NButton, NIcon, NH2, NText, NInput, NSpin, NAlert, NEmpty,
  NTag, NSpace, NModal, NTooltip
} from 'naive-ui'
import {
  ArrowBackOutline, SearchOutline, DocumentTextOutline,
  ChatbubbleEllipsesOutline, GitBranchOutline, CreateOutline, TrashOutline,
  ReorderThreeOutline, TerminalOutline
} from '@vicons/ionicons5'
import draggable from 'vuedraggable'
import { useSessionsStore } from '../stores/sessions'
import message, { dialog } from '../utils/message'
import api from '../api'
import ChatHistoryDrawer from '../components/ChatHistoryDrawer.vue'

const props = defineProps({
  projectName: {
    type: String,
    required: true
  }
})

const router = useRouter()
const route = useRoute()
const store = useSessionsStore()

// 当前渠道
const currentChannel = computed(() => route.meta.channel || 'claude')

const searchQuery = ref('')
const showAliasDialog = ref(false)
const editingSession = ref(null)
const editingAlias = ref('')
const hoveredSession = ref(null)
const orderedSessions = ref([])
const searchResults = ref(null)
const showSearchResults = ref(false)
const contentEl = ref(null)
const searching = ref(false)

// Chat history drawer state
const showChatHistory = ref(false)
const selectedSessionId = ref('')
const selectedSessionAlias = ref('')
const chatHistoryRef = ref(null)

// Project display name (使用后端解析的名称)
const projectDisplayName = computed(() => {
  return store.currentProjectInfo?.displayName || props.projectName
})

// Full project path (使用后端解析的路径)
const displayProjectPath = computed(() => {
  return store.currentProjectInfo?.fullPath || props.projectName
})

// Sync with store
watch(() => store.sessionsWithAlias, (newSessions) => {
  orderedSessions.value = [...newSessions]
}, { immediate: true })

const filteredSessions = computed(() => {
  if (!searchQuery.value) return orderedSessions.value

  const query = searchQuery.value.toLowerCase()
  return orderedSessions.value.filter(session => {
    return (
      session.sessionId.toLowerCase().includes(query) ||
      (session.alias && session.alias.toLowerCase().includes(query)) ||
      (session.firstMessage && session.firstMessage.toLowerCase().includes(query)) ||
      (session.gitBranch && session.gitBranch.toLowerCase().includes(query))
    )
  })
})

function goBack() {
  const channel = route.meta.channel || 'claude'
  router.push({ name: `${channel}-projects` })
}

async function handleSearch() {
  if (!searchQuery.value) return

  searching.value = true
  try {
    // 增加上下文长度到 35 (15 + 20)
    const data = await api.searchSessions(props.projectName, searchQuery.value, 35, currentChannel.value)
    searchResults.value = data
    showSearchResults.value = true
  } catch (err) {
    message.error('搜索失败: ' + err.message)
  } finally {
    searching.value = false
  }
}

async function handleDragEnd() {
  const order = orderedSessions.value.map(s => s.sessionId)
  await store.saveSessionOrder(order)
}

function handleSetAlias(session) {
  editingSession.value = session
  editingAlias.value = session.alias || ''
  showAliasDialog.value = true
}

async function confirmAlias() {
  if (!editingSession.value) return

  try {
    const sessionId = editingSession.value.sessionId
    if (editingAlias.value) {
      await store.setAlias(sessionId, editingAlias.value)
      message.success('别名设置成功')
    } else {
      await store.deleteAlias(sessionId)
      message.success('别名已删除')
    }
    showAliasDialog.value = false
    editingSession.value = null
    editingAlias.value = ''
  } catch (err) {
    message.error('操作失败: ' + err.message)
  }
}

async function handleFork(sessionId) {
  try {
    await store.forkSession(sessionId)
    message.success('Fork 成功!')
  } catch (err) {
    message.error('Fork 失败: ' + err.message)
  }
}

// View chat history
function handleViewChatHistory(session) {
  selectedSessionId.value = session.sessionId
  selectedSessionAlias.value = session.alias || ''
  showChatHistory.value = true
  nextTick(() => {
    chatHistoryRef.value?.open()
  })
}

// Handle chat history error
function handleChatHistoryError(errorMsg) {
  message.error(errorMsg)
}

async function handleLaunchTerminal(sessionId) {
  try {
    await api.launchTerminal(props.projectName, sessionId, currentChannel.value)
    message.success('已启动终端')
  } catch (err) {
    message.error('启动失败: ' + err.message)
  }
}

function handleDelete(sessionId) {
  dialog.warning({
    title: '删除会话',
    content: '确定要删除这个会话吗？此操作不可恢复！',
    positiveText: '确定删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await store.deleteSession(sessionId)
        message.success('会话已删除')
      } catch (err) {
        message.error('删除失败: ' + err.message)
      }
    }
  })
}

function formatTime(timestamp) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN')
}

function formatSize(bytes) {
  if (!bytes) return '0 B'
  const k = 1024
  if (bytes < k) return bytes + ' B'
  if (bytes < k * k) return (bytes / k).toFixed(1) + ' KB'
  return (bytes / k / k).toFixed(1) + ' MB'
}

// 高亮关键字
function highlightKeyword(text, keyword) {
  if (!keyword || !text) return text
  const regex = new RegExp(`(${keyword})`, 'gi')
  return text.replace(regex, '<mark style="background-color: #ffd700; padding: 2px 4px; border-radius: 2px; font-weight: 600;">$1</mark>')
}

// 保存和恢复滚动位置
async function refreshDataWithScrollPreservation() {
  // Save scroll position
  const scrollTop = contentEl.value?.scrollTop || 0

  // Fetch data
  await store.fetchSessions(props.projectName)

  // Restore scroll position after DOM update
  await nextTick()
  if (contentEl.value) {
    contentEl.value.scrollTop = scrollTop
  }
}

// 【暂时移除】页面可见性变化时刷新数据
// 原因：每次切换回来就刷新，体验不好
// function handleVisibilityChange() {
//   if (document.visibilityState === 'visible') {
//     refreshDataWithScrollPreservation()
//   }
// }

// 【暂时移除】窗口获得焦点时刷新数据
// 原因：每次切换回来就刷新，体验不好
// function handleWindowFocus() {
//   refreshDataWithScrollPreservation()
// }

// 监听 channel 变化
watch(currentChannel, (newChannel) => {
  store.setChannel(newChannel)
  store.fetchSessions(props.projectName)
}, { immediate: true })

onMounted(() => {
  // 【暂时移除】添加事件监听 - 每次切换回来就刷新，体验不好
  // document.addEventListener('visibilitychange', handleVisibilityChange)
  // window.addEventListener('focus', handleWindowFocus)
})

onUnmounted(() => {
  // 【暂时移除】清理事件监听
  // document.removeEventListener('visibilitychange', handleVisibilityChange)
  // window.removeEventListener('focus', handleWindowFocus)
})
</script>

<style scoped>
.session-list-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.header {
  flex-shrink: 0;
  padding: 24px 24px 16px 24px;
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-primary);
}

.content {
  flex: 1;
  overflow-y: auto;
  padding: 16px 24px 24px 24px;
}

.back-button {
  flex-shrink: 0;
  margin-right: 12px;
}

.title-bar {
  display: flex;
  align-items: center;
  gap: 16px;
}

.title-section {
  flex: 1;
  min-width: 0;
}

.title-with-count {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 2px;
}

.title-section h2 {
  margin: 0;
  font-size: 20px;
}

.session-count {
  font-size: 14px;
  color: #666;
}

.total-size-tag {
  margin-left: 8px;
}

.project-path {
  font-size: 13px;
  display: block;
  color: #666;
  margin-bottom: 2px;
}

.search-input {
  width: 320px;
  flex-shrink: 0;
}

.loading-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
}

/* Session Item */
.session-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  margin-bottom: 8px;
  transition: all 0.2s;
  cursor: pointer;
}

.session-item:hover {
  border-color: #18a058;
  box-shadow: 0 2px 8px rgba(24, 160, 88, 0.1);
}

.drag-handle {
  cursor: move;
  width: 24px;
  height: 24px;
  padding: 4px;
  opacity: 0.4;
  transition: all 0.2s;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.session-item:hover .drag-handle {
  opacity: 1;
  background-color: rgba(24, 160, 88, 0.1);
  border-radius: 4px;
}

/* Left Content - 左侧内容区 */
.session-left {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
}

.session-icon {
  flex-shrink: 0;
}

.session-info {
  flex: 1;
  min-width: 0;
}

.session-header {
  display: flex;
  align-items: center;
  margin-bottom: 6px;
}

.session-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.session-title {
  font-size: 15px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 1;
  min-width: 0;
}

.session-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 13px;
}

.session-message {
  display: block;
  max-width: 600px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.session-message-empty {
  font-style: italic;
  opacity: 0.5;
}

/* Right Content - 右侧内容区（上下布局） */
.session-right {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: flex-end;
  min-width: 280px;
  flex-shrink: 0;
  gap: 12px;
}

.session-tags-area {
  min-height: 24px;
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
}

.session-actions {
  display: flex;
  align-items: center;
  margin-top: auto;
}

/* Draggable states */
.ghost {
  opacity: 0.4;
}

.chosen {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
}

/* Search Results */
.search-result-item {
  margin-bottom: 16px;
  padding: 12px;
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  background: var(--bg-elevated);
}

.search-result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.search-result-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.search-match {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 6px;
  padding: 6px;
  background: var(--bg-secondary);
  border-radius: 4px;
}

.search-match-text {
  flex: 1;
  line-height: 1.6;
}
</style>
