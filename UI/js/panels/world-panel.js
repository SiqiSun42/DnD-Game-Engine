function resolveEventCategoryForPanel(resolvedData) {
  const fromResolved = resolveEventCategoryFromData(resolvedData);
  if (fromResolved.list.length) {
    return fromResolved;
  }
  const rawWorld = typeof getActiveSaveData === 'function' ? getActiveSaveData()?.world : null;
  if (rawWorld && rawWorld !== resolvedData) {
    return resolveEventCategoryFromData(rawWorld);
  }
  return fromResolved;
}

function resolveLocationsCategoryForPanel(resolvedData) {
  const fromResolved = resolveLocationsCategoryFromData(resolvedData);
  if (fromResolved.entriesById && Object.keys(fromResolved.entriesById).length) {
    return fromResolved;
  }
  const saveData = typeof getActiveSaveData === 'function' ? getActiveSaveData() : null;
  const rawWorld = saveData?.world;
  const currentLocationId = saveData?.current?.current_location || resolvedData?.currentLocationId || null;
  if (rawWorld) {
    return resolveLocationsCategoryFromData({
      categories: rawWorld.categories,
      currentLocationId,
    });
  }
  return fromResolved;
}

function buildWorldCategories(schema, data) {
  const categories = {};
  const visible = Array.isArray(data?.visibleCategories) ? new Set(data.visibleCategories) : null;
  (schema?.categories || []).forEach(cat => {
    if (visible && !visible.has(cat.id)) {
      return;
    }
    if (cat.id === 'current_location' || cat.id === 'all_locations') {
      const locationCategory = resolveLocationsCategoryForPanel(data);
      categories[cat.id] = {
        id: cat.id,
        label: cat.label,
        ...locationCategory,
      };
    } else if (cat.id === 'event') {
      const eventCategory = resolveEventCategoryForPanel(data);
      categories.event = {
        id: 'event',
        label: cat.label,
        list: eventCategory.list,
        entriesById: eventCategory.entriesById,
      };
    } else {
      categories[cat.id] = {
        id: cat.id,
        label: cat.label,
        entries: data?.[cat.id] || [],
      };
    }
  });
  return categories;
}

function mountWorldPanel(container, schema, data) {
  if (!schema || !data) {
    mountDefaultPanel(container, { label: '世界' });
    return;
  }

  const WORLD_CATEGORIES = buildWorldCategories(schema, data);
  const WORLD_PANEL_DATA = data;
  const categoryIds = Object.keys(WORLD_CATEGORIES);

  let activeCategory = categoryIds[0] || 'current_location';
  const activeEntryByCategory = {};
  let expandedCurrentLocationIds = new Set();
  let expandedAllLocationIds = new Set();
  let currentLocationExpandedInitialized = false;
  let allLocationsExpandedInitialized = false;
  let expandedEventIds = new Set();

  function getActiveEntryId() {
    return activeEntryByCategory[activeCategory] ?? null;
  }

  function setActiveEntryId(id) {
    activeEntryByCategory[activeCategory] = id;
  }

  function getLocationsCategoryState() {
    const panelData = typeof getPanelData === 'function' ? getPanelData('world') : WORLD_PANEL_DATA;
    return resolveLocationsCategoryForPanel(panelData);
  }

  function syncLocationsCategoryState() {
    const locationCategory = getLocationsCategoryState();
    const base = { ...locationCategory };
    if (WORLD_CATEGORIES.current_location) {
      WORLD_CATEGORIES.current_location = {
        id: 'current_location',
        label: WORLD_CATEGORIES.current_location?.label || '当前地点',
        ...base,
      };
    }
    if (WORLD_CATEGORIES.all_locations) {
      WORLD_CATEGORIES.all_locations = {
        id: 'all_locations',
        label: WORLD_CATEGORIES.all_locations?.label || '所有地点',
        ...base,
      };
    }
    return locationCategory;
  }

  function getEventCategoryState() {
    const panelData = typeof getPanelData === 'function' ? getPanelData('world') : WORLD_PANEL_DATA;
    return resolveEventCategoryForPanel(panelData);
  }

  function syncEventCategoryState() {
    const eventCategory = getEventCategoryState();
    WORLD_CATEGORIES.event = {
      id: 'event',
      label: WORLD_CATEGORIES.event?.label || '事件',
      list: eventCategory.list,
      entriesById: eventCategory.entriesById,
    };
    return WORLD_CATEGORIES.event;
  }

  function initCurrentLocationExpandedState() {
    const loc = syncLocationsCategoryState();
    expandedCurrentLocationIds = getLocalDefaultExpandedLocationIds(
      loc.currentLocationId,
      loc.level2AnchorId,
      loc.entriesById,
    );
  }

  function initAllLocationsExpandedState() {
    const loc = syncLocationsCategoryState();
    expandedAllLocationIds = getAllDefaultExpandedLocationIds(
      loc.currentLocationId,
      loc.entriesById,
    );
  }

  function ensureCurrentLocationInit() {
    if (currentLocationExpandedInitialized) return;
    initCurrentLocationExpandedState();
    currentLocationExpandedInitialized = true;
  }

  function ensureAllLocationsInit() {
    if (allLocationsExpandedInitialized) return;
    initAllLocationsExpandedState();
    allLocationsExpandedInitialized = true;
  }

  function initEventExpandedState(list, entryId) {
    expandedEventIds = getDefaultExpandedEventIds(list, entryId);
    if (!expandedEventIds.size && list.some(item => (item.sub_events || []).length)) {
      expandedEventIds = new Set(
        list.filter(item => (item.sub_events || []).length).map(item => item.event_id),
      );
    }
  }

  function getDefaultEntryId(categoryId) {
    const cat = WORLD_CATEGORIES[categoryId];
    if (!cat) return null;
    if (categoryId === 'current_location' || categoryId === 'all_locations') {
      return syncLocationsCategoryState().currentLocationId || null;
    }
    if (categoryId === 'event') {
      return syncEventCategoryState().list[0]?.event_id || null;
    }
    return cat.entries?.[0]?.id || null;
  }

  setActiveEntryId(getDefaultEntryId(activeCategory));
  if (activeCategory === 'current_location') {
    ensureCurrentLocationInit();
  }
  if (activeCategory === 'all_locations') {
    ensureAllLocationsInit();
  }
  if (activeCategory === 'event') {
    initEventExpandedState(syncEventCategoryState().list, getActiveEntryId());
  }

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
    const entryId = getActiveEntryId();
    if (activeCategory === 'current_location' || activeCategory === 'all_locations') {
      return getLocationsCategoryState().entriesById[entryId] || null;
    }
    if (activeCategory === 'event') {
      return getEventCategoryState().entriesById[entryId] || null;
    }
    const cat = WORLD_CATEGORIES[activeCategory];
    return cat?.entries?.find(e => e.id === entryId) || null;
  }

  function renderCurrentLocationHeader(loc) {
    const activeEntryId = getActiveEntryId();
    const currentEntry = loc.entriesById?.[loc.currentLocationId];
    const titleSelected =
      activeEntryId === loc.currentLocationId && currentEntry?.type === 'town';

    const header = document.createElement('div');
    header.className = 'world-location-header' + (titleSelected ? ' active' : '');

    const prefix = document.createElement('span');
    prefix.className = 'world-location-header-prefix';
    prefix.textContent = '当前位于：';

    const nameBtn = document.createElement('button');
    nameBtn.type = 'button';
    nameBtn.className = 'world-location-header-name';
    nameBtn.textContent = loc.currentLocationName || '未知';
    nameBtn.addEventListener('click', () => {
      if (!loc.currentLocationId) return;
      setActiveEntryId(loc.currentLocationId);
      renderList();
      renderDetail();
    });

    header.appendChild(prefix);
    header.appendChild(nameBtn);
    listEl.appendChild(header);
  }

  function renderLocationTreeRows(rows, expandedIds) {
    const activeEntryId = getActiveEntryId();
    rows.forEach(({ id, name, depth, hasChildren }) => {
      const item = document.createElement('div');
      item.className = 'world-tree-item' + (id === activeEntryId ? ' active' : '');

      const row = document.createElement('div');
      row.className = 'world-tree-row world-tree-row--depth-' + Math.min(depth, 7);

      const nameBtn = document.createElement('button');
      nameBtn.type = 'button';
      nameBtn.className = 'world-tree-btn';
      nameBtn.textContent = name;
      nameBtn.addEventListener('click', () => {
        setActiveEntryId(id);
        renderList();
        renderDetail();
      });

      row.appendChild(nameBtn);

      if (hasChildren) {
        const expanded = expandedIds.has(id);
        const expandBtn = document.createElement('button');
        expandBtn.type = 'button';
        expandBtn.className = 'world-tree-expand-btn';
        expandBtn.setAttribute('aria-label', expanded ? '收起' : '展开');
        expandBtn.textContent = expanded ? '▲' : '▼';
        expandBtn.addEventListener('click', e => {
          e.stopPropagation();
          if (expandedIds.has(id)) {
            expandedIds.delete(id);
          } else {
            expandedIds.add(id);
          }
          renderList();
        });
        row.appendChild(expandBtn);
      }

      item.appendChild(row);
      listEl.appendChild(item);
    });
  }

  function renderCurrentLocationList() {
    listEl.innerHTML = '';
    ensureCurrentLocationInit();
    const loc = syncLocationsCategoryState();
    const { entriesById, childrenByParentId, level2AnchorId, currentLocationId } = loc;

    if (!entriesById || !Object.keys(entriesById).length) {
      listEl.innerHTML = '<p class="world-detail-empty">暂无地点</p>';
      return;
    }

    if (!entriesById[getActiveEntryId()]) {
      setActiveEntryId(currentLocationId || Object.keys(entriesById)[0] || null);
    }

    renderCurrentLocationHeader(loc);

    const rows = getVisibleLocalLocationRows(
      level2AnchorId,
      entriesById,
      childrenByParentId,
      expandedCurrentLocationIds,
    );
    if (!rows.length) {
      const empty = document.createElement('p');
      empty.className = 'world-detail-empty';
      empty.textContent = '当前区域暂无场所或房间';
      listEl.appendChild(empty);
      return;
    }
    renderLocationTreeRows(rows, expandedCurrentLocationIds);
  }

  function renderAllLocationsList() {
    listEl.innerHTML = '';
    ensureAllLocationsInit();
    const loc = syncLocationsCategoryState();
    const { entriesById, childrenByParentId, macroRootIds, currentLocationId } = loc;

    if (!entriesById || !Object.keys(entriesById).length) {
      listEl.innerHTML = '<p class="world-detail-empty">暂无地点</p>';
      return;
    }

    if (!entriesById[getActiveEntryId()]) {
      setActiveEntryId(currentLocationId || Object.keys(entriesById)[0] || null);
    }

    const rows = getVisibleAllLocationRows(
      entriesById,
      childrenByParentId,
      macroRootIds,
      expandedAllLocationIds,
    );
    if (!rows.length) {
      const empty = document.createElement('p');
      empty.className = 'world-detail-empty';
      empty.textContent = '暂无地点';
      listEl.appendChild(empty);
      return;
    }
    renderLocationTreeRows(rows, expandedAllLocationIds);
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
        if (activeEntryByCategory[activeCategory] == null) {
          setActiveEntryId(getDefaultEntryId(activeCategory));
        }
        if (activeCategory === 'current_location') {
          ensureCurrentLocationInit();
        }
        if (activeCategory === 'all_locations') {
          ensureAllLocationsInit();
        }
        if (activeCategory === 'event') {
          initEventExpandedState(syncEventCategoryState().list, getActiveEntryId());
        }
        renderAll();
      });
      categoriesEl.appendChild(btn);
    });
  }

  function renderEventList() {
    listEl.innerHTML = '';
    const cat = syncEventCategoryState();
    const list = cat.list || [];
    const entriesById = cat.entriesById || {};

    if (!list.length) {
      listEl.innerHTML = '<p class="world-detail-empty">暂无事件</p>';
      return;
    }

    if (!entriesById[getActiveEntryId()]) {
      setActiveEntryId(list[0]?.event_id || null);
    }

    const rows = getVisibleEventRows(list, expandedEventIds);
    renderLocationTreeRows(rows, expandedEventIds);
  }

  function renderFlatListEntry(entry) {
    const isActive = entry.id === getActiveEntryId();
    const showMemberBadge = activeCategory === 'organization' && entry.is_member === true;

    if (showMemberBadge) {
      const item = document.createElement('div');
      item.className = 'world-list-item' + (isActive ? ' active' : '');

      const row = document.createElement('div');
      row.className = 'world-list-row';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'world-list-btn';
      btn.textContent = entry.name;
      btn.addEventListener('click', () => {
        setActiveEntryId(entry.id);
        renderList();
        renderDetail();
      });

      const badge = document.createElement('span');
      badge.className = 'world-list-member-badge';
      badge.textContent = '👥';
      badge.setAttribute('aria-label', '已加入');

      row.appendChild(btn);
      row.appendChild(badge);
      item.appendChild(row);
      listEl.appendChild(item);
      return;
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'world-panel-item' + (isActive ? ' active' : '');
    btn.textContent = entry.name;
    btn.addEventListener('click', () => {
      setActiveEntryId(entry.id);
      renderList();
      renderDetail();
    });
    listEl.appendChild(btn);
  }

  function renderFlatList() {
    listEl.innerHTML = '';
    const cat = WORLD_CATEGORIES[activeCategory];
    if (!cat?.entries) return;
    if (!cat.entries.find(e => e.id === getActiveEntryId())) {
      setActiveEntryId(cat.entries[0]?.id || null);
    }
    cat.entries.forEach(entry => {
      renderFlatListEntry(entry);
    });
  }

  function renderList() {
    if (activeCategory === 'current_location') {
      renderCurrentLocationList();
    } else if (activeCategory === 'all_locations') {
      renderAllLocationsList();
    } else if (activeCategory === 'event') {
      renderEventList();
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
    const detailCategoryId =
      activeCategory === 'current_location' || activeCategory === 'all_locations'
        ? 'location'
        : activeCategory;
    const detailSections = renderWorldCategoryDetail(detailCategoryId, entry);
    detailEl.innerHTML = `
      <div class="world-detail-inner">
        <h3 class="world-detail-title">${escapePanelText(entry.name)}</h3>
        ${detailSections || '<p class="world-detail-empty">暂无详情</p>'}
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
