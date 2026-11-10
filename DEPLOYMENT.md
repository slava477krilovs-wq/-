# Публикация OmniChat

Основные файлы сайта (index.html, styles.css, app.js) уже находятся в корне репозитория.

## Однократная настройка GitHub Pages

1. Открой Settings → Pages.
2. В поле Build and deployment установи Source: GitHub Actions.
3. Сохрани настройку.

Workflow в папке .github/workflows публикует сайт при каждом push в ветку main, а также поддерживает ручной запуск из вкладки Actions.

Ожидаемый адрес: https://slava477krilovs-wq.github.io/-/

Проверка публикации: вкладка Actions → Deploy OmniChat to GitHub Pages. После успешного запуска адрес появится также в Settings → Pages.

OmniChat — статический клиентский сайт. Он не содержит API-ключей и не управляет автоматически сторонними AI-чатами: запрос копируется, официальный чат открывается отдельно, отправка и перенос ответа выполняются пользователем.
