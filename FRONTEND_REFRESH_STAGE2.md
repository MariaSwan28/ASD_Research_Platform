# ASD Research Platform — обновление интерфейса (этап 2)

Основа: `ASD_Research_Platform_stage1_logout_fix.zip`.

## Что изменилось

- Новая спокойная светлая тема, современная типографика, обновлённая навигация, экран файлов, авторизация и карточка профиля.
- В списке файлов теперь отображаются исходное имя, **категория и фактическое расширение имени**: «Видео · MP4», «Аудио · MP3», «Документ · PDF», «Файл PSD» и т. д.
- Если расширения нет — «Без расширения».
- Категория определяется на клиенте из имени файла. Это **не проверка подлинного MIME-типа и содержимого**: для безопасности при загрузке необходима серверная проверка сигнатур.
- Действия с файлами всегда видны, добавлены адаптивные стили для узких экранов.
- API, авторизация, хранилище и анализ видео не менялись.

## Установка в Windows

1. Сохраните текущую рабочую папку как резервную копию.
2. Распакуйте ZIP в **новую папку**.
3. В папке старого проекта: `docker compose down` (не используйте `-v`).
4. В папке нового проекта: `docker compose up -d --build`.
5. Откройте `http://127.0.0.1:3000/autmama/`, при необходимости нажмите `Ctrl+F5`.

### Если файлы пропали после замены папки

Используйте прежнюю папку с проектом, а в неё скопируйте **только папку `frontend/src` из архива**, сохранив старые настройки, контейнеры и данные. Затем пересоберите `frontend` командой `docker compose up -d --build frontend`. Не удаляйте Docker volumes.

## Изменённые файлы

- `frontend/src/utils/fileType.js` — новое определение категории/расширения.
- `frontend/src/components/disk/fileList/file/File.jsx` — новые подписи форматов и структура строки.
- `frontend/src/components/disk/fileList/FileList.jsx` — заголовки и пустое состояние.
- `frontend/src/components/disk/Disk.jsx` — заголовок и панель материалов.
- `frontend/src/components/navbar/Navbar.jsx` — новая структура шапки.
- `frontend/src/components/app.css` — глобальная тема.
- `frontend/src/components/navbar/navbar.css`
- `frontend/src/components/disk/disk.css`
- `frontend/src/components/disk/fileList/fileList.css`
- `frontend/src/components/disk/fileList/file/file.css`
- `frontend/src/components/authorization/authorization.css`
- `frontend/src/components/profile/profile.css`
- `frontend/src/components/disk/uploader/uploader.css`

## Проверки

Синтаксис изменённых JSX проверен через TypeScript transpiler, утилита определения типов проверена на нескольких форматах. Полная браузерная сборка и запуск Docker **в этой среде не выполнялись**. После установки проверьте вход/выход, загрузку, удаление, скачивание и видеоанализ с тестовыми файлами.
