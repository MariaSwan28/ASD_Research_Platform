"""Process boundary isolates incompatible sklearn versions without new services."""
import json
import logging
import os
from pathlib import Path
import subprocess
from core.result_contract import AdapterError

ROOT = Path(__file__).resolve().parents[1]
logger = logging.getLogger(__name__)

def classify_video(features):
    executable = Path(os.getenv('VIDEO_PYTHON', '/opt/video-env/bin/python'))
    if not executable.is_file():
        raise AdapterError('video_runtime_missing', 'Классификатор видео недоступен', 503)
    if features.get('quality_metrics', {}).get('detection_rate', 0) <= 0:
        raise AdapterError('video_no_pose', 'На записи не удалось обнаружить человека', 422)
    try:
        process = subprocess.run([str(executable), str(ROOT/'workers/video_predict.py')],
            input=json.dumps({'features': features, 'models_dir': os.getenv('VIDEO_MODELS_DIR', str(ROOT/'models')),
                              'model_type': os.getenv('VIDEO_CLASSIFIER', 'random_forest')}, allow_nan=False),
            text=True, capture_output=True, timeout=90, check=False,
            env={**os.environ, 'OMP_NUM_THREADS': '1', 'OPENBLAS_NUM_THREADS': '1'})
        output = json.loads(process.stdout)
        if process.returncode or 'result' not in output:
            logger.error('Video classifier failed: %s', output.get('error'))
            raise ValueError('worker_failed')
        return output['result']
    except (ValueError, OSError, subprocess.TimeoutExpired) as exc:
        raise AdapterError('video_classification_failed', 'Не удалось получить итоговую оценку видео', 503) from exc
