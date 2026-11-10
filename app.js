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
    els.messages.innerHTML = chat.messages.map((message, index) => {
      const isUser = message.role === 'user';
      const providerName = message.provider && PROVIDERS[message.provider] ? PROVIDERS[message.provider].name : 'Ответ AI';
      return `<article class="message ${isUser ? 'user' : 'assistant'}">
        <div class="message-avatar">${isUser ? 'S' : '✦'}</div>
        <div class="message-content"><div class="message-meta"><span>${isUser ? 'Ты' : escapeHTML(providerName)}</span><span>${new Date(message.createdAt).toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'})}</span></div>
        <div class="message-bubble">${escapeHTML(message.text)}</div>
        ${!isUser ? `<div class="message-actions"><button data-copy-message="${index}">Копировать</button></div>` : `<div class="message-actions"><button data-copy-message="${index}">Копировать запрос</button></div>`}
        </div></article>`;
    }).join('') + `<div class="reply-editor"><label>ДОБАВИТЬ ОТВЕТ ИЗ ВНЕШНЕГО ЧАТА</label><textarea id="replyInput" placeholder="Скопируй ответ из ${escapeHTML(PROVIDERS[chat.provider]?.name || 'AI-чата')} и вставь сюда..."></textarea><div class="reply-editor-row"><button class="reply-cancel" id="copyLastPrompt">Скопировать запрос</button><button class="reply-save" id="saveReply">Добавить ответ</button></div></div>`;
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
    if (!prompt) { notify('Сначала напиши запрос.'); els.prompt.focus(); return; }
    const provider = PROVIDERS[activeProvider];
    // Open synchronously during the click to reduce popup-blocker issues.
    const externalTab = window.open(provider.url, '_blank');
    if (externalTab) externalTab.opener = null;
    let chat = currentChat();
    if (!chat) {
      chat = { id: makeId(), title: prompt.replace(/\s+/g, ' ').slice(0, 42) + (prompt.length > 42 ? '…' : ''), provider: activeProvider, favorite: false, createdAt: Date.now(), updatedAt: Date.now(), messages: [] };
      state.chats.push(chat); activeChatId = chat.id;
    } else {
      chat.provider = activeProvider; chat.updatedAt = Date.now();
    }
    chat.messages.push({ role: 'user', text: prompt, provider: activeProvider, createdAt: Date.now() });
    persist(); els.prompt.value = ''; autosize(); updatePageMode(); renderHistory(); renderMessages();
    try {
      await copyText(prompt);
      notify(externalTab ? `Запрос скопирован. Вставь его в ${provider.name} и отправь.` : `Запрос скопирован. Разреши всплывающие окна или открой ${provider.name} вручную.`);
    } catch (error) {
      notify(`Не удалось скопировать автоматически. Скопируй запрос из диалога вручную.`);
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
    if (!window.confirm('Удалить все диалоги из локальной истории?')) return;
    state.chats = []; activeChatId = null; persist(); updatePageMode(); renderHistory(); notify('История очищена.');
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
  els.prompt.addEventListener('input', autosize);
  els.prompt.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendPrompt(); }
  });
  $('#newChat').addEventListener('click', newChat);
  $('#navChat').addEventListener('click', () => { showFavorites = false; $('#navChat').classList.add('active'); $('#navFavorites').classList.remove('active'); renderHistory(); });
  $('#navFavorites').addEventListener('click', () => { showFavorites = true; $('#navFavorites').classList.add('active'); $('#navChat').classList.remove('active'); renderHistory(); });
  els.historyList.addEventListener('click', event => { const button = event.target.closest('[data-chat-id]'); if (button) openChat(button.dataset.chatId); });
  els.messages.addEventListener('click', async event => {
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
