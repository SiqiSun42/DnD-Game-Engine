const MAX_COMBAT_AUTO_CONTINUE = 48;

function displayDmReply({
  reply,
  chat,
  usesGamePipeline,
  isLastInChain,
}) {
  const dmReasoning = reply.reasoning || '';
  const dmJudgeResult = reply.judgeResult || '';
  const pipelineMessages = Array.isArray(reply.pipelineMessages) ? reply.pipelineMessages : [];
  let enteredCombat = false;

  if (reply.statusSync && typeof applyStatusSync === 'function') {
    const statusResult = applyStatusSync(reply.statusSync);
    enteredCombat = statusResult.enteredCombat;
    if (typeof refreshStatusPanelIfOpen === 'function') {
      refreshStatusPanelIfOpen();
    }
  }

  const renderSegment = (segmentText, segmentReasoning, showJudge) => {
    let segmentDisplayText = segmentText;

    if (usesGamePipeline && typeof extractGameSyncFromDmText === 'function') {
      const gameSync = extractGameSyncFromDmText(segmentText);
      segmentDisplayText = gameSync.displayText;
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
        enteredCombat = enteredCombat || statusResult.enteredCombat;
        if (typeof refreshStatusPanelIfOpen === 'function') {
          refreshStatusPanelIfOpen();
        }
      }
    }

    chat.addMessage('dm', segmentDisplayText, 'DM', {
      reasoning: segmentReasoning || undefined,
      judgeResult: showJudge ? (dmJudgeResult || undefined) : undefined,
    });
    appendChatMessage({
      role: 'dm',
      label: 'DM',
      text: segmentDisplayText,
      reasoning: segmentReasoning || undefined,
      judgeResult: showJudge ? (dmJudgeResult || undefined) : undefined,
    });
  };

  if (pipelineMessages.length) {
    pipelineMessages.forEach((segment, index) => {
      const isLast = index === pipelineMessages.length - 1;
      renderSegment(
        segment.text || '',
        segment.reasoning || (isLast ? dmReasoning : undefined),
        isLast && isLastInChain,
      );
    });
  } else {
    renderSegment(
      reply.text || '',
      dmReasoning,
      isLastInChain,
    );
  }

  return enteredCombat;
}

async function requestChat({
  channel,
  saveName,
  combatContinue = false,
}) {
  const request = {
    channel,
    messages: buildApiMessages(getChatMessages()),
    saveName,
    combatContinue,
  };

  const usesGamePipeline = channel === CHAT_CHANNELS.GAME
    || channel === CHAT_CHANNELS.CHECK_TEST
    || channel === CHAT_CHANNELS.COMBAT_TEST;

  if (usesGamePipeline && typeof buildGameContext === 'function') {
    const gameContext = buildGameContext();
    if (gameContext) {
      request.gameContext = gameContext;
    }
  }

  return llmChat(request);
}

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

  if (typeof chat.setBusy === 'function') {
    chat.setBusy(true);
  }

  try {
    const usesGamePipeline = resolvedChannel === CHAT_CHANNELS.GAME
      || resolvedChannel === CHAT_CHANNELS.CHECK_TEST
      || resolvedChannel === CHAT_CHANNELS.COMBAT_TEST;

    if (typeof chat.showThinking === 'function') {
      chat.showThinking('DM');
    }
    let reply = await requestChat({
      channel: resolvedChannel,
      saveName: resolvedSaveName,
      combatContinue: false,
    });
    if (typeof chat.hideThinking === 'function') {
      chat.hideThinking();
    }

    let enteredCombat = displayDmReply({
      reply,
      chat,
      usesGamePipeline,
      isLastInChain: !reply.combatAutoContinue,
    });

    if (resolvedChannel === CHAT_CHANNELS.COMBAT_TEST) {
      let continueCount = 0;
      while (reply.combatAutoContinue && continueCount < MAX_COMBAT_AUTO_CONTINUE) {
        continueCount += 1;
        if (typeof chat.showThinking === 'function') {
          chat.showThinking('DM');
        }
        reply = await requestChat({
          channel: resolvedChannel,
          saveName: resolvedSaveName,
          combatContinue: true,
        });
        if (typeof chat.hideThinking === 'function') {
          chat.hideThinking();
        }
        const stepEnteredCombat = displayDmReply({
          reply,
          chat,
          usesGamePipeline,
          isLastInChain: !reply.combatAutoContinue,
        });
        enteredCombat = enteredCombat || stepEnteredCombat;
      }
    }

    if (usesGamePipeline && enteredCombat && resolvedChannel !== CHAT_CHANNELS.COMBAT_TEST) {
      const combatPrompt = typeof getCombatEntryPrompt === 'function'
        ? getCombatEntryPrompt()
        : '现在进入战斗！你希望这场战斗如何结束？可输入：胜利 / 失败 / 逃跑';
      chat.addMessage('dm', combatPrompt, 'DM');
      appendChatMessage({
        role: 'dm',
        label: 'DM',
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
    if (typeof chat.hideThinking === 'function') {
      chat.hideThinking();
    }
    if (typeof chat.setBusy === 'function') {
      chat.setBusy(false);
    }
  }
}
