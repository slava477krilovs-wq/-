(() => {
  'use strict';

  const PROVIDERS = {
    chatgpt: { name: 'ChatGPT', url: 'https://chatgpt.com/', logo: '✳' },
    claude: { name: 'Claude', url: 'https://claude.ai/new', logo: '✳' },
    gemini: { name: 'Gemini', url: 'https://gemini.google.com/app', logo: '✦' },
    deepseek: { name: 'DeepSeek', url: 'https://chat.deepseek.com/', logo: '◉' },
    perplexity: { name: 'Perplexity', url: 'https://www.perplexity.ai/', logo: '⌕' }
  };
  const STORAGE_KEY = 'omnichat.workspace.v1';
  const $ = (selector) => document.querySelector(selector);
  const els = {
    sidebar: $('#sidebar'), historyList: $('#historyList'), favoriteCount: $('#favoriteCount'),
    welcome: $('#welcome'), conversation: $('#conversation'), messages: $('#messages'),
    prompt: $('#promptInput'), send: $('#sendButton'), providerGrid: $('#providerGrid'),
    modelPicker: $('#modelPicker'), modelMenu: $('#modelMenu'), selectedLogo: $('#selectedLogo'),
    selectedProviderName: $('#selectedProviderName'), title: $('#conversationTitle'),
    breadcrumbTitle: $('#breadcrumbTitle'), toast: $('#toast'), favorite: $('#favoriteChat'),
    helpDialog: $('#helpDialog')
  };

  let state = loadState();
  let activeProvider = 'chatgpt';
  let activeChatId = null;
  let showFavorites = false;
  let toastTimer = null;
  let stagedAttachments = [];
  let messageObjectUrls = [];
  let stagedObjectUrls = [];
  let attachmentDbPromise = null;

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && Array.isArray(saved.chats)) return saved;
    } catch (error) { console.warn('Could not read local chat history:', error); }
    return { chats: [] };
  }
  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (error) { notify('Не удалось сохранить историю. Возможно, закончилось место в браузере.'); }
  }
  function makeId() { return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }

  function openAttachmentDB() {
    if (!('indexedDB' in window)) return Promise.reject(new Error('IndexedDB is unavailable'));
    if (attachmentDbPromise) return attachmentDbPromise;
    attachmentDbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open('omnichat.attachments.v1', 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not open attachment storage'));
    });
    return attachmentDbPromise;
  }

  async function saveAttachmentRecord(record) {
    const db = await openAttachmentDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('files', 'readwrite');
      transaction.objectStore('files').put(record);
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error || new Error('Could not save attachment'));
      transaction.onabort = () => reject(transaction.error || new Error('Attachment save was aborted'));
    });
  }

  async function getAttachmentRecord(id) {
    const db = await openAttachmentDB();
    return new Promise((resolve, reject) => {
      const request = db.transaction('files', 'readonly').objectStore('files').get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('Could not read attachment'));
    });
  }

  async function deleteAttachmentRecord(id) {
    const db = await openAttachmentDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('files', 'readwrite');
      transaction.objectStore('files').delete(id);
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error || new Error('Could not delete attachment'));
    });
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' Б';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' КБ';
    return (bytes / (1024 * 1024)).toFixed(1) + ' МБ';
  }

  function renderAttachmentTray() {
    stagedObjectUrls.forEach(url => URL.revokeObjectURL(url));
    stagedObjectUrls = [];
    if (!stagedAttachments.length) {
      els.attachmentTray.hidden = true;
      els.attachmentTray.innerHTML = '';
      return;
    }
    els.attachmentTray.hidden = false;
    els.attachmentTray.innerHTML = stagedAttachments.map(item => {
      let preview = '<span class="attachment-file-icon">▤</span>';
      if (item.type.startsWith('image/')) {
        const url = URL.createObjectURL(item.file);
        stagedObjectUrls.push(url);
        preview = '<img class="attachment-preview-image" src="' + url + '" alt="">';
      }
      return '<div class="attachment-chip">' + preview +
        '<span class="attachment-chip-copy"><strong>' + escapeHTML(item.name) +
        '</strong><small>' + formatBytes(item.size) + '</small></span>' +
        '<button type="button" data-remove-staged="' + escapeHTML(item.id) + '" aria-label="Удалить вложение">×</button></div>';
    }).join('');
  }

  function addFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    let added = 0;
    for (const file of files) {
      if (stagedAttachments.length >= 10) { notify('Можно прикрепить не более 10 файлов за одно сообщение.'); break; }
      if (file.size > 20 * 1024 * 1024) { notify('Файл «' + file.name + '» больше 20 МБ и пропущен.'); continue; }
      const extension = file.name.split('.').pop().toLowerCase();
      const accepted = file.type.startsWith('image/') || ['pdf','txt','md','csv','json','doc','docx','xls','xlsx','ppt','pptx','zip'].includes(extension);
      if (!accepted) { notify('Формат «' + file.name + '» не поддерживается.'); continue; }
      stagedAttachments.push({ id: makeId(), file, name: file.name, type: file.type || 'application/octet-stream', size: file.size });
      added++;
    }
    renderAttachmentTray();
    if (added) notify('Добавлено файлов: ' + added + '.');
  }

  function releaseMessageObjectUrls() {
    messageObjectUrls.forEach(url => URL.revokeObjectURL(url));
    messageObjectUrls = [];
  }

  async function hydrateImageAttachments() {
    const images = Array.from(els.messages.querySelectorAll('[data-image-attachment]'));
    for (const image of images) {
      try {
        const record = await getAttachmentRecord(image.dataset.imageAttachment);
        if (record && record.blob) {
          const url = URL.createObjectURL(record.blob);
          messageObjectUrls.push(url);
          image.src = url;
        }
      } catch (error) { console.warn('Could not load image attachment:', error); }
    }
  }

  async function downloadAttachment(id) {
    const record = await getAttachmentRecord(id);
    if (!record || !record.blob) { notify('Файл не найден в локальном хранилище.'); return; }
    const url = URL.createObjectURL(record.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = record.name || 'attachment';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  async function imageAsPng(blob) {
    if (blob.type === 'image/png') return blob;
    if (!window.createImageBitmap) throw new Error('Image conversion is not supported');
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0);
    bitmap.close();
    return new Promise((resolve, reject) => {
      canvas.toBlob(result => result ? resolve(result) : reject(new Error('Image conversion failed')), 'image/png');
    });
  }
  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' })[char]);
  }
  function notify(message) {
    els.toast.textContent = message;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2800);
  }
  function setProvider(id) {
    if (!PROVIDERS[id]) return;
    activeProvider = id;
    const provider = PROVIDERS[id];
    els.selectedLogo.textContent = provider.logo;
    els.selectedProviderName.textContent = provider.name;
    document.querySelectorAll('.provider-card').forEach(card => card.classList.toggle('selected', card.dataset.provider === id));
    els.modelMenu.hidden = true;
  }
  function currentChat() { return state.chats.find(chat => chat.id === activeChatId) || null; }
  function updatePageMode() {
    const chat = currentChat();
    els.welcome.hidden = Boolean(chat);
    els.conversation.hidden = !chat;
    els.breadcrumbTitle.textContent = chat ? chat.title : 'Новый диалог';
    if (chat) {
      els.title.textContent = chat.title;
      els.favorite.innerHTML = chat.favorite ? '★ <span>В избранном</span>' : '☆ <span>В избранное</span>';
    }
  }
  function renderHistory() {
    const chats = [...state.chats].sort((a,b) => b.updatedAt - a.updatedAt).filter(chat => !showFavorites || chat.favorite);
    els.favoriteCount.textContent = state.chats.filter(chat => chat.favorite).length;
    if (!chats.length) {
      els.historyList.innerHTML = `<div class="history-empty">${showFavorites ? 'В избранном пока пусто' : 'Здесь появятся твои диалоги'}</div>`;
      return;
    }
    els.historyList.innerHTML = chats.map(chat => `
      <button class="history-item ${chat.id === activeChatId ? 'current' : ''}" data-chat-id="${escapeHTML(chat.id)}" title="${escapeHTML(chat.title)}">
        <span class="history-dot">${chat.favorite ? '★' : '◦'}</span><span>${escapeHTML(chat.title)}</span>
      </button>`).join('');
  }
  function renderMessages() {
    const chat = currentChat();
    if (!chat) return;
    releaseMessageObjectUrls();
    els.messages.innerHTML = chat.messages.map((message, index) => {
      const isUser = message.role === 'user';
      const providerName = message.provider && PROVIDERS[message.provider] ? PROVIDERS[message.provider].name : 'Ответ AI';
      const attachments = Array.isArray(message.attachments) ? message.attachments : [];
      const attachmentHTML = attachments.map(item => {
        const imagePreview = item.type && item.type.startsWith('image/')
          ? '<img class="message-attachment-image" data-image-attachment="' + escapeHTML(item.id) + '" alt="' + escapeHTML(item.name) + '">'
          : '<span class="attachment-file-icon">▤</span>';
        return '<div class="message-attachment">' + imagePreview +
          '<span class="message-attachment-copy"><strong>' + escapeHTML(item.name) +
          '</strong><small>' + formatBytes(item.size || 0) + '</small></span>' +
          '<button type="button" data-download-attachment="' + escapeHTML(item.id) + '">Скачать</button></div>';
      }).join('');
      return '<article class="message ' + (isUser ? 'user' : 'assistant') + '">' +
        '<div class="message-avatar">' + (isUser ? 'S' : '✦') + '</div>' +
        '<div class="message-content"><div class="message-meta"><span>' + (isUser ? 'Ты' : escapeHTML(providerName)) + '</span><span>' +
        new Date(message.createdAt).toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'}) + '</span></div>' +
        (message.text ? '<div class="message-bubble">' + escapeHTML(message.text) + '</div>' : '') +
        (attachmentHTML ? '<div class="message-attachments">' + attachmentHTML + '</div>' : '') +
        '<div class="message-actions"><button data-copy-message="' + index + '">' + (isUser ? 'Копировать запрос' : 'Копировать') + '</button></div>' +
        '</div></article>';
    }).join('') +
      '<div class="reply-editor"><label>ДОБАВИТЬ ОТВЕТ ИЗ ВНЕШНЕГО ЧАТА</label>' +
      '<textarea id="replyInput" placeholder="Скопируй ответ из ' + escapeHTML(PROVIDERS[chat.provider]?.name || 'AI-чата') + ' и вставь сюда..."></textarea>' +
      '<div class="reply-editor-row"><button class="reply-cancel" id="copyLastPrompt">Скопировать запрос</button>' +
      '<button class="reply-save" id="saveReply">Добавить ответ</button></div></div>';
    hydrateImageAttachments();
    els.messages.scrollTop = els.messages.scrollHeight;
  }
  function openChat(id) {
    activeChatId = id;
    const chat = currentChat();
    if (chat) setProvider(chat.provider);
    updatePageMode(); renderHistory(); renderMessages();
    els.sidebar.classList.remove('open');
  }
  function newChat() {
    activeChatId = null;
    setProvider('chatgpt');
    updatePageMode(); renderHistory();
    els.prompt.focus();
    els.sidebar.classList.remove('open');
  }
  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const field = document.createElement('textarea');
    field.value = text; field.style.position = 'fixed'; field.style.opacity = '0';
    document.body.appendChild(field); field.select();
    const ok = document.execCommand('copy'); field.remove();
    if (!ok) throw new Error('Clipboard is unavailable');
    return true;
  }
  async function sendPrompt() {
    const prompt = els.prompt.value.trim();
    if (!prompt && !stagedAttachments.length) { notify('Напиши запрос или прикрепи файл.'); els.prompt.focus(); return; }
    const provider = PROVIDERS[activeProvider];

    // Open from the direct click gesture, then request that focus returns to OmniChat.
    // Browsers may ignore focus/blur requests; the provider still opens in its own tab.
    const externalTab = window.open(provider.url, '_blank');
    if (externalTab) {
      try { externalTab.opener = null; externalTab.blur(); window.focus(); } catch (error) { console.debug('Background tab request was ignored:', error); }
    }

    const staged = [...stagedAttachments];
    const savedAttachments = [];
    try {
      for (const item of staged) {
        const record = { id: item.id, name: item.name, type: item.type, size: item.size, lastModified: item.file.lastModified, blob: item.file };
        await saveAttachmentRecord(record);
        savedAttachments.push({ id: item.id, name: item.name, type: item.type, size: item.size });
      }
    } catch (error) {
      notify('Не удалось сохранить вложения в браузере. Попробуй файлы меньшего размера.');
      return;
    }

    const titleSource = prompt || ('Вложения: ' + staged[0].name);
    let chat = currentChat();
    if (!chat) {
      chat = { id: makeId(), title: titleSource.replace(/\s+/g, ' ').slice(0, 42) + (titleSource.length > 42 ? '…' : ''), provider: activeProvider, favorite: false, createdAt: Date.now(), updatedAt: Date.now(), messages: [] };
      state.chats.push(chat); activeChatId = chat.id;
    } else {
      chat.provider = activeProvider; chat.updatedAt = Date.now();
    }
    chat.messages.push({ role: 'user', text: prompt, provider: activeProvider, attachments: savedAttachments, createdAt: Date.now() });
    stagedObjectUrls.forEach(url => URL.revokeObjectURL(url));
    stagedObjectUrls = [];
    stagedAttachments = [];
    renderAttachmentTray();
    persist(); els.prompt.value = ''; autosize(); updatePageMode(); renderHistory(); renderMessages();

    try {
      const firstImage = savedAttachments.find(item => item.type && item.type.startsWith('image/'));
      if (firstImage && navigator.clipboard && navigator.clipboard.write && window.ClipboardItem && window.isSecureContext) {
        const stored = await getAttachmentRecord(firstImage.id);
        const png = await imageAsPng(stored.blob);
        const clipboardData = { 'image/png': png };
        if (prompt) clipboardData['text/plain'] = new Blob([prompt], { type: 'text/plain' });
        await navigator.clipboard.write([new ClipboardItem(clipboardData)]);
        const extraCount = Math.max(0, savedAttachments.length - 1);
        notify('Запрос и первое изображение скопированы. Вставь в ' + provider.name + '. ' +
          (extraCount ? extraCount + ' других файла можно скачать из сообщения.' : ''));
      } else if (prompt) {
        await copyText(prompt);
        notify('Запрос скопирован. Вставь его в ' + provider.name + '. Вложения скачай из сообщения и добавь в чате вручную.');
      } else {
        notify('Вложения сохранены в сообщении. Скачай их отсюда и добавь в ' + provider.name + ' вручную.');
      }
      if (!externalTab) notify('Вкладка не открылась: разреши всплывающие окна для OmniChat.');
    } catch (error) {
      try {
        if (prompt) await copyText(prompt);
        notify('Текст запроса скопирован. Вложения скачай из сообщения и добавь в AI-чат вручную.');
      } catch (copyError) {
        notify('Сообщение сохранено. Открой вложения через кнопки «Скачать» и перенеси их в AI-чат.');
      }
    }
  }
  function autosize() {
    els.prompt.style.height = 'auto';
    els.prompt.style.height = `${Math.min(els.prompt.scrollHeight, 160)}px`;
  }
  function exportText(chat) {
    if (!chat) return;
    const content = [`${chat.title}`, `Сервис: ${PROVIDERS[chat.provider]?.name || chat.provider}`, `Создано: ${new Date(chat.createdAt).toLocaleString('ru-RU')}`, '', ...chat.messages.map(m => `${m.role === 'user' ? 'Пользователь' : 'Ответ AI'}:\n${m.text}\n`)].join('\n');
    const blob = new Blob([content], {type:'text/plain;charset=utf-8'});
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `omnichat-${new Date(chat.createdAt).toISOString().slice(0,10)}.txt`; a.click(); URL.revokeObjectURL(url);
  }
  function saveReply() {
    const field = $('#replyInput'); const text = field?.value.trim();
    if (!text) { notify('Вставь текст ответа.'); return; }
    const chat = currentChat(); if (!chat) return;
    chat.messages.push({ role: 'assistant', text, provider: chat.provider, createdAt: Date.now() });
    chat.updatedAt = Date.now(); persist(); renderMessages(); renderHistory(); notify('Ответ добавлен в историю.');
  }
  function clearHistory() {
    if (!state.chats.length) { notify('История уже пуста.'); return; }
    if (!window.confirm('Удалить все диалоги и вложения из локальной истории?')) return;
    const attachmentIds = state.chats.flatMap(chat => chat.messages.flatMap(message => (message.attachments || []).map(item => item.id)));
    Promise.all(attachmentIds.map(id => deleteAttachmentRecord(id).catch(() => false)));
    state.chats = []; activeChatId = null; persist(); updatePageMode(); renderHistory(); notify('История и вложения очищены.');
  }

  els.providerGrid.addEventListener('click', (event) => {
    const card = event.target.closest('[data-provider]'); if (card) setProvider(card.dataset.provider);
  });
  els.modelMenu.addEventListener('click', (event) => {
    const option = event.target.closest('[data-provider]'); if (option) setProvider(option.dataset.provider);
  });
  els.modelPicker.addEventListener('click', () => { els.modelMenu.hidden = !els.modelMenu.hidden; });
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.model-picker-wrap')) els.modelMenu.hidden = true;
  });
  els.send.addEventListener('click', sendPrompt);
  $('#attachButton').addEventListener('click', () => $('#fileInput').click());
  $('#fileInput').addEventListener('change', event => {
    addFiles(event.target.files);
    event.target.value = '';
  });
  els.attachmentTray.addEventListener('click', event => {
    const button = event.target.closest('[data-remove-staged]');
    if (!button) return;
    stagedAttachments = stagedAttachments.filter(file => file.id !== button.dataset.removeStaged);
    renderAttachmentTray();
  });
  els.prompt.addEventListener('paste', event => {
    const files = event.clipboardData && event.clipboardData.files;
    if (files && files.length) addFiles(files);
  });
  const composer = $('#composer');
  composer.addEventListener('dragover', event => {
    if (event.dataTransfer && event.dataTransfer.types.includes('Files')) {
      event.preventDefault();
      composer.classList.add('drag-over');
    }
  });
  composer.addEventListener('dragleave', event => {
    if (!composer.contains(event.relatedTarget)) composer.classList.remove('drag-over');
  });
  composer.addEventListener('drop', event => {
    if (event.dataTransfer && event.dataTransfer.files.length) {
      event.preventDefault();
      composer.classList.remove('drag-over');
      addFiles(event.dataTransfer.files);
    }
  });
  els.prompt.addEventListener('input', autosize);
  els.prompt.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendPrompt(); }
  });
  $('#newChat').addEventListener('click', newChat);
  $('#navChat').addEventListener('click', () => { showFavorites = false; $('#navChat').classList.add('active'); $('#navFavorites').classList.remove('active'); renderHistory(); });
  $('#navFavorites').addEventListener('click', () => { showFavorites = true; $('#navFavorites').classList.add('active'); $('#navChat').classList.remove('active'); renderHistory(); });
  els.historyList.addEventListener('click', event => { const button = event.target.closest('[data-chat-id]'); if (button) openChat(button.dataset.chatId); });
  els.messages.addEventListener('click', async event => {
    const downloadButton = event.target.closest('[data-download-attachment]');
    if (downloadButton) {
      try { await downloadAttachment(downloadButton.dataset.downloadAttachment); }
      catch (error) { notify('Не удалось открыть вложение.'); }
    }
    const copyButton = event.target.closest('[data-copy-message]');
    if (copyButton) {
      const message = currentChat()?.messages[Number(copyButton.dataset.copyMessage)];
      if (message) try { await copyText(message.text); notify('Текст скопирован.'); } catch { notify('Не удалось скопировать текст.'); }
    }
    if (event.target.id === 'saveReply') saveReply();
    if (event.target.id === 'copyLastPrompt') {
      const chat = currentChat(); const lastUser = [...(chat?.messages || [])].reverse().find(m => m.role === 'user');
      if (lastUser) copyText(lastUser.text).then(() => notify('Запрос скопирован.')).catch(() => notify('Не удалось скопировать.'));
    }
  });
  els.favorite.addEventListener('click', () => {
    const chat = currentChat(); if (!chat) return;
    chat.favorite = !chat.favorite; persist(); updatePageMode(); renderHistory();
    notify(chat.favorite ? 'Добавлено в избранное.' : 'Удалено из избранного.');
  });
  $('#exportChat').addEventListener('click', () => exportText(currentChat()));
  $('#exportAll').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'omnichat-history.json'; a.click(); URL.revokeObjectURL(url);
  });
  $('#clearHistory').addEventListener('click', clearHistory);
  $('#helpButton').addEventListener('click', () => els.helpDialog.showModal());
  $('#closeHelp').addEventListener('click', () => els.helpDialog.close());
  $('#gotIt').addEventListener('click', () => els.helpDialog.close());
  $('#openSidebar').addEventListener('click', () => els.sidebar.classList.add('open'));
  $('#closeSidebar').addEventListener('click', () => els.sidebar.classList.remove('open'));
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); newChat(); }
    if (event.key === 'Escape') els.sidebar.classList.remove('open');
  });

  renderHistory(); updatePageMode(); setProvider('chatgpt');
})();
