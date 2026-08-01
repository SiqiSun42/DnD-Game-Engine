const MAIN_PLOT_PAGE_ID = 'main_plot';
const SIDE_QUEST_PAGE_ID = 'side_quest';
const HISTORY_MISSIONS_PAGE_ID = 'history_missions';

function buildNotesCategories(schema) {
  const categories = {};
  (schema?.categories || []).forEach(cat => {
    categories[cat.id] = { id: cat.id, label: cat.label };
  });
  return categories;
}

function mountNotesPanel(container, schema, data) {
  if (!schema || !data) {
    mountDefaultPanel(container, { label: '任务' });
    return;
  }

  const NOTES_CATEGORIES = buildNotesCategories(schema);
  const MAIN_PLOT_MISSIONS = data.mainPlot || [];
  const SIDE_QUEST_MISSIONS = data.sideQuest || [];
  const HISTORY_MISSIONS = data.history || [];
  const mainPlotLabel = schema.sectionLabels?.mainPlot || '主线任务';
  const sideQuestLabel = schema.sectionLabels?.sideQuest || '支线任务';
  const historyMissionsLabel = schema.sectionLabels?.historyMissions || '历史任务';

  let activeCategory = 'current_chapter';
  let activeMissionPage = MAIN_PLOT_PAGE_ID;

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

  function getMissionsForPage(pageId) {
    if (pageId === MAIN_PLOT_PAGE_ID) return MAIN_PLOT_MISSIONS;
    if (pageId === HISTORY_MISSIONS_PAGE_ID) return HISTORY_MISSIONS;
    return SIDE_QUEST_MISSIONS;
  }

  function renderMissionItem(mission) {
    const item = document.createElement('div');
    item.className = 'notes-mission-item';

    const name = document.createElement('div');
    name.className = 'notes-mission-name';
    name.textContent = `${getQuestStatusIcon(mission)} ${mission.name}`;

    const intro = document.createElement('div');
    intro.className = 'notes-mission-intro';
    intro.textContent = `简介：${mission.description || ''}`;

    item.appendChild(name);
    item.appendChild(intro);

    if (mission.nodes?.length) {
      const nodesEl = document.createElement('div');
      nodesEl.className = 'notes-mission-nodes';
      mission.nodes.forEach(node => {
        const nodeEl = document.createElement('div');
        nodeEl.className = 'notes-mission-node';
        nodeEl.textContent = `${getNodeStatusIcon(node)} ${node.description || ''}`;
        nodesEl.appendChild(nodeEl);
      });
      item.appendChild(nodesEl);
    }

    return item;
  }

  function renderMissionPage(missions) {
    detailEl.innerHTML = '';

    if (!missions.length) {
      detailEl.innerHTML = '<p class="notes-detail-empty">暂无任务</p>';
      return;
    }

    const list = document.createElement('div');
    list.className = 'notes-mission-list';
    missions.forEach(mission => {
      list.appendChild(renderMissionItem(mission));
    });
    detailEl.appendChild(list);
  }

  function renderCategories() {
    categoriesEl.innerHTML = '';
    Object.values(NOTES_CATEGORIES).forEach(cat => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'notes-panel-item' + (cat.id === activeCategory ? ' active' : '');
      btn.textContent = cat.label;
      btn.addEventListener('click', () => {
        activeCategory = cat.id;
        if (activeCategory === 'current_chapter') {
          activeMissionPage = MAIN_PLOT_PAGE_ID;
        }
        renderAll();
      });
      categoriesEl.appendChild(btn);
    });
  }

  function renderMissionNavItem(pageId, label) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'notes-panel-item' + (activeMissionPage === pageId ? ' active' : '');
    btn.textContent = label;
    btn.addEventListener('click', () => {
      activeMissionPage = pageId;
      renderMissionNav();
      renderMissionPage(getMissionsForPage(pageId));
    });
    listEl.appendChild(btn);
  }

  function renderMissionNav() {
    listEl.innerHTML = '';

    if (activeCategory === 'history_chapter') {
      detailEl.innerHTML = '';
      return;
    }

    renderMissionNavItem(MAIN_PLOT_PAGE_ID, mainPlotLabel);
    renderMissionNavItem(SIDE_QUEST_PAGE_ID, sideQuestLabel);
    renderMissionNavItem(HISTORY_MISSIONS_PAGE_ID, historyMissionsLabel);
  }

  function renderDetail() {
    if (activeCategory === 'history_chapter') {
      detailEl.innerHTML = '';
      return;
    }

    renderMissionPage(getMissionsForPage(activeMissionPage));
  }

  function renderAll() {
    renderCategories();
    renderMissionNav();
    renderDetail();
  }

  renderAll();
}
