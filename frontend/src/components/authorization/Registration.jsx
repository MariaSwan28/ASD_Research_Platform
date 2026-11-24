import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import './authorization.css';
import { registration } from '../../actions/user';

const Registration = () => {
  const dispatch = useDispatch();
  const loader = useSelector((state) => state.app.loader);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [date, setDate] = useState('');
  const [gender, setGender] = useState('male');
  const [isChecked, setIsChecked] = useState(false);
  const today = new Date().toLocaleDateString('en-CA');
  const dateValid = Boolean(date) && date <= today;

  const handleSubmit = (event) => {
    event.preventDefault();
    if (fullName.trim().length < 2 || !dateValid || password.length < 8 || !isChecked || loader) return;
    dispatch(registration(email.trim(), password, date, gender, fullName.trim()));
  };

  return (
    <form className="authorization" onSubmit={handleSubmit}>
      <div className="authorization__eyebrow">Начало знакомства</div>
      <h1 className="authorization__header">Регистрация родителя</h1>
      <p className="authorization__intro">Зарегистрируйтесь, чтобы вести наблюдения в отдельных профилях детей.</p>
      <label className="authorization__label" htmlFor="register-name">ФИО родителя</label>
      <input id="register-name" type="text" autoComplete="name" required minLength={2} maxLength={200} value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Фамилия Имя Отчество" />
      <label className="authorization__label" htmlFor="register-email">Электронная почта</label>
      <input id="register-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="example@mail.ru" />
      <label className="authorization__label" htmlFor="register-password">Пароль</label>
      <input id="register-password" type="password" autoComplete="new-password" minLength={8} maxLength={32} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="От 8 символов" />
      <label className="authorization__label" htmlFor="register-date">Дата рождения родителя</label>
      <input id="register-date" className="custom-date-input" type="date" required max={today} value={date} onChange={(e) => setDate(e.target.value)} />
      {date && !dateValid && <p className="authorization__field-error">Дата рождения не может быть в будущем.</p>}
      <label className="authorization__label" htmlFor="register-gender">Пол родителя</label>
      <select id="register-gender" value={gender} onChange={(e) => setGender(e.target.value)}>
        <option value="male">Мужской</option>
        <option value="female">Женский</option>
      </select>
      <label className="authorization__consent">
        <input type="checkbox" checked={isChecked} onChange={(e) => setIsChecked(e.target.checked)} required />
        <span>Я соглашаюсь с <a href="/privacy.html" target="_blank" rel="noopener noreferrer">условиями обработки персональных данных</a>.</span>
      </label>
      <button type="submit" className="authorization__btn" disabled={loader || fullName.trim().length < 2 || !isChecked || !dateValid || password.length < 8}>
        {loader ? 'Создаём аккаунт…' : 'Зарегистрироваться'}
      </button>
      <p className="authorization__switch">Уже есть аккаунт? <NavLink to="/autmama/login">Войти</NavLink></p>
    </form>
  );
};

export default Registration;
