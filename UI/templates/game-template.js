function mountGameTemplate(container, options = {}) {
  container.innerHTML = `
    <div class="view-game">
      ${buildGameActionBarHtml()}
      <div class="view-body">
        <div class="chat-root">
          <div class="chat-stage">
            ${buildActionPanelHtml()}
            <div class="chat-messages-scroll">
              <div class="chat-column">
                <div class="chat-messages"></div>
              </div>
            </div>
          </div>
          ${buildChatInputAreaHtml()}
        </div>
      </div>
    </div>
  `;

  setViewTitle(container, options.title || '未命名');
  initActionPanel(container, ALL_PANEL_TABS);

  const playerLabel = options.playerLabel || 'A';
  const chat = initChat(container.querySelector('.chat-root'), {
    playerLabel,
    initialMessages: options.initialMessages || getChatMessages(),
    onSend(text, modeTags) {
      handleChatSend({
        text,
        modeTags,
        playerLabel,
        chat,
        channel: options.channel,
        saveName: options.saveName,
      });
    },
  });

  chat.focusInput();
  return chat;
}
