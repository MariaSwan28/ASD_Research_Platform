# ASD Research Platform

Исследовательская платформа хранения материалов и подключения методов анализа. React + Node.js + Flask + SQLite + Docker.

## Текущая версия

<<<<<<< Updated upstream
- Локальный запуск и обновление: [START_HERE_STAGE15.md](START_HERE_STAGE15.md).
- Развёртывание в Timeweb Cloud: [deploy/TIMEWEB.md](deploy/TIMEWEB.md).
- Шаблон нового адаптера: [ml-service/templates/README.md](ml-service/templates/README.md).
=======
Этап 18.2: родителям возвращены карточки детей. Таблица и поиск по ФИО доступны специалисту. Новая кнопка «Обновить» в профилях убрана. Обновление — [STAGE18_2_PARENT_CARDS.md](STAGE18_2_PARENT_CARDS.md), правила доступа — [STAGE18_SPECIALIST_ACCESS.md](STAGE18_SPECIALIST_ACCESS.md).

## Запуск Windows

При первом запуске из корня проекта:

```bat
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\setup_env.ps1
docker compose --env-file .env up -d --build
```

Откройте http://localhost:3000/autmama/. Начальные логин и пароль — в `.env`: `SUPERUSER_LOGIN` и `SUPREUSER_PASS`. Этот аккаунт становится администратором. При обновлении сохраняйте `.env`, рабочие данные и Docker volumes.

- [Универсальные отчёты этапа 17](STAGE17_REPORTS.md)
- [Границы доступа версии 16.3](STAGE16_3_ADMIN_SCOPE.md)
- [Кабинет администратора версии 16.2](STAGE16_2_ADMIN.md)
- [ФИО и формы версии 16.1](STAGE16_1_NAMES_FORMS.md)
- [Роли и назначение специалистов](STAGE16_ROLES.md)
- [Базовый запуск и резервные копии](START_HERE_STAGE15.md)
- [Размещение на Timeweb Cloud](deploy/TIMEWEB.md)
- [Шаблон нового адаптера](ml-service/templates/adapter_template.py)

Результаты анализа не являются медицинским диагнозом. Исторические файлы STAGE описывают соответствующие редакции проекта.
>>>>>>> Stashed changes
