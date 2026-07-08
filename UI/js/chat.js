function initChat(root, options = {}) {
  const messagesEl = root.querySelector('.chat-messages');
  const scrollEl = root.querySelector('.chat-messages-scroll') || messagesEl;
  const input = root.querySelector('.chat-input');
  const sendBtn = root.querySelector('.chat-send');
  const playerLabel = options.playerLabel || 'A';
  const idlePlaceholder = input?.placeholder || '输入消息，Enter 发送，Shift+Enter 换行';
  const busyPlaceholder = options.busyPlaceholder || 'DM回合，请耐心等待';

  if (options.initialMessages) {
    options.initialMessages.forEach(msg => {
      appendMessage(messagesEl, msg.role, msg.text, msg.label, {
        reasoning: msg.reasoning,
      });
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
    addMessage(role, text, label, options = {}) {
      appendMessage(
        messagesEl,
        role,
        text,
        label || (role === 'dm' ? 'DM' : playerLabel),
        options,
      );
      scrollToBottom(scrollEl);
    },
    setMessages(messages) {
      messagesEl.innerHTML = '';
      (messages || []).forEach(msg => {
        appendMessage(messagesEl, msg.role, msg.text, msg.label, {
          reasoning: msg.reasoning,
        });
      });
      scrollToBottom(scrollEl);
    },
    focusInput() {
      input.focus();
    },
    showThinking(label) {
      showThinkingIndicator(messagesEl, label || 'DM');
      scrollToBottom(scrollEl);
    },
    hideThinking() {
      hideThinkingIndicator(messagesEl);
    },
    setBusy(busy) {
      input.disabled = busy;
      if (sendBtn) sendBtn.disabled = busy;
      input.placeholder = busy ? busyPlaceholder : idlePlaceholder;
      if (busy) {
        showThinkingIndicator(messagesEl, 'DM');
        scrollToBottom(scrollEl);
      } else {
        hideThinkingIndicator(messagesEl);
      }
    },
  };
}

function shouldShowReasoning(reasoning) {
  if (!reasoning || !String(reasoning).trim()) return false;
  if (typeof getAccountMode === 'function') {
    return getAccountMode() === 'developer';
  }
  return true;
}

function createReasoningBlock(reasoning) {
  const block = document.createElement('div');
  block.className = 'chat-reasoning';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'chat-reasoning-toggle';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.innerHTML = `
    <span class="chat-reasoning-chevron" aria-hidden="true">▸</span>
    <span>思考过程</span>
  `;

  const panel = document.createElement('div');
  panel.className = 'chat-reasoning-panel';
  panel.hidden = true;

  const text = document.createElement('div');
  text.className = 'chat-reasoning-text';
  text.textContent = reasoning;
  panel.appendChild(text);

  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    panel.hidden = expanded;
    toggle.classList.toggle('expanded', !expanded);
  });

  block.appendChild(toggle);
  block.appendChild(panel);
  return block;
}

function appendMessage(container, role, text, label, options = {}) {
  const row = document.createElement('div');
  row.className = 'chat-message chat-message-' + role;

  const avatar = document.createElement('div');
  avatar.className = 'chat-avatar';
  avatar.textContent = label || (role === 'dm' ? 'DM' : 'A');

  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble';

  const content = document.createElement('div');
  if (role === 'dm') {
    content.className = 'chat-text chat-text-md md-content';
    if (typeof renderMarkdown === 'function') {
      content.innerHTML = renderMarkdown(text);
    } else {
      content.textContent = text;
    }
  } else {
    content.className = 'chat-text';
    content.textContent = text;
  }

  bubble.appendChild(content);

  const body = document.createElement('div');
  body.className = 'chat-message-body';
  if (role === 'dm' && shouldShowReasoning(options.reasoning)) {
    body.appendChild(createReasoningBlock(options.reasoning));
  }
  body.appendChild(bubble);
  body.appendChild(createCopyButton(text));

  if (role === 'dm') {
    row.appendChild(avatar);
    row.appendChild(body);
  } else {
    row.appendChild(body);
    row.appendChild(avatar);
  }

  container.appendChild(row);
}

function createCopyButton(text) {
  const actions = document.createElement('div');
  actions.className = 'chat-message-actions';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'chat-copy-btn';
  btn.setAttribute('aria-label', 'Copy');
  btn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>
  `;

  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      btn.classList.add('copied');
      btn.setAttribute('aria-label', 'Copied');
      setTimeout(() => {
        btn.classList.remove('copied');
        btn.setAttribute('aria-label', 'Copy');
      }, 1500);
    } catch (_) {}
  });

  actions.appendChild(btn);
  return actions;
}

function showThinkingIndicator(container, label) {
  hideThinkingIndicator(container);

  const row = document.createElement('div');
  row.className = 'chat-message chat-message-dm chat-message-thinking';
  row.dataset.thinking = 'true';

  const avatar = document.createElement('div');
  avatar.className = 'chat-avatar';
  avatar.textContent = label || 'DM';

  const thinking = document.createElement('div');
  thinking.className = 'chat-thinking';
  thinking.setAttribute('role', 'status');
  thinking.setAttribute('aria-label', 'Thinking');
  for (let i = 0; i < 3; i += 1) {
    const dot = document.createElement('div');
    dot.className = 'chat-thinking-dot';
    thinking.appendChild(dot);
  }

  row.appendChild(avatar);
  row.appendChild(thinking);
  container.appendChild(row);
}

function hideThinkingIndicator(container) {
  const existing = container.querySelector('[data-thinking="true"]');
  if (existing) {
    existing.remove();
  }
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
