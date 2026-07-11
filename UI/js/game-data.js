const DATA_ROOT = '../Data';
const UI_DATA_ROOT = 'data';
const TEMPLATE_NAME = '游戏模板';

const GameData = {
  panelSchemas: null,
  settingsUISchema: null,
  settingsGameSchema: null,
  savesIndex: null,
  globalUISettings: null,
  activeSaveName: null,
  activeSaveMeta: null,
  activeSaveData: null,
};

async function fetchJSON(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status}`);
  }
  return response.json();
}

function getLocalSaveKey(saveName) {
  return `dnd-engine/save/${saveName}`;
}

function getLocalSavesIndexKey() {
  return 'dnd-engine/saves-index';
}

function getLocalGlobalSettingsKey() {
  return 'dnd-engine/global-settings';
}

function readLocalJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function writeLocalJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (_) {}
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepMerge(base, override) {
  if (override === null || override === undefined) {
    return deepClone(base);
  }
  if (Array.isArray(base) || Array.isArray(override)) {
    return deepClone(override);
  }
  if (typeof base !== 'object' || typeof override !== 'object') {
    return override;
  }

  const result = deepClone(base);
  Object.keys(override).forEach(key => {
    if (
      key in base &&
      typeof base[key] === 'object' &&
      base[key] !== null &&
      !Array.isArray(base[key]) &&
      typeof override[key] === 'object' &&
      override[key] !== null &&
      !Array.isArray(override[key])
    ) {
      result[key] = deepMerge(base[key], override[key]);
    } else {
      result[key] = deepClone(override[key]);
    }
  });
  return result;
}

function normalizeSaveEntry(save) {
  if (!save) return null;
  const name = String(save.name || save.id || save.folder || '').trim();
  if (!name) return null;
  return {
    name,
    docType: save.docType === 'conversation' ? 'conversation' : 'game',
    pinned: !!save.pinned,
    lastPlayed: save.lastPlayed || 0,
  };
}

function mergeSavesIndex(fileIndex, localIndex) {
  const fileSaves = (fileIndex?.saves || []).map(normalizeSaveEntry).filter(Boolean);
  const localSaves = (localIndex?.saves || []).map(normalizeSaveEntry).filter(Boolean);
  const localByName = new Map(localSaves.map(save => [save.name, save]));
  const merged = [];
  const seen = new Set();

  fileSaves.forEach(fileSave => {
    const localSave = localByName.get(fileSave.name);
    merged.push(localSave ? {
      name: fileSave.name,
      docType: fileSave.docType,
      pinned: localSave.pinned,
      lastPlayed: Math.max(localSave.lastPlayed || 0, fileSave.lastPlayed || 0),
    } : { ...fileSave });
    seen.add(fileSave.name);
  });

  localSaves.forEach(localSave => {
    if (!seen.has(localSave.name)) {
      merged.push({ ...localSave });
    }
  });

  return { saves: merged };
}

function mergeGlobalUISettings(fileSettings, localSettings) {
  return {
    ...(fileSettings || {}),
    ...(localSettings || {}),
  };
}

function applyGlobalUISettings() {
  const settings = GameData.globalUISettings || {};
  if (settings.colorTheme) {
    applyColorTheme(settings.colorTheme);
  }
  if (settings.font) {
    document.documentElement.setAttribute('data-font', settings.font);
  } else {
    document.documentElement.removeAttribute('data-font');
  }
  if (settings.fontSize) {
    document.documentElement.setAttribute('data-font-size', settings.fontSize);
  } else {
    document.documentElement.removeAttribute('data-font-size');
  }
}

function getSaveFolderBase(saveName) {
  return `${DATA_ROOT}/Saves/${encodeURIComponent(saveName)}`;
}

async function initGameData() {
  const [panelSchemas, settingsUISchema, settingsGameSchema, fileIndex, fileUISettings] = await Promise.all([
    fetchJSON(`${UI_DATA_ROOT}/ui-schemas/panels.json`),
    fetchJSON(`${UI_DATA_ROOT}/ui-schemas/settings-ui.json`),
    fetchJSON(`${UI_DATA_ROOT}/ui-schemas/settings-game.json`),
    fetchJSON(`${DATA_ROOT}/saves-index.json`),
    fetchJSON(`${DATA_ROOT}/settings/ui.json`),
  ]);

  GameData.panelSchemas = panelSchemas;
  GameData.settingsUISchema = settingsUISchema;
  GameData.settingsGameSchema = settingsGameSchema;

  const localIndex = readLocalJSON(getLocalSavesIndexKey());
  GameData.savesIndex = mergeSavesIndex(fileIndex, localIndex);
  persistSavesIndex();

  const localUISettings = readLocalJSON(getLocalGlobalSettingsKey());
  GameData.globalUISettings = mergeGlobalUISettings(fileUISettings, localUISettings);
  persistGlobalUISettings();
  applyGlobalUISettings();
}

function getSavesList() {
  return GameData.savesIndex?.saves || [];
}

function persistSavesIndex() {
  writeLocalJSON(getLocalSavesIndexKey(), GameData.savesIndex);
}

function getGlobalUISettings() {
  return GameData.globalUISettings || {};
}

function updateGlobalUISettings(patch) {
  GameData.globalUISettings = {
    ...GameData.globalUISettings,
    ...patch,
  };
  persistGlobalUISettings();
  applyGlobalUISettings();
}

function persistGlobalUISettings() {
  writeLocalJSON(getLocalGlobalSettingsKey(), GameData.globalUISettings);
}

function findSave(saveName) {
  return getSavesList().find(item => item.name === saveName) || null;
}

function updateSaveMeta(saveName, patch) {
  const save = findSave(saveName);
  if (!save) return null;

  if (patch.name && patch.name !== saveName) {
    const localData = readLocalJSON(getLocalSaveKey(saveName));
    if (localData) {
      writeLocalJSON(getLocalSaveKey(patch.name), localData);
      try {
        localStorage.removeItem(getLocalSaveKey(saveName));
      } catch (_) {}
    }
    if (GameData.activeSaveName === saveName) {
      GameData.activeSaveName = patch.name;
    }
  }

  Object.assign(save, patch);
  persistSavesIndex();

  if (GameData.activeSaveName === save.name && GameData.activeSaveMeta) {
    GameData.activeSaveMeta = { ...save };
  }
  return save;
}

async function loadTemplateData() {
  const base = `${UI_DATA_ROOT}/templates/${encodeURIComponent(TEMPLATE_NAME)}`;
  const [chat, inventory, characters, status, world, notes, settingsGame] = await Promise.all([
    fetchJSON(`${base}/chat.json`),
    fetchJSON(`${base}/inventory.json`),
    fetchJSON(`${base}/characters.json`),
    fetchJSON(`${base}/status.json`),
    fetchJSON(`${base}/world.json`),
    fetchJSON(`${base}/notes.json`),
    fetchJSON(`${base}/settings-game.json`),
  ]);
  return { chat, inventory, characters, status, world, notes, settingsGame };
}

async function loadConversationSaveData(saveName) {
  const base = getSaveFolderBase(saveName);
  const chat = await fetchJSON(`${base}/chat.json`);
  return { chat };
}

async function loadSaveDataFromFolder(saveName) {
  const base = getSaveFolderBase(saveName);
  const [chat, inventory, characters, status, world, notes, settingsGame] = await Promise.all([
    fetchJSON(`${base}/chat.json`),
    fetchJSON(`${base}/inventory.json`),
    fetchJSON(`${base}/characters.json`),
    fetchJSON(`${base}/status.json`),
    fetchJSON(`${base}/world.json`),
    fetchJSON(`${base}/notes.json`),
    fetchJSON(`${base}/settings-game.json`),
  ]);
  return { chat, inventory, characters, status, world, notes, settingsGame };
}

async function loadSave(saveName) {
  const saveMeta = findSave(saveName);
  if (!saveMeta) {
    clearActiveSave();
    return null;
  }

  const docType = saveMeta.docType || 'game';
  let fileData = null;

  if (docType === 'conversation') {
    fileData = await loadConversationSaveData(saveMeta.name);
  } else {
    const templateData = await loadTemplateData();
    const saveData = await loadSaveDataFromFolder(saveMeta.name);
    fileData = deepMerge(templateData, saveData);
  }

  const localData = readLocalJSON(getLocalSaveKey(saveName));
  if (localData) {
    fileData = deepMerge(fileData, localData);
  }

  GameData.activeSaveName = saveMeta.name;
  GameData.activeSaveMeta = { ...saveMeta };
  GameData.activeSaveData = fileData;
  return GameData.activeSaveData;
}

function clearActiveSave() {
  GameData.activeSaveName = null;
  GameData.activeSaveMeta = null;
  GameData.activeSaveData = null;
}

function persistActiveSaveData() {
  if (!GameData.activeSaveName || !GameData.activeSaveData) return;
  writeLocalJSON(getLocalSaveKey(GameData.activeSaveName), GameData.activeSaveData);
}

function getActiveSaveData() {
  return GameData.activeSaveData;
}

function getActiveSaveMeta() {
  return GameData.activeSaveMeta;
}

function getPanelSchema(panelId) {
  return GameData.panelSchemas?.[panelId] || null;
}

function getPanelData(panelId) {
  if (!GameData.activeSaveData) return null;
  const map = {
    backpack: GameData.activeSaveData.inventory,
    character: GameData.activeSaveData.characters,
    status: GameData.activeSaveData.status,
    world: GameData.activeSaveData.world,
    notes: GameData.activeSaveData.notes,
  };
  return map[panelId] || null;
}

function getChatMessages() {
  return GameData.activeSaveData?.chat?.messages || [];
}

function getGameSettings() {
  return GameData.activeSaveData?.settingsGame || null;
}

function updateGameSettings(patch) {
  if (!GameData.activeSaveData) return;
  GameData.activeSaveData.settingsGame = {
    ...GameData.activeSaveData.settingsGame,
    ...patch,
  };
  persistActiveSaveData();
}

function appendChatMessage(message) {
  if (!GameData.activeSaveName) return;
  if (!GameData.activeSaveData) {
    GameData.activeSaveData = { chat: { messages: [] } };
  }
  if (!GameData.activeSaveData.chat) {
    GameData.activeSaveData.chat = { messages: [] };
  }
  GameData.activeSaveData.chat.messages.push(message);
  persistActiveSaveData();
}

const QUEST_SYNC_PATTERN = /\[QUEST_SYNC\]\s*([\s\S]*?)\s*\[\/QUEST_SYNC\]/;
const INVENTORY_SYNC_PATTERN = /\[INVENTORY_SYNC\]\s*([\s\S]*?)\s*\[\/INVENTORY_SYNC\]/;
const STATUS_SYNC_PATTERN = /\[STATUS_SYNC\]\s*([\s\S]*?)\s*\[\/STATUS_SYNC\]/i;
const STATUS_SYNC_VARIANT_PATTERN = /(?:\[STATUS_SYNC\]|#{1,6}\s*STATUS_SYNC|(?:^|\n)\s*STATUS_SYNC\s*(?:\n|$))\s*(\{[\s\S]*\})\s*\[\/STATUS_SYNC\]/i;
const STATUS_SYNC_CLOSE_TAG = '[/STATUS_SYNC]';

function findStatusSyncCloseIndex(text) {
  const upper = String(text || '').toUpperCase();
  return upper.lastIndexOf(STATUS_SYNC_CLOSE_TAG.toUpperCase());
}

function findStatusSyncOpenIndex(head) {
  const patterns = [
    /\[STATUS_SYNC\]/ig,
    /#{1,6}\s*STATUS_SYNC\b/ig,
    /(?:^|\n)\s*STATUS_SYNC\s*(?:\n|$)/ig,
  ];
  let best = -1;
  patterns.forEach((pattern) => {
    pattern.lastIndex = 0;
    let match = pattern.exec(head);
    while (match) {
      if (match.index > best) best = match.index;
      match = pattern.exec(head);
    }
  });
  return best;
}

function findOpenMarkerEnd(head, openIdx) {
  const patterns = [
    /\[STATUS_SYNC\]/ig,
    /#{1,6}\s*STATUS_SYNC\b/ig,
    /(?:^|\n)\s*STATUS_SYNC\s*(?:\n|$)/ig,
  ];
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match = pattern.exec(head);
    while (match) {
      if (match.index === openIdx) return match.index + match[0].length;
      match = pattern.exec(head);
    }
  }
  return 0;
}

function extractBalancedJsonRange(text, start, end) {
  const source = String(text || '');
  const jsonStart = source.indexOf('{', start);
  if (jsonStart < 0 || jsonStart >= end) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = jsonStart; index < end; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return [jsonStart, index + 1];
    }
  }
  return null;
}

function extractLooseStatusSyncPayload(text) {
  const closeIdx = findStatusSyncCloseIndex(text);
  if (closeIdx < 0) return null;
  const head = String(text).slice(0, closeIdx);
  const openIdx = findStatusSyncOpenIndex(head);
  const searchFrom = openIdx >= 0 ? findOpenMarkerEnd(head, openIdx) : 0;
  const jsonRange = extractBalancedJsonRange(text, searchFrom, closeIdx);
  if (!jsonRange) return null;
  return String(text).slice(jsonRange[0], jsonRange[1]).trim();
}

function parseStatusSyncPayload(payload) {
  try {
    const parsed = JSON.parse(String(payload || '').trim());
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_) {
    return null;
  }
}

function stripLooseStatusSync(text) {
  const closeIdx = findStatusSyncCloseIndex(text);
  if (closeIdx < 0) return String(text || '');
  const head = String(text).slice(0, closeIdx);
  const openIdx = findStatusSyncOpenIndex(head);
  const searchFrom = openIdx >= 0 ? findOpenMarkerEnd(head, openIdx) : 0;
  const jsonRange = extractBalancedJsonRange(text, searchFrom, closeIdx);
  if (!jsonRange) return String(text || '');
  const stripStart = openIdx >= 0 ? openIdx : jsonRange[0];
  const tail = String(text).slice(closeIdx + STATUS_SYNC_CLOSE_TAG.length);
  return `${String(text).slice(0, stripStart)}${tail}`.trim();
}

const COMBAT_ENTRY_PROMPT = '现在进入战斗！你希望这场战斗如何结束？可输入：**胜利** / **失败** / **逃跑**';

function getCombatEntryPrompt() {
  return COMBAT_ENTRY_PROMPT;
}

function parseQuestSyncPayload(parsed) {
  if (Array.isArray(parsed)) {
    return { currentQuests: parsed.map(item => String(item)) };
  }
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }
  const questSync = {};
  if (Array.isArray(parsed.currentQuests)) {
    questSync.currentQuests = parsed.currentQuests.map(item => String(item));
  }
  if (parsed.historyQuests && Array.isArray(parsed.historyQuests.pages)) {
    questSync.historyQuests = parsed.historyQuests;
  }
  if (!questSync.currentQuests && !questSync.historyQuests) {
    return null;
  }
  return questSync;
}

function extractGameSyncFromDmText(text) {
  let displayText = String(text || '');
  let questSync = null;
  let inventorySync = null;
  let statusSync = null;

  const questMatch = displayText.match(QUEST_SYNC_PATTERN);
  if (questMatch) {
    try {
      questSync = parseQuestSyncPayload(JSON.parse(questMatch[1].trim()));
    } catch (_) {
      questSync = null;
    }
    displayText = displayText.replace(QUEST_SYNC_PATTERN, '').trimEnd();
  }

  const inventoryMatch = displayText.match(INVENTORY_SYNC_PATTERN);
  if (inventoryMatch) {
    try {
      const parsed = JSON.parse(inventoryMatch[1].trim());
      if (parsed && typeof parsed === 'object') {
        inventorySync = parsed;
      }
    } catch (_) {
      inventorySync = null;
    }
    displayText = displayText.replace(INVENTORY_SYNC_PATTERN, '').trimEnd();
  }

  const statusMatch = displayText.match(STATUS_SYNC_PATTERN);
  if (statusMatch) {
    statusSync = parseStatusSyncPayload(statusMatch[1]);
    displayText = displayText.replace(STATUS_SYNC_PATTERN, '').trimEnd();
  } else {
    const variantMatch = displayText.match(STATUS_SYNC_VARIANT_PATTERN);
    if (variantMatch) {
      statusSync = parseStatusSyncPayload(variantMatch[1]);
      displayText = displayText.replace(STATUS_SYNC_VARIANT_PATTERN, '').trimEnd();
    } else {
      const loosePayload = extractLooseStatusSyncPayload(displayText);
      if (loosePayload) {
        statusSync = parseStatusSyncPayload(loosePayload);
        displayText = stripLooseStatusSync(displayText).trimEnd();
      }
    }
  }

  return { displayText, questSync, inventorySync, statusSync };
}

function extractQuestSyncFromDmText(text) {
  const result = extractGameSyncFromDmText(text);
  return {
    displayText: result.displayText,
    quests: result.questSync?.currentQuests || null,
  };
}

function applyQuestSync(questSync) {
  if (!questSync || !GameData.activeSaveData) return false;
  if (!GameData.activeSaveData.notes) {
    GameData.activeSaveData.notes = {};
  }
  if (Array.isArray(questSync.currentQuests)) {
    GameData.activeSaveData.notes.currentQuests = questSync.currentQuests;
  }
  if (questSync.historyQuests && Array.isArray(questSync.historyQuests.pages)) {
    GameData.activeSaveData.notes.historyQuests = questSync.historyQuests;
  }
  persistActiveSaveData();
  return true;
}

function updateCurrentQuests(quests) {
  return applyQuestSync({ currentQuests: quests });
}

function applyInventorySync(inventory) {
  if (!inventory || typeof inventory !== 'object' || !GameData.activeSaveData) return false;
  GameData.activeSaveData.inventory = inventory;
  persistActiveSaveData();
  return true;
}

function mergeStatusCharacterPatch(currentChar, patchChar) {
  const merged = { ...currentChar, ...patchChar };
  for (const key of ['hitPoints', 'defense', 'abilities', 'equipment', 'basics']) {
    if (patchChar[key] && typeof patchChar[key] === 'object' && !Array.isArray(patchChar[key])) {
      merged[key] = { ...(currentChar[key] || {}), ...patchChar[key] };
    }
  }
  if (Array.isArray(patchChar.conditions)) {
    merged.conditions = patchChar.conditions;
  }
  return merged;
}

function mergeStatusCharacterList(currentList, patchList) {
  if (!Array.isArray(patchList)) return currentList;
  if (!Array.isArray(currentList)) return patchList;

  const merged = currentList.map(char => ({ ...char }));
  patchList.forEach(patchChar => {
    if (!patchChar || typeof patchChar !== 'object') return;
    const patchId = patchChar.id;
    let index = patchId ? merged.findIndex(char => char.id === patchId) : -1;
    if (index < 0 && patchChar.name) {
      index = merged.findIndex(char => char.name === patchChar.name);
    }
    if (index < 0) {
      merged.push({ ...patchChar });
      return;
    }
    merged[index] = mergeStatusCharacterPatch(merged[index], patchChar);
  });
  return merged;
}

function mergeStatusEnemyList(currentList, patchList) {
  if (!Array.isArray(patchList)) return currentList;
  if (!Array.isArray(currentList)) return patchList;

  const merged = currentList.map(encounter => ({
    ...encounter,
    members: Array.isArray(encounter.members)
      ? encounter.members.map(member => ({ ...member }))
      : [],
  }));

  patchList.forEach(patchEncounter => {
    if (!patchEncounter || typeof patchEncounter !== 'object') return;
    const patchId = patchEncounter.id;
    if (!patchId) return;
    const index = merged.findIndex(encounter => encounter.id === patchId);
    if (index < 0) {
      merged.push({ ...patchEncounter });
      return;
    }
    const currentEncounter = merged[index];
    const patchMembers = Array.isArray(patchEncounter.members) ? patchEncounter.members : null;
    merged[index] = {
      ...currentEncounter,
      ...patchEncounter,
      members: patchMembers
        ? mergeStatusCharacterList(currentEncounter.members || [], patchMembers)
        : currentEncounter.members,
    };
  });
  return merged;
}

function mergeStatusSync(current, patch) {
  const next = {
    ...(current || {}),
    ...(patch || {}),
  };
  if (Array.isArray(patch?.team)) {
    next.team = mergeStatusCharacterList(current?.team || [], patch.team);
  }
  if (Array.isArray(patch?.enemy)) {
    next.enemy = mergeStatusEnemyList(current?.enemy || [], patch.enemy);
  }
  return next;
}

function applyStatusSync(status) {
  if (!status || typeof status !== 'object' || !GameData.activeSaveData) {
    return { enteredCombat: false, leftCombat: false };
  }
  const prevInCombat = !!GameData.activeSaveData.status?.inCombat;
  GameData.activeSaveData.status = mergeStatusSync(
    GameData.activeSaveData.status,
    status,
  );
  persistActiveSaveData();
  const nextInCombat = !!GameData.activeSaveData.status.inCombat;
  return {
    enteredCombat: !prevInCombat && nextInCombat,
    leftCombat: prevInCombat && !nextInCombat,
  };
}

async function createSaveFromTemplate(name, docType = 'game') {
  const saveName = String(name || '').trim();
  if (!saveName) return null;
  if (findSave(saveName)) return null;

  const type = docType === 'conversation' ? 'conversation' : 'game';
  const saveMeta = {
    name: saveName,
    docType: type,
    pinned: false,
    lastPlayed: Date.now(),
  };

  GameData.savesIndex.saves.push(saveMeta);
  persistSavesIndex();

  const initialData = type === 'conversation'
    ? { chat: { messages: [] } }
    : await loadTemplateData();
  writeLocalJSON(getLocalSaveKey(saveName), initialData);
  return saveMeta;
}

async function duplicateSaveData(sourceName, newName) {
  const source = findSave(sourceName);
  if (!source || findSave(newName)) return null;

  let data = readLocalJSON(getLocalSaveKey(sourceName));

  if (!data) {
    if (source.docType === 'conversation') {
      data = await loadConversationSaveData(source.name);
    } else {
      const templateData = await loadTemplateData();
      const saveData = await loadSaveDataFromFolder(source.name);
      data = deepMerge(templateData, saveData);
    }
  }

  writeLocalJSON(getLocalSaveKey(newName), deepClone(data));
  return deepClone(data);
}

function getSettingsUISchema() {
  return GameData.settingsUISchema;
}

function getSettingsGameSchema() {
  return GameData.settingsGameSchema;
}

function resetConsultChatHistory() {
  const saveName = typeof CONSULT_SAVE_NAME === 'string' ? CONSULT_SAVE_NAME : '咨询城主';
  const defaultMessage = {
    role: 'dm',
    label: 'DM',
    text: '你好，我是城主。有什么规则或冒险相关的问题可以问我。',
  };

  let data = readLocalJSON(getLocalSaveKey(saveName));
  if (!data && GameData.activeSaveName === saveName && GameData.activeSaveData) {
    data = GameData.activeSaveData;
  }

  const messages = data?.chat?.messages || [];
  const firstMessage = messages.length > 0 ? { ...messages[0] } : { ...defaultMessage };
  const nextChat = { messages: [firstMessage] };

  if (data) {
    data.chat = nextChat;
    writeLocalJSON(getLocalSaveKey(saveName), data);
  } else {
    writeLocalJSON(getLocalSaveKey(saveName), { chat: nextChat });
  }

  if (GameData.activeSaveName === saveName && GameData.activeSaveData) {
    GameData.activeSaveData.chat = nextChat;
  }

  return true;
}

function buildChatHistoryEntries(messages) {
  return (messages || []).map((message, index) => {
    const label = message.label || (message.role === 'dm' ? 'DM' : 'Player');
    const text = message.text || '';
    const preview = `${label}: ${text}`;
    return {
      id: `history-${index + 1}`,
      preview,
      label,
      role: message.role,
      text,
      terms: preview.toLowerCase().split(/\s+/).filter(Boolean),
    };
  });
}

function removeSave(saveName) {
  if (!GameData.savesIndex?.saves) return;
  GameData.savesIndex.saves = GameData.savesIndex.saves.filter(item => item.name !== saveName);
  persistSavesIndex();
  try {
    localStorage.removeItem(getLocalSaveKey(saveName));
  } catch (_) {}
  if (GameData.activeSaveName === saveName) {
    GameData.activeSaveName = null;
    GameData.activeSaveMeta = null;
    GameData.activeSaveData = null;
  }
}

function getActiveSaveName() {
  return GameData.activeSaveName;
}

function getSettingsDocType() {
  const meta = getActiveSaveMeta();
  if (meta) {
    return meta.docType === 'conversation' ? 'conversation' : 'game';
  }
  return 'conversation';
}

function isGameDoc() {
  return getSettingsDocType() === 'game';
}
