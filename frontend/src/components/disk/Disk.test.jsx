import React from 'react';
import {render,screen,fireEvent} from '@testing-library/react';
import {useDispatch,useSelector} from 'react-redux';
import Disk from './Disk';
import {uploadFile} from '../../actions/file';
jest.mock('react-redux',()=>({useDispatch:jest.fn(),useSelector:jest.fn()}));
jest.mock('../../actions/user',()=>({auth:()=>({type:'AUTH'})}));
jest.mock('../../actions/file',()=>({getFiles:()=>({type:'GET'}),getLinks:()=>({type:'LINKS'}),uploadFile:jest.fn(()=>({type:'UPLOAD'}))}));
jest.mock('./ChildProfiles',()=>props=><button onClick={()=>props.onSelect('child-1')}>Выбрать ребёнка</button>);
jest.mock('./MLCapabilities',()=>()=>null);
jest.mock('./fileList/FileList',()=>()=>null);
jest.mock('./Popup',()=>()=>null);
jest.mock('./PopupLink',()=>()=>null);
jest.mock('./PopupLinkChange',()=>()=>null);
jest.mock('./linkList/LinkList',()=>()=>null);
jest.mock('./uploader/Uploader',()=>()=>null);
jest.mock('./TagsModal',()=>({TagsModal:props=>props.open?<div role="dialog" aria-label="Теги"><button onClick={()=>props.onSave(['Удары'])}>Сохранить теги</button></div>:null}));
function mount(role){
 const state={user:{currentUser:{role,usedSpace:0}},files:{currentDir:null,dirStack:[]},app:{loader:false},links:{isLinks:false}};
 useSelector.mockImplementation(fn=>fn(state));useDispatch.mockReturnValue(jest.fn());return render(<Disk/>);
}
afterEach(()=>jest.clearAllMocks());
test('parent uploads directly and saves a story without a tags dialog',()=>{
 mount('parent');const file=new File(['sound'],'sound.wav');fireEvent.change(document.getElementById('disk__upload-input'),{target:{files:[file]}});
 expect(uploadFile).toHaveBeenCalledWith(file,null,[],null);expect(screen.queryByRole('dialog',{name:'Теги'})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Написать текст'}));fireEvent.change(screen.getByLabelText('Название документа'),{target:{value:'Рассказ'}});fireEvent.change(screen.getByLabelText('Текст рассказа'),{target:{value:'Наблюдение'}});fireEvent.click(screen.getByRole('button',{name:'Сохранить рассказ'}));
 expect(screen.queryByRole('dialog')).toBeNull();expect(uploadFile.mock.calls[1][0].name).toBe('Рассказ.txt');expect(uploadFile.mock.calls[1][2]).toEqual([]);
});
test('specialist mixed selection uploads audio immediately and tags only video in selected child',()=>{
 mount('specialist');expect(document.getElementById('disk__upload-input')).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Выбрать ребёнка'}));
 const audio=new File(['a'],'sound.wav'),video=new File(['v'],'clip.mp4');fireEvent.change(document.getElementById('disk__upload-input'),{target:{files:[audio,video]}});
 expect(uploadFile).toHaveBeenCalledWith(audio,null,[],'child-1');expect(uploadFile).not.toHaveBeenCalledWith(video,expect.anything(),expect.anything(),expect.anything());
 fireEvent.click(screen.getByRole('button',{name:'Сохранить теги'}));expect(uploadFile).toHaveBeenCalledWith(video,null,['Удары'],'child-1');
});
