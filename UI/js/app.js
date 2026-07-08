const PAGE_TITLES = {
  home: '主页',
  'new-adventure': '创建新游戏',
  templates: '选择模板',
};

const PAGES = {
  home: { title: '占位符 — 主页', desc: '欢迎使用 Dungeon Master，请从侧边栏选择一项。' },
  'new-adventure': { title: '占位符 — 创建新游戏', desc: '从零开始创建新的冒险。' },
  templates: { title: '占位符 — 选择模板', desc: '从现有故事模板中选择。' },
};

let activePage = 'home';
let activeSaveName = null;
let activeChat = null;
let accountMode = 'developer';
let menuTargetSaveName = null;
let deleteTargetName = null;

const sidebar = document.getElementById('sidebar');
const mainContent = document.getElementById('main-content');
const saveList = document.getElementById('save-list');
const saveSearch = document.getElementById('save-search');
const saveMenu = document.getElementById('save-menu');
const accountMenu = document.getElementById('account-menu');
const accountOptionsMenu = document.getElementById('account-options-menu');
const deleteModal = document.getElementById('delete-modal');
const deleteMessage = document.getElementById('delete-message');
const clearConsultModal = document.getElementById('clear-consult-modal');
const avatar = document.getElementById('avatar');
const accountLabel = document.getElementById('account-label');
const btnCollapse = document.getElementById('btn-collapse');

function getPlayerLabel() {
  return accountMode === 'developer' ? 'A' : 'G';
}

function getAccountMode() {
  return accountMode;
}

function sortSaves(list) {
  return [...list].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.lastPlayed - a.lastPlayed;
  });
}

function filteredSaves() {
  const q = saveSearch.value.trim().toLowerCase();
  const sorted = sortSaves(getSavesList()).filter(save => save.name !== CONSULT_SAVE_NAME);
  if (!q) return sorted;
  return sorted.filter(s => s.name.toLowerCase().includes(q));
}

function renderSaveList() {
  const list = filteredSaves();
  saveList.innerHTML = '';

  list.forEach(save => {
    const li = document.createElement('li');
    li.className = 'save-item' + (save.pinned ? ' pinned' : '') + (save.name === activeSaveName ? ' active' : '');
    li.dataset.name = save.name;

    const row = document.createElement('div');
    row.className = 'save-item-row';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'save-item-btn';

    if (save.pinned) {
      const pin = document.createElement('span');
      pin.className = 'pin-icon';
      pin.textContent = '📌';
      btn.appendChild(pin);
    }

    const nameSpan = document.createElement('span');
    nameSpan.className = 'save-name renameable';
    nameSpan.textContent = save.name;
    nameSpan.title = '双击重命名';
    btn.appendChild(nameSpan);

    let clickTimer = null;
    btn.addEventListener('click', () => {
      if (nameSpan.dataset.editing) return;
      clearTimeout(clickTimer);
      clickTimer = setTimeout(() => openSave(save.name), 220);
    });

    nameSpan.addEventListener('dblclick', e => {
      e.preventDefault();
      e.stopPropagation();
      clearTimeout(clickTimer);
      startSaveNameEdit(save.name, nameSpan);
    });

    const menuBtn = document.createElement('button');
    menuBtn.type = 'button';
    menuBtn.className = 'save-menu-btn';
    menuBtn.textContent = '⋮';
    menuBtn.setAttribute('aria-label', '存档选项');
    menuBtn.addEventListener('click', e => {
      e.stopPropagation();
      openSaveMenu(e, save.name);
    });

    row.appendChild(btn);
    row.appendChild(menuBtn);
    li.appendChild(row);
    saveList.appendChild(li);
  });
}

function renameSave(currentName, newName) {
  const save = findSave(currentName);
  if (!save) return;
  const trimmed = newName.trim();
  if (!trimmed || findSave(trimmed)) {
    renderSaveList();
    return;
  }
  updateSaveMeta(currentName, { name: trimmed });
  if (activeSaveName === currentName) {
    activeSaveName = trimmed;
    updateActiveViewTitle(trimmed);
  }
  renderSaveList();
}

function attachInlineRename(hostEl, getValue, onCommit) {
  if (hostEl.querySelector('.inline-rename-input')) return;

  const originalText = getValue();
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'inline-rename-input';
  input.value = originalText;
  hostEl.dataset.editing = 'true';
  hostEl.textContent = '';
  hostEl.appendChild(input);

  let finished = false;

  const finish = commit => {
    if (finished) return;
    finished = true;
    delete hostEl.dataset.editing;
    const val = input.value.trim();
    if (commit && val && val !== originalText) {
      onCommit(val);
    } else {
      hostEl.textContent = originalText;
    }
  };

  input.focus();
  input.select();

  input.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      finish(true);
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      finish(false);
    }
  });

  input.addEventListener('blur', () => finish(true));
  input.addEventListener('click', e => e.stopPropagation());
  input.addEventListener('mousedown', e => e.stopPropagation());
}

function startSaveNameEdit(saveName, nameEl) {
  attachInlineRename(
    nameEl,
    () => findSave(saveName)?.name || '',
    val => renameSave(saveName, val)
  );
}

function startViewTitleEdit() {
  if (!activeSaveName) return;
  const titleEl = mainContent.querySelector('#view-title');
  if (!titleEl) return;
  const saveName = activeSaveName;
  attachInlineRename(
    titleEl,
    () => findSave(saveName)?.name || '',
    val => renameSave(saveName, val)
  );
}

function bindViewTitleRenameState() {
  const titleEl = mainContent.querySelector('#view-title');
  if (!titleEl) return;
  titleEl.classList.toggle('renameable', !!activeSaveName);
  titleEl.title = activeSaveName ? '双击重命名' : '';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showPlaceholder(title, desc) {
  activeChat = null;
  mainContent.innerHTML = `
    <div class="placeholder">
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(desc)}</p>
    </div>
  `;
}

function mountTemplate(type, options = {}) {
  mainContent.innerHTML = '';
  const playerLabel = getPlayerLabel();
  const chatOptions = { playerLabel, ...options };

  if (type === 'game') {
    activeChat = mountGameTemplate(mainContent, chatOptions);
  } else if (type === 'chat') {
    activeChat = mountChatTemplate(mainContent, chatOptions);
  } else {
    activeChat = null;
  }
  bindViewTitleRenameState();
}

async function navigate(pageKey, saveName) {
  if (!(pageKey === 'save' && saveName)) {
    clearActiveSave();
  }

  activePage = pageKey;
  activeSaveName = saveName || null;

  document.querySelectorAll('.nav-item.active, .save-item.active, .consult-item.active').forEach(el => {
    el.classList.remove('active');
  });

  if (pageKey === 'home') {
    showPlaceholder(PAGES.home.title, PAGES.home.desc);
  } else if (pageKey === 'new-adventure') {
    document.getElementById('btn-from-scratch').classList.add('active');
    mountTemplate('chat', {
      title: PAGE_TITLES['new-adventure'],
      initialMessages: [
        { role: 'dm', label: 'DM', text: '让我们从零开始创建一场新的冒险。请描述你想要的世界、角色或故事风格。' },
      ],
    });
  } else if (pageKey === 'templates') {
    document.getElementById('btn-templates').classList.add('active');
    mountTemplate('chat', {
      title: PAGE_TITLES.templates,
      initialMessages: [
        { role: 'dm', label: 'DM', text: '请选择一个现有模板，或告诉我你想玩哪种类型的故事。' },
      ],
    });
  } else if (pageKey === 'save' && saveName) {
    const save = findSave(saveName);
    if (save) {
      if (saveName === CONSULT_SAVE_NAME) {
        document.getElementById('btn-consult').classList.add('active');
        document.querySelector('.consult-item')?.classList.add('active');
      }
      updateSaveMeta(saveName, { lastPlayed: Date.now() });
      await loadSave(saveName);
      if (save.docType === 'conversation') {
        mountTemplate('chat', { title: save.name });
      } else {
        mountTemplate('game', { title: save.name });
      }
      renderSaveList();
    }
  }
}

function updateActiveViewTitle(name) {
  setViewTitle(mainContent, name);
}

function openSave(name) {
  navigate('save', name);
}

function closeAllMenus() {
  [saveMenu, accountMenu, accountOptionsMenu].forEach(m => m.classList.add('hidden'));
}

function positionMenu(menu, rect) {
  menu.classList.remove('hidden');
  const menuRect = menu.getBoundingClientRect();
  let top = rect.bottom + 4;
  let left = rect.left;

  if (left + menuRect.width > window.innerWidth) {
    left = window.innerWidth - menuRect.width - 8;
  }
  if (top + menuRect.height > window.innerHeight) {
    top = rect.top - menuRect.height - 4;
  }

  menu.style.top = top + 'px';
  menu.style.left = left + 'px';
}

function openSaveMenu(e, saveName) {
  closeAllMenus();
  menuTargetSaveName = saveName;
  const save = findSave(saveName);
  const pinBtn = saveMenu.querySelector('[data-action="pin"]');
  if (pinBtn && save) {
    pinBtn.innerHTML = save.pinned
      ? '<span class="menu-icon">📌</span> 取消固定'
      : '<span class="menu-icon">📌</span> 固定';
  }
  positionMenu(saveMenu, e.currentTarget.getBoundingClientRect());
}

async function handleSaveAction(action) {
  const save = findSave(menuTargetSaveName);
  if (!save) return;

  switch (action) {
    case 'pin':
      updateSaveMeta(save.name, { pinned: !save.pinned });
      break;
    case 'copy': {
      const copyName = save.name + ' — 副本';
      getSavesList().push({
        name: copyName,
        docType: save.docType || 'game',
        pinned: false,
        lastPlayed: Date.now(),
      });
      persistSavesIndex();
      await duplicateSaveData(save.name, copyName);
      break;
    }
    case 'rename': {
      closeAllMenus();
      const li = saveList.querySelector(`.save-item[data-name="${CSS.escape(save.name)}"]`);
      const nameEl = li?.querySelector('.save-name');
      if (nameEl) {
        requestAnimationFrame(() => startSaveNameEdit(save.name, nameEl));
      } else if (activeSaveName === save.name) {
        startViewTitleEdit();
      }
      return;
    }
    case 'delete':
      deleteTargetName = save.name;
      deleteMessage.textContent = `确定要删除「${save.name}」吗？此操作无法撤销。`;
      deleteModal.classList.remove('hidden');
      break;
  }

  closeAllMenus();
  if (action !== 'delete') renderSaveList();
}

function confirmClearConsult() {
  if (resetConsultChatHistory()) {
    if (activeSaveName === CONSULT_SAVE_NAME && activeChat?.setMessages) {
      activeChat.setMessages(getChatMessages());
      activeChat.focusInput();
    }
  }
  clearConsultModal.classList.add('hidden');
}

function confirmDelete() {
  if (deleteTargetName) {
    removeSave(deleteTargetName);
    if (activeSaveName === deleteTargetName) {
      navigate('home');
    }
    deleteTargetName = null;
    renderSaveList();
  }
  deleteModal.classList.add('hidden');
}

function setAccountMode(mode) {
  accountMode = mode;
  avatar.textContent = mode === 'developer' ? 'A' : 'G';
  accountLabel.textContent = mode === 'developer' ? '开发者' : '游客';
  closeAllMenus();
}

function openAccountOptionsMenu(e) {
  closeAllMenus();
  positionMenu(accountOptionsMenu, e.currentTarget.getBoundingClientRect());
}

function updateCollapseLabel() {
  const collapsed = sidebar.classList.contains('collapsed');
  btnCollapse.setAttribute('title', collapsed ? '展开' : '收起');
  btnCollapse.setAttribute('aria-label', collapsed ? '展开侧边栏' : '收起侧边栏');
}

document.getElementById('btn-home').addEventListener('click', () => navigate('home'));
btnCollapse.addEventListener('click', () => {
  sidebar.classList.toggle('collapsed');
  updateCollapseLabel();
});
document.getElementById('btn-from-scratch').addEventListener('click', () => navigate('new-adventure'));
document.getElementById('btn-templates').addEventListener('click', () => navigate('templates'));
document.getElementById('btn-consult').addEventListener('click', () => openSave(CONSULT_SAVE_NAME));

document.getElementById('btn-consult-clear').addEventListener('click', e => {
  e.stopPropagation();
  closeAllMenus();
  clearConsultModal.classList.remove('hidden');
});

document.getElementById('btn-cancel-clear-consult').addEventListener('click', () => {
  clearConsultModal.classList.add('hidden');
});

document.getElementById('btn-confirm-clear-consult').addEventListener('click', confirmClearConsult);

document.getElementById('btn-account').addEventListener('click', e => {
  closeAllMenus();
  positionMenu(accountMenu, e.currentTarget.getBoundingClientRect());
});

document.getElementById('btn-account-options').addEventListener('click', e => {
  e.stopPropagation();
  openAccountOptionsMenu(e);
});

saveSearch.addEventListener('input', renderSaveList);

saveMenu.querySelectorAll('[data-action]').forEach(btn => {
  btn.addEventListener('click', () => handleSaveAction(btn.dataset.action));
});

accountMenu.querySelectorAll('[data-mode]').forEach(btn => {
  btn.addEventListener('click', () => setAccountMode(btn.dataset.mode));
});

accountOptionsMenu.querySelectorAll('[data-action]').forEach(btn => {
  btn.addEventListener('click', () => closeAllMenus());
});

document.getElementById('btn-cancel-delete').addEventListener('click', () => {
  deleteTargetName = null;
  deleteModal.classList.add('hidden');
});

document.getElementById('btn-confirm-delete').addEventListener('click', confirmDelete);

mainContent.addEventListener('dblclick', e => {
  const titleEl = e.target.closest('#view-title');
  if (!titleEl || !activeSaveName || titleEl.querySelector('.inline-rename-input')) return;
  e.preventDefault();
  startViewTitleEdit();
});

document.addEventListener('click', e => {
  if (!e.target.closest('.dropdown-menu') && !e.target.closest('.save-menu-btn') &&
      !e.target.closest('#btn-account')) {
    closeAllMenus();
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeAllMenus();
    deleteModal.classList.add('hidden');
    clearConsultModal.classList.add('hidden');
    deleteTargetName = null;
  }
});

initGameData()
  .then(() => {
    renderSaveList();
    navigate('home');
  })
  .catch(err => {
    console.error(err);
    showPlaceholder('加载失败', '无法读取游戏数据，请检查 Data 与 UI 目录。');
  });
