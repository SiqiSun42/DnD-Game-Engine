const STATUS_SECTIONS = [
  { id: 'current', labelKey: 'current' },
  { id: 'other', labelKey: 'other' },
  { id: 'basic', labelKey: 'basic' },
  { id: 'race', labelKey: 'race' },
  { id: 'class', labelKey: 'class' },
  { id: 'equipment', labelKey: 'equipment' },
];

function mountStatusPanel(container, schema, data) {
  if (!schema || !data) {
    mountDefaultPanel(container, { label: '状态' });
    return;
  }

  const CHARACTERS = data.characters || [];
  const sectionLabels = schema.sectionLabels || {};

  let activeCharacterId = CHARACTERS[0]?.character_id || null;
  let activeSectionId = 'current';

  container.innerHTML = `
    <div class="status-panel" id="status-panel">
      <div class="status-panel-col status-panel-categories" id="status-characters"></div>
      <div class="status-panel-col status-panel-list" id="status-sections"></div>
      <div class="status-panel-col status-panel-detail" id="status-detail"></div>
    </div>
  `;

  const charactersEl = container.querySelector('#status-characters');
  const sectionsEl = container.querySelector('#status-sections');
  const detailEl = container.querySelector('#status-detail');

  function getActiveCharacter() {
    return CHARACTERS.find(item => item.character_id === activeCharacterId) || null;
  }

  function getSectionLabel(section) {
    return sectionLabels[section.labelKey] || section.id;
  }

  function renderCharacters() {
    charactersEl.innerHTML = '';

    if (!CHARACTERS.length) {
      charactersEl.innerHTML = '<p class="status-list-hint">暂无人物</p>';
      return;
    }

    if (!CHARACTERS.find(item => item.character_id === activeCharacterId)) {
      activeCharacterId = CHARACTERS[0]?.character_id || null;
    }

    CHARACTERS.forEach(character => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'status-panel-item' + (character.character_id === activeCharacterId ? ' active' : '');
      btn.textContent = character.name;
      btn.addEventListener('click', () => {
        activeCharacterId = character.character_id;
        renderAll();
      });
      charactersEl.appendChild(btn);
    });
  }

  function renderSections() {
    sectionsEl.innerHTML = '';

    if (!CHARACTERS.length) {
      detailEl.innerHTML = '<p class="status-detail-empty">暂无资料</p>';
      return;
    }

    STATUS_SECTIONS.forEach(section => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'status-panel-item' + (section.id === activeSectionId ? ' active' : '');
      btn.textContent = getSectionLabel(section);
      btn.addEventListener('click', () => {
        activeSectionId = section.id;
        renderSections();
        renderDetail();
      });
      sectionsEl.appendChild(btn);
    });
  }

  function renderDetail() {
    const character = getActiveCharacter();
    if (!character) {
      detailEl.innerHTML = '<p class="status-detail-empty">请选择人物</p>';
      return;
    }

    const sectionData = character.sections?.[activeSectionId] ?? null;
    detailEl.innerHTML = `
      <div class="status-detail-inner">
        ${renderStatusSectionDetail(activeSectionId, sectionData)}
      </div>
    `;
  }

  function renderAll() {
    renderCharacters();
    renderSections();
    renderDetail();
  }

  renderAll();
}
