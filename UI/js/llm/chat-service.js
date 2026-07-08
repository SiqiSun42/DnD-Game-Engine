async function handleChatSend({ text, playerLabel, chat, channel, saveName, modeTags = [] }) {
  const activeModeTags = Array.isArray(modeTags)
    ? modeTags.filter(tag => typeof tag === 'string' && tag.trim())
    : [];

  appendChatMessage({
    role: 'player',
    label: playerLabel,
    text,
    modeTags: activeModeTags.length ? activeModeTags : undefined,
  });

  const resolvedChannel = channel || resolveChatChannel();
  const resolvedSaveName = saveName !== undefined
    ? saveName
    : (typeof getActiveSaveName === 'function' ? getActiveSaveName() : null);

  const messages = buildApiMessages(getChatMessages());

  if (typeof chat.setBusy === 'function') {
    chat.setBusy(true);
  }

  try {
    const request = {
      channel: resolvedChannel,
      messages,
      saveName: resolvedSaveName,
    };

    if (resolvedChannel === CHAT_CHANNELS.GAME && typeof buildGameContext === 'function') {
      const gameContext = buildGameContext();
      if (gameContext) {
        request.gameContext = gameContext;
      }
    }

    const reply = await llmChat(request);

    const dmLabel = reply.label || 'DM';
    let dmText = reply.text || '';
    const dmReasoning = reply.reasoning || '';
    let enteredCombat = false;

    if (resolvedChannel === CHAT_CHANNELS.GAME && typeof extractGameSyncFromDmText === 'function') {
      const gameSync = extractGameSyncFromDmText(dmText);
      dmText = gameSync.displayText;
      if (gameSync.questSync && typeof applyQuestSync === 'function') {
        applyQuestSync(gameSync.questSync);
        if (typeof refreshNotesPanelIfOpen === 'function') {
          refreshNotesPanelIfOpen();
        }
      }
      if (gameSync.inventorySync && typeof applyInventorySync === 'function') {
        applyInventorySync(gameSync.inventorySync);
        if (typeof refreshBackpackPanelIfOpen === 'function') {
          refreshBackpackPanelIfOpen();
        }
      }
      if (gameSync.statusSync && typeof applyStatusSync === 'function') {
        const statusResult = applyStatusSync(gameSync.statusSync);
        enteredCombat = statusResult.enteredCombat;
        if (typeof refreshStatusPanelIfOpen === 'function') {
          refreshStatusPanelIfOpen();
        }
      }
    }

    chat.addMessage('dm', dmText, dmLabel, { reasoning: dmReasoning });
    appendChatMessage({
      role: 'dm',
      label: dmLabel,
      text: dmText,
      reasoning: dmReasoning || undefined,
    });

    if (resolvedChannel === CHAT_CHANNELS.GAME && enteredCombat) {
      const combatPrompt = typeof getCombatEntryPrompt === 'function'
        ? getCombatEntryPrompt()
        : '现在进入战斗！你希望这场战斗如何结束？可输入：胜利 / 失败 / 逃跑';
      chat.addMessage('dm', combatPrompt, dmLabel);
      appendChatMessage({
        role: 'dm',
        label: dmLabel,
        text: combatPrompt,
      });
    }
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
