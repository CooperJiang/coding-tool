import { useGlobalStore } from '../stores/global'

export function useChannelScheduler(source = 'claude') {
  const store = useGlobalStore()

  function getChannelInflight(channelId) {
    const scheduler = store.schedulerState[source] || { channels: [] }
    const channel = scheduler.channels?.find(ch => ch.id === channelId)
    return channel ? channel.inflight : 0
  }

  return {
    getChannelInflight
  }
}
