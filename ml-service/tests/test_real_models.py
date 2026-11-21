"""Opt-in execution of trusted artifacts, not an accuracy benchmark."""
import json
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))

@unittest.skipUnless(os.getenv('RUN_REAL_MODEL_TESTS')=='1','Set RUN_REAL_MODEL_TESTS=1 with the pinned runtimes')
class RealModelTests(unittest.TestCase):
    def test_text_pipeline_on_real_artifacts(self):
        from core.text_adapter import analyze_text
        result=analyze_text('Ребенок играет с детьми. Он активно разговаривает и показывает игрушки маме.')
        self.assertEqual(result['sentences_analyzed'],2)
        self.assertTrue(0 <= result['positive_fraction'] <= 1)
        self.assertEqual(len(result['sentences']),2)
        self.assertTrue(all(row['normalized'] for row in result['sentences']))

    def test_real_video_bundles_in_matching_runtime(self):
        from core.video_classifier import classify_video
        root=Path(__file__).resolve().parents[2]
        fixture=json.loads((root/'demo/video_features_sample.json').read_text(encoding='utf-8'))
        for name in ('random_forest','gradient_boosting'):
            with patch.dict(os.environ,{'VIDEO_CLASSIFIER':name}):result=classify_video(fixture)
            self.assertIn(result['prediction_label'],[0,1])
            self.assertAlmostEqual(sum(result['probabilities'].values()),1)
            self.assertEqual(result['runtime']['sklearn'],'1.3.0')
            self.assertEqual(len(result['defaulted_features']),8)

if __name__=='__main__':unittest.main()
