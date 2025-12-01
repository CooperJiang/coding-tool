/**
 * MCP 服务器管理 API
 */

import { client } from './client'

/**
 * 获取所有 MCP 服务器
 */
export async function getAllServers() {
  const response = await client.get('/mcp/servers')
  return response.data
}

/**
 * 获取单个 MCP 服务器
 */
export async function getServer(id) {
  const response = await client.get(`/mcp/servers/${id}`)
  return response.data
}

/**
 * 保存 MCP 服务器（添加或更新）
 */
export async function saveServer(server) {
  const response = await client.post('/mcp/servers', server)
  return response.data
}

/**
 * 删除 MCP 服务器
 */
export async function deleteServer(id) {
  const response = await client.delete(`/mcp/servers/${id}`)
  return response.data
}

/**
 * 切换 MCP 服务器在某平台的启用状态
 */
export async function toggleServerApp(serverId, app, enabled) {
  const response = await client.post(`/mcp/servers/${serverId}/toggle`, {
    app,
    enabled
  })
  return response.data
}

/**
 * 获取 MCP 预设模板列表
 */
export async function getPresets() {
  const response = await client.get('/mcp/presets')
  return response.data
}

/**
 * 从指定平台导入 MCP 配置
 */
export async function importFromPlatform(platform) {
  const response = await client.post(`/mcp/import/${platform}`)
  return response.data
}

/**
 * 获取 MCP 统计信息
 */
export async function getStats() {
  const response = await client.get('/mcp/stats')
  return response.data
}

/**
 * 测试 MCP 服务器连接
 */
export async function testServer(serverId) {
  const response = await client.post(`/mcp/servers/${serverId}/test`)
  return response.data
}

/**
 * 更新服务器排序
 */
export async function updateServerOrder(serverIds) {
  const response = await client.post('/mcp/servers/order', { serverIds })
  return response.data
}

/**
 * 导出 MCP 配置
 * @param {string} format - 导出格式: 'json' | 'claude' | 'codex'
 */
export async function exportServers(format = 'json') {
  const response = await client.get('/mcp/export', { params: { format } })
  return response.data
}

/**
 * 获取导出下载 URL
 */
export function getExportDownloadUrl(format = 'json') {
  return `/api/mcp/export/download?format=${format}`
}
