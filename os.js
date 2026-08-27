const OS = (() => {
  const desktop = document.getElementById('desktop');
  const iconLayer = document.getElementById('icons');
  const windowLayer = document.getElementById('windows');
  const dock = document.getElementById('dock');
  const busyCursor = document.getElementById('busy-cursor');
  const template = document.getElementById('window-template');
  const startToggle = document.getElementById('start-toggle');
  const startMenu = document.getElementById('start-menu');
  const startSearch = document.getElementById('start-search');
  const startApps = document.getElementById('start-apps');
  const startRecent = document.getElementById('start-recent');
  const notifications = document.getElementById('notifications');
  const notificationToggle = document.getElementById('notification-toggle');
  const notificationCount = document.getElementById('notification-count');
  const notificationsPanel = document.getElementById('notifications-panel');
  const notificationList = document.getElementById('notification-list');
  const notificationsClear = document.getElementById('notifications-clear');

  const open = new Map();
  let zIndex = 10;
  let spawnOffset = 0;
  let loadingCount = 0;
  let unreadNotifications = 0;
  let workspaceSaveTimer = null;
  let restoringWorkspace = false;
  const WORKSPACE_KEY = 'idkWorkspace';
  const notificationHistory = [];

  function setLoading(loading) {
    loadingCount = Math.max(0, loadingCount + (loading ? 1 : -1));
    desktop.classList.toggle('loading', loadingCount > 0);
    desktop.setAttribute('aria-busy', String(loadingCount > 0));
    busyCursor?.classList.toggle('show', loadingCount > 0);
  }

  function loadingView(title) {
    const view = document.createElement('div');
    view.className = 'loading-state';
    view.setAttribute('role', 'status');
    view.setAttribute('aria-live', 'polite');
    view.append(
      Object.assign(document.createElement('span'), { className: 'loading-orbit', 'aria-hidden': 'true' }),
      Object.assign(document.createElement('strong'), { textContent: title }),
      Object.assign(document.createElement('span'), { className: 'loading-dots', textContent: 'Please wait' })
    );
    return view;
  }

  function closeStart() {
    if (!startMenu) return;
    startMenu.hidden = true;
    startToggle?.setAttribute('aria-expanded', 'false');
  }

  function notify(title, message, kind = 'info') {
    if (!notifications) return;
    notificationHistory.unshift({ title, message, kind, at: Date.now() });
    notificationHistory.splice(30);
    unreadNotifications += 1;
    renderNotifications();
    const toast = document.createElement('article');
    toast.className = `notification ${kind}`;
    const close = document.createElement('button');
    close.className = 'notification-close';
    close.type = 'button';
    close.setAttribute('aria-label', 'Dismiss notification');
    close.textContent = '×';
    close.addEventListener('click', () => toast.remove());
    toast.append(
      Object.assign(document.createElement('strong'), { textContent: title }),
      Object.assign(document.createElement('p'), { textContent: message }),
      close
    );
    notifications.append(toast);
    setTimeout(() => toast.remove(), 5200);
  }

  function renderNotifications() {
    if (notificationCount) {
      notificationCount.textContent = String(unreadNotifications);
      notificationCount.hidden = unreadNotifications === 0;
    }
    if (!notificationList) return;
    notificationList.replaceChildren();
    if (!notificationHistory.length) {
      notificationList.append(Object.assign(document.createElement('div'), { className: 'empty-state', textContent: 'You are all caught up.' }));
      return;
    }
    notificationHistory.forEach(item => {
      const entry = document.createElement('article');
      entry.className = `notification-center-item ${item.kind}`;
      entry.append(
        Object.assign(document.createElement('strong'), { textContent: item.title }),
        Object.assign(document.createElement('p'), { textContent: item.message }),
        Object.assign(document.createElement('time'), { textContent: new Date(item.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) })
      );
      notificationList.append(entry);
    });
  }

  notificationToggle?.addEventListener('click', event => {
    event.stopPropagation();
    const opening = notificationsPanel?.hidden;
    if (notificationsPanel) notificationsPanel.hidden = !opening;
    notificationToggle.setAttribute('aria-expanded', String(Boolean(opening)));
    if (opening) { unreadNotifications = 0; renderNotifications(); }
  });
  notificationsClear?.addEventListener('click', () => { notificationHistory.length = 0; unreadNotifications = 0; renderNotifications(); });
  document.addEventListener('pointerdown', event => {
    if (notificationsPanel && !notificationsPanel.contains(event.target) && event.target !== notificationToggle) {
      notificationsPanel.hidden = true;
      notificationToggle?.setAttribute('aria-expanded', 'false');
    }
  });
  renderNotifications();

  window.addEventListener('pointermove', event => {
    if (!busyCursor) return;
    busyCursor.style.left = `${event.clientX + 14}px`;
    busyCursor.style.top = `${event.clientY + 14}px`;
  });

  function focus(win) {
    closeStart();
    window.TV?.restore(win);
    windowLayer.querySelectorAll('.window.focused').forEach(other => other.classList.remove('focused'));
    win.style.zIndex = ++zIndex;
    win.classList.add('focused');
    win.classList.remove('minimized');
    scheduleWorkspaceSave();
  }

  function workspaceSnapshot() {
    return [...open.entries()]
      .filter(([key]) => !key.includes(':') && APPS[key] && !APPS[key].multi)
      .map(([appId, win]) => ({
        appId,
        left: win.style.left,
        top: win.style.top,
        width: win.style.width,
        height: win.style.height,
        classes: ['minimized', 'maximized', 'snapped-left', 'snapped-right'].filter(name => win.classList.contains(name))
      }));
  }

  function saveWorkspace() {
    workspaceSaveTimer = null;
    if (restoringWorkspace) return;
    store.set(WORKSPACE_KEY, workspaceSnapshot());
  }

  function scheduleWorkspaceSave() {
    if (restoringWorkspace) return;
    clearTimeout(workspaceSaveTimer);
    workspaceSaveTimer = setTimeout(saveWorkspace, 120);
  }

  function applyWorkspaceState(win, state) {
    const value = (property, fallback) => {
      const parsed = Number.parseFloat(state[property]);
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    const width = Math.min(Math.max(320, value('width', 640)), Math.max(320, desktop.clientWidth - 20));
    const height = Math.min(Math.max(220, value('height', 420)), Math.max(220, desktop.clientHeight - 100));
    const left = Math.min(Math.max(0, value('left', 24)), Math.max(0, desktop.clientWidth - width - 20));
    const top = Math.min(Math.max(0, value('top', 24)), Math.max(0, desktop.clientHeight - height - 84));
    win.style.left = `${left}px`;
    win.style.top = `${top}px`;
    win.style.width = `${width}px`;
    win.style.height = `${height}px`;
    ['minimized', 'maximized', 'snapped-left', 'snapped-right'].forEach(name => win.classList.toggle(name, Array.isArray(state.classes) && state.classes.includes(name)));
  }

  async function restoreWorkspace({ quiet = false } = {}) {
    if (restoringWorkspace) return 0;
    const saved = store.get(WORKSPACE_KEY, []);
    const items = Array.isArray(saved)
      ? saved.filter(item => item && APPS[item.appId] && !APPS[item.appId].multi && !APPS[item.appId].action)
      : [];
    if (!items.length) {
      if (!quiet) notify('Workspace', 'There is no saved workspace to restore.');
      return 0;
    }

    restoringWorkspace = true;
    let restored = 0;
    try {
      for (const item of items) {
        if (open.has(item.appId)) {
          applyWorkspaceState(open.get(item.appId), item);
          restored += 1;
          continue;
        }
        await launch(item.appId, { workspace: item });
        const win = open.get(item.appId);
        if (win) {
          applyWorkspaceState(win, item);
          restored += 1;
        }
      }
    } finally {
      restoringWorkspace = false;
      saveWorkspace();
    }
    if (!quiet) notify('Workspace', `${restored} app${restored === 1 ? '' : 's'} restored.`);
    return restored;
  }

  function clearWorkspace() {
    store.set(WORKSPACE_KEY, []);
    notify('Workspace', 'Saved workspace cleared.');
  }

  function place(win, width, height) {
    const maxW = Math.min(width, desktop.clientWidth - 40);
    const maxH = Math.min(height, desktop.clientHeight - 120);
    win.style.width = `${maxW}px`;
    win.style.height = `${maxH}px`;
    win.style.left = `${Math.max(12, (desktop.clientWidth - maxW) / 2 + spawnOffset)}px`;
    win.style.top = `${Math.max(12, (desktop.clientHeight - maxH) / 2 - 30 + spawnOffset)}px`;
    spawnOffset = (spawnOffset + 26) % 104;
  }

  function snap(win, side) {
    win.classList.remove('maximized', 'snapped-left', 'snapped-right');
    if (side === 'max') win.classList.add('maximized');
    if (side === 'left') win.classList.add('snapped-left');
    if (side === 'right') win.classList.add('snapped-right');
  }

  function drag(win, handle) {
    handle.addEventListener('pointerdown', event => {
      if (event.target.closest('.ctrl')) return;
      focus(win);
      const rect = win.getBoundingClientRect();
      const offsetX = event.clientX - rect.left;
      const offsetY = event.clientY - rect.top;
      let lastX = event.clientX;
      let lastY = event.clientY;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      const move = e => {
        lastX = e.clientX;
        lastY = e.clientY;
        win.classList.remove('maximized');
        win.classList.remove('snapped-left', 'snapped-right');
        win.style.left = `${Math.min(Math.max(0, e.clientX - offsetX), desktop.clientWidth - 60)}px`;
        win.style.top = `${Math.min(Math.max(0, e.clientY - offsetY), desktop.clientHeight - 40)}px`;
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        if (lastY <= 18) snap(win, 'max');
        else if (lastX <= 18) snap(win, 'left');
        else if (lastX >= desktop.clientWidth - 18) snap(win, 'right');
        scheduleWorkspaceSave();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  }

  function resize(win, handle) {
    handle.addEventListener('pointerdown', event => {
      event.preventDefault();
      focus(win);
      const rect = win.getBoundingClientRect();
      const move = e => {
        win.style.width = `${Math.max(320, e.clientX - rect.left)}px`;
        win.style.height = `${Math.max(220, e.clientY - rect.top)}px`;
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        scheduleWorkspaceSave();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  }

  function markDock() {
    dock.querySelectorAll('.dock-btn').forEach(btn => {
      const id = btn.dataset.app;
      const running = open.has(id) || [...open.keys()].some(key => key.startsWith(`${id}:`));
      btn.classList.toggle('running', running);
    });
  }

  function buildDockMedia() {
    let audioState = window.IDK_AUDIO_STATE || { playing: false, audio: null, name: '' };
    const media = document.createElement('div');
    media.className = 'dock-media';
    media.title = 'Music controls';
    const toggle = document.createElement('button');
    toggle.className = 'dock-media-btn';
    toggle.type = 'button';
    toggle.setAttribute('aria-label', 'Play music');
    const stop = document.createElement('button');
    stop.className = 'dock-media-btn';
    stop.type = 'button';
    stop.textContent = '■';
    stop.setAttribute('aria-label', 'Stop music');
    const volume = document.createElement('input');
    volume.className = 'dock-media-volume';
    volume.type = 'range';
    volume.min = '0';
    volume.max = '1';
    volume.step = '.01';
    volume.value = '1';
    volume.setAttribute('aria-label', 'Music volume');
    const label = document.createElement('span');
    label.className = 'dock-media-label';
    label.textContent = 'Music idle';

    const update = event => {
      audioState = { ...audioState, ...(event.detail || {}) };
      const audio = audioState.audio;
      toggle.textContent = audio && audioState.playing ? '❚❚' : '▶';
      toggle.setAttribute('aria-label', audio && audioState.playing ? 'Pause music' : 'Play music');
      volume.value = String(audio ? audio.volume : audioState.volume ?? 1);
      label.textContent = audioState.name && audioState.name !== 'Nothing loaded yet.'
        ? audioState.name
        : 'Music idle';
    };
    toggle.addEventListener('click', () => {
      const audio = audioState.audio;
      if (!audio) {
        launch('music');
        return;
      }
      if (audio.paused) audio.play().catch(() => {});
      else audio.pause();
    });
    stop.addEventListener('click', () => {
      if (!audioState.audio) return;
      audioState.audio.pause();
      audioState.audio.currentTime = 0;
    });
    volume.addEventListener('input', () => {
      if (audioState.audio) audioState.audio.volume = Number(volume.value);
    });
    window.addEventListener('idk-audio-state', update);
    update({ detail: audioState });
    media.append(toggle, stop, volume, label);
    dock.append(media);
  }

  function saveDesktopOrder() {
    store.set('desktopOrder', [...iconLayer.querySelectorAll('.desktop-icon')].map(icon => icon.dataset.app));
  }

  function makeIconDraggable(icon) {
    let moved = false;
    let suppressClick = false;
    let startX = 0;
    let startY = 0;

    const finish = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      icon.classList.remove('dragging');
      iconLayer.classList.remove('dragging');
      if (moved) {
        suppressClick = true;
        saveDesktopOrder();
      }
    };
    const move = event => {
      if (!moved && Math.hypot(event.clientX - startX, event.clientY - startY) < 8) return;
      moved = true;
      icon.classList.add('dragging');
      iconLayer.classList.add('dragging');
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.desktop-icon');
      if (!target || target === icon || target.classList.contains('tv-desktop') || target.parentElement !== iconLayer) return;
      const rect = target.getBoundingClientRect();
      const before = event.clientY < rect.top + rect.height / 2;
      iconLayer.insertBefore(icon, before ? target : target.nextSibling);
    };

    icon.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      moved = false;
      startX = event.clientX;
      startY = event.clientY;
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', finish);
    });
    icon.addEventListener('click', event => {
      if (suppressClick) {
        suppressClick = false;
        event.preventDefault();
        return;
      }
      launch(icon.dataset.app);
    });
  }

  function orderedDesktopApps() {
    const order = store.get('desktopOrder', []);
    const rank = new Map(Array.isArray(order) ? order.map((id, index) => [id, index]) : []);
    return Object.entries(APPS)
      .filter(([, app]) => app.desktop)
      .sort(([first], [second]) => (rank.get(first) ?? Number.MAX_SAFE_INTEGER) - (rank.get(second) ?? Number.MAX_SAFE_INTEGER));
  }

  async function launch(appId, opts = {}) {
    const app = APPS[appId];
    if (!app) return;

    if (appId !== 'player') {
      const recent = store.get('recentApps', []);
      store.set('recentApps', [appId, ...(Array.isArray(recent) ? recent : []).filter(id => id !== appId)].slice(0, 6));
      document.dispatchEvent(new Event('idk-recent-changed'));
    }

    if (app.action) {
      app.action();
      return;
    }

    if (!app.multi && open.has(appId)) {
      focus(open.get(appId));
      return;
    }

    const win = template.content.firstElementChild.cloneNode(true);
    const key = app.multi ? `${appId}:${Date.now()}` : appId;
    win.dataset.app = appId;
    win.dataset.windowKey = key;
    const titlebar = win.querySelector('.titlebar');
    const content = win.querySelector('.content');
    win.querySelector('.title').textContent = opts.title || app.title;
    place(win, opts.width || app.width || 720, opts.height || app.height || 520);
    if (opts.workspace) applyWorkspaceState(win, opts.workspace);
    windowLayer.append(win);
    focus(win);
    drag(win, titlebar);
    resize(win, win.querySelector('.resizer'));

    open.set(key, win);
    markDock();

    win.addEventListener('pointerdown', () => focus(win), true);
    win.querySelector('.close').addEventListener('click', () => {
      window.TV?.release(win);
      content.firstElementChild?.cleanup?.();
      const frame = content.querySelector('iframe');
      if (frame && frame.src.startsWith('blob:')) URL.revokeObjectURL(frame.src);
      win.remove();
      open.delete(key);
      markDock();
      scheduleWorkspaceSave();
    });
    win.querySelector('.min').addEventListener('click', () => {
      window.TV?.minimize(win);
      win.classList.add('minimized');
      scheduleWorkspaceSave();
    });
    win.querySelector('.max').addEventListener('click', () => {
      win.classList.remove('snapped-left', 'snapped-right');
      win.classList.toggle('maximized');
      scheduleWorkspaceSave();
    });
    titlebar.addEventListener('dblclick', event => {
      if (event.target.closest('.ctrl')) return;
      win.classList.remove('snapped-left', 'snapped-right');
      win.classList.toggle('maximized');
      scheduleWorkspaceSave();
    });

    content.replaceChildren(loadingView(`Opening ${app.title}`));
    content.setAttribute('aria-busy', 'true');

    setLoading(true);
    try {
      const view = await app.render(opts);
      content.replaceChildren(view);
    } catch (err) {
      content.replaceChildren(Object.assign(document.createElement('div'), {
        className: 'empty-state',
        textContent: err.message
      }));
    } finally {
      content.removeAttribute('aria-busy');
      setLoading(false);
    }
  }

  function timezoneOffsetMinutes(zone, date = new Date()) {
    try {
      const part = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' })
        .formatToParts(date)
        .find(item => item.type === 'timeZoneName')?.value || 'GMT';
      const match = part.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
      if (!match) return 0;
      return (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3] || 0));
    } catch (e) {
      return 0;
    }
  }

  function tickClock() {
    const timezone = store.get('timezone', '');
    const daylightSaving = store.get('timezoneDST', true);
    let now = new Date();
    let timeZone = timezone || undefined;
    if (timezone && daylightSaving === false) {
      const offset = Number(store.get('timezoneOffset', timezoneOffsetMinutes(timezone))) || 0;
      now = new Date(now.getTime() + offset * 60000);
      timeZone = 'UTC';
    }
    const use24 = store.get('clock24', false);
    document.getElementById('clock-time').textContent = now.toLocaleTimeString([], {
      hour: use24 ? '2-digit' : 'numeric',
      minute: '2-digit',
      hour12: !use24,
      timeZone
    });
    document.getElementById('clock-date').textContent = now.toLocaleDateString([], {
      weekday: 'long', month: 'long', day: 'numeric',
      timeZone
    });
  }

  function buildStartMenu() {
    if (!startToggle || !startMenu || !startApps) return;
    const renderRecent = () => {
      if (!startRecent) return;
      const recent = store.get('recentApps', []).filter(id => APPS[id] && id !== 'player').slice(0, 4);
      startRecent.replaceChildren();
      if (!recent.length) {
        startRecent.append(Object.assign(document.createElement('span'), { className: 'recent-empty', textContent: 'No apps used yet' }));
        return;
      }
      recent.forEach(id => {
        const app = APPS[id];
        const button = document.createElement('button');
        button.className = 'recent-app';
        button.type = 'button';
        button.innerHTML = `<span class="recent-app-glyph">${app.glyph}</span><span>${app.title}</span>`;
        button.addEventListener('click', () => { closeStart(); launch(id); });
        startRecent.append(button);
      });
    };
    const render = () => {
      const query = startSearch.value.trim().toLowerCase();
      startApps.replaceChildren();
      Object.entries(APPS)
        .filter(([id, app]) => id !== 'player' && (!query || app.title.toLowerCase().includes(query)))
        .forEach(([id, app]) => {
          const button = document.createElement('button');
          button.className = `start-app${app.danger ? ' danger' : ''}`;
          button.type = 'button';
          button.innerHTML = `<span class="start-app-glyph">${app.glyph}</span><span>${app.title}</span>`;
          button.addEventListener('click', () => { closeStart(); launch(id); });
          startApps.append(button);
        });
       if (!startApps.children.length) startApps.append(Object.assign(document.createElement('div'), { className: 'empty-state', textContent: 'No apps found.' }));
      renderRecent();
    };
    startSearch.addEventListener('input', render);
    document.addEventListener('idk-recent-changed', renderRecent);
    startToggle.addEventListener('click', event => {
      event.stopPropagation();
      const opening = startMenu.hidden;
      startMenu.hidden = !opening;
      startToggle.setAttribute('aria-expanded', String(opening));
      if (opening) { render(); startSearch.focus(); }
    });
    document.addEventListener('pointerdown', event => {
      if (!startMenu.contains(event.target) && event.target !== startToggle) closeStart();
    });
    window.addEventListener('keydown', event => {
      if ((event.ctrlKey || event.metaKey) && event.code === 'Space') {
        event.preventDefault();
        startToggle.click();
      }
      if (event.key === 'Escape') closeStart();
      if ((event.ctrlKey || event.metaKey) && event.altKey && event.code === 'KeyR') {
        event.preventDefault();
        restoreWorkspace();
      }
    });
    render();
    renderRecent();
  }

  function build() {
    orderedDesktopApps().forEach(([id, app]) => {
      const icon = document.createElement('button');
      icon.className = 'desktop-icon';
      icon.type = 'button';
      icon.dataset.app = id;
      icon.innerHTML = `<span class="glyph">${app.glyph}</span><span class="label">${app.title}</span>`;
      if (id === 'tv') window.TV?.mount(icon);
      if (id !== 'tv') makeIconDraggable(icon);
      iconLayer.append(icon);
    });
    Object.entries(APPS).forEach(([id, app]) => {
      if (app.dock === false) return;

      const btn = document.createElement('button');
      btn.className = 'dock-btn';
      btn.type = 'button';
      btn.dataset.app = id;
      btn.title = app.title;
      btn.setAttribute('aria-label', app.title);
      if (app.danger) btn.classList.add('danger');
      btn.innerHTML = app.glyph;
      btn.addEventListener('click', () => launch(id));
      dock.append(btn);
    });
    buildDockMedia();

    applyWallpaper(store.get('wallpaper', DEFAULT_WALLPAPER));
    applyTheme(store.get('theme', 'midnight'));
    applyIconSize(store.get('iconSize', 'normal'));
    applyDockPosition(store.get('dockPosition', 'bottom'));
    applyMotion(store.get('motion', 'on'));
    buildStartMenu();
    tickClock();
    setInterval(tickClock, 1000);
    window.addEventListener('beforeunload', saveWorkspace);
    const params = new URLSearchParams(location.search);
    if (params.get('room') || location.hash === '#chat') setTimeout(() => launch('chat'), 0);
    else if (store.get(WORKSPACE_KEY, []).length) setTimeout(() => restoreWorkspace({ quiet: true }), 0);
  }

  build();
  return { open: launch, tickClock, setLoading, notify, restoreWorkspace, clearWorkspace };
})();

window.OS = OS;
