const COLOR_THEMES = ['stars', 'night', 'day', 'spring', 'forest', 'book', 'sky', 'flower'];
const DEFAULT_COLOR_THEME = 'stars';

let colorTheme = DEFAULT_COLOR_THEME;

function isColorTheme(id) {
  return COLOR_THEMES.includes(id);
}

function getColorTheme() {
  return colorTheme;
}

function setColorTheme(id) {
  if (!isColorTheme(id)) return;
  colorTheme = id;
  document.documentElement.setAttribute('data-color-theme', id);
  try {
    localStorage.setItem('colorTheme', id);
  } catch (_) {}
}

function initColorTheme() {
  let next = DEFAULT_COLOR_THEME;
  try {
    const stored = localStorage.getItem('colorTheme');
    if (stored && isColorTheme(stored)) next = stored;
  } catch (_) {}
  setColorTheme(next);
}
