const CHARACTER_BUNDLE_FORMAT = 'bundle';

const CHARACTER_VISIBLE_IDENTITIES = new Set(['pc', 'ally']);

const BASIC_INFO_FIELDS = [
  ['name', '姓名'],
  ['race', '种族'],
  ['gender', '性别'],
  ['age', '年龄'],
  ['height', '身高'],
  ['weight', '体重'],
  ['class', '职业'],
  ['culture_faith', '文化信仰'],
  ['organization', '组织'],
  ['appearance', '外貌'],
  ['bio', '简介'],
];

const BASIC_INFO_ALWAYS_RENDER_KEYS = new Set(['culture_faith', 'faction']);

const PERSONALITY_DIMENSION_FIELDS = [
  ['dirty_clean', '肮脏/整洁'],
  ['introverted_extroverted', '内向/外向'],
  ['calm_intense', '平静/激烈'],
  ['planning_intuitive', '计划/直觉'],
  ['friendly_mean', '友善/刻薄'],
  ['rational_emotional', '理性/感性'],
];

function isCharacterBundle(characters) {
  return characters?._format === CHARACTER_BUNDLE_FORMAT;
}

function formatCharacterDisplayValue(value) {
  if (value === null || value === undefined || value === '') return '无';
  return String(value);
}

function isCharacterFieldEmpty(value) {
  return value === null || value === undefined || value === '';
}

function findCharacterRecord(allCharacters, characterId) {
  return (allCharacters || []).find(
    item => item?.basic_info?.character_id === characterId,
  ) || null;
}

function buildUiCharacter(entry, record) {
  if (!entry || !record) return null;
  return {
    id: entry.character_id,
    name: entry.name || record.basic_info?.name || entry.character_id,
    identity: entry.identity || '',
    basic_info: record.basic_info || {},
    alignment_and_personality: record.alignment_and_personality || {},
    relationships: record.relationships || {},
    backstory: record.backstory || {},
  };
}

function resolveCharactersForUi(characters) {
  if (!isCharacterBundle(characters)) {
    return { characters: [] };
  }

  const allCharacters = characters.all?.characters || [];
  const index = characters.list?.character_index || [];

  const uiCharacters = index
    .filter(entry => CHARACTER_VISIBLE_IDENTITIES.has(String(entry?.identity || '').toLowerCase()))
    .map(entry => buildUiCharacter(entry, findCharacterRecord(allCharacters, entry.character_id)))
    .filter(Boolean);

  return { characters: uiCharacters };
}

async function hasNewCharacterFormat(basePath) {
  try {
    const response = await fetch(`${basePath}/characters/all_characters.json`);
    return response.ok;
  } catch (_) {
    return false;
  }
}

async function loadCharacterBundle(basePath) {
  const charactersBase = `${basePath}/characters`;
  const [all, list] = await Promise.all([
    fetchJSON(`${charactersBase}/all_characters.json`),
    fetchJSON(`${charactersBase}/list_characters.json`).catch(() => ({ character_index: [] })),
  ]);

  return {
    _format: CHARACTER_BUNDLE_FORMAT,
    all,
    list,
  };
}

async function loadCharacterData(basePath) {
  if (await hasNewCharacterFormat(basePath)) {
    return loadCharacterBundle(basePath);
  }
  try {
    return await fetchJSON(`${basePath}/characters.json`);
  } catch (_) {
    return { party: [], chapter: [] };
  }
}

function resolveCharacterDisplayName(characterId, characters) {
  const found = (characters || []).find(item => item.id === characterId);
  return found?.name || characterId || '无';
}

function formatBackstoryUnlockSuffix(field, useSecretEmoji) {
  if (!useSecretEmoji) return '';
  if (field?.is_condition_met === true) return ' 🔑';
  return ' 🔒';
}

function renderBackstoryFieldText(label, field, options = {}) {
  const { useSecretEmoji = false, includeType = false } = options;
  if (field === null || field === undefined) return null;
  if (typeof field !== 'object') {
    return `${label}：未解锁`;
  }

  if (field.is_unlocked) {
    const content = field.content ?? '';
    const displayContent = content === '' ? '无' : String(content);
    if (includeType && field.type) {
      return `${label}（${field.type}）：${displayContent}`;
    }
    return `${label}：${displayContent}`;
  }

  return `${label}：未解锁${formatBackstoryUnlockSuffix(field, useSecretEmoji)}`;
}
