import React, { useEffect, useRef, useState } from 'react';
import { loadChildren, createChild, updateChild, deleteChild } from '../../actions/children';
import './childProfiles.css';

// null — старые общие материалы; профиль выбирается явно.
const ChildProfiles = ({ selectedId, onSelect, onLoaded, specialist = false }) => {
  const [search, setSearch] = useState('');
  const [children, setChildren] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [fullName, setFullName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = async () => {
    try {
      const result = await loadChildren();
      setError('');
      setChildren(result);
      if (onLoaded) onLoaded(result);
      if (selectedId && !result.some(child => child._id === selectedId)) onSelect(null);
    } catch (e) { setError(e?.response?.data?.message || 'Не удалось загрузить профили'); }
  };
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    const reload = () => refreshRef.current();
    reload();
    window.addEventListener('focus', reload);
    return () => window.removeEventListener('focus', reload);
  }, []);

  const startCreate = () => { setEditing(null); setFullName(''); setBirthDate(''); setNotes(''); setError(''); setOpen(true); };
  const startEdit = child => { setEditing(child); setFullName(child.fullName || ''); setBirthDate(child.birthDate || ''); setNotes(child.notes || ''); setError(''); setOpen(true); };
  const save = async e => {
    e.preventDefault();
    if (fullName.trim().length < 2) { setError('Укажите ФИО ребёнка'); return; }
    setBusy(true); setError('');
    try {
      const data = { fullName: fullName.trim(), birthDate: birthDate || null, notes: notes.trim() };
      const child = editing ? await updateChild(editing._id, data) : await createChild(data);
      await refresh(); onSelect(child._id); setOpen(false);
    } catch (e) { setError(e?.response?.data?.message || 'Не удалось сохранить профиль'); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!editing || !window.confirm('Удалить профиль? Если у ребёнка есть материалы, удаление будет запрещено.')) return;
    setBusy(true); setError('');
    try { await deleteChild(editing._id); if (selectedId === editing._id) onSelect(null); await refresh(); setOpen(false); }
    catch (e) { setError(e?.response?.data?.message || 'Не удалось удалить профиль'); }
    finally { setBusy(false); }
  };
  return (
    <section className="child-selector" aria-label="Профили детей">
      <div className="child-selector__heading"><div><span className="child-selector__eyebrow">{specialist ? 'НАЗНАЧЕННЫЕ ПРОФИЛИ' : 'НАША СЕМЬЯ'}</span><h2>Профили детей</h2><p>{specialist ? 'Дети, закреплённые за вами администратором.' : 'Материалы и результаты сохраняются отдельно для каждого ребёнка.'}</p></div>
        {!specialist && <button type="button" className="child-selector__add" onClick={startCreate}>+ Добавить ребёнка</button>}</div>
      {specialist && <label className="child-selector__search">Поиск по ФИО<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Введите фамилию, имя или отчество" /></label>}
      {specialist && !children.length && <p>Пока нет назначенных детей.</p>}
      {specialist && children.length > 0 && !children.some(child => (child.fullName || child.name).toLocaleLowerCase('ru').includes(search.trim().toLocaleLowerCase('ru'))) && <p>Дети не найдены.</p>}
      {!specialist && (<div className="child-selector__cards">
        {!specialist && <button type="button" className={`child-selector__card ${selectedId === null ? 'is-active' : ''}`} onClick={() => onSelect(null)}><span className="child-selector__avatar child-selector__avatar--neutral">▤</span><span className="child-selector__label"><strong>Общие материалы</strong><small>Загрузки без профиля</small></span></button>}
        {children.filter(child => !specialist || (child.fullName || child.name).toLocaleLowerCase('ru').includes(search.trim().toLocaleLowerCase('ru'))).map(child => <div className={`child-selector__card ${selectedId === child._id ? 'is-active' : ''}`} key={child._id}>
          <button type="button" className="child-selector__choose" onClick={() => onSelect(child._id)}><span className="child-selector__avatar">♥</span><span className="child-selector__label"><strong title={child.fullName || child.name}>{child.fullName || child.name}</strong><small>{child.birthDate ? `Дата рождения: ${new Date(child.birthDate).toLocaleDateString('ru-RU')}` : 'Личный профиль'}</small>{child.specialists?.length > 0 && <small>Специалисты: {child.specialists.map(user => user.fullName || user.email).join(', ')}</small>}</span></button>
          <button type="button" className="child-selector__edit" aria-label={`Изменить профиль ${child.name}`} onClick={() => startEdit(child)}>✎</button>
        </div>)}
      </div>)}
      {specialist && children.length > 0 && <div className="child-selector__table-wrap">
        <table className="child-selector__table" aria-label="Список детей">
          <thead><tr><th scope="col">ФИО ребёнка</th><th scope="col">Дата рождения</th><th scope="col">Действия</th></tr></thead>
          <tbody>{children.filter(child => !specialist || (child.fullName || child.name).toLocaleLowerCase('ru').includes(search.trim().toLocaleLowerCase('ru'))).map(child => <tr className={selectedId === child._id ? 'is-active' : ''} key={child._id}>
            <td><strong>{child.fullName || child.name}</strong></td>
            <td className="child-selector__date">{child.birthDate ? new Date(child.birthDate + 'T00:00:00').toLocaleDateString('ru-RU') : '—'}</td>
            {!specialist && <td>{child.specialists?.length ? child.specialists.map(user => <span className="child-selector__person" key={user.id}>{user.fullName || user.email}</span>) : 'Не назначены'}</td>}
            <td><div className="child-selector__row-actions"><button type="button" aria-label={`Открыть материалы ${child.fullName || child.name}`} aria-pressed={selectedId === child._id} onClick={() => onSelect(child._id)}>{selectedId === child._id ? 'Выбран' : 'Открыть материалы'}</button><button type="button" aria-label={`Изменить профиль ${child.fullName || child.name}`} onClick={() => startEdit(child)}>Изменить</button></div></td>
          </tr>)}</tbody>
        </table>
      </div>}
      {error && !open && <p className="child-selector__error" role="alert">{error}</p>}
      {open && <div className="asd-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false); }}>
        <div className="asd-modal" role="dialog" aria-modal="true" aria-labelledby="child-dialog-title">
          <div className="asd-modal__heading"><div><span className="asd-modal__eyebrow">ПРОФИЛЬ РЕБЁНКА</span><h2 id="child-dialog-title">{editing ? 'Редактировать профиль' : 'Новый профиль'}</h2></div><button type="button" className="asd-modal__close" onClick={() => setOpen(false)} aria-label="Закрыть">×</button></div>
          <form onSubmit={save} className="asd-modal__form">
            <label>ФИО ребёнка<input value={fullName} onChange={e => setFullName(e.target.value)} minLength={2} maxLength={200} required autoFocus placeholder="Фамилия Имя Отчество" /></label>
            <label>Дата рождения (необязательно)<input type="date" value={birthDate} max={new Date().toISOString().split('T')[0]} onChange={e => setBirthDate(e.target.value)} /></label>
            <label>Заметка (необязательно)<textarea value={notes} onChange={e => setNotes(e.target.value)} maxLength={2000} rows={3} placeholder="Краткая информация о профиле" /></label>
            {error && <p className="child-selector__error" role="alert">{error}</p>}
            <div className="asd-modal__actions">{editing && <button type="button" className="asd-modal__danger" disabled={busy} onClick={remove}>Удалить профиль</button>}<button type="button" className="asd-modal__secondary" onClick={() => setOpen(false)}>Отмена</button><button type="submit" className="asd-modal__primary" disabled={busy}>{busy ? 'Сохранение…' : 'Сохранить'}</button></div>
          </form>
        </div>
      </div>}
    </section>
  );
};
export default ChildProfiles;
