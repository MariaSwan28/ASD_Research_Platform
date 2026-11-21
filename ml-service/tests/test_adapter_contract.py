"""Integration boundary checks with fake analyzers; no trained model is loaded."""
import copy
import json
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from core.adapter_runner import run_model
from core.result_contract import AdapterError, ContractError, parameter, validate_adapter_result
from core.video_service import VideoAnalysisService
from core.ml_adapters import movement_video, parent_story
from core.model_registry import list_capabilities
from server import app

MODEL = {"id": "test-model", "label": "Тест", "version": "1", "modality": "text", "operation": "test"}
CONTEXT = {"file_id": "test-file", "analysis_id": "test-analysis", "text": "input"}
RAW = {"video_metadata": {"video_id": "sample", "total_frames": 30},
       "aggregated_features": {"new_metric": 0, "empty": None}, "unknown_future_output": list(range(65))}


def output():
    return {"summary": "Готово", "parameters": [parameter("zero", 0), parameter("flag", False),
            parameter("nested", {"unknown": [1, None, False]})], "artifacts": [], "warnings": []}


class ContractTests(unittest.TestCase):
    def test_plain_adapter_without_flask_context(self):
        adapter = SimpleNamespace(MODEL=MODEL, status=lambda: ("configured", None), analyze=lambda payload: output())
        with patch('core.adapter_runner.get_adapter', return_value=adapter):
            result, status = run_model(MODEL['id'], CONTEXT)
        self.assertEqual(status, 200)
        self.assertEqual(result['analysis_id'], CONTEXT['analysis_id'])
        self.assertEqual(result['input']['file_id'], CONTEXT['file_id'])
        self.assertEqual(result['parameters'][0]['value'], 0)
        self.assertIs(result['parameters'][1]['value'], False)
        self.assertIsNone(result['error'])
        self.assertEqual(set(result), {'schema_version', 'analysis_id', 'status', 'model', 'input', 'execution',
                                      'summary', 'parameters', 'artifacts', 'warnings', 'error', 'conclusion', 'metrics', 'limitations', 'raw_output'})
        json.dumps(result, allow_nan=False)

    def test_invalid_output_is_failed_not_completed(self):
        invalid = [None, {**output(), 'parameters': [{'key': 'x', 'label': 'x', 'type': 'integer', 'value': True}]},
                   {**output(), 'parameters': [parameter('x', float('nan'))]},
                   {**output(), 'parameters': [parameter('x', 1), parameter('x', 2)]},
                   {**output(), 'parameters': [parameter('x', [float('inf')])]},
                   {**output(), 'unexpected': 'must not silently disappear'}]
        for value in invalid:
            with self.subTest(value=value):
                adapter = SimpleNamespace(MODEL=MODEL, status=lambda: ('configured', None), analyze=lambda p: value)
                with patch('core.adapter_runner.get_adapter', return_value=adapter):
                    result, status = run_model('test-model', CONTEXT)
                self.assertEqual(status, 502)
                self.assertEqual(result['status'], 'failed')
                self.assertEqual(result['error']['code'], 'invalid_model_result')
                self.assertEqual(result['parameters'], [])

    def test_unknown_parameter_type_and_table(self):
        result = output()
        result['parameters'] += [dict(key='future', label='Будущий формат', type='future-type', value={'a': 1}),
          dict(key='rows', label='Таблица', type='table', columns=[{'key': 'x', 'label': 'X'}], value=[{'x': 0}, {}])]
        validate_adapter_result(result)
        result['parameters'][-1]['value'][0]['hidden_column'] = 'would not be displayed'
        with self.assertRaises(ContractError):
            validate_adapter_result(result)

    def test_unavailable_unknown_and_invalid_input(self):
        with patch('core.adapter_runner.get_adapter', return_value=None):
            result, status = run_model('missing', CONTEXT)
            self.assertEqual(status, 404)
            self.assertEqual(result['status'], 'failed')
        adapter = SimpleNamespace(MODEL=MODEL, status=lambda: ('unavailable', 'artifact_missing'), analyze=lambda p: self.fail())
        with patch('core.adapter_runner.get_adapter', return_value=adapter):
            self.assertEqual(run_model('test-model', CONTEXT)[1], 503)
            self.assertEqual(run_model('test-model', [])[1], 400)

    def test_runtime_error_is_structured(self):
        def fail(payload):
            raise RuntimeError('/internal/path must not be disclosed')
        adapter = SimpleNamespace(MODEL=MODEL, status=lambda: ('configured', None), analyze=fail)
        with patch('core.adapter_runner.get_adapter', return_value=adapter):
            result, status = run_model('test-model', CONTEXT)
        self.assertEqual(status, 503)
        self.assertNotIn('/internal/path', json.dumps(result))

    def test_text_adapter_wraps_existing_results_without_interpreting_labels(self):
        with patch.object(parent_story, 'analyze_text', return_value={"status": "completed", "label": 0,
                    "features_nonzero": 3, "new_metric": False, "disclaimer": "test warning"}):
            result = parent_story.analyze({'text': 'test'})
        validate_adapter_result(result)
        values = {item['key']: item['value'] for item in result['parameters']}
        self.assertEqual(values, {'label': 0, 'features_nonzero': 3, 'new_metric': False})


class VideoTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.video = Path(self.directory.name) / 'sample.mp4'
        self.video.write_bytes(b'test fixture, not an actual video')
        self.instances = []
        owner = self
        class FakeAnalyzer:
            def __init__(self): owner.instances.append(self)
            def set_progress_callback(self, callback): self.callback = callback
            def export_dataset_sample(self, video_path, output_dir):
                self.callback(55)
                return copy.deepcopy(RAW)
        self.service = VideoAnalysisService(FakeAnalyzer, self.directory.name)
        self.payload = {'user_id': 'user-1', 'video_path': str(self.video), 'file_id': 'file-1'}

    def test_legacy_and_generic_http_use_same_service(self):
        with patch('server.video_service', self.service), patch.object(movement_video, 'video_service', self.service), \
             patch.object(movement_video, 'status', return_value=('configured', None)):
            client = app.test_client()
            old = client.post('/api/mv_analyze', json=self.payload)
            new = client.post('/api/models/movement-pose-v1/analyze', json=self.payload)
            state = client.get('/api/mv_analyze/status').get_json()
        self.assertEqual(old.status_code, 200)
        self.assertEqual(old.get_json(), RAW)
        self.assertEqual(new.status_code, 200)
        params = {item['key']: item['value'] for item in new.get_json()['parameters']}
        self.assertEqual(params['unknown_future_output'], list(range(65)))
        self.assertEqual(params['aggregated_features']['new_metric']['value'], 0)
        self.assertFalse(state['is_analyzing'])
        self.assertEqual(state['progress'], 100)
        self.assertEqual(state['current_file_id'], 'file-1')
        self.assertEqual(len(self.instances), 2, 'Each video needs fresh analyzer state')

    def test_validation_busy_and_recovery(self):
        for data, status in [(None, 400), ({}, 400), ({**self.payload, 'user_id': '../other'}, 400),
                             ({**self.payload, 'video_path': '/missing-video'}, 404)]:
            with self.assertRaises(AdapterError) as error:
                self.service.analyze(data)
            self.assertEqual(error.exception.http_status, status)
            self.assertFalse(self.service.status()['is_analyzing'])
        self.service._state['is_analyzing'] = True
        with self.assertRaises(AdapterError) as error:
            self.service.analyze(self.payload)
        self.assertEqual(error.exception.http_status, 409)
        self.service._state['is_analyzing'] = False
        with patch.object(self.service, '_factory', side_effect=RuntimeError('failed')):
            with self.assertRaises(AdapterError): self.service.analyze(self.payload)
        self.assertFalse(self.service.status()['is_analyzing'])
        self.assertEqual(self.service.status()['error'], 'video_execution_failed')
        self.service.analyze(self.payload)
        self.assertIsNone(self.service.status()['error'])

    def test_concurrent_run_is_rejected(self):
        started, release = threading.Event(), threading.Event()
        class BlockingAnalyzer:
            def set_progress_callback(self, callback): pass
            def export_dataset_sample(self, **kwargs):
                started.set()
                release.wait(3)
                return RAW
        self.service._factory = BlockingAnalyzer
        thread = threading.Thread(target=lambda: self.service.analyze(self.payload))
        thread.start()
        try:
            self.assertTrue(started.wait(2))
            with self.assertRaises(AdapterError) as error: self.service.analyze(self.payload)
            self.assertEqual(error.exception.http_status, 409)
        finally:
            release.set()
            thread.join(3)

    def test_catalog_without_heavy_dependencies(self):
        with patch('core.video_service.importlib.util.find_spec', return_value=None), \
             patch.dict('os.environ', {'ENABLE_TRUSTED_TEXT_PICKLES': '0'}):
            response = app.test_client().get('/api/capabilities')
        self.assertEqual(response.status_code, 200)
        models = {item['id']: item for item in response.get_json()['models']}
        self.assertEqual(models['movement-pose-v1']['status'], 'unavailable')
        self.assertIn('missing_dependencies', models['movement-pose-v1']['reason'])
        self.assertEqual(models['parent-story-nb']['status'], 'unavailable')


if __name__ == '__main__':
    unittest.main()
