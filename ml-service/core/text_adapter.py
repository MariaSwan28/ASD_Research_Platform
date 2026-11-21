"""Developer-managed NLP classifier from the bachelor thesis.

Pickle can execute arbitrary code. Do not accept pickle files from users.
The original pre-processing and label semantics still require validation.
"""
import hashlib
import logging
import os
import pickle
from functools import lru_cache
from pathlib import Path

MODEL_PATH = Path(os.getenv("TEXT_MODEL_PATH", "/app/nlp_artifacts/MachineNB1.pickle"))
VECTORIZER_PATH = Path(os.getenv("TEXT_VECTORIZER_PATH", "/app/nlp_artifacts/CountVectorizer1.pickle"))
MODEL_SHA256 = "24564afb81c74737cd5f98efa71148fdd7402847d3a32154da20ea41784ce6a3"
VECTORIZER_SHA256 = "4cadf9e8c09aa05a9173d169edc885cbc51c6cab70cf5f2036ac1baf2ce19ccc"
EXPECTED_FEATURES = 3246
logger = logging.getLogger(__name__)


def _verified(path, expected):
    if not path.is_file():
        return False
    sha = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            sha.update(chunk)
    return sha.hexdigest() == expected


@lru_cache(maxsize=1)
def _load_pipeline():
    if os.getenv("ENABLE_TRUSTED_TEXT_PICKLES") != "1":
        raise RuntimeError("model_loading_disabled")
    if not _verified(MODEL_PATH, MODEL_SHA256) or not _verified(VECTORIZER_PATH, VECTORIZER_SHA256):
        raise RuntimeError("model_artifact_checksum_mismatch")
    # Only administrator-supplied files verified by exact SHA-256 above.
    with MODEL_PATH.open("rb") as stream:
        model = pickle.load(stream)
    with VECTORIZER_PATH.open("rb") as stream:
        vectorizer = pickle.load(stream)
    if not hasattr(model, "predict") or not hasattr(vectorizer, "transform"):
        raise RuntimeError("invalid_nlp_artifact")
    n_features = getattr(model, "n_features_in_", None)
    if n_features is None and hasattr(model, "best_estimator_"):
        n_features = getattr(model.best_estimator_, "n_features_in_", None)
    if n_features != EXPECTED_FEATURES:
        raise RuntimeError("classifier_feature_mismatch")
    if len(vectorizer.get_feature_names_out()) != EXPECTED_FEATURES:
        raise RuntimeError("vectorizer_feature_mismatch")
    check = vectorizer.transform(["проверка модели"])
    if check.shape[1] != EXPECTED_FEATURES:
        raise RuntimeError("vectorizer_transform_mismatch")
    return model, vectorizer


def text_model_status():
    if os.getenv("ENABLE_TRUSTED_TEXT_PICKLES") != "1":
        return "disabled"
    if not _verified(MODEL_PATH, MODEL_SHA256):
        return "model_missing_or_modified"
    if not _verified(VECTORIZER_PATH, VECTORIZER_SHA256):
        return "vectorizer_missing_or_modified"
    try:
        _load_pipeline()
        from core.text_preprocessing import resources
        resources()
    except Exception as exc:
        logger.warning("NLP artifacts unavailable (%s): %s", type(exc).__name__, exc)
        return "load_or_compatibility_error"
    return "configured"


def analyze_text(text):
    if not isinstance(text, str) or not text.strip() or len(text) > 20000:
        raise ValueError("text_length_invalid")
    from core.text_preprocessing import prepare_sentences
    model, vectorizer = _load_pipeline()
    rows = prepare_sentences(text)
    if not rows:
        raise ValueError("text_has_no_known_words")
    matrix = vectorizer.transform([row['normalized'] for row in rows])
    valid = [index for index in range(len(rows)) if matrix[index].nnz > 0]
    if not valid:
        raise ValueError("text_has_no_known_words")
    predictions = model.predict(matrix[valid])
    for row in rows:
        row.update(label=None, features_nonzero=0)
    for index, prediction in zip(valid, predictions):
        rows[index].update(label=int(prediction), features_nonzero=int(matrix[index].nnz))
    if any(rows[index]['label'] not in (0, 1) for index in valid):
        raise ValueError('unexpected_text_class')
    positive = sum(rows[index]['label'] for index in valid)
    fraction = positive / len(valid)
    band = 'class_0' if fraction <= 0.4 else 'mixed' if fraction <= 0.6 else 'class_1'
    return {
        "status": "completed", "model_id": "parent-story-nb",
        "model_version": "bachelor-2024-count-sentences-v2",
        "label": 0 if band == 'class_0' else 1 if band == 'class_1' else None,
        "result_band": band, "positive_fraction": fraction,
        "sentences_total": len(rows), "sentences_analyzed": len(valid),
        "sentences_skipped": len(rows) - len(valid), "positive_sentences": positive,
        "features_nonzero": int(matrix.nnz), "sentences": rows,
        "preprocessing": "lowercase_regex_pymorphy3_nltk_stopwords",
        "aggregation": "mean_sentence_labels; bands <=0.4, <=0.6, >0.6",
        "disclaimer": "Результат анализа не является диагнозом.",
    }
