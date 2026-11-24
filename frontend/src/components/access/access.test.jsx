import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { $api } from '../../http';
import AdminDashboard from './AdminDashboard';
import ChildProfiles from '../disk/ChildProfiles';
import {loadChildren} from '../../actions/children';
jest.mock('../../actions/children',()=>({loadChildren:jest.fn(),createChild:jest.fn(),updateChild:jest.fn(),deleteChild:jest.fn()}));
jest.mock('../../http', () => ({ $api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() } }));
afterEach(() => { jest.resetAllMocks(); jest.restoreAllMocks(); });
const spec = { id: 'spec-1', email: 'spec@test.invalid', fullName: 'Иванов Иван Иванович', role: 'specialist' };
const parent = { id: 'parent-1', email: 'parent@test.invalid', fullName: 'Петрова Анна Сергеевна', role: 'parent' };
const child = { _id: 'child-1', ownerId: parent.id, fullName: 'Петров Михаил Сергеевич', birthDate: '2021-05-04', ownerEmail: parent.email, ownerFullName: parent.fullName, specialists: [] };
const mountAdmin = () => render(<MemoryRouter><AdminDashboard /></MemoryRouter>);

test('specialist searches only assigned children and has no create or general materials button', async () => {
  loadChildren.mockResolvedValue([child, {...child,_id:'child-2',fullName:'Сидорова Анна Ивановна'}]);
  const choose=jest.fn();render(<ChildProfiles specialist selectedId={null} onSelect={choose} />);
  await screen.findByRole('button', {name:/Открыть материалы Петров Михаил/});
  fireEvent.change(screen.getByRole('searchbox'),{target:{value:'сидорова'}});
  expect(screen.queryByRole('button',{name:/Открыть материалы Петров Михаил/})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:/Открыть материалы Сидорова Анна/}));expect(choose).toHaveBeenCalledWith('child-2');
  expect(screen.queryByRole('button',{name:/Добавить ребёнка|Общие материалы/})).toBeNull();
  fireEvent.change(screen.getByRole('searchbox'),{target:{value:'Нет такого'}});expect(screen.getByText('Дети не найдены.')).toBeTruthy();
});

test('specialist automatically reloads assignments on return without refresh button', async () => {
  loadChildren.mockResolvedValueOnce([child]).mockResolvedValueOnce([]);
  const choose=jest.fn();render(<ChildProfiles specialist selectedId={child._id} onSelect={choose} />);
  await screen.findByRole('button',{name:/Открыть материалы Петров Михаил/});
  expect(screen.queryByRole('button', { name: 'Обновить' })).toBeNull();
  fireEvent(window, new Event('focus'));
  await screen.findByText('Пока нет назначенных детей.');expect(choose).toHaveBeenCalledWith(null);
});

test('admin has separate parent and specialist tables without an admin record or inline FIO inputs', async () => {
  $api.get.mockImplementation(route => Promise.resolve({ data: route === 'api/admin/users' ? [spec, parent, { id: 'admin', fullName: 'Скрытый Администратор', email: 'admin@test.invalid', role: 'admin' }] : [child] }));
  mountAdmin();
  await screen.findByText(spec.email);
  expect(screen.queryByText(parent.email)).toBeNull();
  expect(screen.queryByText('Скрытый Администратор')).toBeNull();
  expect(screen.queryByLabelText(/ФИО для/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /^Родители/ }));
  await screen.findByText(parent.email);
  expect(screen.queryByText(spec.email)).toBeNull();
});

test.each([['specialist', 'Добавить специалиста'], ['parent', 'Добавить родителя']])('admin creates %s in a separate form', async (role, label) => {
  $api.get.mockResolvedValue({ data: [] }); $api.post.mockResolvedValue({ data: {} });
  mountAdmin(); await waitFor(() => expect(screen.getByRole('button', { name: 'Обновить' }).disabled).toBe(false));
  if (role === 'parent') fireEvent.click(screen.getByRole('button', { name: /^Родители/ }));
  fireEvent.click(screen.getByRole('button', { name: label }));
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('ФИО'), { target: { value: 'Проверочный Пользователь' } });
  fireEvent.change(within(dialog).getByLabelText('Электронная почта'), { target: { value: 'new@test.invalid' } });
  fireEvent.change(within(dialog).getByLabelText('Пароль'), { target: { value: 'password123' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect($api.post).toHaveBeenCalledWith('api/admin/users', { fullName: 'Проверочный Пользователь', email: 'new@test.invalid', password: 'password123', role });
  expect(screen.queryByLabelText('Пароль')).toBeNull();
});

test('admin edits identity via a dialog rather than a permanent save-FIO button', async () => {
  $api.get.mockImplementation(route => Promise.resolve({ data: route === 'api/admin/users' ? [spec] : [] }));
  $api.patch.mockResolvedValue({ data: {} });
  mountAdmin(); await screen.findByText(spec.email);
  fireEvent.click(screen.getByRole('button', { name: 'Изменить' }));
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('ФИО'), { target: { value: 'Иванов Иван Петрович' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
  await waitFor(() => expect($api.patch).toHaveBeenCalledWith('api/admin/users/spec-1', { fullName: 'Иванов Иван Петрович', email: spec.email }));
});

test('admin assigns and revokes a child from specialist dialog', async () => {
  let assigned = false;
  $api.get.mockImplementation(route => Promise.resolve({ data: route === 'api/admin/users' ? [spec, parent] : [{ ...child, specialists: assigned ? [spec] : [] }] }));
  $api.put.mockImplementation(() => { assigned = true; return Promise.resolve({ data: {} }); });
  $api.delete.mockImplementation(() => { assigned = false; return Promise.resolve({ data: {} }); });
  mountAdmin(); await screen.findByText(spec.email);
  fireEvent.click(screen.getByRole('button', { name: 'Назначить детей' }));
  const checkbox = within(screen.getByRole('dialog')).getByRole('checkbox');
  fireEvent.click(checkbox);
  await waitFor(() => expect(checkbox.checked).toBe(true));
  expect($api.put).toHaveBeenCalledWith('api/admin/children/child-1/specialists', { specialistId: spec.id });
  fireEvent.click(checkbox);
  await waitFor(() => expect(checkbox.checked).toBe(false));
  expect($api.delete).toHaveBeenCalledWith('api/admin/children/child-1/specialists/spec-1');
});

test('admin has no personal materials or child creation, but edits existing children', async () => {
  $api.get.mockImplementation(route => Promise.resolve({ data: route === 'api/admin/users' ? [parent] : [child] }));
  $api.patch.mockResolvedValue({ data: {} });
  mountAdmin(); await waitFor(() => expect(screen.getByRole('button', { name: 'Обновить' }).disabled).toBe(false));
  expect(screen.queryByRole('link', { name: 'Мои материалы' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /^Дети/ }));
  expect(screen.queryByRole('button', { name: 'Добавить ребёнка' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Изменить' }));
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('ФИО'), { target: { value: 'Петров Михаил Петрович' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
  await waitFor(() => expect($api.patch).toHaveBeenCalledWith('api/admin/children/child-1', { fullName: 'Петров Михаил Петрович', birthDate: '2021-05-04', ownerId: parent.id }));
});

test('admin delete asks confirmation and removes selected account', async () => {
  $api.get.mockImplementation(route => Promise.resolve({ data: route === 'api/admin/users' ? [spec] : [] })); $api.delete.mockResolvedValue({ data: {} });
  jest.spyOn(window, 'confirm').mockReturnValue(true);
  mountAdmin(); await screen.findByText(spec.email);
  fireEvent.click(screen.getByRole('button', { name: 'Удалить' }));
  await waitFor(() => expect($api.delete).toHaveBeenCalledWith('api/admin/users/spec-1'));
  expect(window.confirm).toHaveBeenCalledTimes(1);
});
