const STATUS_COMBAT_ONLY_CATEGORIES_ENABLED = false;

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
    return (a.order ?? 0) - (b.order ?? 0);
  });
}

function isStatusEncounter(item) {
  return Array.isArray(item?.members);
}

function getStatusEncounters(characters) {
  return (characters || []).filter(isStatusEncounter);
}

function getActiveStatusCharacters(categoryId, cat, activeEncounterId) {
  if (!cat) return [];
  const encounters = getStatusEncounters(cat.characters);
  if (categoryId === 'enemy' && encounters.length) {
    if (!activeEncounterId) return [];
    const encounter = encounters.find(item => item.id === activeEncounterId);
    return sortStatusCharacters(categoryId, encounter?.members || []);
  }
  return sortStatusCharacters(categoryId, cat.characters || []);
}

function findActiveStatusCharacter(categoryId, cat, activeEncounterId, activeCharacterId) {
  const chars = getActiveStatusCharacters(categoryId, cat, activeEncounterId);
  return chars.find(item => item.id === activeCharacterId) || null;
}

function getStatusDetailFields(data, schema) {
  if (Array.isArray(data?.statusFields) && data.statusFields.length) {
    return data.statusFields.filter(field => field?.key && field?.label);
  }
  if (Array.isArray(schema?.defaultStatusFields) && schema.defaultStatusFields.length) {
    return schema.defaultStatusFields.filter(field => field?.key && field?.label);
  }
  return [];
}

function formatStatusFieldValue(value) {
  if (value === undefined || value === null || value === '') return '';
  return String(value);
}

function parseAbilityEntry(value) {
  if (value && typeof value === 'object') {
    const score = formatStatusFieldValue(value.score ?? value.value);
    let modifier = formatStatusFieldValue(value.modifier);
    if (modifier && !/^[+\-]/.test(modifier)) {
      modifier = `+${modifier}`;
    }
    return { score, modifier };
  }

  const text = formatStatusFieldValue(value);
  if (!text) return { score: '', modifier: '' };

  const match = text.match(/^(\d+)\s*(?:[（(]\s*修正值\s*([+\-]?\d+)\s*[）)])?\s*$/);
  if (match) {
    let modifier = match[2] || '';
    if (modifier && !/^[+\-]/.test(modifier)) {
      modifier = `+${modifier}`;
    }
    return { score: match[1], modifier };
  }

  return { score: text, modifier: '' };
}

function buildStatusInlineParts(subFields, value) {
  return subFields
    .map(subField => {
      const partValue = formatStatusFieldValue(value?.[subField.key]);
      if (!partValue) return '';
      return `${escapePanelText(subField.label)}：${escapePanelText(partValue)}`;
    })
    .filter(Boolean);
}

function renderStatusInlineSection(label, parts) {
  if (!parts.length) return '';
  return `
    <section class="character-detail-section">
      <h4 class="character-detail-label">${escapePanelText(label)}</h4>
      <p class="character-detail-inline">${parts.join('；')}</p>
    </section>
  `;
}

function renderStatusTextSection(label, value, className = 'character-detail-section') {
  const text = formatStatusFieldValue(value);
  if (!text) return '';
  const labelClass = className === 'character-detail-subsection'
    ? 'character-detail-sublabel'
    : 'character-detail-label';
  return `
    <section class="${className}">
      <h4 class="${labelClass}">${escapePanelText(label)}</h4>
      <p class="character-detail-body">${escapePanelText(text)}</p>
    </section>
  `;
}

function renderStatusProfileSection(field, value) {
  const subFields = (field.fields || []).filter(item => item?.key && item?.label);
  if (!subFields.length) return renderStatusTextSection(field.label, value);

  const parts = buildStatusInlineParts(subFields, value);
  return renderStatusInlineSection(field.label, parts);
}

function renderStatusSubsection(subField, value) {
  const text = formatStatusFieldValue(value);
  if (!text) return '';
  return `
    <section class="character-detail-subsection">
      <h4 class="character-detail-sublabel">${escapePanelText(subField.label)}</h4>
      <p class="character-detail-body">${escapePanelText(text)}</p>
    </section>
  `;
}

function renderAbilityItemCells(subField, abilities) {
  const entry = parseAbilityEntry(abilities?.[subField.key]);
  if (!entry.score && !entry.modifier) return '';

  const modifier = entry.modifier || '+0';
  return `
    <span class="status-ability-name">${escapePanelText(subField.label)}：</span>
    <span class="status-ability-score">${escapePanelText(entry.score)}</span>
    <span class="status-ability-mod-label">修正值：</span>
    <span class="status-ability-mod">${escapePanelText(modifier)}</span>
  `;
}

function renderStatusAbilitiesSection(field, value) {
  if (!value || typeof value !== 'object') return '';

  const subFields = (field.fields || []).filter(item => item?.key && item?.label);
  const cells = subFields
    .map(subField => renderAbilityItemCells(subField, value))
    .filter(Boolean)
    .join('');

  if (!cells) return '';
  return `
    <section class="character-detail-section">
      <h4 class="character-detail-label">${escapePanelText(field.label)}</h4>
      <div class="status-ability-grid">${cells}</div>
    </section>
  `;
}

function renderStatusNestedSection(field, value) {
  if (!value || typeof value !== 'object') return '';

  const summary = formatStatusFieldValue(value.summary);
  if (summary) {
    return renderStatusTextSection(field.label, summary);
  }

  const subFields = (field.fields || []).filter(item => item?.key && item?.label);
  if (!subFields.length) return renderStatusTextSection(field.label, String(value));

  if (field.layout === 'inline') {
    const parts = buildStatusInlineParts(
      subFields.filter(subField => subField.key !== 'summary'),
      value,
    );
    return renderStatusInlineSection(field.label, parts);
  }

  const subsections = subFields
    .map(subField => renderStatusSubsection(subField, value[subField.key]))
    .filter(Boolean)
    .join('');

  if (!subsections) return '';
  return `
    <section class="character-detail-section">
      <h4 class="character-detail-label">${escapePanelText(field.label)}</h4>
      <div class="character-detail-nested">${subsections}</div>
    </section>
  `;
}

function renderStatusConditionsSection(field, value) {
  const items = Array.isArray(value) ? value : [];
  if (!items.length) {
    return renderStatusTextSection(field.label, '无异常状态');
  }

  const list = items.map(item => {
    const name = formatStatusFieldValue(item?.name);
    const duration = formatStatusFieldValue(item?.duration);
    const effect = formatStatusFieldValue(item?.effect);
    if (!name) return '';

    let text = name;
    if (duration) text += `（${duration}）`;
    if (effect) text += `：${effect}`;
    return `<li class="character-relationship-item">${escapePanelText(text)}</li>`;
  }).filter(Boolean).join('');

  if (!list) return renderStatusTextSection(field.label, '无异常状态');
  return `
    <section class="character-detail-section">
      <h4 class="character-detail-label">${escapePanelText(field.label)}</h4>
      <ul class="character-relationship-list">${list}</ul>
    </section>
  `;
}

function renderStatusDetailSections(char, data, schema) {
  const fields = getStatusDetailFields(data, schema);
  if (!fields.length) {
    if (char.detail) {
      return `<p class="character-detail-body">${escapePanelText(char.detail)}</p>`;
    }
    return '';
  }

  return fields.map(field => {
    const value = char[field.key];
    if (field.type === 'profile') {
      return renderStatusProfileSection(field, value);
    }
    if (field.type === 'abilities') {
      return renderStatusAbilitiesSection(field, value);
    }
    if (field.type === 'conditions') {
      return renderStatusConditionsSection(field, value);
    }
    if (Array.isArray(field.fields) && field.fields.length) {
      return renderStatusNestedSection(field, value);
    }
    return renderStatusTextSection(field.label, value);
  }).filter(Boolean).join('');
}

function mountStatusPanel(container, schema, data) {
  if (!schema || !data) {
    mountDefaultPanel(container, { label: '状态' });
    return;
  }

  const STATUS_IN_COMBAT = !!data.inCombat;
  const STATUS_CATEGORIES = buildStatusCategories(schema, data);

  function getVisibleStatusCategories() {
    return Object.values(STATUS_CATEGORIES).filter(cat => {
      if (!cat.combatOnly) return true;
      if (!STATUS_COMBAT_ONLY_CATEGORIES_ENABLED) return true;
      return STATUS_IN_COMBAT;
    });
  }

  const visibleCategories = getVisibleStatusCategories();
  let activeCategory = visibleCategories[0]?.id || 'team';
  let activeEncounterId = null;
  let enemyExpanded = true;
  let activeCharacterId = getActiveStatusCharacters(
    activeCategory,
    STATUS_CATEGORIES[activeCategory],
    activeEncounterId,
  )[0]?.id || null;

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
      const encounters = getStatusEncounters(cat.characters);
      if (cat.id === 'enemy' && encounters.length) {
        renderEnemyCategoryGroup(cat, encounters);
        return;
      }

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'status-panel-item' + (cat.id === activeCategory ? ' active' : '');
      btn.textContent = cat.label;
      btn.addEventListener('click', () => {
        activeCategory = cat.id;
        activeEncounterId = null;
        const chars = getActiveStatusCharacters(activeCategory, STATUS_CATEGORIES[activeCategory], activeEncounterId);
        activeCharacterId = chars[0]?.id || null;
        renderAll();
      });
      categoriesEl.appendChild(btn);
    });
  }

  function renderEnemyCategoryGroup(cat, encounters) {
    const wrapper = document.createElement('div');
    wrapper.className = 'status-category-group';

    const headerBtn = document.createElement('button');
    headerBtn.type = 'button';
    headerBtn.className = 'status-panel-item status-category-toggle'
      + (activeCategory === 'enemy' ? ' active' : '');
    headerBtn.innerHTML = `
      <span class="status-category-chevron${enemyExpanded ? ' expanded' : ''}" aria-hidden="true">▸</span>
      <span>${escapePanelText(cat.label)}</span>
    `;
    headerBtn.addEventListener('click', () => {
      const nextExpanded = activeCategory === 'enemy' ? !enemyExpanded : true;
      activeCategory = 'enemy';
      enemyExpanded = nextExpanded;
      if (!activeEncounterId) {
        activeEncounterId = encounters[0]?.id || null;
      }
      const chars = getActiveStatusCharacters('enemy', cat, activeEncounterId);
      activeCharacterId = chars[0]?.id || null;
      renderAll();
    });
    wrapper.appendChild(headerBtn);

    if (enemyExpanded) {
      const subList = document.createElement('div');
      subList.className = 'status-category-sublist';
      encounters.forEach(encounter => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'status-panel-item status-encounter-item'
          + (activeCategory === 'enemy' && activeEncounterId === encounter.id ? ' active' : '');
        btn.textContent = encounter.name;
        btn.addEventListener('click', event => {
          event.stopPropagation();
          activeCategory = 'enemy';
          activeEncounterId = encounter.id;
          enemyExpanded = true;
          const chars = getActiveStatusCharacters('enemy', cat, activeEncounterId);
          activeCharacterId = chars[0]?.id || null;
          renderAll();
        });
        subList.appendChild(btn);
      });
      wrapper.appendChild(subList);
    }

    categoriesEl.appendChild(wrapper);
  }

  function renderList() {
    listEl.innerHTML = '';
    const cat = STATUS_CATEGORIES[activeCategory];
    if (!cat) {
      detailEl.innerHTML = '<p class="status-detail-empty">请选择人物</p>';
      return;
    }

    const encounters = getStatusEncounters(cat.characters);
    if (activeCategory === 'enemy' && encounters.length && !activeEncounterId) {
      listEl.innerHTML = '<p class="status-list-hint">请选择遭遇战</p>';
      detailEl.innerHTML = '<p class="status-detail-empty">请选择遭遇战</p>';
      return;
    }

    const chars = getActiveStatusCharacters(activeCategory, cat, activeEncounterId);
    if (!chars.find(item => item.id === activeCharacterId)) {
      activeCharacterId = chars[0]?.id || null;
    }
    if (!chars.length) {
      listEl.innerHTML = '<p class="status-list-hint">暂无人物</p>';
      detailEl.innerHTML = '<p class="status-detail-empty">暂无资料</p>';
      return;
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
    const char = findActiveStatusCharacter(activeCategory, cat, activeEncounterId, activeCharacterId);
    if (!char) {
      detailEl.innerHTML = '<p class="status-detail-empty">请选择人物</p>';
      return;
    }
    const sections = renderStatusDetailSections(char, data, schema);
    detailEl.innerHTML = `
      <div class="status-detail-inner">
        <h3 class="status-detail-title">${escapePanelText(char.name)}</h3>
        ${sections || '<p class="status-detail-empty">暂无资料</p>'}
      </div>
    `;
  }

  function renderAll() {
    const visible = getVisibleStatusCategories();
    if (!visible.find(cat => cat.id === activeCategory)) {
      activeCategory = visible[0]?.id || 'team';
      activeEncounterId = null;
      const chars = getActiveStatusCharacters(
        activeCategory,
        STATUS_CATEGORIES[activeCategory],
        activeEncounterId,
      );
      activeCharacterId = chars[0]?.id || null;
    }
    renderCategories();
    renderList();
    renderDetail();
  }

  renderAll();
}
