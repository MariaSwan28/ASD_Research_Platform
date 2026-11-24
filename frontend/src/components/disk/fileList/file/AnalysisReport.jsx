import React, { useState } from 'react';
import AnalysisArtifact from './AnalysisArtifact';

function Value({ value, unit }) {
  if (unit && (value === null || value === undefined || value === '')) return <>—</>;
  if (value === null || value === undefined) return <>Нет данных</>;
  if (typeof value === 'boolean') return <>{value ? 'Да' : 'Нет'}</>;
  if (typeof value === 'number') return <>{new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)}</>;
  return <>{String(value)}</>;
}
function ReportTable({ rows, columns }) {
  const [count, setCount] = useState(40);
  return <>{!rows.length ? <p>Нет записей</p> : <div className="analysis-table-scroll"><table className="analysis-parameter-table"><thead><tr>{columns.map(column => <th scope="col" key={column.key}>{column.label}{column.unit ? ` (${column.unit})` : ''}</th>)}</tr></thead><tbody>{rows.slice(0,count).map((row,index) => <tr key={index}>{columns.map(column => <td key={column.key}><Value value={row[column.key]} unit={column.key === 'unit'} /></td>)}</tr>)}</tbody></table></div>}
    {count < rows.length && <button type="button" className="analysis-more" onClick={() => setCount(count + 40)}>Показать ещё ({rows.length - count})</button>}
  </>;
}
export default function AnalysisReport({ report, artifacts = [], analysisId, technical = false }) {
  if (report?.schema?.version !== '1.0' || !Array.isArray(report?.schema?.blocks) || !Array.isArray(report?.blocks)) return <p role="alert">Структура отчёта недоступна.</p>;
  const definitions = report.schema.blocks.filter(block => technical ? block.type === 'file' : block.type !== 'file');
  if (!definitions.length) return null;
  const values = new Map(report.blocks.map(block => [block.id, block]));
  const files = new Map(artifacts.map(artifact => [artifact.id, artifact]));
  return <div className="analysis-report-blocks" aria-label={technical ? 'Файлы технических данных' : 'Отчёт модели'}>{definitions.map(definition => {
    const block = values.get(definition.id);
    const unavailable = !block || block.status !== 'ready';
    return <section className={`analysis-report-block ${unavailable ? 'analysis-report-block--unavailable' : ''}`} key={`${analysisId}-${definition.id}`} aria-label={definition.title}>
      <h4>{definition.title}</h4>
      {definition.description && <p className="analysis-parameter-description">{definition.description}</p>}
      {unavailable ? <p>{definition.required && <strong>Обязательный блок не получен. </strong>}{block?.message || 'Этот блок не сформирован'}</p> : definition.type === 'text' ? <p className="analysis-report-text">{block.data}</p> : definition.type === 'table' ? <ReportTable rows={block.data} columns={definition.columns} /> : files.has(block.artifact_id) ? <AnalysisArtifact analysisId={analysisId} artifact={{ ...files.get(block.artifact_id), label: definition.title }} autoLoad={definition.type === 'image'} downloadOnly={definition.type === 'file'} buttonLabel={definition.type === 'video' ? 'Открыть видео' : definition.type === 'audio' ? 'Прослушать запись' : 'Скачать файл'} /> : <p>Файл результата недоступен</p>}
    </section>;
  })}</div>;
}
