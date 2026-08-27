const GAME_CDN = 'https://cdn.jsdelivr.net/gh/bubbls/ugs-singlefile/UGS-Files/';
const GAME_ICON_CDN = 'https://cdn.jsdelivr.net/gh/bubbls/UGS-Assets@main/';

const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* storage unavailable */ }
  }
};

const PANIC_URL = 'https://classroom.google.com/';
const DEFAULT_WALLPAPER = 'https://plain-wnam-prod-public.komododecks.com/202608/09/2mq0HYHmjO3qexTDZY9G/image.png';
const FALLBACK_WALLPAPER = 'linear-gradient(135deg, #16224a, #2b1748)';
const THEMES = ['midnight', 'neon', 'sunset', 'mono', 'ocean', 'forest', 'candy'];
const WALLPAPER_PRESETS = [
  { value: DEFAULT_WALLPAPER, label: 'IDK Blue' },
  { value: 'linear-gradient(135deg, #101a3d 0%, #16224a 48%, #4b1f57 100%)', label: 'Violet Horizon' },
  { value: 'radial-gradient(circle at 18% 20%, rgba(126, 246, 168, .24), transparent 26%), linear-gradient(135deg, #062a35, #071020 58%, #123f4c)', label: 'Neon Tide' },
  { value: 'linear-gradient(135deg, #27182d 0%, #6b2d50 52%, #f08a65 100%)', label: 'Sunset Bloom' },
  { value: 'linear-gradient(135deg, #080b13 0%, #202938 48%, #596273 100%)', label: 'Graphite' }
];
const MOVIE_WATCHLIST_KEY = 'idkMovieWatchlist';
const MOVIE_HISTORY_KEY = 'idkMovieHistory';

function applyWallpaper(url) {
  const safeURL = String(url || '').trim().replace(/["\\\r\n]/g, '');
  const isGradient = /^(linear|radial|conic)-gradient\(/.test(safeURL);
  const value = safeURL ? (isGradient ? safeURL : `url("${safeURL}"), ${FALLBACK_WALLPAPER}`) : FALLBACK_WALLPAPER;
  document.documentElement.style.setProperty('--wallpaper', value);
}

function applyTheme(name) {
  document.getElementById('desktop')?.setAttribute('data-theme', THEMES.includes(name) ? name : 'midnight');
}

function applyIconSize(size) {
  document.getElementById('desktop')?.setAttribute('data-icon-size', ['compact', 'normal', 'large'].includes(size) ? size : 'normal');
}

function applyDockPosition(position) {
  document.getElementById('desktop')?.setAttribute('data-dock', ['bottom', 'left', 'right'].includes(position) ? position : 'bottom');
}

function applyMotion(mode) {
  document.getElementById('desktop')?.setAttribute('data-motion', mode === 'off' ? 'off' : 'on');
}

async function loadJSON(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Failed to load ${path} (${res.status})`);
  return res.json();
}

function gameFileName(name) {
  return name.includes('.') && name.lastIndexOf('.') > 0 ? name : `${name}.html`;
}

function gameTitle(name) {
  const base = name.replace(/^cl/i, '').replace(/\.[a-z0-9]+$/i, '');
  return base.replace(/[-_]+/g, ' ').trim() || name;
}

function gameIconURL(path) {
  return path ? `${GAME_ICON_CDN}${path.split('/').map(encodeURIComponent).join('/')}` : '';
}

async function gameBlobURL(name) {
  const url = `${GAME_CDN}${encodeURIComponent(gameFileName(name))}?t=${Date.now()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch "${name}" (${res.status})`);
  const html = await res.text();
  return URL.createObjectURL(new Blob([html], { type: 'text/html' }));
}

function el(tag, props = {}, children = []) {
  const node = Object.assign(document.createElement(tag), props);
  children.forEach(child => node.append(child));
  return node;
}

function emptyState(message) {
  return el('div', { className: 'empty-state', innerHTML: message });
}

function loadingState(label = 'Loading') {
  return el('div', { className: 'loading-state', role: 'status', 'aria-live': 'polite' }, [
    el('span', { className: 'loading-orbit', 'aria-hidden': 'true' }),
    el('strong', { textContent: label }),
    el('span', { className: 'loading-dots', textContent: 'Please wait' })
  ]);
}

// Sites that send X-Frame-Options / frame-ancestors cannot render inside an
// iframe at all, so they get a launch card instead of a permanently broken frame.
function externalSite(url, label, { embeddable = true } = {}) {
  const root = el('div', { className: 'site-frame' });
  const openTab = () => window.open(url, '_blank', 'noopener');

  const bar = el('div', { className: 'toolbar' }, [
    el('span', { className: 'count', textContent: new URL(url).hostname })
  ]);
  const popOut = el('button', { className: 'btn tab', type: 'button', textContent: 'Open in new tab' });
  popOut.addEventListener('click', openTab);
  bar.append(el('span', { style: 'flex:1' }), popOut);

  if (embeddable) {
    root.append(bar, el('iframe', { src: url, allow: 'autoplay; fullscreen; clipboard-write' }));
    return root;
  }

  const launch = el('button', { className: 'btn', type: 'button', textContent: `Open ${label}` });
  launch.addEventListener('click', openTab);

  const viaProxy = el('button', { className: 'btn', type: 'button', textContent: 'Open here through the proxy' });
  viaProxy.hidden = true;
  viaProxy.addEventListener('click', async () => {
    viaProxy.textContent = 'Connecting…';
    try {
      const frame = el('iframe', { src: await PROXY.encode(url), allow: 'autoplay; fullscreen; clipboard-write' });
      root.replaceChildren(bar, frame);
    } catch (err) {
      viaProxy.textContent = err.message;
    }
  });
  PROXY.backendAvailable().then(ok => { viaProxy.hidden = !ok; });

  root.append(bar, el('div', { className: 'empty-state blocked' }, [
    el('p', { textContent: `${label} blocks being embedded in another page, so it opens in its own tab.` }),
    launch,
    viaProxy
  ]));
  return root;
}

function movieSource(url, label, repository) {
  const root = externalSite(url, label);
  const frame = root.querySelector('iframe');
  const status = el('span', { className: 'movie-source-status checking', textContent: 'Checking source…' });
  if (frame) {
    frame.dataset.tvSource = 'movie';
    frame.title = `${label} browser`;
    frame.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media';
    frame.allowFullscreen = true;
    const markOnline = () => {
      status.className = 'movie-source-status online';
      status.textContent = 'Source online';
      status.title = `${label} responded successfully.`;
    };
    const markOffline = () => {
      status.className = 'movie-source-status offline';
      status.textContent = 'Unavailable · try other source';
      status.title = `Try another source or open ${label} in a new tab.`;
    };
    const timeout = setTimeout(markOffline, 9000);
    frame.addEventListener('load', () => { clearTimeout(timeout); markOnline(); }, { once: true });
    frame.addEventListener('error', () => { clearTimeout(timeout); markOffline(); }, { once: true });
  }
  const bar = root.querySelector('.toolbar');
  if (!bar) return root;
  bar.querySelector('span[style*="flex"]')?.before(status);
  if (!repository) return root;
  const source = el('button', { className: 'btn tab', type: 'button', textContent: 'View GitHub repo' });
  source.addEventListener('click', () => window.open(repository, '_blank', 'noopener'));
  bar.append(source);
  return root;
}

function movieEntries(key, limit = 24) {
  const entries = store.get(key, []);
  return Array.isArray(entries)
    ? entries.filter(item => item && item.title && item.url).slice(0, limit)
    : [];
}

function saveMovieEntries(key, entries, limit = 24) {
  store.set(key, entries.slice(0, limit));
}

function moviesApp() {
  const sources = [
    {
      id: 'archive',
      title: 'Archive Browser',
      url: 'https://archive-movie-browser.vercel.app/',
      repository: 'https://github.com/amponce/archive-movie-browser'
    },
    {
      id: 'globe-tv',
      title: 'Globe TV',
      url: 'https://globetv.app/'
    },
    {
      id: 'bw-cinema',
      title: 'BW Cinema Fork',
      url: 'https://corvid-agent.github.io/bw-cinema/',
      repository: 'https://github.com/corvid-agent/bw-cinema'
    }
  ];
  const root = el('div', { className: 'movies-app' });
  const browser = tabbedApp(sources.map(source => ({
    title: source.title,
    render: () => movieSource(source.url, source.title, source.repository)
  })));
  const toggle = el('button', { className: 'btn tab', type: 'button', textContent: 'Watchlist (0)', 'aria-expanded': 'false' });
  const count = el('span', { className: 'count', textContent: '0 saved' });
  const titleInput = el('input', { className: 'field', type: 'text', placeholder: 'Movie or show title' });
  const urlInput = el('input', { className: 'field', type: 'url', placeholder: 'Paste a movie or show link to save' });
  const sourceInput = el('select', { className: 'field', 'aria-label': 'Movie source' });
  sources.forEach(source => sourceInput.append(el('option', { value: source.id, textContent: source.title })));
  const feedback = el('span', { className: 'movie-watchlist-feedback', role: 'status' });
  const list = el('div', { className: 'movie-watchlist-list' });
  const panel = el('section', { className: 'movie-watchlist', hidden: true }, [
    el('div', { className: 'movie-watchlist-heading' }, [
      el('div', {}, [el('strong', { textContent: 'Watchlist' }), el('small', { textContent: 'Save a movie or TV show link to return to it later.' })]),
      count
    ]),
    el('form', { className: 'movie-watchlist-form' }, [
      titleInput,
      urlInput,
      sourceInput,
      el('button', { className: 'btn', type: 'submit', textContent: 'Save item' })
    ]),
    feedback,
    list
  ]);
  const toolbar = el('div', { className: 'movies-toolbar' }, [
    el('div', { className: 'movies-heading' }, [el('strong', { textContent: 'Movies & TV' }), el('small', { textContent: 'Choose a catalog, then minimize it to watch on TV.' })]),
    toggle
  ]);

  const sourceFor = item => sources.find(source => source.id === item.source) || sources[0];
  const record = item => {
    const history = movieEntries(MOVIE_HISTORY_KEY, 12);
    const next = [{ ...item, lastWatched: Date.now() }, ...history.filter(entry => entry.url !== item.url)].slice(0, 12);
    saveMovieEntries(MOVIE_HISTORY_KEY, next, 12);
  };
  const navigateTo = item => {
    const source = sourceFor(item);
    const tabs = [...browser.querySelectorAll(':scope > .toolbar > .tab')];
    tabs.find(button => button.textContent === source.title)?.click();
    let tries = 0;
    const apply = () => {
      const frame = browser.querySelector('.tab-body iframe[data-tv-source="movie"]');
      if (frame) {
        frame.src = item.url;
        feedback.textContent = `Opening ${item.title}`;
        return;
      }
      if (tries++ < 30) setTimeout(apply, 100);
    };
    apply();
  };
  const card = (item, removable) => {
    const source = sourceFor(item);
    const open = el('button', { className: 'btn tab', type: 'button', textContent: 'Resume' });
    open.addEventListener('click', () => { record(item); navigateTo(item); render(); });
    const actions = [open];
    if (removable) {
      const remove = el('button', { className: 'btn tab', type: 'button', textContent: 'Remove' });
      remove.addEventListener('click', () => {
        saveMovieEntries(MOVIE_WATCHLIST_KEY, movieEntries(MOVIE_WATCHLIST_KEY).filter(entry => entry.url !== item.url));
        render();
      });
      actions.push(remove);
    }
    return el('article', { className: 'movie-watchlist-card' }, [
      el('div', { className: 'movie-watchlist-copy' }, [
        el('strong', { textContent: item.title }),
        el('small', { textContent: `${source.title} · ${item.lastWatched ? 'Ready to resume' : 'Saved item'}` })
      ]),
      el('div', { className: 'movie-watchlist-actions' }, actions)
    ]);
  };
  const render = () => {
    const saved = movieEntries(MOVIE_WATCHLIST_KEY);
    const history = movieEntries(MOVIE_HISTORY_KEY, 12).sort((a, b) => (b.lastWatched || 0) - (a.lastWatched || 0));
    count.textContent = `${saved.length} saved`;
    toggle.textContent = `Watchlist (${saved.length})`;
    list.replaceChildren();
    if (history.length) {
      list.append(el('h3', { className: 'movie-watchlist-section-title', textContent: 'Continue watching' }));
      history.slice(0, 4).forEach(item => list.append(card(item, false)));
    }
    list.append(el('h3', { className: 'movie-watchlist-section-title', textContent: 'My watchlist' }));
    if (!saved.length) list.append(el('div', { className: 'movie-watchlist-empty', textContent: 'Your saved movies will appear here.' }));
    saved.forEach(item => list.append(card(item, true)));
  };
  panel.querySelector('form').addEventListener('submit', event => {
    event.preventDefault();
    const title = titleInput.value.trim();
    const url = urlInput.value.trim();
    try {
      const parsed = new URL(url);
      if (!title || !['http:', 'https:'].includes(parsed.protocol)) throw new Error();
    } catch {
      feedback.textContent = 'Enter a title and a valid movie link.';
      return;
    }
    const saved = movieEntries(MOVIE_WATCHLIST_KEY).filter(item => item.url !== url);
    saveMovieEntries(MOVIE_WATCHLIST_KEY, [{ id: `${Date.now()}`, title, url, source: sourceInput.value }, ...saved]);
    titleInput.value = urlInput.value = '';
    feedback.textContent = `${title} saved.`;
    render();
  });
  toggle.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    toggle.setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden) render();
  });
  render();
  root.append(toolbar, panel, browser);
  return root;
}

function tabbedApp(tabs) {
  const root = el('div', { className: 'tabbed' });
  const bar = el('div', { className: 'toolbar' });
  const body = el('div', { className: 'tab-body' });
  root.append(bar, body);
  let tabLoadId = 0;
  let busyTab = 0;
  const renderedViews = new Set();

  const renderTab = tab => {
    const setBusy = loading => {
      if (typeof OS !== 'undefined') OS.setLoading(loading);
    };
    if (busyTab) {
      setBusy(false);
      busyTab = 0;
    }
    const loadId = ++tabLoadId;
    const stopBusy = () => {
      if (busyTab !== loadId) return;
      busyTab = 0;
      body.classList.remove('is-loading');
      setBusy(false);
    };

    setBusy(true);
    busyTab = loadId;
    body.classList.remove('tab-swap');
    void body.offsetWidth;
    body.classList.add('is-loading');
    let view;
    try {
      view = tab.render();
      renderedViews.add(view);
      body.replaceChildren(view);
    } catch (error) {
      body.replaceChildren(emptyState(error.message));
      stopBusy();
      return;
    }
    body.classList.add('tab-swap');

    const frame = view.matches?.('iframe') ? view : view.querySelector?.('iframe');
    if (frame) {
      frame.addEventListener('load', stopBusy, { once: true });
      setTimeout(stopBusy, 6000);
    } else {
      setTimeout(stopBusy, 350);
    }
  };

  const buttons = tabs.map((tab, index) => {
    const btn = el('button', { className: 'btn tab', type: 'button', textContent: tab.title });
    btn.addEventListener('click', () => {
      buttons.forEach(other => other.classList.remove('active'));
      btn.classList.add('active');
      renderTab(tab);
    });
    if (index === 0) btn.classList.add('active');
    bar.append(btn);
    return btn;
  });

  renderTab(tabs[0]);
  root.cleanup = () => {
    if (busyTab) {
      busyTab = 0;
      if (typeof OS !== 'undefined') OS.setLoading(false);
    }
    renderedViews.forEach(view => view?.cleanup?.());
  };
  return root;
}

// Drive blocks the normal UI in an iframe, but the embedded folder view renders
// fine for anyone-with-the-link folders.
function driveFolder(id, label) {
  const root = el('div', { className: 'site-frame' });
  const shareURL = `https://drive.google.com/drive/folders/${id}`;

  const bar = el('div', { className: 'toolbar' }, [
    el('span', { className: 'count', textContent: label }),
    el('span', { style: 'flex:1' })
  ]);
  const openTab = el('button', { className: 'btn tab', type: 'button', textContent: 'Open in Drive' });
  openTab.addEventListener('click', () => window.open(shareURL, '_blank', 'noopener'));
  bar.append(openTab);

  root.append(bar, el('iframe', {
    src: `https://drive.google.com/embeddedfolderview?id=${id}#grid`
  }));
  return root;
}

function audioPlayer() {
  const root = el('div', { className: 'app player-app' });
  const audio = el('audio', { controls: true, className: 'audio' });
  const now = el('p', { className: 'now-playing', textContent: 'Nothing loaded yet.' });
  const visualizer = el('div', { className: 'audio-visualizer', 'aria-hidden': 'true' });
  const visualizerBars = Array.from({ length: 18 }, () => el('i', { className: 'audio-bar' }));
  visualizer.append(...visualizerBars);
  let meterFrame = 0;
  let activeObjectURL = '';

  const visualLevel = () => {
    const time = audio.currentTime || 0;
    const beat = .5 + .5 * Math.sin(time * 7.4 + performance.now() / 180);
    return .16 + beat * .84;
  };
  const syncSpeaker = (type, level = visualLevel()) => {
    const detail = {
      type,
      name: now.textContent,
      playing: !audio.paused && !audio.ended,
      currentTime: audio.currentTime || 0,
      duration: Number.isFinite(audio.duration) ? audio.duration : 0,
      volume: audio.volume,
      level,
      audio
    };
    window.IDK_AUDIO_STATE = detail;
    window.dispatchEvent(new CustomEvent('idk-audio-state', { detail }));
  };
  const animateMeter = () => {
    if (audio.paused || audio.ended) {
      visualizerBars.forEach((bar, index) => { bar.style.height = `${8 + (index % 3) * 3}px`; });
      meterFrame = 0;
      return;
    }
    const level = visualLevel();
    visualizerBars.forEach((bar, index) => {
      const wave = .35 + .65 * Math.abs(Math.sin(audio.currentTime * 5.5 + index * .72));
      bar.style.height = `${8 + Math.round(level * wave * 42)}px`;
    });
    syncSpeaker('meter', level);
    meterFrame = requestAnimationFrame(animateMeter);
  };
  const startMeter = () => {
    cancelAnimationFrame(meterFrame);
    meterFrame = requestAnimationFrame(animateMeter);
  };
  ['play', 'pause', 'ended', 'loadedmetadata', 'timeupdate', 'volumechange'].forEach(type => audio.addEventListener(type, () => {
    syncSpeaker(type);
    if (type === 'play') startMeter();
    if (type === 'pause' || type === 'ended') cancelAnimationFrame(meterFrame);
  }));

  const url = el('input', { className: 'field', type: 'url', placeholder: 'Paste an audio URL or Drive file link' });
  const play = el('button', { className: 'btn', type: 'button', textContent: 'Play' });
  play.addEventListener('click', () => {
    const value = url.value.trim();
    if (!value) return;
    if (activeObjectURL) {
      URL.revokeObjectURL(activeObjectURL);
      activeObjectURL = '';
    }
    audio.src = driveDirectURL(value);
    now.textContent = value;
    syncSpeaker('source');
    audio.play().catch(() => { now.textContent = 'That link could not be played directly.'; syncSpeaker('pause'); });
  });

  const picker = el('input', { type: 'file', accept: 'audio/*', multiple: true, className: 'field' });
  const queue = el('div', { className: 'tile-grid' });
  picker.addEventListener('change', () => {
    queue.replaceChildren();
    Array.from(picker.files).forEach(file => {
      const tile = el('button', { className: 'tile', type: 'button', textContent: file.name });
      tile.addEventListener('click', () => {
        if (activeObjectURL) URL.revokeObjectURL(activeObjectURL);
        activeObjectURL = URL.createObjectURL(file);
        audio.src = activeObjectURL;
        now.textContent = file.name;
        syncSpeaker('source');
        audio.play().catch(() => { now.textContent = 'Click play to start this file.'; syncSpeaker('pause'); });
      });
      queue.append(tile);
    });
  });

  root.append(
    el('h2', { textContent: 'Player' }),
    audio,
    now,
    visualizer,
    el('div', { className: 'settings-row' }, [
      el('label', { textContent: 'Stream a link' }),
      el('div', { style: 'display:flex; gap:8px;' }, [url, play])
    ]),
    el('div', { className: 'settings-row' }, [
      el('label', { textContent: 'Or play files from this device' }),
      picker
    ]),
    queue
  );
  root.cleanup = () => {
    cancelAnimationFrame(meterFrame);
    audio.pause();
    if (activeObjectURL) URL.revokeObjectURL(activeObjectURL);
    if (window.IDK_AUDIO_STATE?.audio === audio) syncSpeaker('closed', 0);
  };
  return root;
}

function speakerApp() {
  const root = el('div', { className: 'app speaker-app' });
  const status = el('div', { className: 'speaker-status', textContent: 'Waiting for music' });
  const title = el('h2', { className: 'speaker-title', textContent: 'IDK Speaker' });
  const woofer = el('div', { className: 'speaker-woofer', 'aria-label': 'Animated speaker' }, [el('div', { className: 'speaker-cone' })]);
  const level = el('div', { className: 'speaker-level' }, [el('span')]);
  const spectrum = el('div', { className: 'speaker-spectrum', 'aria-hidden': 'true' });
  const spectrumBars = Array.from({ length: 12 }, () => el('i'));
  spectrum.append(...spectrumBars);
  const volume = el('input', { className: 'speaker-volume', type: 'range', min: '0', max: '1', step: '.01', value: '1', 'aria-label': 'Speaker volume' });
  const openMusic = el('button', { className: 'btn', type: 'button', textContent: 'Open Music' });
  let source = null;
  let frame = 0;
  let state = window.IDK_AUDIO_STATE || { playing: false, currentTime: 0, volume: 1, level: 0 };

  const animate = () => {
    const beat = .5 + .5 * Math.sin((state.currentTime * 5.2) + (performance.now() / 120));
    const pulse = state.playing ? Math.max(.12, (state.level || .2) * .76 + beat * .24) * Math.max(.2, state.volume) : .08;
    root.style.setProperty('--speaker-pulse', pulse.toFixed(3));
    level.querySelector('span').style.width = `${Math.round(pulse * 100)}%`;
    spectrumBars.forEach((bar, index) => { bar.style.height = `${8 + Math.round(pulse * (18 + Math.abs(Math.sin(index * .8 + performance.now() / 220)) * 32))}px`; });
    root.classList.toggle('playing', state.playing);
    if (!state.playing) { frame = 0; return; }
    frame = requestAnimationFrame(animate);
  };
  const onAudio = event => {
    const next = event.detail || {};
    state = { playing: Boolean(next.playing), currentTime: Number(next.currentTime) || 0, volume: Number(next.volume) || 0, level: Number(next.level) || 0 };
    source = next.type === 'closed' ? null : next.audio || source;
    if (source && source !== volume) volume.value = String(source.volume);
    status.textContent = next.type === 'closed' || !next.name || next.name === 'Nothing loaded yet.' ? 'Waiting for music' : `${state.playing ? 'Playing' : 'Paused'} · ${next.name}`;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(animate);
  };
  volume.addEventListener('input', () => { if (source) source.volume = Number(volume.value); });
  openMusic.addEventListener('click', () => OS.open('music'));
  window.addEventListener('idk-audio-state', onAudio);
  root.cleanup = () => { cancelAnimationFrame(frame); window.removeEventListener('idk-audio-state', onAudio); };
  root.append(title, status, woofer, level, spectrum, el('label', { className: 'speaker-volume-label' }, [el('span', { textContent: 'Volume' }), volume]), openMusic);
  if (window.IDK_AUDIO_STATE) onAudio({ detail: window.IDK_AUDIO_STATE });
  return root;
}

const TV = (() => {
  let widget = null;
  let screen = null;
  let staticLayer = null;
  let remote = null;
  let muted = false;
  let active = null;

  const watchedWindow = win => {
    if (!win || !['movies', 'proxy'].includes(win.dataset.app)) return null;
    const frame = win.querySelector('.content iframe[data-tv-source="movie"], .content iframe');
    const source = frame?.getAttribute('src') || frame?.src || '';
    return frame && source && source !== 'about:blank' ? frame : null;
  };

  const setStatic = () => {
    if (!screen || !staticLayer) return;
    screen.replaceChildren(staticLayer);
    screen.classList.remove('live');
    widget?.classList.remove('tv-live');
    if (remote) remote.hidden = true;
    muted = false;
    const muteButton = remote?.querySelector('[data-remote="mute"]');
    if (muteButton) {
      muteButton.textContent = '🔊';
      muteButton.setAttribute('aria-pressed', 'false');
    }
    if (widget) widget.title = 'TV standby';
  };

  const restore = win => {
    if (!active || (win && active.win !== win)) return false;
    active.placeholder.replaceWith(active.frame);
    active = null;
    setStatic();
    return true;
  };

  const show = win => {
    const frame = watchedWindow(win);
    if (!frame) return false;
    if (active && active.win !== win) restore(active.win);
    if (active?.win === win) return true;
    const placeholder = document.createComment('TV frame placeholder');
    frame.parentNode.insertBefore(placeholder, frame);
    active = { win, frame, placeholder };
    screen?.replaceChildren(frame);
    screen?.classList.add('live');
    widget?.classList.add('tv-live');
    if (remote) remote.hidden = false;
    if (widget) widget.title = `Watching ${win.querySelector('.title')?.textContent || 'show'} · click TV to resume`;
    return true;
  };

  const resume = () => {
    if (!active) return false;
    const win = active.win;
    restore(win);
    win.classList.remove('minimized');
    win.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    return true;
  };

  const openSource = () => {
    const source = active?.frame?.getAttribute('src') || active?.frame?.src;
    if (source) window.open(source, '_blank', 'noopener');
  };

  const fullscreen = () => active?.frame?.requestFullscreen?.();

  const sendRemoteCommand = command => {
    const frame = active?.frame;
    if (!frame) return false;
    frame.contentWindow?.postMessage({ source: 'idk-tv-remote', command }, '*');
    if (widget) widget.title = `${command === 'toggle-playback' ? 'Play/pause' : 'Mute'} command sent to movie page`;
    return true;
  };

  const toggleMute = () => {
    muted = !muted;
    sendRemoteCommand('toggle-mute');
    const button = remote?.querySelector('[data-remote="mute"]');
    if (button) {
      button.textContent = muted ? '🔇' : '🔊';
      button.setAttribute('aria-pressed', String(muted));
    }
  };

  const stop = () => {
    if (!active) return false;
    const win = active.win;
    restore(win);
    win.classList.add('minimized');
    return true;
  };

  const mount = icon => {
    widget = icon;
    widget.classList.add('tv-desktop');
    const glyph = widget.querySelector('.glyph');
    screen = el('span', { className: 'tv-screen' });
    staticLayer = el('span', { className: 'tv-static', 'aria-hidden': 'true' });
    screen.append(staticLayer);
    glyph.replaceChildren(
      el('span', { className: 'tv-antenna', 'aria-hidden': 'true' }),
      screen,
      el('span', { className: 'tv-stand', 'aria-hidden': 'true' })
    );
    const control = (label, title, action, name = '') => {
      const button = el('button', { type: 'button', textContent: label, title, 'aria-label': title });
      if (name) button.dataset.remote = name;
      button.addEventListener('pointerdown', event => event.stopPropagation());
      button.addEventListener('click', event => { event.stopPropagation(); action(); });
      return button;
    };
    remote = el('span', { className: 'tv-remote', hidden: true, 'aria-label': 'TV remote controls' }, [
      control('▶', 'Send play or pause command', () => sendRemoteCommand('toggle-playback'), 'playback'),
      control('🔊', 'Send mute or unmute command', toggleMute, 'mute'),
      control('↩', 'Return to movie window', resume),
      control('⛶', 'Fullscreen', fullscreen),
      control('↗', 'Open movie in a new tab', openSource),
      control('■', 'Stop TV playback', stop)
    ]);
    widget.append(remote);
    setStatic();
  };

  return { mount, minimize: show, restore, release: restore, resume };
})();

window.TV = TV;

function calendarApp() {
  const root = el('div', { className: 'app calendar-app' });
  const cursor = new Date();
  cursor.setDate(1);
  const title = el('strong');
  const grid = el('div', { className: 'calendar-grid' });
  const render = () => {
    title.textContent = cursor.toLocaleDateString([], { month: 'long', year: 'numeric' });
    grid.replaceChildren(...['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => el('div', { className: 'calendar-weekday', textContent: day })));
    const first = cursor.getDay();
    const total = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    for (let index = 0; index < first; index += 1) grid.append(el('div', { className: 'calendar-day blank' }));
    for (let day = 1; day <= total; day += 1) {
      const cell = el('button', { className: 'calendar-day', type: 'button', textContent: String(day) });
      const date = new Date(cursor.getFullYear(), cursor.getMonth(), day);
      if (date.toDateString() === new Date().toDateString()) cell.classList.add('today');
      cell.addEventListener('click', () => window.OS?.notify('Calendar', date.toLocaleDateString([], { dateStyle: 'full' })));
      grid.append(cell);
    }
  };
  const previous = el('button', { className: 'btn tab', type: 'button', textContent: '‹', 'aria-label': 'Previous month' });
  const next = el('button', { className: 'btn tab', type: 'button', textContent: '›', 'aria-label': 'Next month' });
  previous.addEventListener('click', () => { cursor.setMonth(cursor.getMonth() - 1); render(); });
  next.addEventListener('click', () => { cursor.setMonth(cursor.getMonth() + 1); render(); });
  root.append(el('div', { className: 'calendar-toolbar' }, [previous, title, next]), grid);
  render();
  return root;
}

function todoApp() {
  const root = el('div', { className: 'app todo-app' });
  const saved = store.get('idkTodos', []);
  const items = Array.isArray(saved) ? saved : [];
  const input = el('input', { className: 'field', type: 'text', placeholder: 'Add a task…' });
  const add = el('button', { className: 'btn', type: 'button', textContent: 'Add' });
  const list = el('div', { className: 'todo-list' });
  const persist = () => store.set('idkTodos', items);
  const render = () => {
    list.replaceChildren();
    if (!items.length) list.append(el('div', { className: 'empty-state', textContent: 'Nothing here yet.' }));
    items.forEach((item, index) => {
      const check = el('input', { type: 'checkbox', checked: Boolean(item.done) });
      const label = el('span', { className: item.done ? 'todo-text done' : 'todo-text', textContent: item.text });
      const remove = el('button', { className: 'btn tab todo-remove', type: 'button', textContent: '×', 'aria-label': `Remove ${item.text}` });
      check.addEventListener('change', () => { item.done = check.checked; persist(); render(); });
      remove.addEventListener('click', () => { items.splice(index, 1); persist(); render(); });
      list.append(el('div', { className: 'todo-row' }, [check, label, remove]));
    });
  };
  const addTask = () => {
    const text = input.value.trim();
    if (!text) return;
    items.unshift({ text, done: false, added: Date.now() });
    input.value = '';
    persist();
    render();
    input.focus();
  };
  add.addEventListener('click', addTask);
  input.addEventListener('keydown', event => { if (event.key === 'Enter') addTask(); });
  root.append(el('div', { className: 'todo-compose' }, [input, add]), list);
  render();
  return root;
}

function stopwatchApp() {
  const root = el('div', { className: 'app stopwatch-app' });
  const display = el('div', { className: 'stopwatch-display', textContent: '00:00.00' });
  const start = el('button', { className: 'btn', type: 'button', textContent: 'Start' });
  const reset = el('button', { className: 'btn tab', type: 'button', textContent: 'Reset' });
  let started = 0;
  let elapsed = 0;
  let timer = null;
  const format = value => {
    const minutes = Math.floor(value / 60000).toString().padStart(2, '0');
    const seconds = Math.floor(value / 1000 % 60).toString().padStart(2, '0');
    const hundredths = Math.floor(value / 10 % 100).toString().padStart(2, '0');
    return `${minutes}:${seconds}.${hundredths}`;
  };
  const tick = () => { elapsed = Date.now() - started; display.textContent = format(elapsed); };
  start.addEventListener('click', () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
      elapsed = Date.now() - started;
      start.textContent = 'Resume';
    } else {
      started = Date.now() - elapsed;
      timer = setInterval(tick, 35);
      start.textContent = 'Pause';
    }
  });
  reset.addEventListener('click', () => { clearInterval(timer); timer = null; elapsed = 0; display.textContent = '00:00.00'; start.textContent = 'Start'; });
  root.cleanup = () => clearInterval(timer);
  root.append(display, el('div', { className: 'stopwatch-actions' }, [start, reset]));
  return root;
}

function imageViewerApp() {
  const root = el('div', { className: 'app image-viewer-app' });
  const picker = el('input', { className: 'field', type: 'file', accept: 'image/*', multiple: true });
  const gallery = el('div', { className: 'image-gallery' });
  const preview = el('div', { className: 'image-viewer-preview' }, [el('span', { className: 'empty-state', textContent: 'Choose images from this device.' })]);
  const urls = [];
  picker.addEventListener('change', () => {
    gallery.replaceChildren();
    urls.splice(0).forEach(url => URL.revokeObjectURL(url));
    Array.from(picker.files || []).forEach((file, index) => {
      const url = URL.createObjectURL(file);
      urls.push(url);
      const thumb = el('button', { className: 'image-thumb', type: 'button', title: file.name });
      thumb.append(el('img', { src: url, alt: file.name }));
      thumb.addEventListener('click', () => preview.replaceChildren(el('img', { src: url, alt: file.name }), el('small', { textContent: `${file.name} · ${file.size.toLocaleString()} bytes` })));
      gallery.append(thumb);
      if (index === 0) thumb.click();
    });
  });
  root.cleanup = () => urls.forEach(url => URL.revokeObjectURL(url));
  root.append(el('div', { className: 'viewer-toolbar' }, [picker]), gallery, preview);
  return root;
}

function weatherApp() {
  const root = el('div', { className: 'app weather-app' });
  const city = el('input', { className: 'field', type: 'search', value: store.get('weatherCity', 'New York'), placeholder: 'City' });
  const search = el('button', { className: 'btn', type: 'button', textContent: 'Get weather' });
  const locate = el('button', { className: 'btn tab', type: 'button', textContent: 'Use my location' });
  const status = el('div', { className: 'weather-status', textContent: 'Ready' });
  const card = el('div', { className: 'weather-card' });
  const codeText = code => ({ 0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Foggy', 48: 'Rime fog', 51: 'Light drizzle', 61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 80: 'Rain showers', 95: 'Thunderstorm' }[code] || 'Mixed conditions');
  const show = (place, data) => {
    const current = data.current;
    card.replaceChildren(el('strong', { textContent: place }), el('div', { className: 'weather-temp', textContent: `${Math.round(current.temperature_2m)}°F` }), el('p', { textContent: `${codeText(current.weather_code)} · Wind ${Math.round(current.wind_speed_10m)} mph` }));
  };
  const fetchWeather = async (latitude, longitude, place) => {
    status.textContent = 'Loading…';
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,wind_speed_10m,weather_code&temperature_unit=fahrenheit&wind_speed_unit=mph`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Weather service unavailable.');
      show(place, await response.json());
      status.textContent = 'Updated just now';
    } catch (error) { status.textContent = error.message; }
  };
  const lookup = async () => {
    const name = city.value.trim();
    if (!name) return;
    store.set('weatherCity', name);
    status.textContent = 'Finding city…';
    try {
      const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=en&format=json`);
      const data = await response.json();
      const result = data.results?.[0];
      if (!result) throw new Error('City not found.');
      await fetchWeather(result.latitude, result.longitude, `${result.name}${result.country ? `, ${result.country}` : ''}`);
    } catch (error) { status.textContent = error.message; }
  };
  search.addEventListener('click', lookup);
  city.addEventListener('keydown', event => { if (event.key === 'Enter') lookup(); });
  locate.addEventListener('click', () => {
    if (!navigator.geolocation) { status.textContent = 'Location is unavailable.'; return; }
    status.textContent = 'Requesting location…';
    navigator.geolocation.getCurrentPosition(position => fetchWeather(position.coords.latitude, position.coords.longitude, 'Your location'), () => { status.textContent = 'Location permission was not granted.'; });
  });
  root.append(el('div', { className: 'weather-toolbar' }, [city, search, locate]), status, card);
  lookup();
  return root;
}

function appsHub() {
  const root = el('div', { className: 'app apps-hub' });
  const grid = el('div', { className: 'app-grid' });
  const sites = [
    { title: 'Facebook', url: 'https://www.facebook.com/', icon: 'f' },
    { title: 'Instagram', url: 'https://www.instagram.com/', icon: '◎' },
    { title: 'TikTok', url: 'https://www.tiktok.com/', icon: '♪' },
    { title: 'YouTube', url: 'https://www.youtube.com/', icon: '▶' },
    { title: 'Twitter', url: 'https://twitter.com/', icon: 't' },
    { title: 'Reddit', url: 'https://www.reddit.com/', icon: 'r' },
    { title: 'Discord', url: 'https://discord.com/app', icon: '☁' },
    { title: 'Twitch', url: 'https://www.twitch.tv/', icon: '▰' },
    { title: 'Internet Archive', url: 'https://archive.org/', icon: 'ia' },
    { title: 'LinkedIn', url: 'https://www.linkedin.com/', icon: 'in' },
    { title: 'Pinterest', url: 'https://www.pinterest.com/', icon: 'P' },
    { title: 'Tumblr', url: 'https://www.tumblr.com/', icon: 't' },
    { title: 'Mastodon', url: 'https://mastodon.social/', icon: 'm' }
  ];

  sites.forEach(site => {
    const button = el('button', { className: 'app-card', type: 'button' }, [
      el('span', { className: 'app-icon', textContent: site.icon }),
      el('span', { className: 'app-card-copy' }, [
        el('strong', { textContent: site.title }),
        el('small', { textContent: 'Open through Proxy' })
      ])
    ]);
    button.addEventListener('click', () => {
      OS.open('proxy', { title: `${site.title} — Proxy`, url: site.url });
    });
    grid.append(button);
  });

  root.append(
    el('h2', { textContent: 'Apps' }),
    el('p', { className: 'apps-description', textContent: 'Popular sites and Internet Archive open immediately inside the site proxy.' }),
    grid
  );
  return root;
}

// Turn a Drive share link into something an <audio> element can stream.
function driveDirectURL(value) {
  const match = value.match(/drive\.google\.com\/file\/d\/([^/]+)/) || value.match(/[?&]id=([^&]+)/);
  return match ? `https://drive.google.com/uc?export=download&id=${match[1]}` : value;
}

function listApp({ items, placeholder, empty, onOpen, subtitle }) {
  const root = el('div');
  const search = el('input', { type: 'search', placeholder });
  const count = el('span', { className: 'count' });
  const grid = el('div', { className: 'tile-grid' });
  root.append(el('div', { className: 'toolbar' }, [search, count]), grid);

  if (!items.length) {
    grid.append(emptyState(empty));
    return root;
  }

  const render = () => {
    const query = search.value.trim().toLowerCase();
    const matches = query
      ? items.filter(item => item.search.includes(query))
      : items;
    grid.replaceChildren();
    count.textContent = `${matches.length} of ${items.length}`;
    matches.slice(0, 400).forEach(item => {
      const tile = el('button', { className: 'tile', type: 'button' });
      const tileIcon = el('span', { className: 'tile-icon' });
      tileIcon.setAttribute('aria-hidden', 'true');
      const fallbackIcon = () => tileIcon.replaceChildren(el('span', { className: 'tile-fallback', textContent: item.icon || '🎮' }));
      if (item.iconURL) {
        const image = el('img', { src: item.iconURL, alt: '', loading: 'lazy', decoding: 'async' });
        image.addEventListener('error', fallbackIcon, { once: true });
        tileIcon.append(image);
      } else {
        fallbackIcon();
      }
      tile.append(
        tileIcon,
        el('span', { className: 'tile-title', textContent: item.title })
      );
      const sub = subtitle && subtitle(item);
      if (sub) tile.append(el('span', { className: 'sub', textContent: sub }));
      tile.addEventListener('click', () => onOpen(item, tile));
      grid.append(tile);
    });
    if (matches.length > 400) {
      grid.append(emptyState('Showing the first 400 results — keep typing to narrow it down.'));
    }
    if (!matches.length) grid.append(emptyState('Nothing matched that search.'));
  };

  search.addEventListener('input', render);
  render();
  return root;
}

async function searchApp() {
  const root = el('div', { className: 'search-app' });
  const input = el('input', { className: 'field', type: 'search', placeholder: 'Search apps and games…', autofocus: true });
  const status = el('span', { className: 'count', textContent: 'Loading index…' });
  const results = el('div', { className: 'search-results' });
  root.append(el('div', { className: 'toolbar' }, [input, status]), results);

  try {
    const [names, icons] = await Promise.all([
      loadJSON('data/games.json'),
      loadJSON('data/game-icons.json').catch(() => ({}))
    ]);
    const apps = Object.entries(APPS)
      .filter(([id]) => !['player', 'panic', 'search'].includes(id))
      .map(([id, app]) => ({ kind: 'app', id, title: app.title, glyph: app.glyph, search: app.title.toLowerCase() }));
    const games = names.map(name => ({ kind: 'game', id: name, title: gameTitle(name), iconURL: gameIconURL(icons[name]), search: `${name} ${gameTitle(name)}`.toLowerCase() }));
    const items = [...apps, ...games];
    const render = () => {
      const query = input.value.trim().toLowerCase();
      const matches = query ? items.filter(item => item.search.includes(query)) : apps;
      results.replaceChildren();
      status.textContent = query ? `${matches.length} result${matches.length === 1 ? '' : 's'}` : `${games.length} games · ${apps.length} apps`;
      if (!matches.length) {
        results.append(emptyState('Nothing matched that search.'));
        return;
      }
      matches.slice(0, 120).forEach(item => {
        const icon = el('span', { className: 'search-result-icon' });
        icon.setAttribute('aria-hidden', 'true');
        if (item.iconURL) {
          const image = el('img', { src: item.iconURL, alt: '', loading: 'lazy' });
          image.addEventListener('error', () => icon.replaceChildren(el('span', { className: 'search-result-fallback', textContent: '🎮' })), { once: true });
          icon.append(image);
        } else {
          icon.innerHTML = item.glyph || '🎮';
        }
        const button = el('button', { className: 'search-result', type: 'button' }, [icon, el('span', { className: 'search-result-copy' }, [el('strong', { textContent: item.title }), el('small', { textContent: item.kind === 'app' ? 'Desktop app' : 'Game' })])]);
        button.addEventListener('click', async () => {
          if (item.kind === 'app') return OS.open(item.id);
          const label = button.querySelector('strong');
          label.textContent = 'Loading…';
          try { OS.open('player', { title: item.title, src: await gameBlobURL(item.id) }); }
          catch (error) { alert(error.message); }
          finally { label.textContent = item.title; }
        });
        results.append(button);
      });
      if (matches.length > 120) results.append(emptyState('Showing the first 120 results. Keep typing to narrow it down.'));
    };
    input.addEventListener('input', render);
    render();
    setTimeout(() => input.focus(), 0);
  } catch (error) {
    status.textContent = 'Unavailable';
    results.append(emptyState(error.message));
  }
  return root;
}

const APPS = {
  search: {
    title: 'Search',
    glyph: '🔎',
    desktop: true,
    width: 720,
    height: 560,
    render: searchApp
  },

  apps: {
    title: 'Apps',
    glyph: '<span class="apps-glyph">▦</span>',
    desktop: true,
    width: 700,
    height: 520,
    render: appsHub
  },

  files: {
    title: 'Files',
    glyph: '📁',
    desktop: true,
    width: 760,
    height: 540,
    render: () => window.SYSTEM_APPS.files()
  },

  notes: {
    title: 'Notes',
    glyph: '🗒️',
    desktop: true,
    width: 720,
    height: 560,
    render: () => window.SYSTEM_APPS.notes()
  },

  calculator: {
    title: 'Calculator',
    glyph: '🧮',
    desktop: true,
    width: 360,
    height: 520,
    render: () => window.SYSTEM_APPS.calculator()
  },

  calendar: {
    title: 'Calendar',
    glyph: '📅',
    desktop: true,
    width: 520,
    height: 520,
    render: calendarApp
  },

  todo: {
    title: 'To-do',
    glyph: '✅',
    desktop: true,
    width: 520,
    height: 520,
    render: todoApp
  },

  viewer: {
    title: 'Images',
    glyph: '🖼️',
    desktop: true,
    width: 760,
    height: 600,
    render: imageViewerApp
  },

  tv: {
    title: 'TV',
    glyph: '📺',
    desktop: true,
    dock: false,
    action() {
      if (!TV.resume()) window.OS?.notify('TV', 'Minimize a movie or show window to watch it here.');
    }
  },

  stopwatch: {
    title: 'Stopwatch',
    glyph: '⏱️',
    desktop: true,
    width: 420,
    height: 340,
    render: stopwatchApp
  },

  speaker: {
    title: 'Speaker',
    glyph: '🔊',
    desktop: true,
    dock: false,
    width: 460,
    height: 560,
    render: speakerApp
  },

  paint: {
    title: 'Paint',
    glyph: '🎨',
    desktop: true,
    width: 900,
    height: 660,
    render: () => window.SYSTEM_APPS.paint()
  },

  weather: {
    title: 'Weather',
    glyph: '☀️',
    desktop: true,
    width: 620,
    height: 460,
    render: weatherApp
  },

  ai: {
    title: 'AI',
    glyph: '✦',
    desktop: true,
    width: 900,
    height: 640,
    render: () => window.SYSTEM_APPS.ai()
  },

  terminal: {
    title: 'Terminal',
    glyph: '<span class="terminal-glyph">&gt;_</span>',
    desktop: true,
    width: 760,
    height: 500,
    render: () => window.SYSTEM_APPS.terminal()
  },

  roblox: {
    title: 'Roblox',
    glyph: '<span class="roblox-glyph">R</span>',
    desktop: true,
    width: 1040,
    height: 680,
    action() {
      OS.open('proxy', {
        title: 'Roblox — Proxy',
        url: 'https://frogiesarcade.win/algebra.html'
      });
    }
  },

  games: {
    title: 'Games',
    glyph: '<img src="assets/ugs-icon.jpeg" alt="">',
    desktop: true,
    width: 900,
    height: 620,
    async render() {
      const [names, icons] = await Promise.all([
        loadJSON('data/games.json'),
        loadJSON('data/game-icons.json').catch(() => ({}))
      ]);
      const items = names.map(name => ({
        id: name,
        title: gameTitle(name),
        iconURL: gameIconURL(icons[name]),
        search: `${name} ${gameTitle(name)}`.toLowerCase()
      }));
      return listApp({
        items,
        placeholder: 'Search games…',
        empty: 'No games found.',
        async onOpen(item, tile) {
          const title = tile.querySelector('.tile-title');
          const label = title.textContent;
          title.textContent = 'Loading…';
          try {
            const src = await gameBlobURL(item.id);
            OS.open('player', { title: item.title, src });
          } catch (err) {
            alert(err.message);
          } finally {
            title.textContent = label;
          }
        }
      });
    }
  },

  movies: {
    title: 'Movies',
    glyph: '🎬',
    desktop: true,
    width: 1000,
    height: 660,
    render: moviesApp
  },

  soundboard: {
    title: 'Soundboard',
    glyph: '🔊',
    desktop: true,
    width: 1000,
    height: 660,
    render() {
      const sites = [
        { title: 'SoundboardMax', url: 'https://soundboardmax.com/' },
        { title: 'Realm of Darkness', url: 'https://www.realmofdarkness.net/sb/soundboards/' },
        { title: 'iMyFone Soundboards', url: 'https://filme.imyfone.com/soundboards/?search=csgo', embeddable: false }
      ];

      return tabbedApp(sites.map(site => ({
        title: site.title,
        render: () => externalSite(site.url, site.title, { embeddable: site.embeddable !== false })
      })));
    }
  },

  music: {
    title: 'Music',
    glyph: '🎵',
    desktop: true,
    width: 1000,
    height: 660,
    render() {
      const folders = [
        { title: 'Library 1', id: '1P6Vco6iRavlUZy___wDNXNjYHoPWORUH' },
        { title: 'Library 2', id: '1Q-m97t5_WKaSQzj8FYB3H0GYLsnnaReb' },
        { title: 'Library 3', id: '1SLPMQ8c9PZInb8xviLJmyiGXXh_FYFa0' }
      ];

      const tabs = folders.map(folder => ({
        title: folder.title,
        render: () => driveFolder(folder.id, folder.title)
      }));
      tabs.push({ title: 'Player', render: audioPlayer });

      return tabbedApp(tabs);
    }
  },

  cheats: {
    title: 'Blooket',
    glyph: '<span class="binary">01<br>10</span>',
    desktop: true,
    width: 1000,
    height: 660,
    render() {
      return externalSite('https://blooketbot.schoolcheats.net/', 'Blooket Bot', { embeddable: false });
    }
  },

  proxy: {
    title: 'Proxy',
    glyph: '🌐',
    desktop: true,
    multi: true,
    width: 1040,
    height: 680,
    async render(opts = {}) {
      const root = el('div', { className: 'site-frame' });
      const frame = el('iframe', { allow: 'autoplay; fullscreen; clipboard-write' });
      const status = el('span', { className: 'count', textContent: 'Ready' });

      const bar = el('div', { className: 'toolbar' });
      const url = el('input', {
        className: 'field',
        type: 'text',
        placeholder: 'Search or enter a URL',
        value: opts.url || ''
      });
      const go = el('button', { className: 'btn tab', type: 'button', textContent: 'Go' });
      bar.append(url, go, status);

      if (!await PROXY.backendAvailable()) {
        root.append(bar, emptyState(
          'The proxy backend is not running.<br>Start the site with <code>npm start</code> ' +
          '(or deploy it to a Node host) instead of opening the files directly.'
        ));
        url.disabled = true;
        go.disabled = true;
        return root;
      }

      const navigate = async () => {
        if (!url.value.trim()) return;
        status.textContent = 'Connecting…';
        try {
          frame.src = await PROXY.encode(url.value);
          status.textContent = 'Connected';
        } catch (err) {
          status.textContent = err.message;
        }
      };

      go.addEventListener('click', navigate);
      url.addEventListener('keydown', event => {
        if (event.key === 'Enter') navigate();
      });

      root.append(bar, frame);
      if (opts.url) await navigate();
      return root;
    }
  },

  chat: {
    title: 'Chat',
    glyph: '💬',
    desktop: true,
    width: 720,
    height: 560,
    async render() {
      const root = el('div', { className: 'chat-app' });

      if (!await PROXY.chatAvailable()) {
        root.append(emptyState(
          'Chat needs the Node server.<br>Start the site with <code>npm start</code> ' +
          '(or deploy it to a Node host) instead of opening the files directly.'
        ));
        return root;
      }

      const name = el('input', {
        className: 'field',
        type: 'text',
        placeholder: 'Your name',
        value: store.get('chatName', '')
      });
      const room = el('input', {
        className: 'field',
        type: 'text',
        placeholder: 'Room name',
        value: store.get('chatRoom', new URLSearchParams(location.search).get('room') || '')
      });
      const join = el('button', { className: 'btn tab', type: 'button', textContent: 'Join' });
      const share = el('button', { className: 'btn tab', type: 'button', textContent: 'Copy invite' });
      const chatStatus = el('span', { className: 'count', textContent: 'Not connected' });
      const bar = el('div', { className: 'toolbar' }, [name, room, join, share, chatStatus]);

      const moderationTarget = el('select', { className: 'field moderation-target', disabled: true });
      const muteMinutes = el('select', { className: 'field moderation-minutes' });
      [[1, '1 min'], [5, '5 min'], [15, '15 min'], [60, '1 hour']].forEach(([value, label]) => muteMinutes.append(el('option', { value: String(value), textContent: label })));
      const muteMember = el('button', { className: 'btn tab', type: 'button', textContent: 'Mute', disabled: true });
      const kickMember = el('button', { className: 'btn tab', type: 'button', textContent: 'Kick', disabled: true });
      const banMember = el('button', { className: 'btn moderation-danger', type: 'button', textContent: 'Ban', disabled: true });
      const promoteMember = el('button', { className: 'btn tab', type: 'button', textContent: 'Promote to moderator', disabled: true, hidden: true });
      const ownerPanel = el('section', { className: 'owner-panel', hidden: true }, [
        el('div', { className: 'owner-panel-heading' }, [el('strong', { className: 'moderation-heading', textContent: 'Room controls' }), el('span', { textContent: 'Manage room members' })]),
        el('div', { className: 'owner-panel-controls' }, [moderationTarget, muteMinutes, muteMember, kickMember, banMember, promoteMember])
      ]);

      const log = el('div', { className: 'chat-log' });
      const text = el('input', { className: 'field', type: 'text', placeholder: 'Message', disabled: true });
      const send = el('button', { className: 'btn tab', type: 'button', textContent: 'Send', disabled: true });
      const composer = el('div', { className: 'toolbar' }, [text, send]);

      let socket = null;
      let currentUserId = '';
      let currentRole = 'member';
      let mutedUntil = 0;

      const line = (className, body) => {
        const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
        log.append(el('div', { className, innerHTML: body }));
        if (atBottom) log.scrollTop = log.scrollHeight;
      };

      const escape = value =>
        value.replace(/[&<>"']/g, char =>
          ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

      const message = (data, announce = false) => {
        line('chat-line', `<b>${escape(data.name)}</b> ${escape(data.text)}`);
        if (announce && data.name !== name.value.trim()) window.OS?.notify('Chat message', `${data.name}: ${data.text}`, 'chat');
      };

      const sendSocket = payload => {
        if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
      };

      const updateModerationTargets = users => {
        const canModerate = currentRole === 'owner' || currentRole === 'moderator';
        const peers = (Array.isArray(users) ? users : []).filter(user => {
          if (!user.id || user.id === currentUserId) return false;
          return currentRole === 'owner' || user.role === 'member';
        });
        ownerPanel.hidden = !canModerate;
        ownerPanel.querySelector('.moderation-heading').textContent = currentRole === 'owner' ? 'Owner controls' : 'Moderator controls';
        moderationTarget.replaceChildren();
        if (!canModerate || !peers.length) {
          moderationTarget.append(el('option', { value: '', textContent: peers.length ? 'No members' : 'No one else in room' }));
          moderationTarget.disabled = true;
          muteMember.disabled = kickMember.disabled = banMember.disabled = promoteMember.disabled = true;
          promoteMember.hidden = true;
          return;
        }
        peers.forEach(user => {
          const option = el('option', { value: user.id, textContent: `${user.name} · ${user.role}` });
          option.dataset.role = user.role;
          moderationTarget.append(option);
        });
        moderationTarget.disabled = false;
        muteMember.disabled = kickMember.disabled = banMember.disabled = false;
        promoteMember.hidden = currentRole !== 'owner';
        promoteMember.disabled = currentRole !== 'owner' || moderationTarget.selectedOptions[0]?.dataset.role !== 'member';
      };

      const updateMembers = users => {
        const list = Array.isArray(users) ? users : [];
        const self = list.find(user => user.id === currentUserId);
        if (self?.role) currentRole = self.role;
        updateModerationTargets(list);
      };

      const setMuted = until => {
        mutedUntil = Number(until) || 0;
        const muted = mutedUntil > Date.now();
        text.disabled = send.disabled = muted || !socket || socket.readyState !== WebSocket.OPEN;
        if (muted) chatStatus.textContent = `Muted for ${Math.ceil((mutedUntil - Date.now()) / 60000)} more minute(s)`;
      };

      const connect = () => {
        if (!name.value.trim() || !room.value.trim()) return;
        store.set('chatName', name.value.trim());
        store.set('chatRoom', room.value.trim());
        if (socket) socket.close();

        chatStatus.textContent = 'Connecting…';
        socket = new WebSocket(
          `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/chat`
        );

        socket.addEventListener('open', () => {
          socket.send(JSON.stringify({ type: 'join', room: room.value.trim(), name: name.value.trim() }));
        });

         socket.addEventListener('message', event => {
           const data = JSON.parse(event.data);
           if (data.type === 'joined') {
             log.replaceChildren();
             currentUserId = data.peerId;
             currentRole = data.role || 'member';
             mutedUntil = 0;
             data.history.forEach(message);
             updateMembers(data.users);
             chatStatus.textContent = `In #${data.room} · ${currentRole}`;
             text.disabled = send.disabled = false;
             text.focus();
           } else if (data.type === 'message') {
             message(data, true);
           } else if (data.type === 'presence') {
             line('chat-line system', `${escape(data.text)} · ${data.users.length} here`);
             updateMembers(data.users);
             if (data.text && !data.text.startsWith(`${name.value.trim()} joined`)) window.OS?.notify('Chat room', data.text, 'chat');
           } else if (data.type === 'moderation-result') {
             chatStatus.textContent = data.text;
             window.OS?.notify('Owner controls', data.text, 'chat');
           } else if (data.type === 'muted') {
             setMuted(data.until);
             window.OS?.notify('Chat room', 'The room owner muted you.', 'chat');
           } else if (data.type === 'kicked') {
             chatStatus.textContent = data.reason;
             window.OS?.notify('Chat room', data.reason, 'chat');
             socket.close();
            } else if (data.type === 'error') {
             chatStatus.textContent = data.text;
             window.OS?.notify('Chat room', data.text, 'chat');
           }
         });

         socket.addEventListener('close', () => {
            updateMembers([]);
           chatStatus.textContent = 'Disconnected';
           text.disabled = send.disabled = true;
         });
      };

      const post = () => {
        if (!text.value.trim() || mutedUntil > Date.now() || socket?.readyState !== WebSocket.OPEN) return;
        socket.send(JSON.stringify({ type: 'message', text: text.value }));
        text.value = '';
      };

       const moderate = action => {
         const targetId = moderationTarget.value;
         if (!targetId) return;
         const targetName = moderationTarget.selectedOptions[0]?.textContent || 'this member';
         const label = action === 'promote' ? 'Promote' : `${action[0].toUpperCase()}${action.slice(1)}`;
         if (!window.confirm(`${label} ${targetName}?`)) return;
         sendSocket({ type: 'moderation', action, targetId, minutes: Number(muteMinutes.value) || 5 });
       };

      const copyInvite = async () => {
        const code = room.value.trim();
        if (!code) { chatStatus.textContent = 'Enter a room name first'; return; }
        const invite = new URL(location.href);
        invite.searchParams.set('room', code);
        invite.hash = 'chat';
        try {
          await navigator.clipboard.writeText(invite.href);
          chatStatus.textContent = 'Invite link copied';
          window.OS?.notify('Chat invite', `Room ${code} is ready to share.`);
        } catch {
          window.prompt('Copy this invite link', invite.href);
        }
      };

       join.addEventListener('click', connect);
       share.addEventListener('click', copyInvite);
       room.addEventListener('keydown', event => { if (event.key === 'Enter') connect(); });
       send.addEventListener('click', post);
       text.addEventListener('keydown', event => { if (event.key === 'Enter') post(); });
       muteMember.addEventListener('click', () => moderate('mute'));
       kickMember.addEventListener('click', () => moderate('kick'));
       banMember.addEventListener('click', () => moderate('ban'));
       promoteMember.addEventListener('click', () => moderate('promote'));
       moderationTarget.addEventListener('change', () => {
         promoteMember.disabled = currentRole !== 'owner' || moderationTarget.selectedOptions[0]?.dataset.role !== 'member';
       });

       root.cleanup = () => socket?.close();

        root.append(bar, ownerPanel, log, composer);
       return root;
    }
  },

  panic: {
    title: 'Power',
    glyph: '⏻',
    desktop: false,
    danger: true,
    action() {
      window.location.replace('index.html?shutdown=1');
    }
  },

  settings: {
    title: 'Settings',
    glyph: '⚙️',
    desktop: true,
    width: 600,
    height: 560,
    render() {
      const root = el('div', { className: 'app' });
      const input = el('input', {
        className: 'field',
        type: 'text',
        placeholder: 'Image URL or CSS gradient',
        value: store.get('wallpaper', DEFAULT_WALLPAPER) || ''
      });
      const wallpaperPreset = el('select', { className: 'field' });
      WALLPAPER_PRESETS.forEach(preset => wallpaperPreset.append(el('option', { value: preset.value, textContent: preset.label })));
      const currentWallpaper = input.value;
      if (!WALLPAPER_PRESETS.some(preset => preset.value === currentWallpaper) && currentWallpaper) {
        wallpaperPreset.prepend(el('option', { value: currentWallpaper, textContent: 'Custom wallpaper' }));
      }
      wallpaperPreset.value = currentWallpaper;
      wallpaperPreset.addEventListener('change', () => { if (wallpaperPreset.value) input.value = wallpaperPreset.value; });
      const clock24 = el('input', { type: 'checkbox', checked: store.get('clock24', false) });
      const theme = el('select', { className: 'field', value: store.get('theme', 'midnight') });
      [['midnight', 'Midnight'], ['neon', 'Neon'], ['sunset', 'Sunset'], ['mono', 'Monochrome'], ['ocean', 'Ocean'], ['forest', 'Forest'], ['candy', 'Candy']].forEach(([value, label]) => theme.append(el('option', { value, textContent: label })));
      theme.value = store.get('theme', 'midnight');
      const iconSize = el('select', { className: 'field', value: store.get('iconSize', 'normal') });
      [['compact', 'Compact'], ['normal', 'Normal'], ['large', 'Large']].forEach(([value, label]) => iconSize.append(el('option', { value, textContent: label })));
      iconSize.value = store.get('iconSize', 'normal');
      const dockPosition = el('select', { className: 'field', value: store.get('dockPosition', 'bottom') });
      [['bottom', 'Bottom'], ['left', 'Left'], ['right', 'Right']].forEach(([value, label]) => dockPosition.append(el('option', { value, textContent: label })));
      dockPosition.value = store.get('dockPosition', 'bottom');
      const motion = el('select', { className: 'field', value: store.get('motion', 'on') });
      [['on', 'Motion on'], ['off', 'Reduce motion']].forEach(([value, label]) => motion.append(el('option', { value, textContent: label })));
      motion.value = store.get('motion', 'on');
      const panic = el('input', {
        className: 'field',
        type: 'url',
        placeholder: PANIC_URL,
        value: store.get('panicURL', PANIC_URL) || ''
      });

      const save = el('button', { className: 'btn', type: 'button', textContent: 'Apply' });
      save.addEventListener('click', () => {
        store.set('wallpaper', input.value.trim());
        store.set('clock24', clock24.checked);
        store.set('theme', theme.value);
        store.set('iconSize', iconSize.value);
        store.set('dockPosition', dockPosition.value);
        store.set('motion', motion.value);
        store.set('panicURL', panic.value.trim());
        applyWallpaper(input.value.trim());
        applyTheme(theme.value);
        applyIconSize(iconSize.value);
        applyDockPosition(dockPosition.value);
        applyMotion(motion.value);
        OS.tickClock();
        OS.notify('Settings', 'Appearance updated.');
      });

      const reset = el('button', { className: 'btn', type: 'button', textContent: 'Reset wallpaper' });
      reset.addEventListener('click', () => {
        input.value = DEFAULT_WALLPAPER;
        wallpaperPreset.value = DEFAULT_WALLPAPER;
        store.set('wallpaper', DEFAULT_WALLPAPER);
        applyWallpaper(DEFAULT_WALLPAPER);
      });

      const restoreWorkspace = el('button', { className: 'btn tab', type: 'button', textContent: 'Restore workspace' });
      restoreWorkspace.addEventListener('click', () => OS.restoreWorkspace());
      const clearWorkspace = el('button', { className: 'btn tab', type: 'button', textContent: 'Forget saved workspace' });
      clearWorkspace.addEventListener('click', () => OS.clearWorkspace());

      root.append(
        el('h2', { textContent: 'Settings' }),
        el('div', { className: 'settings-row' }, [
          el('label', { textContent: 'Wallpaper preset' }),
          wallpaperPreset
        ]),
        el('div', { className: 'settings-row' }, [
          el('label', { textContent: 'Wallpaper URL or CSS gradient' }),
          input
        ]),
        el('div', { className: 'settings-row' }, [
          el('label', { textContent: '24-hour clock' }),
          clock24
        ]),
        el('div', { className: 'settings-row settings-grid' }, [
          el('label', { textContent: 'Theme' }), theme,
          el('label', { textContent: 'Desktop icon size' }), iconSize,
          el('label', { textContent: 'Dock position' }), dockPosition,
          el('label', { textContent: 'Animations' }), motion
        ]),
        el('div', { className: 'settings-row' }, [
          el('label', { textContent: 'Power button redirects to' }),
          panic
        ]),
        el('div', { className: 'settings-row' }, [
          el('label', { textContent: 'Workspace' }),
          el('small', { className: 'sub', textContent: 'Open apps and window layouts are saved automatically. Shortcut: Ctrl + Alt + R.' }),
          el('div', { style: 'display:flex; gap:8px; flex-wrap:wrap;' }, [restoreWorkspace, clearWorkspace])
        ]),
        el('div', { style: 'display:flex; gap:8px;' }, [save, reset])
      );
      return root;
    }
  },

  player: {
    title: 'Player',
    glyph: '▶️',
    desktop: false,
    dock: false,
    width: 960,
    height: 640,
    multi: true,
    render(opts = {}) {
      if (!opts.src) return emptyState('Nothing to play.');
      const frame = el('iframe', {
        src: opts.src,
        allow: 'autoplay; fullscreen; gamepad; clipboard-write',
        allowFullscreen: true
      });
      return frame;
    }
  }
};
