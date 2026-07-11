const EQUIPMENT_TAG_WEAPON = 'weapon';
const EQUIPMENT_TAG_ARMOR = 'armor';

function normalizeModifier(value) {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  const text = String(value).trim();
  const match = text.match(/([+\-]?\d+)/);
  if (match) return Number.parseInt(match[1], 10);
  return 0;
}

function formatModifierDisplay(modifier) {
  const numeric = normalizeModifier(modifier);
  return numeric >= 0 ? `+${numeric}` : `${numeric}`;
}

function isEquipmentItemObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) && typeof value.name === 'string';
}

function parseLegacyWeaponString(text) {
  const raw = String(text || '').trim();
  if (!raw || raw === '无') return null;

  const fullMatch = raw.match(/^(.+?)（(.+?)伤害，([+\-]?\d+)修正值）$/);
  if (fullMatch) {
    return {
      name: fullMatch[1].trim(),
      tag: EQUIPMENT_TAG_WEAPON,
      damage: fullMatch[2].trim(),
      modifier: normalizeModifier(fullMatch[3]),
    };
  }

  const compactMatch = raw.match(/^(.+?)（(.+?)）$/);
  if (compactMatch) {
    const inner = compactMatch[2].trim();
    const damageModMatch = inner.match(/^(\d+d\d+)([+\-]\d+)?$/i);
    if (damageModMatch) {
      return {
        name: compactMatch[1].trim(),
        tag: EQUIPMENT_TAG_WEAPON,
        damage: damageModMatch[1],
        modifier: normalizeModifier(damageModMatch[2] || 0),
      };
    }
  }

  return {
    name: raw,
    tag: EQUIPMENT_TAG_WEAPON,
    damage: '',
    modifier: 0,
  };
}

function parseLegacyArmorString(text) {
  const raw = String(text || '').trim();
  if (!raw || raw === '无') return null;
  const match = raw.match(/^(.+?)（([+\-]?\d+)）$/);
  if (match) {
    return {
      name: match[1].trim(),
      tag: EQUIPMENT_TAG_ARMOR,
      modifier: normalizeModifier(match[2]),
    };
  }
  return {
    name: raw,
    tag: EQUIPMENT_TAG_ARMOR,
    modifier: 0,
  };
}

function normalizeEquipmentItem(value, slot) {
  if (!value) return null;
  if (typeof value === 'string') {
    if (slot === 'mainWeapon') return parseLegacyWeaponString(value);
    return parseLegacyArmorString(value);
  }
  if (!isEquipmentItemObject(value)) return null;

  const item = {
    id: value.id,
    name: value.name,
    tag: value.tag || (slot === 'mainWeapon' ? EQUIPMENT_TAG_WEAPON : EQUIPMENT_TAG_ARMOR),
    modifier: normalizeModifier(value.modifier),
    description: value.description || '',
  };
  if (item.tag === EQUIPMENT_TAG_WEAPON) {
    item.damage = value.damage || '';
  }
  return item;
}

function formatWeaponSlotDisplay(item) {
  const normalized = normalizeEquipmentItem(item, 'mainWeapon');
  if (!normalized?.name) return '';
  const mod = formatModifierDisplay(normalized.modifier);
  if (normalized.damage) {
    return `${normalized.name}（${normalized.damage}伤害，${mod}修正值）`;
  }
  return `${normalized.name}（${mod}修正值）`;
}

function formatArmorSlotDisplay(item) {
  const normalized = normalizeEquipmentItem(item);
  if (!normalized?.name) return '';
  return normalized.name;
}

function formatEquipmentSlotDisplay(slot, item) {
  if (slot === 'mainWeapon') return formatWeaponSlotDisplay(item);
  return formatArmorSlotDisplay(item);
}

function formatDefenseSourcesDisplay(sources) {
  if (!sources) return '';
  if (typeof sources === 'string') return sources;
  if (!Array.isArray(sources)) return '';
  return sources
    .filter(piece => piece?.name)
    .map(piece => `${piece.name}（${formatModifierDisplay(piece.modifier)}）`)
    .join(' + ');
}

function formatEquipmentTagLabel(tag) {
  if (tag === EQUIPMENT_TAG_WEAPON) return '武器';
  if (tag === EQUIPMENT_TAG_ARMOR) return '护甲/防具';
  return '';
}
