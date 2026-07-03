function mountChatTemplate(container, options = {}) {
  container.innerHTML = `
    <div class="view-chat">
      ${buildChatActionBarHtml()}
      <div class="view-body view-body-full">
        <div class="chat-root">
          <div class="chat-stage">
            ${buildActionPanelHtml()}
            <div class="chat-messages-scroll">
              <div class="chat-column">
                <div class="chat-messages"></div>
              </div>
            </div>
          </div>
          <div class="chat-input-area">
            <div class="chat-column">
              <div class="chat-input-shell">
                <textarea class="chat-input" rows="4" placeholder="输入消息，Enter 发送，Shift+Enter 换行"></textarea>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  setViewTitle(container, options.title || '未命名');
  initActionPanel(container, [SETTINGS_TAB]);

  const playerLabel = options.playerLabel || 'A';
  const initialMessages = options.initialMessages !== undefined
    ? options.initialMessages
    : getChatMessages();

  const chat = initChat(container.querySelector('.chat-root'), {
    playerLabel,
    initialMessages,
    onSend(text) {
      handleChatSend({
        text,
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
