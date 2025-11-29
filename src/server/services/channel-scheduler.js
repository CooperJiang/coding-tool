const { getAllChannels } = require('./channels');
const { getChannels: getCodexChannels } = require('./codex-channels');
const { getChannels: getGeminiChannels } = require('./gemini-channels');
const { isChannelAvailable, getChannelHealthStatus, setOnChannelFrozen } = require('./channel-health');

const channelProviders = {
  claude: () => getAllChannels(),
  codex: () => {
    const data = getCodexChannels();
    return Array.isArray(data?.channels) ? data.channels : [];
  },
  gemini: () => {
    const data = getGeminiChannels();
    return Array.isArray(data?.channels) ? data.channels : [];
  }
};

function createState() {
  return {
    channels: [],
    signature: '',
    inflight: new Map(),
    sessionBindings: new Map(),
    queue: []
  };
}

const schedulerStates = {
  claude: createState(),
  codex: createState(),
  gemini: createState()
};

function getState(source = 'claude') {
  if (!schedulerStates[source]) {
    schedulerStates[source] = createState();
  }
  return schedulerStates[source];
}

const WAIT_TIMEOUT_MS = 15000;

/**
 * 解绑指定渠道的所有会话
 */
function unbindChannelSessions(source, channelId) {
  const state = getState(source);
  let unbindCount = 0;
  for (const [sessionId, boundChannelId] of state.sessionBindings) {
    if (boundChannelId === channelId) {
      state.sessionBindings.delete(sessionId);
      unbindCount++;
    }
  }
  if (unbindCount > 0) {
    console.log(`[ChannelScheduler] Unbound ${unbindCount} sessions from ${source} channel ${channelId}`);
  }
}

// 注册冻结回调，当渠道被冻结时解绑其会话
setOnChannelFrozen(unbindChannelSessions);

function buildSignature(channels) {
  return JSON.stringify(
    channels.map(ch => ({
      id: ch.id,
      enabled: ch.enabled !== false,
      weight: ch.weight || 1,
      maxConcurrency: ch.maxConcurrency ?? null // 保持 null 值
    }))
  );
}

function refreshChannels(source = 'claude') {
  const state = getState(source);
  const provider = channelProviders[source];
  if (!provider) return;
  const raw = provider();
  const signature = buildSignature(raw);

  if (signature === state.signature) {
    return;
  }

  state.signature = signature;
  state.channels = raw
    .filter(ch => ch.enabled !== false)
    .map(ch => ({
      id: ch.id,
      name: ch.name,
      baseUrl: ch.baseUrl,
      apiKey: ch.apiKey,
      weight: Math.max(1, Number(ch.weight) || 1),
      maxConcurrency: ch.maxConcurrency ?? null
    }));

  state.channels.forEach(ch => {
    if (!state.inflight.has(ch.id)) {
      state.inflight.set(ch.id, 0);
    }
  });
}

function getAvailableChannels(source = 'claude') {
  refreshChannels(source);
  const state = getState(source);
  return state.channels.filter(ch => {
    if (!isChannelAvailable(ch.id, source)) {
      return false;
    }
    if (ch.maxConcurrency === null) {
      return true;
    }
    return (state.inflight.get(ch.id) || 0) < ch.maxConcurrency;
  });
}

function pickWeightedChannel(channels) {
  if (!channels.length) return null;
  const totalWeight = channels.reduce((sum, ch) => sum + ch.weight, 0);
  let threshold = Math.random() * totalWeight;
  for (const channel of channels) {
    threshold -= channel.weight;
    if (threshold <= 0) {
      return channel;
    }
  }
  return channels[channels.length - 1];
}

function tryAllocate(source = 'claude', options = {}) {
  const state = getState(source);
  const sessionId = options.sessionId;
  const enableSessionBinding = options.enableSessionBinding !== false; // 默认开启
  const available = getAvailableChannels(source);
  if (!available.length) {
    return null;
  }

  // 如果启用会话绑定且已有绑定，优先使用绑定渠道
  if (enableSessionBinding && sessionId && state.sessionBindings.has(sessionId)) {
    const boundId = state.sessionBindings.get(sessionId);
    const boundChannel = available.find(ch => ch.id === boundId);
    if (boundChannel) {
      state.inflight.set(boundChannel.id, (state.inflight.get(boundChannel.id) || 0) + 1);
      return boundChannel;
    }
  }

  // 选择新的渠道（加权随机）
  const chosen = pickWeightedChannel(available);
  if (!chosen) return null;

  // 只有在启用会话绑定时才记录绑定
  if (enableSessionBinding && sessionId) {
    state.sessionBindings.set(sessionId, chosen.id);
  }
  state.inflight.set(chosen.id, (state.inflight.get(chosen.id) || 0) + 1);
  return chosen;
}

function drainQueue(source = 'claude') {
  const state = getState(source);
  if (!state.queue.length) return;

  for (let i = 0; i < state.queue.length; i++) {
    const entry = state.queue[i];
    const channel = tryAllocate(source, entry.options);
    if (channel) {
      clearTimeout(entry.timer);
      state.queue.splice(i, 1);
      entry.resolve(channel);
      return drainQueue(source);
    }
  }
}

function allocateChannel(options = {}) {
  const source = options.source || 'claude';
  const state = getState(source);
  const channel = tryAllocate(source, options);
  if (channel) {
    return Promise.resolve(channel);
  }

  if (!state.channels.length) {
    return Promise.reject(new Error('暂无可用渠道，请先添加并启用至少一个渠道'));
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const index = state.queue.findIndex(item => item.timer === timer);
      if (index !== -1) {
        state.queue.splice(index, 1);
      }
      reject(new Error('所有渠道均已达到并发上限，请稍后重试'));
    }, WAIT_TIMEOUT_MS);

    state.queue.push({
      source,
      options,
      resolve,
      reject,
      timer
    });
  });
}

function releaseChannel(channelId, source = 'claude') {
  const state = getState(source);
  if (!channelId) return;
  if (!state.inflight.has(channelId)) {
    state.inflight.set(channelId, 0);
  }
  const current = state.inflight.get(channelId) || 0;
  state.inflight.set(channelId, current > 0 ? current - 1 : 0);
  drainQueue(source);
}

function getSchedulerState(source = 'claude') {
  refreshChannels(source);
  const state = getState(source);
  return {
    channels: state.channels.map(ch => {
      const healthStatus = getChannelHealthStatus(ch.id, source);
      return {
        id: ch.id,
        name: ch.name,
        weight: ch.weight,
        maxConcurrency: ch.maxConcurrency,
        inflight: state.inflight.get(ch.id) || 0,
        health: healthStatus
      };
    }),
    pending: state.queue.length
  };
}

module.exports = {
  allocateChannel,
  releaseChannel,
  getSchedulerState
};
