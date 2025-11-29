// 渠道管理命令
const chalk = require('chalk');
const inquirer = require('inquirer');
const { loadConfig } = require('../config/loader');

/**
 * 获取当前类型的渠道服务
 */
function getChannelServices(cliType) {
  if (cliType === 'claude') {
    const {
      getAllChannels,
      createChannel,
      updateChannel
    } = require('../server/services/channels');
    const { getProxyStatus } = require('../server/proxy-server');
    return { getAllChannels, createChannel, updateChannel, getProxyStatus };
  } else if (cliType === 'codex') {
    const {
      getChannels,
      createChannel,
      updateChannel
    } = require('../server/services/codex-channels');
    const { getCodexProxyStatus } = require('../server/codex-proxy-server');
    return {
      getAllChannels: () => {
        const result = getChannels();
        return Array.isArray(result?.channels) ? result.channels : [];
      },
      createChannel,
      updateChannel,
      getProxyStatus: getCodexProxyStatus
    };
  } else if (cliType === 'gemini') {
    const {
      getChannels,
      createChannel,
      updateChannel
    } = require('../server/services/gemini-channels');
    const { getGeminiProxyStatus } = require('../server/gemini-proxy-server');
    return {
      getAllChannels: () => {
        const result = getChannels();
        return Array.isArray(result?.channels) ? result.channels : [];
      },
      createChannel,
      updateChannel,
      getProxyStatus: getGeminiProxyStatus
    };
  }
}

/**
 * 渠道管理
 */
async function handleChannelManagement() {
  console.clear();
  console.log(chalk.bold.cyan('\n╔═══════════════════════════════════════╗'));
  console.log(chalk.bold.cyan('║          渠道管理          ║'));
  console.log(chalk.bold.cyan('╚═══════════════════════════════════════╝\n'));

  const config = loadConfig();
  const cliType = config.currentCliType || 'claude';
  const services = getChannelServices(cliType);
  if (!services || typeof services.getAllChannels !== 'function') {
    console.log(chalk.red(`当前 CLI 类型 (${cliType}) 暂不支持渠道管理`));
    await inquirer.prompt([{ type: 'input', name: 'continue', message: '按回车返回...' }]);
    return;
  }

  const channels = services.getAllChannels();

  if (channels.length === 0) {
    console.log(chalk.yellow('还没有添加任何渠道'));
    console.log(chalk.gray('提示: 使用主菜单的"添加渠道"功能来添加新渠道\n'));

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: '请选择操作:',
        choices: [
          { name: chalk.blue('返回主菜单'), value: 'back' },
        ],
      },
    ]);

    return;
  }

  const supportsMultiToggle = typeof services.updateChannel === 'function';

  if (supportsMultiToggle) {
    await handleChannelToggle(channels, services, cliType);
    return;
  }

  await handleLegacySwitch(channels, services);
}

/**
 * 添加渠道
 */
async function handleAddChannel() {
  console.clear();
  console.log(chalk.bold.cyan('\n╔═══════════════════════════════════════╗'));
  console.log(chalk.bold.cyan('║          添加渠道          ║'));
  console.log(chalk.bold.cyan('╚═══════════════════════════════════════╝\n'));

  const config = loadConfig();
  const cliType = config.currentCliType || 'claude';
  const services = getChannelServices(cliType);

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: '渠道名称:',
      validate: (input) => {
        if (!input.trim()) {
          return '渠道名称不能为空';
        }
        return true;
      },
    },
    {
      type: 'input',
      name: 'baseUrl',
      message: 'Base URL:',
      validate: (input) => {
        if (!input.trim()) {
          return 'Base URL 不能为空';
        }
        // 简单的 URL 验证
        if (!input.startsWith('http://') && !input.startsWith('https://')) {
          return 'Base URL 必须以 http:// 或 https:// 开头';
        }
        return true;
      },
    },
    {
      type: 'input',
      name: 'apiKey',
      message: 'API Key:',
      validate: (input) => {
        if (!input.trim()) {
          return 'API Key 不能为空';
        }
        return true;
      },
    },
    {
      type: 'input',
      name: 'websiteUrl',
      message: '网站地址（可选，直接回车跳过）:',
    },
  ]);

  try {
    let channel;

    // Claude 类型的参数: (name, baseUrl, apiKey, websiteUrl, extraConfig)
    if (cliType === 'claude') {
      channel = services.createChannel(
        answers.name.trim(),
        answers.baseUrl.trim(),
        answers.apiKey.trim(),
        answers.websiteUrl.trim() || undefined
      );
    }
    // Codex 类型的参数: (name, providerKey, baseUrl, apiKey, wireApi, extraConfig)
    else if (cliType === 'codex') {
      // Codex 需要额外的 providerKey 和 wireApi 参数
      // 在这里简化为使用 name 作为 providerKey，wireApi 固定为 'responses'
      channel = services.createChannel(
        answers.name.trim(),
        answers.name.trim().toLowerCase().replace(/\s+/g, '-'), // 生成 providerKey
        answers.baseUrl.trim(),
        answers.apiKey.trim(),
        'responses', // wireApi 固定值
        { websiteUrl: answers.websiteUrl.trim() || undefined }
      );
    }
    // Gemini 类型的参数: (name, baseUrl, apiKey, model, extraConfig)
    else if (cliType === 'gemini') {
      // Gemini 需要 model 参数
      const modelAnswer = await inquirer.prompt([
        {
          type: 'input',
          name: 'model',
          message: '模型名称 (默认: gemini-2.5-pro):',
          default: 'gemini-2.5-pro'
        }
      ]);

      channel = services.createChannel(
        answers.name.trim(),
        answers.baseUrl.trim(),
        answers.apiKey.trim(),
        modelAnswer.model.trim(),
        { websiteUrl: answers.websiteUrl.trim() || undefined }
      );
    }

    console.log(chalk.green(`\n✅ 渠道添加成功: ${channel.name}\n`));
    console.log(chalk.gray('提示: 使用"渠道管理"功能来启用此渠道\n'));
    broadcastSchedulerSnapshot(cliType);

    await inquirer.prompt([
      {
        type: 'input',
        name: 'continue',
        message: '按回车继续...',
      },
    ]);
  } catch (error) {
    console.log(chalk.red(`\n❌ 添加失败: ${error.message}\n`));

    await inquirer.prompt([
      {
        type: 'input',
        name: 'continue',
        message: '按回车继续...',
      },
    ]);
  }
}

async function handleChannelStatus() {
  console.clear();
  console.log(chalk.bold.cyan('\n╔═══════════════════════════════════════╗'));
  console.log(chalk.bold.cyan('║          调度状态查看          ║'));
  console.log(chalk.bold.cyan('╚═══════════════════════════════════════╝\n'));

  try {
    const { getSchedulerState } = require('../server/services/channel-scheduler');
    const sources = [
      { key: 'claude', label: 'Claude (Claude Code)' },
      { key: 'codex', label: 'Codex (OpenAI)' },
      { key: 'gemini', label: 'Gemini' }
    ];

    sources.forEach((source) => {
      const state = getSchedulerState(source.key);
      console.log(chalk.bold(`\n[${source.label}]`));
      console.log(chalk.gray(`排队中: ${state.pending || 0}`));

      if (!state.channels || state.channels.length === 0) {
        console.log(chalk.yellow('暂无调度数据或未启用渠道。'));
      } else {
        state.channels.forEach((channel, index) => {
          const concurrency = channel.maxConcurrency ?? '∞';
          const healthText = channel.health?.statusText || '健康';
          const healthColor = channel.health?.statusColor || '#18a058';
          console.log(
            `${chalk.cyan(String(index + 1).padStart(2, '0'))}. ${chalk.bold(channel.name)} ` +
            chalk.gray(`并发 ${channel.inflight}/${concurrency} | 权重 ${channel.weight || 1}`)
          );
          console.log(`    健康状态: ${chalk.hex(healthColor)(healthText)}`);
        });
      }
    });
  } catch (error) {
    console.log(chalk.red('无法读取调度状态: ' + error.message));
  }

  await inquirer.prompt([{ type: 'input', name: 'continue', message: '按回车返回...' }]);
}

module.exports = {
  handleChannelManagement,
  handleAddChannel,
  handleChannelStatus
};

/**
 * 统一的多渠道选择处理
 */
async function handleChannelToggle(channels, services, cliType) {
  const choices = channels.map(channel => {
    const enabled = channel.enabled !== false;
    const detailParts = [];

    if (channel.baseUrl) {
      const cleaned = channel.baseUrl.replace('https://', '').replace('http://', '');
      detailParts.push(cleaned);
    }

    if (cliType === 'codex' && channel.providerKey) {
      detailParts.push(`provider ${channel.providerKey}`);
    }

    if (cliType === 'gemini' && channel.model) {
      detailParts.push(`model ${channel.model}`);
    }

    if (channel.maxConcurrency) {
      detailParts.push(`并发 ${channel.maxConcurrency}`);
    }

    if (channel.weight) {
      detailParts.push(`权重 ${channel.weight}`);
    }

    const detail = detailParts.length ? chalk.gray(` [${detailParts.join(' | ')}]`) : '';

    return {
      name: `${chalk.bold(channel.name)}${detail}`,
      value: channel.id,
      checked: enabled,
      short: channel.name
    };
  });

  const { selectedIds } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selectedIds',
      message: '选择需要启用的渠道（可多选，至少一个）:',
      pageSize: 15,
      choices
    }
  ]);

  if (!selectedIds.length) {
    console.log(chalk.red('\n❌ 至少需要启用一个渠道。\n'));
    await inquirer.prompt([{ type: 'input', name: 'continue', message: '按回车返回...' }]);
    return;
  }

  let hasChanged = false;
  for (const channel of channels) {
    const shouldEnable = selectedIds.includes(channel.id);
    const currentEnabled = channel.enabled !== false;
    if (shouldEnable !== currentEnabled) {
      await services.updateChannel(channel.id, { enabled: shouldEnable });
      console.log(
        `${shouldEnable ? chalk.green('✅ 启用') : chalk.yellow('⏸ 停用')} ${chalk.bold(channel.name)}`
      );
      hasChanged = true;
    }
  }

  if (hasChanged) {
    broadcastSchedulerSnapshot(cliType);
  }

  await handleAdvancedConfig(services, cliType);

  console.log(
    chalk.cyan(
      `\n提示: 多个渠道启用后将由调度器根据权重和并发自动分配请求，无需再手动切换默认渠道。\n`
    )
  );

  await inquirer.prompt([{ type: 'input', name: 'continue', message: '按回车返回...' }]);
}

async function handleAdvancedConfig(services, cliType) {
  if (typeof services.updateChannel !== 'function' || typeof services.getAllChannels !== 'function') {
    return;
  }

  const { adjust } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'adjust',
      message: '是否需要调整渠道的权重或最大并发？',
      default: false
    }
  ]);

  if (!adjust) return;

  while (true) {
    const latestChannels = services.getAllChannels();
    if (!latestChannels.length) {
      console.log(chalk.red('暂无渠道可供调整'));
      return;
    }

    const channelChoices = latestChannels.map(channel => {
      const label = `${chalk.bold(channel.name)}${chalk.gray(
        ` (并发 ${channel.maxConcurrency ?? '∞'} | 权重 ${channel.weight || 1})`
      )}`;
      return { name: label, value: channel.id };
    });
    channelChoices.push(new inquirer.Separator(chalk.gray('─'.repeat(14))));
    channelChoices.push({ name: chalk.blue('完成调整'), value: 'done' });

    const { channelId } = await inquirer.prompt([
      {
        type: 'list',
        name: 'channelId',
        message: '请选择要调整的渠道:',
        pageSize: 12,
        choices: channelChoices
      }
    ]);

    if (channelId === 'done') {
      break;
    }

    const target = latestChannels.find(ch => ch.id === channelId);
    if (!target) {
      console.log(chalk.red('未找到指定渠道'));
      continue;
    }

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'maxConcurrency',
        message: '最大并发（输入 0 表示不限）:',
        default: target.maxConcurrency ?? 0,
        validate: (input) => {
          const value = Number(input);
          if (Number.isNaN(value) || value < 0) {
            return '请输入大于等于 0 的数字';
          }
          return true;
        }
      },
      {
        type: 'input',
        name: 'weight',
        message: '调度权重（至少 1，影响被选中的概率）:',
        default: target.weight || 1,
        validate: (input) => {
          const value = Number(input);
          if (Number.isNaN(value) || value < 1) {
            return '请输入大于等于 1 的数字';
          }
          return true;
        }
      }
    ]);

    const maxConcurrencyValue = Number(answers.maxConcurrency);
    const weightValue = Number(answers.weight);

    const payload = {
      maxConcurrency: maxConcurrencyValue <= 0 ? null : Math.round(maxConcurrencyValue),
      weight: Math.max(1, Math.round(weightValue))
    };

    try {
      await services.updateChannel(target.id, payload);
      console.log(chalk.green(`已更新 ${target.name} 的并发/权重设置`));
      broadcastSchedulerSnapshot(cliType);
    } catch (error) {
      console.log(chalk.red(`更新失败: ${error.message}`));
    }
  }
}

function broadcastSchedulerSnapshot(source = 'claude') {
  try {
    const { getSchedulerState } = require('../server/services/channel-scheduler');
    const { broadcastSchedulerState } = require('../server/websocket-server');
    broadcastSchedulerState(source, getSchedulerState(source));
  } catch (err) {
    // ignore when scheduler not available
  }
}

async function handleLegacySwitch(channels, services) {
  const choices = channels.map(channel => {
    let name = channel.enabled !== false ? chalk.green('● ') : '  ';
    name += chalk.bold(channel.name);
    return {
      name,
      value: channel.id,
      short: channel.name
    };
  });

  choices.push(new inquirer.Separator(chalk.gray('─'.repeat(14))));
  choices.push({ name: chalk.blue('↩️  返回主菜单'), value: 'back' });

  const { channelId } = await inquirer.prompt([
    {
      type: 'list',
      name: 'channelId',
      message: '选择要切换的渠道（需要重启生效）:',
      pageSize: 15,
      choices
    }
  ]);

  if (channelId === 'back') {
    return;
  }

  try {
    await services.activateChannel(channelId);
    console.log(chalk.green('\n✅ 渠道已切换\n'));
  } catch (error) {
    console.log(chalk.red(`\n❌ 操作失败: ${error.message}\n`));
  }

  await inquirer.prompt([{ type: 'input', name: 'continue', message: '按回车返回...' }]);
}
