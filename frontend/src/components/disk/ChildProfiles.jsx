import React, { useEffect, useState } from 'react';
import { loadChildren, createChild, updateChild, deleteChild } from '../../actions/children';
import './childProfiles.css';

// null — старые общие материалы; профиль выбирается явно.
const ChildProfiles = ({ selectedId, onSelect, onLoaded }) => {
  const [children, setChildren] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = async () => {
    try {
      const result = await loadChildren();
      setChildren(result);
      if (onLoaded) onLoaded(result);
      if (selectedId && !result.some(child => child._id === selectedId)) onSelect(null);
    } catch (e) { setError(e?.response?.data?.message || 'Не удалось загрузить профили'); }
  };
  useEffect(() => { refresh(); }, []);

  const startCreate = () => { setEditing(null); setName(''); setBirthDate(''); setNotes(''); setError(''); setOpen(true); };
  const startEdit = child => { setEditing(child); setName(child.name); setBirthDate(child.birthDate || ''); setNotes(child.notes || ''); setError(''); setOpen(true); };
  const save = async e => {
    e.preventDefault();
    if (!name.trim()) { setError('Укажите имя или псевдоним'); return; }
    setBusy(true); setError('');
    try {
      const data = { name: name.trim(), birthDate: birthDate || null, notes: notes.trim() };
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
      <div className="child-selector__heading"><div><span className="child-selector__eyebrow">НАША СЕМЬЯ</span><h2>Профили детей</h2><p>Материалы и результаты сохраняются отдельно для каждого ребёнка.</p></div>
        <button type="button" className="child-selector__add" onClick={startCreate}>+ Добавить ребёнка</button></div>
      <div className="child-selector__cards">
        <button type="button" className={`child-selector__card ${selectedId === null ? 'is-active' : ''}`} onClick={() => onSelect(null)}><span className="child-selector__avatar child-selector__avatar--neutral">▤</span><span className="child-selector__label"><strong>Общие материалы</strong><small>Загрузки без профиля</small></span></button>
        {children.map(child => <div className={`child-selector__card ${selectedId === child._id ? 'is-active' : ''}`} key={child._id}>
          <button type="button" className="child-selector__choose" onClick={() => onSelect(child._id)}><span className="child-selector__avatar">♥</span><span className="child-selector__label"><strong>{child.name}</strong><small>{child.birthDate ? `Дата рождения: ${new Date(child.birthDate).toLocaleDateString('ru-RU')}` : 'Личный профиль'}</small></span></button>
          <button type="button" className="child-selector__edit" aria-label={`Изменить профиль ${child.name}`} onClick={() => startEdit(child)}>✎</button>
        </div>)}
      </div>
      {error && !open && <p className="child-selector__error" role="alert">{error}</p>}
      {open && <div className="asd-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false); }}>
        <div className="asd-modal" role="dialog" aria-modal="true" aria-labelledby="child-dialog-title">
          <div className="asd-modal__heading"><div><span className="asd-modal__eyebrow">ПРОФИЛЬ РЕБЁНКА</span><h2 id="child-dialog-title">{editing ? 'Редактировать профиль' : 'Новый профиль'}</h2></div><button type="button" className="asd-modal__close" onClick={() => setOpen(false)} aria-label="Закрыть">×</button></div>
          <form onSubmit={save} className="asd-modal__form">
            <label>Имя или псевдоним<input value={name} onChange={e => setName(e.target.value)} maxLength={100} autoFocus required placeholder="Например, Миша" /></label>
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
