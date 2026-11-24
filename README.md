# ASD Research Platform

Исследовательская платформа хранения материалов и подключения методов анализа. React + Node.js + Flask + SQLite + Docker.

## Запуск Windows

При первом запуске из корня проекта:

```bat
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\setup_env.ps1
docker compose --env-file .env up -d --build
```

Откройте http://localhost:3000/autmama/. Начальные логин и пароль — в `.env`: `SUPERUSER_LOGIN` и `SUPREUSER_PASS`. Этот аккаунт становится администратором. При обновлении сохраняйте `.env`, рабочие данные и Docker volumes.

- [Размещение на Timeweb Cloud](deploy/TIMEWEB.md)
- [Шаблон нового адаптера](ml-service/templates/adapter_template.py)
