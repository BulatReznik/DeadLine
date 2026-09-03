const root = document.querySelector('.widget-shell');
const eventTitle = document.querySelector('#event-title');
const eventDateLabel = document.querySelector('#event-date-label');
const eventTimeLabel = document.querySelector('#event-time-label');
const settingsPanel = document.querySelector('#settings-panel');
const titleInput = document.querySelector('#title-input');
const dateInput = document.querySelector('#date-input');
const timeInput = document.querySelector('#time-input');
const headColorTrigger = document.querySelector('#head-color-trigger');
const skeletonImage = document.querySelector('#skeleton-image');
const skeletonStage = document.querySelector('#skeleton-stage');
const skeletonSelect = document.querySelector('#skeleton-select');
const colorInput = document.querySelector('#color-input');
const layoutSelect = document.querySelector('#layout-select');
const themeSelect = document.querySelector('#theme-select');
const opacityInput = document.querySelector('#opacity-input');
const opacityValue = document.querySelector('#opacity-value');
const alwaysOnTopInput = document.querySelector('#always-on-top-input');
const autostartInput = document.querySelector('#autostart-input');
const $ = (id) => document.getElementById(id);
const pad = (value) => String(Math.max(0, value)).padStart(2, '0');
const settings = JSON.parse(localStorage.getItem('bonebound-settings') || 'null');
const view = JSON.parse(localStorage.getItem('bonebound-view') || 'null');
const defaultEvent = { title: 'Отпуск', date: '2027-06-01', time: '09:00' };
const colorPalette = ['#ff4d6d', '#ff9f43', '#ffd166', '#4dd0e1', '#4d7cff', '#9b5de5', '#f15bb5', '#00f5d4', '#e76f51', '#a7c957'];
const skeletons = {
  classic: { src: 'assets/skeleton-classic.gif', alt: 'Классический скелет', width: 235, offset: -10, composite: true },
  warrior: { src: 'assets/skeletons/01_skelet.png', alt: 'Скелет-воин со щитом', width: 220 },
  'skeleton-blue': { src: 'assets/skeletons/02_skelet20.png', alt: 'Скелет в полный рост', width: 220 },
  demon: { src: 'assets/skeletons/03_skull14.png', alt: 'Череп демона в круге', width: 220 },
  crossbones: { src: 'assets/skeletons/04_skull22.png', alt: 'Череп на перекрещенных костях', width: 220 },
  'enter-skull': { src: 'assets/skeletons/05_skullenter.png', alt: 'Череп Enter', width: 220 },
  reaper: { src: 'assets/skeletons/06_reaper4.png', alt: 'Жнец с косой', width: 220 },
  'water-skull': { src: 'assets/skeletons/07_skull-water.png', alt: 'Череп из воды', width: 220 },
  'dark-skull': { src: 'assets/skeletons/09_skull18.png', alt: 'Тёмный череп', width: 220 },
  'cartoon-skull': { src: 'assets/skeletons/10_skull5.png', alt: 'Мультяшный череп', width: 220 },
};
const storedColor = localStorage.getItem('bonebound-color') || '';
let currentSkeletonColor = /^#[0-9a-f]{6}$/i.test(storedColor) ? storedColor : '#8bff3f';
let target = null;

function getTargetFromInputs() {
  const value = `${dateInput.value}T${timeInput.value || '00:00'}`;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(Date.now() + 86400000) : date;
}

function calendarDiff(from, to) {
  if (to <= from) return { months: 0, days: 0, hours: 0, minutes: 0, seconds: 0 };
  let cursor = new Date(from);
  let months = (to.getFullYear() - cursor.getFullYear()) * 12 + to.getMonth() - cursor.getMonth();
  const anniversary = new Date(cursor);
  anniversary.setMonth(anniversary.getMonth() + months);
  if (anniversary > to) months -= 1;
  cursor = new Date(from);
  cursor.setMonth(cursor.getMonth() + months);
  const remaining = to - cursor;
  return {
    months,
    days: Math.floor(remaining / 86400000),
    hours: Math.floor((remaining % 86400000) / 3600000),
    minutes: Math.floor((remaining % 3600000) / 60000),
    seconds: Math.floor((remaining % 60000) / 1000),
  };
}

const calendarCheck = calendarDiff(new Date(2026, 8, 3), new Date(2026, 9, 31));
console.assert(calendarCheck.months === 1 && calendarCheck.days === 28, 'Calendar diff self-check failed');

function formatDate(date) {
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' })
    .format(date).replace('.', '').toUpperCase();
}

function hexToHsl(hex) {
  const value = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const spread = max - min;
  if (!spread) return { hue: 105, saturation: 0, lightness };
  const saturation = spread / (1 - Math.abs(2 * lightness - 1));
  let hue;
  if (max === r) hue = 60 * (((g - b) / spread) % 6);
  else if (max === g) hue = 60 * ((b - r) / spread + 2);
  else hue = 60 * ((r - g) / spread + 4);
  return { hue: hue < 0 ? hue + 360 : hue, saturation, lightness };
}

function hslToHex(hue, saturation, lightness) {
  const channel = (offset) => {
    const k = (offset + hue / 30) % 12;
    const spread = saturation * Math.min(lightness, 1 - lightness);
    return lightness - spread * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  return [channel(0), channel(8), channel(4)]
    .map((value) => Math.round(value * 255).toString(16).padStart(2, '0')).join('').replace(/^/, '#');
}

function setSkeleton(value) {
  const skeleton = skeletons[value] || skeletons.classic;
  skeletonImage.src = skeleton.src;
  skeletonImage.alt = skeleton.alt;
  skeletonStage.style.setProperty('--skeleton-width', `${skeleton.width}px`);
  skeletonStage.style.setProperty('--skeleton-margin-left', `${skeleton.width / -2}px`);
  skeletonStage.style.setProperty('--skeleton-offset', `${skeleton.offset || 0}px`);
  const anchoredComposition = skeleton.composite;
  skeletonStage.style.setProperty('--skeleton-top', anchoredComposition ? 'auto' : '50%');
  skeletonStage.style.setProperty('--skeleton-bottom', anchoredComposition ? '-17px' : 'auto');
  skeletonStage.style.setProperty('--skeleton-margin-top', anchoredComposition ? '0px' : '-110px');
  skeletonSelect.value = Object.keys(skeletons).find((key) => skeletons[key] === skeleton) || 'classic';
}

function applySkeletonColor(color) {
  const { hue, saturation } = hexToHsl(color);
  const delta = ((hue - 45 + 540) % 360) - 180;
  const amount = saturation === 0 ? 2 : Math.min(8, Math.max(2, saturation * 8));
  const bright = hslToHex(hue, Math.min(.86, saturation * .72), .78);
  const channels = [0, 2, 4].map((index) => parseInt(color.slice(1).slice(index, index + 2), 16));
  root.style.setProperty('--skeleton-hue', `${delta}deg`);
  root.style.setProperty('--skeleton-saturation', amount);
  root.style.setProperty('--acid', color);
  root.style.setProperty('--acid-bright', bright);
  root.style.setProperty('--line', `rgba(${channels.join(', ')}, .22)`);
  root.style.setProperty('--skeleton-color', color);
  colorInput.value = color;
  currentSkeletonColor = color;
  localStorage.setItem('bonebound-color', color);
}

function randomSkeletonColor() {
  const choices = colorPalette.filter((color) => color !== currentSkeletonColor);
  const index = crypto.getRandomValues(new Uint32Array(1))[0] % choices.length;
  applySkeletonColor(choices[index]);
}

function setTheme(value) {
  const theme = value === 'light' ? 'light' : 'dark';
  root.classList.remove('theme-dark', 'theme-light');
  root.classList.add(`theme-${theme}`);
  settingsPanel.style.setProperty('background', theme === 'light' ? 'rgba(250,250,250,.98)' : 'rgba(15,15,15,.98)', 'important');
  themeSelect.value = theme;
}

function updateCountdown() {
  const now = new Date();
  const diff = calendarDiff(now, target);
  $('months').textContent = pad(diff.months);
  $('days').textContent = pad(diff.days);
  $('hours').textContent = pad(diff.hours);
  $('minutes').textContent = pad(diff.minutes);
  $('seconds').textContent = pad(diff.seconds);
  $('countdown-caption').textContent = target <= now ? 'Событие уже началось' : 'До события';
}

function setPanel(open) {
  settingsPanel.classList.toggle('open', open);
  settingsPanel.setAttribute('aria-hidden', String(!open));
}

function setLayout(value) {
  root.classList.remove('layout-cards', 'layout-flat', 'layout-stamp');
  root.classList.add(value);
  layoutSelect.value = value;
}

function updateOpacityLabel() {
  opacityValue.textContent = `${Math.round(Number(opacityInput.value) * 100)}%`;
}

function applySettings() {
  target = getTargetFromInputs();
  eventTitle.textContent = titleInput.value.trim() || defaultEvent.title;
  eventDateLabel.textContent = formatDate(target);
  eventTimeLabel.textContent = timeInput.value || '00:00';
  localStorage.setItem('bonebound-settings', JSON.stringify({
    title: titleInput.value,
    date: dateInput.value,
    time: timeInput.value,
  }));
  localStorage.setItem('bonebound-view', JSON.stringify({
    skeleton: skeletonSelect.value,
    layout: layoutSelect.value,
    theme: themeSelect.value,
    opacity: Number(opacityInput.value),
    alwaysOnTop: alwaysOnTopInput.checked,
    autoStart: autostartInput.checked,
  }));
  setLayout(layoutSelect.value);
  window.widgetWindow?.setOpacity(opacityInput.value);
  window.widgetWindow?.setAlwaysOnTop(alwaysOnTopInput.checked);
  setPanel(false);
  updateCountdown();
}

if (settings) {
  const oldDefaults = settings.title === 'Ночь костей';
  titleInput.value = oldDefaults ? defaultEvent.title : (settings.title || defaultEvent.title);
  dateInput.value = oldDefaults ? defaultEvent.date : (settings.date || defaultEvent.date);
  timeInput.value = oldDefaults ? defaultEvent.time : (settings.time || defaultEvent.time);
}

themeSelect.value = view?.theme || 'dark';
skeletonSelect.value = view?.skeleton || 'classic';
layoutSelect.value = view?.layout || 'layout-cards';
opacityInput.value = view?.opacity || '.94';
alwaysOnTopInput.checked = view?.alwaysOnTop !== false;
autostartInput.checked = view?.autoStart === true;
setSkeleton(skeletonSelect.value);
setTheme(themeSelect.value);
applySkeletonColor(currentSkeletonColor);
updateOpacityLabel();
setLayout(layoutSelect.value);
applySettings();
setInterval(updateCountdown, 1000);

document.querySelector('#settings-trigger').addEventListener('click', () => setPanel(true));
document.querySelector('#panel-close').addEventListener('click', () => setPanel(false));
document.querySelector('#save-settings').addEventListener('click', applySettings);
document.querySelector('#close-button').addEventListener('click', () => window.widgetWindow?.close());
opacityInput.addEventListener('input', () => {
  updateOpacityLabel();
  window.widgetWindow?.setOpacity(opacityInput.value);
});
alwaysOnTopInput.addEventListener('change', () => window.widgetWindow?.setAlwaysOnTop(alwaysOnTopInput.checked));
autostartInput.addEventListener('change', () => {
  window.widgetWindow?.setAutoStart(autostartInput.checked);
  const currentView = JSON.parse(localStorage.getItem('bonebound-view') || '{}');
  localStorage.setItem('bonebound-view', JSON.stringify({ ...currentView, autoStart: autostartInput.checked }));
});
headColorTrigger.addEventListener('click', randomSkeletonColor);
skeletonSelect.addEventListener('change', () => setSkeleton(skeletonSelect.value));
colorInput.addEventListener('input', (event) => applySkeletonColor(event.target.value));
themeSelect.addEventListener('change', () => setTheme(themeSelect.value));

window.widgetWindow?.getAutoStart().then((enabled) => {
  autostartInput.checked = enabled;
  const currentView = JSON.parse(localStorage.getItem('bonebound-view') || '{}');
  localStorage.setItem('bonebound-view', JSON.stringify({ ...currentView, autoStart: enabled }));
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') setPanel(false);
});
