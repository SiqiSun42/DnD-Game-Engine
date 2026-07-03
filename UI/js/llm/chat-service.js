async function handleChatSend({ text, playerLabel, chat, channel, saveName }) {
  appendChatMessage({ role: 'player', label: playerLabel, text });

  const resolvedChannel = channel || resolveChatChannel();
  const resolvedSaveName = saveName !== undefined
    ? saveName
    : (typeof getActiveSaveName === 'function' ? getActiveSaveName() : null);

  const messages = buildApiMessages(getChatMessages());

  if (typeof chat.setBusy === 'function') {
    chat.setBusy(true);
  }

  try {
    const reply = await llmChat({
      channel: resolvedChannel,
      messages,
      saveName: resolvedSaveName,
    });

    const dmLabel = reply.label || 'DM';
    const dmText = reply.text || '';
    chat.addMessage('dm', dmText, dmLabel);
    appendChatMessage({ role: 'dm', label: dmLabel, text: dmText });
  } catch (error) {
    const fallback = error?.name === 'AbortError'
      ? 'Request timed out. Please try again.'
      : (error?.message || 'LLM request failed.');
    chat.addMessage('dm', fallback, 'DM');
    appendChatMessage({ role: 'dm', label: 'DM', text: fallback });
  } finally {
    if (typeof chat.setBusy === 'function') {
      chat.setBusy(false);
    }
  }
}
