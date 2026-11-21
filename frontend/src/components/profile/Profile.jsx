import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { auth, deleteAvatar, uploadAvatar } from '../../actions/user';
import './profile.css';
import avatarLogo from '../../assets/img/avatar.svg';
import { API_URL } from '../../config';
import { Link } from 'react-router-dom';

const Profile = () => {
  const dispatch = useDispatch();
  const currentUser = useSelector((state) => state.user.currentUser);

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
      <div className="profile-heading"><span className="profile-heading__eyebrow">ВАШ СЕМЕЙНЫЙ КАБИНЕТ</span><h2 className="profile-title">Профиль родителя</h2><p>Здесь хранятся настройки вашей учётной записи.</p></div>
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
