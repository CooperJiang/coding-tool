/**
 * Claude 渠道预设配置
 * 参考 cc-switch 的 claudeProviderPresets.ts
 */

export const claudePresets = [
  {
    id: 'official',
    name: 'Claude 官方',
    category: 'official',
    websiteUrl: 'https://www.anthropic.com',
    baseUrl: 'https://api.anthropic.com',
    env: {}
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    category: 'cn_official',
    websiteUrl: 'https://platform.deepseek.com',
    baseUrl: 'https://api.deepseek.com/anthropic',
    env: {
      ANTHROPIC_MODEL: 'DeepSeek-V3.2-Exp',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'DeepSeek-V3.2-Exp',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'DeepSeek-V3.2-Exp',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'DeepSeek-V3.2-Exp'
    }
  },
  {
    id: 'zhipu',
    name: '智谱 GLM',
    category: 'cn_official',
    websiteUrl: 'https://open.bigmodel.cn',
    baseUrl: 'https://open.bigmodel.cn/api/anthropic',
    env: {
      ANTHROPIC_MODEL: 'glm-4.6',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'glm-4.5-air',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'glm-4.6',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'glm-4.6'
    }
  },
  {
    id: 'kimi',
    name: 'Kimi K2',
    category: 'cn_official',
    websiteUrl: 'https://platform.moonshot.cn',
    baseUrl: 'https://api.moonshot.cn/anthropic',
    env: {
      ANTHROPIC_MODEL: 'kimi-k2-thinking',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'kimi-k2-thinking',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'kimi-k2-thinking',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'kimi-k2-thinking'
    }
  },
  {
    id: 'minimax',
    name: 'MiniMax (CN)',
    category: 'cn_official',
    websiteUrl: 'https://platform.minimaxi.com',
    baseUrl: 'https://api.minimaxi.com/anthropic',
    env: {
      ANTHROPIC_MODEL: 'MiniMax-M3',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'MiniMax-M2.7',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'MiniMax-M3',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'MiniMax-M3'
    }
  },
  {
    id: 'minimax-global',
    name: 'MiniMax (Global)',
    category: 'cn_official',
    websiteUrl: 'https://platform.minimax.io',
    baseUrl: 'https://api.minimax.io/anthropic',
    env: {
      ANTHROPIC_MODEL: 'MiniMax-M3',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'MiniMax-M2.7',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'MiniMax-M3',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'MiniMax-M3'
    }
  },
  {
    id: 'qwen',
    name: '通义千问',
    category: 'cn_official',
    websiteUrl: 'https://bailian.console.aliyun.com',
    baseUrl: 'https://dashscope.aliyuncs.com/api/v2/apps/claude-code-proxy',
    env: {
      ANTHROPIC_MODEL: 'qwen3-max',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'qwen3-max',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'qwen3-max',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'qwen3-max'
    }
  },
  {
    id: 'doubao',
    name: '豆包 Seed',
    category: 'cn_official',
    websiteUrl: 'https://www.volcengine.com/product/doubao',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/coding',
    env: {
      ANTHROPIC_MODEL: 'doubao-seed-code-preview-latest',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'doubao-seed-code-preview-latest',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'doubao-seed-code-preview-latest',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'doubao-seed-code-preview-latest'
    }
  }
]

// 预设分类
export const presetCategories = {
  official: '官方',
  cn_official: '国内官方',
  aggregator: '聚合服务',
  third_party: '第三方'
}

// 根据 ID 获取预设
export function getPresetById(id) {
  return claudePresets.find(p => p.id === id)
}

// 获取分类下的预设列表
export function getPresetsByCategory(category) {
  return claudePresets.filter(p => p.category === category)
}
