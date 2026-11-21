"""Custom presentation for the installed CountVectorizer + NB text pipeline.

Label meanings follow Lebedeva's thesis p.33. The sentence-wise pipeline follows pp.61-64; segmentation uses regex rather than Punkt.
"""
from core.text_adapter import analyze_text, text_model_status
from core.result_contract import AdapterError, make_result, parameter

MODEL = {
    "id": "parent-story-nb",
    "version": "bachelor-2024-count-sentences-v2",
    "modality": "text",
    "input_types": ["text/plain"],
    "extensions": [".txt"],
    "operation": "text-classification",
    "label": "Анализ рассказа родителя",
    "result_schema_version": "1.2",
}

LABELS = {
    0: {
        "code": "story_class_0",
        "title": "Рассказ отнесён к категории «без РАС»",
        "explanation": "Оценка относится к тексту рассказа и не исключает РАС у ребёнка.",
    },
    1: {
        "code": "story_class_1",
        "title": "Рассказ отнесён к категории «РАС»",
        "explanation": "В рассказе обнаружено сходство с текстами о детях с РАС.",
    },
}


def status():
    state = text_model_status()
    return ("configured", None) if state == "configured" else ("unavailable", state)


def analyze(payload):
    try:
        raw = analyze_text(payload["text"])
    except ValueError as error:
        if str(error) == 'text_has_no_known_words':
            raise AdapterError('text_has_no_known_words', 'В рассказе недостаточно знакомых модели слов', 422) from error
        raise
    label = raw.get("label")
    conclusion = LABELS.get(label) if type(label) is int else None
    conclusion = conclusion or {
        "code": "unknown_story_class",
        "title": "Результат не определён",
        "explanation": "Не удалось получить однозначную оценку рассказа.",
    }
    if raw.get('result_band') == 'mixed':
        conclusion = {'code': 'mixed_story', 'title': 'Смешанный результат',
                      'explanation': 'Фрагменты рассказа отнесены к разным категориям.'}
    names = {"label": "Исходная метка класса", "features_nonzero": "Распознанные признаки словаря"}
    metrics = []
    if 'sentences_analyzed' in raw:
        metrics = [parameter('sentences_analyzed', raw['sentences_analyzed'], 'Проанализировано фрагментов',
                             description='Фрагменты рассказа, содержащие слова из словаря модели.'),
                   parameter('positive_fraction', raw['positive_fraction'] * 100, 'Фрагменты категории «РАС»', unit='%',
                             description='Доля классифицированных фрагментов; не вероятность РАС у ребёнка.')]
    details = [parameter(key, value, names.get(key)) for key, value in raw.items()
               if key not in ('status', 'model_id', 'model_version', 'disclaimer')]
    if 'sentences' in raw:
        details.insert(0, parameter('sentence_results',
            [{'text': row['text'], 'category': 'Не оценён' if row['label'] is None else 'РАС' if row['label'] == 1 else 'Без РАС'} for row in raw['sentences']],
            'Фрагменты рассказа', type='table', columns=[{'key': 'text', 'label': 'Фрагмент'}, {'key': 'category', 'label': 'Категория'}]))
    return make_result(
        conclusion=dict(conclusion), metrics=metrics,
        limitations=["Результат зависит от полноты и точности рассказа."] +
                     (["Некоторые фрагменты не удалось оценить: в них нет слов из словаря модели."] if raw.get('sentences_skipped') else []),
        raw_output=raw,
        parameters=details,
        warnings=[],
    )
