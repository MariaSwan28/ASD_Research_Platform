// Display-only file classification. Storage and ML support are independent.
const GROUPS = [
  { extensions: ['mp4','mov','avi','mkv','webm','m4v'], category: 'Видео', icon: '▶', tone: 'video' },
  { extensions: ['mp3','wav','m4a','flac','ogg','aac','opus'], category: 'Аудио', icon: '♫', tone: 'audio' },
  { extensions: ['jpg','jpeg','png','webp','gif','bmp','svg','heic','tiff'], category: 'Изображение', icon: '▧', tone: 'image' },
  { extensions: ['pdf','doc','docx','odt','rtf'], category: 'Документ', icon: '▤', tone: 'document' },
  { extensions: ['txt','md','log'], category: 'Текст', icon: '≡', tone: 'text' },
  { extensions: ['csv','xls','xlsx','ods'], category: 'Таблица', icon: '▦', tone: 'table' },
  { extensions: ['json','xml','yaml','yml'], category: 'Данные', icon: '{ }', tone: 'data' },
  { extensions: ['zip','7z','rar','tar','gz'], category: 'Архив', icon: '▣', tone: 'archive' },
];

export function getFileType(file = {}) {
  if (file.type === 'dir') return { category: 'Папка', extension: '', label: 'Папка', icon: '▰', tone: 'folder' };
  const name = (file.name || '').trim();
  const match = name.match(/\.([a-zA-Z0-9]{1,16})$/);
  // Prioritize the original filename: legacy rows may contain a generic `type`.
  const rawType = String(file.type || '').toLowerCase();
  const extension = (match ? match[1] : (/^[a-z0-9]{1,16}$/.test(rawType) && rawType !== 'file' && rawType !== 'other' ? rawType : '')).toLowerCase();
  const group = GROUPS.find(entry => entry.extensions.includes(extension));
  if (group) return { ...group, extension, label: `${group.category} · ${extension.toUpperCase()}` };
  if (extension) return { category: 'Файл', extension, label: `Файл ${extension.toUpperCase()}`, icon: '◇', tone: 'unknown' };
  return { category: 'Файл', extension: '', label: 'Без расширения', icon: '◇', tone: 'unknown' };
}
