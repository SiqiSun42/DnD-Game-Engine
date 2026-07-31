const STATUS_BUNDLE_FORMAT = 'bundle';

const STATUS_VISIBLE_TYPES = new Set(['pc', 'ally']);

const EQUIPMENT_SLOT_DEFS = [
  { key: 'main_hand', label: '主手' },
  { key: 'off_hand', label: '副手' },
  { key: 'armor', label: '护甲' },
];

const STATUS_FIELD_LABELS = {
  character_id: '角色ID',
  current_hp: '当前生命值',
  max_hp: '最大生命值',
  temp_hp: '临时生命值',
  base_ac: '基础AC',
  temp_ac: '临时AC',
  race: '种族',
  subrace: '亚种',
  class_name: '职业',
  level: '等级',
  proficiencies: '熟练项',
  proficiency_bonus: '熟练加值',
  traits: '特性',
  modifiers: '属性修正',
};

const STATUS_ATTR_LABELS = {
  strength: '力量',
  dexterity: '敏捷',
  constitution: '体质',
  intelligence: '智力',
  wisdom: '感知',
  charisma: '魅力',
};

const STATUS_SPEED_LABELS = {
  walking: '步行',
  flying: '飞行',
  swimming: '游泳',
  burrowing: '掘穴',
  climbing: '攀爬',
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

function getCharacterEquippedSlotNames(inventoryBundle, characterId) {
  const slots = { main_hand: null, off_hand: null, armor: null };
  if (!inventoryBundle || !characterId) return slots;

  const backpacks = inventoryBundle?.categories?.equipment?.list?.backpacks;
  if (!Array.isArray(backpacks)) return slots;

  const backpack = backpacks.find(entry => entry?.character_id === characterId);
  if (!backpack || !Array.isArray(backpack.inventory)) return slots;

  backpack.inventory.forEach(item => {
    if (!item?.is_equipped || !item.equipped_slot) return;
    if (!Object.prototype.hasOwnProperty.call(slots, item.equipped_slot)) return;
    slots[item.equipped_slot] = item.name || item.item_id || null;
  });

  return slots;
}

function readEquipmentTempSlots(tempData) {
  const slots = { main_hand: null, off_hand: null, armor: null };
  if (!tempData || typeof tempData !== 'object') return slots;

  EQUIPMENT_SLOT_DEFS.forEach(({ key }) => {
    const value = tempData[key];
    if (value !== null && value !== undefined && value !== '') {
      slots[key] = String(value);
    }
  });

  return slots;
}

function buildEquipmentSectionData(equipmentEntry, inventoryBundle) {
  const equipConfig = equipmentEntry?.equipment;
  let slotValues = { main_hand: null, off_hand: null, armor: null };

  if (equipConfig?.inventory) {
    slotValues = getCharacterEquippedSlotNames(inventoryBundle, equipConfig.inventory);
  } else if (equipConfig?.temp) {
    slotValues = readEquipmentTempSlots(equipConfig.temp);
  }

  return EQUIPMENT_SLOT_DEFS.map(({ key, label }) => ({
    label,
    value: slotValues[key] || '无',
  }));
}

function isEmptyStatusValue(value) {
  if (value === null || value === undefined || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

function resolveStatusFieldLabel(key) {
  return STATUS_FIELD_LABELS[key] || STATUS_ATTR_LABELS[key] || STATUS_SPEED_LABELS[key] || key;
}

function formatStatusScalarValue(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (Array.isArray(value)) {
    const items = value.filter(item => !isEmptyStatusValue(item));
    if (!items.length) return '';
    return items.map(item => (typeof item === 'object' ? JSON.stringify(item) : String(item))).join('、');
  }
  if (typeof value === 'object') return '';
  return String(value);
}

function renderStatusDetailParagraph(label, value) {
  const text = formatStatusScalarValue(value);
  if (!text) return '';
  return `<p class="status-detail-line"><span class="status-detail-label">${escapePanelText(label)}：</span>${escapePanelText(text)}</p>`;
}

function getNestedKeyLabelMap(key) {
  if (key === 'modifiers' || key === 'base_attributes') return STATUS_ATTR_LABELS;
  if (key === 'base_speed') return STATUS_SPEED_LABELS;
  return STATUS_FIELD_LABELS;
}

function renderStatusDetailObject(label, obj, keyLabelMap) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return '';
  const lines = Object.entries(obj)
    .filter(([, value]) => !isEmptyStatusValue(value))
    .map(([key, value]) => {
      const fieldLabel = keyLabelMap?.[key] || resolveStatusFieldLabel(key);
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        const nested = renderStatusDetailObject(fieldLabel, value, getNestedKeyLabelMap(key));
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

function renderEquipmentSectionDetail(lines) {
  if (!Array.isArray(lines) || !lines.length) {
    return '<p class="status-detail-empty">暂无资料</p>';
  }
  return lines.map(line => renderStatusDetailParagraph(line.label, line.value)).join('');
}

function renderCurrentSectionDetail(data) {
  if (!data) return '<p class="status-detail-empty">暂无资料</p>';
  return renderStatusDetailParagraph('当前生命值', data.current_hp) || '<p class="status-detail-empty">暂无资料</p>';
}

function renderBasicSectionDetail(data) {
  if (!data) return '<p class="status-detail-empty">暂无资料</p>';
  const parts = [
    renderStatusDetailParagraph('最大生命值', data.max_hp),
    renderStatusDetailParagraph('基础AC', data.base_ac),
    renderStatusDetailObject('属性基础值', data.base_attributes, STATUS_ATTR_LABELS),
    renderStatusDetailObject('速度基础值', data.base_speed, STATUS_SPEED_LABELS),
  ].filter(Boolean);
  return parts.join('') || '<p class="status-detail-empty">暂无资料</p>';
}

function renderRaceSectionDetail(data) {
  if (!data) return '<p class="status-detail-empty">暂无资料</p>';
  const { character_id, ...fields } = data;
  const content = renderStatusDetailObject(null, fields, STATUS_FIELD_LABELS);
  return content || '<p class="status-detail-empty">暂无资料</p>';
}

function renderClassSectionDetail(data) {
  if (!data) return '<p class="status-detail-empty">暂无资料</p>';
  const { character_id, ...fields } = data;
  const content = renderStatusDetailObject(null, fields, STATUS_FIELD_LABELS);
  return content || '<p class="status-detail-empty">暂无资料</p>';
}

function renderTempSectionDetail(data) {
  if (!data) return '<p class="status-detail-empty">暂无资料</p>';
  const parts = [
    renderStatusDetailParagraph('临时生命值', data.temp_hp),
    renderStatusDetailParagraph('临时AC', data.temp_ac),
  ].filter(Boolean);
  return parts.join('') || '<p class="status-detail-empty">暂无资料</p>';
}

function renderStatusSectionDetail(sectionId, sectionData) {
  if (sectionId === 'current') return renderCurrentSectionDetail(sectionData);
  if (sectionId === 'basic') return renderBasicSectionDetail(sectionData);
  if (sectionId === 'race') return renderRaceSectionDetail(sectionData);
  if (sectionId === 'class') return renderClassSectionDetail(sectionData);
  if (sectionId === 'equipment') return renderEquipmentSectionDetail(sectionData);
  if (sectionId === 'temp') return renderTempSectionDetail(sectionData);
  return '<p class="status-detail-empty">暂无资料</p>';
}

function resolveStatusForUi(statusBundle, inventoryBundle) {
  if (!isStatusBundle(statusBundle)) {
    return { characters: [] };
  }

  const list = (statusBundle.list?.statuses || []).filter(entry =>
    STATUS_VISIBLE_TYPES.has(String(entry?.type || '').toLowerCase()),
  );

  const currentById = indexStatusByCharacterId(statusBundle.current?.current_statuses);
  const basicById = indexStatusByCharacterId(statusBundle.basic?.basic_statuses);
  const raceById = indexStatusByCharacterId(statusBundle.race?.racial_modifiers);
  const classById = indexStatusByCharacterId(statusBundle.class?.class_modifiers);
  const equipmentById = indexStatusByCharacterId(statusBundle.equipment?.battle_equipment);
  const tempById = indexStatusByCharacterId(statusBundle.temp?.temp_statuses);

  const characters = list.map(entry => {
    const characterId = entry.character_id;
    return {
      character_id: characterId,
      name: entry.name || characterId,
      type: entry.type,
      sections: {
        current: currentById[characterId] || null,
        basic: basicById[characterId] || null,
        race: raceById[characterId] || null,
        class: classById[characterId] || null,
        equipment: buildEquipmentSectionData(equipmentById[characterId], inventoryBundle),
        temp: tempById[characterId] || null,
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
  const [list, current, basic, race, classDoc, equipment, temp] = await Promise.all([
    fetchJSON(`${statusBase}/list_status.json`).catch(() => ({ statuses: [] })),
    fetchJSON(`${statusBase}/battle_current.json`).catch(() => ({ current_statuses: [] })),
    fetchJSON(`${statusBase}/battle_basic.json`).catch(() => ({ basic_statuses: [] })),
    fetchJSON(`${statusBase}/battle_race.json`).catch(() => ({ racial_modifiers: [] })),
    fetchJSON(`${statusBase}/battle_class.json`).catch(() => ({ class_modifiers: [] })),
    fetchJSON(`${statusBase}/battle_equipment.json`).catch(() => ({ battle_equipment: [] })),
    fetchJSON(`${statusBase}/battle_temp.json`).catch(() => ({ temp_statuses: [] })),
  ]);

  return {
    _format: STATUS_BUNDLE_FORMAT,
    list,
    current,
    basic,
    race,
    class: classDoc,
    equipment,
    temp,
  };
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
