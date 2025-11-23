import axios from 'axios'

const client = axios.create({
  baseURL: '/api',
  timeout: 10000
})

/**
 * 根据 channel 生成 API 路径前缀
 * @param {string} channel - 'claude' 或 'codex'
 * @returns {string} - API 路径前缀
 */
function getChannelPrefix(channel = 'claude') {
  return channel === 'codex' ? '/codex' : ''
}

const api = {
  // Get all projects
  async getProjects(channel = 'claude') {
    const prefix = getChannelPrefix(channel)
    const response = await client.get(`${prefix}/projects`)
    return response.data
  },

  // Get sessions for a project
  async getSessions(projectName, channel = 'claude') {
    const prefix = getChannelPrefix(channel)
    const response = await client.get(`${prefix}/sessions/${projectName}`)
    return response.data
  },

  // Set alias for a session
  async setAlias(sessionId, alias) {
    const response = await client.post('/aliases', { sessionId, alias })
    return response.data
  },

  // Delete alias
  async deleteAlias(sessionId) {
    const response = await client.delete(`/aliases/${sessionId}`)
    return response.data
  },

  // Delete session
  async deleteSession(projectName, sessionId, channel = 'claude') {
    const prefix = getChannelPrefix(channel)
    const response = await client.delete(`${prefix}/sessions/${projectName}/${sessionId}`)
    return response.data
  },

  // Fork session
  async forkSession(projectName, sessionId, channel = 'claude') {
    const prefix = getChannelPrefix(channel)
    const response = await client.post(`${prefix}/sessions/${projectName}/${sessionId}/fork`)
    return response.data
  },

  // Launch session (resume in CLI)
  async launchSession(projectName, sessionId, fork = false, channel = 'claude') {
    const prefix = getChannelPrefix(channel)
    const response = await client.post(`${prefix}/sessions/${projectName}/${sessionId}/launch`, { fork })
    return response.data
  },

  // Save project order
  async saveProjectOrder(order, channel = 'claude') {
    const prefix = getChannelPrefix(channel)
    const response = await client.post(`${prefix}/projects/order`, { order })
    return response.data
  },

  // Delete project
  async deleteProject(projectName, channel = 'claude') {
    const prefix = getChannelPrefix(channel)
    const response = await client.delete(`${prefix}/projects/${projectName}`)
    return response.data
  },

  // Save session order
  async saveSessionOrder(projectName, order, channel = 'claude') {
    const prefix = getChannelPrefix(channel)
    const response = await client.post(`${prefix}/sessions/${projectName}/order`, { order })
    return response.data
  },

  // Search sessions content
  async searchSessions(projectName, keyword, contextLength = 15, channel = 'claude') {
    const prefix = getChannelPrefix(channel)
    const response = await client.get(`${prefix}/sessions/${projectName}/search`, {
      params: { keyword, context: contextLength }
    })
    return response.data
  },

  // Search sessions across all projects
  async searchSessionsGlobally(keyword, contextLength = 35, channel = 'claude') {
    const prefix = getChannelPrefix(channel)
    const response = await client.get(`${prefix}/sessions/search/global`, {
      params: { keyword, context: contextLength }
    })
    return response.data
  },

  // Launch terminal with session
  async launchTerminal(projectName, sessionId, channel = 'claude') {
    const prefix = getChannelPrefix(channel)
    const response = await client.post(`${prefix}/sessions/${projectName}/${sessionId}/launch`)
    return response.data
  },

  // Get session messages (chat history)
  async getSessionMessages(projectName, sessionId, page = 1, limit = 20, order = 'desc', channel = 'claude') {
    const prefix = getChannelPrefix(channel)
    const response = await client.get(`${prefix}/sessions/${projectName}/${sessionId}/messages`, {
      params: { page, limit, order }
    })
    return response.data
  },

  // Channels management
  async getChannels() {
    const response = await client.get('/channels')
    return response.data
  },

  async getCurrentChannel() {
    const response = await client.get('/channels/current')
    return response.data
  },

  async createChannel(name, baseUrl, apiKey, websiteUrl) {
    const response = await client.post('/channels', { name, baseUrl, apiKey, websiteUrl })
    return response.data
  },

  async updateChannel(id, updates) {
    const response = await client.put(`/channels/${id}`, updates)
    return response.data
  },

  async deleteChannel(id) {
    const response = await client.delete(`/channels/${id}`)
    return response.data
  },

  async activateChannel(id) {
    const response = await client.post(`/channels/${id}/activate`)
    return response.data
  },

  async saveChannelOrder(order) {
    const response = await client.post('/channels/order', { order })
    return response.data
  },

  // Codex Channels management
  async getCodexChannels() {
    const response = await client.get('/codex/channels')
    return response.data
  },

  async getActiveCodexChannel() {
    const response = await client.get('/codex/channels/active')
    return response.data
  },

  async createCodexChannel(name, providerKey, baseUrl, apiKey, websiteUrl) {
    const response = await client.post('/codex/channels', {
      name,
      providerKey,
      baseUrl,
      apiKey,
      websiteUrl
    })
    return response.data
  },

  async updateCodexChannel(channelId, updates) {
    const response = await client.put(`/codex/channels/${channelId}`, updates)
    return response.data
  },

  async deleteCodexChannel(channelId) {
    const response = await client.delete(`/codex/channels/${channelId}`)
    return response.data
  },

  async activateCodexChannel(channelId) {
    const response = await client.post(`/codex/channels/${channelId}/activate`)
    return response.data
  },

  async saveCodexChannelOrder(order) {
    const response = await client.post('/codex/channels/order', { order })
    return response.data
  },

  // Get recent sessions across all projects
  async getRecentSessions(limit = 5, channel = 'claude') {
    const prefix = getChannelPrefix(channel)
    const response = await client.get(`${prefix}/sessions/recent/list?limit=${limit}`)
    return response.data
  },

  // Proxy management
  async getProxyStatus() {
    const response = await client.get('/proxy/status')
    return response.data
  },

  async startProxy() {
    const response = await client.post('/proxy/start')
    return response.data
  },

  async stopProxy() {
    const response = await client.post('/proxy/stop')
    return response.data
  },

  // Clear proxy logs
  async clearProxyLogs() {
    const response = await client.post('/proxy/logs/clear')
    return response.data
  },

  // Codex Proxy management
  async getCodexProxyStatus() {
    const response = await client.get('/codex/proxy/status')
    return response.data
  },

  async startCodexProxy() {
    const response = await client.post('/codex/proxy/start')
    return response.data
  },

  async stopCodexProxy() {
    const response = await client.post('/codex/proxy/stop')
    return response.data
  },

  // Terminal settings
  async getAvailableTerminals() {
    const response = await client.get('/settings/terminals')
    return response.data
  },

  async getTerminalConfig() {
    const response = await client.get('/settings/terminal-config')
    return response.data
  },

  async saveTerminalConfig(selectedTerminal, customCommand = null) {
    const response = await client.post('/settings/terminal-config', {
      selectedTerminal,
      customCommand
    })
    return response.data
  },

  // Statistics
  async getStatistics() {
    const response = await client.get('/statistics/summary')
    return response.data
  },

  async getTodayStatistics() {
    const response = await client.get('/statistics/today')
    return response.data
  },

  async getDailyStatistics(date) {
    const response = await client.get(`/statistics/daily/${date}`)
    return response.data
  },

  async getRecentStatistics(days = 7) {
    const response = await client.get('/statistics/recent', { params: { days } })
    return response.data
  }
}

export default api
