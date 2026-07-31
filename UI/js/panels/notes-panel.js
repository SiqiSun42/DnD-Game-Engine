const CHAPTER_MISSIONS_PAGE_ID = 'chapter_missions';
const CURRENT_MISSIONS_PAGE_ID = 'current_missions';
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
  const CHAPTER_MISSIONS = data.chapter || [];
  const CURRENT_MISSIONS = data.current || [];
  const HISTORY_MISSIONS = data.history || [];
  const chapterMissionsLabel = schema.sectionLabels?.chapterMissions || '章节任务';
  const currentMissionsLabel = schema.sectionLabels?.currentMissions || '当前任务';
  const historyMissionsLabel = schema.sectionLabels?.historyMissions || '历史任务';

  let activeCategory = 'current_chapter';
  let activeMissionPage = CURRENT_MISSIONS_PAGE_ID;

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
    if (pageId === CHAPTER_MISSIONS_PAGE_ID) return CHAPTER_MISSIONS;
    if (pageId === HISTORY_MISSIONS_PAGE_ID) return HISTORY_MISSIONS;
    return CURRENT_MISSIONS;
  }

  function renderMissionItem(mission) {
    const item = document.createElement('div');
    item.className = 'notes-mission-item';

    const name = document.createElement('div');
    name.className = 'notes-mission-name';
    name.textContent = `${getMissionStatusIcon(mission)} ${mission.name}`;

    const content = document.createElement('div');
    content.className = 'notes-mission-content';
    content.textContent = mission.content || '';

    item.appendChild(name);
    if (mission.content) {
      item.appendChild(content);
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
          activeMissionPage = CURRENT_MISSIONS_PAGE_ID;
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

    renderMissionNavItem(CHAPTER_MISSIONS_PAGE_ID, chapterMissionsLabel);
    renderMissionNavItem(CURRENT_MISSIONS_PAGE_ID, currentMissionsLabel);
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
