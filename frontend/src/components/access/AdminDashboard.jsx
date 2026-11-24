import React, { useCallback, useEffect, useState } from 'react';
import { $api } from '../../http';
import './access.css';

const displayName = user => user.fullName || user.email;
const childName = child => child.fullName || child.name;
const tabs = [{ id: 'specialist', title: 'Специалисты' }, { id: 'parent', title: 'Родители' }, { id: 'children', title: 'Дети' }];
const dateLabel = date => date ? new Date(`${date}T00:00:00`).toLocaleDateString('ru-RU') : 'Не указана';

export default function AdminDashboard() {
  const [users, setUsers] = useState([]);
  const [children, setChildren] = useState([]);
  const [tab, setTab] = useState('specialist');
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState(null);
  const [form, setForm] = useState({});
  const [assignmentQuery, setAssignmentQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const load = useCallback(async () => {
    const [u, c] = await Promise.all([$api.get('api/admin/users'), $api.get('api/admin/children')]);
    setUsers(u.data.filter(user => ['parent', 'specialist'].includes(user.role)));
    setChildren(c.data);
  }, []);
  const run = useCallback(async (action, success = '') => {
    setBusy(true); setError(''); setMessage('');
    try { await action(); await load(); setMessage(success); return true; }
    catch (e) { setError(e?.response?.data?.message || 'Не удалось выполнить действие'); return false; }
    finally { setBusy(false); }
  }, [load]);
  useEffect(() => { run(async () => {}); }, [run]);
  useEffect(() => {
    if (!dialog) return;
    const close = event => { if (event.key === 'Escape' && !busy) setDialog(null); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [dialog, busy]);
  const specialists = users.filter(user => user.role === 'specialist');
  const openUser = (role, record = null) => {
    setError(''); setMessage(''); setForm({ fullName: record?.fullName || '', email: record?.email || '', password: '' });
    setDialog({ kind: 'user', role, record });
  };
  const openChild = record => {
    setError(''); setMessage(''); setForm({ fullName: record?.fullName || '', birthDate: record?.birthDate || '', ownerId: record?.ownerId || '' });
    setDialog({ kind: 'child', record });
  };
  const openAssignments = (kind, record) => { setError(''); setMessage(''); setAssignmentQuery(''); setDialog({ kind, record }); };
  const submit = async event => {
    event.preventDefault();
    let ok;
    if (dialog.kind === 'user') {
      const data = { fullName: form.fullName.trim(), email: form.email.trim() };
      ok = await run(() => dialog.record ? $api.patch(`api/admin/users/${dialog.record.id}`, data) : $api.post('api/admin/users', { ...data, password: form.password, role: dialog.role }), dialog.record ? 'Изменения сохранены' : 'Аккаунт создан. Передайте данные входа владельцу.');
    } else {
      const data = { fullName: form.fullName.trim(), birthDate: form.birthDate || null, ownerId: form.ownerId };
      ok = await run(() => $api.patch(`api/admin/children/${dialog.record._id}`, data), 'Профиль изменён');
    }
    if (ok) { setDialog(null); setForm({}); }
  };
  const removeUser = user => {
    const detail = user.role === 'parent' ? 'Его дети будут скрыты из рабочих списков, назначения будут сняты.' : 'Назначения специалиста будут сняты. Профили детей сохранятся.';
    if (!window.confirm(`Удалить аккаунт «${displayName(user)}»? Вход будет закрыт. ${detail} Сохранённые данные останутся в базе.`)) return;
    run(() => $api.delete(`api/admin/users/${user.id}`), 'Аккаунт удалён из рабочих списков');
  };
  const removeChild = child => {
    if (!window.confirm(`Удалить профиль «${childName(child)}»? Назначения специалистов будут сняты. Материалы и результаты сохранятся в общих материалах родителя.`)) return;
    run(() => $api.delete(`api/admin/children/${child._id}`), 'Профиль удалён. Материалы сохранены у родителя.');
  };
  const toggleAssignment = (child, specialistId, checked) => run(() => checked ? $api.put(`api/admin/children/${child._id}/specialists`, { specialistId }) : $api.delete(`api/admin/children/${child._id}/specialists/${specialistId}`), checked ? 'Специалист назначен' : 'Назначение снято');
  const matches = text => text.toLowerCase().includes(query.trim().toLowerCase());
  const visibleUsers = users.filter(user => user.role === tab && matches(`${user.fullName} ${user.email}`));
  const visibleChildren = children.filter(child => matches(`${childName(child)} ${child.ownerFullName || ''} ${child.ownerEmail}`));
  const addLabel = tab === 'parent' ? 'Добавить родителя' : 'Добавить специалиста';
  const dialogTitle = dialog?.kind === 'user' ? `${dialog.record ? 'Редактировать' : 'Добавить'} ${dialog.role === 'parent' ? 'родителя' : 'специалиста'}` : dialog?.kind === 'child' ? `${dialog.record ? 'Редактировать' : 'Добавить'} ребёнка` : dialog?.kind === 'assignChild' ? `Специалисты для ${childName(dialog.record)}` : dialog ? `Дети специалиста ${displayName(dialog.record)}` : '';
  return <main className="access-page">
    <div className="access-heading"><div><span className="disk__eyebrow">УПРАВЛЕНИЕ ПЛАТФОРМОЙ</span><h1>Кабинет администратора</h1></div></div>
    <nav className="access-tabs" aria-label="Разделы управления">{tabs.map(item => <button type="button" key={item.id} aria-pressed={tab === item.id} onClick={() => { setTab(item.id); setQuery(''); setError(''); setMessage(''); }}>{item.title}<span>{item.id === 'children' ? children.length : users.filter(user => user.role === item.id).length}</span></button>)}</nav>
    {error && !dialog && <p role="alert" className="access-error">{error}</p>}{message && !dialog && <p role="status" className="access-success">{message}</p>}
    <section className="access-panel">
      <div className="access-heading"><h2>{tabs.find(item => item.id === tab).title}</h2><div className="access-actions"><button type="button" disabled={busy} onClick={() => run(async () => {})}>Обновить</button>{tab !== 'children' && <button type="button" className="access-primary" disabled={busy} onClick={() => openUser(tab)}>{addLabel}</button>}</div></div>
      <label className="access-search">{tab === 'children' ? 'Поиск по ФИО ребёнка или родителя' : 'Поиск по ФИО или почте'}<input type="search" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <div className="access-table-wrap">
        {tab === 'children' ? <table className="access-table"><thead><tr><th>ФИО ребёнка</th><th>Дата рождения</th><th>Родитель</th><th>Специалисты</th><th>Действия</th></tr></thead><tbody>{visibleChildren.map(child => <tr key={child._id}><td><strong>{childName(child)}</strong></td><td>{dateLabel(child.birthDate)}</td><td>{child.ownerFullName || 'ФИО не указано'}<small>{child.ownerEmail}</small></td><td>{child.specialists.length ? child.specialists.map(user => <span className="access-person" key={user.id}>{displayName(user)}</span>) : 'Не назначены'}</td><td><div className="access-row-actions"><button type="button" disabled={busy} onClick={() => openChild(child)}>Изменить</button><button type="button" disabled={busy} onClick={() => openAssignments('assignChild', child)}>Специалисты</button><button type="button" disabled={busy} className="access-danger" onClick={() => removeChild(child)}>Удалить</button></div></td></tr>)}</tbody></table> : <table className="access-table"><thead><tr><th>ФИО</th><th>Электронная почта</th><th>{tab === 'parent' ? 'Профили детей' : 'Закреплено детей'}</th><th>Действия</th></tr></thead><tbody>{visibleUsers.map(user => <tr key={user.id}><td><strong>{user.fullName || 'ФИО не указано'}</strong></td><td>{user.email}</td><td>{user.childCount ?? children.filter(child => tab === 'parent' ? child.ownerId === user.id : child.specialists.some(specialist => specialist.id === user.id)).length}</td><td><div className="access-row-actions"><button type="button" disabled={busy} onClick={() => openUser(user.role, user)}>Изменить</button>{tab === 'specialist' && <button type="button" disabled={busy} onClick={() => openAssignments('assignSpecialist', user)}>Назначить детей</button>}<button type="button" disabled={busy} className="access-danger" onClick={() => removeUser(user)}>Удалить</button></div></td></tr>)}</tbody></table>}
      </div>
      {!(tab === 'children' ? visibleChildren.length : visibleUsers.length) && <p className="access-empty">{busy ? 'Загрузка…' : query ? 'Ничего не найдено' : tab === 'children' ? 'Профилей детей пока нет' : tab === 'parent' ? 'Родителей пока нет' : 'Специалистов пока нет'}</p>}
    </section>
    {dialog && <div className="access-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setDialog(null); }}><section className="access-modal" role="dialog" aria-modal="true" aria-labelledby="admin-dialog-title"><div className="access-heading"><h2 id="admin-dialog-title">{dialogTitle}</h2><button type="button" aria-label="Закрыть" disabled={busy} onClick={() => setDialog(null)}>×</button></div>
      {error && <p role="alert" className="access-error">{error}</p>}{message && <p role="status" className="access-success">{message}</p>}
      {['user', 'child'].includes(dialog.kind) ? <form className="access-editor" onSubmit={submit}>
        <label>ФИО<input value={form.fullName} onChange={event => setForm({ ...form, fullName: event.target.value })} required minLength={2} maxLength={200} autoFocus autoComplete="off" /></label>
        {dialog.kind === 'user' ? <><label>Электронная почта<input type="email" required value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} autoComplete="off" /></label>{!dialog.record && <label>Пароль<input type="password" required minLength={8} maxLength={32} value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} autoComplete="new-password" /></label>}</> : <><label>Дата рождения<input type="date" max={new Date().toISOString().slice(0, 10)} value={form.birthDate} onChange={event => setForm({ ...form, birthDate: event.target.value })} /></label><p>Родитель: {dialog.record.ownerFullName || dialog.record.ownerEmail}</p></>}
        <div className="access-actions"><button type="button" disabled={busy} onClick={() => setDialog(null)}>Отмена</button><button className="access-primary" type="submit" disabled={busy || (dialog.kind === 'child' && !form.ownerId)}>{busy ? 'Сохранение…' : 'Сохранить'}</button></div>
      </form> : <><label className="access-search">Поиск<input type="search" value={assignmentQuery} onChange={event => setAssignmentQuery(event.target.value)} autoFocus /></label><div className="access-assignment-list">
        {dialog.kind === 'assignChild' ? specialists.filter(user => `${user.fullName} ${user.email}`.toLowerCase().includes(assignmentQuery.toLowerCase())).map(user => {
          const child = children.find(item => item._id === dialog.record._id);
          return child && <label className="access-check" key={user.id}><input type="checkbox" checked={child.specialists.some(item => item.id === user.id)} disabled={busy} onChange={event => toggleAssignment(child, user.id, event.target.checked)} /><span><strong>{displayName(user)}</strong><small>{user.email}</small></span></label>;
        }) : children.filter(child => `${childName(child)} ${child.ownerFullName || ''} ${child.ownerEmail}`.toLowerCase().includes(assignmentQuery.toLowerCase())).map(child => <label className="access-check" key={child._id}><input type="checkbox" checked={child.specialists.some(user => user.id === dialog.record.id)} disabled={busy} onChange={event => toggleAssignment(child, dialog.record.id, event.target.checked)} /><span><strong>{childName(child)}</strong><small>Родитель: {child.ownerFullName || child.ownerEmail}</small></span></label>)}
        {dialog.kind === 'assignChild' && !specialists.length && <p>Специалистов пока нет. Добавьте их в разделе «Специалисты».</p>}{dialog.kind === 'assignSpecialist' && !children.length && <p>Профилей детей пока нет.</p>}
      </div><div className="access-actions"><button type="button" disabled={busy} onClick={() => setDialog(null)}>Готово</button></div></>}
    </section></div>}
  </main>;
}
