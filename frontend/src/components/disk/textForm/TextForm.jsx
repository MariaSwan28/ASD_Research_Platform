import { useEffect, useRef, useState } from 'react';
import './textForm.css';

// SpeechRecognition is optional and provided by the browser. No audio is sent
// to the ASD backend; recognition may be performed by the browser vendor.
const TextForm = ({ onClose, onCreate }) => {
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [listening, setListening] = useState(false);
  const [speechError, setSpeechError] = useState('');
  const recognizer = useRef(null);
  const SpeechAPI = typeof window === 'undefined' ? null :
    (window.SpeechRecognition || window.webkitSpeechRecognition);

  const stopDictation = () => {
    const instance = recognizer.current;
    recognizer.current = null;
    setListening(false);
    if (instance) {
      instance.onend = null;
      instance.onresult = null;
      instance.onerror = null;
      try { instance.abort(); } catch (_) { /* may already have stopped */ }
    }
  };

  useEffect(() => () => {
    const instance = recognizer.current;
    if (instance) {
      instance.onend = null;
      instance.onresult = null;
      instance.onerror = null;
      try { instance.abort(); } catch (_) { /* already stopped */ }
    }
  }, []);

  const startDictation = () => {
    if (!SpeechAPI) return;
    if (listening) { stopDictation(); return; }
    setSpeechError('');
    try {
      const instance = new SpeechAPI();
      instance.lang = 'ru-RU';
      instance.continuous = true;
      instance.interimResults = false;
      instance.onresult = event => {
        const phrases = [];
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          if (event.results[i].isFinal) phrases.push(event.results[i][0].transcript.trim());
        }
        if (phrases.length) setContent(previous => [previous.trim(), ...phrases].filter(Boolean).join(' '));
      };
      instance.onerror = event => {
        setListening(false);
        recognizer.current = null;
        setSpeechError(event.error === 'not-allowed'
          ? 'Доступ к микрофону запрещён. Разрешите его в настройках браузера.'
          : `Не удалось распознать речь (${event.error}). Можно продолжить ввод с клавиатуры.`);
      };
      instance.onend = () => { setListening(false); recognizer.current = null; };
      recognizer.current = instance;
      instance.start();
      setListening(true);
    } catch (_) {
      recognizer.current = null;
      setListening(false);
      setSpeechError('Голосовой ввод не запустился. Попробуйте другой браузер или используйте клавиатуру.');
    }
  };

  const close = () => { stopDictation(); onClose(); };
  const save = () => {
    if (!name.trim() || !content.trim()) return;
    stopDictation();
    onCreate(name.trim(), content.trim());
  };

  return (
    <div className="text-form" role="presentation">
      <div className="text-form__background" onClick={close} />
      <section className="text-form__form" role="dialog" aria-modal="true" aria-label="Создать рассказ о ребёнке">
        <button type="button" className="text-form__button-close" onClick={close} aria-label="Закрыть">✕</button>
        <div className="text-form__container">
          <span className="text-form__eyebrow">НАБЛЮДЕНИЯ РОДИТЕЛЯ</span>
          <h3 className="text-form-header">Рассказ о ребёнке</h3>
          <p className="text-form__hint">Напишите рассказ или продиктуйте его голосом, затем проверьте текст перед сохранением.</p>
          <div className="text-form__name">
            <label htmlFor="story-name">Название документа</label>
            <input id="story-name" type="text" maxLength={120} value={name} onChange={e => setName(e.target.value)} placeholder="Например, Наблюдение за игрой" />
          </div>
          <div className="text-form__content">
            <div className="text-form__content-header">
              <label htmlFor="story-content">Текст рассказа</label>
              <button type="button" className={`text-form__mic ${listening ? 'text-form__mic--active' : ''}`}
                disabled={!SpeechAPI} onClick={startDictation} aria-pressed={listening}>
                {listening ? '■ Остановить запись' : '🎙 Диктовать'}
              </button>
            </div>
            <textarea id="story-content" rows={8} maxLength={20000} value={content} onChange={e => setContent(e.target.value)}
              placeholder="Опишите наблюдения своими словами…" />
            <div className="text-form__counter">{content.length} / 20 000 символов</div>
          </div>
          {!SpeechAPI && <p className="text-form__speech-note">Голосовой ввод не поддерживается этим браузером. Можно использовать клавиатуру.</p>}
          {SpeechAPI && <p className="text-form__speech-note">При голосовом вводе браузер может передавать аудио своему поставщику распознавания. Не диктуйте персональные данные ребёнка без необходимости. Аудиозапись в приложении не сохраняется.</p>}
          {listening && <p className="text-form__listening" role="status">● Микрофон включён. Говорите, затем нажмите «Остановить запись».</p>}
          {speechError && <p className="text-form__speech-error" role="alert">{speechError}</p>}
          <div className="text-form__actions">
            <button type="button" className="text-form__cancel" onClick={close}>Отмена</button>
            <button type="button" className="text-form__button-create" onClick={save} disabled={!name.trim() || !content.trim()}>Сохранить рассказ</button>
          </div>
        </div>
      </section>
    </div>
  );
};

export { TextForm };
