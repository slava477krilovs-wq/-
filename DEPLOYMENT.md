# Публикация RemoteHub на GitHub Pages

RemoteHub размещается в этом репозитории: https://github.com/slava477krilovs-wq/-

## Текущая схема

- Ветка публикации: `main`.
- Workflow: `.github/workflows/pages.yml`.
- Источник сборки: корень репозитория.
- Команда публикации: GitHub Actions Pages artifact + deploy-pages.

Workflow запускается при каждом push в `main`, а также вручную из вкладки **Actions**.

## Проверка

1. Откройте вкладку **Actions**.
2. Выберите **Deploy RemoteHub to GitHub Pages**.
3. Убедитесь, что последний запуск завершился со статусом **Success**.
4. Откройте **Settings → Pages** и скопируйте опубликованный адрес.
5. Проверьте, что адрес открывается по HTTPS и показывает заголовок RemoteHub.

Ожидаемый адрес проекта: https://slava477krilovs-wq.github.io/-/

## Важно

GitHub Pages публикует только статические файлы. Он не запускает сервер удалённого доступа и не позволяет веб-странице напрямую управлять Windows. Для текущего сценария без установки агента используется Quick Assist с подтверждением на рабочем ПК.
