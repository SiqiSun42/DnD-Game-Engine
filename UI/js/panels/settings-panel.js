const SETTINGS_CATEGORIES = {
  ui: { id: 'ui', label: '界面' },
  game: { id: 'game', label: '游戏' },
  history: { id: 'history', label: '历史' },
};

const THEME_OPTIONS = [
  { id: 'night', label: '黑夜' },
  { id: 'day', label: '白昼' },
  { id: 'spring', label: '春晓' },
  { id: 'forest', label: '森林' },
  { id: 'book', label: '古书' },
  { id: 'sky', label: '晴空' },
  { id: 'flower', label: '花海' },
  { id: 'stars', label: '星辰' },
];

const THEME_OPTION_ROWS = [
  THEME_OPTIONS.slice(0, 4),
  THEME_OPTIONS.slice(4, 8),
];

const FONT_OPTIONS = [
  { id: 'default', label: '系统默认' },
  { id: 'serif', label: '衬线体' },
  { id: 'sans', label: '无衬线体' },
];

const FONT_SIZE_OPTIONS = [
  { id: 'small', label: '小' },
  { id: 'medium', label: '中' },
  { id: 'large', label: '大' },
];

const GAME_OPTIONS = {
  difficulty: ['新手', '普通', '困难'],
  realism: ['轻松', '适中', '黑暗'],
  dmStyle: ['朴素', '正常', '华丽'],
  rating: ['全年龄', '青少年', '成人'],
};

const HISTORY_MOCK_ENTRIES = [
  {
    id: 'history-1',
    preview: 'DM: 欢迎来到龙与地下城。你站在酒馆门口，空气中弥漫着麦酒与冒险的气息。',
    terms: ['欢迎', '酒馆', '龙与地下城'],
  },
  {
    id: 'history-2',
    preview: '玩家: 我向村民打听哥布林的具体情况。',
    terms: ['村民', '哥布林', '打听'],
  },
  {
    id: 'history-3',
    preview: 'DM: 村长请求你帮忙调查哥布林巢穴，但他似乎隐瞒了什么。',
    terms: ['村长', '哥布林', '巢穴'],
  },
  {
    id: 'history-4',
    preview: '玩家: 我在商店购买了治疗药水和火把。',
    terms: ['商店', '治疗药水', '火把'],
  },
];

function mountSettingsPanel(container) {
  let activeCategory = 'ui';
  let selectedFont = 'default';
  let selectedFontSize = 'medium';
  let gameSettings = {
    difficulty: '普通',
    realism: '适中',
    dmStyle: '正常',
    rating: '青少年',
  };
  let preferences = ['避免非常血腥的描写'];
  let historyQuery = '';
  let historyMatchMode = 'exact';

  container.innerHTML = `
    <div class="settings-panel settings-panel--ui" id="settings-panel">
      <div class="settings-panel-col settings-panel-categories" id="settings-categories"></div>
      <div class="settings-panel-col settings-panel-main" id="settings-main"></div>
      <div class="settings-panel-col settings-panel-type" id="settings-type"></div>
    </div>
  `;

  const panelEl = container.querySelector('#settings-panel');
  const categoriesEl = container.querySelector('#settings-categories');
  const contentEl = container.querySelector('#settings-main');
  const typeEl = container.querySelector('#settings-type');

  function renderCategories() {
    categoriesEl.innerHTML = '';
    Object.values(SETTINGS_CATEGORIES).forEach(cat => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'settings-panel-item' + (cat.id === activeCategory ? ' active' : '');
      btn.textContent = cat.label;
      btn.addEventListener('click', () => {
        activeCategory = cat.id;
        renderAll();
      });
      categoriesEl.appendChild(btn);
    });
  }

  function renderOptionGroup(name, options, selected, onSelect) {
    const group = document.createElement('div');
    group.className = 'settings-option-group';
    options.forEach(option => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'settings-option-btn' + (option === selected ? ' active' : '');
      btn.textContent = option;
      btn.addEventListener('click', () => onSelect(option));
      group.appendChild(btn);
    });
    return group;
  }

  function getOptionLabel(options, id) {
    const found = options.find(option => option.id === id);
    return found ? found.label : '';
  }

  let uiDropdown = null;
  let uiDropdownListenersBound = false;

  function ensureUiDropdown() {
    if (uiDropdown) return uiDropdown;
    uiDropdown = document.createElement('div');
    uiDropdown.className = 'dropdown-menu hidden settings-ui-dropdown';
    uiDropdown.setAttribute('role', 'menu');
    document.body.appendChild(uiDropdown);
    return uiDropdown;
  }

  function closeUiDropdown() {
    if (!uiDropdown) return;
    uiDropdown.classList.add('hidden');
    uiDropdown.style.width = '';
  }

  function positionUiDropdown(menu, anchorRect) {
    menu.style.width = anchorRect.width + 'px';
    menu.classList.remove('hidden');
    const menuRect = menu.getBoundingClientRect();
    let top = anchorRect.bottom + 2;
    let left = anchorRect.left;

    if (left + menuRect.width > window.innerWidth) {
      left = window.innerWidth - menuRect.width - 8;
    }
    if (top + menuRect.height > window.innerHeight) {
      top = anchorRect.top - menuRect.height - 2;
    }

    menu.style.top = top + 'px';
    menu.style.left = left + 'px';
  }

  function bindUiDropdownListeners() {
    if (uiDropdownListenersBound) return;
    uiDropdownListenersBound = true;

    document.addEventListener('click', e => {
      if (!uiDropdown || uiDropdown.classList.contains('hidden')) return;
      if (!e.target.closest('.settings-ui-dropdown') && !e.target.closest('.settings-picker-btn')) {
        closeUiDropdown();
      }
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeUiDropdown();
    });
  }

  function openUiPicker(anchor, options, selectedId, onSelect) {
    bindUiDropdownListeners();
    const menu = ensureUiDropdown();
    menu.innerHTML = '';

    options.forEach(option => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('role', 'menuitem');
      btn.textContent = option.label;
      if (option.id === selectedId) {
        btn.classList.add('active');
      }
      btn.addEventListener('click', e => {
        e.stopPropagation();
        onSelect(option.id);
        closeUiDropdown();
        renderContent();
      });
      menu.appendChild(btn);
    });

    positionUiDropdown(menu, anchor.getBoundingClientRect());
  }

  function bindPicker(anchor, options, selected, onSelect) {
    const items = options.map(option =>
      typeof option === 'string' ? { id: option, label: option } : option
    );
    anchor.textContent = getOptionLabel(items, selected) || selected;
    anchor.addEventListener('click', e => {
      e.stopPropagation();
      openUiPicker(anchor, items, selected, onSelect);
    });
  }

  function appendThemeButton(container, theme) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'settings-theme-btn' + (theme.id === getColorTheme() ? ' active' : '');
    btn.innerHTML = `
      <span class="settings-theme-swatch settings-theme-swatch--${theme.id}"></span>
      <span>${escapePanelText(theme.label)}</span>
    `;
    btn.addEventListener('click', () => {
      setColorTheme(theme.id);
      renderContent();
    });
    container.appendChild(btn);
  }

  function renderUiTypeColumn() {
    typeEl.innerHTML = `
      <div class="settings-content settings-content--type">
        <h3 class="settings-section-title settings-ui-title">字体</h3>
        <button type="button" class="settings-picker-btn" id="settings-font-picker"></button>
        <div class="settings-type-size-block">
          <h3 class="settings-section-title settings-type-size-title">字号</h3>
          <button type="button" class="settings-picker-btn" id="settings-size-picker"></button>
        </div>
      </div>
    `;

    const fontPicker = typeEl.querySelector('#settings-font-picker');
    bindPicker(fontPicker, FONT_OPTIONS, selectedFont, id => {
      selectedFont = id;
    });

    const sizePicker = typeEl.querySelector('#settings-size-picker');
    bindPicker(sizePicker, FONT_SIZE_OPTIONS, selectedFontSize, id => {
      selectedFontSize = id;
    });
  }

  function renderUiContent() {
    contentEl.innerHTML = `
      <div class="settings-content settings-content--ui">
        <h3 class="settings-section-title settings-ui-title">背景颜色</h3>
        <div class="settings-theme-row" id="settings-theme-row-top"></div>
        <div class="settings-theme-row" id="settings-theme-row-bottom"></div>
      </div>
    `;

    THEME_OPTION_ROWS[0].forEach(theme => {
      appendThemeButton(contentEl.querySelector('#settings-theme-row-top'), theme);
    });
    THEME_OPTION_ROWS[1].forEach(theme => {
      appendThemeButton(contentEl.querySelector('#settings-theme-row-bottom'), theme);
    });

    renderUiTypeColumn();
  }

  function renderGameContent() {
    typeEl.innerHTML = '';
    contentEl.innerHTML = `
      <div class="settings-content settings-content--game">
        <div class="settings-game-options-row">
          <section class="settings-game-option-col">
            <h3 class="settings-section-title">难度</h3>
            <button type="button" class="settings-picker-btn" id="settings-difficulty-picker"></button>
          </section>
          <section class="settings-game-option-col">
            <h3 class="settings-section-title">现实程度</h3>
            <button type="button" class="settings-picker-btn" id="settings-realism-picker"></button>
          </section>
          <section class="settings-game-option-col">
            <h3 class="settings-section-title">DM 叙述风格</h3>
            <button type="button" class="settings-picker-btn" id="settings-dm-style-picker"></button>
          </section>
          <section class="settings-game-option-col">
            <h3 class="settings-section-title">情节分级</h3>
            <button type="button" class="settings-picker-btn" id="settings-rating-picker"></button>
          </section>
        </div>
        <section class="settings-section">
          <h3 class="settings-section-title">个性偏好</h3>
          <div class="settings-preference-list" id="settings-preference-list"></div>
          <button type="button" class="settings-add-btn" id="settings-add-preference">+ 添加偏好</button>
        </section>
      </div>
    `;

    bindPicker(
      contentEl.querySelector('#settings-difficulty-picker'),
      GAME_OPTIONS.difficulty,
      gameSettings.difficulty,
      value => { gameSettings.difficulty = value; }
    );
    bindPicker(
      contentEl.querySelector('#settings-realism-picker'),
      GAME_OPTIONS.realism,
      gameSettings.realism,
      value => { gameSettings.realism = value; }
    );
    bindPicker(
      contentEl.querySelector('#settings-dm-style-picker'),
      GAME_OPTIONS.dmStyle,
      gameSettings.dmStyle,
      value => { gameSettings.dmStyle = value; }
    );
    bindPicker(
      contentEl.querySelector('#settings-rating-picker'),
      GAME_OPTIONS.rating,
      gameSettings.rating,
      value => { gameSettings.rating = value; }
    );

    const listEl = contentEl.querySelector('#settings-preference-list');
    preferences.forEach((value, index) => {
      const row = document.createElement('div');
      row.className = 'settings-preference-row';

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'settings-preference-input';
      input.value = value;
      input.placeholder = '输入一条偏好规则';
      input.addEventListener('input', () => {
        preferences[index] = input.value;
      });

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'settings-preference-remove';
      removeBtn.textContent = '×';
      removeBtn.setAttribute('aria-label', '删除偏好');
      removeBtn.addEventListener('click', () => {
        preferences.splice(index, 1);
        if (!preferences.length) {
          preferences.push('');
        }
        renderContent();
      });

      row.appendChild(input);
      row.appendChild(removeBtn);
      listEl.appendChild(row);
    });

    contentEl.querySelector('#settings-add-preference').addEventListener('click', () => {
      preferences.push('');
      renderContent();
    });
  }

  function filterHistoryEntries() {
    const query = historyQuery.trim().toLowerCase();
    if (!query) {
      return HISTORY_MOCK_ENTRIES;
    }
    if (historyMatchMode === 'exact') {
      return HISTORY_MOCK_ENTRIES.filter(entry =>
        entry.preview.toLowerCase().includes(query) ||
        entry.terms.some(term => term.toLowerCase().includes(query))
      );
    }
    return HISTORY_MOCK_ENTRIES.filter(entry =>
      entry.preview.toLowerCase().includes(query) ||
      entry.terms.some(term => term.toLowerCase().includes(query))
    );
  }

  function renderHistoryResults() {
    const resultsEl = contentEl.querySelector('#settings-history-results');
    if (!resultsEl) return;

    const results = filterHistoryEntries();
    resultsEl.innerHTML = '';

    if (!results.length) {
      resultsEl.innerHTML = '<p class="settings-history-empty">No matching messages</p>';
      return;
    }

    results.forEach(entry => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'settings-history-item';
      btn.textContent = entry.preview;
      btn.addEventListener('click', () => {});
      resultsEl.appendChild(btn);
    });
  }

  function renderHistoryContent() {
    typeEl.innerHTML = '';
    contentEl.innerHTML = `
      <div class="settings-content">
        <section class="settings-section">
          <div class="settings-search-box">
            <span class="settings-search-icon" aria-hidden="true">🔍</span>
            <input
              type="search"
              class="settings-search-input"
              id="settings-history-search"
              placeholder="Search chat history..."
              autocomplete="off"
            >
          </div>
          <div class="settings-match-toggle" id="settings-match-toggle"></div>
          <div class="settings-history-list" id="settings-history-results"></div>
        </section>
      </div>
    `;

    const searchInput = contentEl.querySelector('#settings-history-search');
    searchInput.value = historyQuery;
    searchInput.addEventListener('input', () => {
      historyQuery = searchInput.value;
      renderHistoryResults();
    });

    const toggleEl = contentEl.querySelector('#settings-match-toggle');
    [
      { id: 'exact', label: '精确匹配' },
      { id: 'semantic', label: '语义匹配' },
    ].forEach(mode => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'settings-option-btn' + (historyMatchMode === mode.id ? ' active' : '');
      btn.textContent = mode.label;
      btn.addEventListener('click', () => {
        historyMatchMode = mode.id;
        renderContent();
      });
      toggleEl.appendChild(btn);
    });

    renderHistoryResults();
  }

  function renderContent() {
    closeUiDropdown();
    if (activeCategory === 'ui') {
      renderUiContent();
    } else if (activeCategory === 'game') {
      renderGameContent();
    } else {
      renderHistoryContent();
    }
  }

  function renderAll() {
    panelEl.classList.toggle('settings-panel--ui', activeCategory === 'ui');
    renderCategories();
    renderContent();
  }

  renderAll();
}
