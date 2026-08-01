function buildInventoryCategories(schema, data) {
  const categories = {};
  (schema?.categories || []).forEach(cat => {
    categories[cat.id] = {
      id: cat.id,
      label: cat.label,
      items: data?.categories?.[cat.id] || [],
    };
  });
  return categories;
}

function mountBackpackPanel(container, schema, data) {
  if (!schema || !data) {
    mountDefaultPanel(container, { label: '背包' });
    return;
  }

  const INVENTORY_CATEGORIES = buildInventoryCategories(schema, data);
  const firstCategory = schema.categories[0]?.id || Object.keys(INVENTORY_CATEGORIES)[0];
  const firstItem = INVENTORY_CATEGORIES[firstCategory]?.items[0];

  let activeCategory = firstCategory;
  let activeItemId = firstItem?.id || null;

  container.innerHTML = `
    <div class="backpack-panel" id="backpack-panel">
      <div class="backpack-panel-col backpack-categories" id="backpack-categories">
        <div class="backpack-categories-list" id="backpack-categories-list"></div>
      </div>
      <div class="backpack-panel-col backpack-panel-list" id="backpack-list"></div>
      <div class="backpack-panel-col backpack-panel-detail" id="backpack-detail"></div>
    </div>
  `;

  const categoriesEl = container.querySelector('#backpack-categories-list');
  const listEl = container.querySelector('#backpack-list');
  const detailEl = container.querySelector('#backpack-detail');

  function renderCategories() {
    categoriesEl.innerHTML = '';
    Object.values(INVENTORY_CATEGORIES).forEach(cat => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'backpack-panel-item' + (cat.id === activeCategory ? ' active' : '');
      btn.textContent = cat.label;
      btn.addEventListener('click', () => {
        activeCategory = cat.id;
        const items = INVENTORY_CATEGORIES[activeCategory].items;
        activeItemId = items[0]?.id || null;
        renderAll();
      });
      categoriesEl.appendChild(btn);
    });
  }

  function renderList() {
    listEl.innerHTML = '';
    const items = INVENTORY_CATEGORIES[activeCategory].items;
    if (!items.find(item => item.id === activeItemId)) {
      activeItemId = items[0]?.id || null;
    }
    items.forEach(item => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'backpack-panel-item' + (item.id === activeItemId ? ' active' : '');
      if (item.equipmentListBadge) {
        btn.innerHTML = `<span class="backpack-list-name">${escapePanelText(item.name)}</span><span class="backpack-equip-badge">${item.equipmentListBadge}</span>`;
      } else {
        btn.textContent = item.name;
      }
      btn.addEventListener('click', () => {
        activeItemId = item.id;
        renderAll();
      });
      listEl.appendChild(btn);
    });
  }

  function renderDetailBodyLines(lines) {
    return lines
      .map(line => `<p class="backpack-detail-body">${escapePanelText(line)}</p>`)
      .join('');
  }

  function renderCurrencyTable(rows) {
    if (!rows.length) {
      return '<p class="backpack-detail-empty">暂无钱币</p>';
    }
    const head = `
      <thead>
        <tr>
          <th>钱币种类</th>
          <th>数量</th>
          <th>汇率</th>
          <th>说明</th>
        </tr>
      </thead>
    `;
    const body = rows.map(row => `
      <tr>
        <td>${escapePanelText(row.name)}</td>
        <td>${escapePanelText(String(row.quantity))}</td>
        <td>${escapePanelText(row.exchangeRate)}</td>
        <td>${escapePanelText(row.description)}</td>
      </tr>
    `).join('');
    return `<table class="backpack-currency-table">${head}<tbody>${body}</tbody></table>`;
  }

  function renderEncumbranceDetail(item) {
    const maxWeightLine = item.maxWeightFormula
      ? `最大负重(lb)：${item.maxWeightFormula}`
      : item.maxWeightLb !== null && item.maxWeightLb !== undefined
        ? `最大负重(lb)：${formatWeightLbDisplay(item.maxWeightLb)}`
        : null;
    const statusLabel = item.statusLabel || '正常';
    const statusClass = statusLabel === '超重' ? ' backpack-encumbrance-overweight' : '';
    detailEl.innerHTML = `
      <div class="backpack-detail-inner">
        ${renderDetailBodyLines([
          maxWeightLine,
          `当前负重(lb)：${formatWeightLbDisplay(item.currentWeightLb)}`,
        ].filter(Boolean))}
        <p class="backpack-detail-body${statusClass}">当前状态：${escapePanelText(statusLabel)}</p>
      </div>
    `;
  }

  function renderCurrencyDetail(item) {
    detailEl.innerHTML = `
      <div class="backpack-detail-inner">
        ${renderDetailBodyLines([`总金额(gp)：${formatGoldGpDisplay(item.totalGoldGp)}`])}
        ${renderCurrencyTable(item.currencyRows || [])}
      </div>
    `;
  }

  function renderDetail() {
    const cat = INVENTORY_CATEGORIES[activeCategory];
    const item = cat.items.find(i => i.id === activeItemId);
    if (!item) {
      detailEl.innerHTML = '<p class="backpack-detail-empty">请选择项目</p>';
      return;
    }

    if (item.statusType === 'encumbrance') {
      renderEncumbranceDetail(item);
      return;
    }
    if (item.statusType === 'currency') {
      renderCurrencyDetail(item);
      return;
    }

    if (item.sourceCategory === 'quest_items') {
      const headerLines = [`数量：${item.quantity}`, `介绍：${item.description || ''}`];
      const bodyLines = [];
      if (item.content !== null && item.content !== undefined) {
        bodyLines.push(`内容：${item.content}`);
      }
      if (item.taskHint !== null && item.taskHint !== undefined) {
        bodyLines.push(`提示：${item.taskHint}`);
      }
      const footerLines = [];
      if (item.weightLb !== undefined && item.weightLb !== null && item.weightLb !== '') {
        footerLines.push(`重量（lb）：${item.weightLb}`);
      }
      detailEl.innerHTML = `
        <div class="backpack-detail-inner">
          ${renderDetailBodyLines(headerLines)}
          ${bodyLines.length ? renderDetailBodyLines(bodyLines) : ''}
          ${footerLines.length ? renderDetailBodyLines(footerLines) : ''}
        </div>
      `;
      return;
    }

    const headerLines = [`数量：${item.quantity}`];
    if (item.sourceCategory === 'tools' && item.maxCharges !== undefined && item.maxCharges !== null) {
      headerLines.push(`最大使用次数：${item.maxCharges}`);
      if (item.remainingCharges !== undefined && item.remainingCharges !== null) {
        headerLines.push(`当前剩余次数：${item.remainingCharges}`);
      }
    }
    headerLines.push(`介绍：${item.description || ''}`);

    const effectLines = [];
    if (item.isEquipped) {
      effectLines.push('状态：已装备');
    }
    if (item.sourceCategory === 'equipment') {
      if (item.equipmentAvailableSlots) {
        effectLines.push(`可用槽位：${item.equipmentAvailableSlots}`);
      }
      if (item.isEquipped && item.equipmentUsedSlots) {
        effectLines.push(`已用槽位：${item.equipmentUsedSlots}`);
      }
    }
    if (item.tag) {
      const tagLabel = formatEquipmentTagLabel(item.tag);
      if (tagLabel) effectLines.push(`类型：${tagLabel}`);
    }
    if (item.sourceCategory === 'equipment') {
      if (Array.isArray(item.equipmentEffectLines)) {
        effectLines.push(...item.equipmentEffectLines);
      }
      if (Array.isArray(item.equipmentRestrictionLines)) {
        effectLines.push(...item.equipmentRestrictionLines);
      }
    }
    if (Array.isArray(item.itemEffectLines)) {
      effectLines.push(...item.itemEffectLines);
    }

    const footerLines = [];
    if (item.referencePriceGp !== undefined && item.referencePriceGp !== null && item.referencePriceGp !== '') {
      const priceLabel = item.sourceCategory === 'valuables' ? '参考价值（gp）' : '参考价格（gp）';
      footerLines.push(`${priceLabel}：${item.referencePriceGp}`);
    }
    if (item.rechargePriceGp !== undefined && item.rechargePriceGp !== null && item.rechargePriceGp !== '') {
      footerLines.push(`回复次数价格(gp)：${item.rechargePriceGp}`);
    }
    if (item.rechargeCondition !== undefined && item.rechargeCondition !== null && item.rechargeCondition !== '') {
      footerLines.push(`回复条件：${item.rechargeCondition}`);
    }
    if (item.rarity !== undefined && item.rarity !== null && item.rarity !== '') {
      footerLines.push(`稀有度：${item.rarity}`);
    }
    if (item.weightLb !== undefined && item.weightLb !== null && item.weightLb !== '') {
      footerLines.push(`重量（lb）：${item.weightLb}`);
    }

    detailEl.innerHTML = `
      <div class="backpack-detail-inner">
        ${renderDetailBodyLines(headerLines)}
        ${effectLines.length ? renderDetailBodyLines(effectLines) : ''}
        ${footerLines.length ? renderDetailBodyLines(footerLines) : ''}
      </div>
    `;
  }

  function renderAll() {
    renderCategories();
    renderList();
    renderDetail();
  }

  renderAll();
}
