"""Copy into core/ml_adapters/<unique_name>.py and fill in model-specific code.

Kept outside discovery: this is a developer scaffold, not a working model.
"""
from core.result_contract import AdapterError, make_result, parameter
from core.report_contract import text_block, table_block, METRIC_COLUMNS

MODEL = {
    "id": "replace-with-unique-model-id",
    "label": "Название модели для пользователя",
    "version": "1.0.0",
    "modality": "image",  # text / video / image / another supported modality
    "input_types": ["image/png"],
    "extensions": [".png"],
    "operation": "image-classification",
    "result_schema_version": "1.3",
}

MODEL['report_schema'] = {'version':'1.0','blocks':[
    {'id':'summary','type':'text','title':'Итог анализа','required':True},
    {'id':'metrics','type':'table','title':'Показатели','required':True,'columns':METRIC_COLUMNS}
]}

# Set only after implementing infer() and real dependency/artifact checks.
IMPLEMENTED = False


def status():
    """Check local dependencies and trusted artifacts without running inference."""
    if not IMPLEMENTED:
        return "unavailable", "Адаптер ещё не настроен разработчиком"
    # TODO: check actual dependencies, version and artifact checksums here.
    return "configured", None


def infer(payload):
    """Implement original preprocessing and inference, returning JSON-safe output.

    Text: payload['text']. Other inputs: payload['file_path'] from authenticated
    BFF. Do not fit the model on uploads or accept a model path from the user.
    Convert numpy scalars/arrays to native JSON values, preserve missing as null.
    """
    raise AdapterError("adapter_not_implemented", "Адаптер ещё не настроен разработчиком", 503)


def present(raw):
    """Replace with a documented model-specific label mapping and explanations.

    Unknown classes must use an explicit fallback, never the negative class.
    A score/probability must retain its real mathematical meaning and unit.
    """
    return make_result(
        # REQUIRED: code stable for software; title and explanation for people.
        conclusion={
            "code": "interpretation_not_configured",
            "title": "Результат не определён",
            "explanation": "Не удалось получить однозначную оценку.",
        },
        # REQUIRED array; may be empty. Every metric needs a description.
        metrics=[],
        # Example: parameter('score', raw['score'], 'Оценка модели',
        #                    description='What this number measures', unit='...')
        # REQUIRED: conditions that actually apply to this model and dataset.
        limitations=[],  # User-relevant limits; research notes belong in docs.,
        # REQUIRED: preserve ALL original fields, including unknown future ones.
        raw_output=raw,
        # Optional: custom typed parameters/tables for the Details section.
        # Without parameters the helper wraps raw_output automatically.
        report_blocks=[text_block('summary', 'Не удалось получить однозначную оценку.'), table_block('metrics', [])],
        artifacts=[],  # Only registered file IDs; no arbitrary file paths/URLs.
        warnings=[],
    )


def analyze(payload):
    state, reason = status()
    if state != "configured":
        raise AdapterError("model_unavailable", reason, 503)
    return present(infer(payload))
