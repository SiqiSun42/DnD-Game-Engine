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

    const usesGamePipeline = resolvedChannel === CHAT_CHANNELS.GAME
      || resolvedChannel === CHAT_CHANNELS.CHECK_TEST
      || resolvedChannel === CHAT_CHANNELS.COMBAT_TEST;

    if (usesGamePipeline && typeof buildGameContext === 'function') {
      const gameContext = buildGameContext();
      if (gameContext) {
        request.gameContext = gameContext;
      }
    }

    const reply = await llmChat(request);

    const dmLabel = reply.label || 'DM';
    let dmText = reply.text || '';
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

    if (pipelineMessages.length) {
      pipelineMessages.forEach((segment, index) => {
        const segmentText = segment.text || '';
        const segmentLabel = segment.label || dmLabel;
        const isLast = index === pipelineMessages.length - 1;
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

        const segmentReasoning = segment.reasoning
          || (isLast ? dmReasoning : undefined);

        chat.addMessage('dm', segmentDisplayText, segmentLabel, {
          reasoning: segmentReasoning,
          judgeResult: isLast ? (dmJudgeResult || undefined) : undefined,
        });
        appendChatMessage({
          role: 'dm',
          label: segmentLabel,
          text: segmentDisplayText,
          reasoning: segmentReasoning || undefined,
          judgeResult: isLast ? (dmJudgeResult || undefined) : undefined,
        });
      });
      dmText = pipelineMessages[pipelineMessages.length - 1]?.text || dmText;
    } else {
      if (usesGamePipeline && typeof extractGameSyncFromDmText === 'function') {
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
          enteredCombat = enteredCombat || statusResult.enteredCombat;
          if (typeof refreshStatusPanelIfOpen === 'function') {
            refreshStatusPanelIfOpen();
          }
        }
      }

      chat.addMessage('dm', dmText, dmLabel, {
        reasoning: dmReasoning,
        judgeResult: dmJudgeResult || undefined,
      });
      appendChatMessage({
        role: 'dm',
        label: dmLabel,
        text: dmText,
        reasoning: dmReasoning || undefined,
        judgeResult: dmJudgeResult || undefined,
      });
    }

    if (usesGamePipeline && enteredCombat && resolvedChannel !== CHAT_CHANNELS.COMBAT_TEST) {
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
