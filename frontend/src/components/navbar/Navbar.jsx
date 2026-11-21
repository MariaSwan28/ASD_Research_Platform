import React from 'react';
import './navbar.css';
import Logo from '../../assets/img/logo.svg';
import { NavLink } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { logoutService } from '../../actions/user';
import avatarLogo from '../../assets/img/avatar.svg';
import { API_URL } from '../../config';

const Navbar = () => {
  const isAuth = useSelector((state) => state.user.isAuth);
  const currentUser = useSelector((state) => state.user.currentUser);
  const dispatch = useDispatch();
  const avatar = currentUser?.avatar ? `${API_URL}${currentUser.avatar}` : avatarLogo;

  return (
    <header className="navbar">
      <div className="container">
        <NavLink to="/autmama/" className="navbar__brand-icon" aria-label="Аутмама — главная">
          <img src={Logo} alt="" className="navbar__logo" />
        </NavLink>
        <div className="navbar__header">
          <NavLink to="/autmama/">Аутмама <span className="navbar__brand-accent">облако</span></NavLink>
        </div>
        {isAuth && (
          <nav className="navbar__account-actions" aria-label="Учётная запись">
            <button type="button" className="navbar__login navbar__logout" onClick={() => dispatch(logoutService())}>
              Выход
            </button>
            <NavLink to="/autmama/profile" className="navbar__profile-link" title="Мой профиль" aria-label="Мой профиль">
              <img className="navbar__avatar" src={avatar} alt="" />
            </NavLink>
          </nav>
        )}
      </div>
    </header>
  );
};

export default Navbar;
