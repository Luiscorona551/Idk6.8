// The desktop lives behind this flow: server.js only serves it once /api/setup
// has handed out a session cookie. Without the Node backend the check falls
// back to a hash comparison, which is cosmetic — the real gate is the server.
const KEY_HASH = '7162a9d0745f45f2e3d86ae2ce9ee7472078a7da6113e8819bab128f4bbf330a';

const $ = id => document.getElementById(id);
const screens = document.querySelectorAll('.screen');
const installMusic = $('install-audio');
const shutdownAudio = $('shutdown-audio');
const PANIC_URL = 'https://classroom.google.com/';
const TIMEZONE_KEY = 'timezone';
const TIMEZONE_OFFSET_KEY = 'timezoneOffset';
const TIMEZONE_DST_KEY = 'timezoneDST';

let unlocked = false;

function show(id) {
  screens.forEach(screen => screen.classList.remove('show'));
  $(id).classList.add('show');
}

function savedPanicURL() {
  try {
    return JSON.parse(localStorage.getItem('panicURL')) || PANIC_URL;
  } catch (e) {
    return PANIC_URL;
  }
}

function beginShutdown() {
  $('click-overlay').style.display = 'none';
  $('help-ui').classList.add('hide');
  installMusic.pause();
  show('shutdown-screen');
  shutdownAudio.currentTime = 0;
  shutdownAudio.play().catch(() => {});

  setTimeout(() => {
    window.close();
    window.location.replace(savedPanicURL());
  }, 5200);
}

async function sha256(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Returns true when the key is accepted. The server sets the session cookie;
// if it is not running (static hosting) we compare hashes locally instead.
async function submitKey(key) {
  try {
    const res = await fetch('/api/setup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key })
    });
    if (res.status === 404) throw new Error('no backend');
    return res.ok;
  } catch (e) {
    return await sha256(key.toUpperCase()) === KEY_HASH;
  }
}

$('install-now-btn').addEventListener('click', () => {
  $('click-overlay').style.display = 'none';
  installMusic.play().catch(() => {});
  show('startup-screen');
  setTimeout(() => {
    show('setup1');
    $('help-ui').classList.remove('hide');
  }, 5000);
});

$('reg-next').addEventListener('click', () => {
  if ($('reg-no').checked) {
    alert('Closing Setup...');
    window.close();
    window.location.href = 'about:blank';
    return;
  }
  show('setup2');
});

$('accounts-next').addEventListener('click', () => {
  const name = $('account-name').value.trim();
  if (name) {
    try {
      localStorage.setItem('chatName', JSON.stringify(name));
    } catch (e) {
      // Continue setup when private browsing or browser storage blocks saving.
    }
  }
  show('setup3');
});

$('key-next').addEventListener('click', async () => {
  const button = $('key-next');
  button.disabled = true;
  unlocked = await submitKey($('key-field').value.trim());
  button.disabled = false;

  if (!unlocked) {
    $('error-text').style.display = 'block';
    return;
  }
  $('error-text').style.display = 'none';
  show('timezone-screen');
});

function timezoneOffsetMinutes(zone, date = new Date()) {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' })
      .formatToParts(date)
      .find(item => item.type === 'timeZoneName')?.value || 'GMT';
    if (part === 'GMT' || part === 'UTC') return 0;
    const match = part.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    if (!match) return 0;
    return (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3] || 0));
  } catch (e) {
    return 0;
  }
}

function formatOffset(minutes) {
  const sign = minutes < 0 ? '-' : '+';
  const absolute = Math.abs(minutes);
  return `GMT${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
}

function friendlyTimezone(zone) {
  if (zone === 'UTC') return 'Coordinated Universal Time';
  return zone.split('/').slice(-1)[0].replace(/_/g, ' ');
}

function populateTimezones() {
  const select = $('timezone-select');
  const known = new Set([...select.options].map(option => option.value));
  try {
    Intl.supportedValuesOf('timeZone').forEach(zone => {
      if (known.has(zone)) return;
      const option = document.createElement('option');
      option.value = zone;
      option.textContent = `(${formatOffset(timezoneOffsetMinutes(zone))}) ${friendlyTimezone(zone)}`;
      select.append(option);
    });
  } catch (e) {
    // The common zones above keep the selector usable in older browsers.
  }

  let preferred = 'America/Los_Angeles';
  try {
    const saved = localStorage.getItem(TIMEZONE_KEY);
    preferred = saved ? JSON.parse(saved) : Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch (e) {}
  if ([...select.options].some(option => option.value === preferred)) select.value = preferred;
  try {
    const savedDST = localStorage.getItem(TIMEZONE_DST_KEY);
    if (savedDST !== null) $('timezone-dst').checked = JSON.parse(savedDST);
  } catch (e) {}
  updateTimezoneOffset();
}

function updateTimezoneOffset() {
  $('timezone-offset').textContent = `Selected offset: ${formatOffset(timezoneOffsetMinutes($('timezone-select').value))}`;
}

$('timezone-select').addEventListener('change', updateTimezoneOffset);
$('timezone-next').addEventListener('click', () => {
  const zone = $('timezone-select').value;
  const offset = timezoneOffsetMinutes(zone);
  try {
    localStorage.setItem(TIMEZONE_KEY, JSON.stringify(zone));
    localStorage.setItem(TIMEZONE_OFFSET_KEY, JSON.stringify(offset));
    localStorage.setItem(TIMEZONE_DST_KEY, JSON.stringify($('timezone-dst').checked));
    $('timezone-summary').textContent = `${zone} (${formatOffset(offset)}), daylight saving ${$('timezone-dst').checked ? 'enabled' : 'disabled'}.`;
  } catch (e) {
    // Continue setup when browser storage is unavailable.
  }
  show('setup4');
});

populateTimezones();

$('finish-btn').addEventListener('click', () => {
  installMusic.pause();
  show('region-screen');
});

const TRANSLATIONS = {
  ES: {
    title: 'Seleccione Región y Estado',
    desc: 'Elija su ubicación para configurar el idioma.',
    region: 'Región:',
    state: 'Estado / Provincia:',
    next: 'Siguiente'
  },
  FR: {
    title: "Sélectionnez la région et l'état",
    desc: 'Choisissez votre emplacement pour définir la langue.',
    region: 'Région :',
    state: 'État / Province :',
    next: 'Suivant'
  },
  DE: {
    title: 'Region und Bundesland auswählen',
    desc: 'Wählen Sie Ihren Standort aus.',
    region: 'Region:',
    state: 'Bundesland:',
    next: 'Weiter'
  },
  JP: {
    title: '地域と州を選択してください',
    desc: '言語を設定する場所を選択します。',
    region: '地域:',
    state: '州 / 県:',
    next: '次へ'
  },
  US: {
    title: 'Select Region and State',
    desc: 'Choose your location to set the language.',
    region: 'Region:',
    state: 'State / Province:',
    next: 'Next'
  }
};

$('region-select').addEventListener('change', () => {
  const copy = TRANSLATIONS[$('region-select').value] || TRANSLATIONS.US;
  $('region-title').textContent = copy.title;
  $('region-desc').textContent = copy.desc;
  $('region-label').textContent = copy.region;
  $('state-label').textContent = copy.state;
  $('region-btn').textContent = copy.next;
});

$('region-btn').addEventListener('click', () => {
  $('help-ui').classList.add('hide');
  show('welcome-screen');
  $('welcome-audio').play().catch(() => {});
  setTimeout(() => window.location.replace('/desktop.html'), 4500);
});

if (new URLSearchParams(window.location.search).get('shutdown') === '1') {
  beginShutdown();
}

$('help-ui').addEventListener('click', () => {
  const help = {
    setup1: 'This is the registration screen. Choose whether you want to register now or later.',
    setup2: 'Please enter your name and alt accounts.',
    setup3: 'Enter the product key. Ask the owner for it.',
    setup4: "Your time zone is saved. Click 'Continue' to proceed to region settings.",
    'timezone-screen': 'Choose a global time zone and decide whether the clock should follow daylight saving changes.',
    'region-screen': 'Select your region and state to set your preferred language.'
  };
  const current = [...screens].find(screen => screen.classList.contains('show'));
    alert(`IDK 6.8 ASSISTANCE:\n\n${help[current?.id] ?? "Click 'start now' to begin."}`);
});
