<template>
  <n-modal
    v-model:show="visible"
    preset="card"
    :title="null"
    :bordered="false"
    :closable="true"
    :mask-closable="false"
    style="width: 560px; max-width: 90vw;"
    @close="handleClose"
  >
    <template #header>
      <div class="modal-header">
        <n-icon class="warning-icon" :size="22">
          <WarningOutline />
        </n-icon>
        <span class="header-title">检测到环境变量冲突</span>
      </div>
    </template>

    <div class="modal-content">
      <p class="desc-text">
        发现 <strong>{{ conflicts.length }}</strong> 个环境变量可能影响代理配置，建议清理后再使用代理功能。
      </p>

      <n-alert v-if="hasProcessEnvOnly" type="info" :bordered="false" class="process-env-alert">
        <template #icon>
          <n-icon><InformationCircleOutline /></n-icon>
        </template>
        <div class="alert-content">
          <p class="alert-title">这些环境变量来自当前进程，请按以下步骤处理：</p>
          <ol class="alert-list">
            <li>检查配置文件（~/.zshrc 或 ~/.bashrc）中是否有 export 这些变量</li>
            <li>如果有，删除或注释掉相关行</li>
            <li><strong>重启终端</strong>，然后重新运行 <code>ct</code></li>
          </ol>
          <p class="alert-hint">如果配置文件中没有，可能是终端临时设置的，直接重启终端即可</p>
        </div>
      </n-alert>

      <div class="conflict-list">
        <div class="list-header">
          <n-checkbox
            :checked="isAllSelected"
            :indeterminate="isIndeterminate"
            @update:checked="toggleSelectAll"
          >
            全选
          </n-checkbox>
          <span class="selected-hint" v-if="selectedCount > 0">
            已选 {{ selectedCount }} 项
          </span>
        </div>

        <n-scrollbar style="max-height: 280px;">
          <div class="conflict-items">
            <div
              v-for="conflict in conflicts"
              :key="getConflictKey(conflict)"
              class="conflict-item"
              :class="{ selected: selectedKeys.has(getConflictKey(conflict)) }"
              @click="toggleSelection(conflict)"
            >
              <n-checkbox
                :checked="selectedKeys.has(getConflictKey(conflict))"
                @click.stop
                @update:checked="(val) => setSelection(conflict, val)"
              />
              <div class="item-content">
                <div class="item-header">
                  <code class="var-name">{{ conflict.varName }}</code>
                  <n-tag :type="getPlatformType(conflict.platform)" size="tiny" :bordered="false">
                    {{ conflict.platform }}
                  </n-tag>
                </div>
                <div class="var-value">{{ conflict.varValue }}</div>
                <div class="var-source">
                  <span class="source-label">来源:</span>
                  {{ getSourceText(conflict) }}
                </div>
              </div>
            </div>
          </div>
        </n-scrollbar>
      </div>
    </div>

    <template #footer>
      <div class="modal-footer">
        <n-button tertiary @click="handleIgnore">
          暂时忽略
        </n-button>
        <n-button tertiary @click="handleDontRemind">
          不再提醒
        </n-button>
        <n-button
          v-if="!hasProcessEnvOnly"
          type="error"
          :disabled="selectedCount === 0"
          :loading="isDeleting"
          @click="handleDelete"
        >
          删除选中 ({{ selectedCount }})
        </n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup>
import { ref, computed } from 'vue'
import { NModal, NButton, NCheckbox, NTag, NIcon, NScrollbar, NAlert } from 'naive-ui'
import { WarningOutline, InformationCircleOutline } from '@vicons/ionicons5'
import { deleteEnvVars } from '../api/env'
import message, { dialog } from '../utils/message'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  conflicts: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['update:visible', 'deleted', 'close', 'ignore', 'never-remind'])

const visible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})

const selectedKeys = ref(new Set())
const isDeleting = ref(false)

const selectedCount = computed(() => selectedKeys.value.size)

const isAllSelected = computed(() =>
  props.conflicts.length > 0 && selectedKeys.value.size === props.conflicts.length
)

const isIndeterminate = computed(() =>
  selectedKeys.value.size > 0 && selectedKeys.value.size < props.conflicts.length
)

// 是否全部都是进程环境变量（无法删除）
const hasProcessEnvOnly = computed(() =>
  props.conflicts.length > 0 && props.conflicts.every(c => c.sourceType === 'process')
)

function getConflictKey(conflict) {
  return `${conflict.varName}:${conflict.sourcePath}`
}

function getPlatformType(platform) {
  const types = { claude: 'warning', codex: 'success', gemini: 'info' }
  return types[platform] || 'default'
}

function getSourceText(conflict) {
  if (conflict.sourceType === 'process') {
    return '进程环境变量'
  }
  return conflict.sourcePath
}

function toggleSelection(conflict) {
  const key = getConflictKey(conflict)
  if (selectedKeys.value.has(key)) {
    selectedKeys.value.delete(key)
  } else {
    selectedKeys.value.add(key)
  }
  selectedKeys.value = new Set(selectedKeys.value)
}

function setSelection(conflict, checked) {
  const key = getConflictKey(conflict)
  if (checked) {
    selectedKeys.value.add(key)
  } else {
    selectedKeys.value.delete(key)
  }
  selectedKeys.value = new Set(selectedKeys.value)
}

function toggleSelectAll(checked) {
  if (checked) {
    selectedKeys.value = new Set(props.conflicts.map(getConflictKey))
  } else {
    selectedKeys.value = new Set()
  }
}

function handleClose() {
  emit('close')
}

function handleIgnore() {
  emit('ignore')
}

function handleDontRemind() {
  emit('never-remind')
}

async function handleDelete() {
  const selectedConflicts = props.conflicts.filter(c =>
    selectedKeys.value.has(getConflictKey(c))
  )

  const processOnly = selectedConflicts.every(c => c.sourceType === 'process')
  if (processOnly) {
    message.warning('进程环境变量无法直接删除，请手动从 shell 配置文件中移除')
    return
  }

  dialog.warning({
    title: '确认删除',
    content: `确定要删除选中的 ${selectedConflicts.length} 个环境变量吗？删除前会自动备份。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      isDeleting.value = true
      try {
        const result = await deleteEnvVars(selectedConflicts)
        if (result.success) {
          message.success('删除成功，备份已保存')
          selectedKeys.value = new Set()
          emit('deleted')
        }
      } catch (err) {
        message.error('删除失败: ' + err.message)
      } finally {
        isDeleting.value = false
      }
    }
  })
}
</script>

<style scoped>
.modal-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.warning-icon {
  color: #f59e0b;
}

.header-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.modal-content {
  padding: 4px 0;
}

.desc-text {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0 0 16px 0;
  line-height: 1.6;
}

.conflict-list {
  background: var(--bg-tertiary);
  border-radius: 6px;
  padding: 12px;
}

.list-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 10px;
  margin-bottom: 10px;
  border-bottom: 1px solid var(--border-primary);
}

.selected-hint {
  font-size: 12px;
  color: var(--text-tertiary);
}

.conflict-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.conflict-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  background: var(--bg-secondary);
  border-radius: 6px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.15s ease;
}

.conflict-item:hover {
  border-color: rgba(24, 160, 88, 0.4);
  background: rgba(24, 160, 88, 0.02);
}

.conflict-item.selected {
  border-color: #18a058;
  background: rgba(24, 160, 88, 0.06);
}

.item-content {
  flex: 1;
  min-width: 0;
}

.item-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.var-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  background: var(--bg-tertiary);
  padding: 2px 6px;
  border-radius: 4px;
}

.var-value {
  font-size: 12px;
  color: var(--text-secondary);
  font-family: 'SF Mono', Monaco, monospace;
  word-break: break-all;
  margin-bottom: 4px;
}

.var-source {
  font-size: 11px;
  color: var(--text-tertiary);
}

.source-label {
  color: var(--text-quaternary);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.process-env-alert {
  margin-bottom: 16px;
}

.alert-content {
  font-size: 12px;
  line-height: 1.6;
}

.alert-title {
  margin: 0 0 8px 0;
  font-weight: 500;
}

.alert-list {
  margin: 0;
  padding-left: 20px;
}

.alert-list li {
  margin: 4px 0;
}

.alert-list code {
  background: var(--bg-tertiary);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'SF Mono', Monaco, monospace;
  font-size: 11px;
  color: #18a058;
}

.alert-hint {
  margin: 8px 0 0 0;
  font-size: 11px;
  color: var(--text-tertiary);
}
</style>
