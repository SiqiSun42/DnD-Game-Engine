function buildInventoryCategories(schema, data) {
  const categories = {};
  (schema?.categories || []).forEach(cat => {
    categories[cat.id] = {
      id: cat.id,
      label: cat.label,
      items: data?.categories?.[cat.id] || [],
    };
  });
  return categories;
}

function mountBackpackPanel(container, schema, data) {
  if (!schema || !data) {
    mountDefaultPanel(container, { label: '背包' });
    return;
  }

  const INVENTORY_CATEGORIES = buildInventoryCategories(schema, data);
  const wealthLabel = schema.wealthLabel || '财产：';
  const wealth = data.wealth || '';
  const firstCategory = schema.categories[0]?.id || Object.keys(INVENTORY_CATEGORIES)[0];
  const firstItem = INVENTORY_CATEGORIES[firstCategory]?.items[0];

  let activeCategory = firstCategory;
  let activeItemId = firstItem?.id || null;

  container.innerHTML = `
    <div class="backpack-panel" id="backpack-panel">
      <div class="backpack-panel-col backpack-categories" id="backpack-categories">
        <div class="backpack-categories-list" id="backpack-categories-list"></div>
        <div class="backpack-wealth">${escapePanelText(wealthLabel)}${escapePanelText(wealth)}</div>
      </div>
      <div class="backpack-panel-col backpack-panel-list" id="backpack-list"></div>
      <div class="backpack-panel-col backpack-panel-detail" id="backpack-detail"></div>
    </div>
  `;

  const categoriesEl = container.querySelector('#backpack-categories-list');
  const listEl = container.querySelector('#backpack-list');
  const detailEl = container.querySelector('#backpack-detail');

  function renderCategories() {
    categoriesEl.innerHTML = '';
    Object.values(INVENTORY_CATEGORIES).forEach(cat => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'backpack-panel-item' + (cat.id === activeCategory ? ' active' : '');
      btn.textContent = cat.label;
      btn.addEventListener('click', () => {
        activeCategory = cat.id;
        const items = INVENTORY_CATEGORIES[activeCategory].items;
        activeItemId = items[0]?.id || null;
        renderAll();
      });
      categoriesEl.appendChild(btn);
    });
  }

  function renderList() {
    listEl.innerHTML = '';
    const items = INVENTORY_CATEGORIES[activeCategory].items;
    if (!items.find(item => item.id === activeItemId)) {
      activeItemId = items[0]?.id || null;
    }
    items.forEach(item => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'backpack-panel-item' + (item.id === activeItemId ? ' active' : '');
      btn.textContent = item.name;
      btn.addEventListener('click', () => {
        activeItemId = item.id;
        renderAll();
      });
      listEl.appendChild(btn);
    });
  }

  function renderDetail() {
    const cat = INVENTORY_CATEGORIES[activeCategory];
    const item = cat.items.find(i => i.id === activeItemId);
    if (!item) {
      detailEl.innerHTML = '<p class="backpack-detail-empty">请选择物品</p>';
      return;
    }
    const equipmentLines = [];
    if (item.tag) {
      const tagLabel = formatEquipmentTagLabel(item.tag);
      if (tagLabel) equipmentLines.push(`类型：${tagLabel}`);
      if (item.tag === 'weapon' && item.damage) {
        equipmentLines.push(`伤害：${item.damage}`);
      }
      if (item.modifier !== undefined && item.modifier !== null && item.modifier !== '') {
        equipmentLines.push(`修正值：${formatModifierDisplay(item.modifier)}`);
      }
    }
    const equipmentHtml = equipmentLines
      .map(line => `<p class="backpack-detail-body">${escapePanelText(line)}</p>`)
      .join('');

    detailEl.innerHTML = `
      <div class="backpack-detail-inner">
        <h3 class="backpack-detail-title">${escapePanelText(item.name)}</h3>
        <p class="backpack-detail-body">数量：${escapePanelText(String(item.quantity))}</p>
        ${equipmentHtml}
        <p class="backpack-detail-body">介绍：${escapePanelText(item.description)}</p>
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
