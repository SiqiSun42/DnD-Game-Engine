const SAVE_DERIVED_FIELD = 'derived';

function resolveStatusDerived(status, inventory) {
  if (!status || typeof status !== 'object') return {};
  if (typeof resolveStatusForUi !== 'function') return {};

  const ui = resolveStatusForUi(status, inventory);
  const characters = {};

  (ui.characters || []).forEach(character => {
    const current = character.sections?.current || {};
    characters[character.character_id] = {
      current_ac: current.current_ac,
      current_ac_formula: current.current_ac_formula,
      ac_base: current.ac_base,
      shield_ac: current.shield_ac,
      ac_bonus: current.ac_bonus,
    };
  });

  const result = { characters };
  const pcId = typeof getPcCharacterId === 'function' ? getPcCharacterId(status) : null;
  if (pcId && characters[pcId]) {
    result.pc = characters[pcId];
  }
  return result;
}

function resolveSaveDerived(saveData) {
  if (!saveData) {
    return { inventory: {}, status: {} };
  }

  const inventoryDerived = typeof resolveInventoryDerived === 'function'
    ? resolveInventoryDerived(saveData.inventory, saveData.status)
    : {};

  return {
    inventory: inventoryDerived,
    status: resolveStatusDerived(saveData.status, saveData.inventory),
  };
}

function attachSaveDerivedToContext(context, saveData) {
  if (!context) return context;
  context[SAVE_DERIVED_FIELD] = resolveSaveDerived(saveData);
  const inventoryDerived = context[SAVE_DERIVED_FIELD]?.inventory || {};
  const statusDerived = context[SAVE_DERIVED_FIELD]?.status || {};
  const totalGoldGp = inventoryDerived.totalGoldGp;
  if (totalGoldGp !== undefined && totalGoldGp !== null) {
    context.wealth = totalGoldGp;
  }
  if (context.status && Object.keys(statusDerived).length) {
    context.status = { ...context.status, _derived: statusDerived };
  }
  return context;
}
