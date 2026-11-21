import React, { useEffect, useRef, useState } from 'react';
import './VideoPlayerModal.css';
import { API_URL } from '../../../../config';
export const VideoPlayerModal = ({ file,userId, token, onClose }) => {
  const [videoUrl, setVideoUrl] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const videoRef = useRef(null);

  useEffect(() => {
    let disposed = false;
    let objectUrl = null;
    const streamUrl = `${API_URL}/api/video/stream/${file._id}/${userId}`;
    setIsLoading(true);
    setError(null);
    // Приватный маршрут требует JWT. Для прототипа скачиваем видео в Blob.
    // Для очень больших видео позднее потребуется защищённый Range-streaming.
    fetch(streamUrl, { headers: { Authorization: `Bearer ${token || localStorage.getItem('token')}` } })
      .then(async response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.blob();
      })
      .then(blob => {
        if (disposed) return;
        objectUrl = URL.createObjectURL(blob);
        setVideoUrl(objectUrl);
        setIsLoading(false);
      })
      .catch(e => { if (!disposed) { setError(e.message); setIsLoading(false); } });
    const handleEsc = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => {
      disposed = true;
      window.removeEventListener('keydown', handleEsc);
      if (videoRef.current) videoRef.current.pause();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file._id, userId, token, onClose]);

  // Обработчик клика по фону
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="video-modal-overlay" onClick={handleBackdropClick}>
      <div className="video-modal-container">
        <div className="video-modal-header">
          <h3 className="video-modal-title">{file.name}</h3>
          <button className="video-modal-close" onClick={onClose}>×</button>
        </div>
        
        <div className="video-modal-body">
          {isLoading ? (
            <div className="video-loading">
              <div className="spinner"></div>
              <p>Загрузка видео...</p>
            </div>
          ) : error ? (
            <div className="video-error">
              <p>Ошибка загрузки видео: {error}</p>
              <button onClick={() => window.location.reload()}>Повторить</button>
            </div>
          ) : (
            <video
              ref={videoRef}
              className="video-player"
              controls
              autoPlay
              preload="metadata"
              controlsList="nodownload"
            >
              <source src={videoUrl} type="video/mp4" />
              <source src={videoUrl} type="video/webm" />
              <source src={videoUrl} type="video/quicktime" />
              Ваш браузер не поддерживает видео тег.
            </video>
          )}
        </div>
        
        <div className="video-modal-footer">
          <div className="video-info">
            <span>Размер: {(file.size / (1024 * 1024)).toFixed(2)} MB</span>
            <span>Тип: {file.type || 'video'}</span>
          </div>
          <button className="video-download-btn" onClick={() => {
            if (!videoUrl) return;
            const link = document.createElement('a');
            link.href = videoUrl; link.download = `${file.name || 'analysis'}.mp4`;
            document.body.appendChild(link); link.click(); link.remove();
          }}>
            Скачать видео
          </button>
        </div>
      </div>
    </div>
  );
};