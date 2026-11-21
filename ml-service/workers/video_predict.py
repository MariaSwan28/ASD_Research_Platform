"""Runs ONLY in the pinned sklearn 1.3.0 environment. Input/output are JSON."""
import hashlib
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from core.movement_features import extract_features

TRUSTED_MODELS = {
    'random_forest': ('trained_model_random_forest.pkl', 'd0e1fce323ba5ff3fe088682324094b6cc2f29e9f48169e6b2c3232bc68e6e2e'),
    'gradient_boosting': ('trained_model_gradient_boosting.pkl', 'd8196a1f693bd5de98e91b1933f364214f601b55ff9bf5e481dfbebe230a7d75'),
}

def predict(payload, models_dir):
    import sklearn
    import joblib
    import numpy as np
    import pandas as pd
    if sklearn.__version__ != '1.3.0': raise ValueError('video_sklearn_version_mismatch')
    name = payload.get('model_type', 'random_forest')
    filename, checksum = TRUSTED_MODELS[name]
    model_path = Path(models_dir) / filename
    if hashlib.sha256(model_path.read_bytes()).hexdigest() != checksum: raise ValueError('video_model_checksum_mismatch')
    bundle = joblib.load(model_path)
    features = extract_features(payload['features'])
    if any(key not in features for key in ('total_abrupt_movements', 'movements_per_minute', 'json_detection_rate', 'json_duration_sec')):
        raise ValueError('video_features_incomplete')
    columns = bundle['feature_names']
    # The original pipeline fills missing features with 0. Record every such
    # substitution explicitly: manual annotations are not available on a new clip.
    absent = [key for key in columns if key not in features or features[key] is None]
    frame = pd.DataFrame([{key: features.get(key, 0) for key in columns}], columns=columns).fillna(0)
    if not np.isfinite(frame.to_numpy(dtype=float)).all(): raise ValueError('non_finite_video_features')
    scaled = bundle['scaler'].transform(frame)
    model = bundle['model']
    label = int(model.predict(scaled)[0])
    classes = [int(x) for x in model.classes_]
    probabilities = {str(c): float(p) for c, p in zip(classes, model.predict_proba(scaled)[0])}
    return {'prediction_label': label, 'probabilities': probabilities,
            'confidence': probabilities[str(label)], 'model_type': name,
            'feature_names': columns, 'defaulted_features': absent,
            'preprocessing': 'original_scaler_missing_columns_zero',
            'runtime': {'python': sys.version.split()[0], 'sklearn': sklearn.__version__}}

if __name__ == '__main__':
    try:
        request = json.load(sys.stdin)
        result = predict(request, request['models_dir'])
        print(json.dumps({'result': result}, ensure_ascii=False, allow_nan=False))
    except Exception as error:
        print(json.dumps({'error': type(error).__name__ + ':' + str(error)}))
        sys.exit(1)
