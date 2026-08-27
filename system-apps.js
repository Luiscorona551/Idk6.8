window.SYSTEM_APPS = (() => {
  const FILES_KEY = 'idkFileSystem';
  const NOTES_KEY = 'idkNotes';
  const NOTES_PAIR_KEY = 'idkNotesPair';
  const FILE_DB = 'idkFileBlobs';
  const FILE_STORE = 'files';
  const AI_ENDPOINT_KEY = 'idkAIEndpoint';
  const AI_MODEL_KEY = 'idkAIModel';
  let fileDBPromise;

  const ui = (tag, props = {}, children = []) => {
    const node = Object.assign(document.createElement(tag), props);
    children.forEach(child => node.append(child));
    return node;
  };

  const read = (key, fallback) => {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : JSON.parse(value);
    } catch (error) {
      return fallback;
    }
  };

  const write = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (error) { /* storage unavailable */ }
  };

  const openFileDB = () => {
    if (!window.indexedDB) return Promise.reject(new Error('Browser file storage is unavailable.'));
    if (fileDBPromise) return fileDBPromise;
    fileDBPromise = new Promise((resolve, reject) => {
      const request = window.indexedDB.open(FILE_DB, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(FILE_STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not open file storage.'));
    });
    return fileDBPromise;
  };

  const storeBlob = async (id, blob) => {
    const db = await openFileDB();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(FILE_STORE, 'readwrite');
      transaction.objectStore(FILE_STORE).put(blob, id);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error('Could not save file.'));
    });
  };

  const loadBlob = async id => {
    const db = await openFileDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(FILE_STORE, 'readonly');
      const request = transaction.objectStore(FILE_STORE).get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('Could not read file.'));
    });
  };

  const deleteBlob = async id => {
    if (!window.indexedDB) return;
    const db = await openFileDB();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(FILE_STORE, 'readwrite');
      transaction.objectStore(FILE_STORE).delete(id);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error('Could not remove file.'));
    });
  };

  const blobFor = async entry => {
    if (entry.storage === 'indexeddb') return loadBlob(entry.id);
    if (typeof entry.content === 'string') return new Blob([entry.content], { type: entry.mime || 'text/plain' });
    return null;
  };

  const formatBytes = size => {
    if (!Number.isFinite(size)) return 'Unknown size';
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  const isTextFile = entry => entry.text === true || (entry.mime || '').startsWith('text/') || /\.(txt|md|json|csv|log|xml|html?|css|js|ts|jsx|tsx|yaml|yml|ini|conf|svg)$/i.test(entry.name);

  function initialFiles() {
    return [
      { id: 'documents', name: 'Documents', type: 'folder', parent: '', updated: Date.now() },
      { id: 'welcome', name: 'Welcome.txt', type: 'file', parent: '', updated: Date.now(), content: 'Welcome to IDK 6.8.\n\nThis is your local file system.', mime: 'text/plain', text: true }
    ];
  }

  function getFiles() {
    const files = read(FILES_KEY, null);
    if (Array.isArray(files) && files.length) return files;
    const seeded = initialFiles();
    write(FILES_KEY, seeded);
    return seeded;
  }

  function formatDate(timestamp) {
    return new Date(timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  }

  function filesApp() {
    const root = ui('div', { className: 'system-app files-app' });
    const entries = getFiles();
    let current = '';

    const back = ui('button', { className: 'btn tab', type: 'button', textContent: 'Back', hidden: true });
    const path = ui('span', { className: 'system-path', textContent: 'C:\\IDK' });
    const search = ui('input', { className: 'field file-search', type: 'search', placeholder: 'Search files…', 'aria-label': 'Search files' });
    const newFolder = ui('button', { className: 'btn tab', type: 'button', textContent: 'New folder' });
    const newFile = ui('button', { className: 'btn tab', type: 'button', textContent: 'New text file' });
    const uploadButton = ui('button', { className: 'btn tab', type: 'button', textContent: 'Import files' });
    const upload = ui('input', { type: 'file', hidden: true, multiple: true });
    const body = ui('div', { className: 'file-list' });

    const persist = () => write(FILES_KEY, entries);
    const idFor = name => `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`;
    let previewURL = '';

    const clearPreview = () => {
      if (previewURL) URL.revokeObjectURL(previewURL);
      previewURL = '';
    };

    const removeEntry = async entry => {
      if (!window.confirm(`Delete ${entry.name}?`)) return;
      if (entry.storage === 'indexeddb') await deleteBlob(entry.id);
      const index = entries.indexOf(entry);
      if (index >= 0) entries.splice(index, 1);
      persist();
      window.OS?.notify('Files', `${entry.name} was deleted.`);
      renderFolder();
    };

    const downloadBlob = (blob, name) => {
      if (!blob) return;
      const href = URL.createObjectURL(blob);
      const link = ui('a', { href, download: name });
      link.click();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
    };

    const openEditor = async entry => {
      clearPreview();
      path.textContent = `C:\\IDK\\${entry.name}`;
      back.hidden = false;
      search.hidden = newFolder.hidden = newFile.hidden = uploadButton.hidden = true;
      body.replaceChildren(ui('div', { className: 'empty-state', textContent: 'Opening file…' }));
      try {
        const blob = await blobFor(entry);
        if (!blob) throw new Error('This file is no longer available. Import it again.');
        if (!isTextFile(entry)) {
          const download = ui('button', { className: 'btn', type: 'button', textContent: 'Download file' });
          download.addEventListener('click', () => downloadBlob(blob, entry.name));
          const rename = ui('button', { className: 'btn tab', type: 'button', textContent: 'Rename' });
          rename.addEventListener('click', () => {
            const name = window.prompt('New file name', entry.name);
            if (!name?.trim()) return;
            entry.name = name.trim();
            entry.updated = Date.now();
            persist();
            openEditor(entry);
          });
          const remove = ui('button', { className: 'btn tab', type: 'button', textContent: 'Delete' });
          remove.addEventListener('click', () => removeEntry(entry));
          previewURL = URL.createObjectURL(blob);
          const preview = entry.mime?.startsWith('image/')
            ? ui('img', { className: 'file-image-preview', src: previewURL, alt: entry.name })
            : entry.mime === 'application/pdf'
              ? ui('iframe', { className: 'file-pdf-preview', src: previewURL, title: entry.name })
              : ui('div', { className: 'file-preview-icon', textContent: '📦' });
          body.replaceChildren(ui('div', { className: 'file-preview' }, [
            preview,
            ui('h3', { textContent: entry.name }),
            ui('p', { textContent: `${entry.mime || 'Unknown type'} · ${formatBytes(entry.size ?? blob.size)} · ${formatDate(entry.updated)}` }),
            ui('div', { className: 'file-preview-actions' }, [download, rename, remove])
          ]));
          return;
        }

        const area = ui('textarea', { className: 'file-editor', spellcheck: false, value: await blob.text() });
        const save = ui('button', { className: 'btn', type: 'button', textContent: 'Save' });
        const download = ui('button', { className: 'btn tab', type: 'button', textContent: 'Download' });
        const rename = ui('button', { className: 'btn tab', type: 'button', textContent: 'Rename' });
        const remove = ui('button', { className: 'btn tab', type: 'button', textContent: 'Delete' });
        const status = ui('span', { className: 'count', textContent: formatDate(entry.updated) });
        save.addEventListener('click', async () => {
          const updatedBlob = new Blob([area.value], { type: entry.mime || 'text/plain' });
          if (entry.storage === 'indexeddb') await storeBlob(entry.id, updatedBlob);
          else entry.content = area.value;
          entry.size = updatedBlob.size;
          entry.updated = Date.now();
          persist();
          status.textContent = 'Saved just now';
        });
        download.addEventListener('click', () => downloadBlob(new Blob([area.value], { type: entry.mime || 'text/plain' }), entry.name));
        rename.addEventListener('click', () => {
          const name = window.prompt('New file name', entry.name);
          if (!name?.trim()) return;
          entry.name = name.trim();
          entry.updated = Date.now();
          persist();
          path.textContent = `C:\\IDK\\${entry.name}`;
          status.textContent = 'Renamed just now';
        });
        remove.addEventListener('click', () => removeEntry(entry));
        body.replaceChildren(ui('div', { className: 'file-editor-bar' }, [save, download, rename, remove, status]), area);
      } catch (error) {
        body.replaceChildren(ui('div', { className: 'empty-state', textContent: error.message }));
      }
    };

    const renderFolder = () => {
      clearPreview();
      path.textContent = current ? `C:\\IDK\\${entries.find(item => item.id === current)?.name || ''}` : 'C:\\IDK';
      back.hidden = !current;
      search.hidden = newFolder.hidden = newFile.hidden = uploadButton.hidden = false;
      body.replaceChildren();
      const query = search.value.trim().toLowerCase();
      const visible = entries.filter(item => item.parent === current && (!query || item.name.toLowerCase().includes(query)))
        .sort((a, b) => Number(b.type === 'folder') - Number(a.type === 'folder') || a.name.localeCompare(b.name));
      if (!visible.length) {
        body.append(ui('div', { className: 'empty-state', textContent: 'This folder is empty.' }));
        return;
      }
      visible.forEach(entry => {
        const row = ui('button', { className: 'file-entry', type: 'button' });
        row.append(
          ui('span', { className: 'file-entry-icon', textContent: entry.type === 'folder' ? '📁' : '📄' }),
          ui('span', { className: 'file-entry-name' }, [
            ui('strong', { textContent: entry.name }),
            ui('small', { textContent: entry.type === 'folder' ? 'Folder' : `${formatDate(entry.updated)} · ${entry.mime || 'Text file'} · ${formatBytes(entry.size ?? entry.content?.length)}` })
          ])
        );
        row.addEventListener('click', () => {
          if (entry.type === 'folder') { current = entry.id; renderFolder(); } else openEditor(entry);
        });
        body.append(row);
      });
    };

    back.addEventListener('click', () => {
      current = entries.find(item => item.id === current)?.parent || '';
      renderFolder();
    });
    search.addEventListener('input', renderFolder);
    newFolder.addEventListener('click', () => {
      const name = window.prompt('Folder name');
      if (!name?.trim()) return;
      entries.push({ id: idFor(name), name: name.trim(), type: 'folder', parent: current, updated: Date.now() });
      persist();
      renderFolder();
    });
    newFile.addEventListener('click', () => {
      const name = window.prompt('Text file name', 'New file.txt');
      if (!name?.trim()) return;
      const entry = { id: idFor(name), name: name.trim(), type: 'file', parent: current, updated: Date.now(), size: 0, mime: 'text/plain', text: true, content: '' };
      entries.push(entry);
      persist();
      openEditor(entry);
    });
    uploadButton.addEventListener('click', () => upload.click());
    upload.addEventListener('change', async () => {
      const files = Array.from(upload.files || []);
      if (!files.length) return;
      uploadButton.disabled = true;
      try {
        for (const file of files) {
          const entry = {
            id: idFor(file.name), name: file.name, type: 'file', parent: current,
            updated: Date.now(), size: file.size, mime: file.type || 'application/octet-stream', storage: 'indexeddb', text: isTextFile({ name: file.name, mime: file.type })
          };
          await storeBlob(entry.id, file);
          entries.push(entry);
        }
        persist();
        window.OS?.notify('Files', `${files.length} file${files.length === 1 ? '' : 's'} imported.`);
        renderFolder();
      } catch (error) {
        window.alert(`Import failed: ${error.message}`);
      } finally {
        uploadButton.disabled = false;
        upload.value = '';
      }
    });
    body.addEventListener('dragover', event => { event.preventDefault(); root.classList.add('drop-active'); });
    body.addEventListener('dragleave', event => { if (!body.contains(event.relatedTarget)) root.classList.remove('drop-active'); });
    body.addEventListener('drop', event => {
      event.preventDefault();
      root.classList.remove('drop-active');
      const files = Array.from(event.dataTransfer?.files || []);
      if (!files.length) return;
      const transfer = new DataTransfer();
      files.forEach(file => transfer.items.add(file));
      upload.files = transfer.files;
      upload.dispatchEvent(new Event('change', { bubbles: true }));
    });

    root.append(ui('div', { className: 'system-toolbar' }, [back, path, search, ui('span', { className: 'toolbar-spacer' }), newFolder, newFile, uploadButton, upload]), body);
    renderFolder();
    return root;
  }

  function notesApp() {
    const root = ui('div', { className: 'system-app notes-app' });
    const status = ui('span', { className: 'count', textContent: 'Saved locally' });
    const saved = read(NOTES_PAIR_KEY, null);
    const notes = Array.isArray(saved) && saved.length === 2
      ? saved
      : [{ title: 'Notepad 1', text: read(NOTES_KEY, '') }, { title: 'Notepad 2', text: '' }];
    const persist = () => {
      write(NOTES_PAIR_KEY, notes);
      write(NOTES_KEY, notes[0].text);
      status.textContent = 'Saved locally';
    };
    const clearAll = ui('button', { className: 'btn tab', type: 'button', textContent: 'Clear both' });
    clearAll.addEventListener('click', () => {
      if ((!notes[0].text && !notes[1].text) || window.confirm('Clear both notepads?')) {
        notes.forEach(note => { note.text = ''; });
        root.querySelectorAll('.notes-area').forEach(area => { area.value = ''; });
        persist();
        status.textContent = 'Cleared';
      }
    });

    const grid = ui('div', { className: 'notes-grid' });
    notes.forEach((note, index) => {
      const title = ui('input', { className: 'notes-title', type: 'text', value: note.title || `Notepad ${index + 1}`, 'aria-label': `Notepad ${index + 1} title` });
      const area = ui('textarea', { className: 'notes-area', placeholder: `Write in ${note.title || `Notepad ${index + 1}`}…` });
      area.value = note.text || '';
      const clear = ui('button', { className: 'btn tab', type: 'button', textContent: 'Clear' });
      title.addEventListener('input', () => { note.title = title.value; persist(); });
      area.addEventListener('input', () => { note.text = area.value; persist(); });
      clear.addEventListener('click', () => {
        if (!area.value || window.confirm(`Clear ${title.value || `Notepad ${index + 1}`}?`)) {
          area.value = '';
          note.text = '';
          persist();
        }
      });
      grid.append(ui('section', { className: 'notepad-card' }, [
        ui('div', { className: 'notepad-toolbar' }, [title, clear]), area
      ]));
    });
    root.append(ui('div', { className: 'system-toolbar' }, [ui('strong', { textContent: 'Notes · 2 notepads' }), ui('span', { className: 'toolbar-spacer' }), status, clearAll]), grid);
    return root;
  }

  function calculatorApp() {
    const root = ui('div', { className: 'system-app calculator-app' });
    const display = ui('input', { className: 'calculator-display', type: 'text', readonly: true, value: '' });
    let expression = '';
    const render = () => { display.value = expression || '0'; };
    const calculate = () => {
      if (!expression || !/^[0-9+*/%().\s-]+$/.test(expression)) return;
      try {
        const value = Function(`"use strict"; return (${expression})`)();
        if (!Number.isFinite(value)) throw new Error('Not a number');
        expression = String(Number(value.toFixed(10)));
      } catch { expression = ''; display.value = 'Error'; return; }
      render();
    };
    const buttons = ['C', '⌫', '%', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '0', '.', '(', ')', '='];
    const grid = ui('div', { className: 'calculator-grid' });
    buttons.forEach(label => {
      const button = ui('button', { className: `calc-key${label === '=' ? ' calc-equals' : ''}`, type: 'button', textContent: label });
      button.addEventListener('click', () => {
        if (label === 'C') expression = '';
        else if (label === '⌫') expression = expression.slice(0, -1);
        else if (label === '=') return calculate();
        else expression += ({ '÷': '/', '×': '*', '−': '-' }[label] || label);
        render();
      });
      grid.append(button);
    });
    root.addEventListener('keydown', event => {
      if (/^[0-9+*/%().-]$/.test(event.key)) expression += event.key;
      else if (event.key === 'Enter') calculate();
      else if (event.key === 'Backspace') expression = expression.slice(0, -1);
      else if (event.key === 'Escape') expression = '';
      else return;
      render();
    });
    root.tabIndex = 0;
    root.append(display, grid);
    render();
    setTimeout(() => root.focus(), 0);
    return root;
  }

  function aiApp() {
    const root = ui('div', { className: 'system-app ai-app' });
    const log = ui('div', { className: 'ai-log' });
     const endpoint = ui('input', { className: 'field', type: 'text', value: read(AI_ENDPOINT_KEY, '/api/ai'), placeholder: 'Server AI route or custom endpoint' });
     const model = ui('input', { className: 'field', type: 'text', value: read(AI_MODEL_KEY, 'gpt-4o-mini'), placeholder: 'Model' });
     const key = ui('input', { className: 'field', type: 'password', placeholder: 'Optional one-time API key' });
     const mode = ui('select', { className: 'field ai-mode', 'aria-label': 'AI mode' });
    [['chat', 'Chat'], ['code', 'Code'], ['image', 'Image']].forEach(([value, label]) => mode.append(ui('option', { value, textContent: label })));
    const prompt = ui('textarea', { className: 'ai-prompt', placeholder: 'Ask an everyday question...', rows: 2 });
    const send = ui('button', { className: 'btn', type: 'button', textContent: 'Ask' });
     const status = ui('span', { className: 'count', textContent: 'Ready' });
     const history = [{ role: 'system', content: 'You are a clear, practical everyday assistant. Be helpful, concise, and honest about uncertainty.' }];
     const keyNote = ui('span', { className: 'ai-key-note', textContent: 'Checking server key…' });

    const addMessage = (role, text, type = 'text') => {
      const row = ui('div', { className: `ai-line ${role}${type === 'image' ? ' ai-line-image' : ''}` }, [ui('span', { className: 'ai-line-label', textContent: role === 'user' ? 'You' : 'AI' })]);
      if (type === 'code') {
        const code = ui('pre', {}, [ui('code', { textContent: text })]);
        const copy = ui('button', { className: 'btn tab', type: 'button', textContent: 'Copy code' });
        const download = ui('a', { className: 'btn tab', href: `data:text/plain;charset=utf-8,${encodeURIComponent(text)}`, download: 'idk-ai-code.txt', textContent: 'Download' });
        copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(text); copy.textContent = 'Copied'; } catch { window.prompt('Copy this code', text); } });
        row.append(code, ui('div', { className: 'ai-code-actions' }, [copy, download]));
      } else if (type === 'image') {
        row.append(ui('img', { src: text, alt: 'AI generated image' }), ui('a', { className: 'btn tab', href: text, download: 'idk-ai-image.png', textContent: 'Download image' }));
      } else {
        row.append(ui('p', { textContent: text }));
      }
      log.append(row);
      log.scrollTop = log.scrollHeight;
    };
     addMessage('assistant', 'Choose Chat, Code, or Image mode. The server key is used automatically when configured.');

     fetch('/api/ai/status', { cache: 'no-store' })
       .then(response => response.ok ? response.json() : Promise.reject(new Error('unavailable')))
       .then(data => { keyNote.textContent = data.configured ? `Server key ready · ${data.model}` : 'Set AI_API_KEY on the server, or use a one-time key.'; })
       .catch(() => { keyNote.textContent = 'Server AI route unavailable · custom endpoint still works.'; });

    const ask = async () => {
      const text = prompt.value.trim();
      if (!text || send.disabled) return;
       const url = endpoint.value.trim();
       if (!url) return;
       const selectedMode = mode.value;
       const serverRoute = url === '/api/ai' || url === `${location.origin}/api/ai`;
       if (!serverRoute && !key.value.trim()) {
         addMessage('assistant', 'Add an API key above for a custom endpoint. It is used only for this window.');
         return;
       }
      if (selectedMode !== 'image') history.push({ role: 'user', content: text });
      addMessage('user', text);
      prompt.value = '';
      send.disabled = true;
      status.textContent = selectedMode === 'image' ? 'Creating image...' : 'Thinking...';
      try {
         const messages = selectedMode === 'code'
           ? [history[0], { role: 'system', content: 'You are an expert coding assistant. Return clear, complete code with a short explanation only when useful. Never claim code was executed.' }, ...history.slice(1)]
           : history;
         const body = serverRoute
           ? selectedMode === 'image'
             ? { mode: selectedMode, model: model.value.trim() || 'gpt-image-1', prompt: text, apiKey: key.value.trim() || undefined }
             : { mode: selectedMode, model: model.value.trim() || 'gpt-4o-mini', messages, apiKey: key.value.trim() || undefined }
           : selectedMode === 'image'
             ? { model: model.value.trim() || 'gpt-image-1', prompt: text, n: 1, size: '1024x1024' }
             : { model: model.value.trim() || 'gpt-4o-mini', messages, temperature: 0.7 };
         const imageEndpoint = url.replace(/\/chat\/completions\/?$/i, '/images/generations');
         const requestURL = serverRoute ? url : selectedMode === 'image' ? imageEndpoint : url;
         const headers = { 'content-type': 'application/json' };
         if (!serverRoute) headers.authorization = `Bearer ${key.value.trim()}`;
         const response = await fetch(requestURL, {
           method: 'POST',
           headers,
           body: JSON.stringify(body)
         });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error?.message || `Request failed (${response.status})`);
        if (selectedMode === 'image') {
          const image = data.data?.[0];
          const imageURL = image?.url || (image?.b64_json ? `data:image/png;base64,${image.b64_json}` : '');
          if (!imageURL) throw new Error('The AI returned no image.');
          addMessage('assistant', imageURL, 'image');
        } else {
          const answer = data.choices?.[0]?.message?.content || data.output_text;
          if (!answer) throw new Error('The AI returned no answer.');
          history.push({ role: 'assistant', content: answer });
          addMessage('assistant', answer, selectedMode === 'code' ? 'code' : 'text');
        }
        status.textContent = 'Ready';
      } catch (error) {
        addMessage('assistant', `Could not connect: ${error.message}`);
        status.textContent = 'Connection error';
      } finally {
        send.disabled = false;
        prompt.focus();
      }
    };
     endpoint.addEventListener('change', () => write(AI_ENDPOINT_KEY, endpoint.value.trim()));
    model.addEventListener('change', () => write(AI_MODEL_KEY, model.value.trim()));
    mode.addEventListener('change', () => {
      const imageMode = mode.value === 'image';
      prompt.placeholder = imageMode ? 'Describe the image to create...' : mode.value === 'code' ? 'Describe the code to create...' : 'Ask an everyday question...';
      send.textContent = imageMode ? 'Generate' : mode.value === 'code' ? 'Create code' : 'Ask';
      if (imageMode && model.value === 'gpt-4o-mini') model.value = 'gpt-image-1';
      if (!imageMode && model.value === 'gpt-image-1') model.value = 'gpt-4o-mini';
    });
    send.addEventListener('click', ask);
    prompt.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); ask(); } });

    root.append(
       ui('div', { className: 'ai-config' }, [endpoint, model, mode, key, keyNote]),
      log,
      ui('div', { className: 'ai-composer' }, [prompt, send, status])
    );
    return root;
  }

  function terminalApp() {
    const root = ui('div', { className: 'system-app dos-app' });
    const output = ui('div', { className: 'dos-output' });
    const input = ui('input', { className: 'dos-input', type: 'text', spellcheck: false, autocomplete: 'off' });
    const aliases = { file: 'files', files: 'files', note: 'notes', notes: 'notes', calc: 'calculator', calculator: 'calculator', calendar: 'calendar', todo: 'todo', 'to-do': 'todo', images: 'viewer', viewer: 'viewer', stopwatch: 'stopwatch', timer: 'stopwatch', weather: 'weather', ai: 'ai', apps: 'apps', search: 'search', paint: 'paint', speaker: 'speaker', terminal: 'terminal', games: 'games', movies: 'movies', music: 'music', soundboard: 'soundboard', settings: 'settings', roblox: 'roblox', browser: 'proxy', proxy: 'proxy' };
    const web = {
      facebook: ['Facebook', 'https://www.facebook.com/'], instagram: ['Instagram', 'https://www.instagram.com/'], tiktok: ['TikTok', 'https://www.tiktok.com/'], youtube: ['YouTube', 'https://www.youtube.com/'], twitter: ['Twitter', 'https://twitter.com/'], reddit: ['Reddit', 'https://www.reddit.com/'], discord: ['Discord', 'https://discord.com/app'], twitch: ['Twitch', 'https://www.twitch.tv/'], 'internet archive': ['Internet Archive', 'https://archive.org/']
    };
    const print = text => { output.append(ui('div', { className: 'dos-line', textContent: text })); output.scrollTop = output.scrollHeight; };
    const open = target => {
      const name = target.trim().toLowerCase();
      if (web[name]) { OS.open('proxy', { title: `${web[name][0]} — Proxy`, url: web[name][1] }); return; }
      const id = aliases[name] || (typeof APPS !== 'undefined' && Object.keys(APPS).find(key => key === name || APPS[key].title.toLowerCase() === name));
      if (id) OS.open(id); else print(`Bad command or file name: ${target}`);
    };
    const run = command => {
      const value = command.trim();
      if (!value) return;
      print(`C:\\IDK>${value}`);
      const [raw, ...rest] = value.split(/\s+/);
      const cmd = raw.toLowerCase();
      const arg = rest.join(' ');
      if (cmd === 'help' || cmd === '?') print('HELP  DIR  APPS  OPEN <name>  START <name>  NOTES  FILES  CALC  CALENDAR  TODO  IMAGES  TIMER  WEATHER  AI  PAINT  SPEAKER  SEARCH  CLS  VER  DATE  TIME  ECHO <text>');
      else if (cmd === 'dir' || cmd === 'apps') print('Apps  Search  Files  Notes  Calculator  Calendar  To-do  Images  Stopwatch  Speaker  Paint  Weather  AI  Terminal  Games  Movies  Music  Soundboard  Proxy  Settings');
      else if (cmd === 'open' || cmd === 'start') arg ? open(arg) : print('Usage: OPEN <app>');
      else if (aliases[cmd]) open(cmd);
      else if (cmd === 'cls' || cmd === 'clear') output.replaceChildren();
      else if (cmd === 'ver') print('IDK 6.8 terminal');
      else if (cmd === 'date') print(new Date().toLocaleDateString());
      else if (cmd === 'time') print(new Date().toLocaleTimeString());
      else if (cmd === 'echo') print(arg);
      else print(`Bad command or file name: ${raw}`);
    };
    input.addEventListener('keydown', event => { if (event.key === 'Enter') { run(input.value); input.value = ''; } });
    print('IDK 6.8 Terminal');
    print('(C) IDK Systems. Type HELP for a list of commands.');
    root.append(output, ui('div', { className: 'dos-input-row' }, [ui('span', { className: 'dos-prompt', textContent: 'C:\\IDK>' }), input]));
    setTimeout(() => input.focus(), 0);
    return root;
  }

  function paintApp() {
    const root = ui('div', { className: 'system-app paint-app' });
    const canvas = ui('canvas', { className: 'paint-canvas', width: 1000, height: 600 });
    const tool = ui('select', { className: 'field paint-tool', 'aria-label': 'Paint tool' });
    [['pencil', 'Pencil'], ['eraser', 'Eraser'], ['line', 'Line'], ['rectangle', 'Rectangle'], ['ellipse', 'Circle'], ['fill', 'Fill']].forEach(([value, label]) => tool.append(ui('option', { value, textContent: label })));
    const color = ui('input', { className: 'paint-color', type: 'color', value: '#17224a', 'aria-label': 'Paint color' });
    const size = ui('input', { className: 'paint-size', type: 'range', min: '1', max: '48', value: '8', 'aria-label': 'Brush size' });
    const sizeLabel = ui('span', { className: 'paint-size-label', textContent: '8 px' });
    const clear = ui('button', { className: 'btn tab', type: 'button', textContent: 'Clear' });
    const save = ui('button', { className: 'btn', type: 'button', textContent: 'Save PNG' });
    const status = ui('span', { className: 'count', textContent: 'Ready' });
    const ctx = canvas.getContext('2d');
    let drawing = false;
    let start = null;
    let snapshot = null;

    const background = () => { ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.restore(); };
    const point = event => {
      const rect = canvas.getBoundingClientRect();
      return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height };
    };
    const style = () => {
      ctx.lineWidth = Number(size.value);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = tool.value === 'eraser' ? '#ffffff' : color.value;
      ctx.fillStyle = color.value;
      ctx.globalCompositeOperation = tool.value === 'eraser' ? 'destination-out' : 'source-over';
    };
    const drawShape = pointValue => {
      const width = pointValue.x - start.x;
      const height = pointValue.y - start.y;
      ctx.beginPath();
      if (tool.value === 'line') { ctx.moveTo(start.x, start.y); ctx.lineTo(pointValue.x, pointValue.y); ctx.stroke(); }
      if (tool.value === 'rectangle') ctx.strokeRect(start.x, start.y, width, height);
      if (tool.value === 'ellipse') ctx.ellipse(start.x + width / 2, start.y + height / 2, Math.abs(width / 2), Math.abs(height / 2), 0, 0, Math.PI * 2);
      if (tool.value === 'ellipse') ctx.stroke();
    };
    const draw = event => {
      if (!drawing || !start) return;
      const pointValue = point(event);
      style();
      if (['line', 'rectangle', 'ellipse'].includes(tool.value)) {
        ctx.putImageData(snapshot, 0, 0);
        drawShape(pointValue);
      } else {
        ctx.lineTo(pointValue.x, pointValue.y);
        ctx.stroke();
      }
    };
    canvas.addEventListener('pointerdown', event => {
      event.preventDefault();
      const pointValue = point(event);
      if (tool.value === 'fill') { ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = color.value; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.restore(); status.textContent = 'Canvas filled'; return; }
      drawing = true;
      start = pointValue;
      snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
      canvas.setPointerCapture?.(event.pointerId);
      style();
      ctx.beginPath();
      ctx.moveTo(pointValue.x, pointValue.y);
      if (!['line', 'rectangle', 'ellipse'].includes(tool.value)) ctx.lineTo(pointValue.x + .01, pointValue.y + .01), ctx.stroke();
    });
    canvas.addEventListener('pointermove', draw);
    const end = event => { if (!drawing) return; draw(event); drawing = false; start = snapshot = null; status.textContent = 'Saved in this window'; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    size.addEventListener('input', () => { sizeLabel.textContent = `${size.value} px`; });
    clear.addEventListener('click', () => { background(); status.textContent = 'Canvas cleared'; });
    save.addEventListener('click', () => {
      const link = ui('a', { href: canvas.toDataURL('image/png'), download: 'idk-painting.png' });
      link.click();
      status.textContent = 'PNG downloaded';
    });
    background();
    root.append(
      ui('div', { className: 'paint-toolbar' }, [tool, color, size, sizeLabel, clear, save, status]),
      ui('div', { className: 'paint-stage' }, [canvas])
    );
    return root;
  }

  return { files: filesApp, notes: notesApp, calculator: calculatorApp, ai: aiApp, terminal: terminalApp, paint: paintApp };
})();
