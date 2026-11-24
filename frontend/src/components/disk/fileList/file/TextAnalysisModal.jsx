import React, { useEffect, useState } from 'react';
import { $api } from '../../../../http';
import './textAnalysis.css';
import AnalysisResultDetails from './AnalysisResultDetails';

// The model list is supplied by the ML registry, not hard-coded in React.
export default function TextAnalysisModal({ file, onClose, onCompleted, onRunningChange }) {
  const [models, setModels] = useState([]);
  const [selected, setSelected] = useState('');
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [message, setMessage] = useState('');
  const [result, setResult] = useState(null);
  const [historyId, setHistoryId] = useState('');
  const [progress, setProgress] = useState(null);

  useEffect(() => {
    let active = true;
    setChecking(true);
    $api.get(`api/ml/available/${file._id}`)
      .then(({data}) => {
        if (!active) return;
        const found = Array.isArray(data.models) ? data.models : [];
        setModels(found);
        const ready = found.find(model => model.status === 'configured');
        setSelected(previous => previous || ready?.id || found[0]?.id || '');
      })
      .catch(() => { if (active) setMessage('Не удалось получить список моделей'); })
      .finally(() => { if (active) setChecking(false); });
    $api.get(`api/ml/analyses/${file._id}`)
      .then(({data}) => { if (active) { const items = Array.isArray(data) ? data : []; setHistory(items); if (items.length) setSelected(items[0].modelId); } })
      .catch(() => { if (active) setMessage('Не удалось загрузить историю анализов'); });
    return () => { active = false; };
  }, [file._id]);

  useEffect(() => {
    if (!selected && history.length > 0) setSelected(history[0].modelId);
  }, [selected, history]);

  useEffect(() => {
    if (!loading) return undefined;
    let active = true;
    const timer = setInterval(() => {
      $api.get('api/ml/status-analyze').then(({ data }) => {
        if (active && data.current_file_id === file._id && data.is_analyzing) setProgress(data.progress);
      }).catch(() => {});
    }, 2000);
    return () => { active = false; clearInterval(timer); };
  }, [loading, file._id]);

  async function analyze() {
    setLoading(true);
    setMessage('');
    setHistoryId('');
    setProgress(null);
    onRunningChange?.(true);
    try {
      const { data } = await $api.post('api/ml/analyze', { fileId: file._id, modelId: selected }, { timeout: 1210000 });
      setResult(data);
      setHistory(prev => [{ id: data.analysis_id || data.analysisId, date: data.execution?.finished_at || new Date().toISOString(), modelId: selected, result: data }, ...prev]);
      onCompleted?.(data);
    } catch (err) {
      const failed = err.response?.data;
      if (['1.0', '1.1', '1.2', '1.3'].includes(failed?.schema_version)) {
        setResult(failed);
        setHistory(prev => [{ id: failed.analysis_id, date: failed.execution?.finished_at, modelId: selected, result: failed }, ...prev]);
      }
      if (failed?.schema_version) onCompleted?.(failed);
      setMessage(['1.0', '1.1', '1.2', '1.3'].includes(failed?.schema_version) ? '' : failed?.message || failed?.error?.message || 'Не удалось выполнить анализ');
    } finally { setLoading(false); onRunningChange?.(false); }
  }

  const historicalModels = [...new Map(history.filter(item => !models.some(model => model.id === item.modelId))
    .map(item => [item.modelId, { id: item.modelId, label: item.modelId, status: 'unavailable', reason: 'Модель доступна только в истории' }])).values()];
  const displayedModels = [...models, ...historicalModels];
  const model = displayedModels.find(item => item.id === selected);
  const currentHistory = history.filter(item => item.modelId === selected);
  const selectedHistory = currentHistory.find(item => item.id === historyId);
  const latest = selectedHistory?.result || (result && (result.model?.id || result.model_id) === selected ? result : currentHistory[0]?.result);
  return (
    <div className="text-analysis-overlay" onMouseDown={e => { if (!loading && e.target === e.currentTarget) onClose(); }} role="presentation">
      <section className="text-analysis-dialog" role="dialog" aria-modal="true" aria-label="Анализ материала">
        <div className="text-analysis-heading">
          <div><h2>{latest ? 'Результат анализа' : 'Анализ материала'}</h2><p>{file.name}</p></div>
          <button type="button" onClick={onClose} disabled={loading} aria-label="Закрыть">✕</button>
        </div>
        {latest && <AnalysisResultDetails result={latest} modelId={selected} version={latest.model?.version || latest.model_version || currentHistory[0]?.modelVersion} date={selectedHistory?.date || currentHistory[0]?.date} />}
        {checking ? <p>Проверяем доступные модели…</p> : displayedModels.length ? (
          <>
            {displayedModels.length > 1 && <>
            <label className="text-analysis-model-label" htmlFor="analysis-model">Модель</label>
            <select id="analysis-model" className="text-analysis-model-select" value={selected} disabled={loading}
              onChange={e => { setSelected(e.target.value); setResult(null); setHistoryId(''); }}>
              {displayedModels.map(item => <option key={item.id} value={item.id}>
                {item.label || item.id}{item.status !== 'configured' ? ' — недоступна' : ''}
              </option>)}
            </select></>}
            {!latest && displayedModels.length === 1 && <p>{model?.label}</p>}
            {model?.status !== 'configured' && <p className="text-analysis-error">Анализ сейчас недоступен. Попробуйте позже.</p>}
            <button type="button" className="text-analysis-run" disabled={loading || model?.status !== 'configured'} onClick={analyze}>
              {loading ? `Анализируем…${progress === null ? '' : ` ${progress}%`}` : currentHistory.length ? 'Повторить анализ' : 'Запустить анализ'}
            </button>
          </>
        ) : <p>Для этого формата анализ недоступен.</p>}
        {message && <p className="text-analysis-error" role="alert">{message}</p>}
        {currentHistory.length > 1 && <label className="text-analysis-model-label">История запусков
          <select className="text-analysis-model-select" value={historyId} disabled={loading} onChange={e => setHistoryId(e.target.value)}>
            <option value="">Последний запуск</option>
            {currentHistory.map(item => <option key={item.id} value={item.id}>{new Date(item.date).toLocaleString('ru-RU')} — {(item.status || item.result?.status) === 'failed' ? 'Ошибка' : (item.status || item.result?.status) === 'partial' ? 'Частично' : 'Завершён'}</option>)}
          </select>
        </label>}
      </section>
    </div>
  );
}
