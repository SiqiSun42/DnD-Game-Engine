const STATUS_TIER_ORDER = {
  team: { player: 0, teammate: 1, ally: 2 },
  enemy: { boss: 0, normal: 1 },
};

function buildStatusCategories(schema, data) {
  const categories = {};
  (schema?.categories || []).forEach(cat => {
    categories[cat.id] = {
      id: cat.id,
      label: cat.label,
      combatOnly: !!cat.combatOnly,
      characters: data?.[cat.id] || [],
    };
  });
  return categories;
}

function sortStatusCharacters(categoryId, list) {
  const tierOrder = STATUS_TIER_ORDER[categoryId] || {};
  return [...list].sort((a, b) => {
    const tierDiff = (tierOrder[a.tier] ?? 9) - (tierOrder[b.tier] ?? 9);
    if (tierDiff !== 0) return tierDiff;
    return a.order - b.order;
  });
}

function mountStatusPanel(container, schema, data) {
  if (!schema || !data) {
    mountDefaultPanel(container, { label: '状态' });
    return;
  }

  const STATUS_IN_COMBAT = !!data.inCombat;
  const STATUS_CATEGORIES = buildStatusCategories(schema, data);

  function getVisibleStatusCategories() {
    return Object.values(STATUS_CATEGORIES).filter(cat => !cat.combatOnly || STATUS_IN_COMBAT);
  }

  const visibleCategories = getVisibleStatusCategories();
  let activeCategory = visibleCategories[0]?.id || 'team';
  let activeCharacterId = STATUS_CATEGORIES[activeCategory]?.characters[0]?.id || null;

  container.innerHTML = `
    <div class="status-panel" id="status-panel">
      <div class="status-panel-col status-panel-categories" id="status-categories"></div>
      <div class="status-panel-col status-panel-list" id="status-list"></div>
      <div class="status-panel-col status-panel-detail" id="status-detail"></div>
    </div>
  `;

  const categoriesEl = container.querySelector('#status-categories');
  const listEl = container.querySelector('#status-list');
  const detailEl = container.querySelector('#status-detail');

  function renderCategories() {
    categoriesEl.innerHTML = '';
    getVisibleStatusCategories().forEach(cat => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'status-panel-item' + (cat.id === activeCategory ? ' active' : '');
      btn.textContent = cat.label;
      btn.addEventListener('click', () => {
        activeCategory = cat.id;
        const chars = sortStatusCharacters(activeCategory, STATUS_CATEGORIES[activeCategory].characters);
        activeCharacterId = chars[0]?.id || null;
        renderAll();
      });
      categoriesEl.appendChild(btn);
    });
  }

  function renderList() {
    listEl.innerHTML = '';
    const cat = STATUS_CATEGORIES[activeCategory];
    if (!cat) {
      detailEl.innerHTML = '<p class="status-detail-empty">请选择人物</p>';
      return;
    }
    const chars = sortStatusCharacters(activeCategory, cat.characters);
    if (!chars.find(c => c.id === activeCharacterId)) {
      activeCharacterId = chars[0]?.id || null;
    }
    chars.forEach(char => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'status-panel-item' + (char.id === activeCharacterId ? ' active' : '');
      btn.textContent = char.name;
      btn.addEventListener('click', () => {
        activeCharacterId = char.id;
        renderAll();
      });
      listEl.appendChild(btn);
    });
  }

  function renderDetail() {
    const cat = STATUS_CATEGORIES[activeCategory];
    const char = cat?.characters.find(c => c.id === activeCharacterId);
    if (!char) {
      detailEl.innerHTML = '<p class="status-detail-empty">请选择人物</p>';
      return;
    }
    detailEl.innerHTML = `
      <div class="status-detail-inner">
        <h3 class="status-detail-title">${escapePanelText(char.name)}</h3>
        <p class="status-detail-body">${escapePanelText(char.detail)}</p>
      </div>
    `;
  }

  function renderAll() {
    const visible = getVisibleStatusCategories();
    if (!visible.find(cat => cat.id === activeCategory)) {
      activeCategory = visible[0]?.id || 'team';
      const chars = sortStatusCharacters(activeCategory, STATUS_CATEGORIES[activeCategory]?.characters || []);
      activeCharacterId = chars[0]?.id || null;
    }
    renderCategories();
    renderList();
    renderDetail();
  }

  renderAll();
}
