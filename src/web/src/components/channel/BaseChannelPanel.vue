<template>
  <div>
    <div v-if="state.loading" class="loading-container">
      <n-spin size="small" />
    </div>
    <div v-else>
      <div v-if="state.channels.length === 0" class="empty-state">
        <n-empty :description="config.emptyDescription">
          <template v-if="config.showEmptyAction" #extra>
            <n-button type="primary" size="small" @click="actions.openAddDialog">
              <template #icon>
                <n-icon><AddOutline /></n-icon>
              </template>
              {{ config.emptyActionText }}
            </n-button>
          </template>
        </n-empty>
      </div>
      <draggable
        v-else
        v-model="state.channels"
        item-key="id"
        class="channels-list"
        ghost-class="ghost"
        chosen-class="chosen"
        drag-class="drag"
        animation="200"
        @end="actions.handleDragEnd"
      >
        <template #item="{ element }">
          <ChannelCard
            :key="element.id"
            :channel="element"
            :collapsed="state.collapsed[element.id]"
            :header-tags="config.getHeaderTags(element, helpers)"
            :info-rows="config.buildInfoRows(element, helpers)"
            :meta="buildMeta(element)"
            :show-apply-button="config.showApplyButton"
            @toggle-collapse="actions.toggleCollapse(element.id)"
            @apply="actions.handleApplyToSettings(element)"
            @edit="actions.handleEdit(element)"
            @delete="actions.handleDelete(element.id)"
            @toggle-enabled="value => actions.handleToggleEnabled(element, value)"
            @open-website="url => emit('open-website', url)"
          />
        </template>
      </draggable>
    </div>

    <n-modal
      v-model:show="state.showDialog"
      preset="card"
      :title="state.editingChannel ? config.editTitle : config.addTitle"
      class="channel-dialog"
      :style="{ width: config.modalWidth + 'px' }"
    >
      <n-form label-placement="left" :label-width="config.formLabelWidth" class="channel-form">
        <div v-for="section in config.formSections" :key="section.title" class="form-section">
          <div class="section-title">{{ section.title }}</div>
          <n-form-item
            v-for="field in section.fields"
            :key="field.key"
            :label="field.label"
            :required="field.required"
            :validation-status="validation[field.key]?.status"
            :feedback="validation[field.key]?.message"
          >
            <component
              :is="resolveFieldComponent(field)"
              v-model:value="state.formData[field.key]"
              v-bind="buildFieldProps(field)"
            />
          </n-form-item>
        </div>
      </n-form>
      <template #footer>
        <div class="dialog-footer">
          <n-button @click="actions.closeDialog">取消</n-button>
          <n-button type="primary" @click="actions.handleSave">
            {{ state.editingChannel ? '保存修改' : '添加渠道' }}
          </n-button>
        </div>
      </template>
    </n-modal>
  </div>
</template>

<script setup>
import {
  NButton,
  NIcon,
  NEmpty,
  NSpin,
  NModal,
  NForm,
  NFormItem,
  NInput,
  NSwitch,
  NInputNumber
} from 'naive-ui'
import { AddOutline } from '@vicons/ionicons5'
import draggable from 'vuedraggable'
import ChannelCard from './ChannelCard.vue'
import channelPanelFactories from './channelPanelFactories'
import useChannelManager from '../../composables/useChannelManager'
import { useChannelScheduler } from '../../composables/useChannelScheduler'

const props = defineProps({
  type: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['open-website'])

const configFactory = channelPanelFactories[props.type] || channelPanelFactories.claude
const config = configFactory()
const { state, validation, actions } = useChannelManager(config)
const { getChannelInflight } = useChannelScheduler(config.schedulerSource)

const helpers = {
  getChannelInflight,
  formatFreeze: (remaining) => `冻结 ${remaining || 0}s`,
  maskApiKey: (key) => {
    if (!key) return '(未设置)'
    if (key.length <= 12) return '******'
    return `${key.slice(0, 8)}******${key.slice(-4)}`
  },
  handleResetHealth: (channel) => actions.handleResetHealth(channel),
  handleOpenWebsite: (url) => emit('open-website', url)
}

function buildMeta(channel) {
  const inflight = getChannelInflight(channel.id)
  const concurrencyText = channel.maxConcurrency
    ? `${inflight}/${channel.maxConcurrency}`
    : inflight > 0 ? inflight : '不限'
  return {
    weight: channel.weight || 1,
    concurrencyText,
    concurrencyActive: inflight > 0
  }
}

function resolveFieldComponent(field) {
  switch (field.type) {
    case 'password':
    case 'text':
      return NInput
    case 'number':
      return NInputNumber
    case 'switch':
      return NSwitch
    default:
      return NInput
  }
}

function buildFieldProps(field) {
  const base = { placeholder: field.placeholder }
  if (field.type === 'password') {
    base.type = 'password'
    base['show-password-on'] = 'click'
  }
  if (field.type === 'number') {
    base.min = field.min ?? 1
    base.max = field.max ?? 100
    base.step = field.step ?? 1
    base.clearable = field.clearable
    base.style = 'width: 100%;'
  }
  if (field.disabledOnEdit && state.editingChannel) {
    base.disabled = true
  }
  return base
}

defineExpose({
  openAddDialog: actions.openAddDialog,
  refresh: actions.loadChannels
})
</script>

<style src="./channel-panel-common.css"></style>
