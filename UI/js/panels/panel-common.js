function escapePanelText(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function mountDefaultPanel(container, tabInfo) {
  container.innerHTML = `
    <div class="chat-column action-panel-default">
      <h2 class="action-panel-title">标签页占位符 — ${escapePanelText(tabInfo.label)}</h2>
      <p class="action-panel-desc">此处将显示「${escapePanelText(tabInfo.label)}」面板内容。</p>
    </div>
  `;
}
