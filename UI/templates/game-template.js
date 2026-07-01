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
  initActionPanel(container, ALL_PANEL_TABS);

  const chat = initChat(container.querySelector('.chat-root'), {
    playerLabel: options.playerLabel || 'A',
    initialMessages: options.initialMessages || [
      { role: 'dm', label: 'DM', text: '欢迎来到龙与地下城。你站在酒馆门口，空气中弥漫着麦酒与冒险的气息。你想做什么？' },
    ],
    onSend() {
      dmTestReply(chat);
    },
  });

  chat.focusInput();
  return chat;
}
