import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import AnalysisResultDetails from './AnalysisResultDetails';

const result = {
  schema_version: '1.0', analysis_id: 'run-1', status: 'completed',
  model: { id: 'model-1', name: 'Новая модель', version: '1.0', modality: 'text', operation: 'test' },
  input: { file_id: 'file-1', modality: 'text' },
  execution: { started_at: '2026-11-13T10:00:00Z', finished_at: '2026-11-13T10:00:01Z', duration_ms: 1000 },
  summary: 'Анализ завершён',
  parameters: [
    { key: 'zero', label: 'Нулевое значение', type: 'number', value: 0 },
    { key: 'false', label: 'Ложное значение', type: 'boolean', value: false },
    { key: 'null', label: 'Отсутствующее значение', type: 'number', value: null },
    { key: 'table', label: 'Табличный результат', type: 'table', columns: [{ key: 'x', label: 'Колонка X' }], value: [{ x: 'Ячейка таблицы' }] },
    { key: 'unknown', label: 'Будущий тип', type: 'future-type', value: { custom: 'Неизвестный параметр' } },
    { key: 'list', label: 'Длинный список', type: 'array', value: Array.from({ length: 65 }, (_, i) => `element-${i}`) }
  ], artifacts: [{ id: 'artifact-1', label: 'Файл отчёта', media_type: 'application/json' }],
  warnings: ['Тестовое ограничение'], error: null
};

test('renders typed values, tables, unknown types and all list pages', () => {
  render(<AnalysisResultDetails result={result} />);
  expect(screen.getAllByText('Новая модель')[0]).toBeTruthy();
  expect(screen.getByText('Нет')).toBeTruthy();
  expect(screen.getByText('Нет данных')).toBeTruthy();
  expect(screen.getByText('0')).toBeTruthy();
  expect(screen.getByText('Ячейка таблицы')).toBeTruthy();
  expect(screen.getByText('Неизвестный параметр')).toBeTruthy();
  expect(screen.queryByText('element-64')).toBeNull();
  document.querySelectorAll('details').forEach(el => { el.open = true; });
  fireEvent.click(screen.getByRole('button', { name: /Показать ещё/ }));
  expect(screen.getByText('element-64')).toBeTruthy();
  expect(screen.getByText('Файл отчёта')).toBeTruthy();
});

test('download contains entire result including items not yet expanded', () => {
  const captured = [];
  const OriginalBlob = global.Blob;
  global.Blob = class { constructor(parts) { captured.push(parts.join('')); } };
  URL.createObjectURL = jest.fn(() => 'blob:test');
  URL.revokeObjectURL = jest.fn();
  const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  try {
    render(<AnalysisResultDetails result={result} />);
    screen.getByText('Технические данные').closest('details').open = true;
    fireEvent.click(screen.getByRole('button', { name: 'Скачать JSON' }));
    expect(JSON.parse(captured[0])).toEqual(result);
    expect(click).toHaveBeenCalledTimes(1);
  } finally { global.Blob = OriginalBlob; click.mockRestore(); }
});

test('shows failed and legacy results without inventing zero values', () => {
  const { rerender } = render(<AnalysisResultDetails result={{ ...result, status: 'failed', parameters: [], error: { code: 'test_failure', message: 'Не удалось выполнить' } }} />);
  expect(screen.getByRole('alert').textContent).toContain('Не удалось выполнить');
  expect(screen.getByText('Код ошибки: test_failure')).toBeTruthy();
  rerender(<AnalysisResultDetails result={{ label: 0, features_nonzero: 3, unknown_old: false }} modelId="old-model" />);
  expect(screen.getByText('old-model')).toBeTruthy();
  expect(screen.getByText('Исходная метка класса')).toBeTruthy();
  expect(screen.getByText('Нет')).toBeTruthy();
});


test('1.1 shows the adapter explanation and scalar metrics before technical details', () => {
  const modern = { ...result, schema_version: '1.1',
    conclusion: { code: 'features_only', title: 'Движения обработаны', explanation: 'Классификация не выполнялась.' },
    metrics: [{ key: 'duration', label: 'Продолжительность', type: 'number', value: 5, unit: 'с', description: 'Длительность записи.' }],
    limitations: ['Качество зависит от ракурса.'], raw_output: { future: [0, false, null] } };
  render(<AnalysisResultDetails result={modern} />);
  expect(screen.getByRole('heading', { name: 'Движения обработаны' })).toBeTruthy();
  expect(screen.getByText('Классификация не выполнялась.')).toBeTruthy();
  expect(screen.getByLabelText('Основные показатели').textContent).not.toContain('Длительность записи.');
  expect(screen.getByTitle('Длительность записи.')).toBeTruthy();
  expect(screen.getByText('Ограничения анализа').closest('details').open).toBe(false);
  expect(screen.getAllByText('Результат анализа не является диагнозом.')).toHaveLength(1);
  expect(screen.getByText('Технические данные').closest('details').open).toBe(false);
  expect(screen.getByText('Подробности').closest('details').open).toBe(false);
  expect(screen.getByText('Качество зависит от ракурса.')).toBeTruthy();
});
