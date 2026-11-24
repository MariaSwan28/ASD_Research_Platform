import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';
let mockRole = 'admin';
jest.mock('react-redux', () => ({ useDispatch: () => jest.fn(), useSelector: callback => callback({ user: { isAuth: true, currentUser: { role: mockRole } } }) }));
jest.mock('../actions/user', () => ({ auth: jest.fn() }));
jest.mock('./navbar/Navbar', () => () => <div>Navigation</div>);
jest.mock('./disk/Disk', () => () => <div>Parent material workspace</div>);
jest.mock('./access/AdminDashboard', () => () => <div>Administrative workspace</div>);
jest.mock('./access/SpecialistDashboard', () => () => <div>Specialist workspace</div>);
jest.mock('./profile/Profile', () => () => <div>Account settings</div>);
test.each(['admin', 'specialist'])('%s is redirected away from personal materials', role => {
 mockRole = role; window.history.replaceState({}, '', '/autmama/materials');
 render(<App />);
 expect(screen.queryByText('Parent material workspace')).toBeNull();
 expect(screen.getByText(role === 'admin' ? 'Administrative workspace' : 'Specialist workspace')).toBeTruthy();
 expect(window.location.pathname).toBe('/autmama/');
});
test('parent still has personal materials', () => {
 mockRole = 'parent'; window.history.replaceState({}, '', '/autmama/materials');
 render(<App />); expect(screen.getByText('Parent material workspace')).toBeTruthy();
});
