function initChat(root, options = {}) {
  const messagesEl = root.querySelector('.chat-messages');
  const scrollEl = root.querySelector('.chat-messages-scroll') || messagesEl;
  const input = root.querySelector('.chat-input');
  const sendBtn = root.querySelector('.chat-send');
  const playerLabel = options.playerLabel || 'A';

  if (options.initialMessages) {
    options.initialMessages.forEach(msg => {
      appendMessage(messagesEl, msg.role, msg.text, msg.label);
    });
    scrollToBottom(scrollEl);
  }

  function send() {
    const text = input.value.trim();
    if (!text) return;
    appendMessage(messagesEl, 'player', text, playerLabel);
    input.value = '';
    input.style.height = '';
    scrollToBottom(scrollEl);
    input.focus();
    if (options.onSend) {
      options.onSend(text);
    }
  }

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });

  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 260) + 'px';
  });

  if (sendBtn) {
    sendBtn.addEventListener('click', send);
  }

  return {
    addMessage(role, text, label) {
      appendMessage(messagesEl, role, text, label || (role === 'dm' ? 'DM' : playerLabel));
      scrollToBottom(scrollEl);
    },
    focusInput() {
      input.focus();
    },
  };
}

function dmTestReply(chat) {
  setTimeout(() => {
    chat.addMessage('dm', '你好，我是DM');
  }, 400);
}

function appendMessage(container, role, text, label) {
  const row = document.createElement('div');
  row.className = 'chat-message chat-message-' + role;

  const avatar = document.createElement('div');
  avatar.className = 'chat-avatar';
  avatar.textContent = label || (role === 'dm' ? 'DM' : 'A');

  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble';

  const content = document.createElement('div');
  content.className = 'chat-text';
  content.textContent = text;

  bubble.appendChild(content);

  if (role === 'dm') {
    row.appendChild(avatar);
    row.appendChild(bubble);
  } else {
    row.appendChild(bubble);
    row.appendChild(avatar);
  }

  container.appendChild(row);
}

function scrollToBottom(container) {
  requestAnimationFrame(() => {
    container.scrollTop = container.scrollHeight;
  });
}

function getChatHtml() {
  return `
    <div class="chat-root">
      <div class="chat-stage">
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
  `;
}
