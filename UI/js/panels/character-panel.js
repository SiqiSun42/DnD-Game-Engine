function renderCharacterDetailLines(lines) {
  return lines
    .map(line => `<p class="character-detail-body">${escapePanelText(line)}</p>`)
    .join('');
}

function renderBasicInfoLines(basicInfo) {
  const info = basicInfo || {};
  return BASIC_INFO_FIELDS
    .filter(([key]) => BASIC_INFO_ALWAYS_RENDER_KEYS.has(key) || !isCharacterFieldEmpty(info[key]))
    .map(([key, label]) => `${label}：${formatCharacterDisplayValue(info[key])}`);
}

function renderAlignmentAndPersonalityLines(alignmentAndPersonality) {
  const data = alignmentAndPersonality || {};
  const lines = [];
  const alignment = data.alignment || {};

  lines.push(`阵营标签：${formatCharacterDisplayValue(alignment.alignment_label)}`);
  lines.push(`守序混乱值：${formatCharacterDisplayValue(alignment.law_chaos_value)}`);
  lines.push(`善良邪恶值：${formatCharacterDisplayValue(alignment.good_evil_value)}`);

  const dimensions = data.personality_dimensions || {};
  PERSONALITY_DIMENSION_FIELDS.forEach(([key, label]) => {
    lines.push(`${label}：${formatCharacterDisplayValue(dimensions[key])}`);
  });

  return lines;
}

function renderRelationshipEntry(entry, characters) {
  const lines = [];
  lines.push(`对象：${resolveCharacterDisplayName(entry?.target, characters)}`);
  lines.push(`好感度：${formatCharacterDisplayValue(entry?.affinity)}`);
  lines.push(`关系描述：${formatCharacterDisplayValue(entry?.relationship_description)}`);
  return lines;
}

function renderRelationshipsLines(relationships, characters) {
  const lines = [];
  const partyRelationships = relationships?.party_relationships || [];
  const otherRelationships = relationships?.other_relationships;

  if (partyRelationships.length) {
    lines.push('队友关系');
    partyRelationships.forEach((entry, index) => {
      if (index > 0) lines.push('');
      lines.push(...renderRelationshipEntry(entry, characters));
    });
  } else {
    lines.push('队友关系：无');
  }

  if (otherRelationships != null && otherRelationships.length) {
    lines.push('');
    lines.push('其他关系');
    otherRelationships.forEach((entry, index) => {
      if (index > 0) lines.push('');
      lines.push(...renderRelationshipEntry(entry, characters));
    });
  }

  return lines;
}

function renderBackstoryLines(backstory) {
  const story = backstory || {};
  const lines = [];

  if (story.past_experience != null) {
    lines.push(renderBackstoryFieldText('过去经历', story.past_experience));
  }
  if (story.current_goal != null) {
    lines.push(renderBackstoryFieldText('当前目标', story.current_goal));
  }
  if (story.bond != null) {
    lines.push(renderBackstoryFieldText('牵绊', story.bond, { includeType: true }));
  }
  if (story.hidden_secret != null) {
    lines.push(renderBackstoryFieldText('隐藏秘密', story.hidden_secret, { useSecretEmoji: true }));
  }

  return lines.filter(Boolean);
}

function mountCharacterPanel(container, schema, data) {
  if (!data) {
    mountDefaultPanel(container, { label: '人物' });
    return;
  }

  const characters = data.characters || [];
  let activeCharacterId = characters[0]?.id || null;

  container.innerHTML = `
    <div class="character-panel" id="character-panel">
      <div class="character-panel-col character-panel-names" id="character-names"></div>
      <div class="character-panel-col character-panel-profile" id="character-profile"></div>
      <div class="character-panel-col character-panel-story" id="character-story"></div>
    </div>
  `;

  const namesEl = container.querySelector('#character-names');
  const profileEl = container.querySelector('#character-profile');
  const storyEl = container.querySelector('#character-story');

  function renderNames() {
    namesEl.innerHTML = '';
    if (!characters.length) {
      namesEl.innerHTML = '<p class="character-detail-empty">暂无人物</p>';
      activeCharacterId = null;
      return;
    }
    if (!characters.find(item => item.id === activeCharacterId)) {
      activeCharacterId = characters[0]?.id || null;
    }
    characters.forEach(char => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'character-panel-item' + (char.id === activeCharacterId ? ' active' : '');
      btn.textContent = char.name;
      btn.addEventListener('click', () => {
        activeCharacterId = char.id;
        renderAll();
      });
      namesEl.appendChild(btn);
    });
  }

  function renderProfile(char) {
    profileEl.innerHTML = `
      <div class="character-detail-inner">
        <h3 class="character-detail-title">基础信息</h3>
        ${renderCharacterDetailLines(renderBasicInfoLines(char.basic_info))}
        ${renderCharacterDetailLines(renderAlignmentAndPersonalityLines(char.alignment_and_personality))}
      </div>
    `;
  }

  function renderStory(char) {
    const relationshipLines = renderRelationshipsLines(char.relationships, characters);
    const backstoryLines = renderBackstoryLines(char.backstory);
    const backstorySection = backstoryLines.length
      ? renderCharacterDetailLines(['角色故事', ...backstoryLines])
      : '';
    storyEl.innerHTML = `
      <div class="character-detail-inner">
        <h3 class="character-detail-title">人物关系与背景故事</h3>
        ${renderCharacterDetailLines(relationshipLines)}
        ${backstorySection}
      </div>
    `;
  }

  function renderDetailColumns() {
    const char = characters.find(item => item.id === activeCharacterId);
    if (!char) {
      profileEl.innerHTML = '<p class="character-detail-empty">请选择人物</p>';
      storyEl.innerHTML = '<p class="character-detail-empty">请选择人物</p>';
      return;
    }
    renderProfile(char);
    renderStory(char);
  }

  function renderAll() {
    renderNames();
    renderDetailColumns();
  }

  renderAll();
}
