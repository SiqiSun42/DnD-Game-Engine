const CONSULT_SAVE_NAME = '咨询城主';
const CHECK_TEST_SAVE_NAME = '鉴定测试';

const CHAT_CHANNELS = {
  CONSULT: 'consult',
  CHECK_TEST: 'check-test',
  GAME: 'game',
  START_GAME: 'start-game',
  CONVERSATION: 'conversation',
  ADVENTURE: 'adventure',
};

function resolveChatChannel(options = {}) {
  if (options.channel) {
    return options.channel;
  }

  const saveName = typeof getActiveSaveName === 'function' ? getActiveSaveName() : null;
  const meta = typeof getActiveSaveMeta === 'function' ? getActiveSaveMeta() : null;

  if (saveName === CONSULT_SAVE_NAME) {
    return CHAT_CHANNELS.CONSULT;
  }
  if (saveName === CHECK_TEST_SAVE_NAME) {
    return CHAT_CHANNELS.CHECK_TEST;
  }
  if (meta?.docType === 'game') {
    return CHAT_CHANNELS.GAME;
  }
  if (meta?.docType === 'conversation') {
    return CHAT_CHANNELS.CONVERSATION;
  }
  return CHAT_CHANNELS.ADVENTURE;
}

function appendModeTags(text, modeTags) {
  const visible = String(text || '');
  if (!Array.isArray(modeTags) || !modeTags.length) {
    return visible;
  }
  const suffix = modeTags.map(tag => `【${tag}】`).join('');
  return `${visible}${suffix}`;
}

function buildApiMessages(messages) {
  return (messages || []).map(message => ({
    role: message.role,
    content: appendModeTags(message.text, message.modeTags),
    label: message.label || null,
  }));
}

function buildGameContext() {
  const data = typeof getActiveSaveData === 'function' ? getActiveSaveData() : null;
  if (!data) return null;

  const world = data.world || {};
  const locationId = world.defaultLocationId;
  const locationNode = typeof findLocationNode === 'function'
    ? findLocationNode(locationId, world.locationTree || [])
    : null;

  return {
    saveName: typeof getActiveSaveName === 'function' ? getActiveSaveName() : null,
    location: locationNode?.name || locationId || null,
    locationDescription: locationNode?.description || null,
    locationNode: locationNode || null,
    world: world,
    wealth: data.inventory?.wealth || null,
    inventory: data.inventory || null,
    status: data.status || null,
    inCombat: data.status?.inCombat ?? false,
    currentQuests: data.notes?.currentQuests || [],
    historyQuests: data.notes?.historyQuests || { pages: [] },
    characters: data.characters || null,
    devPlotTree: data.notes?.devPlotTree || null,
    defaultDevPlotEntryId: data.notes?.defaultDevPlotEntryId || null,
    settingsGame: data.settingsGame || null,
    promptFile: data.settingsGame?.promptFile || null,
  };
}
