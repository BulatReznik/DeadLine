const root = document.querySelector('.widget-shell');
const titleInput = document.querySelector('#title-input');
const dateInput = document.querySelector('#date-input');
const timeInput = document.querySelector('#time-input');
const skeletonSelect = document.querySelector('#skeleton-select');
const colorInput = document.querySelector('#color-input');
const layoutSelect = document.querySelector('#layout-select');
const themeSelect = document.querySelector('#theme-select');
const opacityInput = document.querySelector('#opacity-input');
const opacityValue = document.querySelector('#opacity-value');
const alwaysOnTopInput = document.querySelector('#always-on-top-input');
const autostartInput = document.querySelector('#autostart-input');
const defaultEvent = { title: 'Отпуск', date: '2027-06-01', time: '09:00' };
const settings = JSON.parse(localStorage.getItem('bonebound-settings') || 'null') || {};
const view = JSON.parse(localStorage.getItem('bonebound-view') || 'null') || {};
const storedColor = localStorage.getItem('bonebound-color') || '#8bff3f';

function hslToHex(hue, saturation, lightness) {
  const channel = (offset) => {
    const k = (offset + hue / 30) % 12;
    const spread = saturation * Math.min(lightness, 1 - lightness);
    return lightness - spread * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  return [channel(0), channel(8), channel(4)]
    .map((value) => Math.round(value * 255).toString(16).padStart(2, '0')).join('').replace(/^/, '#');
}

function applyColor(color) {
  const value = color.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const spread = max - min;
  const saturation = spread ? spread / (1 - Math.abs(2 * lightness - 1)) : 0;
  let hue = 105;
  if (spread) {
    if (max === r) hue = 60 * (((g - b) / spread) % 6);
    else if (max === g) hue = 60 * ((b - r) / spread + 2);
    else hue = 60 * ((r - g) / spread + 4);
    if (hue < 0) hue += 360;
  }
  const delta = ((hue - 45 + 540) % 360) - 180;
  const amount = saturation === 0 ? 2 : Math.min(8, Math.max(2, saturation * 8));
  const channels = [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16));
  root.style.setProperty('--skeleton-hue', `${delta}deg`);
  root.style.setProperty('--skeleton-saturation', amount);
  root.style.setProperty('--acid', color);
  root.style.setProperty('--acid-bright', hslToHex(hue, Math.min(.86, saturation * .72), .78));
  root.style.setProperty('--line', `rgba(${channels.join(', ')}, .22)`);
  root.style.setProperty('--skeleton-color', color);
}

function setTheme(value) {
  const theme = value === 'light' ? 'light' : 'dark';
  root.classList.remove('theme-dark', 'theme-light');
  root.classList.add(`theme-${theme}`);
}

function updateOpacityLabel() {
  opacityValue.textContent = `${Math.round(Number(opacityInput.value) * 100)}%`;
}

function formPayload() {
  return {
    settings: { title: titleInput.value, date: dateInput.value, time: timeInput.value },
    view: {
      skeleton: skeletonSelect.value,
      layout: layoutSelect.value,
      theme: themeSelect.value,
      opacity: Number(opacityInput.value),
      alwaysOnTop: alwaysOnTopInput.checked,
      autoStart: autostartInput.checked,
    },
    color: colorInput.value,
  };
}

function preview() {
  const payload = formPayload();
  setTheme(payload.view.theme);
  applyColor(payload.color);
  window.widgetWindow?.updateSettings(payload);
}

function save() {
  const payload = formPayload();
  localStorage.setItem('bonebound-settings', JSON.stringify(payload.settings));
  localStorage.setItem('bonebound-view', JSON.stringify(payload.view));
  localStorage.setItem('bonebound-color', payload.color);
  window.widgetWindow?.setOpacity(payload.view.opacity);
  window.widgetWindow?.setAlwaysOnTop(payload.view.alwaysOnTop);
  window.widgetWindow?.setAutoStart(payload.view.autoStart);
  window.widgetWindow?.updateSettings(payload);
  window.widgetWindow?.closeSettings();
}

const oldDefaults = settings.title === 'Ночь костей';
titleInput.value = oldDefaults ? defaultEvent.title : (settings.title || defaultEvent.title);
dateInput.value = oldDefaults ? defaultEvent.date : (settings.date || defaultEvent.date);
timeInput.value = oldDefaults ? defaultEvent.time : (settings.time || defaultEvent.time);
skeletonSelect.value = view.skeleton || 'classic';
layoutSelect.value = view.layout || 'layout-cards';
themeSelect.value = view.theme || 'dark';
opacityInput.value = view.opacity || '.94';
alwaysOnTopInput.checked = view.alwaysOnTop !== false;
autostartInput.checked = view.autoStart === true;
colorInput.value = /^#[0-9a-f]{6}$/i.test(storedColor) ? storedColor : '#8bff3f';
setTheme(themeSelect.value);
applyColor(colorInput.value);
updateOpacityLabel();

document.querySelector('#settings-close').addEventListener('click', () => window.widgetWindow?.closeSettings());
document.querySelector('#save-settings').addEventListener('click', save);
skeletonSelect.addEventListener('change', preview);
themeSelect.addEventListener('change', preview);
colorInput.addEventListener('input', preview);
opacityInput.addEventListener('input', () => {
  updateOpacityLabel();
  window.widgetWindow?.setOpacity(opacityInput.value);
});
alwaysOnTopInput.addEventListener('change', () => window.widgetWindow?.setAlwaysOnTop(alwaysOnTopInput.checked));
autostartInput.addEventListener('change', () => window.widgetWindow?.setAutoStart(autostartInput.checked));

window.widgetWindow?.getAutoStart().then((enabled) => { autostartInput.checked = enabled; });
window.widgetWindow?.onSettingsUpdated((payload) => {
  if (payload?.color) {
    colorInput.value = payload.color;
    applyColor(payload.color);
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') window.widgetWindow?.closeSettings();
});
