// Time of day, weather and seasons for the map. "Avto" follows real Tashkent:
// local clock, sunrise/sunset, current weather (Open-Meteo, no key) and month.
import {createFx} from './fx.js?v=5';
import {createSound} from './sound.js?v=4';

const STORAGE_KEY = 'tiny-tashkent:atmosphere:v1';
const WEATHER_KEY = 'tiny-tashkent:weather:v1';
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast?latitude=41.3111&longitude=69.2797&current=temperature_2m,weather_code,snow_depth&daily=sunrise,sunset&timezone=Asia%2FTashkent&forecast_days=1';

export const GROUPS = {
  time: {label: 'VAQT', options: [['auto','Avto'],['dawn','Tong'],['day','Kun'],['golden','Oqshom'],['night','Tun']]},
  weather: {label: 'OB-HAVO', options: [['auto','Avto'],['clear','Quyosh'],['cloudy','Bulut'],['rain','Yomg‘ir'],['snow','Qor']]},
  season: {label: 'FASL', options: [['auto','Avto'],['spring','Bahor'],['summer','Yoz'],['autumn','Kuz'],['winter','Qish']]},
};
const valid = (group, value) => GROUPS[group].options.some(([id]) => id === value);

// lit = share of windows switched on, lamp = street lighting.
const TIMES = {
  dawn:   {mul:[1.03,.93,.92], add:[.05,.025,.045], night:0,   sun:.35, warm:.28, mist:.10, lit:.24, lamp:.30},
  day:    {mul:[1,1,1],        add:[0,0,0],         night:0,   sun:1,   warm:0,   mist:0,   lit:0,   lamp:0},
  golden: {mul:[1.08,.95,.80], add:[.025,.0,-.015], night:.08, sun:.8,  warm:1,   mist:0,   lit:.58, lamp:.45},
  dusk:   {mul:[.66,.62,.88],  add:[.02,.0,.045],   night:.5,  sun:0,   warm:.22, mist:.03, lit:.88, lamp:1},
  night:  {mul:[.28,.33,.52],  add:[0,.005,.03],    night:1,   sun:0,   warm:0,   mist:0,   lit:1,   lamp:1},
};
// lit here = how many people switch a lamp on because the day is gloomy.
const WEATHERS = {
  clear:  {cloud:0,   rain:0, snow:0, wet:0,  fog:0,   cover:0, lit:0},
  partly: {cloud:.35, rain:0, snow:0, wet:0,  fog:0,   cover:0, lit:.03},
  cloudy: {cloud:.85, rain:0, snow:0, wet:0,  fog:0,   cover:0, lit:.14},
  fog:    {cloud:.6,  rain:0, snow:0, wet:.2, fog:.42, cover:0, lit:.30},
  rain:   {cloud:1,   rain:1, snow:0, wet:1,  fog:.04, cover:0, lit:.24},
  storm:  {cloud:1,   rain:1, snow:0, wet:1,  fog:.07, cover:0, lit:.38},
  snow:   {cloud:.8,  rain:0, snow:1, wet:0,  fog:.07, cover:1, lit:.20},
};
const SEASONS = {
  spring: {spring:1, autumn:0, bare:0, cover:0},
  summer: {spring:0, autumn:0, bare:0, cover:0},
  autumn: {spring:0, autumn:1, bare:0, cover:0},
  winter: {spring:0, autumn:0, bare:1, cover:.85},
};
// Approximate Tashkent sunrise/sunset (local hours) per month, used until live data arrives.
const SUN_TABLE = [[7.8,17.2],[7.4,17.9],[6.6,18.5],[5.8,19.0],[5.1,19.6],[4.9,20.0],[5.1,19.9],[5.6,19.3],[6.1,18.5],[6.6,17.7],[7.2,17.1],[7.7,16.9]];
const WEATHER_NAMES = {clear:'ochiq havo', partly:'biroz bulutli', cloudy:'bulutli', fog:'tuman', rain:'yomg‘ir', storm:'momaqaldiroq', snow:'qor'};
const ICONS = {dawn:'☀', day:'☀', golden:'☀', dusk:'☾', night:'☾', cloudy:'☁', partly:'☁', fog:'☁', rain:'☂', storm:'☂', snow:'❄'};

function tashkentNow(date = new Date()) {
  const local = new Date(date.getTime() + 5 * 3600e3);
  return {hour: local.getUTCHours() + local.getUTCMinutes() / 60 + local.getUTCSeconds() / 3600, month: local.getUTCMonth(), minutes: local.getUTCMinutes(), hours: local.getUTCHours()};
}
function seasonOfMonth(month) { return month >= 2 && month <= 4 ? 'spring' : month >= 5 && month <= 7 ? 'summer' : month >= 8 && month <= 10 ? 'autumn' : 'winter'; }
export function weatherFromCode(code) {
  if (code === 0 || code === 1) return 'clear';
  if (code === 2) return 'partly';
  if (code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'storm';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  return 'partly';
}
const mixNumber = (a, b, t) => a + (b - a) * t;
function mixTime(a, b, t) {
  return {mul: a.mul.map((v, i) => mixNumber(v, b.mul[i], t)), add: a.add.map((v, i) => mixNumber(v, b.add[i], t)), night: mixNumber(a.night, b.night, t), lit: mixNumber(a.lit, b.lit, t), lamp: mixNumber(a.lamp, b.lamp, t), sun: mixNumber(a.sun, b.sun, t), warm: mixNumber(a.warm, b.warm, t), mist: mixNumber(a.mist, b.mist, t)};
}
// Continuous sky for a local hour, anchored to sunrise and sunset.
export function skyAt(hour, sunrise, sunset) {
  const keys = [[sunrise - 1.3, 'night'], [sunrise - .45, 'dusk'], [sunrise + .3, 'dawn'], [sunrise + 1.7, 'day'], [sunset - 1.9, 'day'], [sunset - .55, 'golden'], [sunset + .35, 'dusk'], [sunset + 1.2, 'night']];
  if (hour <= keys[0][0] || hour >= keys[keys.length - 1][0]) return {...mixTime(TIMES.night, TIMES.night, 0), name: 'night'};
  for (let i = 0; i < keys.length - 1; i++) {
    const [h0, a] = keys[i], [h1, b] = keys[i + 1];
    if (hour >= h0 && hour <= h1) { const t = (hour - h0) / (h1 - h0); return {...mixTime(TIMES[a], TIMES[b], t), name: t < .5 ? a : b}; }
  }
  return {...mixTime(TIMES.day, TIMES.day, 0), name: 'day'};
}

// Share of households still awake at a given local hour (1 = evening peak).
export function awakeAt(hour) {
  const h = (hour + 24) % 24, ramp = (from, to, a, b) => a + (b - a) * Math.min(1, Math.max(0, (h - from) / (to - from)));
  if (h >= 17 && h < 23) return 1;
  if (h >= 23) return ramp(23, 24, 1, .62);
  if (h < 1.5) return ramp(0, 1.5, .62, .3);
  if (h < 5) return .3;
  if (h < 7.5) return ramp(5, 7.5, .3, .75);
  return .75;
}

export function initAtmosphere({source, camera, viewport, requestDraw, toast, onActiveChange}) {
  const target = document.querySelector('#fx'), button = document.querySelector('#atmo-button'), panel = document.querySelector('#atmo-panel');
  const fx = target ? createFx(source, target) : null;
  if (!fx) { target?.remove(); document.querySelector('#atmo-bar')?.remove(); panel?.remove(); document.querySelector('#fx-toggle')?.remove(); return null; }

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const state = {time: 'auto', weather: 'auto', season: 'auto', enabled: true, sound: false};
  let fromLink = false;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && typeof saved === 'object') { for (const group of Object.keys(GROUPS)) if (valid(group, saved[group])) state[group] = saved[group]; if (typeof saved.enabled === 'boolean') state.enabled = saved.enabled; if (typeof saved.sound === 'boolean') state.sound = saved.sound; }
  } catch {}
  const persist = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {} };

  // A shared link may carry the scene: #map=...&atmo=golden.rain.autumn
  function readHash() {
    const raw = new URLSearchParams(location.hash.replace(/^#/, '')).get('atmo');
    if (!raw) return false;
    const [time, weather, season] = raw.split('.');
    let changed = false;
    for (const [group, value] of [['time', time], ['weather', weather], ['season', season]]) if (valid(group, value) && state[group] !== value) { state[group] = value; changed = true; }
    return changed;
  }
  fromLink = readHash();

  let live = null; // {temperature, code, snowDepth, sunrise, sunset, at}
  try { const cached = JSON.parse(sessionStorage.getItem(WEATHER_KEY)); if (cached && Date.now() - cached.at < 15 * 60e3) live = cached; } catch {}
  let weatherTimer = 0;
  async function refreshWeather() {
    clearTimeout(weatherTimer);
    weatherTimer = setTimeout(refreshWeather, 15 * 60e3);
    if (document.hidden || (live && Date.now() - live.at < 10 * 60e3)) return;
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(WEATHER_URL, {signal: controller.signal});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json(), hourOf = value => { const m = /T(\d\d):(\d\d)/.exec(value || ''); return m ? +m[1] + +m[2] / 60 : null; };
      const next = {temperature: data.current?.temperature_2m, code: data.current?.weather_code, snowDepth: data.current?.snow_depth || 0, sunrise: hourOf(data.daily?.sunrise?.[0]), sunset: hourOf(data.daily?.sunset?.[0]), at: Date.now()};
      if (!Number.isFinite(next.code)) throw new Error('No weather code');
      live = next;
      try { sessionStorage.setItem(WEATHER_KEY, JSON.stringify(live)); } catch {}
      retarget(); renderPanel();
    } catch {} finally { clearTimeout(timeout); }
  }

  // --- resolve the scene ---
  let resolved = {time: 'day', weather: 'clear', season: 'summer'};
  const look = {mul: [1,1,1], add: [0,0,0], night: 0, lit: 0, lamp: 0, sun: 1, warm: 0, spring: 0, autumn: 0, bare: 0, cover: 0, rain: 0, snow: 0, cloud: 0, wet: 0, fog: 0, flash: 0};
  let goal = null, settled = false;
  function computeGoal() {
    const now = tashkentNow();
    const [fallbackRise, fallbackSet] = SUN_TABLE[now.month];
    const sunrise = live?.sunrise ?? fallbackRise, sunset = live?.sunset ?? fallbackSet;
    const sky = state.time === 'auto' ? skyAt(now.hour, sunrise, sunset) : {...TIMES[state.time], name: state.time};
    const weatherName = state.weather === 'auto' ? (live ? weatherFromCode(live.code) : 'clear') : state.weather;
    const seasonName = state.season === 'auto' ? seasonOfMonth(now.month) : state.season;
    const weather = WEATHERS[weatherName], season = SEASONS[seasonName];
    // In fully automatic winter the ground is only white when Tashkent really has snow.
    let seasonCover = season.cover;
    if (seasonName === 'winter' && state.season === 'auto' && state.weather === 'auto' && live) seasonCover = live.snowDepth > .01 ? .9 : .2;
    resolved = {time: sky.name, weather: weatherName, season: seasonName};
    const overcast = weather.cloud;
    // Rain washes lying snow away; it does not sit under a downpour.
    const cover = Math.max(weather.rain ? seasonCover * .4 : seasonCover, weather.cover);
    // Windows: evening and gloomy weather add up. In the small hours of a real
    // night most of the city sleeps, while the street lamps stay on.
    let lit = 1 - (1 - sky.lit) * (1 - weather.lit);
    if (state.time === 'auto') lit *= mixNumber(1, awakeAt(now.hour), sky.night);
    const lamp = 1 - (1 - sky.lamp) * (1 - weather.lit * .9);
    return {
      mul: sky.mul, add: sky.add, night: sky.night, lit, lamp,
      sun: sky.sun * (1 - .85 * overcast), warm: sky.warm * (1 - .8 * overcast),
      spring: season.spring, autumn: season.autumn, bare: season.bare,
      cover,
      rain: weather.rain, snow: weather.snow, cloud: overcast, wet: weather.wet,
      fog: Math.min(.8, weather.fog + sky.mist), flash: 0,
    };
  }
  function retarget() {
    goal = computeGoal(); settled = false;
    document.body.classList.toggle('night', state.enabled && goal.night > .6);
    renderButton(); kick();
  }

  const sound = createSound(() => ({look, resolved, zoom: camera.z}));

  // The map is pixel art: one art pixel per world pixel. When zoomed in, the
  // shader works on that same grid so rain, snow and lit windows stay blocky
  // and aligned with the drawing instead of floating over it as smooth overlays.
  const LEVELS = 14, artPixel = zoom => zoom >= 1 ? zoom : 0;

  // --- drawing ---
  let last = 0, ticker = 0, lastRender = -1, nextFlash = 0, flashAt = -1, dirty = false;
  const epoch = performance.now();
  function stepLook(now) {
    const dt = Math.min(.1, last ? (now - last) / 1000 : .016); last = now;
    if (settled || !goal) return;
    const k = reduced.matches ? 1 : 1 - Math.exp(-dt * 2.6);
    let far = 0;
    for (const key of Object.keys(look)) {
      if (key === 'flash') continue;
      if (Array.isArray(look[key])) for (let i = 0; i < 3; i++) { look[key][i] += (goal[key][i] - look[key][i]) * k; far = Math.max(far, Math.abs(goal[key][i] - look[key][i])); }
      else { look[key] += (goal[key] - look[key]) * k; far = Math.max(far, Math.abs(goal[key] - look[key])); }
    }
    if (far < .004) { for (const key of Object.keys(look)) if (key !== 'flash') look[key] = Array.isArray(goal[key]) ? [...goal[key]] : goal[key]; settled = true; }
  }
  function stepFlash(now) {
    if (resolved.weather !== 'storm') { look.flash = 0; nextFlash = 0; return; }
    if (!nextFlash) nextFlash = now + 2500 + Math.random() * 5000;
    if (now > nextFlash) {
      flashAt = now; nextFlash = now + 5000 + Math.random() * 11000;
      // light first, thunder after: the further the strike, the longer the wait and the softer the roll
      const distance = Math.random(); sound.thunder(.25 + distance * 2.2, 1 - .45 * distance);
    }
    const age = now - flashAt;
    look.flash = !reduced.matches && flashAt > 0 && age < 420 ? (age < 70 ? .55 : age < 130 ? .08 : age < 210 ? .4 : .4 * (1 - (age - 210) / 210)) : 0;
  }
  function paint(now) {
    if (!state.enabled || fx.lost) return;
    if (dirty) { fx.upload(); dirty = false; }
    stepLook(now); stepFlash(now);
    const {width, height} = viewport();
    fx.render(look, camera, width, height, reduced.matches ? 0 : (now - epoch) / 1000, artPixel(camera.z), LEVELS);
    lastRender = now;
  }
  // How lively the idle scene needs to be: precipitation is smooth, a clear day only shimmers.
  function interval() {
    if (!settled || look.flash > 0 || resolved.weather === 'storm') return 0;
    if (reduced.matches) return Infinity;
    if (look.rain > .01 || look.snow > .01) return 0;
    return 90;
  }
  function tick(now) {
    ticker = 0;
    if (!state.enabled || document.hidden) return;
    const gap = interval();
    if (gap === Infinity) return;
    if (now - lastRender >= gap - 4) paint(now);
    ticker = requestAnimationFrame(tick);
  }
  function kick() { if (!ticker && state.enabled && !document.hidden) ticker = requestAnimationFrame(tick); }
  fx.onrestore = () => { dirty = true; requestDraw(); };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { last = 0; retarget(); void refreshWeather(); } });
  reduced.addEventListener?.('change', () => { settled = false; kick(); });
  setInterval(() => { if (!document.hidden && (state.time === 'auto' || state.season === 'auto')) retarget(); }, 60e3);

  // --- controls ---
  const label = (group, value) => GROUPS[group].options.find(([id]) => id === value)?.[1] ?? value;
  const TIME_NAMES = {dawn: 'Tong', day: 'Kun', golden: 'Oqshom', dusk: 'Shom', night: 'Tun'};
  function renderButton() {
    if (!button) return;
    const precipitation = ICONS[resolved.weather];
    button.querySelector('.atmo-icon').textContent = precipitation || ICONS[resolved.time] || '☀';
    const weatherLabel = {clear: 'Quyosh', partly: 'Bulutli', cloudy: 'Bulut', fog: 'Tuman', rain: 'Yomg‘ir', storm: 'Jala', snow: 'Qor'}[resolved.weather];
    button.querySelector('.atmo-text').textContent = `${TIME_NAMES[resolved.time]} · ${weatherLabel}`;
    button.querySelector('.atmo-season').textContent = label('season', resolved.season);
  }
  function renderPanel() {
    if (!panel) return;
    for (const node of panel.querySelectorAll('[data-group]')) node.setAttribute('aria-pressed', String(state[node.dataset.group] === node.dataset.value));
    const now = tashkentNow(), clock = `${String(now.hours).padStart(2, '0')}:${String(now.minutes).padStart(2, '0')}`;
    const parts = [clock];
    if (live && Number.isFinite(live.temperature)) parts.push(`${live.temperature > 0 ? '+' : ''}${Math.round(live.temperature)}°`);
    if (live) parts.push(WEATHER_NAMES[weatherFromCode(live.code)]);
    panel.querySelector('#atmo-live').textContent = parts.join(' · ');
    const allAuto = state.time === 'auto' && state.weather === 'auto' && state.season === 'auto';
    panel.querySelector('#atmo-reset').hidden = allAuto;
    panel.querySelector('#atmo-mode').textContent = allAuto ? 'JONLI' : 'QO‘LDA';
    panel.classList.toggle('manual', !allAuto);
  }
  function build() {
    if (!panel) return;
    const rows = panel.querySelector('#atmo-rows');
    for (const [group, {label: title, options}] of Object.entries(GROUPS)) {
      const row = document.createElement('div'); row.className = 'atmo-row'; row.setAttribute('role', 'group'); row.setAttribute('aria-label', title);
      const heading = document.createElement('span'); heading.className = 'atmo-row-title'; heading.textContent = title; row.append(heading);
      const set = document.createElement('div'); set.className = 'atmo-options';
      for (const [value, text] of options) {
        const option = document.createElement('button'); option.type = 'button'; option.dataset.group = group; option.dataset.value = value; option.textContent = text;
        option.addEventListener('click', () => choose(group, value)); set.append(option);
      }
      row.append(set); rows.append(row);
    }
    const open = value => { panel.hidden = !value; button.setAttribute('aria-expanded', String(value)); if (value) renderPanel(); };
    button.addEventListener('click', () => open(panel.hidden));
    panel.querySelector('#atmo-close').addEventListener('click', () => { open(false); button.focus(); });
    panel.querySelector('#atmo-reset').addEventListener('click', () => { state.time = state.weather = state.season = 'auto'; fromLink = false; persist(); retarget(); renderPanel(); toast('Hozirgi Toshkent: jonli vaqt va ob-havo'); });
    document.addEventListener('pointerdown', event => { if (!panel.hidden && !event.target.closest('#atmo-panel,#atmo-button')) open(false); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && !panel.hidden) { open(false); button.focus(); } });
  }
  function choose(group, value) {
    if (!valid(group, value)) return;
    state[group] = value; fromLink = false; persist(); retarget(); renderPanel();
  }
  function setEnabled(value, announce = true) {
    state.enabled = value; persist();
    target.hidden = !value; document.body.classList.toggle('fx-on', value);
    if (bar) bar.hidden = !value; if (!value && panel) panel.hidden = true; if (!value) sound.stop(); else if (state.sound) armSound();
    const toggle = document.querySelector('#fx-toggle'); toggle?.setAttribute('aria-pressed', String(value));
    if (value) { dirty = true; retarget(); } else document.body.classList.remove('night');
    onActiveChange?.(value); requestDraw();
    if (announce) toast(value ? 'Jonli atmosfera yoqildi' : 'Atmosfera o‘chirildi');
  }
  // --- sound: browsers only allow audio after a gesture, so a saved "on" waits for the first tap ---
  const bar = document.querySelector('#atmo-bar'), soundButton = document.querySelector('#sound-button');
  const showSound = () => { soundButton?.setAttribute('aria-pressed', String(state.sound)); if (soundButton) soundButton.title = state.sound ? 'Ovozni o‘chirish' : 'Shahar ovozlarini yoqish'; };
  function armSound() {
    if (sound.on || !state.sound) return;
    const begin = () => { removeEventListener('pointerdown', begin, true); removeEventListener('keydown', begin, true); if (state.sound && state.enabled) sound.start(); };
    addEventListener('pointerdown', begin, true); addEventListener('keydown', begin, true);
  }
  if (soundButton && !sound.supported) soundButton.remove();
  soundButton?.addEventListener('click', () => {
    state.sound = !state.sound; persist(); showSound();
    if (state.sound) { if (sound.start()) toast('Ovoz yoqildi: ' + soundscape()); else { state.sound = false; showSound(); toast('Bu brauzerda ovoz ishlamadi'); } }
    else { sound.stop(); toast('Ovoz o‘chirildi'); }
  });
  function soundscape() {
    if (resolved.weather === 'storm') return 'jala va momaqaldiroq';
    if (resolved.weather === 'rain') return 'yomg‘ir shovqini';
    if (resolved.weather === 'snow') return 'qorli sokinlik';
    if (look.night > .6) return resolved.season === 'winter' ? 'tungi shahar' : 'tungi chigirtkalar';
    return resolved.season === 'winter' ? 'qishki shahar' : 'qushlar va shahar';
  }
  showSound(); if (state.enabled) armSound();
  document.querySelector('#fx-toggle')?.addEventListener('click', () => setEnabled(!state.enabled));
  window.addEventListener('hashchange', () => { if (readHash()) { fromLink = true; retarget(); renderPanel(); } });

  build();
  target.hidden = !state.enabled; document.body.classList.toggle('fx-on', state.enabled);
  if (bar) bar.hidden = !state.enabled;
  document.querySelector('#fx-toggle')?.setAttribute('aria-pressed', String(state.enabled));
  goal = computeGoal();
  // First frame shows the scene immediately instead of fading in from a summer noon.
  for (const key of Object.keys(look)) if (key !== 'flash') look[key] = Array.isArray(goal[key]) ? [...goal[key]] : goal[key];
  settled = true;
  document.body.classList.toggle('night', state.enabled && goal.night > .6);
  renderButton(); renderPanel(); void refreshWeather();

  return {
    get active() { return state.enabled && !fx.lost; },
    // Called by the map right after it repaints its 2D canvas.
    mapDrawn(now) { if (!state.enabled) return; dirty = true; paint(now ?? performance.now()); kick(); },
    hashParam() { return state.time === 'auto' && state.weather === 'auto' && state.season === 'auto' ? '' : `&atmo=${state.time}.${state.weather}.${state.season}`; },
    // Re-light an exported still (share image) with the current scene.
    still(canvas, view, width, height) {
      const out = document.createElement('canvas'), still = createFx(canvas, out);
      if (!still) return null;
      still.upload();
      return still.render({...look, flash: 0}, view, width, height, (performance.now() - epoch) / 1000, artPixel(view.z), LEVELS) ? out : null;
    },
    describe() { return `${TIME_NAMES[resolved.time]} · ${label('season', resolved.season)}`; },
    state, sound, resolved: () => resolved, fromLink: () => fromLink,
  };
}
