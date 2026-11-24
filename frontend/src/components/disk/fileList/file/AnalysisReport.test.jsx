import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AnalysisResultDetails from './AnalysisResultDetails';
import { $api } from '../../../../http';
jest.mock('../../../../http', () => ({ $api: { get: jest.fn() } }));
beforeEach(() => { let count = 0; URL.createObjectURL = jest.fn(() => `blob:report-${++count}`); URL.revokeObjectURL = jest.fn(); });
afterEach(() => jest.clearAllMocks());
const definitions = [
 { id:'conclusion',type:'text',title:'Итог анализа',required:true },
 ...[1,2,3].map(i=>({id:`image-${i}`,type:'image',title:`График ${i}`,required:true})),
 { id:'rows',type:'table',title:'Фрагменты рассказа',required:true,columns:[{key:'text',label:'Фрагмент'},{key:'category',label:'Категория'}] }
];
const fixture = () => ({schema_version:'1.3',analysis_id:'run-1',status:'completed',model:{id:'text',name:'Анализ рассказа',version:'1'},
 conclusion:{title:'Рассказ отнесён к категории «без РАС»',explanation:'Оценка относится к тексту рассказа и не исключает РАС у ребёнка.'},
 metrics:[],parameters:[],limitations:[],warnings:[],error:null,raw_output:{future:[0,false,null]},
 artifacts:[1,2,3].map(i=>({id:`plot-${i}`,label:`График ${i}`,media_type:'image/png'})),
 report:{schema:{version:'1.0',blocks:definitions},blocks:[{id:'conclusion',status:'ready',data:'Рассказ отнесён к категории «без РАС»\nОценка относится к тексту рассказа и не исключает РАС у ребёнка.'}, ...[1,2,3].map(i=>({id:`image-${i}`,status:'ready',artifact_id:`plot-${i}`})),{id:'rows',status:'ready',data:[{text:'Фрагмент текста',category:'Без РАС'}]}]}
});
test('universal report follows model layout and renders three images, text and a table', async () => {
 $api.get.mockResolvedValue({data:new Blob(['PNG'],{type:'image/png'})});
 render(<AnalysisResultDetails result={fixture()} />);
 await screen.findAllByRole('img');
 await waitFor(()=>expect(screen.getAllByRole('img')).toHaveLength(3));
 expect(screen.getByLabelText('Итог анализа').textContent).toContain('Рассказ отнесён к категории «без РАС»');
 expect(screen.getByText('Фрагмент текста')).toBeTruthy();
 expect(screen.getAllByRole('heading',{level:4}).map(x=>x.textContent)).toEqual(definitions.map(x=>x.title));
 expect($api.get).toHaveBeenCalledWith('api/ml/analyses/run-1/artifacts/plot-1',{responseType:'blob'});
 expect(screen.getAllByText('Результат анализа не является диагнозом.')).toHaveLength(1);
 expect(screen.getByText('Технические данные').closest('details').open).toBe(false);
});
test('required missing block is explicit while successful text remains visible', () => {
 const result=fixture();result.status='partial';result.error={code:'incomplete_report',message:'Неполный отчёт'};
 result.report.blocks=result.report.blocks.map(block=>block.id.startsWith('image')?{id:block.id,status:'unavailable',message:'Файл не получен'}:block);
 render(<AnalysisResultDetails result={result} />);
 expect(screen.getByText('Получена часть результатов')).toBeTruthy();
 expect(screen.getAllByText('Обязательный блок не получен.')).toHaveLength(3);
 expect(screen.getByText('Фрагмент текста')).toBeTruthy();expect($api.get).not.toHaveBeenCalled();
});
test('text is escaped and tables preserve zero, false, null and all pages', () => {
 const result=fixture();result.artifacts=[];result.report.schema={version:'1.0',blocks:[definitions[0],{id:'values',type:'table',title:'Значения',required:true,columns:[{key:'v',label:'Значение'}]}]};
 result.report.blocks=[{id:'conclusion',status:'ready',data:'<img src=x onerror=alert(1)>'},{id:'values',status:'ready',data:[{v:0},{v:false},{v:null},...Array.from({length:65},(_,i)=>({v:`строка-${i}`}))]}];
 render(<AnalysisResultDetails result={result} />);
 expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy();expect(document.querySelector('img[src=x]')).toBeNull();
 expect(screen.getByText('0')).toBeTruthy();expect(screen.getByText('Нет')).toBeTruthy();expect(screen.getByText('Нет данных')).toBeTruthy();
 expect(screen.queryByText('строка-64')).toBeNull();fireEvent.click(screen.getByRole('button',{name:/Показать ещё/}));expect(screen.getByText('строка-64')).toBeTruthy();
});
test('audio and video blocks open players bound to the selected run', async () => {
 $api.get.mockImplementation(url=>Promise.resolve({data:new Blob(['media'],{type:url.endsWith('/sound')?'audio/wav':'video/mp4'})}));
 const result=fixture();result.report.schema={version:'1.0',blocks:[{id:'audio',type:'audio',title:'Звуковая дорожка',required:true},{id:'video',type:'video',title:'Обработанное видео',required:true}]};
 result.report.blocks=[{id:'audio',status:'ready',artifact_id:'sound'},{id:'video',status:'ready',artifact_id:'movie'}];result.artifacts=[{id:'sound',media_type:'audio/wav'},{id:'movie',media_type:'video/mp4'}];
 const {unmount}=render(<AnalysisResultDetails result={result} />);
 fireEvent.click(screen.getByRole('button',{name:'Прослушать запись'}));fireEvent.click(screen.getByRole('button',{name:'Открыть видео'}));
 await waitFor(()=>expect(document.querySelector('audio')?.getAttribute('src')).toMatch(/^blob:/));
 await waitFor(()=>expect(document.querySelector('video')?.getAttribute('src')).toMatch(/^blob:/));
 unmount();expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
});
test('changing selected run releases previous images and loads new references', async () => {
 $api.get.mockResolvedValue({data:new Blob(['PNG'],{type:'image/png'})});
 const first=fixture();const {rerender}=render(<AnalysisResultDetails result={first} />);
 await waitFor(()=>expect(screen.getAllByRole('img')).toHaveLength(3));
 rerender(<AnalysisResultDetails result={{...fixture(),analysis_id:'run-2'}} />);
 await waitFor(()=>expect($api.get).toHaveBeenCalledWith('api/ml/analyses/run-2/artifacts/plot-1',{responseType:'blob'}));
 expect(URL.revokeObjectURL).toHaveBeenCalledTimes(3);
});
test('parent summary has only public blocks and no technical controls', () => {
 const result=fixture();result.report_view='brief';result.artifacts=[];
 result.report.schema.blocks=result.report.schema.blocks.filter(block=>block.id==='conclusion');
 result.report.blocks=result.report.blocks.filter(block=>block.id==='conclusion');
 render(<AnalysisResultDetails result={result}/>);
 expect(screen.getByLabelText('Итог анализа')).toBeTruthy();
 for(const name of ['Подробности','Технические данные','Скачать JSON'])expect(screen.queryByText(name)).toBeNull();
});
