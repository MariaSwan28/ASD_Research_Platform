import React, { useCallback, useEffect, useRef, useState } from 'react';
import { $api } from '../../../../http';

const extensions = { 'application/json': '.json', 'application/octet-stream': '.npz', 'text/csv': '.csv', 'text/plain': '.txt', 'application/pdf': '.pdf', 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'audio/wav': '.wav', 'audio/mpeg': '.mp3', 'video/mp4': '.mp4' };
export default function AnalysisArtifact({ analysisId, artifact, autoLoad = false, buttonLabel, downloadOnly = false }) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(true);
  const generation = useRef(0);
  const objectUrl = useRef(null);
  const mediaType = artifact.media_type;
  const preview = downloadOnly ? 'file' : ['image/png','image/jpeg','image/webp'].includes(mediaType) ? 'image' : mediaType.startsWith('video/') ? 'video' : mediaType.startsWith('audio/') ? 'audio' : 'file';
  const open = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true); setError('');
    try {
      const response = await $api.get(`api/ml/analyses/${encodeURIComponent(analysisId)}/artifacts/${encodeURIComponent(artifact.id)}`, { responseType: 'blob' });
      if (!active.current || request !== generation.current) return;
      const actualType = response.data?.type?.split(';')[0];
      if (actualType && actualType !== mediaType) throw new Error('media_type_mismatch');
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      const next = URL.createObjectURL(new Blob([response.data], { type: mediaType })); objectUrl.current = next;
      if (preview !== 'file') setUrl(next);
      else {
        const anchor = document.createElement('a'); anchor.href = next;
        anchor.download = artifact.id + (extensions[mediaType] || '');
        document.body.appendChild(anchor); anchor.click(); anchor.remove();
      }
    } catch { if (active.current && request === generation.current) setError('Не удалось открыть файл результата'); }
    finally { if (active.current && request === generation.current) setLoading(false); }
  }, [analysisId, artifact.id, mediaType, preview]);
  useEffect(() => {
    active.current = true; setUrl(''); setError('');
    if (autoLoad) open();
    return () => { active.current = false; generation.current++; if (objectUrl.current) { URL.revokeObjectURL(objectUrl.current); objectUrl.current = null; } };
  }, [open, autoLoad]);
  return <div className="analysis-artifact">
    {(!autoLoad && !url || error) && <button type="button" className="analysis-json-download" onClick={open} disabled={loading}>{loading ? 'Загружаем…' : error ? 'Повторить загрузку' : buttonLabel || artifact.label}</button>}
    {autoLoad && loading && <p role="status">Загружаем изображение…</p>}
    {url && preview === 'image' && <img src={url} alt={artifact.label} className="analysis-report-image" />}
    {url && preview === 'video' && <video controls preload="metadata" src={url} aria-label={artifact.label} style={{ width: '100%', maxHeight: 460 }} />}
    {url && preview === 'audio' && <audio controls preload="metadata" src={url} aria-label={artifact.label} style={{ width: '100%' }} />}
    {error && <p role="status">{error}</p>}
  </div>;
}
