import {
  getChannels as fetchClaudeChannels,
  createChannel as createClaudeChannel,
  updateChannel as updateClaudeChannel,
  deleteChannel as deleteClaudeChannel,
  applyChannelToSettings,
  resetChannelHealth
} from '../../api/channels'
import {
  getCodexChannels,
  createCodexChannel,
  updateCodexChannel,
  deleteCodexChannel
} from '../../api/channels'
import {
  getGeminiChannels,
  createGeminiChannel,
  updateGeminiChannel,
  deleteGeminiChannel
} from '../../api/channels'

const URL_REQUIRE_HTTP = /^https?:\/\//i
const PROVIDER_KEY_PATTERN = /^[a-z0-9-]+$/i

function normalizeConcurrency(value) {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return null
  return Math.round(num)
}

function normalizeWeight(value) {
  const num = Number(value)
  if (!Number.isFinite(num) || num < 1) return 1
  return Math.min(100, Math.round(num))
}

function validateRequired(label, value) {
  if (value === null || value === undefined || value === '') {
    return `${label}不能为空`
  }
}

function validateHttpUrl(label, value, { required } = {}) {
  if (!value) {
    return required ? `${label}不能为空` : ''
  }
  if (!URL_REQUIRE_HTTP.test(value)) {
    return `${label}必须以 http:// 或 https:// 开头`
  }
  try {
    new URL(value)
  } catch (err) {
    return `${label}不是合法的链接`
  }
  return ''
}

function validateProviderKey(value) {
  if (!value) {
    return 'Provider Key 不能为空'
  }
  if (!PROVIDER_KEY_PATTERN.test(value)) {
    return '字母、数字、短横线组合，例如 openai'
  }
  return ''
}

const baseSections = {
  schedule: [
    {
      key: 'maxConcurrency',
      label: '最大并发',
      type: 'number',
      placeholder: '留空表示不限',
      clearable: true,
      validate: (value) => {
        if (value === null || value === undefined || value === '') return ''
        const num = Number(value)
        if (!Number.isFinite(num) || num <= 0) return '并发需为大于 0 的数字'
        if (num > 100) return '并发最多 100'
        return ''
      }
    },
    {
      key: 'weight',
      label: '调度权重',
      type: 'number',
      placeholder: '默认 1',
      min: 1,
      max: 100,
      validate: (value) => {
        const num = Number(value)
        if (!Number.isFinite(num) || num < 1) return '调度权重至少为 1'
        return ''
      }
    },
    {
      key: 'enabled',
      label: '渠道状态',
      type: 'switch',
      checkedText: '启用',
      uncheckedText: '停用'
    }
  ]
}

const channelPanelFactories = {
  claude: () => ({
    type: 'claude',
    displayName: 'Claude',
    schedulerSource: 'claude',
    storageKeys: {
      localCollapse: 'claudeChannelCollapse',
      collapseConfigKey: 'claude',
      orderConfigKey: 'claude'
    },
    emptyDescription: '暂无渠道',
    showEmptyAction: false,
    emptyActionText: '',
    modalWidth: 520,
    formLabelWidth: 80,
    showApplyButton: true,
    formSections: [
      {
        title: '基本信息',
        fields: [
          { key: 'name', label: '渠道名称', type: 'text', required: true, placeholder: '输入渠道名称' },
          {
            key: 'baseUrl',
            label: '接口地址',
            type: 'text',
            required: true,
            placeholder: 'https://api.example.com',
            validate: (value) => validateHttpUrl('接口地址', value, { required: true })
          },
          {
            key: 'apiKey',
            label: '接口密钥',
            type: 'password',
            required: true,
            placeholder: 'sk-...'
          },
          {
            key: 'websiteUrl',
            label: '官网链接',
            type: 'text',
            placeholder: 'https://（选填）',
            validate: (value) => validateHttpUrl('官网链接', value, { required: false })
          }
        ]
      },
      {
        title: '调度配置',
        fields: baseSections.schedule
      }
    ],
    getInitialForm: () => ({
      name: '',
      baseUrl: '',
      apiKey: '',
      websiteUrl: '',
      maxConcurrency: null,
      weight: 1,
      enabled: true
    }),
    mapChannelToForm: (channel) => ({
      name: channel.name || '',
      baseUrl: channel.baseUrl || '',
      apiKey: channel.apiKey || '',
      websiteUrl: channel.websiteUrl || '',
      maxConcurrency: channel.maxConcurrency ?? null,
      weight: channel.weight || 1,
      enabled: channel.enabled !== false
    }),
    api: {
      fetch: async () => {
        const data = await fetchClaudeChannels()
        return data.channels || []
      },
      create: async (form) => {
        await createClaudeChannel(
          form.name,
          form.baseUrl,
          form.apiKey,
          form.websiteUrl || undefined,
          {
            maxConcurrency: normalizeConcurrency(form.maxConcurrency),
            weight: normalizeWeight(form.weight),
            enabled: form.enabled
          }
        )
      },
      update: async (channel, form) => {
        await updateClaudeChannel(channel.id, {
          name: form.name,
          baseUrl: form.baseUrl,
          apiKey: form.apiKey,
          websiteUrl: form.websiteUrl,
          maxConcurrency: normalizeConcurrency(form.maxConcurrency),
          weight: normalizeWeight(form.weight),
          enabled: form.enabled
        })
      },
      toggle: async (channel, enabled) => {
        await updateClaudeChannel(channel.id, { enabled })
      },
      remove: deleteClaudeChannel,
      applyToSettings: async (channel) => {
        return applyChannelToSettings(channel.id)
      },
      resetHealth: async (channel) => {
        return resetChannelHealth(channel.id)
      }
    },
    getHeaderTags: (channel, helpers) => {
      const tags = []
      if (channel.health?.status === 'frozen') {
        tags.push({ text: helpers.formatFreeze(channel.health.freezeRemaining), type: 'error' })
      } else if (channel.health?.status === 'checking') {
        tags.push({ text: '检测中', type: 'warning' })
      }
      if (channel.enabled === false) {
        tags.push({ text: '未启用', type: 'default' })
      }
      return tags
    },
    buildInfoRows: (channel, helpers) => {
      const rows = [
        { label: 'URL', value: channel.baseUrl },
        {
          label: 'Key',
          value: helpers.maskApiKey(channel.apiKey),
          mono: true,
          action: channel.health?.status !== 'healthy'
            ? () => helpers.handleResetHealth(channel)
            : null,
          actionLabel: '重置状态'
        }
      ]
      return rows
    }
  }),
  codex: () => ({
    type: 'codex',
    displayName: 'Codex',
    schedulerSource: 'codex',
    storageKeys: {
      localCollapse: 'codexChannelCollapse',
      collapseConfigKey: 'codex',
      orderConfigKey: 'codex'
    },
    emptyDescription: '暂无渠道',
    showEmptyAction: true,
    emptyActionText: '添加 Codex 渠道',
    modalWidth: 600,
    formLabelWidth: 90,
    showApplyButton: false,
    formSections: [
      {
        title: '基本信息',
        fields: [
          { key: 'name', label: '渠道名称', type: 'text', required: true, placeholder: '显示名称' },
          {
            key: 'providerKey',
            label: 'Provider Key',
            type: 'text',
            required: true,
            placeholder: '英文标识，如 openai',
            disabledOnEdit: true,
            validate: validateProviderKey
          },
          {
            key: 'baseUrl',
            label: 'Base URL',
            type: 'text',
            required: true,
            placeholder: 'https://api.example.com',
            validate: (value) => validateHttpUrl('Base URL', value, { required: true })
          },
          {
            key: 'apiKey',
            label: 'API Key',
            type: 'password',
            required: true,
            placeholder: 'sk-...'
          },
          {
            key: 'websiteUrl',
            label: '官网链接',
            type: 'text',
            placeholder: 'https://（选填）',
            validate: (value) => validateHttpUrl('官网链接', value, { required: false })
          }
        ]
      },
      {
        title: '调度配置',
        fields: baseSections.schedule
      }
    ],
    getInitialForm: () => ({
      name: '',
      providerKey: '',
      baseUrl: '',
      apiKey: '',
      websiteUrl: '',
      maxConcurrency: null,
      weight: 1,
      enabled: true
    }),
    mapChannelToForm: (channel) => ({
      name: channel.name || '',
      providerKey: channel.providerKey || '',
      baseUrl: channel.baseUrl || '',
      apiKey: channel.apiKey || '',
      websiteUrl: channel.websiteUrl || '',
      maxConcurrency: channel.maxConcurrency ?? null,
      weight: channel.weight || 1,
      enabled: channel.enabled !== false
    }),
    api: {
      fetch: async () => {
        const data = await getCodexChannels()
        return data.channels || []
      },
      create: async (form) => {
        await createCodexChannel(
          form.name,
          form.providerKey,
          form.baseUrl,
          form.apiKey,
          form.websiteUrl || '',
          {
            maxConcurrency: normalizeConcurrency(form.maxConcurrency),
            weight: normalizeWeight(form.weight),
            enabled: form.enabled
          }
        )
      },
      update: async (channel, form) => {
        await updateCodexChannel(channel.id, {
          name: form.name,
          baseUrl: form.baseUrl,
          apiKey: form.apiKey,
          websiteUrl: form.websiteUrl,
          maxConcurrency: normalizeConcurrency(form.maxConcurrency),
          weight: normalizeWeight(form.weight),
          enabled: form.enabled
        })
      },
      toggle: async (channel, enabled) => updateCodexChannel(channel.id, { enabled }),
      remove: deleteCodexChannel
    },
    getHeaderTags: (channel) => {
      if (channel.enabled === false) {
        return [{ text: '已禁用', type: 'default' }]
      }
      return [{ text: '已启用', type: 'success' }]
    },
    buildInfoRows: (channel, helpers) => ([
      { label: 'Provider', value: channel.providerKey, mono: true },
      { label: 'URL', value: channel.baseUrl },
      { label: 'Key', value: helpers.maskApiKey(channel.apiKey), mono: true }
    ])
  }),
  gemini: () => ({
    type: 'gemini',
    displayName: 'Gemini',
    schedulerSource: 'gemini',
    storageKeys: {
      localCollapse: 'geminiChannelCollapse',
      collapseConfigKey: 'gemini',
      orderConfigKey: 'gemini'
    },
    emptyDescription: '暂无渠道',
    showEmptyAction: true,
    emptyActionText: '添加 Gemini 渠道',
    modalWidth: 520,
    formLabelWidth: 90,
    showApplyButton: false,
    formSections: [
      {
        title: '基本信息',
        fields: [
          { key: 'name', label: '渠道名称', type: 'text', required: true, placeholder: '显示名称' },
          { key: 'model', label: 'Model', type: 'text', required: true, placeholder: '例如 gemini-2.5-pro' },
          {
            key: 'baseUrl',
            label: 'Base URL',
            type: 'text',
            required: true,
            placeholder: 'https://generativelanguage.googleapis.com/v1beta',
            validate: (value) => validateHttpUrl('Base URL', value, { required: true })
          },
          {
            key: 'apiKey',
            label: 'API Key',
            type: 'password',
            required: true,
            placeholder: 'AIza...'
          },
          {
            key: 'websiteUrl',
            label: '官网链接',
            type: 'text',
            placeholder: 'https://（选填）',
            validate: (value) => validateHttpUrl('官网链接', value, { required: false })
          }
        ]
      },
      {
        title: '调度配置',
        fields: baseSections.schedule
      }
    ],
    getInitialForm: () => ({
      name: '',
      model: '',
      baseUrl: '',
      apiKey: '',
      websiteUrl: '',
      maxConcurrency: null,
      weight: 1,
      enabled: true
    }),
    mapChannelToForm: (channel) => ({
      name: channel.name || '',
      model: channel.model || '',
      baseUrl: channel.baseUrl || '',
      apiKey: channel.apiKey || '',
      websiteUrl: channel.websiteUrl || '',
      maxConcurrency: channel.maxConcurrency ?? null,
      weight: channel.weight || 1,
      enabled: channel.enabled !== false
    }),
    api: {
      fetch: async () => {
        const data = await getGeminiChannels()
        return data.channels || []
      },
      create: async (form) => {
        await createGeminiChannel(
          form.name,
          form.baseUrl,
          form.apiKey,
          form.model,
          form.websiteUrl || '',
          {
            maxConcurrency: normalizeConcurrency(form.maxConcurrency),
            weight: normalizeWeight(form.weight),
            enabled: form.enabled
          }
        )
      },
      update: async (channel, form) => {
        await updateGeminiChannel(channel.id, {
          name: form.name,
          model: form.model,
          baseUrl: form.baseUrl,
          apiKey: form.apiKey,
          websiteUrl: form.websiteUrl,
          maxConcurrency: normalizeConcurrency(form.maxConcurrency),
          weight: normalizeWeight(form.weight),
          enabled: form.enabled
        })
      },
      toggle: async (channel, enabled) => updateGeminiChannel(channel.id, { enabled }),
      remove: deleteGeminiChannel
    },
    getHeaderTags: (channel) => {
      if (channel.enabled === false) {
        return [{ text: '已禁用', type: 'default' }]
      }
      return [{ text: '已启用', type: 'success' }]
    },
    buildInfoRows: (channel, helpers) => ([
      { label: 'Model', value: channel.model, mono: true },
      { label: 'URL', value: channel.baseUrl },
      { label: 'Key', value: helpers.maskApiKey(channel.apiKey), mono: true }
    ])
  })
}

export default channelPanelFactories
