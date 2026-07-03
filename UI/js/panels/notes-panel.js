const CURRENT_QUESTS_PAGE_ID = 'current-quests';
const DEFAULT_QUEST_ENTRY_ID = CURRENT_QUESTS_PAGE_ID;
const DEFAULT_DEV_PLOT_ENTRY_ID = 'dev-short-1';
const HISTORY_ROOT_ID = 'history-root';

const CURRENT_QUEST_ITEMS = [
  '找到哥布林洞穴的位置',
  '向村民打听哥布林的具体情况（可选）',
  '购买物资（可选）',
  '探索村庄和周边地区（可选）',
];

const HISTORY_QUEST_ROOT = {
  id: HISTORY_ROOT_ID,
  name: '历史任务',
  pages: [
    {
      id: 'history-1',
      name: '历史任务 1',
      items: [
        '帮助路边哭泣的 NPC（已完成）',
        '找到新手村的位置（已完成）',
      ],
    },
  ],
};

const DEV_PLOT_TREE = [
  {
    id: 'dev-long-1',
    name: '长期剧情 1',
    description: '占位符界面 — 长期剧情框架，描述贯穿整个战役的主线走向与终局目标。',
    children: [
      {
        id: 'dev-mid-1',
        name: '中期剧情 1',
        description: '新手村闹哥布林，村长请求玩家帮忙；玩家在哥布林巢穴受了埋伏，但最后打败了哥布林大王，发现原来村长和哥布林大王勾结，欺骗过路的英雄然后搜刮他们的财物。',
        children: [
          {
            id: 'dev-short-1',
            name: '短期剧情 1',
            description: '节点 1 是找到哥布林巢穴在村庄南边。至于具体怎么达成由玩家随性发挥，可以询问村民，可以观察地貌，可以逐一探索东南西北最后试出来。',
            children: [],
          },
          {
            id: 'dev-short-2',
            name: '短期剧情 2',
            description: '占位符界面 — 短期剧情 2。',
            children: [],
          },
          {
            id: 'dev-short-3',
            name: '短期剧情 3',
            description: '占位符界面 — 短期剧情 3。',
            children: [],
          },
        ],
      },
      {
        id: 'dev-mid-2',
        name: '中期剧情 2',
        description: '占位符界面 — 中期剧情 2。',
        children: [],
      },
    ],
  },
];

const NOTES_CATEGORIES = {
  quest: { id: 'quest', label: '任务' },
  devPlot: { id: 'devPlot', label: '开发者剧情' },
};

function findHistoryQuestPage(id) {
  return HISTORY_QUEST_ROOT.pages.find(page => page.id === id) || null;
}

function isValidQuestEntryId(id) {
  return id === CURRENT_QUESTS_PAGE_ID || !!findHistoryQuestPage(id);
}

function findDevPlotNode(id, nodes = DEV_PLOT_TREE) {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children?.length) {
      const found = findDevPlotNode(id, node.children);
      if (found) return found;
    }
  }
  return null;
}

function getVisibleDevPlotRows(nodes, expandedIds, depth = 0) {
  const rows = [];
  nodes.forEach(node => {
    const hasChildren = node.children?.length > 0;
    rows.push({ node, depth, hasChildren });
    if (hasChildren && expandedIds.has(node.id)) {
      rows.push(...getVisibleDevPlotRows(node.children, expandedIds, depth + 1));
    }
  });
  return rows;
}

function getDevPlotExpandPath(targetId, nodes = DEV_PLOT_TREE, path = []) {
  for (const node of nodes) {
    if (node.id === targetId) return path;
    if (node.children?.length) {
      const found = getDevPlotExpandPath(targetId, node.children, [...path, node.id]);
      if (found) return found;
    }
  }
  return null;
}

function getDefaultExpandedDevPlotIds() {
  const path = getDevPlotExpandPath(DEFAULT_DEV_PLOT_ENTRY_ID);
  return new Set(path || []);
}

function mountNotesPanel(container) {
  let activeCategory = 'quest';
  let activeEntryId = DEFAULT_QUEST_ENTRY_ID;
  let historyExpanded = true;
  const expandedDevPlotIds = getDefaultExpandedDevPlotIds();

  container.innerHTML = `
    <div class="notes-panel" id="notes-panel">
      <div class="notes-panel-col notes-panel-categories" id="notes-categories"></div>
      <div class="notes-panel-col notes-panel-list" id="notes-list"></div>
      <div class="notes-panel-col notes-panel-detail" id="notes-detail"></div>
    </div>
  `;

  const categoriesEl = container.querySelector('#notes-categories');
  const listEl = container.querySelector('#notes-list');
  const detailEl = container.querySelector('#notes-detail');

  function renderCategories() {
    categoriesEl.innerHTML = '';
    Object.values(NOTES_CATEGORIES).forEach(cat => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'notes-panel-item' + (cat.id === activeCategory ? ' active' : '');
      btn.textContent = cat.label;
      btn.addEventListener('click', () => {
        activeCategory = cat.id;
        activeEntryId = activeCategory === 'quest' ? DEFAULT_QUEST_ENTRY_ID : DEFAULT_DEV_PLOT_ENTRY_ID;
        renderAll();
      });
      categoriesEl.appendChild(btn);
    });
  }

  function renderQuestList() {
    listEl.innerHTML = '';
    if (!isValidQuestEntryId(activeEntryId)) {
      activeEntryId = DEFAULT_QUEST_ENTRY_ID;
    }

    const currentBtn = document.createElement('button');
    currentBtn.type = 'button';
    currentBtn.className = 'notes-panel-item' + (activeEntryId === CURRENT_QUESTS_PAGE_ID ? ' active' : '');
    currentBtn.textContent = '当前任务';
    currentBtn.addEventListener('click', () => {
      activeEntryId = CURRENT_QUESTS_PAGE_ID;
      renderList();
      renderDetail();
    });
    listEl.appendChild(currentBtn);

    const historyItem = document.createElement('div');
    historyItem.className = 'notes-expand-item';

    const historyRow = document.createElement('div');
    historyRow.className = 'notes-expand-row notes-expand-row--depth-0';

    const historyLabel = document.createElement('span');
    historyLabel.className = 'notes-expand-btn';
    historyLabel.textContent = HISTORY_QUEST_ROOT.name;
    historyRow.appendChild(historyLabel);

    const historyToggle = document.createElement('button');
    historyToggle.type = 'button';
    historyToggle.className = 'notes-expand-toggle';
    historyToggle.setAttribute('aria-label', historyExpanded ? '收起' : '展开');
    historyToggle.textContent = historyExpanded ? '▲' : '▼';
    historyToggle.addEventListener('click', e => {
      e.stopPropagation();
      historyExpanded = !historyExpanded;
      renderList();
    });
    historyRow.appendChild(historyToggle);

    historyItem.appendChild(historyRow);
    listEl.appendChild(historyItem);

    if (historyExpanded) {
      HISTORY_QUEST_ROOT.pages.forEach(page => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'notes-panel-item notes-panel-item--indented' + (activeEntryId === page.id ? ' active' : '');
        btn.textContent = page.name;
        btn.addEventListener('click', () => {
          activeEntryId = page.id;
          renderList();
          renderDetail();
        });
        listEl.appendChild(btn);
      });
    }
  }

  function renderDevPlotList() {
    listEl.innerHTML = '';
    if (!findDevPlotNode(activeEntryId)) {
      activeEntryId = DEFAULT_DEV_PLOT_ENTRY_ID;
    }

    const rows = getVisibleDevPlotRows(DEV_PLOT_TREE, expandedDevPlotIds);
    rows.forEach(({ node, depth, hasChildren }) => {
      const item = document.createElement('div');
      item.className = 'notes-expand-item' + (node.id === activeEntryId ? ' active' : '');

      const row = document.createElement('div');
      row.className = 'notes-expand-row notes-expand-row--depth-' + Math.min(depth, 3);

      const nameBtn = document.createElement('button');
      nameBtn.type = 'button';
      nameBtn.className = 'notes-select-btn';
      nameBtn.textContent = node.name;
      nameBtn.addEventListener('click', () => {
        activeEntryId = node.id;
        renderList();
        renderDetail();
      });
      row.appendChild(nameBtn);

      if (hasChildren) {
        const expanded = expandedDevPlotIds.has(node.id);
        const expandBtn = document.createElement('button');
        expandBtn.type = 'button';
        expandBtn.className = 'notes-expand-toggle';
        expandBtn.setAttribute('aria-label', expanded ? '收起' : '展开');
        expandBtn.textContent = expanded ? '▲' : '▼';
        expandBtn.addEventListener('click', e => {
          e.stopPropagation();
          if (expandedDevPlotIds.has(node.id)) {
            expandedDevPlotIds.delete(node.id);
          } else {
            expandedDevPlotIds.add(node.id);
          }
          renderList();
        });
        row.appendChild(expandBtn);
      }

      item.appendChild(row);
      listEl.appendChild(item);
    });
  }

  function renderList() {
    if (activeCategory === 'quest') {
      renderQuestList();
    } else {
      renderDevPlotList();
    }
  }

  function renderQuestPageDetail(title, items) {
    const itemsHtml = items.map(item => `<li>${escapePanelText(item)}</li>`).join('');
    detailEl.innerHTML = `
      <div class="notes-detail-inner">
        <h3 class="notes-detail-title">${escapePanelText(title)}</h3>
        <ul class="notes-detail-list">${itemsHtml}</ul>
      </div>
    `;
  }

  function renderDetail() {
    if (activeCategory === 'devPlot') {
      const entry = findDevPlotNode(activeEntryId);
      if (!entry) {
        detailEl.innerHTML = '<p class="notes-detail-empty">请选择条目</p>';
        return;
      }
      detailEl.innerHTML = `
        <div class="notes-detail-inner">
          <h3 class="notes-detail-title">${escapePanelText(entry.name)}</h3>
          <p class="notes-detail-body">${escapePanelText(entry.description)}</p>
        </div>
      `;
      return;
    }

    if (activeEntryId === CURRENT_QUESTS_PAGE_ID) {
      renderQuestPageDetail('当前任务', CURRENT_QUEST_ITEMS);
      return;
    }

    const historyPage = findHistoryQuestPage(activeEntryId);
    if (historyPage) {
      renderQuestPageDetail(historyPage.name, historyPage.items);
      return;
    }

    detailEl.innerHTML = '<p class="notes-detail-empty">请选择条目</p>';
  }

  function renderAll() {
    renderCategories();
    renderList();
    renderDetail();
  }

  renderAll();
}
