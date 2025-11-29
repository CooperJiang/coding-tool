<template>
  <BaseChannelPanel ref="baseRef" type="codex" @open-website="url => emit('open-website', url)" />
</template>

<script setup>
import { ref } from 'vue'
import BaseChannelPanel from './BaseChannelPanel.vue'

const emit = defineEmits(['open-website'])
const baseRef = ref(null)

defineExpose({
  openAddDialog: () => baseRef.value?.openAddDialog(),
  refresh: () => baseRef.value?.refresh()
})
</script>
