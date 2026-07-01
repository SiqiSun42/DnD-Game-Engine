const MAIN_ACTION_TABS = [
  { id: 'backpack', icon: '🎒', label: '背包' },
  { id: 'status', icon: '⚔', label: '状态' },
  { id: 'character', icon: '👤', label: '人物' },
  { id: 'world', icon: '🌏', label: '世界' },
  { id: 'notes', icon: '📒', label: '笔记' },
];

const SETTINGS_TAB = { id: 'settings', icon: '⚙', label: '设置' };

const ALL_PANEL_TABS = [...MAIN_ACTION_TABS, SETTINGS_TAB];

function buildTabButton(tab) {
  return `<button type="button" class="action-tab" data-tab="${tab.id}">
    <span class="action-tab-icon">${tab.icon}</span>
    <span class="action-tab-label">${tab.label}</span>
  </button>`;
}

function buildCenterTabsHtml() {
  return MAIN_ACTION_TABS.map((tab, i) => {
    const divider = i > 0 ? '<span class="action-tab-divider"></span>' : '';
    return divider + buildTabButton(tab);
  }).join('');
}

function buildGameActionBarHtml() {
  return `
    <div class="action-bar">
      <div class="action-bar-left">
        <span class="action-bar-title" id="view-title"></span>
      </div>
      <div class="action-bar-center">${buildCenterTabsHtml()}</div>
      <div class="action-bar-right">${buildTabButton(SETTINGS_TAB)}</div>
    </div>
  `;
}

function buildChatActionBarHtml() {
  return `
    <div class="action-bar action-bar-simple">
      <div class="action-bar-left">
        <span class="action-bar-title" id="view-title"></span>
      </div>
      <div class="action-bar-right">${buildTabButton(SETTINGS_TAB)}</div>
    </div>
  `;
}

function buildActionPanelHtml() {
  return `
    <div class="action-panel hidden" id="action-panel">
      <div class="action-panel-inner">
        <div class="chat-column">
          <h2 class="action-panel-title" id="action-panel-title"></h2>
          <p class="action-panel-desc" id="action-panel-desc"></p>
        </div>
      </div>
    </div>
  `;
}

function setViewTitle(container, title) {
  const el = container.querySelector('#view-title');
  if (el) el.textContent = title || '';
}

function initActionPanel(container, tabs) {
  const tabEls = container.querySelectorAll('.action-tab');
  const panel = container.querySelector('#action-panel');
  const panelTitle = container.querySelector('#action-panel-title');
  const panelDesc = container.querySelector('#action-panel-desc');
  let activeTab = null;

  tabEls.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabId = tab.dataset.tab;
      const tabInfo = tabs.find(t => t.id === tabId);
      if (!tabInfo || !panel) return;

      if (activeTab === tabId) {
        activeTab = null;
        tab.classList.remove('active');
        panel.classList.add('hidden');
        return;
      }

      tabEls.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeTab = tabId;

      panelTitle.textContent = '标签页占位符 — ' + tabInfo.label;
      panelDesc.textContent = '此处将显示「' + tabInfo.label + '」面板内容。';
      panel.classList.remove('hidden');
    });
  });
}
