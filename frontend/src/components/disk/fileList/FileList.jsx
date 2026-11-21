import { getFileType } from '../../../utils/fileType';
import React from 'react';
import './fileList.css';
import { useSelector } from 'react-redux';
import File from './file/File';
import { CSSTransition, TransitionGroup } from 'react-transition-group';

const FileList = ({ category = '' }) => {
  const stored = useSelector((state) => state.files.files);
  const files = stored.filter(file => !category || file.type === 'dir' || getFileType(file).category === category);
  const fileView = useSelector((state) => state.files.view);
  if (files.length === 0) {
    return <div className="files-empty"><div className="files-empty__icon">▧</div><h3>{category ? 'Нет материалов выбранного типа' : 'Здесь пока нет материалов'}</h3><p>Загрузите первый файл или создайте текстовое наблюдение.</p></div>;
  }

  if (fileView === 'plate') {
    return (
      <div className="fileplate">
        {files.map((file) => (
          <File key={file._id} file={file} />
        ))}
      </div>
    );
  }

  if (fileView === 'list') {
    return (
      <div className="filelist">
        <div className="filelist__header">
          <div className="filelist__name">Название и формат</div>
          <div className="filelist__date">Дата</div>
          <div className="filelist__size">Размер</div>
          <div className="filelist__actions">Действия</div>
        </div>
        <TransitionGroup>
          {files.map((file) => (
            <CSSTransition key={file._id} timeout={500} classNames={'file'} exit={false}>
              <File file={file} />
            </CSSTransition>
          ))}
        </TransitionGroup>
      </div>
    );
  }
};

export default FileList;
