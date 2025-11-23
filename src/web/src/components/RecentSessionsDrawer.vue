<template>
  <n-drawer v-model:show="show" :width="1200" placement="right" :show-close="true">
    <n-drawer-content :title="channel === 'codex' ? 'Codex 最新对话' : 'Claude 最新对话'" :native-scrollbar="false" closable>
      <div v-if="loading" class="loading-container">
        <n-spin size="medium">
          <template #description>加载中...</template>
        </n-spin>
      </div>

      <div v-else-if="sessions.length > 0" class="sessions-list">
        <SessionCard
          v-for="session in sessions"
          :key="session.sessionId"
          :session="session"
          :show-project="true"
          :hide-fork="true"
          :hide-delete="true"
          @set-alias="handleSetAlias"
          @launch="handleLaunchSession"
        />
      </div>

      <n-empty
        v-else
        description="暂无最近使用的会话"
        style="margin-top: 60px;"
      >
        <template #icon>
          <n-icon size="48"><ChatbubblesOutline /></n-icon>
        </template>
      </n-empty>
    </n-drawer-content>
  </n-drawer>
</template>

<script setup>
import { ref, computed, watch, h } from 'vue'
import { NDrawer, NDrawerContent, NSpin, NEmpty, NIcon, NInput } from 'naive-ui'
import { ChatbubblesOutline } from '@vicons/ionicons5'
import SessionCard from './SessionCard.vue'
import api from '../api'
import message, { dialog } from '../utils/message'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  channel: {
    type: String,
    default: 'claude'
  }
})

const emit = defineEmits(['update:visible'])

const show = ref(false)
const sessions = ref([])
const loading = ref(false)

// 为了在 template 中使用
const channel = computed(() => props.channel)

// Sync with props
watch(() => props.visible, (val) => {
  show.value = val
  if (val) {
    loadSessions()
  }
})

// Sync with show
watch(show, (val) => {
  emit('update:visible', val)
})

async function loadSessions() {
  loading.value = true
  try {
    const data = await api.getRecentSessions(10, props.channel)
    sessions.value = data.sessions
  } catch (err) {
    console.error('Failed to load recent sessions:', err)
    message.error('加载失败: ' + err.message)
  } finally {
    loading.value = false
  }
}

// 监听 channel 变化，重新加载会话
watch(() => props.channel, () => {
  if (show.value) {
    loadSessions()
  }
})

async function handleSetAlias(session) {
  const currentAlias = session.alias || ''
  let inputValue = currentAlias

  // Create a simple prompt dialog
  const newAlias = await new Promise((resolve) => {
    const d = dialog.create({
      title: '设置别名',
      content: () => h(NInput, {
        defaultValue: currentAlias,
        placeholder: '请输入会话别名',
        'onUpdate:value': (v) => { inputValue = v },
        onKeyup: (e) => {
          if (e.key === 'Enter') {
            d.destroy()
            resolve(inputValue.trim())
          }
        }
      }),
      positiveText: '确定',
      negativeText: '取消',
      onPositiveClick: () => {
        resolve(inputValue.trim())
      },
      onNegativeClick: () => {
        resolve(null)
      }
    })
  })

  if (newAlias === null) return

  try {
    if (newAlias) {
      await api.setAlias(session.sessionId, newAlias)
      message.success('别名设置成功')
    } else {
      await api.deleteAlias(session.sessionId)
      message.success('别名已删除')
    }
    await loadSessions()
  } catch (err) {
    message.error('操作失败: ' + err.message)
  }
}

async function handleLaunchSession(session) {
  try {
    await api.launchTerminal(session.projectName, session.sessionId, props.channel)
    message.success('已启动终端')
  } catch (err) {
    message.error('启动失败: ' + err.message)
  }
}
</script>

<style scoped>
.loading-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 200px;
}

.sessions-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}
</style>
