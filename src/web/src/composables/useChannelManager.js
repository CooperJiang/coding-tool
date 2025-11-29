import { reactive } from 'vue'
import message, { dialog } from '../utils/message'
import { getUIConfig, updateNestedUIConfig } from '../api/ui-config'

function getLocalCollapse(storageKey) {
  try {
    const stored = localStorage.getItem(storageKey)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (err) {}
  return {}
}

function setLocalCollapse(storageKey, value) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(value))
  } catch (err) {}
}

function resolveError(error, fallback) {
  if (error?.response?.data?.error) return error.response.data.error
  return fallback || error.message || '操作失败'
}

export default function useChannelManager(config) {
  const state = reactive({
    channels: [],
    loading: false,
    collapsed: getLocalCollapse(config.storageKeys.localCollapse),
    showDialog: false,
    editingChannel: null,
    formData: config.getInitialForm()
  })

  const validation = reactive({})

  async function loadChannels() {
    state.loading = true
    try {
      const list = await config.api.fetch()
      state.channels = Array.isArray(list) ? [...list] : []
      await applyChannelOrder()
    } catch (error) {
      message.error(resolveError(error, `${config.displayName} 渠道加载失败`))
    } finally {
      state.loading = false
    }
  }

  let lastUIConfig = null
  let lastUIConfigTime = 0
  const UI_CONFIG_TTL = 3000

  async function fetchUIConfig() {
    const now = Date.now()
    if (lastUIConfig && now - lastUIConfigTime < UI_CONFIG_TTL) {
      return lastUIConfig
    }
    try {
      const response = await getUIConfig()
      if (response.success && response.config) {
        lastUIConfig = response.config
        lastUIConfigTime = now
        return lastUIConfig
      }
    } catch (error) {
      console.error('Failed to fetch UI config:', error)
    }
    return null
  }

  async function applyChannelOrder() {
    try {
      const configData = await fetchUIConfig()
      if (configData && state.channels.length > 0) {
        const order = configData.channelOrder?.[config.storageKeys.orderConfigKey] || []
        const ordered = []
        order.forEach(id => {
          const channel = state.channels.find(ch => ch.id === id)
          if (channel) ordered.push(channel)
        })
        state.channels.forEach(channel => {
          if (!ordered.find(ch => ch.id === channel.id)) {
            ordered.push(channel)
          }
        })

        const enabled = ordered.filter(ch => ch.enabled !== false)
        const disabled = ordered.filter(ch => ch.enabled === false)
        disabled.forEach(ch => {
          state.collapsed[ch.id] = true
        })
        state.channels = [...enabled, ...disabled]
      }
    } catch (error) {
      console.error('Failed to load channel order:', error)
    }
  }

  async function saveOrder() {
    try {
      const order = state.channels.map(ch => ch.id)
      await updateNestedUIConfig('channelOrder', config.storageKeys.orderConfigKey, order)
    } catch (error) {
      console.error('Failed to save channel order:', error)
    }
  }

  async function loadCollapseSettings() {
    try {
      const configData = await fetchUIConfig()
      if (configData) {
        const collapse = configData.channelCollapse?.[config.storageKeys.collapseConfigKey] || {}
        state.collapsed = collapse
        setLocalCollapse(config.storageKeys.localCollapse, collapse)
      }
    } catch (error) {
      console.error('Failed to load collapse settings:', error)
    }
  }

  async function saveCollapseSettings() {
    try {
      await updateNestedUIConfig('channelCollapse', config.storageKeys.collapseConfigKey, state.collapsed)
    } catch (error) {
      console.error('Failed to save collapse settings:', error)
    }
  }

  function toggleCollapse(id) {
    state.collapsed[id] = !state.collapsed[id]
    setLocalCollapse(config.storageKeys.localCollapse, state.collapsed)
    saveCollapseSettings()
  }

  function openAddDialog() {
    state.editingChannel = null
    state.formData = config.getInitialForm()
    clearValidation()
    state.showDialog = true
  }

  function closeDialog() {
    state.showDialog = false
    state.editingChannel = null
    state.formData = config.getInitialForm()
    clearValidation()
  }

  function handleEdit(channel) {
    state.editingChannel = channel
    state.formData = config.mapChannelToForm(channel)
    clearValidation()
    state.showDialog = true
  }

  function clearValidation() {
    Object.keys(validation).forEach(key => {
      delete validation[key]
    })
  }

  function runValidation() {
    let valid = true
    config.formSections.forEach(section => {
      section.fields.forEach(field => {
        const value = state.formData[field.key]
        let errorMessage = ''
        if (field.required) {
          errorMessage = field.customRequiredMessage
            ? (value === null || value === undefined || value === '' ? field.customRequiredMessage : '')
            : (value === null || value === undefined || value === '' ? `${field.label}不能为空` : '')
        }
        if (!errorMessage && typeof field.validate === 'function') {
          errorMessage = field.validate(value, state.formData) || ''
        }
        if (errorMessage) {
          validation[field.key] = {
            status: 'error',
            message: errorMessage
          }
          valid = false
        } else {
          delete validation[field.key]
        }
      })
    })
    return valid
  }

  async function handleSave() {
    if (!runValidation()) {
      message.error('请检查表单填写是否完整')
      return
    }

    try {
      if (state.editingChannel) {
        await config.api.update(state.editingChannel, state.formData)
        message.success(`${config.displayName} 渠道已更新`)
      } else {
        await config.api.create(state.formData)
        message.success(`${config.displayName} 渠道已添加`)
      }
      closeDialog()
      await loadChannels()
    } catch (error) {
      message.error(resolveError(error))
    }
  }

  async function handleToggleEnabled(channel, value) {
    try {
      const enabled = typeof value === 'boolean' ? value : channel.enabled === false
      await config.api.toggle(channel, enabled)
      message.success(`${config.displayName} 渠道已${enabled ? '启用' : '禁用'}`)
      if (!enabled) {
        state.collapsed[channel.id] = true
        setLocalCollapse(config.storageKeys.localCollapse, state.collapsed)
        saveCollapseSettings()
      }
      await loadChannels()
    } catch (error) {
      message.error(resolveError(error))
    }
  }

  function handleDelete(id) {
    dialog.warning({
      title: `删除 ${config.displayName} 渠道`,
      content: '确定要删除这个渠道吗？',
      positiveText: '确定',
      negativeText: '取消',
      onPositiveClick: async () => {
        try {
          await config.api.remove(id)
          message.success(`${config.displayName} 渠道已删除`)
          await loadChannels()
        } catch (error) {
          message.error(resolveError(error))
        }
      }
    })
  }

  function handleApplyToSettings(channel) {
    if (typeof config.api.applyToSettings !== 'function') return
    dialog.warning({
      title: '写入配置',
      content: '写入配置后会关闭动态切换并默认使用该渠道，是否继续？',
      positiveText: '确定',
      negativeText: '取消',
      onPositiveClick: async () => {
        try {
          await config.api.applyToSettings(channel)
          message.success('已将渠道写入配置文件')
          await loadChannels()
        } catch (error) {
          message.error(resolveError(error))
        }
      }
    })
  }

  async function handleResetHealth(channel) {
    if (typeof config.api.resetHealth !== 'function') return
    try {
      await config.api.resetHealth(channel)
      message.success('渠道健康状态已重置')
      await loadChannels()
    } catch (error) {
      message.error(resolveError(error))
    }
  }

  function handleDragEnd() {
    saveOrder()
  }

  loadChannels()
  loadCollapseSettings()

  return {
    state,
    validation,
    actions: {
      loadChannels,
      openAddDialog,
      closeDialog,
      toggleCollapse,
      handleEdit,
      handleSave,
      handleDelete,
      handleToggleEnabled,
      handleApplyToSettings,
      handleResetHealth,
      handleDragEnd
    }
  }
}
