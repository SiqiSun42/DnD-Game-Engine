const SAVE_DERIVED_FIELD = 'derived';

function resolveStatusDerived(status) {
  if (!status || typeof status !== 'object') return {};
  return {};
}

function resolveSaveDerived(saveData) {
  if (!saveData) {
    return { inventory: {}, status: {} };
  }

  const inventoryDerived = typeof resolveInventoryDerived === 'function'
    ? resolveInventoryDerived(saveData.inventory)
    : {};

  return {
    inventory: inventoryDerived,
    status: resolveStatusDerived(saveData.status),
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
