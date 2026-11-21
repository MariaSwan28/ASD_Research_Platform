import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import File from './File';
import { useSelector } from 'react-redux';

jest.mock('react-redux', () => ({ useSelector: jest.fn(), useDispatch: () => jest.fn() }));
jest.mock('../../../../actions/file', () => ({ deleteFile: jest.fn(), downloadFile: jest.fn() }));
jest.mock('../../../../actions/user', () => ({ auth: jest.fn() }));
jest.mock('./VideoPlayerModal', () => ({ VideoPlayerModal: () => <div>Видео</div> }));
jest.mock('./TextAnalysisModal', () => function MockModal({ onCompleted, onClose }) {
  return <div><button onClick={() => onCompleted({ status: 'completed' })}>Завершить тестовый запуск</button>
    <button onClick={() => onCompleted({ status: 'failed' })}>Ошибка тестового запуска</button><button onClick={onClose}>Закрыть отчёт</button></div>;
});
const base = { _id: 'file-1', name: 'sample.txt', type: 'txt', size: 12, date: '2026-11-13' };
function state(view = 'list') {
  useSelector.mockImplementation(fn => fn({ user: { currentUser: { id: 'user-1' }, token: 'test' }, files: { currentDir: null, view } }));
}

test.each(['list', 'plate'])('one analysis action for text and video in %s view', view => {
  state(view);
  const { rerender } = render(<File file={base} />);
  expect(screen.getAllByRole('button', { name: 'Анализировать' })).toHaveLength(1);
  rerender(<File file={{ ...base, name: 'sample.mp4', type: 'mp4', hasSavedAnalysis: true, latestAnalysisStatus: 'completed' }} />);
  expect(screen.getAllByRole('button', { name: 'Результат' })).toHaveLength(1);
  expect(screen.queryByText('Анализ / JSON')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Результат' }));
  expect(screen.getByRole('button', { name: 'Закрыть отчёт' })).toBeTruthy();
});

test('button follows completed and failed runs', () => {
  state(); render(<File file={base} />);
  fireEvent.click(screen.getByRole('button', { name: 'Анализировать' }));
  fireEvent.click(screen.getByRole('button', { name: 'Завершить тестовый запуск' }));
  fireEvent.click(screen.getByRole('button', { name: 'Закрыть отчёт' }));
  fireEvent.click(screen.getByRole('button', { name: 'Результат' }));
  fireEvent.click(screen.getByRole('button', { name: 'Ошибка тестового запуска' }));
  fireEvent.click(screen.getByRole('button', { name: 'Закрыть отчёт' }));
  expect(screen.getByRole('button', { name: 'Ошибка анализа' })).toBeTruthy();
});
