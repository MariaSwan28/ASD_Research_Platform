import React, { useEffect, useRef, useState } from 'react';
import { $api } from '../../../../http';

export default function AnalysisArtifact({ analysisId, artifact }) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const objectUrl = useRef(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); }; }, []);
  async function open() {
    setLoading(true); setError('');
    try {
      const response = await $api.get(`api/ml/analyses/${encodeURIComponent(analysisId)}/artifacts/${encodeURIComponent(artifact.id)}`, { responseType: 'blob' });
      if (!mounted.current) return;
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      const next = URL.createObjectURL(response.data); objectUrl.current = next;
      if (artifact.media_type.startsWith('video/')) setUrl(next);
      else {
        const anchor = document.createElement('a'); anchor.href = next;
        anchor.download = artifact.id + (artifact.media_type === 'application/json' ? '.json' : artifact.media_type === 'application/octet-stream' ? '.npz' : '');
        document.body.appendChild(anchor); anchor.click(); anchor.remove();
      }
    } catch { if (mounted.current) setError('Не удалось открыть файл результата'); }
    finally { if (mounted.current) setLoading(false); }
  }
  return <div className="analysis-artifact">
    <button type="button" className="analysis-json-download" onClick={open} disabled={loading}>{loading ? 'Загружаем…' : artifact.label}</button>
    {url && <video controls preload="metadata" src={url} style={{ width: '100%', maxHeight: 400 }} />}
    {error && <p role="status">{error}</p>}
  </div>;
}
