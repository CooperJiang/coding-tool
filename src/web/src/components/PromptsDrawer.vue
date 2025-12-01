<template>
  <n-drawer v-model:show="visible" :width="680" placement="right" :show-mask="true">
    <n-drawer-content title="Prompts 管理" closable :native-scrollbar="false">
      <template #header>
        <div class="drawer-header">
          <div class="header-title">
            <n-icon :size="20" class="header-icon">
              <DocumentTextOutline />
            </n-icon>
            <span>Prompts 管理</span>
          </div>
        </div>
      </template>

      <div class="prompts-container">
        <!-- 当前状态卡片 -->
        <div class="status-card">
          <div class="status-info">
            <template v-if="activePreset">
              <n-icon class="status-icon active" :size="18">
                <CheckmarkCircleOutline />
              </n-icon>
              <div class="status-text">
                <span class="status-label">当前激活:</span>
                <span class="status-value">{{ activePreset.name }}</span>
              </div>
            </template>
            <template v-else>
              <n-icon class="status-icon inactive" :size="18">
                <RemoveCircleOutline />
              </n-icon>
              <div class="status-text">
                <span class="status-label">未激活任何提示词</span>
              </div>
            </template>
          </div>
          <div class="status-actions">
            <n-dropdown trigger="click" :options="importOptions" @select="handleImport">
              <n-button size="small" tertiary class="action-btn">
                <template #icon>
                  <n-icon :size="14"><DownloadOutline /></n-icon>
                </template>
                导入
              </n-button>
            </n-dropdown>
            <n-button size="small" tertiary type="primary" class="action-btn" @click="openAddForm">
              <template #icon>
                <n-icon :size="14"><AddOutline /></n-icon>
              </template>
              新建
            </n-button>
            <n-tooltip trigger="hover" v-if="activePreset">
              <template #trigger>
                <n-button
                  size="small"
                  quaternary
                  class="action-btn remove-btn"
                  @click="handleDeactivate"
                  :loading="deactivating"
                >
                  <template #icon>
                    <n-icon :size="16"><CloseOutline /></n-icon>
                  </template>
                  移除
                </n-button>
              </template>
              删除各平台的提示词文件
            </n-tooltip>
          </div>
        </div>

        <!-- 统计信息 -->
        <div class="stats-bar">
          <span class="stats-text">
            共 {{ presetCount }} 个预设
            <template v-if="presetCount > 0">
              · 自定义: {{ stats.custom }} · 内置模板: {{ stats.builtin }}
            </template>
          </span>
        </div>

        <!-- 预设列表 -->
        <div class="preset-list">
          <n-spin :show="loading">
            <template v-if="presetList.length === 0 && !loading">
              <div class="empty-state">
                <n-icon :size="48" class="empty-icon">
                  <DocumentTextOutline />
                </n-icon>
                <p class="empty-title">暂无预设</p>
                <p class="empty-desc">点击上方"新建"按钮创建系统提示词预设</p>
              </div>
            </template>

            <div v-else class="preset-cards">
              <div
                v-for="preset in presetList"
                :key="preset.id"
                class="preset-card"
                :class="{ active: preset.id === activePresetId }"
              >
                <div class="card-header">
                  <div class="card-title">
                    <n-icon v-if="preset.id === activePresetId" class="active-icon" :size="16">
                      <CheckmarkCircleOutline />
                    </n-icon>
                    <span class="preset-name">{{ preset.name }}</span>
                    <n-tag v-if="preset.isBuiltin" size="tiny" :bordered="false" type="info">模板</n-tag>
                    <n-tag v-if="preset.isImported" size="tiny" :bordered="false" type="warning">已导入</n-tag>
                  </div>
                  <div class="card-actions">
                    <n-button
                      v-if="preset.id !== activePresetId"
                      size="tiny"
                      type="primary"
                      @click="handleActivate(preset)"
                      :loading="activatingId === preset.id"
                    >
                      激活
                    </n-button>
                    <n-button quaternary size="tiny" @click="openEditForm(preset)">
                      <template #icon>
                        <n-icon><CreateOutline /></n-icon>
                      </template>
                    </n-button>
                    <n-button
                      v-if="!preset.isBuiltin"
                      quaternary
                      size="tiny"
                      @click="confirmDelete(preset)"
                    >
                      <template #icon>
                        <n-icon><TrashOutline /></n-icon>
                      </template>
                    </n-button>
                  </div>
                </div>

                <p v-if="preset.description" class="card-desc">{{ preset.description }}</p>

                <div class="card-apps">
                  <span class="apps-label">生效范围:</span>
                  <n-tag
                    v-for="app in ['claude', 'codex', 'gemini']"
                    :key="app"
                    :type="preset.apps?.[app] ? 'success' : 'default'"
                    size="tiny"
                    :bordered="false"
                  >
                    {{ app }}
                  </n-tag>
                </div>

                <div class="card-preview">
                  <pre class="preview-content">{{ truncateContent(preset.content) }}</pre>
                </div>
              </div>
            </div>
          </n-spin>
        </div>
      </div>
    </n-drawer-content>
  </n-drawer>

  <!-- 添加/编辑表单 -->
  <PromptsFormDrawer
    v-model:visible="showForm"
    :editing-preset="editingPreset"
    :existing-ids="existingIds"
    @saved="handleSaved"
  />
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { NDrawer, NDrawerContent, NButton, NIcon, NSpin, NTag, NDropdown, NTooltip } from 'naive-ui'
import {
  DocumentTextOutline, AddOutline, CreateOutline, TrashOutline,
  DownloadOutline, CheckmarkCircleOutline, CloseOutline, RemoveCircleOutline
} from '@vicons/ionicons5'
import { getAllPresets, activatePreset, deletePreset, importFromPlatform, deactivatePrompt } from '../api/prompts'
import message, { dialog } from '../utils/message'
import PromptsFormDrawer from './PromptsFormDrawer.vue'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:visible'])

const visible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})

const loading = ref(false)
const presets = ref({})
const activePresetId = ref(null)
const showForm = ref(false)
const editingPreset = ref(null)
const activatingId = ref(null)
const deactivating = ref(false)

const presetList = computed(() => {
  const list = Object.values(presets.value)

  // 分离用户预设和内置模板
  const userPresets = list.filter(p => !p.isBuiltin)
  const builtinPresets = list.filter(p => p.isBuiltin)

  // 用户预设：激活的排最前，然后按更新时间排序
  userPresets.sort((a, b) => {
    if (a.id === activePresetId.value) return -1
    if (b.id === activePresetId.value) return 1
    return (b.updatedAt || 0) - (a.updatedAt || 0)
  })

  // 合并：用户预设在前，内置模板在后
  return [...userPresets, ...builtinPresets]
})

const presetCount = computed(() => presetList.value.length)

const existingIds = computed(() => Object.keys(presets.value))

const activePreset = computed(() => {
  return activePresetId.value ? presets.value[activePresetId.value] : null
})

const stats = computed(() => {
  const list = presetList.value
  return {
    builtin: list.filter(p => p.isBuiltin).length,
    custom: list.filter(p => !p.isBuiltin).length
  }
})

const importOptions = [
  { label: '从 Claude 导入', key: 'claude' },
  { label: '从 Codex 导入', key: 'codex' },
  { label: '从 Gemini 导入', key: 'gemini' }
]

// 截断内容用于预览
function truncateContent(content) {
  if (!content) return ''
  const lines = content.split('\n').slice(0, 4)
  let result = lines.join('\n')
  if (content.split('\n').length > 4) {
    result += '\n...'
  }
  return result.substring(0, 200)
}

// 加载预设列表
async function loadPresets() {
  loading.value = true
  try {
    const result = await getAllPresets()
    if (result.success) {
      presets.value = result.presets
      activePresetId.value = result.activePresetId
    }
  } catch (err) {
    console.error('Failed to load presets:', err)
    message.error('加载预设失败')
  } finally {
    loading.value = false
  }
}

// 激活预设
async function handleActivate(preset) {
  activatingId.value = preset.id
  try {
    const result = await activatePreset(preset.id)
    if (result.success) {
      activePresetId.value = preset.id
      message.success(`已激活预设 "${preset.name}"`)
    }
  } catch (err) {
    console.error('Failed to activate preset:', err)
    message.error('激活失败: ' + err.message)
  } finally {
    activatingId.value = null
  }
}

// 停用/移除提示词
async function handleDeactivate() {
  dialog.warning({
    title: '移除提示词',
    content: '确定要移除当前激活的提示词吗？这将删除各平台的提示词文件（CLAUDE.md、AGENTS.md、GEMINI.md）。',
    positiveText: '移除',
    negativeText: '取消',
    onPositiveClick: async () => {
      deactivating.value = true
      try {
        const result = await deactivatePrompt()
        if (result.success) {
          activePresetId.value = null
          message.success('已移除提示词')
        }
      } catch (err) {
        console.error('Failed to deactivate prompt:', err)
        message.error('移除失败: ' + err.message)
      } finally {
        deactivating.value = false
      }
    }
  })
}

// 确认删除
function confirmDelete(preset) {
  dialog.warning({
    title: '删除确认',
    content: `确定要删除预设 "${preset.name}" 吗？此操作不可恢复。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        const result = await deletePreset(preset.id)
        if (result.success) {
          delete presets.value[preset.id]
          message.success('删除成功')
        }
      } catch (err) {
        console.error('Failed to delete preset:', err)
        message.error('删除失败: ' + err.message)
      }
    }
  })
}

// 从平台导入
async function handleImport(platform) {
  try {
    const result = await importFromPlatform(platform)
    if (result.success) {
      presets.value[result.preset.id] = result.preset
      message.success(result.message)
    }
  } catch (err) {
    console.error('Failed to import:', err)
    message.error('导入失败: ' + err.message)
  }
}

// 打开添加表单
function openAddForm() {
  editingPreset.value = null
  showForm.value = true
}

// 打开编辑表单
function openEditForm(preset) {
  editingPreset.value = preset
  showForm.value = true
}

// 保存成功回调
function handleSaved() {
  loadPresets()
}

// 监听抽屉打开
watch(() => props.visible, (val) => {
  if (val) {
    loadPresets()
  }
})
</script>

<style scoped>
.prompts-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.header-icon {
  color: #f59e0b;
}

/* 当前状态卡片 */
.status-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  background: var(--bg-secondary);
  border-radius: 8px;
  border: 1px solid var(--border-primary);
}

.status-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.status-icon.active {
  color: #18a058;
}

.status-icon.inactive {
  color: var(--text-tertiary);
}

.status-text {
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-label {
  font-size: 13px;
  color: var(--text-secondary);
}

.status-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.status-actions {
  display: flex;
  gap: 6px;
}

.action-btn {
  font-size: 12px;
  padding: 0 12px;
  height: 26px;
  border-radius: 4px;
}

.remove-btn {
  color: var(--text-secondary);
}

.remove-btn:hover {
  color: #d03050;
  background: rgba(208, 48, 80, 0.08);
}

.stats-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: var(--bg-tertiary);
  border-radius: 6px;
}

.stats-text {
  font-size: 12px;
  color: var(--text-tertiary);
}

.preset-list {
  min-height: 200px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
}

.empty-icon {
  color: var(--text-tertiary);
  margin-bottom: 16px;
}

.empty-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 8px 0;
}

.empty-desc {
  font-size: 13px;
  color: var(--text-tertiary);
  margin: 0;
}

.preset-cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.preset-card {
  padding: 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  transition: all 0.2s ease;
}

.preset-card:hover {
  border-color: rgba(245, 158, 11, 0.3);
  box-shadow: 0 2px 8px rgba(245, 158, 11, 0.08);
}

.preset-card.active {
  border-color: rgba(24, 160, 88, 0.5);
  background: rgba(24, 160, 88, 0.03);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.card-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.active-icon {
  color: #18a058;
}

.preset-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.card-actions {
  display: flex;
  gap: 4px;
}

.card-desc {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 0 0 8px 0;
  line-height: 1.5;
}

.card-apps {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
}

.apps-label {
  font-size: 12px;
  color: var(--text-tertiary);
}

.card-preview {
  padding: 12px;
  background: var(--bg-tertiary);
  border-radius: 6px;
  overflow: hidden;
}

.preview-content {
  margin: 0;
  font-size: 11px;
  font-family: 'SF Mono', Monaco, monospace;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.5;
}
</style>
