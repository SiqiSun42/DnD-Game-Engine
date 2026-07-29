const WORLD_BUNDLE_FORMAT = 'bundle';

const WORLD_CATEGORY_CONFIG = {
  species: {
    dir: 'species',
    listKey: 'species_id',
    allKey: 'species_id',
  },
  organization: {
    dir: 'organizations',
    listKey: 'organization_id',
    allKey: 'organization_id',
  },
  culture: {
    dir: 'culture',
    listKey: 'culture_id',
    allKey: 'culture_id',
  },
  event: {
    dir: 'events',
    listKey: 'event_id',
    allKey: 'event_id',
  },
};

const WORLD_SCALAR_FIELDS = {
  species: [
    ['description', '简述'],
    ['personality', '性格'],
    ['culture', '文化'],
    ['common_habitats', '常见栖息地'],
  ],
  organization: [
    ['type', '类型'],
    ['description', '简介'],
    ['size', '规模'],
    ['objective', '目标'],
    ['symbol', '标志'],
    ['motto', '信条'],
    ['area_of_operation', '活动范围'],
    ['funding_sources', '资金来源'],
    ['recruitment_method', '成员招募方式'],
    ['founders_and_notable_members', '创始人及著名成员'],
    ['notable_events', '知名事件'],
    ['current_affinity', '当前好感度'],
    ['relationship_label', '关系标签'],
    ['relationship_description', '关系描述'],
  ],
  culture: [
    ['type', '类型'],
    ['description', '简介'],
    ['core_doctrine', '核心教义'],
    ['believers', '信奉者'],
    ['main_spread_areas', '主要传播区域'],
    ['rituals_and_festivals', '仪式与节日'],
    ['taboos', '禁忌'],
  ],
  event: [
    ['description', '简介'],
    ['outcome', '结局'],
  ],
};

function isWorldBundle(world) {
  if (!world || typeof world !== 'object') return false;
  if (world._format === WORLD_BUNDLE_FORMAT) return true;
  return !!(world.categories && typeof world.categories === 'object');
}

function isWorldFieldEmpty(value) {
  if (value === null || value === undefined || value === '') return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

function formatWorldBoolean(value) {
  if (value === true) return '是';
  if (value === false) return '否';
  return null;
}

function formatWorldScalar(value) {
  if (typeof value === 'boolean') {
    return formatWorldBoolean(value);
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return String(value);
}

function formatWorldEventTime(time) {
  if (!time || typeof time !== 'object') return null;
  const parts = [];
  if (time.year != null) parts.push(`${time.year}年`);
  if (time.month != null) parts.push(`${time.month}月`);
  if (time.day != null) parts.push(`${time.day}日`);
  return parts.length ? parts.join('') : null;
}

function pickWorldField(item, keys) {
  for (const key of keys) {
    const value = item?.[key];
    if (!isWorldFieldEmpty(value)) return value;
  }
  return null;
}

function normalizeWorldCatalog(allData) {
  if (!allData) return [];
  if (Array.isArray(allData)) return allData;
  if (Array.isArray(allData.organizations)) return allData.organizations;
  if (Array.isArray(allData.events)) return allData.events;
  if (typeof allData === 'object' && allData.species_id) return [allData];
  if (typeof allData === 'object' && allData.organization_id) return [allData];
  if (typeof allData === 'object' && allData.culture_id) return [allData];
  if (typeof allData === 'object' && allData.event_id) return [allData];
  return [];
}

function indexWorldCatalog(allData, idKey) {
  const map = new Map();
  normalizeWorldCatalog(allData).forEach(item => {
    const id = item?.[idKey];
    if (id) map.set(id, item);
  });
  return map;
}

function normalizeWorldList(listData, categoryId) {
  if (Array.isArray(listData)) return listData;
  if (!listData || typeof listData !== 'object') return [];
  if (Array.isArray(listData.events)) return listData.events;
  if (Array.isArray(listData.event_index)) return listData.event_index;
  if (Array.isArray(listData.organizations)) return listData.organizations;
  if (Array.isArray(listData.species)) return listData.species;
  if (Array.isArray(listData.cultures)) return listData.cultures;
  if (categoryId === 'event' && Array.isArray(listData.sub_events)) return [listData];
  return [];
}

function buildFlatWorldEntries(listData, allData, idKey) {
  const allById = indexWorldCatalog(allData, idKey);
  return normalizeWorldList(listData)
    .map(listEntry => {
      const id = listEntry?.[idKey];
      if (!id) return null;
      const allEntry = allById.get(id) || {};
      return {
        ...allEntry,
        ...listEntry,
        id,
        name: listEntry.name || allEntry.name || id,
      };
    })
    .filter(Boolean);
}

function buildEventCategory(listData, allData) {
  const allById = indexWorldCatalog(allData, 'event_id');
  const entriesById = {};
  const list = normalizeWorldList(listData, 'event');

  const registerEntry = (id, name) => {
    if (!id || entriesById[id]) return;
    const allEntry = allById.get(id) || {};
    entriesById[id] = {
      ...allEntry,
      id,
      name: name || allEntry.name || id,
    };
  };

  list.forEach(item => {
    registerEntry(item.event_id, item.name);
    (item.sub_events || []).forEach(sub => {
      registerEntry(sub.event_id, sub.name);
    });
  });

  allById.forEach((entry, id) => {
    registerEntry(id, entry.name);
  });

  return { list, entriesById };
}

function resolveEventCategoryFromData(data) {
  if (!data || typeof data !== 'object') {
    return { list: [], entriesById: {} };
  }

  const eventsCategory = data.eventsCategory;
  if (eventsCategory && Array.isArray(eventsCategory.list)) {
    return {
      list: normalizeWorldList(eventsCategory.list, 'event'),
      entriesById: eventsCategory.entriesById || {},
    };
  }

  const bundleEvent = data.categories?.event;
  if (bundleEvent) {
    return buildEventCategory(bundleEvent.list, bundleEvent.all);
  }

  const legacyEvent = data['event'];
  if (legacyEvent && !Array.isArray(legacyEvent) && Array.isArray(legacyEvent.list)) {
    return {
      list: normalizeWorldList(legacyEvent.list, 'event'),
      entriesById: legacyEvent.entriesById || {},
    };
  }
  if (Array.isArray(legacyEvent) && legacyEvent.length) {
    return buildEventCategory(legacyEvent, legacyEvent);
  }

  return { list: [], entriesById: {} };
}

function resolveLegacyWorldForUi(world) {
  const base = world || {};
  return {
    locationTree: Array.isArray(base.locationTree) ? base.locationTree : [],
    defaultLocationId: base.defaultLocationId || null,
    species: Array.isArray(base.species) ? base.species : [],
    organization: Array.isArray(base.organization) ? base.organization : [],
    culture: Array.isArray(base.culture) ? base.culture : [],
    eventsCategory: resolveEventCategoryFromData(base),
  };
}

function resolveWorldForUi(world) {
  if (!isWorldBundle(world)) {
    return resolveLegacyWorldForUi(world);
  }

  const categories = world.categories || {};

  return {
    locationTree: Array.isArray(world.locationTree) ? world.locationTree : [],
    defaultLocationId: world.defaultLocationId || null,
    species: buildFlatWorldEntries(
      categories.species?.list,
      categories.species?.all,
      'species_id',
    ),
    organization: buildFlatWorldEntries(
      categories.organization?.list,
      categories.organization?.all,
      'organization_id',
    ),
    culture: buildFlatWorldEntries(
      categories.culture?.list,
      categories.culture?.all,
      'culture_id',
    ),
    eventsCategory: buildEventCategory(categories.event?.list, categories.event?.all),
  };
}

async function hasNewWorldFormat(basePath) {
  try {
    const response = await fetch(`${basePath}/world/species/all_species.json`);
    return response.ok;
  } catch (_) {
    return false;
  }
}

async function loadWorldBundle(basePath) {
  const worldBase = `${basePath}/world`;
  const loads = Object.entries(WORLD_CATEGORY_CONFIG).map(async ([categoryId, config]) => {
    const dir = config.dir;
    const [all, list] = await Promise.all([
      fetchJSON(`${worldBase}/${dir}/all_${dir === 'organizations' ? 'organizations' : dir}.json`)
        .catch(() => []),
      fetchJSON(`${worldBase}/${dir}/list_${dir}.json`)
        .catch(() => []),
    ]);
    return { categoryId, all, list: normalizeWorldList(list, categoryId) };
  });

  const results = await Promise.all(loads);
  const bundle = {
    _format: WORLD_BUNDLE_FORMAT,
    categories: {},
  };

  results.forEach(result => {
    bundle.categories[result.categoryId] = {
      all: result.all,
      list: result.list,
    };
  });

  return bundle;
}

async function loadWorldData(basePath) {
  if (await hasNewWorldFormat(basePath)) {
    return loadWorldBundle(basePath);
  }
  try {
    return await fetchJSON(`${basePath}/world.json`);
  } catch (_) {
    return {
      locationTree: [],
      defaultLocationId: null,
      species: [],
      organization: [],
      culture: [],
      event: [],
    };
  }
}

function getVisibleEventRows(list, expandedEventIds) {
  const rows = [];
  normalizeWorldList(list, 'event').forEach(item => {
    const subEvents = Array.isArray(item.sub_events) ? item.sub_events : [];
    const hasChildren = subEvents.length > 0;
    rows.push({
      id: item.event_id,
      name: item.name || item.event_id,
      depth: 0,
      hasChildren,
    });
    if (hasChildren && expandedEventIds.has(item.event_id)) {
      subEvents.forEach(sub => {
        rows.push({
          id: sub.event_id,
          name: sub.name || sub.event_id,
          depth: 1,
          hasChildren: false,
        });
      });
    }
  });
  return rows;
}

function getEventExpandPath(targetId, list) {
  for (const item of normalizeWorldList(list, 'event')) {
    if (item.event_id === targetId) return [];
    const subEvents = item.sub_events || [];
    if (subEvents.some(sub => sub.event_id === targetId)) {
      return [item.event_id];
    }
  }
  return null;
}

function getDefaultExpandedEventIds(list, activeEventId) {
  const path = getEventExpandPath(activeEventId, list);
  return new Set(path || []);
}

function renderWorldDetailSection(label, bodyHtml) {
  return `
    <section class="world-detail-section">
      <h4 class="world-detail-label">${escapePanelText(label)}</h4>
      <div class="world-detail-body">${bodyHtml}</div>
    </section>
  `;
}

function renderWorldTextSection(label, text) {
  if (isWorldFieldEmpty(text)) return '';
  return renderWorldDetailSection(
    label,
    `<p class="world-detail-paragraph">${escapePanelText(formatWorldScalar(text))}</p>`,
  );
}

function renderWorldParagraphs(lines) {
  return lines
    .map(line => `<p class="world-detail-paragraph">${escapePanelText(line)}</p>`)
    .join('');
}

function renderWorldNamedEntries(label, entries, fieldMap) {
  if (isWorldFieldEmpty(entries)) return '';
  const blocks = entries.map((entry, index) => {
    const lines = fieldMap
      .map(([keys, entryLabel]) => {
        const value = pickWorldField(entry, keys);
        if (isWorldFieldEmpty(value)) return null;
        return `${entryLabel}：${formatWorldScalar(value)}`;
      })
      .filter(Boolean);
    if (!lines.length) return '';
    const prefix = entries.length > 1 ? `<p class="world-detail-paragraph world-detail-entry-title">条目 ${index + 1}</p>` : '';
    return `${prefix}${renderWorldParagraphs(lines)}`;
  }).filter(Boolean);
  if (!blocks.length) return '';
  return renderWorldDetailSection(label, blocks.join(''));
}

function renderWorldReputation(reputation) {
  if (!reputation || typeof reputation !== 'object') return '';
  const attitude = pickWorldField(reputation, ['attitude', '态度']);
  const description = pickWorldField(reputation, ['description', '描述']);
  if (isWorldFieldEmpty(attitude) && isWorldFieldEmpty(description)) return '';
  const lines = [];
  if (!isWorldFieldEmpty(attitude)) lines.push(`态度：${formatWorldScalar(attitude)}`);
  if (!isWorldFieldEmpty(description)) lines.push(`描述：${formatWorldScalar(description)}`);
  return renderWorldDetailSection('风评', renderWorldParagraphs(lines));
}

function renderWorldStartConditions(conditions) {
  if (!conditions || typeof conditions !== 'object') return '';
  const lines = [];
  const canPrevent = pickWorldField(conditions, ['can_prevent', '是否可阻止']);
  const trigger = pickWorldField(conditions, ['trigger_condition', '触发条件']);
  const prevent = pickWorldField(conditions, ['prevent_condition', '阻止条件']);
  if (!isWorldFieldEmpty(canPrevent)) lines.push(`是否可阻止：${formatWorldScalar(canPrevent)}`);
  if (!isWorldFieldEmpty(trigger)) lines.push(`触发条件：${formatWorldScalar(trigger)}`);
  if (!isWorldFieldEmpty(prevent)) lines.push(`阻止条件：${formatWorldScalar(prevent)}`);
  if (!lines.length) return '';
  return renderWorldDetailSection('开始条件', renderWorldParagraphs(lines));
}

function renderWorldPossibleOutcomes(outcomes) {
  return renderWorldNamedEntries('可能结局', outcomes, [
    [['name', '名称'], '名称'],
    [['trigger_condition', '触发条件'], '触发条件'],
    [['result', '结果'], '结果'],
  ]);
}

function renderWorldSpeciesRelationships(relationships) {
  return renderWorldNamedEntries('与其他物种关系', relationships, [
    [['target_species', '名称', 'name'], '对象'],
    [['relationship_description', '关系', '关系简述'], '关系'],
  ]);
}

function renderWorldOrganizationDetail(entry) {
  const sections = WORLD_SCALAR_FIELDS.organization
    .map(([key, label]) => renderWorldTextSection(label, entry[key]))
    .filter(Boolean);
  sections.push(renderWorldReputation(entry.reputation));
  sections.push(renderWorldNamedEntries('盟友', entry.allies, [
    [['name', '名称'], '名称'],
    [['relationship_description', '关系简述', '关系'], '关系'],
  ]));
  sections.push(renderWorldNamedEntries('敌人', entry.enemies, [
    [['name', '名称'], '名称'],
    [['relationship_description', '关系简述', '关系'], '关系'],
  ]));
  sections.push(renderWorldNamedEntries('服务', entry.services, [
    [['name', '名称'], '名称'],
    [['description', '描述'], '描述'],
    [['price', '价格'], '价格'],
  ]));
  sections.push(renderWorldNamedEntries('任务', entry.quests, [
    [['name', '名称'], '名称'],
    [['description', '描述'], '描述'],
    [['reward', '奖励'], '奖励'],
  ]));
  return sections.filter(Boolean).join('');
}

function renderWorldEventDetail(entry) {
  const sections = [];
  sections.push(renderWorldTextSection('简介', entry.description));
  if (typeof entry.has_started === 'boolean') {
    sections.push(renderWorldTextSection('是否开始', formatWorldBoolean(entry.has_started)));
  }
  sections.push(renderWorldStartConditions(entry.start_conditions));
  sections.push(renderWorldTextSection('开始时间', formatWorldEventTime(entry.start_time)));
  if (typeof entry.has_ended === 'boolean') {
    sections.push(renderWorldTextSection('是否结束', formatWorldBoolean(entry.has_ended)));
  }
  sections.push(renderWorldTextSection('结束时间', formatWorldEventTime(entry.end_time)));
  sections.push(renderWorldPossibleOutcomes(entry.possible_outcomes));
  sections.push(renderWorldTextSection('结局', entry.outcome));
  sections.push(renderWorldNamedEntries('关联人物', entry.associated_characters, [
    [['name', '名称'], '名称'],
    [['description', '简述'], '简述'],
  ]));
  sections.push(renderWorldNamedEntries('关联组织', entry.associated_organizations, [
    [['name', '名称'], '名称'],
    [['description', '简述'], '简述'],
  ]));
  sections.push(renderWorldNamedEntries('关联地点', entry.associated_locations, [
    [['name', '名称'], '名称'],
    [['description', '简述'], '简述'],
  ]));
  sections.push(renderWorldNamedEntries('关联事件', entry.associated_events, [
    [['name', '名称'], '名称'],
    [['relationship', '关系'], '关系'],
  ]));
  sections.push(renderWorldNamedEntries('影响', entry.impacts, [
    [['target_type', '目标类型'], '目标类型'],
    [['target_name', '目标名称'], '目标名称'],
    [['impact_description', '影响内容'], '影响内容'],
  ]));
  return sections.filter(Boolean).join('');
}

function renderWorldCategoryDetail(categoryId, entry) {
  if (!entry) return '';

  if (categoryId === 'species') {
    const sections = WORLD_SCALAR_FIELDS.species
      .map(([key, label]) => renderWorldTextSection(label, entry[key]))
      .filter(Boolean);
    sections.push(renderWorldSpeciesRelationships(entry.relationships));
    return sections.filter(Boolean).join('');
  }

  if (categoryId === 'organization') {
    return renderWorldOrganizationDetail(entry);
  }

  if (categoryId === 'culture') {
    return WORLD_SCALAR_FIELDS.culture
      .map(([key, label]) => renderWorldTextSection(label, entry[key]))
      .filter(Boolean)
      .join('');
  }

  if (categoryId === 'event') {
    return renderWorldEventDetail(entry);
  }

  return renderWorldTextSection('描述', entry.description);
}
