const MISSION_BUNDLE_FORMAT = 'bundle';

function isMissionBundle(missions) {
  return missions?._format === MISSION_BUNDLE_FORMAT;
}

function buildMissionAllIndex(allMissions) {
  const index = {};
  (allMissions?.missions || []).forEach(entry => {
    const id = entry?.mission_id;
    if (!id) return;
    index[id] = entry;
  });
  return index;
}

function getMissionStatusIcon(mission) {
  if (mission.is_completed) return '✅';
  if (mission.is_ended) return '❌';
  return '⬜';
}

function isMainMission(allEntry) {
  const types = allEntry?.type;
  if (!Array.isArray(types)) return false;
  return types.includes('main_mission');
}

function resolveMissionsForUi(missions) {
  if (!isMissionBundle(missions)) {
    return { chapter: [], current: [], history: [] };
  }

  const list = missions.list?.missions || [];
  const allById = buildMissionAllIndex(missions.all);
  const chapter = [];
  const current = [];
  const history = [];

  list.forEach(listEntry => {
    if (listEntry?.is_unlocked === false) return;
    const missionId = listEntry?.mission_id;
    if (!missionId) return;
    const allEntry = allById[missionId];
    if (!allEntry) return;

    const mission = {
      mission_id: missionId,
      name: allEntry.name || listEntry.name || missionId,
      content: allEntry.content || '',
      is_completed: allEntry.is_completed === true,
      is_ended: allEntry.is_ended === true,
    };

    if (isMainMission(allEntry)) {
      chapter.push(mission);
      return;
    }

    if (mission.is_ended) {
      history.push(mission);
    } else {
      current.push(mission);
    }
  });

  return { chapter, current, history };
}

async function hasMissionBundle(basePath) {
  try {
    const response = await fetch(`${basePath}/missions/list_missions.json`);
    return response.ok;
  } catch (_) {
    return false;
  }
}

async function loadMissionBundle(basePath) {
  const missionsBase = `${basePath}/missions`;
  const [all, list] = await Promise.all([
    fetchJSON(`${missionsBase}/all_missions.json`).catch(() => ({ missions: [] })),
    fetchJSON(`${missionsBase}/list_missions.json`).catch(() => ({ missions: [] })),
  ]);

  return {
    _format: MISSION_BUNDLE_FORMAT,
    all,
    list,
  };
}

async function loadMissionData(basePath) {
  if (await hasMissionBundle(basePath)) {
    return loadMissionBundle(basePath);
  }
  return null;
}
