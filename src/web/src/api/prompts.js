/**
 * Prompts 管理 API
 */

import { client } from './client'

/**
 * 获取所有预设
 */
export async function getAllPresets() {
  const response = await client.get('/prompts/presets')
  return response.data
}

/**
 * 获取单个预设
 */
export async function getPreset(id) {
  const response = await client.get(`/prompts/presets/${id}`)
  return response.data
}

/**
 * 获取当前激活的预设
 */
export async function getActivePreset() {
  const response = await client.get('/prompts/presets/active')
  return response.data
}

/**
 * 保存预设（添加或更新）
 */
export async function savePreset(preset) {
  const response = await client.post('/prompts/presets', preset)
  return response.data
}

/**
 * 删除预设
 */
export async function deletePreset(id) {
  const response = await client.delete(`/prompts/presets/${id}`)
  return response.data
}

/**
 * 激活预设
 */
export async function activatePreset(id) {
  const response = await client.post(`/prompts/presets/${id}/activate`)
  return response.data
}

/**
 * 停用/移除提示词（删除各平台文件）
 */
export async function deactivatePrompt() {
  const response = await client.post('/prompts/deactivate')
  return response.data
}

/**
 * 获取各平台提示词状态
 */
export async function getPlatformStatus() {
  const response = await client.get('/prompts/platform-status')
  return response.data
}

/**
 * 读取指定平台的提示词
 */
export async function readPlatformPrompt(platform) {
  const response = await client.get(`/prompts/platform/${platform}`)
  return response.data
}

/**
 * 从指定平台导入提示词
 */
export async function importFromPlatform(platform, name) {
  const response = await client.post(`/prompts/import/${platform}`, { name })
  return response.data
}

/**
 * 获取统计信息
 */
export async function getPromptsStats() {
  const response = await client.get('/prompts/stats')
  return response.data
}
