"""Presentation contract checks without Flask, sklearn or trained models."""
import copy
import json
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from core.adapter_runner import run_model
from core.result_contract import ContractError, envelope, parameter, validate_adapter_result
from core.ml_adapters import parent_story, movement_video

class PresentationTests(unittest.TestCase):
    def test_text_uses_documented_mapping_and_preserves_every_field(self):
        for label in (0, 1, 99):
            raw = {'label': label, 'features_nonzero': 3, 'future_field': [0, False, None]}
            with patch.object(parent_story, 'analyze_text', return_value=raw):
                result = parent_story.analyze({'text': 'test'})
            validate_adapter_result(result)
            self.assertEqual(result['raw_output'], raw)
            expected = {0: 'story_class_0', 1: 'story_class_1'}.get(label, 'unknown_story_class')
            self.assertEqual(result['conclusion']['code'], expected)
            self.assertEqual(result['metrics'], [])
            user_text = str(result['conclusion']) + str(result['limitations'])
            self.assertNotIn('Лебедев', user_text)
            self.assertNotIn('pickle', user_text)
            self.assertNotIn('CountVectorizer', user_text)

    def test_video_reports_extraction_only_and_keeps_unknown_data(self):
        raw = {'video_metadata': {'duration_sec': 5, 'total_frames': 30},
               'quality_metrics': {'detection_rate': 0.8},
               'aggregated_features': {'total_abrupt_movements': 0},
               'future_metric': {'unknown': [1, False, None]}}
        result = movement_video.present(raw)
        validate_adapter_result(result)
        self.assertEqual(result['raw_output'], raw)
        self.assertEqual(result['conclusion']['code'], 'features_only')
        self.assertEqual(result['conclusion']['explanation'], 'Итоговая оценка по видео пока недоступна.')
        values = {item['key']: item['value'] for item in result['metrics']}
        self.assertEqual(values['total_abrupt_movements'], 0)
        self.assertEqual(values['detection_rate'], 80)
        self.assertNotIn('movements_per_minute', values)

    def test_new_adapter_requires_complete_presentation(self):
        base = dict(summary='Done', parameters=[], artifacts=[], warnings=[])
        model = dict(id='future', label='Future', version='1', modality='image', operation='test', result_schema_version='1.1')
        adapter = SimpleNamespace(MODEL=model, status=lambda: ('configured', None), analyze=lambda p: base)
        with patch('core.adapter_runner.get_adapter', return_value=adapter):
            result, status = run_model('future', {'file_id': 'file', 'analysis_id': 'run'})
        self.assertEqual(status, 502)
        self.assertEqual(result['status'], 'failed')
        self.assertEqual(result['conclusion']['title'], 'Анализ не выполнен')
        self.assertIsNone(result['raw_output'])
        complete = {**base, 'conclusion': {'code': 'ok', 'title': 'Готово', 'explanation': 'Объяснение'},
                    'metrics': [parameter('zero', 0, 'Ноль', description='Показатель')],
                    'limitations': [], 'raw_output': {'zero': 0}}
        adapter.analyze = lambda p: complete
        with patch('core.adapter_runner.get_adapter', return_value=adapter):
            result, status = run_model('future', {'file_id': 'file', 'analysis_id': 'run'})
        self.assertEqual(status, 200)
        self.assertEqual(result['schema_version'], '1.2')
        self.assertEqual(result['model']['id'], 'future')
        for key in ('conclusion', 'metrics', 'limitations', 'raw_output'):
            self.assertEqual(result[key], complete[key])
        for mutate in (lambda x: x['metrics'][0].pop('description'),
                       lambda x: x['metrics'].append(x['metrics'][0]),
                       lambda x: x['conclusion'].update(title=''),
                       lambda x: x.update(raw_output=float('nan'))):
            invalid = copy.deepcopy(complete); mutate(invalid)
            with self.assertRaises(ContractError): validate_adapter_result(invalid)
        json.dumps(result, allow_nan=False)

    def test_legacy_adapter_gets_conservative_presentation(self):
        model = dict(id='old', label='Old', version='1', modality='text', operation='test')
        raw = dict(summary='Old summary', parameters=[parameter('flag', False)], artifacts=[], warnings=['Caution'])
        result = envelope(model, {}, '2026-11-13T10:00:00Z', 1, result=raw)
        self.assertEqual(result['conclusion']['explanation'], 'Old summary')
        self.assertEqual(result['raw_output']['parameters'], raw['parameters'])
        self.assertEqual(result['limitations'], ['Caution'])

if __name__ == '__main__': unittest.main()
