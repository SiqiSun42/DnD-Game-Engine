const COLOR_THEMES = ['stars', 'night', 'day', 'spring', 'forest', 'book', 'sky', 'flower'];
const DEFAULT_COLOR_THEME = 'stars';

let colorTheme = DEFAULT_COLOR_THEME;

function isColorTheme(id) {
  return COLOR_THEMES.includes(id);
}

function getColorTheme() {
  return colorTheme;
}

function applyColorTheme(id) {
  if (!isColorTheme(id)) return;
  colorTheme = id;
  document.documentElement.setAttribute('data-color-theme', id);
}

function setColorTheme(id) {
  applyColorTheme(id);
  if (typeof updateGlobalUISettings === 'function') {
    updateGlobalUISettings({ colorTheme: id });
  }
}

function initColorTheme() {
  applyColorTheme(DEFAULT_COLOR_THEME);
}
