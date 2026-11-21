import logging
import os
import traceback
from flask import Flask, request, jsonify
import hmac
from config.config import DATASET_PATH, LABELS_FILE_PATH, FEATURES_PATH, DEFAULT_MODEL
from core.adapter_runner import run_model
from core.result_contract import AdapterError
from core.video_service import video_service

# No container-only log path and no heavy ML imports during app startup.
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)
app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 1024 * 1024
if os.getenv('APP_ENV') == 'production' and len(os.getenv('ML_INTERNAL_TOKEN', '')) < 32:
    raise RuntimeError('ML_INTERNAL_TOKEN is required')

@app.before_request
def authenticate_internal_service():
    if request.path == '/health': return None
    token = os.getenv('ML_INTERNAL_TOKEN')
    if token and not hmac.compare_digest(request.headers.get('X-ML-Token', '').encode('utf-8'), token.encode('utf-8')):
        return jsonify({'error': 'unauthorized'}), 401
    return None

@app.route('/health')
def health():
    return jsonify({'status': 'ok'})


@app.route("/api/text/predict", methods=["POST"])
def predict_text():
    """Internal ML endpoint. Backend authenticates users before proxying."""
    from core.text_adapter import analyze_text, text_model_status
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict) or not isinstance(payload.get("text"), str):
        return jsonify({"error": "text must be a string"}), 400
    if text_model_status() != "configured":
        return jsonify({"error": "text_model_unavailable", "reason": text_model_status()}), 503
    try:
        return jsonify(analyze_text(payload["text"]))
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    except Exception:
        logger.exception("Text model is not ready")
        return jsonify({"error": "text_model_not_ready"}), 503


@app.route("/api/models/<model_id>/analyze", methods=["POST"])
def analyze_with_registered_model(model_id):
    """Generic trusted adapter interface. File ownership is checked by BFF."""
    result, status = run_model(model_id, request.get_json(silent=True))
    return jsonify(result), status


@app.route("/api/capabilities", methods=["GET"])
def get_capabilities():
    from core.model_registry import list_capabilities
    return jsonify({"models": list_capabilities()})


@app.route("/api/mv_analyze", methods=["POST"])
def analyze_movements():
    """Compatibility endpoint: the same service, original raw JSON response."""
    try:
        return jsonify(video_service.analyze(request.get_json(silent=True))), 200
    except AdapterError as exc:
        return jsonify({"error": str(exc), "code": exc.code}), exc.http_status


@app.route("/api/mv_analyze/status", methods=["GET"])
def get_analysis_status():
    return jsonify(video_service.status())


@app.route("/api/predict", methods=["POST"])
def predict():
    """Compatibility read of legacy features, never a client-selected model."""
    import re
    from pathlib import Path
    from core.video_classifier import classify_video
    payload = request.get_json(silent=True) or {}
    user, name = payload.get('user_id'), payload.get('video_name')
    if not isinstance(user, str) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,100}', user):
        return jsonify({'error': 'invalid_user'}), 400
    if not isinstance(name, str) or not name or '/' in name or '\\' in name or name in ('.', '..'):
        return jsonify({'error': 'invalid_video'}), 400
    try:
        import json
        features = json.loads((Path(DATASET_PATH)/user/'features'/(name+'.json')).read_text())
        result = classify_video(features)
        return jsonify({**result, 'probability_normal': result['probabilities'].get('0'),
                        'probability_asd': result['probabilities'].get('1')})
    except FileNotFoundError:
        return jsonify({'error': 'features_not_found'}), 404
    except AdapterError as error:
        return jsonify({'error': str(error), 'code': error.code}), error.http_status
    except Exception:
        logger.exception('Legacy classification failed')
        return jsonify({'error': 'classification_failed'}), 503


if __name__ == "__main__":
    # Each model initializes only when it is actually called.
    app.run(host="0.0.0.0", port=5010, debug=False)
