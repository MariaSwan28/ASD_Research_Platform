import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import './authorization.css';
import Input from '../../utils/input/Input';
import { useDispatch, useSelector } from 'react-redux';
import { login } from '../../actions/user';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const loader = useSelector((state) => state.app.loader);
  const dispatch = useDispatch();

  const handleSubmit = (event) => {
    event.preventDefault();
    if (email.trim() && password) dispatch(login(email.trim(), password));
  };

  return (
    <form className="authorization" onSubmit={handleSubmit}>
      <div className="authorization__eyebrow">Семейное пространство</div>
      <h1 className="authorization__header">Добро пожаловать!</h1>
      <p className="authorization__intro">Войдите, чтобы открыть профили детей и материалы.</p>
      <label className="authorization__label" htmlFor="login-email">Электронная почта</label>
      <input id="login-email" autoComplete="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="example@mail.ru" />
      <label className="authorization__label" htmlFor="login-password">Пароль</label>
      <input id="login-password" autoComplete="current-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Введите пароль" />
      <button type="submit" className="authorization__btn" disabled={loader}>
        {loader ? 'Входим…' : 'Войти'}
      </button>
      <p className="authorization__switch">Впервые у нас? <NavLink to="/autmama/registration">Зарегистрироваться</NavLink></p>
    </form>
  );
};

export default Login;
