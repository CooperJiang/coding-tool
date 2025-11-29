<template>
  <div
    class="channel-card"
    :class="{
      collapsed,
      disabled: channel.enabled === false,
      'status-frozen': channel.health?.status === 'frozen',
      'status-checking': channel.health?.status === 'checking'
    }"
  >
    <div class="channel-header">
      <div class="channel-title">
        <n-button
          text
          size="tiny"
          class="collapse-btn"
          @click.stop="$emit('toggle-collapse')"
        >
          <n-icon size="16" :class="{ collapsed }">
            <ChevronDownOutline />
          </n-icon>
        </n-button>
        <span class="channel-name">{{ channel.name }}</span>
        <template v-for="tag in headerTags" :key="tag.text">
          <n-tag size="tiny" :type="tag.type || 'default'" :bordered="false">
            {{ tag.text }}
          </n-tag>
        </template>
      </div>
      <div class="channel-actions">
        <n-button
          v-if="showApplyButton"
          size="tiny"
          type="primary"
          class="apply-btn"
          @click="$emit('apply')"
        >
          写入配置
        </n-button>
        <n-button size="tiny" @click="$emit('edit')">
          编辑
        </n-button>
        <n-button size="tiny" type="error" @click="$emit('delete')">
          删除
        </n-button>
        <n-switch
          size="small"
          :value="channel.enabled !== false"
          @update:value="$emit('toggle-enabled', $event)"
        />
      </div>
    </div>

    <div v-show="!collapsed" class="channel-info">
      <div class="info-main">
        <div v-for="row in infoRows" :key="row.label" class="info-row">
          <n-text depth="3" class="label">{{ row.label }}:</n-text>
          <n-text depth="2" class="value" :class="{ mono: row.mono }">
            {{ row.value || '—' }}
          </n-text>
          <n-button
            v-if="typeof row.action === 'function'"
            size="tiny"
            text
            type="primary"
            @click="row.action()"
          >
            {{ row.actionLabel || '操作' }}
          </n-button>
        </div>
      </div>
      <div class="info-footer">
        <n-button
          v-if="channel.websiteUrl"
          text
          size="tiny"
          @click="$emit('open-website', channel.websiteUrl)"
        >
          <template #icon>
            <n-icon size="14"><OpenOutline /></n-icon>
          </template>
          前往官网
        </n-button>
        <div class="footer-spacer"></div>
        <div class="channel-meta">
          <span class="meta-item">
            权重: <span class="meta-value">{{ meta.weight }}</span>
          </span>
          <span class="meta-item">
            并发:
            <span class="meta-value" :class="{ 'meta-active': meta.concurrencyActive }">
              {{ meta.concurrencyText }}
            </span>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { NButton, NIcon, NTag, NText, NSwitch } from 'naive-ui'
import { ChevronDownOutline, OpenOutline } from '@vicons/ionicons5'

defineProps({
  channel: {
    type: Object,
    required: true
  },
  collapsed: {
    type: Boolean,
    default: false
  },
  headerTags: {
    type: Array,
    default: () => []
  },
  infoRows: {
    type: Array,
    default: () => []
  },
  meta: {
    type: Object,
    default: () => ({ weight: 1, concurrencyText: '不限', concurrencyActive: false })
  },
  showApplyButton: {
    type: Boolean,
    default: false
  }
})

defineEmits(['toggle-collapse', 'apply', 'edit', 'delete', 'toggle-enabled', 'open-website'])
</script>
