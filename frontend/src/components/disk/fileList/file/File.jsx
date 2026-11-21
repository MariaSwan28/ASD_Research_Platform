import React, { useState } from 'react';
import './file.css';
import { useSelector, useDispatch } from 'react-redux';
import { pushToStack, setCurrentDir } from '../../../../reducers/fileReducer';
import { deleteFile, downloadFile } from '../../../../actions/file';
import sizeFormat from '../../../../utils/sizeFormat';
import { getFileType } from '../../../../utils/fileType';
import { auth } from '../../../../actions/user';
import { VideoPlayerModal } from './VideoPlayerModal';
import TextAnalysisModal from './TextAnalysisModal';

export default function File({ file }) {
  const dispatch = useDispatch();
  const userId = useSelector(state => state.user.currentUser.id);
  const currentDir = useSelector(state => state.files.currentDir);
  const fileView = useSelector(state => state.files.view);
  const token = useSelector(state => state.user.token);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [showPlayer, setShowPlayer] = useState(false);
  const [running, setRunning] = useState(false);
  const [latestStatus, setLatestStatus] = useState(null);
  const [processedVideo, setProcessedVideo] = useState(false);
  const info = getFileType(file);
  const status = latestStatus || file.latestAnalysisStatus;
  const hasSavedResult = Boolean(status || file.hasSavedAnalysis);
  const label = running ? 'Анализируется…' : status === 'failed' ? 'Ошибка анализа' : hasSavedResult ? 'Результат' : 'Анализировать';
  const plate = fileView === 'plate';
  const open = () => {
    if (file.type === 'dir') {
      dispatch(auth()); dispatch(pushToStack(currentDir)); dispatch(setCurrentDir(file._id));
    } else if (info.category === 'Видео' && (file.hasAnalysis || processedVideo)) setShowPlayer(true);
  };
  const stop = action => event => { event.stopPropagation(); action(); };
  const completed = result => {
    setLatestStatus(result.status);
    if (['completed', 'partial'].includes(result.status) && result.model?.operation === 'movement-analysis') setProcessedVideo(true);
  };
  const actions = <>
    {file.type !== 'dir' && <>
      <button type="button" className="file__btn file__open" disabled={running} onClick={stop(() => setShowAnalysis(true))}>{label}</button>
      <button type="button" className="file__btn file__download" onClick={stop(() => downloadFile(file))}>Скачать</button>
    </>}
    <button type="button" className="file__btn file__delete" disabled={running} onClick={stop(() => { dispatch(auth()); dispatch(deleteFile(file, userId)); })}>Удалить</button>
  </>;
  return <>
    <div className={plate ? 'file-plate' : 'file'} onClick={open}>
      <div className={`file__type-icon file__type-icon--${info.tone}`} aria-hidden="true">{info.icon}</div>
      <div className={plate ? 'file-plate__name' : 'file__details'}>
        <div className="file__name" title={file.name}>{file.name}</div>
        <div className="file__type-label">{info.label}</div>
        {info.category === 'Видео' && (file.hasAnalysis || processedVideo) && <button type="button" className="file__video-link" onClick={stop(() => setShowPlayer(true))}>Последнее обработанное видео</button>}
      </div>
      {!plate && <><div className="file__date">{file.date?.slice(0, 10) || '—'}</div><div className="file__size">{file.type === 'dir' ? '—' : sizeFormat(file.size)}</div></>}
      <div className={plate ? 'file-plate__btns' : 'file__actions'}>{actions}</div>
    </div>
    {showAnalysis && <TextAnalysisModal file={file} onClose={() => setShowAnalysis(false)} onCompleted={completed} onRunningChange={setRunning} />}
    {showPlayer && <VideoPlayerModal file={file} token={token} userId={userId} onClose={() => setShowPlayer(false)} />}
  </>;
}
