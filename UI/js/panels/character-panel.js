const CHARACTER_CATEGORIES = {
  party: {
    id: 'party',
    label: '探险者小队',
    characters: [
      { id: 'pc', name: '主控', tier: 'player', order: 0, detail: '占位符界面 — 主控' },
      { id: 'ally1', name: '盟友 1', tier: 'ally', order: 1, detail: '占位符界面 — 盟友 1' },
      { id: 'ally2', name: '盟友 2', tier: 'ally', order: 2, detail: '占位符界面 — 盟友 2' },
    ],
  },
  chapter: {
    id: 'chapter',
    label: '本章人物',
    characters: [
      { id: 'key1', name: '关键人物 1', tier: 'key', order: 0, detail: '占位符界面 — 关键人物 1' },
      { id: 'npc1', name: '普通人物 1', tier: 'normal', order: 1, detail: '占位符界面 — 普通人物 1' },
      { id: 'npc2', name: '普通人物 2', tier: 'normal', order: 2, detail: '占位符界面 — 普通人物 2' },
    ],
  },
};

const TIER_ORDER = { player: 0, ally: 1, key: 0, normal: 1 };

function sortCharacters(list) {
  return [...list].sort((a, b) => {
    const tierDiff = (TIER_ORDER[a.tier] ?? 9) - (TIER_ORDER[b.tier] ?? 9);
    if (tierDiff !== 0) return tierDiff;
    return a.order - b.order;
  });
}

function mountCharacterPanel(container) {
  let activeCategory = 'party';
  let activeCharacterId = CHARACTER_CATEGORIES.party.characters[0].id;

  container.innerHTML = `
    <div class="character-panel" id="character-panel">
      <div class="character-panel-col character-panel-categories" id="character-categories"></div>
      <div class="character-panel-col character-panel-list" id="character-list"></div>
      <div class="character-panel-col character-panel-detail" id="character-detail"></div>
    </div>
  `;

  const categoriesEl = container.querySelector('#character-categories');
  const listEl = container.querySelector('#character-list');
  const detailEl = container.querySelector('#character-detail');

  function renderCategories() {
    categoriesEl.innerHTML = '';
    Object.values(CHARACTER_CATEGORIES).forEach(cat => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'character-panel-item' + (cat.id === activeCategory ? ' active' : '');
      btn.textContent = cat.label;
      btn.addEventListener('click', () => {
        activeCategory = cat.id;
        const chars = sortCharacters(CHARACTER_CATEGORIES[activeCategory].characters);
        activeCharacterId = chars[0]?.id || null;
        renderAll();
      });
      categoriesEl.appendChild(btn);
    });
  }

  function renderList() {
    listEl.innerHTML = '';
    const chars = sortCharacters(CHARACTER_CATEGORIES[activeCategory].characters);
    if (!chars.find(c => c.id === activeCharacterId)) {
      activeCharacterId = chars[0]?.id || null;
    }
    chars.forEach(char => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'character-panel-item' + (char.id === activeCharacterId ? ' active' : '');
      btn.textContent = char.name;
      btn.addEventListener('click', () => {
        activeCharacterId = char.id;
        renderAll();
      });
      listEl.appendChild(btn);
    });
  }

  function renderDetail() {
    const cat = CHARACTER_CATEGORIES[activeCategory];
    const char = cat.characters.find(c => c.id === activeCharacterId);
    if (!char) {
      detailEl.innerHTML = '<p class="character-detail-empty">请选择人物</p>';
      return;
    }
    detailEl.innerHTML = `
      <div class="character-detail-inner">
        <h3 class="character-detail-title">${escapePanelText(char.name)}</h3>
        <p class="character-detail-body">${escapePanelText(char.detail)}</p>
      </div>
    `;
  }

  function renderAll() {
    renderCategories();
    renderList();
    renderDetail();
  }

  renderAll();
}
