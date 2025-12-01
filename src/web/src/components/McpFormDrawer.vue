<template>
  <n-drawer v-model:show="visible" :width="520" placement="right" :show-mask="true">
    <n-drawer-content closable :native-scrollbar="false">
      <template #header>
        <div class="drawer-header">
          <n-button quaternary size="small" @click="visible = false">
            <template #icon>
              <n-icon><ArrowBackOutline /></n-icon>
            </template>
          </n-button>
          <span class="header-title">{{ isEditing ? '编辑 MCP 服务器' : '添加 MCP 服务器' }}</span>
        </div>
      </template>

      <template #footer>
        <div class="drawer-footer">
          <n-button @click="visible = false">取消</n-button>
          <n-button type="primary" :loading="saving" @click="handleSave">
            {{ isEditing ? '保存' : '添加' }}
          </n-button>
        </div>
      </template>

      <n-spin :show="loadingPresets">
        <div class="form-content">
          <!-- 预设选择（仅新增时显示） -->
          <div v-if="!isEditing" class="form-group">
            <div class="group-title">
              <n-icon :size="16" class="group-icon"><FlashOutline /></n-icon>
              <span>快速选择</span>
            </div>
            <div class="preset-grid">
              <div
                class="preset-chip"
                :class="{ active: selectedPreset === -1 }"
                @click="selectCustom"
              >
                <n-icon :size="14"><AddOutline /></n-icon>
                <span>自定义</span>
              </div>
              <n-tooltip
                v-for="(preset, index) in presets"
                :key="preset.id"
                :disabled="!isPresetInstalled(preset.id)"
              >
                <template #trigger>
                  <div
                    class="preset-chip"
                    :class="{
                      active: selectedPreset === index,
                      disabled: isPresetInstalled(preset.id)
                    }"
                    @click="!isPresetInstalled(preset.id) && selectPreset(index)"
                  >
                    {{ preset.id }}
                    <n-icon v-if="isPresetInstalled(preset.id)" :size="12" class="installed-icon">
                      <CheckmarkCircleOutline />
                    </n-icon>
                  </div>
                </template>
                已安装
              </n-tooltip>
            </div>
          </div>

          <!-- 基本信息 -->
          <div class="form-group">
            <div class="group-title">
              <n-icon :size="16" class="group-icon"><InformationCircleOutline /></n-icon>
              <span>基本信息</span>
            </div>

            <div class="field">
              <label class="field-label">
                ID <span class="required">*</span>
              </label>
              <n-input
                v-model:value="formData.id"
                placeholder="服务器唯一标识，如 fetch、memory"
                :disabled="isEditing"
                :status="idError ? 'error' : undefined"
              />
              <span v-if="idError" class="field-error">{{ idError }}</span>
            </div>

            <div class="field">
              <label class="field-label">显示名称</label>
              <n-input
                v-model:value="formData.name"
                placeholder="可选，用于展示的名称"
              />
            </div>
          </div>

          <!-- 启用平台 -->
          <div class="form-group">
            <div class="group-title">
              <n-icon :size="16" class="group-icon"><AppsOutline /></n-icon>
              <span>启用平台</span>
            </div>
            <div class="platform-toggles">
              <label class="platform-item">
                <n-switch size="small" v-model:value="formData.apps.claude" />
                <span class="platform-name">Claude</span>
              </label>
              <label class="platform-item">
                <n-switch size="small" v-model:value="formData.apps.codex" />
                <span class="platform-name">Codex</span>
              </label>
              <label class="platform-item">
                <n-switch size="small" v-model:value="formData.apps.gemini" />
                <span class="platform-name">Gemini</span>
              </label>
            </div>
          </div>

          <!-- 服务器配置 -->
          <div class="form-group">
            <div class="group-title">
              <n-icon :size="16" class="group-icon"><ServerOutline /></n-icon>
              <span>服务器配置</span>
            </div>

            <div class="field">
              <label class="field-label">类型</label>
              <n-radio-group v-model:value="serverType" class="type-radios">
                <n-radio value="stdio">
                  <span class="radio-label">stdio</span>
                  <span class="radio-desc">本地命令</span>
                </n-radio>
                <n-radio value="http">
                  <span class="radio-label">http</span>
                </n-radio>
                <n-radio value="sse">
                  <span class="radio-label">sse</span>
                </n-radio>
              </n-radio-group>
            </div>

            <!-- stdio 配置 -->
            <template v-if="serverType === 'stdio'">
              <div class="field">
                <label class="field-label">
                  命令 <span class="required">*</span>
                </label>
                <n-input
                  v-model:value="formData.server.command"
                  placeholder="如 npx、uvx、node"
                />
              </div>

              <div class="field">
                <label class="field-label">参数</label>
                <n-dynamic-input
                  v-model:value="formData.server.args"
                  placeholder="点击添加参数"
                  :min="0"
                />
              </div>

              <div class="field">
                <label class="field-label">环境变量</label>
                <n-dynamic-input
                  v-model:value="envList"
                  :on-create="() => ({ key: '', value: '' })"
                  :min="0"
                >
                  <template #default="{ value }">
                    <div class="kv-row">
                      <n-input v-model:value="value.key" placeholder="变量名" class="kv-key" />
                      <span class="kv-sep">=</span>
                      <n-input v-model:value="value.value" placeholder="值" class="kv-value" />
                    </div>
                  </template>
                </n-dynamic-input>
              </div>
            </template>

            <!-- http/sse 配置 -->
            <template v-else>
              <div class="field">
                <label class="field-label">
                  URL <span class="required">*</span>
                </label>
                <n-input
                  v-model:value="formData.server.url"
                  placeholder="http://localhost:3000/mcp"
                />
              </div>

              <div class="field">
                <label class="field-label">请求头</label>
                <n-dynamic-input
                  v-model:value="headersList"
                  :on-create="() => ({ key: '', value: '' })"
                  :min="0"
                >
                  <template #default="{ value }">
                    <div class="kv-row">
                      <n-input v-model:value="value.key" placeholder="Header 名" class="kv-key" />
                      <span class="kv-sep">:</span>
                      <n-input v-model:value="value.value" placeholder="值" class="kv-value" />
                    </div>
                  </template>
                </n-dynamic-input>
              </div>
            </template>
          </div>

          <!-- 附加信息（可折叠） -->
          <n-collapse class="extra-collapse">
            <n-collapse-item name="extra">
              <template #header>
                <div class="collapse-header">
                  <n-icon :size="16" class="group-icon"><DocumentTextOutline /></n-icon>
                  <span>附加信息</span>
                  <span class="collapse-hint">（可选）</span>
                </div>
              </template>

              <div class="collapse-content">
                <div class="field">
                  <label class="field-label">描述</label>
                  <n-input
                    v-model:value="formData.description"
                    type="textarea"
                    placeholder="服务器功能描述"
                    :rows="2"
                  />
                </div>

                <div class="field">
                  <label class="field-label">标签</label>
                  <n-input
                    v-model:value="tagsInput"
                    placeholder="用逗号分隔，如 http, web, fetch"
                  />
                </div>

                <div class="field-row">
                  <div class="field">
                    <label class="field-label">主页</label>
                    <n-input
                      v-model:value="formData.homepage"
                      placeholder="https://github.com/..."
                    />
                  </div>
                  <div class="field">
                    <label class="field-label">文档</label>
                    <n-input
                      v-model:value="formData.docs"
                      placeholder="https://..."
                    />
                  </div>
                </div>
              </div>
            </n-collapse-item>
          </n-collapse>
        </div>
      </n-spin>
    </n-drawer-content>
  </n-drawer>
</template>

<script setup>
import { ref, computed, watch, reactive } from 'vue'
import {
  NDrawer, NDrawerContent, NButton, NIcon, NInput, NSwitch,
  NRadioGroup, NRadio, NDynamicInput, NCollapse, NCollapseItem, NSpin, NTooltip
} from 'naive-ui'
import {
  ArrowBackOutline, FlashOutline, AddOutline, InformationCircleOutline,
  AppsOutline, ServerOutline, DocumentTextOutline, CheckmarkCircleOutline
} from '@vicons/ionicons5'
import { getPresets, saveServer } from '../api/mcp'
import message from '../utils/message'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  editingServer: {
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

const isEditing = computed(() => !!props.editingServer)

const presets = ref([])
const loadingPresets = ref(false)
const selectedPreset = ref(-1)
const saving = ref(false)

// 表单数据
const formData = reactive({
  id: '',
  name: '',
  description: '',
  homepage: '',
  docs: '',
  apps: {
    claude: true,
    codex: false,
    gemini: false
  },
  server: {
    type: 'stdio',
    command: '',
    args: [],
    env: {},
    url: '',
    headers: {}
  }
})

const serverType = ref('stdio')
const envList = ref([])
const headersList = ref([])
const tagsInput = ref('')

// ID 验证
const idError = computed(() => {
  if (!formData.id.trim()) return ''
  if (!isEditing.value && props.existingIds.includes(formData.id.trim())) {
    return '该 ID 已存在'
  }
  return ''
})

// 检查预设是否已安装
function isPresetInstalled(presetId) {
  return props.existingIds.includes(presetId)
}

// 加载预设
async function loadPresets() {
  loadingPresets.value = true
  try {
    const result = await getPresets()
    if (result.success) {
      presets.value = result.presets
    }
  } catch (err) {
    console.error('Failed to load presets:', err)
  } finally {
    loadingPresets.value = false
  }
}

// 选择自定义
function selectCustom() {
  selectedPreset.value = -1
  resetForm()
}

// 选择预设
function selectPreset(index) {
  selectedPreset.value = index
  const preset = presets.value[index]
  if (!preset) return

  // 生成唯一 ID
  let newId = preset.id
  let counter = 1
  while (props.existingIds.includes(newId)) {
    newId = `${preset.id}-${counter}`
    counter++
  }

  formData.id = newId
  formData.name = preset.name || preset.id
  formData.description = preset.description || ''
  formData.homepage = preset.homepage || ''
  formData.docs = preset.docs || ''
  tagsInput.value = (preset.tags || []).join(', ')

  if (preset.server) {
    serverType.value = preset.server.type || 'stdio'
    formData.server = { ...preset.server }

    if (preset.server.env) {
      envList.value = Object.entries(preset.server.env).map(([key, value]) => ({ key, value }))
    } else {
      envList.value = []
    }

    if (preset.server.headers) {
      headersList.value = Object.entries(preset.server.headers).map(([key, value]) => ({ key, value }))
    } else {
      headersList.value = []
    }
  }
}

// 重置表单
function resetForm() {
  formData.id = ''
  formData.name = ''
  formData.description = ''
  formData.homepage = ''
  formData.docs = ''
  formData.apps = { claude: true, codex: false, gemini: false }
  formData.server = {
    type: 'stdio',
    command: '',
    args: [],
    env: {},
    url: '',
    headers: {}
  }
  serverType.value = 'stdio'
  envList.value = []
  headersList.value = []
  tagsInput.value = ''
}

// 填充编辑数据
function fillEditingData() {
  const server = props.editingServer
  if (!server) return

  formData.id = server.id
  formData.name = server.name || ''
  formData.description = server.description || ''
  formData.homepage = server.homepage || ''
  formData.docs = server.docs || ''
  formData.apps = { ...server.apps } || { claude: true, codex: false, gemini: false }
  tagsInput.value = (server.tags || []).join(', ')

  if (server.server) {
    serverType.value = server.server.type || 'stdio'
    formData.server = { ...server.server }

    if (server.server.env) {
      envList.value = Object.entries(server.server.env).map(([key, value]) => ({ key, value }))
    } else {
      envList.value = []
    }

    if (server.server.headers) {
      headersList.value = Object.entries(server.server.headers).map(([key, value]) => ({ key, value }))
    } else {
      headersList.value = []
    }
  }
}

// 保存
async function handleSave() {
  // 验证
  if (!formData.id.trim()) {
    message.error('请输入服务器 ID')
    return
  }

  if (idError.value) {
    message.error(idError.value)
    return
  }

  if (serverType.value === 'stdio' && !formData.server.command?.trim()) {
    message.error('请输入命令')
    return
  }

  if ((serverType.value === 'http' || serverType.value === 'sse') && !formData.server.url?.trim()) {
    message.error('请输入 URL')
    return
  }

  // 构建服务器配置
  const serverSpec = {
    type: serverType.value
  }

  if (serverType.value === 'stdio') {
    serverSpec.command = formData.server.command
    if (formData.server.args?.length) {
      serverSpec.args = formData.server.args.filter(a => a.trim())
    }
    // 转换环境变量
    const env = {}
    envList.value.forEach(item => {
      if (item.key.trim()) {
        env[item.key.trim()] = item.value
      }
    })
    if (Object.keys(env).length > 0) {
      serverSpec.env = env
    }
  } else {
    serverSpec.url = formData.server.url
    // 转换请求头
    const headers = {}
    headersList.value.forEach(item => {
      if (item.key.trim()) {
        headers[item.key.trim()] = item.value
      }
    })
    if (Object.keys(headers).length > 0) {
      serverSpec.headers = headers
    }
  }

  // 构建完整数据
  const data = {
    id: formData.id.trim(),
    name: formData.name.trim() || formData.id.trim(),
    server: serverSpec,
    apps: formData.apps
  }

  if (formData.description.trim()) {
    data.description = formData.description.trim()
  }

  if (formData.homepage.trim()) {
    data.homepage = formData.homepage.trim()
  }

  if (formData.docs.trim()) {
    data.docs = formData.docs.trim()
  }

  if (tagsInput.value.trim()) {
    data.tags = tagsInput.value.split(',').map(t => t.trim()).filter(t => t)
  }

  saving.value = true
  try {
    const result = await saveServer(data)
    if (result.success) {
      message.success(isEditing.value ? '保存成功' : '添加成功')
      emit('saved')
      visible.value = false
    }
  } catch (err) {
    console.error('Failed to save server:', err)
    message.error(err.response?.data?.error || '保存失败')
  } finally {
    saving.value = false
  }
}

// 监听抽屉打开
watch(() => props.visible, (val) => {
  if (val) {
    loadPresets()
    if (props.editingServer) {
      fillEditingData()
    } else {
      resetForm()
      selectedPreset.value = -1
    }
  }
})

// 监听服务器类型变化
watch(serverType, (newType) => {
  formData.server.type = newType
})
</script>

<style scoped>
.drawer-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.drawer-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.form-content {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* 表单分组 */
.form-group {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.group-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-primary);
}

.group-icon {
  color: #18a058;
}

/* 预设选择 */
.preset-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.preset-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  font-size: 13px;
  border-radius: 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.preset-chip:hover {
  border-color: rgba(24, 160, 88, 0.4);
  color: var(--text-primary);
}

.preset-chip.active {
  background: rgba(24, 160, 88, 0.1);
  border-color: #18a058;
  color: #18a058;
}

[data-theme="dark"] .preset-chip.active {
  background: rgba(24, 160, 88, 0.15);
  color: #36ad6a;
}

.preset-chip.disabled {
  opacity: 0.6;
  cursor: not-allowed;
  background: var(--bg-tertiary);
}

.preset-chip.disabled:hover {
  border-color: var(--border-primary);
  color: var(--text-secondary);
}

.installed-icon {
  color: #18a058;
  margin-left: 2px;
}

/* 字段 */
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}

.required {
  color: #f56c6c;
}

.field-error {
  font-size: 12px;
  color: #f56c6c;
}

.field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

/* 平台切换 */
.platform-toggles {
  display: flex;
  gap: 24px;
}

.platform-item {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.platform-name {
  font-size: 14px;
  color: var(--text-primary);
  user-select: none;
}

/* 类型单选 */
.type-radios {
  display: flex;
  gap: 16px;
}

.radio-label {
  font-weight: 500;
}

.radio-desc {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-left: 4px;
}

/* 键值对行 */
.kv-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.kv-key {
  flex: 1;
}

.kv-sep {
  color: var(--text-tertiary);
  font-weight: 600;
  flex-shrink: 0;
}

.kv-value {
  flex: 1.5;
}

/* 折叠面板 */
.extra-collapse {
  border: none;
}

.collapse-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.collapse-hint {
  font-size: 12px;
  font-weight: 400;
  color: var(--text-tertiary);
}

.collapse-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-top: 8px;
}

/* Naive UI 组件覆盖 */
:deep(.n-dynamic-input) {
  width: 100%;
}

:deep(.n-collapse-item__header-main) {
  font-weight: 600 !important;
}

:deep(.n-collapse-item) {
  border: none !important;
  margin: 0 !important;
}

:deep(.n-collapse-item__content-inner) {
  padding-top: 0 !important;
}

:deep(.n-radio) {
  display: inline-flex;
  align-items: center;
}
</style>
