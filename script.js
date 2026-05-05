

const API_KEY = '2bef5a2949b849daf4bf04885e6f6b46';
const GEO     = 'https://api.openweathermap.org/geo/1.0/direct';
const WX      = 'https://api.openweathermap.org/data/2.5/weather';
const FC      = 'https://api.openweathermap.org/data/2.5/forecast';
const AQI_URL = 'https://api.openweathermap.org/data/2.5/air_pollution';

/* ── DOM refs ── */
const cityInput      = document.getElementById('cityInput');
const searchBtn      = document.getElementById('searchBtn');
const clearBtn       = document.getElementById('clearBtn');
const errorMsg       = document.getElementById('errorMsg');
const loader         = document.getElementById('loader');
const weatherCard    = document.getElementById('weatherCard');
const forecastSec    = document.getElementById('forecastSection');
const hourlySec      = document.getElementById('hourlySection');
const forecastGrid   = document.getElementById('forecastGrid');
const hourlyScroll   = document.getElementById('hourlyScroll');
const recentsEl      = document.getElementById('recents');
const acDropdown     = document.getElementById('acDropdown');
const shareBtn       = document.getElementById('shareBtn');
const themeToggle    = document.getElementById('themeToggle');
const btnC           = document.getElementById('btnC');
const btnF           = document.getElementById('btnF');
const aqiBlock       = document.getElementById('aqiBlock');
const toast          = document.getElementById('toast');
const canvas         = document.getElementById('particleCanvas');
const ctx            = canvas.getContext('2d');

/* ── State ── */
let unit         = 'C';    // 'C' | 'F'
let isLight      = false;
let particles    = [];
let particleType = 'stars';
let lastWeatherData = null;
let currentCity  = '';

/* ── Recent searches (localStorage) ── */
const MAX_RECENTS = 5;
function getRecents() {
  try { return JSON.parse(localStorage.getItem('skyline_recents') || '[]'); } catch { return []; }
}
function saveRecent(city) {
  let r = getRecents().filter(c => c.toLowerCase() !== city.toLowerCase());
  r.unshift(city);
  r = r.slice(0, MAX_RECENTS);
  localStorage.setItem('skyline_recents', JSON.stringify(r));
  renderRecents();
}
function renderRecents() {
  const r = getRecents();
  recentsEl.innerHTML = '';
  r.forEach(city => {
    const chip = document.createElement('div');
    chip.className = 'recent-chip';
    chip.innerHTML = `<span class="chip-icon">🕐</span>${city}`;
    chip.addEventListener('click', () => {
      cityInput.value = city;
      showClearBtn();
      fetchWeather(city);
    });
    recentsEl.appendChild(chip);
  });
}
renderRecents();

/* ── Unit helpers ── */
function toDisplay(celsius) {
  return unit === 'C' ? Math.round(celsius) : Math.round(celsius * 9/5 + 32);
}
function unitLabel() { return `°${unit}`; }

btnC.addEventListener('click', () => {
  if (unit === 'C') return;
  unit = 'C';
  btnC.classList.add('active'); btnF.classList.remove('active');
  if (lastWeatherData) refreshDisplay(lastWeatherData);
});
btnF.addEventListener('click', () => {
  if (unit === 'F') return;
  unit = 'F';
  btnF.classList.add('active'); btnC.classList.remove('active');
  document.getElementById('tempUnit').textContent = '°F';
  if (lastWeatherData) refreshDisplay(lastWeatherData);
});

/* ── Theme toggle ── */
themeToggle.addEventListener('click', () => {
  isLight = !isLight;
  document.body.classList.toggle('light', isLight);
  themeToggle.textContent = isLight ? '☀️' : '🌙';
});

/* ── Clear button ── */
cityInput.addEventListener('input', () => {
  showClearBtn();
  scheduleAutocomplete(cityInput.value.trim());
});
function showClearBtn() {
  clearBtn.classList.toggle('visible', cityInput.value.length > 0);
}
clearBtn.addEventListener('click', () => {
  cityInput.value = '';
  clearBtn.classList.remove('visible');
  closeDropdown();
  cityInput.focus();
});

/* ══════════════════════════════════════════
   AUTOCOMPLETE — clean, professional
   ══════════════════════════════════════════ */
let acTimer       = null;
let acSuggestions = [];
let acActive      = -1;
let acLastQ       = '';

/* Country code → flag emoji */
function toFlag(code) {
  if (!code || code.length !== 2) return '📍';
  return [...code.toUpperCase()]
    .map(c => String.fromCodePoint(0x1F1E0 - 65 + c.charCodeAt(0)))
    .join('');
}

/* Bold the typed prefix; dim the rest */
function hlMatch(name, query) {
  const idx = name.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1 || !query) return name;
  return name.slice(0, idx + query.length) +
         `<mark>${name.slice(idx + query.length)}</mark>`;
}

function openDropdown()  { acDropdown.classList.add('open'); }
function closeDropdown() { acDropdown.classList.remove('open'); acActive = -1; }

function showAcLoading() {
  acDropdown.innerHTML = `
    <div class="ac-loading">
      <div class="ac-spinner"></div>Looking up cities…
    </div>`;
  openDropdown();
}

function showAcEmpty(q) {
  acDropdown.innerHTML = `<div class="ac-empty">No results for "${q}"</div>`;
  openDropdown();
}

function renderAc(cities, query) {
  acSuggestions = cities; acActive = -1;
  if (!cities.length) { showAcEmpty(query); return; }

  let html = `<div class="ac-header">Matching cities</div>`;
  cities.forEach((c, i) => {
    const flag = toFlag(c.country);
    const sub  = [c.state, c.country].filter(Boolean).join(' · ');
    html += `
      <div class="ac-item" data-i="${i}">
        <div class="ac-flag-wrap">${flag}</div>
        <div class="ac-text">
          <div class="ac-city">${hlMatch(c.name, query)}</div>
          ${sub ? `<div class="ac-sub">${sub}</div>` : ''}
        </div>
        ${c.country ? `<div class="ac-pill">${c.country}</div>` : ''}
      </div>`;
  });

  acDropdown.innerHTML = html;
  openDropdown();

  acDropdown.querySelectorAll('.ac-item').forEach(el => {
    el.addEventListener('mousedown', e => {
      e.preventDefault(); // keep input focused
      pickAc(parseInt(el.dataset.i));
    });
  });
}

function pickAc(idx) {
  const city = acSuggestions[idx];
  if (!city) return;
  const q = `${city.name},${city.country}`;
  cityInput.value = q;
  showClearBtn();
  closeDropdown();
  fetchWeather(q);
}

function hlItem(idx) {
  const items = acDropdown.querySelectorAll('.ac-item');
  items.forEach(el => el.classList.remove('ac-active'));
  if (idx >= 0 && idx < items.length) {
    items[idx].classList.add('ac-active');
    items[idx].scrollIntoView({ block: 'nearest' });
  }
  acActive = idx;
}

async function fetchAc(query) {
  if (query === acLastQ) return;
  acLastQ = query;
  if (query.length < 2) { closeDropdown(); return; }
  if (API_KEY === 'YOUR_API_KEY_HERE') { closeDropdown(); return; }

  showAcLoading();
  try {
    const res  = await fetch(`${GEO}?q=${encodeURIComponent(query)}&limit=7&appid=${API_KEY}`);
    const data = await res.json();
    if (query === acLastQ) renderAc(Array.isArray(data) ? data : [], query);
  } catch { closeDropdown(); }
}

function scheduleAutocomplete(q) {
  clearTimeout(acTimer);
  if (q.length < 2) { closeDropdown(); acLastQ = ''; return; }
  acTimer = setTimeout(() => fetchAc(q), 280);
}

/* Keyboard nav */
cityInput.addEventListener('keydown', e => {
  const items  = acDropdown.querySelectorAll('.ac-item');
  const isOpen = acDropdown.classList.contains('open');

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (isOpen && items.length) hlItem(Math.min(acActive + 1, items.length - 1));
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (isOpen && items.length) hlItem(Math.max(acActive - 1, 0));
  } else if (e.key === 'Escape') {
    closeDropdown();
  } else if (e.key === 'Enter') {
    if (isOpen && acActive >= 0) { e.preventDefault(); pickAc(acActive); }
    else { closeDropdown(); fetchWeather(cityInput.value); }
  }
});

/* Close on outside click */
document.addEventListener('click', e => {
  if (!document.getElementById('searchWrap').contains(e.target)) closeDropdown();
});

/* ══════════════════════════════════════════
   WEATHER FETCH + DISPLAY
   ══════════════════════════════════════════ */
async function fetchWeather(city) {
  city = city.trim();
  if (!city) return;

  if (API_KEY === 'YOUR_API_KEY_HERE') {
    showError('⚠ Paste your OpenWeatherMap API key in script.js');
    return;
  }

  showLoader(); clearError();

  try {
    const res = await fetch(`${WX}?q=${encodeURIComponent(city)}&appid=${API_KEY}&units=metric`);
    if (!res.ok) {
      if (res.status === 404) throw new Error('City not found. Check the spelling.');
      if (res.status === 401) throw new Error('Invalid API key.');
      throw new Error(`Error ${res.status}`);
    }
    const data = await res.json();
    lastWeatherData = data;
    currentCity = city;
    saveRecent(data.name + ', ' + data.sys.country);

    /* Parallel: forecast + AQI */
    const [fcRes, aqiRes] = await Promise.all([
      fetch(`${FC}?q=${encodeURIComponent(city)}&appid=${API_KEY}&units=metric`),
      fetch(`${AQI_URL}?lat=${data.coord.lat}&lon=${data.coord.lon}&appid=${API_KEY}`)
    ]);
    const fcData  = fcRes.ok  ? await fcRes.json()  : null;
    const aqiData = aqiRes.ok ? await aqiRes.json() : null;

    displayWeather(data, fcData, aqiData);

  } catch (err) {
    showError(err.message.includes('Failed to fetch') ? 'Network error. Check your connection.' : err.message);
    hideLoader();
  }
}

function displayWeather(data, fcData, aqiData) {
  refreshDisplay(data);         // main card
  if (fcData)  renderForecast(fcData.list, data.timezone);
  if (fcData)  renderHourly(fcData.list, data.timezone);
  if (aqiData) renderAQI(aqiData);

  applyTheme(data.weather[0].main);
  updateParticles(data.weather[0].main);
  hideLoader();
  weatherCard.classList.add('active');
  weatherCard.style.display = 'flex';
}

/* Called by both initial display and unit toggle */
function refreshDisplay(data) {
  const name    = data.name;
  const country = data.sys.country;
  const main    = data.weather[0].main;
  const desc    = data.weather[0].description;
  const icon    = data.weather[0].icon;
  const tempC   = data.main.temp;
  const feelsC  = data.main.feels_like;
  const minC    = data.main.temp_min;
  const maxC    = data.main.temp_max;
  const hum     = data.main.humidity;
  const windMs  = data.wind.speed;
  const vis     = data.visibility ? (data.visibility / 1000).toFixed(1) : '—';
  const pressure= data.main.pressure;
  const clouds  = data.clouds?.all ?? '—';
  const tz      = data.timezone;

  /* Local time */
  const utcMs   = Date.now() + new Date().getTimezoneOffset() * 60000;
  const localDt = new Date(utcMs + tz * 1000);
  const timeStr = localDt.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', hour12:true });
  const dateStr = localDt.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });

  /* Sunrise / Sunset in local tz */
  const srDt = new Date((data.sys.sunrise + tz - new Date().getTimezoneOffset()*60) * 1000);
  const ssDt = new Date((data.sys.sunset  + tz - new Date().getTimezoneOffset()*60) * 1000);
  const fmtT = dt => dt.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', hour12:true });

  /* Wind direction label */
  const dirs = ['N','NE','E','SE','S','SW','W','NW'];
  const windDir = dirs[Math.round((data.wind.deg || 0) / 45) % 8];
  const windKmh = (windMs * 3.6).toFixed(1);

  /* Populate */
  document.getElementById('cityName').textContent    = name;
  document.getElementById('cityMeta').textContent    = `${country} · ${dateStr}`;
  document.getElementById('localTime').textContent   = timeStr;
  document.getElementById('tempValue').textContent   = toDisplay(tempC);
  document.getElementById('tempUnit').textContent    = unitLabel();
  document.getElementById('conditionText').textContent = desc;
  document.getElementById('tempRange').textContent   = `${toDisplay(minC)}° / ${toDisplay(maxC)}°`;
  document.getElementById('humidity').textContent    = `${hum}%`;
  document.getElementById('windSpeed').textContent   = `${windKmh} km/h ${windDir}`;
  document.getElementById('feelsLike').textContent   = `${toDisplay(feelsC)}${unitLabel()}`;
  document.getElementById('visibility').textContent  = `${vis} km`;
  document.getElementById('sunrise').textContent     = fmtT(srDt);
  document.getElementById('sunset').textContent      = fmtT(ssDt);
  document.getElementById('pressure').textContent    = `${pressure} hPa`;
  document.getElementById('cloudiness').textContent  = `${clouds}%`;
  document.getElementById('weatherIcon').src         = `https://openweathermap.org/img/wn/${icon}@2x.png`;
  document.getElementById('weatherIcon').alt         = desc;
}

/* ── 5-Day Forecast ── */
const weatherEmoji = {
  Clear:'☀️', Clouds:'⛅', Rain:'🌧️', Drizzle:'🌦️',
  Thunderstorm:'⛈️', Snow:'❄️', Mist:'🌫️', Fog:'🌁',
  Haze:'🌤️', Dust:'🌪️', Smoke:'💨', Tornado:'🌪️',
};
function wxEmoji(main) { return weatherEmoji[main] || '🌡️'; }

function renderForecast(list, tz) {
  const days = {};
  list.forEach(item => {
    const utc   = item.dt * 1000 + tz * 1000 + new Date().getTimezoneOffset() * 60000;
    const day   = new Date(utc).toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
    const short = new Date(utc).toLocaleDateString('en-US', { weekday:'short' });
    if (!days[day]) days[day] = { short, hi:-999, lo:999, main:item.weather[0].main, desc:item.weather[0].description };
    if (item.main.temp_max > days[day].hi) days[day].hi = item.main.temp_max;
    if (item.main.temp_min < days[day].lo) days[day].lo = item.main.temp_min;
    if (item.dt_txt.includes('12:00')) days[day].main = item.weather[0].main;
  });

  forecastGrid.innerHTML = '';
  Object.values(days).slice(0,5).forEach(d => {
    const card = document.createElement('div');
    card.className = 'fc-card';
    card.innerHTML = `
      <div class="fc-day">${d.short}</div>
      <div class="fc-icon">${wxEmoji(d.main)}</div>
      <div class="fc-hi">${toDisplay(d.hi)}°</div>
      <div class="fc-lo">${toDisplay(d.lo)}°</div>
    `;
    forecastGrid.appendChild(card);
  });

  forecastSec.style.display = 'block';
}

/* ── Hourly (next 24h) ── */
function renderHourly(list, tz) {
  hourlyScroll.innerHTML = '';
  list.slice(0, 8).forEach(item => {
    const utc  = item.dt * 1000 + tz * 1000 + new Date().getTimezoneOffset() * 60000;
    const time = new Date(utc).toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', hour12:true });
    const pop  = item.pop ? Math.round(item.pop * 100) : 0;
    const card = document.createElement('div');
    card.className = 'hr-card';
    card.innerHTML = `
      <div class="hr-time">${time}</div>
      <div class="hr-icon">${wxEmoji(item.weather[0].main)}</div>
      <div class="hr-temp">${toDisplay(item.main.temp)}°</div>
      ${pop > 10 ? `<div class="hr-pop">💧${pop}%</div>` : ''}
    `;
    hourlyScroll.appendChild(card);
  });
  hourlySec.style.display = 'block';
}

/* ── AQI ── */
const aqiLabels = ['—', 'Good', 'Fair', 'Moderate', 'Poor', 'Very Poor'];
const aqiColors = ['#6b7280', '#22c55e', '#84cc16', '#f59e0b', '#ef4444', '#9333ea'];
function renderAQI(data) {
  const aqi = data.list?.[0]?.main?.aqi;
  if (!aqi) return;
  const label = aqiLabels[aqi] || '—';
  const color = aqiColors[aqi] || '#6b7280';
  const pct   = ((aqi - 1) / 4) * 100;
  document.getElementById('aqiText').textContent  = label;
  document.getElementById('aqiText').style.color  = color;
  document.getElementById('aqiBar').style.width   = `${pct}%`;
  document.getElementById('aqiBar').style.background = color;
  aqiBlock.style.display = 'flex';
}

/* ── Theme engine ── */
const themeMap = {
  Clear:'Clear', Clouds:'Clouds', Rain:'Rain', Drizzle:'Rain',
  Thunderstorm:'Thunderstorm', Snow:'Snow', Mist:'Mist',
  Fog:'Mist', Haze:'Mist', Smoke:'Mist', Dust:'Mist', Sand:'Mist',
  Ash:'Mist', Squall:'Rain', Tornado:'Thunderstorm',
};
function applyTheme(main) {
  document.body.setAttribute('data-weather', themeMap[main] || 'Clouds');
}

/* ── Particle canvas ── */
function resizeCanvas() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }

function createParticles(type) {
  particles = [];
  const n = type === 'rain' ? 130 : type === 'snow' ? 65 : 85;
  for (let i = 0; i < n; i++) {
    if (type === 'rain') particles.push({ x:Math.random()*canvas.width, y:Math.random()*canvas.height, len:Math.random()*20+10, speed:Math.random()*8+8, op:Math.random()*0.4+0.1 });
    else if (type === 'snow') particles.push({ x:Math.random()*canvas.width, y:Math.random()*canvas.height, r:Math.random()*3+1, speed:Math.random()*1+0.4, drift:(Math.random()-0.5)*0.5, op:Math.random()*0.5+0.2 });
    else particles.push({ x:Math.random()*canvas.width, y:Math.random()*canvas.height, r:Math.random()*1.5+0.3, tw:Math.random()*Math.PI*2, speed:Math.random()*0.02+0.005 });
  }
}

function animateParticles() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  particles.forEach(p => {
    if (particleType === 'rain') {
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x-2, p.y+p.len);
      ctx.strokeStyle = `rgba(155,200,255,${p.op})`; ctx.lineWidth=1; ctx.stroke();
      p.y += p.speed; p.x -= 1.5;
      if (p.y > canvas.height) { p.y = -p.len; p.x = Math.random()*canvas.width; }
    } else if (particleType === 'snow') {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
      ctx.fillStyle = `rgba(220,235,255,${p.op})`; ctx.fill();
      p.y += p.speed; p.x += p.drift;
      if (p.y > canvas.height) { p.y = -p.r; p.x = Math.random()*canvas.width; }
    } else {
      p.tw += p.speed;
      const a = (Math.sin(p.tw)+1)/2*0.6+0.1;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
      ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.fill();
    }
  });
  requestAnimationFrame(animateParticles);
}

function updateParticles(main) {
  particleType = ['Rain','Drizzle','Squall','Thunderstorm'].includes(main) ? 'rain'
               : main === 'Snow' ? 'snow' : 'stars';
  createParticles(particleType);
}

/* ── Share button ── */
shareBtn.addEventListener('click', () => {
  if (!lastWeatherData) return;
  const d    = lastWeatherData;
  const temp = toDisplay(d.main.temp);
  const text = `🌤 ${d.name}, ${d.sys.country}\n${temp}${unitLabel()} · ${d.weather[0].description}\nChecked via Skyline Weather`;
  if (navigator.share) {
    navigator.share({ title:'Skyline Weather', text }).catch(() => {});
  } else {
    navigator.clipboard.writeText(text).then(() => showToast('Weather copied to clipboard!'));
  }
});

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2800);
}

/* ── UI helpers ── */
function showLoader() {
  loader.classList.add('active');
  weatherCard.classList.remove('active'); weatherCard.style.display = 'none';
  forecastSec.style.display = 'none';
  hourlySec.style.display = 'none';
  aqiBlock.style.display = 'none';
}
function hideLoader() { loader.classList.remove('active'); }
function showError(msg) { errorMsg.textContent = msg; errorMsg.classList.add('show'); }
function clearError()   { errorMsg.textContent = ''; errorMsg.classList.remove('show'); }

/* ── Event listeners ── */
searchBtn.addEventListener('click', () => { closeDropdown(); fetchWeather(cityInput.value); });

/* ── Init ── */
resizeCanvas();
createParticles('stars');
animateParticles();
window.addEventListener('resize', () => { resizeCanvas(); createParticles(particleType); });
