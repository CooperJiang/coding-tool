import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import api from '../api'

export const useSessionsStore = defineStore('sessions', () => {
  const projects = ref([])
  const currentProject = ref(null)
  const currentProjectInfo = ref(null)
  const sessions = ref([])
  const aliases = ref({})
  const totalSize = ref(0)
  const loading = ref(false)
  const error = ref(null)
  const currentChannel = ref('claude') // 当前渠道

  // Computed
  const sessionsWithAlias = computed(() => {
    return sessions.value.map(session => ({
      ...session,
      alias: aliases.value[session.sessionId] || null
    }))
  })

  // Actions
  function setChannel(channel) {
    currentChannel.value = channel
  }

  async function fetchProjects() {
    loading.value = true
    error.value = null
    try {
      const data = await api.getProjects(currentChannel.value)
      projects.value = data.projects
      currentProject.value = data.currentProject
    } catch (err) {
      error.value = err.message
    } finally {
      loading.value = false
    }
  }

  async function fetchSessions(projectName) {
    loading.value = true
    error.value = null
    try {
      const data = await api.getSessions(projectName, currentChannel.value)
      sessions.value = data.sessions
      aliases.value = data.aliases
      totalSize.value = data.totalSize || 0
      currentProject.value = projectName
      currentProjectInfo.value = data.projectInfo
    } catch (err) {
      error.value = err.message
    } finally {
      loading.value = false
    }
  }

  async function setAlias(sessionId, alias) {
    try {
      await api.setAlias(sessionId, alias)
      aliases.value[sessionId] = alias
    } catch (err) {
      error.value = err.message
      throw err
    }
  }

  async function deleteAlias(sessionId) {
    try {
      await api.deleteAlias(sessionId)
      delete aliases.value[sessionId]
    } catch (err) {
      error.value = err.message
      throw err
    }
  }

  async function deleteSession(sessionId) {
    try {
      await api.deleteSession(currentProject.value, sessionId, currentChannel.value)
      sessions.value = sessions.value.filter(s => s.sessionId !== sessionId)
      if (aliases.value[sessionId]) {
        delete aliases.value[sessionId]
      }
    } catch (err) {
      error.value = err.message
      throw err
    }
  }

  async function forkSession(sessionId) {
    try {
      const data = await api.forkSession(currentProject.value, sessionId, currentChannel.value)
      await fetchSessions(currentProject.value)
      return data.newSessionId
    } catch (err) {
      error.value = err.message
      throw err
    }
  }

  async function saveProjectOrder(order) {
    try {
      await api.saveProjectOrder(order, currentChannel.value)
      // Reorder local projects array
      const orderedProjects = order.map(name =>
        projects.value.find(p => p.name === name)
      ).filter(Boolean)
      // Add any new projects not in order
      const remaining = projects.value.filter(p => !order.includes(p.name))
      projects.value = [...orderedProjects, ...remaining]
    } catch (err) {
      error.value = err.message
      throw err
    }
  }

  async function deleteProject(projectName) {
    try {
      await api.deleteProject(projectName, currentChannel.value)
      projects.value = projects.value.filter(p => p.name !== projectName)
      if (currentProject.value === projectName) {
        currentProject.value = null
      }
    } catch (err) {
      error.value = err.message
      throw err
    }
  }

  async function saveSessionOrder(order) {
    try {
      await api.saveSessionOrder(currentProject.value, order, currentChannel.value)
      // Reorder local sessions array
      const orderedSessions = order.map(sessionId =>
        sessions.value.find(s => s.sessionId === sessionId)
      ).filter(Boolean)
      // Add any new sessions not in order
      const remaining = sessions.value.filter(s => !order.includes(s.sessionId))
      sessions.value = [...orderedSessions, ...remaining]
    } catch (err) {
      error.value = err.message
      throw err
    }
  }

  return {
    projects,
    currentProject,
    currentProjectInfo,
    sessions,
    aliases,
    totalSize,
    loading,
    error,
    currentChannel,
    sessionsWithAlias,
    setChannel,
    fetchProjects,
    fetchSessions,
    setAlias,
    deleteAlias,
    deleteSession,
    forkSession,
    saveProjectOrder,
    saveSessionOrder,
    deleteProject
  }
})
