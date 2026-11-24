import AnalysisArtifact from './AnalysisArtifact';
import AnalysisReport from './AnalysisReport';
import React, { useState } from 'react';
import './analysisResultDetails.css';

const names = {
  label: 'Исходная метка класса', features_nonzero: 'Распознанных признаков текста',
  video_metadata: 'Сведения о видео', aggregated_features: 'Характеристики движений',
  preliminary_annotation: 'Предварительная аннотация', quality_metrics: 'Качество обработки',
  time_series_summary: 'Сведения о временных рядах'
};
const title = key => names[key] || key.replace(/_/g, ' ');
const isObject = value => value !== null && typeof value === 'object';
const has = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function Scalar({ value }) {
  if (value === null || value === undefined) return <>Нет данных</>;
  if (typeof value === 'boolean') return <>{value ? 'Да' : 'Нет'}</>;
  if (value === '') return <>Пустая строка</>;
  if (typeof value === 'number') return <>{new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)}</>;
  return <>{String(value)}</>;
}

// Lists are paged, never silently truncated. The JSON download includes everything.
function Entries({ entries, render }) {
  const [count, setCount] = useState(40);
  return <>{entries.slice(0, count).map(render)}
    {count < entries.length && <button type="button" className="analysis-more" onClick={() => setCount(count + 40)}>
      Показать ещё ({entries.length - count})
    </button>}
  </>;
}

function RawValue({ value, level = 0 }) {
  if (!isObject(value)) return <Scalar value={value} />;
  if (level >= 3) return <pre>{JSON.stringify(value, null, 2)}</pre>;
  const entries = Object.entries(value);
  return <details className="analysis-detail-group"><summary>{Array.isArray(value) ? 'Список' : 'Объект'} ({entries.length})</summary>
    <Entries entries={entries} render={([key, child]) => <div className="analysis-detail" key={key}>
      <span>{Array.isArray(value) ? Number(key) + 1 : title(key)}</span><RawValue value={child} level={level + 1} />
    </div>} />
  </details>;
}

function Parameter({ item, compact = false }) {
  if (!isObject(item) || !has(item, 'value')) return <RawValue value={item} />;
  let content;
  if (item.value === null) content = <Scalar value={null} />;
  else if (item.type === 'object' && isObject(item.value)) content = <Entries entries={Object.entries(item.value)}
    render={([key, child]) => <Parameter key={key} item={child} />} />;
  else if (item.type === 'table' && Array.isArray(item.columns) && Array.isArray(item.value)) {
    content = <div className="analysis-table-scroll"><table className="analysis-parameter-table">
      <thead><tr>{item.columns.map(column => <th key={column.key} scope="col">{column.label}{column.unit ? ` (${column.unit})` : ''}</th>)}</tr></thead>
      <tbody>{item.value.map((row, index) => <tr key={index}>{item.columns.map(column => <td key={column.key}>
        <RawValue value={row?.[column.key]} />
      </td>)}</tr>)}</tbody>
    </table></div>;
  } else content = <RawValue value={item.value} />;
  const complex = isObject(item.value);
  const body = <>{item.description && <p className="analysis-parameter-description">{item.description}</p>}
    {content}
    {item.unit && <small className="analysis-parameter-unit">Единица: {item.unit}</small>}
  </>;
  return complex ? <details className="analysis-detail-group"><summary>{item.label || item.key}</summary>{body}</details> :
    <div className="analysis-detail"><span title={compact ? item.description : undefined}>{item.label || item.key}</span><strong>{content}{item.unit ? ` ${item.unit}` : ''}</strong>
      {!compact && item.description && <p className="analysis-parameter-description">{item.description}</p>}
    </div>;
}

export default function AnalysisResultDetails({ result, modelId, version, date }) {
  if (!result || typeof result !== 'object') return null;
  const brief = result.report_view === 'brief';
  const canonical = ['1.0', '1.1', '1.2', '1.3'].includes(result.schema_version);
  const model = canonical ? result.model : { id: modelId || result.model_id, version: version || result.model_version };
  const failed = result.status === 'failed';
  const hasReport = result.schema_version === '1.3' && result.report;
  const conclusion = result.conclusion || {
    title: failed ? 'Анализ не выполнен' : 'Результат сохранён',
    explanation: failed ? result.error?.message || result.summary :
      'Показатели доступны в подробностях.'
  };
  const metrics = Array.isArray(result.metrics) ? result.metrics : [];
  const limitations = [...new Set([...(result.limitations || []), ...(result.warnings || [])])];
  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `analysis-${String(result.analysis_id || result.analysisId || 'result').replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="analysis-result-details" aria-label="Результат анализа">
    <div className="analysis-report-meta">
      <div><small>Модель</small><strong>{model?.name || model?.id || 'Не указана'}</strong></div>
      {(result.execution?.finished_at || date) && <div><small>Дата анализа</small><strong>{new Date(result.execution?.finished_at || date).toLocaleString('ru-RU')}</strong></div>}
    </div>
    {result.status === 'partial' && <p className="analysis-partial">Получена часть результатов</p>}
    {(!hasReport || failed) && <div className={`analysis-conclusion ${failed ? 'analysis-conclusion--failed' : ''}`}>
      <h3>{conclusion.title}</h3><p role={failed ? 'alert' : undefined}>{conclusion.explanation}</p>
    </div>}
    {hasReport && <AnalysisReport report={result.report} artifacts={result.artifacts} analysisId={result.analysis_id} />}
    {!hasReport && metrics.length > 0 && <div className="analysis-metrics" aria-label="Основные показатели">
      <h4>Основные показатели</h4>{metrics.map(item => <Parameter key={item.key} item={item} compact />)}
    </div>}
    {!hasReport && (result.artifacts || []).filter(item => item.media_type?.startsWith('video/')).map(item => <AnalysisArtifact key={`${result.analysis_id}-${item.id}`} analysisId={result.analysis_id} artifact={item} />)}
    <p className="analysis-result-disclaimer">Результат анализа не является диагнозом.</p>
    {!brief && <><details className="analysis-detail-group"><summary>Подробности</summary>
      {canonical ? <>
        {(result.parameters || []).map(item => <Parameter key={item.key} item={item} />)}
        {!(result.parameters || []).length && <p>Показатели не получены.</p>}
        {!hasReport && (result.artifacts || []).filter(item => !item.media_type?.startsWith('video/')).map(item => <AnalysisArtifact key={`${result.analysis_id}-${item.id}`} analysisId={result.analysis_id} artifact={item} />)}
      </> : Object.entries(result).map(([key, value]) => <div className="analysis-detail" key={key}><span>{title(key)}</span><RawValue value={value} /></div>)}
    </details>
    <details className="analysis-detail-group"><summary>Технические данные</summary>
      {hasReport && <AnalysisReport report={result.report} artifacts={result.artifacts} analysisId={result.analysis_id} technical />}
      <p>Версия модели: {model?.version || '—'}. Версия формата: {result.schema_version || 'прежний формат'}.</p>
      {limitations.length > 0 && <details><summary>Ограничения анализа</summary><ul>{limitations.map((item, index) => <li key={index}>{item}</li>)}</ul></details>}
      {result.error?.code && <p>Код ошибки: {result.error.code}</p>}
      <button type="button" className="analysis-json-download" onClick={download}>Скачать JSON</button>
      <details><summary>Полный JSON</summary><pre className="analysis-result-json">{JSON.stringify(result, null, 2)}</pre></details>
    </details></>}
  </section>;
}
