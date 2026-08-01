const MISSION_BUNDLE_FORMAT = 'bundle';

function isMissionBundle(missions) {
  return missions?._format === MISSION_BUNDLE_FORMAT;
}

function getQuestStatusIcon(mission) {
  if (mission?.is_failed) return '❌';
  if (mission?.is_completed) return '✅';
  return '○';
}

function getNodeStatusIcon(node) {
  if (node?.is_completed) return '✅';
  return '○';
}

function mapMissionForUi(entry) {
  if (entry?.is_unlocked !== true) return null;

  const nodes = (entry.node || entry.nodes || [])
    .filter(node => node?.is_unlocked === true)
    .map(node => ({
      node_id: node.node_id,
      description: node.description || '',
      is_completed: node.is_completed === true,
    }));

  return {
    mission_id: entry.mission_id,
    name: entry.name || entry.mission_id || '',
    description: entry.description || '',
    is_completed: entry.is_completed === true,
    is_failed: entry.is_failed === true,
    nodes,
  };
}

function resolveMissionList(entries) {
  return (entries || [])
    .map(mapMissionForUi)
    .filter(Boolean);
}

function resolveMissionsForUi(missions) {
  if (!isMissionBundle(missions)) {
    return { mainPlot: [], sideQuest: [], history: [] };
  }

  return {
    mainPlot: resolveMissionList(missions.mainPlot?.main_plot),
    sideQuest: resolveMissionList(missions.sideQuest?.side_quest),
    history: [],
  };
}

async function hasMissionBundle(basePath) {
  try {
    const response = await fetch(`${basePath}/mission/main_plot.json`);
    return response.ok;
  } catch (_) {
    return false;
  }
}

async function loadMissionBundle(basePath) {
  const missionBase = `${basePath}/mission`;
  const [mainPlot, sideQuest] = await Promise.all([
    fetchJSON(`${missionBase}/main_plot.json`).catch(() => ({ main_plot: [] })),
    fetchJSON(`${missionBase}/side_quest.json`).catch(() => ({ side_quest: [] })),
  ]);

  return {
    _format: MISSION_BUNDLE_FORMAT,
    mainPlot,
    sideQuest,
  };
}

async function loadMissionData(basePath) {
  if (await hasMissionBundle(basePath)) {
    return loadMissionBundle(basePath);
  }
  return null;
}
