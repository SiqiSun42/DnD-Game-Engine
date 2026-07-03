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

function buildChatHistoryEntries(messages) {
  return (messages || []).map((message, index) => {
    const label = message.label || (message.role === 'dm' ? 'DM' : 'Player');
    const preview = `${label}: ${message.text}`;
    return {
      id: `history-${index + 1}`,
      preview,
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
