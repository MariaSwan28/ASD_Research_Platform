import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { auth, deleteAvatar, uploadAvatar } from '../../actions/user';
import './profile.css';
import avatarLogo from '../../assets/img/avatar.svg';
import { API_URL } from '../../config';
import { Link } from 'react-router-dom';
import { $api } from '../../http';
import { setUser } from '../../reducers/userReducer';

const Profile = () => {
  const dispatch = useDispatch();
  const currentUser = useSelector((state) => state.user.currentUser);
  const [fullName, setFullName] = useState(currentUser.fullName || '');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { setFullName(currentUser.fullName || ''); }, [currentUser.fullName]);
  const saveName = async e => {
    e.preventDefault(); setSaving(true); setMessage(''); setError('');
    try {
      const response = await $api.patch('api/auth/profile', { fullName: fullName.trim() });
      dispatch(setUser(response.data)); setEditing(false); setMessage('Профиль обновлён');
    } catch (e) { setError(e?.response?.data?.message || 'Не удалось сохранить ФИО'); }
    finally { setSaving(false); }
  };

  useEffect(() => {
    dispatch(auth());
  }, [dispatch]);

  const avatar = currentUser.avatar ? `${API_URL + currentUser.avatar}` : avatarLogo;
  const email = currentUser.email;
  const dateOfBirth = currentUser.date ? String(currentUser.date).slice(0, 10) : ''; 
  const gender = currentUser.gender === 'male' ? 'Мужской' : currentUser.gender === 'female' ? 'Женский' : 'Не указан';

  function changeHandler(e) {
    const file = e.target.files[0];
    if (file) dispatch(uploadAvatar(file));
  }
  return (
    <div className="profile-container">
      <Link className="profile-back-link" to="/autmama/" aria-label="Вернуться к материалам">← Назад</Link>
      <div className="profile-heading"><span className="profile-heading__eyebrow">УЧЁТНАЯ ЗАПИСЬ</span><h2 className="profile-title">{currentUser.role === 'admin' ? 'Профиль администратора' : currentUser.role === 'specialist' ? 'Профиль специалиста' : 'Профиль родителя'}</h2><p>Здесь хранятся настройки вашей учётной записи.</p></div>
      <div className="avatar-container">
        <img
          src={avatar} // Путь к изображению по умолчанию
          alt="Avatar"
          className="avatar"
        />
        <input accept="image/*" onChange={changeHandler} type="file" className="file-input" />
      </div>
      {currentUser.avatar && <button type="button" onClick={() => dispatch(deleteAvatar())} className="button delete-button">
        Удалить аватар
      </button>}

      {editing ? <form className="profile-name-form" onSubmit={saveName}>
        <label htmlFor="profile-full-name">ФИО</label>
        <input id="profile-full-name" type="text" autoComplete="name" autoFocus required minLength={2} maxLength={200} value={fullName} onChange={e => setFullName(e.target.value)} />
        {error && <p role="alert">{error}</p>}
        <div className="profile-edit-actions"><button type="submit" disabled={saving || fullName.trim().length < 2}>{saving ? 'Сохранение…' : 'Сохранить'}</button><button type="button" disabled={saving} onClick={() => { setEditing(false); setError(''); }}>Отмена</button></div>
      </form> : <div className="profile-name-display"><div><span>ФИО</span><p>{currentUser.fullName || 'Не указано'}</p></div><button type="button" onClick={() => { setFullName(currentUser.fullName || ''); setError(''); setMessage(''); setEditing(true); }}>Изменить</button></div>}
      {message && <p role="status">{message}</p>}
      <div className="profile-data">
        <div className="authorization__field">
          <label style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>Ваша почта:</label>
          <p>{email || 'Не указано'}</p>
        </div>

        <div className="authorization__field">
          <label style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>Дата рождения:</label>
          <p>{dateOfBirth || 'Не указано'}</p>
        </div>

        <div className="authorization__field">
          <label style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>Пол:</label>
          <p>{gender || 'Не указан'}</p>
        </div>
      </div>
    </div>
  );
};

export default Profile;
