"""The template is inert until implemented and preserves arbitrary model outputs."""
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from core.adapter_runner import run_model
from core.model_registry import get_adapter
from core.result_contract import AdapterError, ContractError, make_result, validate_adapter_result
from core.ml_adapters import movement_video, parent_story
from templates import adapter_template


class TemplateTests(unittest.TestCase):
    def test_scaffold_is_not_discovered_or_ready(self):
        self.assertIsNone(get_adapter(adapter_template.MODEL['id']))
        self.assertEqual(adapter_template.status()[0], 'unavailable')
        with self.assertRaises(AdapterError): adapter_template.analyze({})

    def test_complete_result_and_failure_use_existing_runner(self):
        raw = {'score': 0, 'future': {'flag': False, 'missing': None, 'values': list(range(65))}}
        with patch.object(adapter_template, 'status', return_value=('configured', None)), \
             patch.object(adapter_template, 'infer', return_value=raw), \
             patch('core.adapter_runner.get_adapter', return_value=adapter_template):
            result, status = run_model(adapter_template.MODEL['id'], {'file_id': 'file', 'analysis_id': 'run'})
        self.assertEqual(status, 200)
        self.assertEqual(result['raw_output'], raw)
        self.assertEqual(result['schema_version'], '1.3')
        self.assertEqual(result['conclusion']['code'], 'interpretation_not_configured')
        with patch('core.adapter_runner.get_adapter', return_value=adapter_template):
            result, status = run_model(adapter_template.MODEL['id'], {})
        self.assertEqual(status, 503)
        self.assertEqual(result['status'], 'failed')

    def test_required_arguments_and_invalid_custom_presentation(self):
        with self.assertRaises(TypeError): make_result(raw_output={})
        with self.assertRaises(ContractError):
            make_result(conclusion={'code': 'ok', 'title': '', 'explanation': 'x'}, metrics=[], limitations=[], raw_output={})

    def test_video_custom_table_uses_common_parameter_contract(self):
        raw = {'aggregated_features': {'frequency_features': {'левое_запястье': {'dominant_frequency_hz': 2}},
                                      'movement_frequency': {'левое_запястье': 0}}, 'quality_metrics': {}}
        result = movement_video.present(raw)
        validate_adapter_result(result)
        table = result['parameters'][0]
        self.assertEqual(table['type'], 'table')
        self.assertEqual(table['value'][0]['events'], 0)
        self.assertIsNone(table['value'][0]['mean_speed'])
        self.assertEqual(result['raw_output'], raw)

    def test_unknown_text_class_never_becomes_negative_result(self):
        for label in (None, True, '1', 2):
            with patch.object(parent_story, 'analyze_text', return_value={'label': label}):
                result = parent_story.analyze({'text': 'test'})
            self.assertEqual(result['conclusion']['code'], 'unknown_story_class')
            self.assertNotIn('features_nonzero', {m['key'] for m in result['metrics']})

if __name__ == '__main__': unittest.main()
