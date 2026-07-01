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

  const defaultMessages = options.initialMessages || [
    { role: 'dm', label: 'DM', text: '你好，我是城主。有什么规则或冒险相关的问题可以问我。' },
  ];

  const chat = initChat(container.querySelector('.chat-root'), {
    playerLabel: options.playerLabel || 'A',
    initialMessages: defaultMessages,
    onSend() {
      dmTestReply(chat);
    },
  });

  chat.focusInput();
  return chat;
}
