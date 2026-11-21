import React, { useCallback, useEffect, useState } from 'react';
import { $api } from '../../http';

const descriptions = {
  'movement-pose-v1': 'Анализ движений на видео',
  'parent-story-nb': 'Анализ рассказа родителя'
};
const fallbackModels = [
  { id: 'movement-pose-v1', modality: 'video', status: 'unavailable' },
  { id: 'parent-story-nb', modality: 'text', status: 'unavailable' }
];

export default function MLCapabilities() {
  const [models, setModels] = useState(fallbackModels);
  const [loading, setLoading] = useState(true);
  const [serviceAvailable, setServiceAvailable] = useState(null);
  const [error, setError] = useState('');

  const refresh = useCallback(async (signal) => {
    setLoading(true);
    setError('');
    try {
      const response = await $api.get('api/ml/capabilities', { signal, timeout: 11000 });
      if (signal && signal.aborted) return;
      const data = response.data || {};
      setModels(Array.isArray(data.models) && data.models.length ? data.models : fallbackModels);
      setServiceAvailable(data.serviceAvailable !== false);
    } catch (err) {
      if (signal && signal.aborted) return;
      setModels(fallbackModels);
      setServiceAvailable(false);
      setError('Анализ сейчас недоступен.');
    } finally {
      if (!signal || !signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  return (
    <section className="ml-capabilities" aria-label="Доступные модели">
      <div className="ml-capabilities__heading">
        <h2>Возможности анализа</h2>
        <button type="button" className="ml-capabilities__refresh" disabled={loading} onClick={() => refresh()}>
          {loading ? 'Проверяем…' : 'Проверить снова'}
        </button>
      </div>
      {serviceAvailable === false && (
        <p className="ml-capabilities__notice" role="status">
          {error || 'Анализ сейчас недоступен. Попробуйте позже.'}
        </p>
      )}
      {models.map(model => (
        <div className="ml-capability" key={model.id}>
          <span>{model.label || descriptions[model.id] || model.id}</span>
          <small>{serviceAvailable === true && model.status === 'configured'
            ? 'Доступен'
            : 'Недоступен'}
          </small>
        </div>
      ))}
    </section>
  );
}
