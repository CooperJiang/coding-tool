<template>
  <n-drawer v-model:show="show" :width="900" placement="right" :show-mask="true">
    <n-drawer-content :show-header="false" closable :native-scrollbar="false">
      <div class="settings-container">
        <!-- 左侧菜单 -->
        <div class="settings-sidebar">
          <div class="sidebar-header">
            <n-icon size="20" color="#18a058">
              <SettingsOutline />
            </n-icon>
            <span class="sidebar-title">设置分类</span>
          </div>

          <div class="settings-menu">
            <div
              v-for="item in menuItems"
              :key="item.key"
              class="menu-item"
              :class="{ active: activeMenu === item.key }"
              @click="activeMenu = item.key"
            >
              <n-icon :size="18" class="menu-icon">
                <component :is="item.icon" />
              </n-icon>
              <span class="menu-label">{{ item.label }}</span>
              <n-badge
                v-if="item.badge"
                :value="item.badge"
                :type="item.badgeType || 'info'"
                :show-zero="false"
              />
            </div>
          </div>
        </div>

        <!-- 右侧内容 -->
        <div class="settings-content">
          <!-- 终端工具设置 -->
          <div v-show="activeMenu === 'terminal'" class="settings-panel">
            <div class="panel-header">
              <div class="panel-title-row">
                <n-icon size="24" color="#18a058">
                  <TerminalOutline />
                </n-icon>
                <div>
                  <h3 class="panel-title">终端工具</h3>
                  <n-text depth="3" class="panel-subtitle">选择启动会话时使用的终端工具</n-text>
                </div>
              </div>
            </div>

            <div class="panel-body">
              <n-spin :show="loading">
                <div class="setting-group">
                  <div class="setting-item">
                    <div class="setting-label">
                      <n-text strong>选择终端</n-text>
                      <n-text depth="3" style="font-size: 13px; margin-top: 4px;">
                        系统将使用所选终端工具启动 ClaudeCode 会话
                      </n-text>
                    </div>

                    <n-select
                      v-model:value="selectedTerminal"
                      :options="terminalOptions"
                      placeholder="选择终端工具"
                      size="large"
                      @update:value="handleTerminalChange"
                    />
                  </div>

                  <n-alert v-if="!availableTerminals.length && !loading" type="warning" :bordered="false" style="margin-top: 16px;">
                    <template #icon>
                      <n-icon><WarningOutline /></n-icon>
                    </template>
                    未检测到可用的终端工具
                  </n-alert>

                  <div v-if="selectedTerminalInfo" class="terminal-info">
                    <n-divider style="margin: 20px 0;" />
                    <div class="info-card">
                      <div class="info-row">
                        <n-text depth="3" class="info-label">当前终端：</n-text>
                        <n-tag type="success" :bordered="false" size="medium">
                          <template #icon>
                            <n-icon><CheckmarkCircleOutline /></n-icon>
                          </template>
                          {{ selectedTerminalInfo.name }}
                        </n-tag>
                      </div>
                      <div class="info-row">
                        <n-text depth="3" class="info-label">执行命令：</n-text>
                        <n-text code class="info-value">{{ selectedTerminalInfo.command }}</n-text>
                      </div>
                      <div v-if="selectedTerminalInfo.isDefault" class="info-row">
                        <n-tag type="info" :bordered="false" size="small">
                          <template #icon>
                            <n-icon><StarOutline /></n-icon>
                          </template>
                          系统默认终端
                        </n-tag>
                      </div>
                    </div>
                  </div>
                </div>
              </n-spin>
            </div>

            <div class="panel-footer">
              <n-space justify="end">
                <n-button
                  size="large"
                  @click="show = false"
                >
                  取消
                </n-button>
                <n-button
                  type="primary"
                  size="large"
                  :loading="saving"
                  :disabled="!selectedTerminal || selectedTerminal === originalSelectedTerminal"
                  @click="handleSave"
                >
                  <template #icon>
                    <n-icon><SaveOutline /></n-icon>
                  </template>
                  保存设置
                </n-button>
              </n-space>
            </div>
          </div>

          <!-- 外观设置面板 -->
          <div v-show="activeMenu === 'appearance'" class="settings-panel">
            <div class="panel-header">
              <div class="panel-title-row">
                <n-icon size="24" color="#18a058">
                  <ColorPaletteOutline />
                </n-icon>
                <div>
                  <h3 class="panel-title">外观设置</h3>
                  <n-text depth="3" class="panel-subtitle">自定义界面外观和主题</n-text>
                </div>
              </div>
            </div>
            <div class="panel-body">
              <div class="setting-group">
                <!-- 面板可见性设置 -->
                <div class="setting-item">
                  <div class="setting-label">
                    <n-text strong>面板显示</n-text>
                    <n-text depth="3" style="font-size: 13px; margin-top: 4px;">
                      控制右侧面板中各个区域的显示
                    </n-text>
                  </div>

                  <div class="visibility-options">
                    <!-- 显示渠道列表 -->
                    <div class="visibility-item">
                      <div class="visibility-info">
                        <n-text strong>显示渠道列表</n-text>
                        <n-text depth="3" style="font-size: 13px;">
                          在右侧面板显示 API 渠道管理区域
                        </n-text>
                      </div>
                      <n-switch
                        :value="showChannels"
                        @update:value="handleShowChannelsChange"
                      />
                    </div>

                    <!-- 显示日志 -->
                    <div class="visibility-item">
                      <div class="visibility-info">
                        <n-text strong>显示实时日志</n-text>
                        <n-text depth="3" style="font-size: 13px;">
                          在右侧面板显示代理日志区域(需开启动态切换)
                        </n-text>
                      </div>
                      <n-switch
                        :value="showLogs"
                        @update:value="handleShowLogsChange"
                      />
                    </div>
                  </div>
                </div>

                <n-divider />

                <!-- 主题设置 -->
                <div class="setting-item">
                  <div class="setting-label">
                    <n-text strong>界面主题</n-text>
                    <n-text depth="3" style="font-size: 13px; margin-top: 4px;">
                      选择你喜欢的界面主题风格
                    </n-text>
                  </div>

                  <div class="theme-options">
                    <!-- 亮色主题 -->
                    <div
                      class="theme-card"
                      :class="{ active: !isDark }"
                      @click="isDark && toggleTheme()"
                    >
                      <div class="theme-preview light-preview">
                        <div class="preview-header"></div>
                        <div class="preview-content">
                          <div class="preview-sidebar"></div>
                          <div class="preview-main"></div>
                        </div>
                      </div>
                      <div class="theme-info">
                        <n-icon :size="20" class="theme-icon">
                          <SunnyOutline />
                        </n-icon>
                        <div class="theme-details">
                          <n-text strong class="theme-name">亮色模式</n-text>
                          <n-text depth="3" class="theme-desc">经典的浅色主题</n-text>
                        </div>
                        <div v-if="!isDark" class="theme-check">
                          <n-icon :size="20" color="#18a058">
                            <CheckmarkCircleOutline />
                          </n-icon>
                        </div>
                      </div>
                    </div>

                    <!-- 暗色主题 -->
                    <div
                      class="theme-card"
                      :class="{ active: isDark }"
                      @click="!isDark && toggleTheme()"
                    >
                      <div class="theme-preview dark-preview">
                        <div class="preview-header"></div>
                        <div class="preview-content">
                          <div class="preview-sidebar"></div>
                          <div class="preview-main"></div>
                        </div>
                      </div>
                      <div class="theme-info">
                        <n-icon :size="20" class="theme-icon">
                          <MoonOutline />
                        </n-icon>
                        <div class="theme-details">
                          <n-text strong class="theme-name">暗色模式</n-text>
                          <n-text depth="3" class="theme-desc">护眼的深色主题</n-text>
                        </div>
                        <div v-if="isDark" class="theme-check">
                          <n-icon :size="20" color="#18a058">
                            <CheckmarkCircleOutline />
                          </n-icon>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div v-show="activeMenu === 'advanced'" class="settings-panel">
            <div class="panel-header">
              <div class="panel-title-row">
                <n-icon size="24" color="#18a058">
                  <OptionsOutline />
                </n-icon>
                <div>
                  <h3 class="panel-title">高级设置</h3>
                  <n-text depth="3" class="panel-subtitle">高级功能和实验性选项</n-text>
                </div>
              </div>
            </div>
            <div class="panel-body">
              <n-empty description="此功能即将推出" style="margin-top: 60px;">
                <template #icon>
                  <n-icon size="48"><OptionsOutline /></n-icon>
                </template>
              </n-empty>
            </div>
          </div>
        </div>
      </div>
    </n-drawer-content>
  </n-drawer>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import {
  NDrawer, NDrawerContent, NSpace, NText, NSelect, NButton, NAlert,
  NIcon, NBadge, NSpin, NDivider, NTag, NEmpty, NSwitch
} from 'naive-ui'
import {
  SettingsOutline, TerminalOutline, ColorPaletteOutline, OptionsOutline,
  SaveOutline, CheckmarkCircleOutline, StarOutline, WarningOutline,
  SunnyOutline, MoonOutline
} from '@vicons/ionicons5'
import api from '../api'
import message from '../utils/message'
import { useTheme } from '../composables/useTheme'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:visible'])
const show = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})

const loading = ref(false)
const saving = ref(false)
const availableTerminals = ref([])
const selectedTerminal = ref(null)
const originalSelectedTerminal = ref(null)
const activeMenu = ref('terminal')

// 主题管理
const { isDark, toggleTheme } = useTheme()

// 面板可见性设置
const showChannels = ref(true)
const showLogs = ref(true)

// 菜单项配置
const menuItems = ref([
  {
    key: 'terminal',
    label: '终端工具',
    icon: TerminalOutline
  },
  {
    key: 'appearance',
    label: '外观设置',
    icon: ColorPaletteOutline
  },
  {
    key: 'advanced',
    label: '高级设置',
    icon: OptionsOutline,
    badge: '即将推出',
    badgeType: 'warning'
  }
])

const terminalOptions = computed(() => {
  return availableTerminals.value
    .filter(t => t.available)
    .map(t => ({
      label: `${t.name}${t.isDefault ? ' (默认)' : ''}`,
      value: t.id
    }))
})

const selectedTerminalInfo = computed(() => {
  return availableTerminals.value.find(t => t.id === selectedTerminal.value)
})

// 加载终端列表和当前配置
async function loadTerminals() {
  loading.value = true
  try {
    const data = await api.getAvailableTerminals()
    availableTerminals.value = data.available || []
    selectedTerminal.value = data.selected || null
    originalSelectedTerminal.value = data.selected || null

    // 如果没有选中的终端，自动选择默认终端
    if (!selectedTerminal.value && availableTerminals.value.length > 0) {
      const defaultTerminal = availableTerminals.value.find(t => t.isDefault)
      if (defaultTerminal) {
        selectedTerminal.value = defaultTerminal.id
      }
    }
  } catch (error) {
    console.error('Failed to load terminals:', error)
    message.error('加载终端列表失败：' + (error.message || '未知错误'))
  } finally {
    loading.value = false
  }
}

// 终端切换处理
function handleTerminalChange(value) {
  console.log('Terminal changed to:', value)
}

// 保存设置
async function handleSave() {
  if (!selectedTerminal.value) {
    message.warning('请选择一个终端工具')
    return
  }

  saving.value = true
  try {
    await api.saveTerminalConfig(selectedTerminal.value)
    originalSelectedTerminal.value = selectedTerminal.value
    message.success('设置已保存')
  } catch (error) {
    console.error('Failed to save terminal config:', error)
    message.error('保存失败：' + (error.message || '未知错误'))
  } finally {
    saving.value = false
  }
}

// 加载面板可见性设置
function loadPanelSettings() {
  const saved = localStorage.getItem('cc-panel-visibility')
  if (saved) {
    try {
      const settings = JSON.parse(saved)
      showChannels.value = settings.showChannels !== false // default true
      showLogs.value = settings.showLogs !== false // default true
    } catch (e) {
      // Ignore parse errors
    }
  }
}

// 保存面板可见性设置
function savePanelSettings() {
  localStorage.setItem('cc-panel-visibility', JSON.stringify({
    showChannels: showChannels.value,
    showLogs: showLogs.value
  }))
}

// 处理显示渠道列表切换
function handleShowChannelsChange(value) {
  showChannels.value = value
  savePanelSettings()
  // 通知 Layout 组件更新
  window.dispatchEvent(new CustomEvent('panel-visibility-change', {
    detail: { showChannels: value, showLogs: showLogs.value }
  }))
}

// 处理显示日志切换
function handleShowLogsChange(value) {
  showLogs.value = value
  savePanelSettings()
  // 通知 Layout 组件更新
  window.dispatchEvent(new CustomEvent('panel-visibility-change', {
    detail: { showChannels: showChannels.value, showLogs: value }
  }))
}

// 加载设置
onMounted(() => {
  loadPanelSettings()
})

// 监听抽屉打开，加载数据
watch(show, (newVal) => {
  if (newVal) {
    loadTerminals()
    loadPanelSettings()
  }
})
</script>

<style scoped>
.settings-container {
  display: flex;
  height: 100vh;
  gap: 0;
}

/* 左侧边栏 */
.settings-sidebar {
  width: 240px;
  flex-shrink: 0;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-primary);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

[data-theme="dark"] .settings-sidebar {
  background: rgba(15, 23, 42, 0.5);
  border-right: 1px solid rgba(148, 163, 184, 0.1);
}

.sidebar-header {
  padding: 28px 20px 24px;
  border-bottom: 1px solid var(--border-primary);
  display: flex;
  align-items: center;
  gap: 12px;
}

[data-theme="dark"] .sidebar-header {
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
}

.sidebar-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.3px;
}

.settings-menu {
  flex: 1;
  padding: 16px 12px;
  overflow-y: auto;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  margin-bottom: 4px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
}

.menu-item:hover {
  background: var(--hover-bg);
}

[data-theme="dark"] .menu-item:hover {
  background: rgba(71, 85, 105, 0.25);
}

.menu-item.active {
  background: rgba(24, 160, 88, 0.15);
}

[data-theme="dark"] .menu-item.active {
  background: linear-gradient(90deg,
    rgba(5, 150, 105, 0.2) 0%,
    rgba(16, 185, 129, 0.15) 100%
  );
  border: 1px solid rgba(16, 185, 129, 0.25);
  box-shadow: 0 0 0 1px rgba(16, 185, 129, 0.1);
}

.menu-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 60%;
  background: #18a058;
  border-radius: 0 2px 2px 0;
}

[data-theme="dark"] .menu-item.active::before {
  background: linear-gradient(180deg,
    rgba(52, 211, 153, 1) 0%,
    rgba(16, 185, 129, 1) 50%,
    rgba(5, 150, 105, 1) 100%
  );
  box-shadow: 0 0 8px rgba(16, 185, 129, 0.5);
}

.menu-icon {
  flex-shrink: 0;
  color: var(--text-tertiary);
  transition: all 0.25s ease;
}

.menu-item:hover .menu-icon {
  color: #18a058;
  transform: scale(1.1);
}

.menu-item.active .menu-icon {
  color: #18a058;
}

[data-theme="dark"] .menu-item.active .menu-icon {
  color: #34d399;
}

.menu-label {
  flex: 1;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  transition: all 0.2s ease;
}

.menu-item.active .menu-label {
  font-weight: 600;
  color: #18a058;
}

[data-theme="dark"] .menu-item.active .menu-label {
  color: #6ee7b7;
  font-weight: 600;
}

/* 右侧内容区 */
.settings-content {
  flex: 1;
  overflow-y: auto;
  background: var(--bg-primary);
}

.settings-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.panel-header {
  padding: 28px 32px;
  border-bottom: 1px solid var(--border-primary);
}

[data-theme="dark"] .panel-header {
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
}

.panel-title-row {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.panel-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
}

.panel-subtitle {
  font-size: 13px;
  display: block;
  margin-top: 6px;
}

.panel-body {
  flex: 1;
  padding: 28px;
  overflow-y: auto;
}

.setting-group {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.setting-item {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.setting-label {
  display: flex;
  flex-direction: column;
}

.terminal-info {
  margin-top: 8px;
}

.info-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 12px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

[data-theme="dark"] .info-card {
  background: rgba(30, 41, 59, 0.4);
  border: 1px solid rgba(148, 163, 184, 0.15);
}

.info-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.info-label {
  min-width: 80px;
  font-size: 13px;
}

.info-value {
  font-size: 13px;
  word-break: break-all;
  flex: 1;
}

.panel-footer {
  padding: 20px 32px;
  border-top: 1px solid var(--border-primary);
  background: var(--bg-secondary);
}

[data-theme="dark"] .panel-footer {
  border-top: 1px solid rgba(148, 163, 184, 0.1);
  background: rgba(15, 23, 42, 0.5);
}

/* Naive UI 组件样式覆盖 */
:deep(.n-select) {
  width: 100%;
}

:deep(.n-drawer-body-content-wrapper) {
  padding: 0 !important;
}

:deep(.n-drawer-header) {
  display: none !important;
}

:deep(.n-drawer-body) {
  padding: 0 !important;
}

:deep(.n-drawer-content) {
  display: flex;
  flex-direction: column;
  height: 100%;
}

:deep(.n-drawer-content__body) {
  flex: 1;
  padding: 0 !important;
  overflow: hidden;
}

/* 可见性选项样式 */
.visibility-options {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 16px;
}

.visibility-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 10px;
  transition: all 0.2s ease;
}

[data-theme="dark"] .visibility-item {
  background: rgba(30, 41, 59, 0.4);
  border: 1px solid rgba(148, 163, 184, 0.15);
}

.visibility-item:hover {
  border-color: #18a058;
  box-shadow: 0 2px 8px rgba(24, 160, 88, 0.1);
}

.visibility-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  margin-right: 16px;
}

/* 主题选择器样式 */
.theme-options {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
  margin-top: 16px;
}

.theme-card {
  border: 2px solid var(--border-primary);
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  background: var(--bg-primary);
}

.theme-card:hover {
  border-color: #18a058;
  transform: translateY(-2px);
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.08);
}

[data-theme="dark"] .theme-card:hover {
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.3);
}

.theme-card.active {
  border-color: #18a058;
  box-shadow: 0 4px 12px rgba(24, 160, 88, 0.15);
}

[data-theme="dark"] .theme-card.active {
  border-color: #34d399;
  box-shadow: 0 4px 16px rgba(52, 211, 153, 0.2);
}

/* 主题预览区 */
.theme-preview {
  height: 140px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.light-preview {
  background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%);
}

.dark-preview {
  background: linear-gradient(135deg, #1f2937 0%, #111827 100%);
}

.preview-header {
  height: 20px;
  border-radius: 6px;
}

.light-preview .preview-header {
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.dark-preview .preview-header {
  background: #374151;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.preview-content {
  flex: 1;
  display: flex;
  gap: 8px;
}

.preview-sidebar {
  width: 30%;
  border-radius: 6px;
}

.light-preview .preview-sidebar {
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.dark-preview .preview-sidebar {
  background: #374151;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.preview-main {
  flex: 1;
  border-radius: 6px;
}

.light-preview .preview-main {
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.dark-preview .preview-main {
  background: #1f2937;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

/* 主题信息区 */
.theme-info {
  padding: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  border-top: 1px solid var(--border-primary);
}

.theme-icon {
  flex-shrink: 0;
  color: var(--text-secondary);
  transition: all 0.2s ease;
}

.theme-card:hover .theme-icon {
  color: #18a058;
  transform: scale(1.1);
}

.theme-card.active .theme-icon {
  color: #18a058;
}

[data-theme="dark"] .theme-card.active .theme-icon {
  color: #34d399;
}

.theme-details {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.theme-name {
  font-size: 14px;
  color: var(--text-primary);
}

.theme-desc {
  font-size: 12px;
}

.theme-check {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
