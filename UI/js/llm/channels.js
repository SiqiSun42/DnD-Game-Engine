const CONSULT_SAVE_NAME = '咨询城主';

const CHAT_CHANNELS = {
  CONSULT: 'consult',
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
  if (meta?.docType === 'game') {
    return CHAT_CHANNELS.GAME;
  }
  if (meta?.docType === 'conversation') {
    return CHAT_CHANNELS.CONVERSATION;
  }
  return CHAT_CHANNELS.ADVENTURE;
}

function buildApiMessages(messages) {
  return (messages || []).map(message => ({
    role: message.role,
    content: message.text,
    label: message.label || null,
  }));
}
