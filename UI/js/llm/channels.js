const CONSULT_SAVE_NAME = '咨询城主';

const CHAT_CHANNELS = {
  CONSULT: 'consult',
  GAME: 'game',
  START_GAME: 'start-game',
  CONVERSATION: 'conversation',
  ADVENTURE: 'adventure',
};

function shouldAttachGameContext(channel) {
  return channel !== CHAT_CHANNELS.CONSULT
    && channel !== CHAT_CHANNELS.CONVERSATION
    && channel !== CHAT_CHANNELS.ADVENTURE
    && channel !== CHAT_CHANNELS.START_GAME;
}

function resolveChatChannel(options = {}) {
  if (options.channel) {
    return options.channel;
  }

  const data = typeof getActiveSaveData === 'function' ? getActiveSaveData() : null;
  const configuredChannel = data?.settingsGame?.channel;
  if (typeof configuredChannel === 'string' && configuredChannel.trim()) {
    return configuredChannel.trim();
  }

  const meta = typeof getActiveSaveMeta === 'function' ? getActiveSaveMeta() : null;
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

  const inventoryView = typeof resolveInventoryForUi === 'function'
    ? resolveInventoryForUi(data.inventory, data.status)
    : (data.inventory || null);

  const context = {
    saveName: typeof getActiveSaveName === 'function' ? getActiveSaveName() : null,
    location: locationNode?.name || locationId || null,
    locationDescription: locationNode?.description || null,
    locationNode: locationNode || null,
    world: world,
    wealth: inventoryView?._derived?.totalGoldGp ?? inventoryView?.wealth ?? null,
    inventory: inventoryView || null,
    status: data.status || null,
    inCombat: data.status?.inCombat ?? false,
    participants: data.status?.participants ?? -1,
    missions: data.missions || null,
    characters: data.characters || null,
    settingsGame: data.settingsGame || null,
    promptFile: data.settingsGame?.promptFile || null,
  };

  if (typeof attachSaveDerivedToContext === 'function') {
    attachSaveDerivedToContext(context, data);
  }

  return context;
}
