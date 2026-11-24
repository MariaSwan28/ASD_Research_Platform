import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Navbar from './Navbar';
jest.mock('react-redux', () => ({ useDispatch: () => jest.fn(), useSelector: callback => callback({ user: { isAuth: true, currentUser: { role: 'specialist', fullName: 'Иванов Иван Иванович' } } }) }));
jest.mock('../../actions/user', () => ({ logoutService: jest.fn() }));
test('header has only logout and profile icon without name or role', () => {
 render(<MemoryRouter><Navbar /></MemoryRouter>);
 expect(screen.queryByText('Иванов Иван Иванович')).toBeNull();
 expect(screen.getByRole('link', { name: 'Мой профиль' }).getAttribute('href')).toBe('/autmama/profile');
 expect(screen.getByRole('button', { name: 'Выход' })).toBeTruthy();
 expect(screen.queryByText('Специалист')).toBeNull();
});
