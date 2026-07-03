const CURRENT_QUESTS_PAGE_ID = 'current-quests';
const HISTORY_ROOT_ID = 'history-root';

function findHistoryQuestPage(root, id) {
  return root.pages.find(page => page.id === id) || null;
}

function isValidQuestEntryId(root, id) {
  return id === CURRENT_QUESTS_PAGE_ID || !!findHistoryQuestPage(root, id);
}

function findDevPlotNode(id, nodes) {
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

function getDevPlotExpandPath(targetId, nodes, path = []) {
  for (const node of nodes) {
    if (node.id === targetId) return path;
    if (node.children?.length) {
      const found = getDevPlotExpandPath(targetId, node.children, [...path, node.id]);
      if (found) return found;
    }
  }
  return null;
}

function getDefaultExpandedDevPlotIds(devPlotTree, defaultDevPlotEntryId) {
  const path = getDevPlotExpandPath(defaultDevPlotEntryId, devPlotTree);
  return new Set(path || []);
}

function buildNotesCategories(schema) {
  const categories = {};
  (schema?.categories || []).forEach(cat => {
    categories[cat.id] = { id: cat.id, label: cat.label };
  });
  return categories;
}

function mountNotesPanel(container, schema, data) {
  if (!schema || !data) {
    mountDefaultPanel(container, { label: '笔记' });
    return;
  }

  const NOTES_CATEGORIES = buildNotesCategories(schema);
  const CURRENT_QUEST_ITEMS = data.currentQuests || [];
  const HISTORY_QUEST_ROOT = {
    id: HISTORY_ROOT_ID,
    name: schema.questLabels?.historyRoot || '历史任务',
    pages: data.historyQuests?.pages || [],
  };
  const DEV_PLOT_TREE = data.devPlotTree || [];
  const DEFAULT_DEV_PLOT_ENTRY_ID = data.defaultDevPlotEntryId || DEV_PLOT_TREE[0]?.id || null;
  const currentQuestLabel = schema.questLabels?.currentPage || '当前任务';

  let activeCategory = 'quest';
  let activeEntryId = CURRENT_QUESTS_PAGE_ID;
  let historyExpanded = true;
  const expandedDevPlotIds = getDefaultExpandedDevPlotIds(DEV_PLOT_TREE, DEFAULT_DEV_PLOT_ENTRY_ID);

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
        activeEntryId = activeCategory === 'quest' ? CURRENT_QUESTS_PAGE_ID : DEFAULT_DEV_PLOT_ENTRY_ID;
        renderAll();
      });
      categoriesEl.appendChild(btn);
    });
  }

  function renderQuestList() {
    listEl.innerHTML = '';
    if (!isValidQuestEntryId(HISTORY_QUEST_ROOT, activeEntryId)) {
      activeEntryId = CURRENT_QUESTS_PAGE_ID;
    }

    const currentBtn = document.createElement('button');
    currentBtn.type = 'button';
    currentBtn.className = 'notes-panel-item' + (activeEntryId === CURRENT_QUESTS_PAGE_ID ? ' active' : '');
    currentBtn.textContent = currentQuestLabel;
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
    if (!findDevPlotNode(activeEntryId, DEV_PLOT_TREE)) {
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
      const entry = findDevPlotNode(activeEntryId, DEV_PLOT_TREE);
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
      renderQuestPageDetail(currentQuestLabel, CURRENT_QUEST_ITEMS);
      return;
    }

    const historyPage = findHistoryQuestPage(HISTORY_QUEST_ROOT, activeEntryId);
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
