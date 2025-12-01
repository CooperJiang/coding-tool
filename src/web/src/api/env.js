/**
 * 环境变量检测 API
 */

import { client } from './client'

/**
 * 检测环境变量冲突
 * @param {string} platform - 可选，指定平台: claude/codex/gemini
 */
export async function checkEnvConflicts(platform = null) {
  const params = platform ? { platform } : {}
  const response = await client.get('/env/check', { params })
  return response.data
}

/**
 * 删除选中的环境变量
 * @param {Array} conflicts - 要删除的冲突列表
 */
export async function deleteEnvVars(conflicts) {
  const response = await client.post('/env/delete', { conflicts })
  return response.data
}

/**
 * 获取备份列表
 */
export async function getEnvBackups() {
  const response = await client.get('/env/backups')
  return response.data
}

/**
 * 从备份恢复
 * @param {string} backupPath - 备份文件路径
 */
export async function restoreEnvBackup(backupPath) {
  const response = await client.post('/env/restore', { backupPath })
  return response.data
}

/**
 * 删除备份文件
 * @param {string} fileName - 备份文件名
 */
export async function deleteEnvBackup(fileName) {
  const response = await client.delete(`/env/backups/${fileName}`)
  return response.data
}
