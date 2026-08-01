const STATUS_BUNDLE_FORMAT = 'bundle';

const STATUS_VISIBLE_TYPES = new Set(['pc', 'ally']);

const EQUIPMENT_SLOT_DEFS = [
  { key: 'main_hand', label: '主手武器' },
  { key: 'off_hand', label: '副手武器' },
  { key: 'armor', label: '护甲' },
];

const WEAPON_EFFECT_KEYS = [
  'type',
  'target_attribute',
  'override_value',
  'bonus_type',
  'bonus_value',
  'damage_dice',
  'damage_type',
];

const STATUS_ATTR_KEYS = [
  'strength',
  'dexterity',
  'constitution',
  'intelligence',
  'wisdom',
  'charisma',
];

const STATUS_ATTR_LABELS = {
  strength: '力量',
  dexterity: '敏捷',
  constitution: '体质',
  intelligence: '智力',
  wisdom: '感知',
  charisma: '魅力',
};

const DURATION_UNIT_LABELS = {
  round: '轮',
  minute: '分钟',
  hour: '小时',
  until_removed: '直至移除',
  instantaneous: '立即',
};

const PROFICIENCY_GROUP_LABELS = {
  armor: '护甲',
  weapons: '武器',
  saves: '豁免',
};

function isStatusBundle(status) {
  return status?._format === STATUS_BUNDLE_FORMAT;
}

function indexStatusByCharacterId(entries) {
  const map = {};
  (entries || []).forEach(entry => {
    const id = entry?.character_id;
    if (!id) return;
    map[id] = entry;
  });
  return map;
}

function indexCatalogById(entries, idKey) {
  const map = {};
  (entries || []).forEach(entry => {
    const id = entry?.[idKey];
    if (!id) return;
    map[String(id).trim()] = entry;
  });
  return map;
}

function buildRaceTraitsById(races) {
  const map = {};
  (races || []).forEach(race => {
    (race.race_traits || []).forEach(trait => {
      const id = trait?.id || trait?.trait_id;
      if (!id) return;
      const key = String(id).trim();
      map[key] = {
        ...trait,
        trait_id: trait.trait_id || trait.id,
      };
    });
  });
  return map;
}

function buildStatusCatalogs(bundle) {
  const races = bundle.allRaces?.races || [];
  return {
    racesById: indexCatalogById(races, 'race_id'),
    traitsById: indexCatalogById(bundle.allTraits?.traits, 'trait_id'),
    raceTraitsById: buildRaceTraitsById(races),
    spellsById: indexCatalogById(bundle.allSpells?.spells, 'spell_id'),
    conditionsById: indexCatalogById(bundle.allConditions?.conditions, 'condition_id'),
    tempBuffsById: indexCatalogById(bundle.allTempBuff?.temp_buff_definitions, 'buff_id'),
    proficenciesById: indexCatalogById(bundle.allProficency?.proficencies, 'proficency_id'),
  };
}

function resolveTraitRef(ref, catalogs) {
  if (ref === null || ref === undefined || ref === '') return null;

  if (typeof ref === 'string') {
    const id = ref.trim();
    return catalogs.traitsById[id] || catalogs.raceTraitsById[id] || null;
  }

  if (typeof ref === 'object') {
    const catalog = String(ref.catalog || ref.source || '').trim().toLowerCase();
    const id = String(ref.id || ref.trait_id || ref.race_trait_id || '').trim();
    if (!id) return null;
    if (catalog === 'races' || catalog === 'race') {
      return catalogs.raceTraitsById[id] || null;
    }
    if (catalog === 'traits' || catalog === 'trait') {
      return catalogs.traitsById[id] || null;
    }
    return catalogs.traitsById[id] || catalogs.raceTraitsById[id] || null;
  }

  return null;
}

function mapTraitRefs(refs, catalogs) {
  return (refs || [])
    .map(ref => resolveTraitRef(ref, catalogs))
    .filter(Boolean);
}

function getNumericOrZero(value) {
  if (value === null || value === undefined || value === '') return 0;
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function computeAbilityModifier(score) {
  return Math.floor((getNumericOrZero(score) - 10) / 2);
}

function buildAttributeColumnDefs() {
  return STATUS_ATTR_KEYS.map(key => ({
    key,
    label: STATUS_ATTR_LABELS[key],
  }));
}

function renderStatusMatrixTable(columnDefs, rows) {
  if (!columnDefs.length || !rows.length) return '';

  const headCells = columnDefs
    .map(col => `<th>${escapePanelText(col.label)}</th>`)
    .join('');
  const bodyRows = rows.map(row => {
    const cells = columnDefs.map(col => {
      const raw = typeof row.getValue === 'function'
        ? row.getValue(col.key)
        : getNumericOrZero(row.values?.[col.key]);
      const display = typeof row.format === 'function' ? row.format(raw, col.key) : String(raw);
      return `<td>${escapePanelText(display)}</td>`;
    }).join('');
    return `<tr><th class="status-stat-row-label">${escapePanelText(row.label)}</th>${cells}</tr>`;
  }).join('');

  return `<table class="status-stat-table"><thead><tr><th class="status-stat-row-label"></th>${headCells}</tr></thead><tbody>${bodyRows}</tbody></table>`;
}

function renderBasicAttributesTable(baseAttributes) {
  const columns = buildAttributeColumnDefs();
  return renderStatusMatrixTable(columns, [
    {
      label: '数值',
      getValue: key => getNumericOrZero(baseAttributes?.[key]),
    },
    {
      label: '修正',
      getValue: key => computeAbilityModifier(baseAttributes?.[key]),
    },
  ]);
}

function renderRaceAttributesTable(modifiers) {
  const columns = buildAttributeColumnDefs();
  return renderStatusMatrixTable(columns, [
    {
      label: '修正',
      getValue: key => getNumericOrZero(modifiers?.[key]),
    },
  ]);
}

function renderCombinedAttributeModifiersTable(attributeModifiers) {
  const columns = buildAttributeColumnDefs();
  return renderStatusMatrixTable(columns, [
    {
      label: '修正',
      getValue: key => getNumericOrZero(attributeModifiers?.[key]),
    },
  ]);
}

function buildAttributeModifierTotals(basicEntry, raceSection) {
  const basicAttrs = basicEntry?.base_attributes || {};
  const raceMods = raceSection?.modifiers || {};
  const totals = {};
  STATUS_ATTR_KEYS.forEach(key => {
    totals[key] = computeAbilityModifier(basicAttrs[key]) + getNumericOrZero(raceMods[key]);
  });
  return totals;
}

function buildCurrentAcFormula(acBase, shieldAc, acBonus) {
  const total = acBase + shieldAc + acBonus;
  const parts = [acBase];
  if (shieldAc) parts.push(shieldAc);
  if (acBonus) parts.push(acBonus);
  if (parts.length === 1) return String(total);
  return `${parts.join(' + ')} = ${total}`;
}

function computeCurrentAcValues(basicEntry, equipmentSection, otherEntry) {
  const baseAc = getNumericOrZero(basicEntry?.base_ac);
  const armorAc = getNumericOrZero(equipmentSection?.armor_ac);
  const shieldAc = getNumericOrZero(equipmentSection?.shield_ac);
  const acBonus = getNumericOrZero(otherEntry?.ac_bonus);

  const maxCandidates = [baseAc, armorAc];
  if (otherEntry?.ac_override !== null && otherEntry?.ac_override !== undefined) {
    maxCandidates.push(getNumericOrZero(otherEntry.ac_override));
  }
  const acBase = Math.max(...maxCandidates);
  const currentAc = acBase + shieldAc + acBonus;

  return {
    current_ac: currentAc,
    current_ac_formula: buildCurrentAcFormula(acBase, shieldAc, acBonus),
    ac_base: acBase,
    shield_ac: shieldAc,
    ac_bonus: acBonus,
  };
}

function buildCurrentSectionData(currentEntry, basicEntry, raceSection, equipmentSection, otherEntry) {
  return {
    ...(currentEntry || {}),
    attribute_modifiers: buildAttributeModifierTotals(basicEntry, raceSection),
    ...computeCurrentAcValues(basicEntry, equipmentSection, otherEntry),
  };
}

function isEmptyStatusValue(value) {
  if (value === null || value === undefined || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

function formatStatusScalarValue(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (Array.isArray(value)) {
    const items = value.filter(item => !isEmptyStatusValue(item));
    if (!items.length) return '';
    return items.map(item => String(item)).join('、');
  }
  if (typeof value === 'object') return '';
  return String(value);
}

function formatDuration(duration) {
  if (!duration || typeof duration !== 'object') return '';
  const { value, unit } = duration;
  const unitLabel = DURATION_UNIT_LABELS[unit] || unit || '';
  if (value === null || value === undefined) return unitLabel;
  return `${value}${unitLabel}`;
}

function formatSpellSlots(slots) {
  if (!Array.isArray(slots) || !slots.length) return '';
  return slots.map(slot => `${slot.level}环：${slot.slots}`).join('、');
}

function hasSpellSlots(slots) {
  return slots !== null && slots !== undefined && Array.isArray(slots) && slots.length > 0;
}

function translateProficiencyValues(key, values) {
  if (!Array.isArray(values)) return values;
  if (key === 'saves') {
    return values.map(id => STATUS_ATTR_LABELS[id] || id);
  }
  return values;
}

function shouldRenderNumericBonus(value) {
  return value !== null && value !== undefined && value !== 0;
}

function renderStatusDetailParagraph(label, value) {
  const text = formatStatusScalarValue(value);
  if (!text) return '';
  return `<p class="status-detail-line"><span class="status-detail-label">${escapePanelText(label)}：</span>${escapePanelText(text)}</p>`;
}

function renderStatusDetailObject(label, obj, keyLabelMap) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return '';
  const lines = Object.entries(obj)
    .filter(([, value]) => !isEmptyStatusValue(value))
    .map(([key, value]) => {
      const fieldLabel = keyLabelMap?.[key] || key;
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        const nestedMap = key === 'modifiers' || key === 'base_attributes' ? STATUS_ATTR_LABELS : keyLabelMap;
        const nested = renderStatusDetailObject(fieldLabel, value, nestedMap);
        return nested || '';
      }
      return renderStatusDetailParagraph(fieldLabel, value);
    })
    .filter(Boolean)
    .join('');

  if (!lines) return '';
  if (!label) return lines;
  return `<div class="status-detail-block"><h4 class="status-detail-subtitle">${escapePanelText(label)}</h4>${lines}</div>`;
}

function renderStatusTextBlock(title, text) {
  if (!text) return '';
  return `<div class="status-detail-block"><h4 class="status-detail-subtitle">${escapePanelText(title)}</h4><p class="status-detail-line">${escapePanelText(text)}</p></div>`;
}

function renderTraitBlocks(traits, title) {
  const items = (traits || []).filter(Boolean);
  if (!items.length) return '';
  const blocks = items.map(trait => {
    const name = trait.name || trait.trait_id || trait.id || '';
    return renderStatusTextBlock(name, trait.description || '');
  }).filter(Boolean).join('');
  if (!blocks) return '';
  if (!title) return blocks;
  return `<div class="status-detail-block"><h4 class="status-detail-subtitle">${escapePanelText(title)}</h4>${blocks}</div>`;
}

function renderSpellBlocks(spells) {
  const items = (spells || []).filter(Boolean);
  if (!items.length) return '';
  return items.map(spell => {
    const title = spell.name || spell.spell_id || '';
    const parts = [
      spell.level !== undefined && spell.level !== null ? `环阶：${spell.level}` : '',
      spell.description || '',
    ].filter(Boolean).join('\n');
    return renderStatusTextBlock(title, parts);
  }).join('');
}

function isEquipmentValuePresent(value) {
  if (value === null || value === undefined || value === '') return false;
  if (Array.isArray(value) && value.length === 0) return false;
  return true;
}

function formatEquipmentFieldValue(value) {
  if (Array.isArray(value)) return value.map(item => String(item)).join('、');
  if (typeof value === 'boolean') return value ? '是' : '否';
  return String(value);
}

function indexEquipmentCatalog(inventoryBundle) {
  const map = {};
  const allItems = inventoryBundle?.categories?.equipment?.all;
  const entries = Array.isArray(allItems) ? allItems : [];
  entries.forEach(item => {
    const id = item?.item_id;
    if (!id) return;
    map[String(id).trim()] = item;
  });
  return map;
}

function getCharacterEquippedSlotItemIds(inventoryBundle, equipConfig) {
  const slots = { main_hand: null, off_hand: null, armor: null };
  if (!equipConfig) return slots;

  if (equipConfig.inventory) {
    const backpacks = inventoryBundle?.categories?.equipment?.list?.backpacks;
    if (!Array.isArray(backpacks)) return slots;
    const backpack = backpacks.find(entry => entry?.character_id === equipConfig.inventory);
    if (!backpack || !Array.isArray(backpack.inventory)) return slots;
    backpack.inventory.forEach(item => {
      if (!item?.is_equipped || !item.equipped_slot) return;
      if (!Object.prototype.hasOwnProperty.call(slots, item.equipped_slot)) return;
      slots[item.equipped_slot] = item.item_id || null;
    });
    return slots;
  }

  if (equipConfig.temp && typeof equipConfig.temp === 'object') {
    EQUIPMENT_SLOT_DEFS.forEach(({ key }) => {
      const value = equipConfig.temp[key];
      if (value !== null && value !== undefined && value !== '') {
        slots[key] = String(value).trim();
      }
    });
  }

  return slots;
}

function resolveEquipmentItem(catalog, itemId) {
  if (!itemId) return null;
  return catalog[String(itemId).trim()] || null;
}

function extractArmorAc(item) {
  if (!item || item.type !== 'armor') return null;
  const effect = (item.effects || []).find(entry =>
    entry?.type === 'override' && entry?.target_attribute === 'ac',
  );
  if (effect?.override_value === null || effect?.override_value === undefined) return null;
  return effect.override_value;
}

function extractShieldAc(item) {
  if (!item || item.type !== 'shield') return null;
  const effect = (item.effects || []).find(entry =>
    entry?.bonus_type === 'shield' || (entry?.type === 'bonus' && entry?.target_attribute === 'ac'),
  );
  if (effect?.bonus_value === null || effect?.bonus_value === undefined) return null;
  return effect.bonus_value;
}

function extractWeaponDetailLines(item) {
  if (!item || item.type !== 'weapon') return [];
  const lines = [];
  const proficiency = item.restrictions?.proficiency_requirement;
  if (isEquipmentValuePresent(proficiency)) {
    lines.push({ label: 'proficiency_requirement', value: formatEquipmentFieldValue(proficiency) });
  }

  const effect = (item.effects || []).find(entry => entry?.type === 'damage') || (item.effects || [])[0];
  if (!effect || typeof effect !== 'object') return lines;

  WEAPON_EFFECT_KEYS.forEach(key => {
    const value = effect[key];
    if (!isEquipmentValuePresent(value)) return;
    lines.push({ label: key, value: formatEquipmentFieldValue(value) });
  });

  return lines;
}

function buildEquipmentSlotDisplay(catalog, slotKey, itemId) {
  const item = resolveEquipmentItem(catalog, itemId);
  const displayName = item?.name || itemId || '无';
  let detailLines = [];

  if (item?.type === 'weapon' && (slotKey === 'main_hand' || slotKey === 'off_hand')) {
    detailLines = extractWeaponDetailLines(item);
  }

  return {
    key: slotKey,
    label: EQUIPMENT_SLOT_DEFS.find(def => def.key === slotKey)?.label || slotKey,
    name: itemId ? displayName : '无',
    detailLines,
  };
}

function buildEquipmentSectionData(equipmentEntry, inventoryBundle) {
  const equipConfig = equipmentEntry?.equipment;
  const catalog = indexEquipmentCatalog(inventoryBundle);
  const slotIds = getCharacterEquippedSlotItemIds(inventoryBundle, equipConfig);

  const mainHandItem = resolveEquipmentItem(catalog, slotIds.main_hand);
  const offHandItem = resolveEquipmentItem(catalog, slotIds.off_hand);
  const armorItem = resolveEquipmentItem(catalog, slotIds.armor);

  const armorAc = extractArmorAc(armorItem);
  const shieldAc = extractShieldAc(offHandItem);

  return {
    armor_ac: armorAc !== null && armorAc !== undefined ? armorAc : 0,
    shield_ac: shieldAc !== null && shieldAc !== undefined ? shieldAc : 0,
    slots: EQUIPMENT_SLOT_DEFS.map(({ key }) => buildEquipmentSlotDisplay(catalog, key, slotIds[key])),
  };
}

function resolveRaceSection(raceEntry, catalogs) {
  if (!raceEntry) return null;
  const raceId = String(raceEntry.race || '').trim().toLowerCase();
  const raceDef = catalogs.racesById[raceId];
  const raceTraits = (raceDef?.race_traits || []).map(item => {
    if (item && typeof item === 'object') {
      const traitId = String(item.trait_id || item.id || '').trim();
      if (traitId) {
        return catalogs.raceTraitsById[traitId] || catalogs.traitsById[traitId] || item;
      }
      return item;
    }
    return resolveTraitRef(item, catalogs);
  }).filter(item => item && (item.name || item.trait_id || item.id || item.description));

  return {
    subrace: raceEntry.subrace,
    size: raceDef?.size,
    modifiers: raceDef?.modifiers,
    race_traits: raceTraits,
  };
}

function resolveClassSection(classEntry, catalogs) {
  if (!classEntry) return null;
  const profId = classEntry.proficiencies?.proficency_id;
  const profDef = profId ? catalogs.proficenciesById[String(profId).trim()] : null;
  const traits = (classEntry.traits || [])
    .map(id => catalogs.traitsById[String(id).trim()])
    .filter(Boolean);
  const spells = (classEntry.spellcasting?.spells || [])
    .map(id => catalogs.spellsById[String(id).trim()])
    .filter(Boolean);

  return {
    class_name: classEntry.class_name,
    level: classEntry.level,
    proficiency_bonus: classEntry.proficiency_bonus,
    skills: classEntry.skills,
    proficiencies: profDef?.proficencies || null,
    traits,
    spellcasting: classEntry.spellcasting
      ? {
          max_spell_slots: classEntry.spellcasting.max_spell_slots,
          spells,
        }
      : null,
  };
}

function resolveOtherSection(otherEntry, catalogs) {
  if (!otherEntry) return null;

  const tempBuffs = (otherEntry.temp_buffs || []).map(buff => {
    const def = catalogs.tempBuffsById[String(buff.buff_id || '').trim()] || {};
    return {
      ...def,
      buff_id: buff.buff_id,
      remaining_duration: buff.remaining_duration,
    };
  }).filter(item => item.buff_id);

  const conditions = (otherEntry.conditions || []).map(item => {
    const def = catalogs.conditionsById[String(item.condition_id || '').trim()] || {};
    return {
      ...def,
      condition_id: item.condition_id,
      remaining_duration: item.remaining_duration,
    };
  }).filter(item => item.condition_id);

  return {
    hp_bonus: otherEntry.hp_bonus,
    ac_bonus: otherEntry.ac_bonus,
    ac_override: otherEntry.ac_override,
    advantage: otherEntry.advantage,
    disadvantage: otherEntry.disadvantage,
    qualified_traits: mapTraitRefs(otherEntry.qualified_traits, catalogs),
    unqualified_traits: mapTraitRefs(otherEntry.unqualified_traits, catalogs),
    temp_buffs: tempBuffs,
    conditions,
  };
}

function renderEquipmentSectionDetail(data) {
  if (!data) return '<p class="status-detail-empty">暂无资料</p>';

  const parts = [
    renderStatusDetailParagraph('armor_ac', data.armor_ac),
    renderStatusDetailParagraph('shield_ac', data.shield_ac),
  ];

  (data.slots || []).forEach(slot => {
    parts.push(renderStatusDetailParagraph(slot.label, slot.name || '无'));
    (slot.detailLines || []).forEach(line => {
      parts.push(renderStatusDetailParagraph(line.label, line.value));
    });
  });

  return parts.filter(Boolean).join('') || '<p class="status-detail-empty">暂无资料</p>';
}

function renderCurrentSectionDetail(data) {
  if (!data) return '<p class="status-detail-empty">暂无资料</p>';
  const parts = [
    renderStatusDetailParagraph('当前生命值', data.current_hp),
    data.current_ac_formula
      ? renderStatusDetailParagraph('当前ac', data.current_ac_formula)
      : renderStatusDetailParagraph('当前ac', data.current_ac),
    hasSpellSlots(data.current_spell_slots)
      ? renderStatusDetailParagraph('法术位', formatSpellSlots(data.current_spell_slots))
      : '',
    `<div class="status-detail-block"><h4 class="status-detail-subtitle">属性修正</h4>${renderCombinedAttributeModifiersTable(data.attribute_modifiers || {})}</div>`,
  ].filter(Boolean);
  return parts.join('') || '<p class="status-detail-empty">暂无资料</p>';
}

function renderBasicSectionDetail(data) {
  if (!data) return '<p class="status-detail-empty">暂无资料</p>';
  const parts = [
    renderStatusDetailParagraph('最大生命值', data.max_hp),
    renderStatusDetailParagraph('基础AC', data.base_ac),
    renderStatusDetailParagraph('基础速度', data.base_speed),
    `<div class="status-detail-block"><h4 class="status-detail-subtitle">属性</h4>${renderBasicAttributesTable(data.base_attributes || {})}</div>`,
  ].filter(Boolean);
  return parts.join('') || '<p class="status-detail-empty">暂无资料</p>';
}

function renderRaceSectionDetail(data) {
  if (!data) return '<p class="status-detail-empty">暂无资料</p>';
  const parts = [
    data.subrace ? renderStatusDetailParagraph('亚种', data.subrace) : '',
    renderStatusDetailParagraph('体型', data.size),
    `<div class="status-detail-block"><h4 class="status-detail-subtitle">属性修正</h4>${renderRaceAttributesTable(data.modifiers)}</div>`,
    renderTraitBlocks(data.race_traits, '种族特性'),
  ].filter(Boolean);
  return parts.join('') || '<p class="status-detail-empty">暂无资料</p>';
}

function renderProficienciesDetail(proficiencies) {
  if (!proficiencies || typeof proficiencies !== 'object') return '';
  const lines = Object.entries(PROFICIENCY_GROUP_LABELS)
    .map(([key, label]) => renderStatusDetailParagraph(
      label,
      translateProficiencyValues(key, proficiencies[key]),
    ))
    .filter(Boolean)
    .join('');
  if (!lines) return '';
  return `<div class="status-detail-block"><h4 class="status-detail-subtitle">熟练项</h4>${lines}</div>`;
}

function renderClassSectionDetail(data) {
  if (!data) return '<p class="status-detail-empty">暂无资料</p>';
  const parts = [
    renderStatusDetailParagraph('职业', data.class_name),
    renderStatusDetailParagraph('等级', data.level),
    renderStatusDetailParagraph('熟练加值', data.proficiency_bonus),
    renderProficienciesDetail(data.proficiencies),
    renderStatusDetailParagraph('技能', data.skills),
    renderTraitBlocks(data.traits, '职业特性'),
  ].filter(Boolean);

  if (data.spellcasting) {
    const spellParts = [
      data.spellcasting.max_spell_slots
        ? renderStatusDetailParagraph('法术位上限', formatSpellSlots(data.spellcasting.max_spell_slots))
        : '',
      renderSpellBlocks(data.spellcasting.spells),
    ].filter(Boolean).join('');
    if (spellParts) {
      parts.push(`<div class="status-detail-block"><h4 class="status-detail-subtitle">施法</h4>${spellParts}</div>`);
    }
  }

  return parts.join('') || '<p class="status-detail-empty">暂无资料</p>';
}

function renderBuffBlocks(buffItems) {
  const items = (buffItems || []).filter(item => item?.buff_id);
  if (!items.length) return '';
  return items.map(item => {
    const title = item.source || item.buff_id;
    const modifierText = (item.modifiers || [])
      .map(mod => `${mod.type || ''}${mod.value !== undefined && mod.value !== null ? ` ${mod.value}` : ''}`.trim())
      .filter(Boolean)
      .join('、');
    const durationText = formatDuration(item.remaining_duration || item.duration);
    const lines = [modifierText, durationText ? `剩余：${durationText}` : ''].filter(Boolean).join('\n');
    return renderStatusTextBlock(title, lines);
  }).join('');
}

function renderConditionBlocks(conditionItems) {
  const items = (conditionItems || []).filter(item => item?.condition_id);
  if (!items.length) return '';
  return items.map(item => {
    const title = item.name || item.condition_id;
    const durationText = formatDuration(item.remaining_duration || item.duration);
    const lines = [item.description || '', durationText ? `剩余：${durationText}` : ''].filter(Boolean).join('\n');
    return renderStatusTextBlock(title, lines);
  }).join('');
}

function renderOtherSectionDetail(data) {
  if (!data) return '<p class="status-detail-empty">暂无资料</p>';
  const parts = [
    shouldRenderNumericBonus(data.hp_bonus) ? renderStatusDetailParagraph('生命值加值', data.hp_bonus) : '',
    shouldRenderNumericBonus(data.ac_bonus) ? renderStatusDetailParagraph('AC加值', data.ac_bonus) : '',
    shouldRenderNumericBonus(data.ac_override)
      ? renderStatusDetailParagraph('ac_override', data.ac_override)
      : '',
    !isEmptyStatusValue(data.advantage) ? renderStatusDetailParagraph('优势', data.advantage) : '',
    !isEmptyStatusValue(data.disadvantage) ? renderStatusDetailParagraph('劣势', data.disadvantage) : '',
    renderTraitBlocks(data.qualified_traits, '已生效特性'),
    renderTraitBlocks(data.unqualified_traits, '未生效特性'),
    data.temp_buffs?.length ? `<div class="status-detail-block"><h4 class="status-detail-subtitle">临时增益</h4>${renderBuffBlocks(data.temp_buffs)}</div>` : '',
    data.conditions?.length ? `<div class="status-detail-block"><h4 class="status-detail-subtitle">状态异常</h4>${renderConditionBlocks(data.conditions)}</div>` : '',
  ].filter(Boolean);
  return parts.join('') || '<p class="status-detail-empty">暂无资料</p>';
}

function renderStatusSectionDetail(sectionId, sectionData) {
  if (sectionId === 'current') return renderCurrentSectionDetail(sectionData);
  if (sectionId === 'basic') return renderBasicSectionDetail(sectionData);
  if (sectionId === 'race') return renderRaceSectionDetail(sectionData);
  if (sectionId === 'class') return renderClassSectionDetail(sectionData);
  if (sectionId === 'equipment') return renderEquipmentSectionDetail(sectionData);
  if (sectionId === 'other') return renderOtherSectionDetail(sectionData);
  return '<p class="status-detail-empty">暂无资料</p>';
}

function resolveStatusForUi(statusBundle, inventoryBundle) {
  if (!isStatusBundle(statusBundle)) {
    return { characters: [] };
  }

  const catalogs = buildStatusCatalogs(statusBundle);
  const list = (statusBundle.list?.statuses || []).filter(entry =>
    STATUS_VISIBLE_TYPES.has(String(entry?.type || '').toLowerCase()),
  );

  const currentById = indexStatusByCharacterId(statusBundle.current?.current_statuses);
  const basicById = indexStatusByCharacterId(statusBundle.basic?.basic_statuses);
  const raceById = indexStatusByCharacterId(statusBundle.race?.racial_modifiers);
  const classById = indexStatusByCharacterId(statusBundle.class?.class_modifiers);
  const equipmentById = indexStatusByCharacterId(statusBundle.equipment?.battle_equipment);
  const otherById = indexStatusByCharacterId(statusBundle.other?.other_statuses);

  const characters = list.map(entry => {
    const characterId = entry.character_id;
    const raceSection = resolveRaceSection(raceById[characterId], catalogs);
    const basicEntry = basicById[characterId] || null;
    const otherEntry = otherById[characterId] || null;
    const equipmentSection = buildEquipmentSectionData(equipmentById[characterId], inventoryBundle);
    return {
      character_id: characterId,
      name: entry.name || characterId,
      type: entry.type,
      sections: {
        current: buildCurrentSectionData(
          currentById[characterId],
          basicEntry,
          raceSection,
          equipmentSection,
          otherEntry,
        ),
        basic: basicEntry,
        race: raceSection,
        class: resolveClassSection(classById[characterId], catalogs),
        equipment: equipmentSection,
        other: resolveOtherSection(otherEntry, catalogs),
      },
    };
  });

  return { characters };
}

async function hasStatusBundle(basePath) {
  try {
    const response = await fetch(`${basePath}/status/list_status.json`);
    return response.ok;
  } catch (_) {
    return false;
  }
}

async function loadStatusBundle(basePath) {
  const statusBase = `${basePath}/status`;
  const [
    list,
    current,
    basic,
    race,
    classDoc,
    equipment,
    other,
    allRaces,
    allTraits,
    allSpells,
    allConditions,
    allTempBuff,
    allProficency,
  ] = await Promise.all([
    fetchJSON(`${statusBase}/list_status.json`).catch(() => ({ statuses: [] })),
    fetchJSON(`${statusBase}/battle_current.json`).catch(() => ({ current_statuses: [] })),
    fetchJSON(`${statusBase}/battle_basic.json`).catch(() => ({ basic_statuses: [] })),
    fetchJSON(`${statusBase}/battle_race.json`).catch(() => ({ racial_modifiers: [] })),
    fetchJSON(`${statusBase}/battle_class.json`).catch(() => ({ class_modifiers: [] })),
    fetchJSON(`${statusBase}/battle_equipment.json`).catch(() => ({ battle_equipment: [] })),
    fetchJSON(`${statusBase}/battle_other.json`).catch(() => ({ other_statuses: [] })),
    fetchJSON(`${statusBase}/all_races.json`).catch(() => ({ races: [] })),
    fetchJSON(`${statusBase}/all_traits.json`).catch(() => ({ traits: [] })),
    fetchJSON(`${statusBase}/all_spells.json`).catch(() => ({ spells: [] })),
    fetchJSON(`${statusBase}/all_conditions.json`).catch(() => ({ conditions: [] })),
    fetchJSON(`${statusBase}/all_temp_buff.json`).catch(() => ({ temp_buff_definitions: [] })),
    fetchJSON(`${statusBase}/all_proficency.json`).catch(() => ({ proficencies: [] })),
  ]);

  return {
    _format: STATUS_BUNDLE_FORMAT,
    list,
    current,
    basic,
    race,
    class: classDoc,
    equipment,
    other,
    allRaces,
    allTraits,
    allSpells,
    allConditions,
    allTempBuff,
    allProficency,
  };
}

function getPcCharacterId(statusBundle) {
  if (!isStatusBundle(statusBundle)) return null;
  const pc = (statusBundle.list?.statuses || []).find(entry =>
    String(entry?.type || '').toLowerCase() === 'pc',
  );
  return pc?.character_id || null;
}

function getPcStrength(statusBundle) {
  if (!isStatusBundle(statusBundle)) return null;
  const characterId = getPcCharacterId(statusBundle);
  if (!characterId) return null;
  const basicById = indexStatusByCharacterId(statusBundle.basic?.basic_statuses);
  const strength = basicById[characterId]?.base_attributes?.strength;
  if (strength === null || strength === undefined || strength === '') return null;
  const num = Number(strength);
  return Number.isFinite(num) ? num : null;
}

async function loadStatusData(basePath) {
  if (await hasStatusBundle(basePath)) {
    return loadStatusBundle(basePath);
  }
  try {
    return await fetchJSON(`${basePath}/status.json`);
  } catch (_) {
    return null;
  }
}
