const TIER_ORDER = { player: 0, ally: 1, key: 0, normal: 1 };

function sortCharacters(list) {
  return [...list].sort((a, b) => {
    const tierDiff = (TIER_ORDER[a.tier] ?? 9) - (TIER_ORDER[b.tier] ?? 9);
    if (tierDiff !== 0) return tierDiff;
    return a.order - b.order;
  });
}

function buildCharacterCategories(schema, data) {
  const categories = {};
  (schema?.categories || []).forEach(cat => {
    categories[cat.id] = {
      id: cat.id,
      label: cat.label,
      characters: data?.[cat.id] || [],
    };
  });
  return categories;
}

function findCharacterEntry(characterId, data, schema) {
  if (!characterId || !data) return null;
  for (const cat of schema?.categories || []) {
    const character = (data[cat.id] || []).find(item => item.id === characterId);
    if (character) {
      return { categoryId: cat.id, character };
    }
  }
  return null;
}

function getCharacterDetailFields(data, schema) {
  if (Array.isArray(data?.characterFields) && data.characterFields.length) {
    return data.characterFields.filter(field => field?.key && field?.label);
  }
  if (Array.isArray(schema?.defaultCharacterFields) && schema.defaultCharacterFields.length) {
    return schema.defaultCharacterFields.filter(field => field?.key && field?.label);
  }
  return [];
}

function formatCharacterFieldValue(value) {
  if (value === undefined || value === null || value === '') return '不详';
  return String(value);
}

function formatTraitScore(score) {
  if (score === undefined || score === null || score === '') return '不详';
  return String(score);
}

function formatAxisScore(axis, score) {
  const label = escapePanelText(axis.label);
  if (score === undefined || score === null || score === '') {
    return `${label} - 不详`;
  }
  return `${label} - ${escapePanelText(String(score))}`;
}

function renderCharacterTextSection(label, value, className = 'character-detail-section') {
  if (!value) return '';
  const labelClass = className === 'character-detail-subsection'
    ? 'character-detail-sublabel'
    : 'character-detail-label';
  return `
    <section class="${className}">
      <h4 class="${labelClass}">${escapePanelText(label)}</h4>
      <p class="character-detail-body">${escapePanelText(value)}</p>
    </section>
  `;
}

function renderCharacterProfileSection(field, value) {
  const subFields = (field.fields || []).filter(item => item?.key && item?.label);
  if (!subFields.length) return renderCharacterTextSection(field.label, value);

  const parts = subFields.map(subField => {
    const partValue = formatCharacterFieldValue(value?.[subField.key]);
    return `${escapePanelText(subField.label)}：${escapePanelText(partValue)}`;
  });

  return `
    <section class="character-detail-section">
      <h4 class="character-detail-label">${escapePanelText(field.label)}</h4>
      <p class="character-detail-inline">${parts.join('；')}</p>
    </section>
  `;
}

function renderCharacterMoralAlignmentSection(label, value, data) {
  if (!value || typeof value !== 'object') return '';
  const axes = data?.moralAlignmentAxes || {};
  const lawAxis = axes.lawChaos || { label: '守序/混乱' };
  const goodAxis = axes.goodEvil || { label: '善良/邪恶' };

  const axisText = [
    formatAxisScore(lawAxis, value.lawChaos),
    formatAxisScore(goodAxis, value.goodEvil),
  ].join('；');
  const summary = value.alignment
    ? `${escapePanelText(value.alignment)}：${axisText}`
    : axisText;
  const description = value.description
    ? `<p class="character-detail-body">${escapePanelText(value.description)}</p>`
    : '';

  return `
    <section class="character-detail-subsection">
      <h4 class="character-detail-sublabel">${escapePanelText(label)}</h4>
      <p class="character-detail-inline">${summary}</p>
      ${description}
    </section>
  `;
}

function renderCharacterTraitsSection(label, value, data) {
  const traitFields = Array.isArray(data?.traitFields) ? data.traitFields : [];
  if (!traitFields.length) {
    return renderCharacterTextSection(label, typeof value === 'string' ? value : '', 'character-detail-subsection');
  }

  const items = traitFields.map(trait => {
    const scoreText = formatTraitScore(value?.[trait.key]);
    return `${escapePanelText(trait.label)} - ${escapePanelText(scoreText)}`;
  });
  const midpoint = Math.ceil(items.length / 2);
  const rows = [items.slice(0, midpoint), items.slice(midpoint)]
    .filter(row => row.length)
    .map(row => `<p class="character-detail-inline character-trait-row">${row.join('；')}</p>`)
    .join('');

  return `
    <section class="character-detail-subsection">
      <h4 class="character-detail-sublabel">${escapePanelText(label)}</h4>
      <div class="character-trait-rows">${rows}</div>
    </section>
  `;
}

function renderCharacterPersonalitySubsection(subField, value, data) {
  const subValue = value?.[subField.key];
  if (subField.type === 'moralAlignment') {
    return renderCharacterMoralAlignmentSection(subField.label, subValue, data);
  }
  if (subField.type === 'traits') {
    return renderCharacterTraitsSection(subField.label, subValue, data);
  }
  return renderCharacterTextSection(subField.label, subValue, 'character-detail-subsection');
}

function renderCharacterNestedSection(field, value, data) {
  if (!value || typeof value !== 'object') return '';
  const subFields = (field.fields || []).filter(item => item?.key && item?.label);
  if (!subFields.length) return renderCharacterTextSection(field.label, String(value));

  const subsections = subFields
    .map(subField => renderCharacterPersonalitySubsection(subField, value, data))
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

function renderCharacterRelationshipsSection(field, relationships, data, schema) {
  if (!Array.isArray(relationships) || !relationships.length) return '';

  const items = relationships.map(entry => {
    const characterId = entry?.characterId;
    if (!characterId) return '';

    const linked = findCharacterEntry(characterId, data, schema);
    const displayName = linked?.character.name || entry.name || characterId;
    const affection = entry.affection ?? entry.score;
    const affectionText = affection !== undefined && affection !== null
      ? `<span class="character-relationship-score">${escapePanelText(String(affection))}</span>`
      : '';
    const description = entry.description
      ? `<span class="character-relationship-desc">${escapePanelText(entry.description)}</span>`
      : '';

    const nameMarkup = linked
      ? `<button
          type="button"
          class="character-relationship-link"
          data-character-link="true"
          data-character-id="${escapePanelText(characterId)}"
        >${escapePanelText(displayName)}</button>`
      : `<span class="character-relationship-name">${escapePanelText(displayName)}</span>`;

    return `
      <li class="character-relationship-item">
        ${nameMarkup}
        ${affectionText}
        ${description}
      </li>
    `;
  }).filter(Boolean).join('');

  if (!items) return '';
  return `
    <section class="character-detail-section">
      <h4 class="character-detail-label">${escapePanelText(field.label)}</h4>
      <ul class="character-relationship-list">${items}</ul>
    </section>
  `;
}

function renderCharacterDetailSections(char, data, schema) {
  const fields = getCharacterDetailFields(data, schema);
  if (!fields.length) {
    if (char.detail) {
      return `<p class="character-detail-body">${escapePanelText(char.detail)}</p>`;
    }
    return '';
  }

  return fields.map(field => {
    const value = char[field.key];
    if (field.type === 'relationships') {
      return renderCharacterRelationshipsSection(field, value, data, schema);
    }
    if (field.type === 'profile') {
      return renderCharacterProfileSection(field, value);
    }
    if (Array.isArray(field.fields) && field.fields.length) {
      return renderCharacterNestedSection(field, value, data);
    }
    return renderCharacterTextSection(field.label, value);
  }).filter(Boolean).join('');
}

function mountCharacterPanel(container, schema, data) {
  if (!schema || !data) {
    mountDefaultPanel(container, { label: '人物' });
    return;
  }

  const CHARACTER_CATEGORIES = buildCharacterCategories(schema, data);
  const CHARACTER_PANEL_DATA = data;
  const CHARACTER_SCHEMA = schema;
  const firstCategory = schema.categories[0]?.id || 'party';
  const firstCharacter = sortCharacters(CHARACTER_CATEGORIES[firstCategory]?.characters || [])[0];

  let activeCategory = firstCategory;
  let activeCharacterId = firstCharacter?.id || null;

  container.innerHTML = `
    <div class="character-panel" id="character-panel">
      <div class="character-panel-col character-panel-categories" id="character-categories"></div>
      <div class="character-panel-col character-panel-list" id="character-list"></div>
      <div class="character-panel-col character-panel-detail" id="character-detail"></div>
    </div>
  `;

  const categoriesEl = container.querySelector('#character-categories');
  const listEl = container.querySelector('#character-list');
  const detailEl = container.querySelector('#character-detail');

  function bindRelationshipLinks() {
    detailEl.querySelectorAll('[data-character-link]').forEach(btn => {
      const characterId = btn.dataset.characterId;
      const entry = findCharacterEntry(characterId, CHARACTER_PANEL_DATA, CHARACTER_SCHEMA);
      if (!entry) return;
      btn.addEventListener('click', () => {
        activeCategory = entry.categoryId;
        activeCharacterId = entry.character.id;
        renderAll();
      });
    });
  }

  function renderCategories() {
    categoriesEl.innerHTML = '';
    Object.values(CHARACTER_CATEGORIES).forEach(cat => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'character-panel-item' + (cat.id === activeCategory ? ' active' : '');
      btn.textContent = cat.label;
      btn.addEventListener('click', () => {
        activeCategory = cat.id;
        const chars = sortCharacters(CHARACTER_CATEGORIES[activeCategory].characters);
        activeCharacterId = chars[0]?.id || null;
        renderAll();
      });
      categoriesEl.appendChild(btn);
    });
  }

  function renderList() {
    listEl.innerHTML = '';
    const chars = sortCharacters(CHARACTER_CATEGORIES[activeCategory].characters);
    if (!chars.find(c => c.id === activeCharacterId)) {
      activeCharacterId = chars[0]?.id || null;
    }
    chars.forEach(char => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'character-panel-item' + (char.id === activeCharacterId ? ' active' : '');
      btn.textContent = char.name;
      btn.addEventListener('click', () => {
        activeCharacterId = char.id;
        renderAll();
      });
      listEl.appendChild(btn);
    });
  }

  function renderDetail() {
    const cat = CHARACTER_CATEGORIES[activeCategory];
    const char = cat.characters.find(c => c.id === activeCharacterId);
    if (!char) {
      detailEl.innerHTML = '<p class="character-detail-empty">请选择人物</p>';
      return;
    }
    const sections = renderCharacterDetailSections(char, CHARACTER_PANEL_DATA, CHARACTER_SCHEMA);
    detailEl.innerHTML = `
      <div class="character-detail-inner">
        <h3 class="character-detail-title">${escapePanelText(char.name)}</h3>
        ${sections || '<p class="character-detail-empty">暂无资料</p>'}
      </div>
    `;
    bindRelationshipLinks();
  }

  function renderAll() {
    renderCategories();
    renderList();
    renderDetail();
  }

  renderAll();
}
