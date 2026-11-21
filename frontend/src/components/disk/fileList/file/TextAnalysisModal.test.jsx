import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TextAnalysisModal from './TextAnalysisModal';
import { $api } from '../../../../http';

jest.mock('../../../../http', () => ({ $api: { get: jest.fn(), post: jest.fn() } }));
const model = { id: 'test-model', label: 'Тестовая модель', version: '1', status: 'configured' };
const failed = { schema_version: '1.0', analysis_id: 'failed-run', status: 'failed',
  model: { id: model.id, name: model.label, version: '1' }, input: { file_id: 'file-1' },
  execution: { started_at: '2026-11-13T10:00:00Z', finished_at: '2026-11-13T10:00:01Z', duration_ms: 1000 },
  summary: 'Запуск не завершился', parameters: [], artifacts: [], warnings: [], error: { code: 'test_failure', message: 'Тестовая ошибка' } };

afterEach(() => jest.clearAllMocks());

test('opening a saved report reads history without executing a model', async () => {
  const saved = { ...failed, schema_version: '1.1', status: 'completed', error: null,
    conclusion: { code: 'features_only', title: 'Движения обработаны', explanation: 'Классификатор не запускался.' },
    metrics: [], limitations: [], raw_output: { future: [false, 0, null] } };
  $api.get.mockImplementation(url => Promise.resolve({ data: url.includes('available') ? { models: [model] } : [
    { id: saved.analysis_id, modelId: model.id, date: saved.execution.finished_at, result: saved }
  ] }));
  render(<TextAnalysisModal file={{ _id: 'file-1', name: 'sample.mp4' }} onClose={jest.fn()} />);
  await screen.findByRole('heading', { name: 'Движения обработаны' });
  expect(screen.getByText('Классификатор не запускался.')).toBeTruthy();
  expect($api.post).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Повторить анализ' })).toBeTruthy();
});

test('failed run is displayed and selectable with older history', async () => {
  $api.get.mockImplementation(url => Promise.resolve({ data: url.includes('available') ? { models: [model] } : [
    { id: 'old-run', modelId: model.id, date: '2026-11-12T10:00:00Z', result: { label: 0, old_metric: 'Старый результат' } }
  ] }));
  $api.post.mockRejectedValue({ response: { data: failed } });
  const running = jest.fn();
  render(<TextAnalysisModal file={{ _id: 'file-1', name: 'sample.txt' }} onClose={jest.fn()} onRunningChange={running} />);
  await screen.findByRole('button', { name: 'Повторить анализ' });
  fireEvent.click(screen.getByRole('button', { name: 'Повторить анализ' }));
  await screen.findByText('Анализ не выполнен');
  expect(running.mock.calls).toEqual([[true], [false]]);
  fireEvent.change(screen.getByLabelText('История запусков'), { target: { value: 'old-run' } });
  await screen.findByText('Старый результат');
  expect(screen.queryByText('Анализ не выполнен')).toBeNull();
});

test('history remains readable when the adapter is no longer in the registry', async () => {
  $api.get.mockImplementation(url => Promise.resolve({ data: url.includes('available') ? { models: [] } : [
    { id: 'old-run', modelId: 'removed-model', date: '2026-11-12T10:00:00Z', result: { old_metric: 'Сохранённые данные' } }
  ] }));
  render(<TextAnalysisModal file={{ _id: 'file-1', name: 'sample.txt' }} onClose={jest.fn()} />);
  await screen.findByText('Сохранённые данные');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Повторить анализ' }).disabled).toBe(true));
  expect($api.post).not.toHaveBeenCalled();
});
