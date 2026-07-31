const INVENTORY_BUNDLE_FORMAT = 'bundle';

const INVENTORY_CATEGORY_DIRS = [
  'consumables',
  'tools',
  'equipment',
  'quest_items',
  'valuables',
  'adventuring_gear',
  'currency',
];

const UI_BACKPACK_CATEGORY_SOURCES = {
  consumables: ['consumables'],
  tools: ['tools'],
  equipment: ['equipment'],
  valuables: ['valuables'],
  adventuring_gear: ['adventuring_gear'],
  quest_items: ['quest_items'],
};

function isInventoryBundle(inventory) {
  return inventory?._format === INVENTORY_BUNDLE_FORMAT;
}

function findPcBackpack(listDoc) {
  const backpacks = listDoc?.backpacks;
  if (!Array.isArray(backpacks)) return null;
  return backpacks.find(entry => String(entry?.identity || '').toLowerCase() === 'pc') || null;
}

function getPcInventoryEntries(listDoc) {
  const backpack = findPcBackpack(listDoc);
  if (!Array.isArray(backpack?.inventory)) return [];
  return backpack.inventory.filter(entry => {
    if (!entry || !entry.item_id) return false;
    const quantity = Number(entry.quantity);
    return Number.isFinite(quantity) ? quantity > 0 : true;
  });
}

function normalizeAllItemsCatalog(allItems) {
  if (!allItems) return [];
  if (Array.isArray(allItems)) return allItems;
  if (typeof allItems === 'object' && allItems.item_id) return [allItems];
  if (typeof allItems === 'object') {
    return Object.values(allItems).filter(item => item && typeof item === 'object');
  }
  return [];
}

function indexAllItemsById(allItems) {
  const map = new Map();
  normalizeAllItemsCatalog(allItems).forEach(item => {
    if (item?.item_id) map.set(item.item_id, item);
  });
  return map;
}

function extractEquipmentDisplay(allItem) {
  if (!allItem || allItem.category !== 'equipment') return {};
  const type = String(allItem.type || '').toLowerCase();
  const tag = type === 'weapon'
    ? EQUIPMENT_TAG_WEAPON
    : (type === 'armor' ? EQUIPMENT_TAG_ARMOR : type);
  let damage = '';
  let modifier = 0;

  (allItem.effects || []).forEach(effect => {
    if (!effect || typeof effect !== 'object') return;
    if (effect.type === 'damage' && effect.damage_dice) {
      damage = String(effect.damage_dice);
    }
    if (effect.bonus_value !== undefined && effect.bonus_value !== null && effect.bonus_value !== '') {
      modifier = normalizeModifier(effect.bonus_value);
    }
  });

  return { tag, damage, modifier };
}

function formatEffectNumericValue(dice, fixedValue) {
  const dicePart = dice !== null && dice !== undefined && String(dice).trim()
    ? String(dice).trim()
    : '';
  let fixedPart = '';
  if (fixedValue !== null && fixedValue !== undefined && fixedValue !== '') {
    const fixedNum = Number(fixedValue);
    if (Number.isFinite(fixedNum) && fixedNum !== 0) {
      fixedPart = fixedNum >= 0 ? `+${fixedNum}` : String(fixedNum);
    }
  }
  if (dicePart && fixedPart) return `${dicePart}${fixedPart}`;
  if (dicePart) return dicePart;
  if (fixedPart) return fixedPart;
  return null;
}

function parseItemWeightNumber(weight) {
  if (weight === null || weight === undefined || weight === '') return 0;
  const num = Number(weight);
  return Number.isFinite(num) ? num : 0;
}

function formatWeightLbDisplay(num) {
  if (!Number.isFinite(num)) return '0';
  const rounded = Math.round(num * 1000) / 1000;
  if (Number.isInteger(rounded) || rounded === Math.trunc(rounded)) return String(Math.trunc(rounded));
  return String(rounded).replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
}

function formatGoldGpDisplay(total) {
  if (!Number.isFinite(total)) return '0';
  const rounded = Math.round(total * 100) / 100;
  if (rounded === 0) return '0';
  if (Number.isInteger(rounded) || rounded === Math.trunc(rounded)) return String(Math.trunc(rounded));
  return String(rounded).replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
}

function formatExchangeRateDisplay(rate) {
  if (!Number.isFinite(rate)) return '';
  if (Number.isInteger(rate) || rate === Math.trunc(rate)) return String(Math.trunc(rate));
  return String(rate);
}

const BACKPACK_ITEM_CATEGORY_DIRS = Object.values(UI_BACKPACK_CATEGORY_SOURCES).flat();

function findAllItemForListEntry(allItems, listEntry) {
  const catalog = normalizeAllItemsCatalog(allItems);
  if (listEntry?.item_id) {
    const byId = catalog.find(item => item.item_id === listEntry.item_id);
    if (byId) return byId;
  }
  if (listEntry?.name) {
    return catalog.find(item => item.name === listEntry.name) || null;
  }
  return null;
}

function computePcTotalWeightLb(bundleCategories) {
  let totalMilliLb = 0;
  BACKPACK_ITEM_CATEGORY_DIRS.forEach(dir => {
    const category = bundleCategories?.[dir];
    if (!category) return;
    getPcInventoryEntries(category.list).forEach(listEntry => {
      const quantity = Number(listEntry.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) return;
      const allItem = findAllItemForListEntry(category.all, listEntry);
      const weightMilliLb = Math.round(parseItemWeightNumber(allItem?.weight) * 1000);
      totalMilliLb += weightMilliLb * quantity;
    });
  });
  return totalMilliLb / 1000;
}

function buildCurrencyStatusData(bundleCategories) {
  const currency = bundleCategories?.currency;
  if (!currency) return { totalGoldGp: 0, rows: [] };

  const entries = getPcInventoryEntries(currency.list);
  const rows = [];
  let totalGoldMilli = 0;

  entries.forEach(entry => {
    const quantity = Number(entry.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) return;
    const allItem = findAllItemForListEntry(currency.all, entry);
    const rate = Number(allItem?.exchange_rate);
    if (Number.isFinite(rate)) {
      totalGoldMilli += Math.round(quantity * rate * 100);
    }
    rows.push({
      name: entry.name || allItem?.name || entry.item_id,
      quantity,
      exchangeRate: formatExchangeRateDisplay(rate),
      description: allItem?.description || '',
    });
  });

  return { totalGoldGp: totalGoldMilli / 100, rows };
}

function getInventoryBundleCategories(inventory) {
  if (isInventoryBundle(inventory)) {
    return inventory.categories || {};
  }
  return {};
}

function resolveInventoryDerived(inventory) {
  const bundleCategories = getInventoryBundleCategories(inventory);
  const currentWeightLb = computePcTotalWeightLb(bundleCategories);
  const currencyData = buildCurrencyStatusData(bundleCategories);

  return {
    currentWeightLb,
    totalGoldGp: currencyData.totalGoldGp,
    maxWeightLb: 100,
    encumbranceStatusLabel: '正常',
    currencyRows: currencyData.rows,
  };
}

function buildCurrentStatusItems(derived) {
  const stats = derived || resolveInventoryDerived(null);

  return [
    {
      id: 'encumbrance',
      name: '负重',
      statusType: 'encumbrance',
      maxWeightLb: stats.maxWeightLb,
      currentWeightLb: stats.currentWeightLb,
      statusLabel: stats.encumbranceStatusLabel,
    },
    {
      id: 'currency',
      name: '金钱',
      statusType: 'currency',
      totalGoldGp: stats.totalGoldGp,
      currencyRows: stats.currencyRows || [],
    },
  ];
}

function parseDisplayWeight(weight) {
  if (weight === null || weight === undefined || weight === '') return null;
  const num = Number(weight);
  if (!Number.isFinite(num) || num === 0) return null;
  return Number.isInteger(num) ? String(num) : String(num);
}

function parseDisplayReferencePrice(priceField) {
  const basePrice = priceField && typeof priceField === 'object'
    ? priceField.base_price
    : priceField;
  if (basePrice === null || basePrice === undefined || basePrice === '') return null;
  const num = Number(basePrice);
  if (!Number.isFinite(num) || num === 0) return null;
  if (Number.isInteger(num) || num === Math.trunc(num)) return String(Math.trunc(num));
  return String(num);
}

function parseToolRechargeCost(rechargeCost) {
  if (rechargeCost === null || rechargeCost === undefined) return null;
  if (typeof rechargeCost !== 'object') return null;

  const result = {};
  const rechargePriceGp = parseDisplayReferencePrice(rechargeCost);
  if (rechargePriceGp !== null) result.rechargePriceGp = rechargePriceGp;

  const condition = rechargeCost.recharge_condition;
  if (condition !== null && condition !== undefined && condition !== '') {
    result.rechargeCondition = String(condition);
  }

  if (!result.rechargePriceGp && !result.rechargeCondition) return null;
  return result;
}

function parseDisplayRarity(rarity) {
  if (rarity === null || rarity === undefined || rarity === '') return null;
  if (String(rarity).toLowerCase() === 'common') return null;
  return String(rarity);
}

function isEffectValuePresent(value) {
  return value !== null && value !== undefined && value !== '';
}

function isEffectDurationPresent(duration) {
  if (duration === null || duration === undefined || duration === '') return false;
  const num = Number(duration);
  if (Number.isFinite(num) && num === 0) return false;
  return true;
}

function formatEffectFieldLines(effect) {
  const lines = [];
  if (!effect || typeof effect !== 'object') return lines;

  if (isEffectValuePresent(effect.type)) {
    lines.push(`效果类型：${effect.type}`);
  }
  if (isEffectValuePresent(effect.target_attribute)) {
    lines.push(`目标属性：${effect.target_attribute}`);
  }

  const numericValue = formatEffectNumericValue(effect.dice, effect.fixed_value);
  if (numericValue) {
    lines.push(`数值：${numericValue}`);
  }
  if (isEffectValuePresent(effect.range)) {
    lines.push(`距离（ft）：${effect.range}`);
  }
  if (effect.time && typeof effect.time === 'object' && isEffectDurationPresent(effect.time.duration)) {
    lines.push(`持续时间(min)：${effect.time.duration}`);
  }

  const handledKeys = new Set([
    'type',
    'target_attribute',
    'dice',
    'fixed_value',
    'range',
    'time',
    'description',
  ]);

  Object.entries(effect).forEach(([key, value]) => {
    if (handledKeys.has(key) || !isEffectValuePresent(value)) return;
    if (typeof value === 'boolean' && value === false) return;
    if (typeof value === 'object') {
      lines.push(`${key}：${JSON.stringify(value)}`);
      return;
    }
    lines.push(`${key}：${value}`);
  });

  return lines;
}

function isEquipmentFieldPresent(value) {
  if (value === null || value === undefined || value === '') return false;
  if (Array.isArray(value) && value.length === 0) return false;
  if (typeof value === 'number' && Number.isFinite(value) && value === 0) return false;
  return true;
}

function formatEquipmentFieldValue(value) {
  if (Array.isArray(value)) return value.map(item => String(item)).join('、');
  if (typeof value === 'boolean') return value ? '是' : '否';
  return String(value);
}

const EQUIPMENT_EFFECT_FIELDS = [
  ['type', '效果类型'],
  ['target_attribute', '作用对象'],
  ['override_value', '覆写值'],
  ['bonus_type', '加值类型'],
  ['bonus_value', '加值'],
  ['damage_dice', '伤害骰'],
  ['damage_type', '伤害类型'],
  ['weapon_properties', '武器属性'],
  ['dex_cap', '敏捷上限'],
  ['special', '特殊'],
];

const EQUIPMENT_RESTRICTION_FIELDS = [
  ['proficiency_requirement', '熟练要求'],
  ['strength_requirement', '力量需求'],
  ['extra_conditions', '额外条件'],
];

function extractEquipmentEffectFieldLines(effect) {
  if (!effect || typeof effect !== 'object') return [];
  return EQUIPMENT_EFFECT_FIELDS
    .map(([key, label]) => {
      const value = effect[key];
      if (!isEquipmentFieldPresent(value)) return null;
      if (typeof value === 'boolean' && value === false) return null;
      return `${label}：${formatEquipmentFieldValue(value)}`;
    })
    .filter(Boolean);
}

function extractEquipmentEffectLines(allItem) {
  if (!allItem || allItem.category !== 'equipment') return [];
  return (allItem.effects || [])
    .filter(effect => effect && typeof effect === 'object')
    .flatMap(effect => extractEquipmentEffectFieldLines(effect));
}

function extractEquipmentRestrictionLines(allItem) {
  if (!allItem || allItem.category !== 'equipment') return [];
  const restrictions = allItem.restrictions;
  if (!restrictions || typeof restrictions !== 'object') return [];
  return EQUIPMENT_RESTRICTION_FIELDS
    .map(([key, label]) => {
      const value = restrictions[key];
      if (!isEquipmentFieldPresent(value)) return null;
      if (typeof value === 'boolean' && value === false) return null;
      return `${label}：${formatEquipmentFieldValue(value)}`;
    })
    .filter(Boolean);
}

function extractItemEffectLines(allItem) {
  if (!Array.isArray(allItem?.effects)) return [];
  return allItem.effects
    .filter(effect => effect && typeof effect === 'object')
    .flatMap(effect => formatEffectFieldLines(effect));
}

function buildUiInventoryItem(listEntry, allItem, sourceCategory) {
  const itemId = listEntry.item_id;
  const name = listEntry.name || allItem?.name || itemId;
  const quantity = Number(listEntry.quantity);
  const uiItem = {
    id: itemId,
    name,
    quantity: Number.isFinite(quantity) ? quantity : 1,
    sourceCategory: sourceCategory || '',
  };

  if (sourceCategory === 'quest_items') {
    uiItem.description = allItem?.description || listEntry.description || '';
    if (allItem?.content !== null && allItem?.content !== undefined) {
      uiItem.content = allItem.content;
    }
    if (allItem?.task_hint !== null && allItem?.task_hint !== undefined) {
      uiItem.taskHint = allItem.task_hint;
    }
    const weightLb = parseDisplayWeight(allItem?.weight);
    if (weightLb !== null) uiItem.weightLb = weightLb;
    return uiItem;
  }

  uiItem.description = allItem?.description || listEntry.description || '';

  Object.assign(uiItem, extractEquipmentDisplay(allItem));

  if (sourceCategory === 'tools') {
    const maxCharges = allItem?.max_charges;
    if (maxCharges !== undefined && maxCharges !== null) {
      uiItem.maxCharges = maxCharges;
      if (listEntry.remaining_charges !== undefined && listEntry.remaining_charges !== null) {
        uiItem.remainingCharges = listEntry.remaining_charges;
      }
    }
    const rechargeCost = parseToolRechargeCost(allItem?.recharge_cost);
    if (rechargeCost?.rechargePriceGp) uiItem.rechargePriceGp = rechargeCost.rechargePriceGp;
    if (rechargeCost?.rechargeCondition) uiItem.rechargeCondition = rechargeCost.rechargeCondition;
  }

  if (listEntry.is_equipped) {
    uiItem.isEquipped = true;
    if (listEntry.equipped_slot) uiItem.equippedSlot = listEntry.equipped_slot;
  }

  if (sourceCategory === 'equipment' && allItem) {
    const availableSlots = formatEquipmentAvailableSlots(allItem.equipment_slots);
    if (availableSlots) uiItem.equipmentAvailableSlots = availableSlots;

    if (listEntry.is_equipped) {
      const usedSlots = resolveEquipmentUsedSlots(allItem.equipment_slots, listEntry.equipped_slot);
      if (usedSlots) {
        uiItem.equipmentUsedSlots = usedSlots;
        const listBadge = formatEquipmentEquippedListBadge(usedSlots);
        if (listBadge) uiItem.equipmentListBadge = listBadge;
      }
    }

    const equipmentEffectLines = extractEquipmentEffectLines(allItem);
    if (equipmentEffectLines.length) uiItem.equipmentEffectLines = equipmentEffectLines;
    const equipmentRestrictionLines = extractEquipmentRestrictionLines(allItem);
    if (equipmentRestrictionLines.length) uiItem.equipmentRestrictionLines = equipmentRestrictionLines;
  }

  const weightLb = parseDisplayWeight(allItem?.weight);
  if (weightLb !== null) uiItem.weightLb = weightLb;

  const referencePriceGp = parseDisplayReferencePrice(allItem?.price);
  if (referencePriceGp !== null) uiItem.referencePriceGp = referencePriceGp;

  const rarity = parseDisplayRarity(allItem?.rarity);
  if (rarity !== null) uiItem.rarity = rarity;

  if (sourceCategory === 'consumables' || sourceCategory === 'tools') {
    const itemEffectLines = extractItemEffectLines(allItem);
    if (itemEffectLines.length) uiItem.itemEffectLines = itemEffectLines;
  }

  return uiItem;
}

function collectCategoryItems(sourceDirs, bundleCategories) {
  const items = [];
  const seen = new Set();

  sourceDirs.forEach(dir => {
    const category = bundleCategories?.[dir];
    if (!category) return;

    const allById = indexAllItemsById(category.all);
    getPcInventoryEntries(category.list).forEach(listEntry => {
      const itemId = listEntry.item_id;
      if (!itemId || seen.has(itemId)) return;
      seen.add(itemId);
      items.push(buildUiInventoryItem(listEntry, findAllItemForListEntry(category.all, listEntry), dir));
    });
  });

  return items;
}

function formatWealthFromCurrency(bundleCategories) {
  const currency = bundleCategories?.currency;
  if (!currency) return '';

  const allById = indexAllItemsById(currency.all);
  const entries = getPcInventoryEntries(currency.list);
  if (!entries.length) return '';

  let totalGold = 0;
  entries.forEach(entry => {
    const quantity = Number(entry.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) return;
    const rate = Number(allById.get(entry.item_id)?.exchange_rate);
    if (Number.isFinite(rate)) {
      totalGold += quantity * rate;
    }
  });

  if (totalGold > 0) {
    if (Number.isInteger(totalGold)) return `${totalGold}g`;
    return `${totalGold.toFixed(2).replace(/\.?0+$/, '')}g`;
  }

  return entries
    .map(entry => `${entry.quantity}${entry.name || entry.item_id}`)
    .join(' ');
}

function resolveInventoryForUi(inventory) {
  const derived = resolveInventoryDerived(inventory);

  if (!isInventoryBundle(inventory)) {
    const categories = { ...(inventory?.categories || {}) };
    categories.backpack_status = buildCurrentStatusItems(derived);
    return { categories, _derived: derived };
  }

  const bundleCategories = inventory.categories || {};
  const categories = {};

  Object.entries(UI_BACKPACK_CATEGORY_SOURCES).forEach(([uiCategoryId, sourceDirs]) => {
    categories[uiCategoryId] = collectCategoryItems(sourceDirs, bundleCategories);
  });

  categories.backpack_status = buildCurrentStatusItems(derived);

  return { categories, _derived: derived };
}

async function hasNewInventoryFormat(basePath) {
  try {
    const response = await fetch(`${basePath}/inventory/all_inventory.json`);
    return response.ok;
  } catch (_) {
    return false;
  }
}

async function loadInventoryBundle(basePath) {
  const inventoryBase = `${basePath}/inventory`;
  const loads = [
    fetchJSON(`${inventoryBase}/all_inventory.json`).then(allInventory => ({ allInventory })),
  ];

  INVENTORY_CATEGORY_DIRS.forEach(dir => {
    loads.push(
      fetchJSON(`${inventoryBase}/${dir}/all_${dir}.json`)
        .then(all => ({ dir, all }))
        .catch(() => ({ dir, all: [] })),
      fetchJSON(`${inventoryBase}/${dir}/list_${dir}.json`)
        .then(list => ({ dir, list }))
        .catch(() => ({ dir, list: { backpacks: [], stocks: [] } })),
    );
  });

  const results = await Promise.all(loads);
  const bundle = {
    _format: INVENTORY_BUNDLE_FORMAT,
    allInventory: null,
    categories: {},
  };

  results.forEach(result => {
    if (result.allInventory !== undefined) {
      bundle.allInventory = result.allInventory;
      return;
    }
    if (!result.dir) return;
    if (!bundle.categories[result.dir]) {
      bundle.categories[result.dir] = { all: [], list: { backpacks: [], stocks: [] } };
    }
    if (result.all !== undefined) {
      bundle.categories[result.dir].all = normalizeAllItemsCatalog(result.all);
    }
    if (result.list) {
      bundle.categories[result.dir].list = result.list;
    }
  });

  return bundle;
}

async function loadInventoryData(basePath) {
  if (await hasNewInventoryFormat(basePath)) {
    return loadInventoryBundle(basePath);
  }
  try {
    return await fetchJSON(`${basePath}/inventory.json`);
  } catch (_) {
    return {
      categories: {
        consumables: [],
        tools: [],
        equipment: [],
        valuables: [],
        adventuring_gear: [],
        quest_items: [],
      },
    };
  }
}
