<template>
  <n-drawer v-model:show="visible" :width="560" placement="right" :show-mask="true">
    <n-drawer-content title="MCP 服务器管理" closable :native-scrollbar="false">
      <template #header>
        <div class="drawer-header">
          <div class="header-title">
            <n-icon :size="20" class="header-icon">
              <ExtensionPuzzleOutline />
            </n-icon>
            <span>MCP 服务器管理</span>
          </div>
          <div class="header-actions">
            <n-dropdown trigger="click" :options="exportOptions" @select="handleExport">
              <n-button size="small" quaternary>
                <template #icon>
                  <n-icon><DownloadOutline /></n-icon>
                </template>
                导出
              </n-button>
            </n-dropdown>
            <n-button size="small" quaternary @click="showPasteModal = true">
              <template #icon>
                <n-icon><CodeSlashOutline /></n-icon>
              </template>
              粘贴解析
            </n-button>
            <n-button size="small" type="primary" @click="openAddForm">
              <template #icon>
                <n-icon><DocumentTextOutline /></n-icon>
              </template>
              添加
            </n-button>
          </div>
        </div>
      </template>

      <div class="mcp-container">
        <!-- 统计信息 -->
        <div class="stats-bar">
          <span class="stats-text">
            共 {{ serverCount }} 个服务器
            <template v-if="serverCount > 0">
              · Claude: {{ stats.claude }} · Codex: {{ stats.codex }} · Gemini: {{ stats.gemini }}
            </template>
          </span>
          <n-dropdown trigger="click" :options="syncOptions" @select="handleSync">
            <n-button size="tiny" quaternary>
              <template #icon>
                <n-icon><SyncOutline /></n-icon>
              </template>
              同步
            </n-button>
          </n-dropdown>
        </div>

        <!-- 服务器列表 -->
        <div class="server-list">
          <n-spin :show="loading">
            <template v-if="serverList.length === 0 && !loading">
              <div class="empty-state">
                <n-icon :size="48" class="empty-icon">
                  <ExtensionPuzzleOutline />
                </n-icon>
                <p class="empty-title">暂无 MCP 服务器</p>
                <p class="empty-desc">点击上方"添加"按钮添加 MCP 服务器，或"粘贴解析"快速导入</p>
              </div>
            </template>

            <div v-else class="server-cards" ref="serverCardsRef">
              <div
                v-for="(server, index) in serverList"
                :key="server.id"
                class="server-card"
                :class="{ dragging: draggedIndex === index }"
                draggable="true"
                @dragstart="handleDragStart($event, index)"
                @dragend="handleDragEnd"
                @dragover="handleDragOver($event, index)"
                @drop="handleDrop($event, index)"
              >
                <div class="card-header">
                  <div class="card-title">
                    <n-icon class="drag-handle" :size="14">
                      <ReorderFourOutline />
                    </n-icon>
                    <span class="server-name">{{ server.name || server.id }}</span>
                    <n-tag v-if="server.server?.type" size="tiny" :bordered="false" type="info">
                      {{ server.server.type }}
                    </n-tag>
                    <!-- 状态指示器 -->
                    <n-tooltip v-if="server.status">
                      <template #trigger>
                        <span
                          class="status-dot"
                          :class="{
                            online: server.status === 'online',
                            error: server.status === 'error',
                            testing: server.status === 'testing'
                          }"
                        ></span>
                      </template>
                      {{ getStatusText(server) }}
                    </n-tooltip>
                  </div>
                  <div class="card-actions">
                    <n-tooltip>
                      <template #trigger>
                        <n-button
                          quaternary
                          size="tiny"
                          :loading="testingServers[server.id]"
                          @click="handleTestServer(server)"
                        >
                          <template #icon>
                            <n-icon><PlayOutline /></n-icon>
                          </template>
                        </n-button>
                      </template>
                      测试连接
                    </n-tooltip>
                    <n-button quaternary size="tiny" @click="openEditForm(server)">
                      <template #icon>
                        <n-icon><CreateOutline /></n-icon>
                      </template>
                    </n-button>
                    <n-button quaternary size="tiny" @click="confirmDelete(server)">
                      <template #icon>
                        <n-icon><TrashOutline /></n-icon>
                      </template>
                    </n-button>
                  </div>
                </div>

                <p v-if="server.description" class="card-desc">{{ server.description }}</p>

                <div class="card-tags" v-if="server.tags?.length">
                  <n-tag v-for="tag in server.tags.slice(0, 3)" :key="tag" size="tiny" :bordered="false">
                    {{ tag }}
                  </n-tag>
                </div>

                <div class="card-apps">
                  <label class="app-toggle" @click.stop>
                    <n-switch
                      size="small"
                      :value="server.apps?.claude"
                      @update:value="(v) => toggleApp(server.id, 'claude', v)"
                    />
                    <span class="app-label">Claude</span>
                  </label>
                  <label class="app-toggle" @click.stop>
                    <n-switch
                      size="small"
                      :value="server.apps?.codex"
                      @update:value="(v) => toggleApp(server.id, 'codex', v)"
                    />
                    <span class="app-label">Codex</span>
                  </label>
                  <label class="app-toggle" @click.stop>
                    <n-switch
                      size="small"
                      :value="server.apps?.gemini"
                      @update:value="(v) => toggleApp(server.id, 'gemini', v)"
                    />
                    <span class="app-label">Gemini</span>
                  </label>
                </div>
              </div>
            </div>
          </n-spin>
        </div>
      </div>
    </n-drawer-content>
  </n-drawer>

  <!-- 添加/编辑表单 -->
  <McpFormDrawer
    v-model:visible="showForm"
    :editing-server="editingServer"
    :existing-ids="existingIds"
    @saved="handleSaved"
  />

  <!-- 粘贴配置弹窗 -->
  <n-modal v-model:show="showPasteModal" preset="card" title="粘贴 MCP 配置" style="width: 600px; max-width: 90vw;">
    <div class="paste-modal-content">
      <p class="paste-hint">
        粘贴 JSON 格式的 MCP 配置，支持单个或批量导入。格式示例：
      </p>
      <pre class="paste-example">{
  "mcpServers": {
    "服务器名称": {
      "command": "npx",
      "args": ["-y", "package-name"],
      "env": { "API_KEY": "xxx" }
    }
  }
}</pre>
      <n-input
        v-model:value="pasteContent"
        type="textarea"
        placeholder="在此粘贴 JSON 配置..."
        :rows="8"
        :status="parseError ? 'error' : undefined"
      />
      <p v-if="parseError" class="parse-error">{{ parseError }}</p>
    </div>
    <template #footer>
      <div class="paste-modal-footer">
        <n-button @click="showPasteModal = false">取消</n-button>
        <n-button type="primary" @click="handleParse" :loading="parsing">
          解析配置
        </n-button>
      </div>
    </template>
  </n-modal>

  <!-- 批量导入选择弹窗 -->
  <n-modal v-model:show="showBatchModal" preset="card" title="选择要导入的 MCP 服务器" style="width: 650px; max-width: 90vw;">
    <div class="batch-modal-content">
      <div class="batch-actions">
        <n-checkbox v-model:checked="selectAll" @update:checked="handleSelectAll">
          全选 ({{ parsedServers.length }})
        </n-checkbox>
        <span class="batch-selected">已选择 {{ selectedServerIds.length }} 个</span>
      </div>

      <div class="batch-list">
        <div
          v-for="server in parsedServers"
          :key="server.id"
          class="batch-item"
          :class="{ selected: selectedServerIds.includes(server.id), exists: isServerExists(server.id) }"
        >
          <n-checkbox
            :checked="selectedServerIds.includes(server.id)"
            :disabled="isServerExists(server.id)"
            @update:checked="(v) => toggleServerSelection(server.id, v)"
          />
          <div class="batch-item-info">
            <div class="batch-item-header">
              <span class="batch-item-name">{{ server.id }}</span>
              <n-tag v-if="isServerExists(server.id)" size="tiny" type="warning">已存在</n-tag>
              <n-tag v-if="server.server?.type" size="tiny" :bordered="false" type="info">
                {{ server.server.type }}
              </n-tag>
            </div>
            <div class="batch-item-detail">
              <span v-if="server.server?.command">{{ server.server.command }}</span>
              <span v-if="server.server?.args?.length" class="batch-args">
                {{ server.server.args.slice(0, 3).join(' ') }}{{ server.server.args.length > 3 ? '...' : '' }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
    <template #footer>
      <div class="batch-modal-footer">
        <n-button @click="showBatchModal = false">取消</n-button>
        <n-button
          type="primary"
          :disabled="selectedServerIds.length === 0"
          :loading="importing"
          @click="handleBatchImport"
        >
          导入选中 ({{ selectedServerIds.length }})
        </n-button>
      </div>
    </template>
  </n-modal>

  <!-- 导出预览弹窗 -->
  <n-modal v-model:show="showExportModal" preset="card" title="导出 MCP 配置" style="width: 650px; max-width: 90vw;">
    <div class="export-modal-content">
      <div class="export-info">
        <span>格式: {{ exportData.format }}</span>
        <span>文件名: {{ exportData.filename }}</span>
      </div>
      <n-input
        :value="exportData.content"
        type="textarea"
        readonly
        :rows="12"
        class="export-content"
      />
    </div>
    <template #footer>
      <div class="export-modal-footer">
        <n-button @click="showExportModal = false">关闭</n-button>
        <n-button @click="copyExportContent">
          <template #icon>
            <n-icon><CopyOutline /></n-icon>
          </template>
          复制
        </n-button>
        <n-button type="primary" @click="downloadExport">
          <template #icon>
            <n-icon><DownloadOutline /></n-icon>
          </template>
          下载
        </n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup>
import { ref, computed, watch, reactive } from 'vue'
import { NDrawer, NDrawerContent, NButton, NIcon, NSpin, NTag, NSwitch, NDropdown, NModal, NInput, NCheckbox, NTooltip } from 'naive-ui'
import {
  ExtensionPuzzleOutline, CreateOutline, TrashOutline, SyncOutline,
  CodeSlashOutline, DocumentTextOutline, DownloadOutline, PlayOutline,
  CopyOutline, ReorderFourOutline
} from '@vicons/ionicons5'
import {
  getAllServers, toggleServerApp, deleteServer, importFromPlatform,
  saveServer, testServer, updateServerOrder, exportServers, getExportDownloadUrl
} from '../api/mcp'
import message, { dialog } from '../utils/message'
import McpFormDrawer from './McpFormDrawer.vue'

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
const servers = ref({})
const showForm = ref(false)
const editingServer = ref(null)

// 测试相关
const testingServers = reactive({})

// 拖拽排序相关
const draggedIndex = ref(null)
const serverCardsRef = ref(null)

// 粘贴配置相关
const showPasteModal = ref(false)
const pasteContent = ref('')
const parseError = ref('')
const parsing = ref(false)

// 批量导入相关
const showBatchModal = ref(false)
const parsedServers = ref([])
const selectedServerIds = ref([])
const importing = ref(false)

// 导出相关
const showExportModal = ref(false)
const exportData = ref({ format: '', content: '', filename: '' })

const serverList = computed(() => {
  return Object.values(servers.value).sort((a, b) => {
    // 优先按 order 排序，没有 order 的按 updatedAt 排序
    if (a.order !== undefined && b.order !== undefined) {
      return a.order - b.order
    }
    if (a.order !== undefined) return -1
    if (b.order !== undefined) return 1
    return (b.updatedAt || 0) - (a.updatedAt || 0)
  })
})

const serverCount = computed(() => serverList.value.length)

const existingIds = computed(() => Object.keys(servers.value))

const stats = computed(() => {
  const list = serverList.value
  return {
    claude: list.filter(s => s.apps?.claude).length,
    codex: list.filter(s => s.apps?.codex).length,
    gemini: list.filter(s => s.apps?.gemini).length
  }
})

const selectAll = computed({
  get: () => {
    const availableIds = parsedServers.value
      .filter(s => !isServerExists(s.id))
      .map(s => s.id)
    return availableIds.length > 0 && availableIds.every(id => selectedServerIds.value.includes(id))
  },
  set: () => {}
})

const syncOptions = [
  { label: '同步 Claude 已有配置', key: 'claude' },
  { label: '同步 Codex 已有配置', key: 'codex' },
  { label: '同步 Gemini 已有配置', key: 'gemini' }
]

const exportOptions = [
  { label: '导出为 JSON (通用)', key: 'json' },
  { label: '导出为 Claude 格式', key: 'claude' },
  { label: '导出为 Codex 格式 (TOML)', key: 'codex' }
]

// 获取状态文本
function getStatusText(server) {
  if (server.status === 'online') {
    return `在线 - ${formatTime(server.lastChecked)}`
  } else if (server.status === 'error') {
    return `异常 - ${formatTime(server.lastChecked)}`
  } else if (server.status === 'testing') {
    return '测试中...'
  }
  return '未测试'
}

function formatTime(timestamp) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

// 检查服务器是否已存在
function isServerExists(id) {
  return existingIds.value.includes(id)
}

// 加载服务器列表
async function loadServers() {
  loading.value = true
  try {
    const result = await getAllServers()
    if (result.success) {
      servers.value = result.servers
    }
  } catch (err) {
    console.error('Failed to load MCP servers:', err)
    message.error('加载 MCP 服务器失败')
  } finally {
    loading.value = false
  }
}

// 测试服务器连接
async function handleTestServer(server) {
  testingServers[server.id] = true
  servers.value[server.id].status = 'testing'

  try {
    const result = await testServer(server.id)
    if (result.success) {
      const testResult = result.result
      servers.value[server.id].status = testResult.success ? 'online' : 'error'
      servers.value[server.id].lastChecked = Date.now()

      if (testResult.success) {
        message.success(`${server.name || server.id}: ${testResult.message} (${testResult.duration}ms)`)
      } else {
        message.error(`${server.name || server.id}: ${testResult.message}`)
      }
    }
  } catch (err) {
    console.error('Test server failed:', err)
    servers.value[server.id].status = 'error'
    message.error('测试失败: ' + err.message)
  } finally {
    testingServers[server.id] = false
  }
}

// 切换平台启用状态
async function toggleApp(serverId, app, enabled) {
  try {
    const result = await toggleServerApp(serverId, app, enabled)
    if (result.success) {
      servers.value[serverId] = result.server
      message.success(`已${enabled ? '启用' : '禁用'} ${app}`)
    }
  } catch (err) {
    console.error('Failed to toggle app:', err)
    message.error('操作失败')
  }
}

// 确认删除
function confirmDelete(server) {
  dialog.warning({
    title: '删除确认',
    content: `确定要删除 MCP 服务器 "${server.name || server.id}" 吗？此操作将从所有平台配置中移除该服务器。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        const result = await deleteServer(server.id)
        if (result.success) {
          delete servers.value[server.id]
          message.success('删除成功')
        }
      } catch (err) {
        console.error('Failed to delete server:', err)
        message.error('删除失败')
      }
    }
  })
}

// 同步已有配置
async function handleSync(platform) {
  try {
    const result = await importFromPlatform(platform)
    if (result.success) {
      message.success(result.message)
      await loadServers()
    }
  } catch (err) {
    console.error('Failed to sync:', err)
    message.error('同步失败')
  }
}

// 导出配置
async function handleExport(format) {
  try {
    const result = await exportServers(format)
    if (result.success) {
      exportData.value = {
        format: result.format,
        content: result.content,
        filename: result.filename
      }
      showExportModal.value = true
    }
  } catch (err) {
    console.error('Export failed:', err)
    message.error('导出失败')
  }
}

// 复制导出内容
function copyExportContent() {
  navigator.clipboard.writeText(exportData.value.content)
    .then(() => message.success('已复制到剪贴板'))
    .catch(() => message.error('复制失败'))
}

// 下载导出文件
function downloadExport() {
  const blob = new Blob([exportData.value.content], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = exportData.value.filename
  a.click()
  URL.revokeObjectURL(url)
  message.success('下载成功')
}

// 拖拽排序
function handleDragStart(event, index) {
  draggedIndex.value = index
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', index)
}

function handleDragEnd() {
  draggedIndex.value = null
}

function handleDragOver(event, index) {
  event.preventDefault()
  event.dataTransfer.dropEffect = 'move'
}

async function handleDrop(event, targetIndex) {
  event.preventDefault()
  const sourceIndex = draggedIndex.value

  if (sourceIndex === null || sourceIndex === targetIndex) {
    draggedIndex.value = null
    return
  }

  // 重新排序
  const list = [...serverList.value]
  const [removed] = list.splice(sourceIndex, 1)
  list.splice(targetIndex, 0, removed)

  // 更新本地状态
  const serverIds = list.map(s => s.id)

  // 保存排序到后端
  try {
    await updateServerOrder(serverIds)
    // 重新加载以获取更新后的数据
    await loadServers()
  } catch (err) {
    console.error('Failed to update order:', err)
    message.error('排序保存失败')
  }

  draggedIndex.value = null
}

// 打开添加表单
function openAddForm() {
  editingServer.value = null
  showForm.value = true
}

// 打开编辑表单
function openEditForm(server) {
  editingServer.value = server
  showForm.value = true
}

// 保存成功回调
function handleSaved() {
  loadServers()
}

// 解析粘贴的配置
function handleParse() {
  parseError.value = ''
  parsing.value = true

  try {
    let content = pasteContent.value.trim()
    if (!content) {
      parseError.value = '请输入配置内容'
      parsing.value = false
      return
    }

    // 尝试修复不完整的 JSON
    if (!content.startsWith('{') && !content.startsWith('[')) {
      content = content.replace(/^[\s,]+/, '')
      content = content.replace(/[\s,]+$/, '')
      content = `{${content}}`
    }

    let parsed
    try {
      parsed = JSON.parse(content)
    } catch (e) {
      let fixedContent = content.replace(/\}\s*"/g, '}, "')
      try {
        parsed = JSON.parse(fixedContent)
      } catch (e2) {
        parseError.value = 'JSON 格式错误：' + e.message
        parsing.value = false
        return
      }
    }

    const serversList = []
    let mcpServers = null

    if (parsed.mcpServers && typeof parsed.mcpServers === 'object') {
      mcpServers = parsed.mcpServers
    } else if (parsed.mcp_servers && typeof parsed.mcp_servers === 'object') {
      mcpServers = parsed.mcp_servers
    } else if (parsed.command || parsed.url) {
      mcpServers = { 'new-server': parsed }
    } else {
      const keys = Object.keys(parsed)
      const hasValidServerConfig = keys.some(key => {
        const val = parsed[key]
        return val && typeof val === 'object' && (val.command || val.url || val.args)
      })

      if (hasValidServerConfig) {
        mcpServers = parsed
      } else {
        parseError.value = '未找到有效的 MCP 服务器配置，请检查 JSON 格式'
        parsing.value = false
        return
      }
    }

    for (const [id, config] of Object.entries(mcpServers)) {
      if (!config || typeof config !== 'object') continue
      if (!config.command && !config.url && !config.args) continue

      const server = {
        id: id,
        name: id,
        apps: { claude: true, codex: false, gemini: false },
        server: {
          type: config.type || 'stdio'
        }
      }

      if (config.command) {
        server.server.command = config.command
        if (config.args) {
          server.server.args = Array.isArray(config.args) ? config.args : [config.args]
        }
        if (config.env && typeof config.env === 'object') {
          server.server.env = config.env
        }
      }

      if (config.url) {
        server.server.type = config.type || 'http'
        server.server.url = config.url
        if (config.headers && typeof config.headers === 'object') {
          server.server.headers = config.headers
        }
      }

      serversList.push(server)
    }

    if (serversList.length === 0) {
      parseError.value = '未找到有效的 MCP 服务器配置'
      parsing.value = false
      return
    }

    if (serversList.length === 1 && !isServerExists(serversList[0].id)) {
      editingServer.value = serversList[0]
      showForm.value = true
      showPasteModal.value = false
      pasteContent.value = ''
    } else {
      parsedServers.value = serversList
      selectedServerIds.value = serversList
        .filter(s => !isServerExists(s.id))
        .map(s => s.id)
      showBatchModal.value = true
      showPasteModal.value = false
    }
  } catch (err) {
    console.error('Parse error:', err)
    parseError.value = '解析失败：' + err.message
  } finally {
    parsing.value = false
  }
}

// 全选/取消全选
function handleSelectAll(checked) {
  if (checked) {
    selectedServerIds.value = parsedServers.value
      .filter(s => !isServerExists(s.id))
      .map(s => s.id)
  } else {
    selectedServerIds.value = []
  }
}

// 切换单个选择
function toggleServerSelection(id, checked) {
  if (checked) {
    if (!selectedServerIds.value.includes(id)) {
      selectedServerIds.value.push(id)
    }
  } else {
    const index = selectedServerIds.value.indexOf(id)
    if (index > -1) {
      selectedServerIds.value.splice(index, 1)
    }
  }
}

// 批量导入
async function handleBatchImport() {
  if (selectedServerIds.value.length === 0) return

  importing.value = true
  let successCount = 0
  let failCount = 0

  try {
    for (const id of selectedServerIds.value) {
      const server = parsedServers.value.find(s => s.id === id)
      if (!server) continue

      try {
        await saveServer(server)
        successCount++
      } catch (err) {
        console.error(`Failed to import ${id}:`, err)
        failCount++
      }
    }

    if (successCount > 0) {
      message.success(`成功导入 ${successCount} 个服务器${failCount > 0 ? `，${failCount} 个失败` : ''}`)
      await loadServers()
    } else {
      message.error('导入失败')
    }

    showBatchModal.value = false
    pasteContent.value = ''
    parsedServers.value = []
    selectedServerIds.value = []
  } catch (err) {
    console.error('Batch import error:', err)
    message.error('批量导入失败')
  } finally {
    importing.value = false
  }
}

// 监听抽屉打开
watch(() => props.visible, (val) => {
  if (val) {
    loadServers()
  }
})

// 关闭粘贴弹窗时清空
watch(showPasteModal, (val) => {
  if (!val) {
    parseError.value = ''
  }
})
</script>

<style scoped>
.mcp-container {
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
  color: #18a058;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.stats-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--bg-secondary);
  border-radius: 8px;
  border: 1px solid var(--border-primary);
}

.stats-text {
  font-size: 13px;
  color: var(--text-secondary);
}

.server-list {
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

.server-cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.server-card {
  padding: 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  transition: all 0.2s ease;
  cursor: grab;
}

.server-card:hover {
  border-color: rgba(24, 160, 88, 0.3);
  box-shadow: 0 2px 8px rgba(24, 160, 88, 0.08);
}

.server-card.dragging {
  opacity: 0.5;
  border-color: #18a058;
  box-shadow: 0 4px 12px rgba(24, 160, 88, 0.2);
}

.server-card:active {
  cursor: grabbing;
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

.drag-handle {
  color: var(--text-quaternary);
  cursor: grab;
  transition: color 0.2s;
}

.server-card:hover .drag-handle {
  color: var(--text-secondary);
}

.server-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

/* 状态指示器 */
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-quaternary);
}

.status-dot.online {
  background: #18a058;
  box-shadow: 0 0 6px rgba(24, 160, 88, 0.5);
}

.status-dot.error {
  background: #f56c6c;
  box-shadow: 0 0 6px rgba(245, 108, 108, 0.5);
}

.status-dot.testing {
  background: #e6a23c;
  animation: pulse 1s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.card-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.server-card:hover .card-actions {
  opacity: 1;
}

.card-desc {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 0 0 8px 0;
  line-height: 1.5;
}

.card-tags {
  display: flex;
  gap: 4px;
  margin-bottom: 12px;
}

.card-apps {
  display: flex;
  gap: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--border-primary);
}

.app-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.app-label {
  font-size: 12px;
  color: var(--text-secondary);
  user-select: none;
}

/* 粘贴弹窗 */
.paste-modal-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.paste-hint {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0;
}

.paste-example {
  margin: 0;
  padding: 12px;
  font-size: 12px;
  font-family: 'SF Mono', Monaco, monospace;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  overflow-x: auto;
  color: var(--text-secondary);
}

.parse-error {
  font-size: 12px;
  color: #f56c6c;
  margin: 0;
}

.paste-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

/* 批量导入弹窗 */
.batch-modal-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.batch-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.batch-selected {
  font-size: 13px;
  color: var(--text-secondary);
}

.batch-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 400px;
  overflow-y: auto;
}

.batch-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  transition: all 0.2s ease;
}

.batch-item.selected {
  border-color: rgba(24, 160, 88, 0.4);
  background: rgba(24, 160, 88, 0.05);
}

.batch-item.exists {
  opacity: 0.6;
}

.batch-item-info {
  flex: 1;
  min-width: 0;
}

.batch-item-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.batch-item-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.batch-item-detail {
  font-size: 12px;
  color: var(--text-tertiary);
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.batch-args {
  color: var(--text-quaternary);
}

.batch-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

/* 导出弹窗 */
.export-modal-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.export-info {
  display: flex;
  gap: 16px;
  font-size: 13px;
  color: var(--text-secondary);
}

.export-content {
  font-family: 'SF Mono', Monaco, monospace;
}

.export-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
