import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { getFiles, getLinks, uploadFile } from '../../actions/file';
import FileList from './fileList/FileList';
import './disk.css';
import Popup from './Popup';
import {
  setCurrentDir,
  setMaterialScope,
  //   setFileView,
  setPopupDisplay,
} from '../../reducers/fileReducer';
import Uploader from './uploader/Uploader';
import LinkList from './linkList/LinkList';
import { hideLinks } from '../../reducers/linksReducer';
import PopupLink from './PopupLink';
import PopupLinkChange from './PopupLinkChange';
import ProgressBar from './progressBar';
import { totalSpace } from '../../utils/sizeFormat';
import { auth } from '../../actions/user';
import { TextForm } from './textForm/TextForm';
import { TagsModal } from './TagsModal';
import ChildProfiles from './ChildProfiles';
import MLCapabilities from './MLCapabilities';

const Disk = () => {
  const dispatch = useDispatch();
  const isSpecialist = useSelector(state => state.user.currentUser.role) === 'specialist';
  const currentDir = useSelector((state) => state.files.currentDir);
  const loader = useSelector((state) => state.app.loader);
  const dirStack = useSelector((state) => state.files.dirStack);
  const [dragEnter, setDragEnter] = useState(false);
  const [sort, setSort] = useState('type');
  const [materialCategory, setMaterialCategory] = useState('');
  const [isTextForm, setIsTextForm] = useState(false);
  const isLinks = useSelector((state) => state.links.isLinks);
  const links = useSelector((state) => state.links.links);
  const isChange = useSelector((state) => state.links.isChange);
  const usedSpace = useSelector((state) => state.user.currentUser.usedSpace);

  const [files, setFiles] = useState(null);
  const [openTagsModal, setOpenTagsModal] = useState(false);
  const [selectedChildId, setSelectedChildId] = useState(null);

  useEffect(() => { dispatch(setMaterialScope(null)); }, [dispatch]);

  let isExistFreeSpace = null;
  const occupiedSpacePercent = (usedSpace / totalSpace) * 100;
  if (!isSpecialist && occupiedSpacePercent >= 100) {
    isExistFreeSpace = false;
  } else {
    isExistFreeSpace = true;
  }

  useEffect(() => {
    dispatch(auth());
    if (!isSpecialist || selectedChildId) dispatch(getFiles(currentDir, sort, selectedChildId));
    if (isLinks) {
      dispatch(getLinks(links));
    }
  }, [currentDir, sort, usedSpace, selectedChildId]);

  function showPopupHandler() {
    dispatch(setPopupDisplay('flex'));
  }

  function showPopupHandlerLinks() {
    dispatch(setPopupDisplay('flex'));
  }

  function backClickHandler() {
    if (currentDir !== null) {
      const backDirId = dirStack.pop();
      dispatch(setCurrentDir(backDirId));
    }
  }

  function backLinksClickHandler() {
    dispatch(hideLinks());
  }

  async function fileUploadHandler(files, tags) {
    try {
      console.log(files);
      let currentUsedSpace = usedSpace;
      dispatch(auth());
      for (const file of files) {
        currentUsedSpace += file.size;
        if (!isSpecialist && currentUsedSpace >= totalSpace) {
          setFiles(null);
          throw new Error('Не хватает памяти !');
        }
        await dispatch(uploadFile(file, currentDir, tags, selectedChildId));
      }
      setFiles(null);
      dispatch(getFiles(currentDir, sort, selectedChildId));
      dispatch(auth());
    } catch (e) {
      console.log('fileUploadHandler', e);
      alert('Не хватает памяти !');
    }
  }

  async function createAndUploadTextFileHandler(name, content, tags) {
    try {
      let currentUsedSpace = usedSpace;
      setIsTextForm(false);
      dispatch(auth());
      const blob = new Blob([content], { type: 'text/plain' });
      const file = new File([blob], `${name}.txt`, { type: 'text/plain' });
      currentUsedSpace += file.size;
      if (!isSpecialist && currentUsedSpace >= totalSpace) {
        throw new Error('Не хватает памяти !');
      }
      await dispatch(uploadFile(file, currentDir, tags, selectedChildId));
      dispatch(getFiles(currentDir, sort, selectedChildId));
      dispatch(auth());
    } catch (e) {
      console.log('createAndUploadTextFileHandler', e);
      alert('Не хватает места!!!');
    }
  }

  function dragEnterHandler(event) {
    dispatch(auth());
    event.preventDefault();
    event.stopPropagation();
    setDragEnter(true);
  }

  function dragLeaveHandler(event) {
    dispatch(auth());
    event.preventDefault();
    event.stopPropagation();
    setDragEnter(false);
  }

  function dropHandler(event) {
    dispatch(auth());
    event.preventDefault();
    event.stopPropagation();
    let files = [...event.dataTransfer.files];
    selectFiles(files);
    setDragEnter(false);
  }

  const isVideo = file => /\.(mp4|mov|webm)$/i.test(file.name);
  const selectFiles = selectedFiles => {
    if (isSpecialist && !selectedChildId) return;
    const videoFiles = isSpecialist ? selectedFiles.filter(isVideo) : [];
    const immediate = isSpecialist ? selectedFiles.filter(file => !isVideo(file)) : selectedFiles;
    if (immediate.length) fileUploadHandler(immediate, []);
    if (videoFiles.length) { setFiles(videoFiles); setOpenTagsModal(true); }
  };
  const handleFileSelect = event => {
    selectFiles([...event.target.files]);
    event.target.value = '';
  };
  const handleWriteFileSelect = (name, content) => {
    if (name && content) createAndUploadTextFileHandler(name, content, []);
  };
  const handleSaveTags = selectedTags => {
    if (files?.length) fileUploadHandler(files, selectedTags);
    setOpenTagsModal(false);
  };
  const chooseChild = id => {
    setSelectedChildId(id); setFiles(null); setOpenTagsModal(false);
    dispatch(setMaterialScope(id));
  };

  const handleRefresh = () => {
    dispatch(auth());
    dispatch(getFiles(currentDir, sort, selectedChildId));
  };

  return isLinks ? (
    <div className="disk">
      <div className="disk__btns">
        {/* <svg
          onClick={() => backLinksClickHandler()}
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          width="32"
          height="32"
          className="back-icon"
        >
          <path
            id="first"
            d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9zm-1 13l-4-4 4-4v3h7v2h-7v3z"
          />
          <path id="second" d="M0 0h24v24H0z" fill="none" />
        </svg> */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          onClick={() => showPopupHandlerLinks()}
          viewBox="0 0 24 24"
          width="32"
          height="32"
          className="create-link-icon"
        >
          <path d="M12.11,15.39,8.23,19.27a2.47,2.47,0,0,1-3.5,0,2.46,2.46,0,0,1,0-3.5l3.88-3.88a1,1,0,1,0-1.42-1.42L3.31,14.36a4.48,4.48,0,0,0,6.33,6.33l3.89-3.88a1,1,0,0,0-1.42-1.42Zm-3.28-.22a1,1,0,0,0,.71.29,1,1,0,0,0,.71-.29l4.92-4.92a1,1,0,1,0-1.42-1.42L8.83,13.75A1,1,0,0,0,8.83,15.17ZM21,18H20V17a1,1,0,0,0-2,0v1H17a1,1,0,0,0,0,2h1v1a1,1,0,0,0,2,0V20h1a1,1,0,0,0,0-2Zm-4.19-4.47,3.88-3.89a4.48,4.48,0,0,0-6.33-6.33L10.47,7.19a1,1,0,1,0,1.42,1.42l3.88-3.88a2.47,2.47,0,0,1,3.5,0,2.46,2.46,0,0,1,0,3.5l-3.88,3.88a1,1,0,0,0,0,1.42,1,1,0,0,0,1.42,0Z" />
        </svg>
      </div>
      <LinkList />
      {isChange ? <PopupLinkChange /> : <PopupLink />}
    </div>
  ) : !dragEnter ? (
    <div className="disk" onDragEnter={dragEnterHandler} onDragLeave={dragLeaveHandler} onDragOver={dragEnterHandler}>
      <div className="disk__intro">
        <span className="disk__eyebrow">{isSpecialist ? 'КАБИНЕТ СПЕЦИАЛИСТА' : 'ЛИЧНОЕ ПРОСТРАНСТВО'}</span>
        <h1>{isSpecialist ? 'Дети под наблюдением' : 'Мои материалы'}</h1>
        <p>{isSpecialist ? 'Выберите ребёнка для работы с материалами и результатами.' : 'Храните записи, видео, рисунки и документы в одном месте.'}</p>
      </div>
      {selectedChildId && <button type="button" className="disk__back-to-family" onClick={() => chooseChild(null)} >← {isSpecialist ? 'К списку детей' : 'Ко всем профилям и общим материалам'}</button>}
      <ChildProfiles selectedId={selectedChildId} onSelect={chooseChild} specialist={isSpecialist} />
      {(!isSpecialist || selectedChildId) && <>
      <MLCapabilities />
      <div className="disk__toolbar"><div className="disk__btns">
        {/* <svg
          onClick={() => backClickHandler()}
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          width="32"
          height="32"
          className="back-icon"
        >
          <path id="first" d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9zm-1 13l-4-4 4-4v3h7v2h-7v3z" />
          <path id="second" d="M0 0h24v24H0z" fill="none" />
        </svg> */}

        {/* <svg
          xmlns="http://www.w3.org/2000/svg"
          onClick={() => showPopupHandler()}
          viewBox="0 0 24 24"
          width="32"
          height="32"
          className="create-dir-icon"
        >
          <path
            id="primary"
            d="M7,18H4a1,1,0,0,1-1-1V4A1,1,0,0,1,4,3H9a1,1,0,0,1,.71.29l2.41,2.42a1,1,0,0,0,.71.29H20a1,1,0,0,1,1,1V9"
          />
          <path id="second" d="M16,21V13m-4,4h8" />
        </svg> */}
        {isExistFreeSpace && (
          <>
            <div className="disk__upload">
              <label htmlFor="disk__upload-input" className="disk__upload-label">
                Загрузить файл
              </label>
              <input multiple={true} onChange={handleFileSelect} type="file" id="disk__upload-input" className="disk__upload-input" />
            </div>
            <div className="disk__write-text">
              <button className="disk__write-text-label" onClick={() => setIsTextForm(true)}>
                Написать текст
              </button>
              {isTextForm && <TextForm onClose={() => setIsTextForm(false)} onCreate={(name, content) => handleWriteFileSelect(name, content)} />}
            </div>
            <TagsModal open={isSpecialist && openTagsModal} onClose={() => { setOpenTagsModal(false); setFiles(null); }} onSave={handleSaveTags} />
          </>
        )}
          {!isSpecialist && <ProgressBar totalSpace={totalSpace} usedSpace={usedSpace} />}
          
           <button className="disk__refresh-btn" onClick={handleRefresh} title="Обновить список файлов">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
            <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
            <path d="M0 0h24v24H0z" fill="none"/>
          </svg>
        </button>

        <select value={sort} onChange={(e) => setSort(e.target.value)} className="disk__select">
          <option className="disk__option" value="name">
            По имени
          </option>
          <option className="disk__option" value="type">
            По типу
          </option>
          <option className="disk__option" value="date">
            По дате
          </option>
        </select>
      </div>
      </div>
      <section className="disk__files-panel">
        <div className="disk__files-heading"><div><h2>Файлы и наблюдения</h2><p>{selectedChildId ? 'Материалы выбранного ребёнка' : 'Общие материалы без привязки к ребёнку'}</p></div>
          <select className="disk__select" aria-label="Тип материалов" value={materialCategory} onChange={event => setMaterialCategory(event.target.value)}>
            <option value="">Все материалы</option>
            {['Видео','Аудио','Текст','Изображение','Документ','Таблица','Данные','Архив','Файл'].map(category => <option key={category} value={category}>{category}</option>)}
          </select>
        </div>
        {loader ? <p role="status">Загрузка материалов…</p> : <FileList category={materialCategory} />}
      </section>
      </>}
      <Popup />
      <Uploader />
    </div>
  ) : (
    <div className="drop-area" onDrop={dropHandler} onDragEnter={dragEnterHandler} onDragLeave={dragLeaveHandler} onDragOver={dragEnterHandler}>
      Перетащите файлы сюда
    </div>
  );
};

export default Disk;
