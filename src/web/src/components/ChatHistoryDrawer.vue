<template>
  <n-drawer
    v-model:show="visible"
    :width="900"
    placement="right"
    :auto-focus="false"
    :trap-focus="false"
    :block-scroll="false"
  >
    <n-drawer-content :title="drawerTitle" :native-scrollbar="false">
      <template #header>
        <div class="drawer-header">
          <div class="header-row">
            <n-icon :size="18" :component="ChatbubblesIcon" />
            <span class="session-name">{{ sessionAlias || sessionId.substring(0, 8) }} ({{ totalMessages }})</span>
            <n-tag v-if="metadata.gitBranch" size="small" type="info">
              <template #icon>
                <n-icon :component="GitBranchIcon" />
              </template>
              {{ metadata.gitBranch }}
            </n-tag>
            <span class="spacer"></span>
            <n-icon
              :size="20"
              :component="CloseIcon"
              class="close-btn"
              @click="visible = false"
            />
          </div>
          <div v-if="metadata.summary" class="session-summary">{{ metadata.summary }}</div>
        </div>
      </template>

      <!-- Loading state -->
      <div v-if="loading && messages.length === 0" class="loading-container">
        <n-spin size="medium">
          <template #description>加载聊天记录...</template>
        </n-spin>
      </div>

      <!-- Empty state -->
      <div v-else-if="!loading && messages.length === 0" class="empty-container">
        <n-empty description="暂无聊天记录" />
      </div>

      <!-- Messages list -->
      <div v-else class="messages-container" ref="messagesContainer" @scroll="handleScroll">
        <!-- Load more button at top -->
        <div v-if="hasMore" class="load-more-top">
          <n-button
            :loading="loading"
            @click="loadMore"
            size="small"
            secondary
          >
            <template #icon>
              <n-icon :component="ChevronUpIcon" />
            </template>
            加载更早的消息
          </n-button>
        </div>

        <!-- Messages -->
        <div class="messages-list">
          <ChatMessage
            v-for="(message, index) in messages"
            :key="index"
            :message="message"
          />
        </div>

        <!-- Scroll to bottom button -->
        <div v-if="showScrollButton" class="scroll-btn" @click="scrollToBottom">
          <n-icon :size="18" :component="ArrowDownIcon" />
        </div>
      </div>
    </n-drawer-content>
  </n-drawer>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { NDrawer, NDrawerContent, NIcon, NTag, NSpin, NEmpty, NButton } from 'naive-ui'
import { Chatbubbles as ChatbubblesIcon, GitBranch as GitBranchIcon, ChevronUp as ChevronUpIcon, ArrowDown as ArrowDownIcon, Close as CloseIcon } from '@vicons/ionicons5'
import ChatMessage from './ChatMessage.vue'
import api from '../api'

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  projectName: {
    type: String,
    required: true
  },
  sessionId: {
    type: String,
    required: true
  },
  sessionAlias: {
    type: String,
    default: ''
  },
  channel: {
    type: String,
    default: 'claude'
  }
})

const emit = defineEmits(['update:show', 'error'])
const visible = computed({
  get: () => props.show,
  set: (val) => emit('update:show', val)
})

const drawerTitle = computed(() => {
  return '聊天记录'
})

// State
const loading = ref(false)
const messages = ref([])
const metadata = ref({})
const currentPage = ref(1)
const totalMessages = ref(0)
const hasMore = ref(false)
const messagesContainer = ref(null)
const showScrollButton = ref(false)

// Load messages
async function loadMessages(page = 1) {
  if (loading.value) return

  try {
    loading.value = true
    const response = await api.getSessionMessages(props.projectName, props.sessionId, page, 20, 'desc', props.channel)

    const { messages: newMessages, metadata: meta, pagination } = response

    if (page === 1) {
      // First load - reverse to show oldest first (newest at bottom)
      messages.value = newMessages.reverse()
      metadata.value = meta
    } else {
      // Load more (prepend older messages) - reverse new messages too
      messages.value = [...newMessages.reverse(), ...messages.value]
    }

    currentPage.value = pagination.page
    totalMessages.value = pagination.total
    hasMore.value = pagination.hasMore

    // Scroll to bottom on first load
    if (page === 1) {
      nextTick(() => {
        scrollToBottom(false)
      })
    }
  } catch (err) {
    console.error('Failed to load messages:', err)
    const errorMsg = '加载聊天记录失败: ' + (err.response?.data?.error || err.message)
    emit('error', errorMsg)
  } finally {
    loading.value = false
  }
}

// Load more messages
function loadMore() {
  if (!hasMore.value || loading.value) return

  // Save current scroll position
  const container = messagesContainer.value
  const oldScrollHeight = container?.scrollHeight || 0

  loadMessages(currentPage.value + 1).then(() => {
    // Restore scroll position (approximately)
    nextTick(() => {
      if (container) {
        const newScrollHeight = container.scrollHeight
        container.scrollTop = newScrollHeight - oldScrollHeight
      }
    })
  })
}

// Scroll to bottom
function scrollToBottom(smooth = true) {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTo({
        top: messagesContainer.value.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto'
      })
    }
  })
}

// Handle scroll
function handleScroll() {
  if (!messagesContainer.value) return

  const { scrollTop, scrollHeight, clientHeight } = messagesContainer.value

  // Show scroll button when not at bottom
  showScrollButton.value = scrollHeight - scrollTop - clientHeight > 200

  // Auto load more when scrolling near top
  if (scrollTop < 100 && hasMore.value && !loading.value) {
    loadMore()
  }
}

// Expose open method for parent to call
function open() {
  messages.value = []
  metadata.value = {}
  currentPage.value = 1
  totalMessages.value = 0
  hasMore.value = false
  showScrollButton.value = false
  loadMessages(1)
}

defineExpose({ open })
</script>

<style scoped>
.drawer-header {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.header-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.session-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--n-text-color);
}

.spacer {
  flex: 1;
}

.close-btn {
  cursor: pointer;
  color: var(--n-text-color-3);
  transition: color 0.2s;
}

.close-btn:hover {
  color: var(--n-text-color);
}

.session-summary {
  font-size: 13px;
  color: var(--n-text-color-2);
  line-height: 1.4;
}

.loading-container,
.empty-container {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 400px;
}

.messages-container {
  height: calc(100vh - 80px);
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 12px;
}

.load-more-top {
  display: flex;
  justify-content: center;
  padding: 16px 0;
  margin-bottom: 16px;
}

.messages-list {
  padding: 0 8px 20px 0;
}

.scroll-btn {
  position: fixed;
  right: 30px;
  bottom: 30px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--n-color);
  border: 1px solid var(--n-border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transition: all 0.2s;
}

.scroll-btn:hover {
  background: var(--n-color-hover);
  transform: scale(1.05);
}
</style>
