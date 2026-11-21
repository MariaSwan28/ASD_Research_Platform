import React from 'react';
import {render,screen} from '@testing-library/react';
import {useSelector} from 'react-redux';
import FileList from './FileList';
jest.mock('react-redux',()=>({useSelector:jest.fn()}));
jest.mock('./file/File',()=>function MockFile({file}){return <div>{file.name}</div>});
test('category filter keeps folders navigable and handles file extensions',()=>{
 useSelector.mockImplementation(fn=>fn({files:{view:'plate',files:[{_id:'d',type:'dir',name:'Папка'},{_id:'t',type:'txt',name:'Рассказ.txt'},{_id:'a',type:'file',name:'Запись.WAV'}]}}));
 const {rerender}=render(<FileList category="Аудио"/>);
 expect(screen.getByText('Папка')).toBeTruthy();expect(screen.getByText('Запись.WAV')).toBeTruthy();expect(screen.queryByText('Рассказ.txt')).toBeNull();
 rerender(<FileList/>);expect(screen.getByText('Рассказ.txt')).toBeTruthy();
});
