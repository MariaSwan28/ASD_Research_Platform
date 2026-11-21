import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
import wave
from unittest.mock import patch
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from core.ml_adapters import audio_activity, movement_video, parent_story
from core.video_service import VideoAnalysisService
from core.result_contract import validate_adapter_result
from core.model_registry import get_adapter
from server import app

class ReleaseTests(unittest.TestCase):
    def test_internal_endpoints_require_token_but_health_does_not(self):
        client = app.test_client()
        with patch.dict(os.environ, {'ML_INTERNAL_TOKEN': 'test-token'}):
            self.assertEqual(client.get('/health').status_code, 200)
            self.assertEqual(client.get('/api/capabilities').status_code, 401)
            with patch('core.model_registry.list_capabilities', return_value=[]):
                self.assertEqual(client.get('/api/capabilities', headers={'X-ML-Token':'test-token'}).status_code, 200)

    def test_separate_runs_never_overwrite_outputs(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary); video=root/'same.mp4';video.write_bytes(b'fixture')
            class FakeAnalyzer:
                def set_progress_callback(self, callback): pass
                def export_dataset_sample(self, video_path, output_dir):
                    directory = Path(output_dir);(directory/'features').mkdir()
                    (directory/'features/same.json').write_text('{}')
                    return {'video_metadata': {'video_id':'same'}}
            service=VideoAnalysisService(FakeAnalyzer, root/'dataset')
            for run in ('run-1','run-2'):
                result=service.analyze({'user_id':'owner', 'video_path':str(video), 'analysis_id':run})
                self.assertEqual(result['output_artifacts'][0]['id'],'features-json')
            self.assertTrue((root/'dataset/owner/runs/run-1/manifest.json').is_file())
            self.assertTrue((root/'dataset/owner/runs/run-2/manifest.json').is_file())

    def test_classifier_output_and_partial_failures_are_distinct(self):
        raw={'quality_metrics':{'detection_rate':1},'aggregated_features':{}}
        with patch.object(movement_video.video_service,'analyze',return_value=dict(raw)), \
             patch.object(movement_video,'classify_video',return_value={'prediction_label':1,'confidence':0.8,'defaulted_features':[]}):
            result=movement_video.analyze({})
        validate_adapter_result(result)
        self.assertEqual(result['conclusion']['code'],'movement_class_1')
        self.assertEqual(result['metrics'][0]['value'],80)
        from core.result_contract import AdapterError
        with patch.object(movement_video.video_service,'analyze',return_value=dict(raw)), \
             patch.object(movement_video,'classify_video',side_effect=AdapterError('failed','Unavailable',503)):
            result=movement_video.analyze({})
        validate_adapter_result(result)
        self.assertEqual(result['partial_error']['code'],'failed')
        self.assertEqual(result['raw_output']['quality_metrics'],raw['quality_metrics'])

    def test_third_adapter_detected_and_real_audio_executes(self):
        self.assertIs(get_adapter('audio-activity-v1'),audio_activity)
        with tempfile.TemporaryDirectory() as directory:
            sample_rate=16000
            t=np.arange(sample_rate)/sample_rate
            sound=np.concatenate([np.zeros(sample_rate*2),np.sin(2*np.pi*440*t)*0.5,np.zeros(sample_rate*2)])
            filename=Path(directory)/'tone.wav'
            with wave.open(str(filename),'wb') as audio:
                audio.setnchannels(1);audio.setsampwidth(2);audio.setframerate(sample_rate)
                audio.writeframes((sound*32767).astype('<i2').tobytes())
            result=audio_activity.analyze({'file_path':str(filename)})
        validate_adapter_result(result)
        self.assertEqual(result['raw_output']['activity_count'],1)
        self.assertEqual(result['conclusion']['code'],'activity_found')
        self.assertIn('не различает',result['limitations'][0])

    def test_silence_is_zero_activity(self):
        intervals,threshold=audio_activity.detect(np.zeros(16000*2),16000)
        self.assertEqual(intervals,[])
        self.assertGreater(threshold,0)

    def test_text_aggregation_does_not_call_fraction_probability(self):
        raw={'label':None, 'result_band':'mixed', 'sentences_analyzed':2,'positive_fraction':0.5,
             'sentences':[{'text':'One','label':0},{'text':'Two','label':1}]}
        with patch.object(parent_story,'analyze_text',return_value=raw):result=parent_story.analyze({'text':'test'})
        validate_adapter_result(result)
        self.assertEqual(result['conclusion']['code'],'mixed_story')
        self.assertEqual(result['metrics'][1]['value'],50)
        self.assertIn('не вероятность',result['metrics'][1]['description'])

if __name__=='__main__':unittest.main()
