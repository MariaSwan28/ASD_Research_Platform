import React from 'react';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import AnalysisArtifact from './AnalysisArtifact';
import {$api} from '../../../../http';
jest.mock('../../../../http',()=>({$api:{get:jest.fn()}}));
afterEach(()=>jest.clearAllMocks());
test('artifact fetch is bound to the selected run and releases its blob',async()=>{
 URL.createObjectURL=jest.fn(()=> 'blob:video');URL.revokeObjectURL=jest.fn();
 $api.get.mockResolvedValue({data:new Blob(['video'])});
 const {unmount}=render(<AnalysisArtifact analysisId="run-2" artifact={{id:'processed-video',label:'Обработанное видео',media_type:'video/mp4'}}/>);
 fireEvent.click(screen.getByRole('button',{name:'Обработанное видео'}));
 await waitFor(()=>expect($api.get).toHaveBeenCalledWith('api/ml/analyses/run-2/artifacts/processed-video',{responseType:'blob'}));
 await waitFor(()=>expect(document.querySelector('video').getAttribute('src')).toBe('blob:video'));
 unmount();expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:video');
});
test('missing artifact shows an error without fabricating a download',async()=>{
 $api.get.mockRejectedValue(new Error('missing'));
 render(<AnalysisArtifact analysisId="run-3" artifact={{id:'features',label:'Характеристики',media_type:'application/json'}}/>);
 fireEvent.click(screen.getByRole('button',{name:'Характеристики'}));
 await screen.findByRole('status');expect(screen.getByRole('status').textContent).toContain('Не удалось');
});
