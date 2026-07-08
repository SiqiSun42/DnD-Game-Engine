function findLocationNode(id, nodes) {
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

function getLocationExpandPath(targetId, nodes, path = []) {
  for (const node of nodes) {
    if (node.id === targetId) return path;
    if (node.children?.length) {
      const found = getLocationExpandPath(targetId, node.children, [...path, node.id]);
      if (found) return found;
    }
  }
  return null;
}

function getDefaultExpandedLocationIds(locationTree, defaultLocationId) {
  const path = getLocationExpandPath(defaultLocationId, locationTree);
  return new Set(path || []);
}

function buildWorldCategories(schema, data) {
  const categories = {};
  const visible = Array.isArray(data?.visibleCategories) ? new Set(data.visibleCategories) : null;
  (schema?.categories || []).forEach(cat => {
    if (visible && !visible.has(cat.id)) {
      return;
    }
    if (cat.id === 'location') {
      categories.location = {
        id: 'location',
        label: cat.label,
        tree: data?.locationTree || [],
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

function getLocationDetailFields(data, schema) {
  if (Array.isArray(data?.locationFields) && data.locationFields.length) {
    return data.locationFields.filter(field => field?.key && field?.label);
  }
  if (Array.isArray(schema?.defaultLocationFields) && schema.defaultLocationFields.length) {
    return schema.defaultLocationFields.filter(field => field?.key && field?.label);
  }
  return [{ key: 'description', label: '描述' }];
}

function renderLocationDetailSections(entry, data, schema) {
  const fields = getLocationDetailFields(data, schema);
  const sections = [];
  fields.forEach(field => {
    const value = entry[field.key];
    if (!value) return;
    sections.push(`
      <section class="world-detail-section">
        <h4 class="world-detail-label">${escapePanelText(field.label)}</h4>
        <p class="world-detail-body">${escapePanelText(value)}</p>
      </section>
    `);
  });
  if (!sections.length) {
    sections.push(`<p class="world-detail-body">${escapePanelText(entry.name)}</p>`);
  }
  return sections.join('');
}

function mountWorldPanel(container, schema, data) {
  if (!schema || !data) {
    mountDefaultPanel(container, { label: '世界' });
    return;
  }

  const WORLD_CATEGORIES = buildWorldCategories(schema, data);
  const LOCATION_TREE = data.locationTree || [];
  const DEFAULT_LOCATION_ID = data.defaultLocationId || LOCATION_TREE[0]?.id || null;
  const WORLD_PANEL_DATA = data;
  const WORLD_SCHEMA = schema;

  let activeCategory = 'location';
  let activeEntryId = DEFAULT_LOCATION_ID;
  const expandedLocationIds = getDefaultExpandedLocationIds(LOCATION_TREE, DEFAULT_LOCATION_ID);

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
      return findLocationNode(activeEntryId, LOCATION_TREE);
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
    if (!findLocationNode(activeEntryId, LOCATION_TREE)) {
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
    if (activeCategory === 'location') {
      detailEl.innerHTML = `
        <div class="world-detail-inner">
          <h3 class="world-detail-title">${escapePanelText(entry.name)}</h3>
          ${renderLocationDetailSections(entry, WORLD_PANEL_DATA, WORLD_SCHEMA)}
        </div>
      `;
      return;
    }
    detailEl.innerHTML = `
      <div class="world-detail-inner">
        <h3 class="world-detail-title">${escapePanelText(entry.name)}</h3>
        <p class="world-detail-body">${escapePanelText(entry.description || '')}</p>
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
