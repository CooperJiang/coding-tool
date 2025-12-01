<template>
  <n-drawer v-model:show="visible" :width="600" placement="right" :show-mask="true">
    <n-drawer-content closable :native-scrollbar="false">
      <template #header>
        <div class="form-header">
          <n-icon :size="18" class="header-icon">
            <DocumentTextOutline />
          </n-icon>
          <span>{{ isEditing ? '编辑预设' : '新建预设' }}</span>
        </div>
      </template>

      <div class="form-container">
        <!-- 基本信息 -->
        <div class="form-section">
          <div class="section-title">
            <n-icon :size="16"><InformationCircleOutline /></n-icon>
            <span>基本信息</span>
          </div>

          <div class="form-item">
            <label class="form-label">预设 ID <span class="required">*</span></label>
            <n-input
              v-model:value="form.id"
              placeholder="唯一标识符，如 my-preset"
              :disabled="isEditing && editingPreset?.isBuiltin"
            />
            <p v-if="idError" class="form-error">{{ idError }}</p>
          </div>

          <div class="form-item">
            <label class="form-label">名称 <span class="required">*</span></label>
            <n-input
              v-model:value="form.name"
              placeholder="预设名称"
            />
          </div>

          <div class="form-item">
            <label class="form-label">描述</label>
            <n-input
              v-model:value="form.description"
              placeholder="简短描述这个预设的用途"
            />
          </div>
        </div>

        <!-- 生效范围 -->
        <div class="form-section">
          <div class="section-title">
            <n-icon :size="16"><AppsOutline /></n-icon>
            <span>生效范围</span>
          </div>

          <div class="apps-toggles">
            <label class="app-toggle">
              <n-switch v-model:value="form.apps.claude" />
              <span class="app-name">Claude</span>
              <span class="app-path">~/.claude/CLAUDE.md</span>
            </label>
            <label class="app-toggle">
              <n-switch v-model:value="form.apps.codex" />
              <span class="app-name">Codex</span>
              <span class="app-path">~/.codex/AGENTS.md</span>
            </label>
            <label class="app-toggle">
              <n-switch v-model:value="form.apps.gemini" />
              <span class="app-name">Gemini</span>
              <span class="app-path">~/.gemini/GEMINI.md</span>
            </label>
          </div>
        </div>

        <!-- 提示词内容 -->
        <div class="form-section content-section">
          <div class="section-title">
            <n-icon :size="16"><CodeSlashOutline /></n-icon>
            <span>提示词内容</span>
            <span class="content-hint">支持 Markdown 格式</span>
          </div>

          <n-input
            v-model:value="form.content"
            type="textarea"
            placeholder="# 系统提示词&#10;&#10;在这里编写你的系统提示词..."
            :rows="16"
            class="content-editor"
          />
        </div>
      </div>

      <template #footer>
        <div class="form-footer">
          <n-button @click="handleCancel">取消</n-button>
          <n-button type="primary" @click="handleSave" :loading="saving">
            {{ isEditing ? '保存' : '创建' }}
          </n-button>
        </div>
      </template>
    </n-drawer-content>
  </n-drawer>
</template>

<script setup>
import { ref, computed, watch, reactive } from 'vue'
import { NDrawer, NDrawerContent, NButton, NIcon, NInput, NSwitch } from 'naive-ui'
import { DocumentTextOutline, InformationCircleOutline, AppsOutline, CodeSlashOutline } from '@vicons/ionicons5'
import { savePreset } from '../api/prompts'
import message from '../utils/message'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  editingPreset: {
    type: Object,
    default: null
  },
  existingIds: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['update:visible', 'saved'])

const visible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})

const isEditing = computed(() => !!props.editingPreset)

const saving = ref(false)
const idError = ref('')

const form = reactive({
  id: '',
  name: '',
  description: '',
  content: '',
  apps: {
    claude: true,
    codex: true,
    gemini: true
  }
})

// 初始化表单
function initForm() {
  if (props.editingPreset) {
    form.id = props.editingPreset.id || ''
    form.name = props.editingPreset.name || ''
    form.description = props.editingPreset.description || ''
    form.content = props.editingPreset.content || ''
    form.apps = {
      claude: props.editingPreset.apps?.claude ?? true,
      codex: props.editingPreset.apps?.codex ?? true,
      gemini: props.editingPreset.apps?.gemini ?? true
    }
  } else {
    form.id = ''
    form.name = ''
    form.description = ''
    form.content = ''
    form.apps = { claude: true, codex: true, gemini: true }
  }
  idError.value = ''
}

// 验证 ID
function validateId() {
  if (!form.id.trim()) {
    idError.value = '预设 ID 不能为空'
    return false
  }

  // ID 格式检查
  if (!/^[a-zA-Z0-9_-]+$/.test(form.id)) {
    idError.value = 'ID 只能包含字母、数字、下划线和连字符'
    return false
  }

  // 检查是否已存在（编辑时允许保持原 ID）
  if (!isEditing.value && props.existingIds.includes(form.id)) {
    idError.value = '该 ID 已被使用'
    return false
  }

  idError.value = ''
  return true
}

// 保存
async function handleSave() {
  if (!validateId()) return

  if (!form.name.trim()) {
    message.error('预设名称不能为空')
    return
  }

  saving.value = true
  try {
    const preset = {
      id: form.id.trim(),
      name: form.name.trim(),
      description: form.description.trim(),
      content: form.content,
      apps: { ...form.apps }
    }

    // 保留内置标记
    if (props.editingPreset?.isBuiltin) {
      preset.isBuiltin = true
    }

    const result = await savePreset(preset)
    if (result.success) {
      message.success(isEditing.value ? '保存成功' : '创建成功')
      emit('saved')
      visible.value = false
    }
  } catch (err) {
    console.error('Save preset failed:', err)
    message.error('保存失败: ' + err.message)
  } finally {
    saving.value = false
  }
}

// 取消
function handleCancel() {
  visible.value = false
}

// 监听打开
watch(() => props.visible, (val) => {
  if (val) {
    initForm()
  }
})
</script>

<style scoped>
.form-header {
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

.form-container {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.form-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-primary);
}

.content-hint {
  margin-left: auto;
  font-size: 12px;
  font-weight: 400;
  color: var(--text-tertiary);
}

.form-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-size: 13px;
  color: var(--text-secondary);
}

.required {
  color: #f56c6c;
}

.form-error {
  font-size: 12px;
  color: #f56c6c;
  margin: 0;
}

.apps-toggles {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.app-toggle {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.app-toggle:hover {
  border-color: rgba(245, 158, 11, 0.3);
}

.app-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  min-width: 60px;
}

.app-path {
  font-size: 12px;
  color: var(--text-tertiary);
  font-family: 'SF Mono', Monaco, monospace;
}

.content-section {
  flex: 1;
}

.content-editor {
  font-family: 'SF Mono', Monaco, monospace;
  font-size: 13px;
}

.form-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
