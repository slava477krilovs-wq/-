(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const toast = $('#toast');
  let toastTimer;

  function notify(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
  }

  function navigate(page) {
    $$('.page').forEach(el => el.classList.toggle('active', el.id === `page-${page}`));
    $$('.nav-item[data-page]').forEach(el => el.classList.toggle('active', el.dataset.page === page));
    const active = $(`.nav-item[data-page="${page}"]`);
    $('#crumbTitle').textContent = active ? active.textContent.trim() : 'Обзор';
    $('#sidebar').classList.remove('open');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  $$('.nav-item[data-page]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.page)));
  $$('[data-go]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.go)));
  $('#mobileMenu').addEventListener('click', () => $('#sidebar').classList.toggle('open'));

  const helpUrl = 'https://support.microsoft.com/ru-ru/windows/apps/solve-pc-problems-remotely-using-quick-assist';
  ['#startSessionBtn', '#deviceHelpBtn'].forEach(selector => $(selector).addEventListener('click', () => window.open(helpUrl, '_blank', 'noopener,noreferrer')));

  const dialog = $('#deviceDialog');
  function openDeviceDialog() {
    $('#newDeviceName').value = '';
    dialog.showModal();
    $('#newDeviceName').focus();
  }
  $('#addDeviceBtn').addEventListener('click', openDeviceDialog);
  $('#addDeviceCard').addEventListener('click', openDeviceDialog);
  $('#confirmAddDevice').addEventListener('click', event => {
    const name = $('#newDeviceName').value.trim();
    if (!name) {
      event.preventDefault();
      notify('Введите название устройства');
      $('#newDeviceName').focus();
      return;
    }
    event.preventDefault();
    notify(`Метка «${name}» добавлена в демо-список`);
    dialog.close();
  });

  const theme = localStorage.getItem('remotehub-theme') || 'dark';
  if (theme === 'light') document.body.classList.add('light');
  $('#themeToggle').addEventListener('click', () => {
    document.body.classList.toggle('light');
    localStorage.setItem('remotehub-theme', document.body.classList.contains('light') ? 'light' : 'dark');
  });

  const savedName = localStorage.getItem('remotehub-device-name');
  if (savedName) {
    $('#workPcName').textContent = savedName;
    $('#devicePageName').textContent = savedName;
    $('#renameInput').value = savedName;
  }
  $('#saveNameBtn').addEventListener('click', () => {
    const name = $('#renameInput').value.trim();
    if (!name) return notify('Название не может быть пустым');
    localStorage.setItem('remotehub-device-name', name);
    $('#workPcName').textContent = name;
    $('#devicePageName').textContent = name;
    notify('Название сохранено в этом браузере');
  });

  const checks = $$('.setup-check');
  checks.forEach((check, index) => {
    check.checked = localStorage.getItem(`remotehub-check-${index}`) === 'true';
    check.addEventListener('change', () => {
      localStorage.setItem(`remotehub-check-${index}`, String(check.checked));
      updateCount();
    });
  });
  function updateCount() {
    $('#checkCount').textContent = `${checks.filter(check => check.checked).length} / ${checks.length}`;
  }
  updateCount();

  $('#copyFileTip').addEventListener('click', async () => {
    const tip = 'Для передачи рабочих файлов используйте только облачное хранилище, одобренное вашей организацией. Не загружайте конфиденциальные документы в личные облачные аккаунты без разрешения.';
    try {
      await navigator.clipboard.writeText(tip);
      notify('Памятка скопирована');
    } catch {
      notify('Браузер не разрешил доступ к буферу обмена');
    }
  });
})();