import base64
import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from core.report_contract import validate_schema, validate_report, build_report, text_block, table_block, file_block
from core.result_contract import ContractError, make_result
from core.adapter_runner import run_model
from core.run_artifacts import register_artifact, run_directory

SCHEMA = {'version':'1.0','blocks':[
    {'id':'summary','type':'text','title':'Вывод','required':True},
    {'id':'rows','type':'table','title':'Таблица','required':True,'columns':[{'key':'value','label':'Значение'}]},
    *[{'id':f'image-{i}','type':'image','title':f'График {i}','required':True,'media_types':['image/png']} for i in range(1,4)],
    {'id':'audio','type':'audio','title':'Аудио','required':False},
    {'id':'video','type':'video','title':'Видео','required':False}
]}
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=')

def output(blocks, artifacts):
    return make_result(conclusion={'code':'ok','title':'Готово','explanation':'Пояснение'}, metrics=[], limitations=[], raw_output={'future':[0,False,None]}, report_blocks=blocks, artifacts=artifacts)

class ReportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.patch = patch('core.run_artifacts.DATASET_PATH',self.temp.name);self.patch.start();self.addCleanup(self.patch.stop)
        self.context = {'user_id':'owner','analysis_id':'run','file_id':'file'}
        self.artifacts=[]
        for i in range(1,4):
            file=run_directory(self.context)/'images'/f'{i}.png';file.parent.mkdir(parents=True,exist_ok=True);file.write_bytes(PNG)
            self.artifacts.append(register_artifact(self.context,file,f'plot-{i}',f'График {i}','image/png'))
        self.blocks=[text_block('summary','Рассказ отнесён к категории «без РАС»'),table_block('rows',[{'value':0},{'value':False},{'value':None}]),*[file_block(f'image-{i}',f'plot-{i}') for i in range(1,4)]]
        self.model={'id':'report-example','label':'Пример','version':'1','modality':'text','operation':'demo','result_schema_version':'1.3','report_schema':copy.deepcopy(SCHEMA)}
    def run_report(self, blocks=None, artifacts=None):
        adapter=SimpleNamespace(MODEL=self.model,status=lambda:('configured',None),analyze=lambda p:output(copy.deepcopy(self.blocks if blocks is None else blocks),copy.deepcopy(self.artifacts if artifacts is None else artifacts)))
        with patch('core.adapter_runner.get_adapter',return_value=adapter):return run_model(self.model['id'],self.context)
    def test_three_images_table_text_order_and_full_raw_output(self):
        result,status=self.run_report()
        self.assertEqual(status,200);self.assertEqual(result['status'],'completed');self.assertEqual(result['schema_version'],'1.3')
        self.assertEqual(result['report']['schema'],SCHEMA)
        self.assertEqual([x['id'] for x in result['report']['blocks']],[x['id'] for x in SCHEMA['blocks']])
        self.assertEqual(result['report']['blocks'][1]['data'],[{'value':0},{'value':False},{'value':None}])
        self.assertEqual(result['raw_output'],{'future':[0,False,None]})
        self.assertEqual(result['report']['blocks'][-1]['status'],'unavailable')
        json.dumps(result,allow_nan=False)
    def test_missing_required_block_is_partial_not_success(self):
        result,status=self.run_report(self.blocks[:-1]);self.assertEqual(status,200);self.assertEqual(result['status'],'partial')
        self.assertEqual(result['error']['code'],'incomplete_report');self.assertEqual(result['report']['blocks'][4]['status'],'unavailable')
        self.assertEqual(result['report']['blocks'][0]['status'],'ready')
    def test_registered_file_missing_or_escaping_run_is_unavailable(self):
        root=run_directory(self.context)
        (root/'images/3.png').unlink()
        result,_=self.run_report();self.assertEqual(result['status'],'partial')
        outside=Path(self.temp.name)/'outside.png';outside.write_bytes(PNG)
        (root/'images/3.png').symlink_to(outside)
        result,_=self.run_report();self.assertEqual(result['status'],'partial')
        with self.assertRaises(ContractError):register_artifact(self.context,outside,'outside','Нельзя','image/png')
    def test_empty_table_is_a_valid_result(self):
        blocks=copy.deepcopy(self.blocks);blocks[1]['data']=[]
        result,_=self.run_report(blocks);self.assertEqual(result['status'],'completed');self.assertEqual(result['report']['blocks'][1]['data'],[])
    def test_duplicate_unknown_blocks_hidden_cells_and_wrong_mime_are_rejected(self):
        cases=[]
        cases.append(self.blocks+[self.blocks[0]])
        cases.append(self.blocks+[text_block('unknown','X')])
        bad=copy.deepcopy(self.blocks);bad[1]['data']=[{'value':1,'hidden':2}];cases.append(bad)
        bad=copy.deepcopy(self.blocks);bad[0]['data']='';cases.append(bad)
        bad=copy.deepcopy(self.blocks);bad[2]['artifact_id']='https://example.invalid/x.png';cases.append(bad)
        for blocks in cases:
            result,status=self.run_report(blocks);self.assertEqual(status,502);self.assertEqual(result['status'],'failed')
        artifacts=copy.deepcopy(self.artifacts);artifacts[0]['media_type']='image/jpeg'
        result,status=self.run_report(artifacts=artifacts);self.assertEqual(status,502)
    def test_descriptor_rejects_active_images_and_bad_types(self):
        for mutate in [lambda s:s['blocks'][2].update(media_types=['image/svg+xml']),lambda s:s['blocks'].append(s['blocks'][0]),lambda s:s['blocks'][0].update(type='html'),lambda s:s['blocks'][0].pop('required')]:
            schema=copy.deepcopy(SCHEMA);mutate(schema)
            with self.assertRaises(ContractError):validate_schema(schema)
    def test_schema_snapshot_survives_adapter_schema_mutation(self):
        result,_=self.run_report();self.model['report_schema']['blocks'][0]['title']='Новое название'
        self.assertEqual(result['report']['schema']['blocks'][0]['title'],'Вывод')
    def test_failed_run_keeps_layout_without_fabricated_results(self):
        adapter=SimpleNamespace(MODEL=self.model,status=lambda:('unavailable','Недоступно'))
        with patch('core.adapter_runner.get_adapter',return_value=adapter):result,status=run_model(self.model['id'],self.context)
        self.assertEqual(status,503);self.assertEqual(result['schema_version'],'1.3');self.assertEqual(result['status'],'failed')
        self.assertTrue(all(x['status']=='unavailable' for x in result['report']['blocks']));self.assertIsNone(result['raw_output'])
    def test_silent_audio_has_zero_count_empty_table_and_completed_report(self):
        import wave
        recording=Path(self.temp.name)/'silent.wav'
        with wave.open(str(recording),'wb') as audio:
            audio.setnchannels(1);audio.setsampwidth(2);audio.setframerate(16000);audio.writeframes(bytes(32000))
        result,status=run_model('audio-activity-v1',{'file_path':str(recording),'file_id':'file','analysis_id':'silence'})
        self.assertEqual(status,200);self.assertEqual(result['status'],'completed')
        self.assertEqual(result['raw_output']['activity_count'],0)
        self.assertEqual(result['report']['blocks'][2]['data'],[])
        self.assertIn('не найдены',result['conclusion']['explanation'])

    def test_non_finite_data_is_rejected(self):
        blocks=copy.deepcopy(self.blocks);blocks[1]['data']=[{'value':float('nan')}]
        result,status=self.run_report(blocks);self.assertEqual(status,502)

if __name__=='__main__':unittest.main()
