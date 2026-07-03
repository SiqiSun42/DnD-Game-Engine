const INVENTORY_WEALTH = '100g';

const INVENTORY_CATEGORIES = {
  consumable: {
    id: 'consumable',
    label: '消耗品',
    items: [
      { id: 'bread', name: '面包', quantity: 1, description: '普通的小麦面包，能够恢复5点生命值。' },
      { id: 'apple', name: '苹果', quantity: 2, description: '新鲜的红苹果，能够恢复3点生命值。' },
      { id: 'potion', name: '治疗药水', quantity: 1, description: '红色的治疗药水，能够恢复10点生命值。' },
    ],
  },
  tool: {
    id: 'tool',
    label: '道具',
    items: [
      { id: 'rope', name: '绳子', quantity: 1, description: '结实的麻绳，可用于攀爬或捆绑。' },
      { id: 'flint', name: '燧石', quantity: 1, description: '干燥的燧石，可用于生火。' },
    ],
  },
  equipment: {
    id: 'equipment',
    label: '装备',
    items: [
      { id: 'short-sword', name: '短剑', quantity: 1, description: '轻型单手剑，装备后攻击 +1。' },
      { id: 'leather-armor', name: '皮甲', quantity: 1, description: '磨损但可靠的皮甲，装备后护甲 +1。' },
      { id: 'oak-staff', name: '橡木法杖', quantity: 1, description: '简单的施法媒介，装备后法术攻击 +1。' },
    ],
  },
  key: {
    id: 'key',
    label: '关键物品',
    items: [
      { id: 'mysterious-key', name: '神秘钥匙', quantity: 1, description: '一把来历不明的钥匙，似乎能打开某处重要的锁。' },
    ],
  },
};

function mountBackpackPanel(container) {
  let activeCategory = 'consumable';
  let activeItemId = INVENTORY_CATEGORIES.consumable.items[0].id;

  container.innerHTML = `
    <div class="backpack-panel" id="backpack-panel">
      <div class="backpack-panel-col backpack-categories" id="backpack-categories">
        <div class="backpack-categories-list" id="backpack-categories-list"></div>
        <div class="backpack-wealth">财产：${escapePanelText(INVENTORY_WEALTH)}</div>
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
    detailEl.innerHTML = `
      <div class="backpack-detail-inner">
        <h3 class="backpack-detail-title">${escapePanelText(item.name)}</h3>
        <p class="backpack-detail-body">数量：${escapePanelText(String(item.quantity))}</p>
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
