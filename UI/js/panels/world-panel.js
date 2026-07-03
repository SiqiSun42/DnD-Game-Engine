const LOCATION_TREE = [
  {
    id: 'continent-east',
    name: '东部大陆',
    description: '大陆东部的温带地区，多国并存，贸易与冒险活动频繁。',
    children: [
      {
        id: 'country-airland',
        name: '艾尔兰',
        description: '东部大陆上的沿海王国，以渔业和港口贸易闻名。',
        children: [
          {
            id: 'region-coast',
            name: '滨海地区',
            description: '艾尔兰东南沿海一带，分布着数个渔村与小型港口。',
            children: [
              {
                id: 'starter-village',
                name: '新手村',
                description: '一个普通的小渔村，最近被哥布林骚扰。包含以下地点：酒店、商店、码头、村长家',
                children: [],
              },
              {
                id: 'mist-forest',
                name: '灰雾森林',
                description: '新手村北方的低语森林，常年笼罩薄雾，偶有魔物出没。',
                children: [],
              },
            ],
          },
        ],
      },
    ],
  },
];

const WORLD_CATEGORIES = {
  location: {
    id: 'location',
    label: '地点',
    tree: LOCATION_TREE,
  },
  species: {
    id: 'species',
    label: '物种',
    entries: [
      { id: 'human', name: '人类', description: '滨海地区最常见的种族，以渔民、商贩和冒险者为主。' },
      { id: 'goblin', name: '哥布林', description: '近期在新手村附近出没的小型绿皮生物，成群行动，喜欢偷袭落单目标。' },
    ],
  },
  organization: {
    id: 'organization',
    label: '组织',
    entries: [
      { id: 'village-council', name: '村长议会', description: '新手村的自治组织，负责分配渔获、维护秩序与对外交涉。' },
      { id: 'fisher-guild', name: '渔民行会', description: '组织出海与分配码头泊位，对村内渔获交易有相当话语权。' },
    ],
  },
  culture: {
    id: 'culture',
    label: '文化',
    entries: [
      { id: 'harbor-custom', name: '开港祭', description: '每年渔季开始前在码头举行的祈福仪式，村民会向海神献上第一份渔获。' },
    ],
  },
  event: {
    id: 'event',
    label: '事件',
    entries: [
      { id: 'goblin-raid', name: '哥布林骚扰', description: '近几周来，哥布林夜间袭击新手村外围，已有数名村民受伤，码头货物也曾失窃。' },
    ],
  },
};

function findLocationNode(id, nodes = LOCATION_TREE) {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children?.length) {
      const found = findLocationNode(id, node.children);
      if (found) return found;
    }
  }
  return null;
}

function getVisibleLocationRows(nodes, expandedIds, depth = 0) {
  const rows = [];
  nodes.forEach(node => {
    const hasChildren = node.children?.length > 0;
    rows.push({ node, depth, hasChildren });
    if (hasChildren && expandedIds.has(node.id)) {
      rows.push(...getVisibleLocationRows(node.children, expandedIds, depth + 1));
    }
  });
  return rows;
}

const DEFAULT_LOCATION_ID = 'starter-village';

function getLocationExpandPath(targetId, nodes = LOCATION_TREE, path = []) {
  for (const node of nodes) {
    if (node.id === targetId) return path;
    if (node.children?.length) {
      const found = getLocationExpandPath(targetId, node.children, [...path, node.id]);
      if (found) return found;
    }
  }
  return null;
}

function getDefaultExpandedLocationIds() {
  const path = getLocationExpandPath('starter-village');
  return new Set(path || []);
}

function mountWorldPanel(container) {
  let activeCategory = 'location';
  let activeEntryId = DEFAULT_LOCATION_ID;
  const expandedLocationIds = getDefaultExpandedLocationIds();

  container.innerHTML = `
    <div class="world-panel" id="world-panel">
      <div class="world-panel-col world-panel-categories" id="world-categories"></div>
      <div class="world-panel-col world-panel-list" id="world-list"></div>
      <div class="world-panel-col world-panel-detail" id="world-detail"></div>
    </div>
  `;

  const categoriesEl = container.querySelector('#world-categories');
  const listEl = container.querySelector('#world-list');
  const detailEl = container.querySelector('#world-detail');

  function getActiveEntry() {
    if (activeCategory === 'location') {
      return findLocationNode(activeEntryId);
    }
    const cat = WORLD_CATEGORIES[activeCategory];
    return cat?.entries?.find(e => e.id === activeEntryId) || null;
  }

  function renderCategories() {
    categoriesEl.innerHTML = '';
    Object.values(WORLD_CATEGORIES).forEach(cat => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'world-panel-item' + (cat.id === activeCategory ? ' active' : '');
      btn.textContent = cat.label;
      btn.addEventListener('click', () => {
        activeCategory = cat.id;
        if (activeCategory === 'location') {
          activeEntryId = DEFAULT_LOCATION_ID;
        } else {
          activeEntryId = cat.entries[0]?.id || null;
        }
        renderAll();
      });
      categoriesEl.appendChild(btn);
    });
  }

  function renderLocationList() {
    listEl.innerHTML = '';
    if (!findLocationNode(activeEntryId)) {
      activeEntryId = DEFAULT_LOCATION_ID;
    }
    const rows = getVisibleLocationRows(LOCATION_TREE, expandedLocationIds);
    rows.forEach(({ node, depth, hasChildren }) => {
      const item = document.createElement('div');
      item.className = 'world-location-item' + (node.id === activeEntryId ? ' active' : '');

      const row = document.createElement('div');
      row.className = 'world-location-row world-location-row--depth-' + Math.min(depth, 3);

      const nameBtn = document.createElement('button');
      nameBtn.type = 'button';
      nameBtn.className = 'world-location-btn';
      nameBtn.textContent = node.name;
      nameBtn.addEventListener('click', () => {
        activeEntryId = node.id;
        renderList();
        renderDetail();
      });

      row.appendChild(nameBtn);

      if (hasChildren) {
        const expanded = expandedLocationIds.has(node.id);
        const expandBtn = document.createElement('button');
        expandBtn.type = 'button';
        expandBtn.className = 'world-location-expand-btn';
        expandBtn.setAttribute('aria-label', expanded ? '收起' : '展开');
        expandBtn.textContent = expanded ? '▲' : '▼';
        expandBtn.addEventListener('click', e => {
          e.stopPropagation();
          if (expandedLocationIds.has(node.id)) {
            expandedLocationIds.delete(node.id);
          } else {
            expandedLocationIds.add(node.id);
          }
          renderList();
        });
        row.appendChild(expandBtn);
      }

      item.appendChild(row);
      listEl.appendChild(item);
    });
  }

  function renderFlatList() {
    listEl.innerHTML = '';
    const cat = WORLD_CATEGORIES[activeCategory];
    if (!cat?.entries) return;
    if (!cat.entries.find(e => e.id === activeEntryId)) {
      activeEntryId = cat.entries[0]?.id || null;
    }
    cat.entries.forEach(entry => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'world-panel-item' + (entry.id === activeEntryId ? ' active' : '');
      btn.textContent = entry.name;
      btn.addEventListener('click', () => {
        activeEntryId = entry.id;
        renderList();
        renderDetail();
      });
      listEl.appendChild(btn);
    });
  }

  function renderList() {
    if (activeCategory === 'location') {
      renderLocationList();
    } else {
      renderFlatList();
    }
  }

  function renderDetail() {
    const entry = getActiveEntry();
    if (!entry) {
      detailEl.innerHTML = '<p class="world-detail-empty">请选择条目</p>';
      return;
    }
    detailEl.innerHTML = `
      <div class="world-detail-inner">
        <h3 class="world-detail-title">${escapePanelText(entry.name)}</h3>
        <p class="world-detail-body">${escapePanelText(entry.description)}</p>
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
