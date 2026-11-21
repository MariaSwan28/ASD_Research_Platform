"""Video feature extraction; classification remains a separate legacy call."""
from core.result_contract import AdapterError, make_result, parameter
from core.video_classifier import classify_video
from core.video_service import video_availability, video_service
MODEL = {
    "id": "movement-pose-v1",
    "version": "1.0",
    "modality": "video",
    "input_types": ["video/mp4", "video/webm", "video/quicktime"],
    "extensions": [".mp4", ".webm", ".mov"],
    "operation": "movement-analysis",
    "label": "Анализ движений на видео",
    "result_schema_version": "1.2",
}

def status():
    return video_availability()


def analyze(payload):
    raw = video_service.analyze(payload)
    artifacts = raw.pop("output_artifacts", [])
    partial_error = None
    try:
        raw["classification"] = classify_video(raw)
    except AdapterError as error:
        partial_error = {"code": error.code, "message": str(error)}
        raw["classification_error"] = partial_error
    return present(raw, artifacts=artifacts, partial_error=partial_error)


def present(raw, artifacts=None, partial_error=None):
    """Video-specific descriptions; generic UI renders the same contract."""
    names = {"video_metadata": "Сведения о видео", "aggregated_features": "Характеристики движений",
             "preliminary_annotation": "Предварительная аннотация алгоритма",
             "quality_metrics": "Качество обработки", "time_series_summary": "Сведения о временных рядах"}
    metrics = []
    descriptions = [
        ("video_metadata", "duration_sec", "Продолжительность видео", "с", "Длительность исходной записи."),
        ("quality_metrics", "detection_rate", "Кадры с обнаруженной позой", "%", "На скольких кадрах алгоритм обнаружил позу. Это показатель обработки, а не вероятность РАС."),
        ("aggregated_features", "total_abrupt_movements", "Резкие движения", "", "Число событий по техническому порогу алгоритма. Само по себе не указывает на РАС."),
    ]
    for group, key, label, unit, description in descriptions:
        value = raw.get(group, {}).get(key)
        if value is not None:
            metrics.append(parameter(key, value * 100 if key == "detection_rate" else value, label, unit=unit, description=description))
    parameters = [parameter(key, value, names.get(key)) for key, value in raw.items()]
    features = raw.get("aggregated_features", {})
    frequencies = features.get("frequency_features", {})
    amplitudes = features.get("amplitude_features", {})
    movements = features.get("movement_frequency", {})
    parts = sorted(set(frequencies) | set(amplitudes) | set(movements))
    if parts:
        rows = [{"body_part": part.replace("_", " "),
                 "frequency": frequencies.get(part, {}).get("dominant_frequency_hz"),
                 "events": movements.get(part),
                 "mean_speed": amplitudes.get(part, {}).get("mean_speed")}
                for part in parts]
        overview_key = "movement_overview"
        while overview_key in raw:
            overview_key = "_" + overview_key
        parameters.insert(0, parameter(
            overview_key, rows, "Движения по частям тела", type="table",
            description="Технические характеристики движений. Частота колебаний и число резких событий — разные показатели. Скорость рассчитана в координатах изображения и зависит от масштаба записи.",
            columns=[{"key": "body_part", "label": "Часть тела"},
                     {"key": "frequency", "label": "Основная частота колебаний", "unit": "Гц"},
                     {"key": "events", "label": "Резкие движения", "unit": "1/мин"},
                     {"key": "mean_speed", "label": "Средняя скорость", "unit": "пикс/с"}],
        ))
    classification = raw.get("classification")
    if classification:
        label = classification["prediction_label"]
        conclusion = {"code": "movement_class_" + str(label),
                      "title": "Двигательные паттерны обнаружены" if label == 1 else "Двигательные паттерны не обнаружены",
                      "explanation": "Оценка относится к движениям на этой записи."}
        metrics.insert(0, parameter("classifier_confidence", classification["confidence"] * 100, "Уверенность модели", unit="%",
                                   description="Оценка выбранного класса моделью; не вероятность РАС у ребёнка."))
    else:
        conclusion = {"code": "features_only", "title": "Характеристики движений рассчитаны",
                    "explanation": "Итоговая оценка по видео пока недоступна."}
    return make_result(
        conclusion=conclusion,
        metrics=metrics,
        limitations=["Качество обработки зависит от видимости человека и ракурса записи."] +
                    (["Часть дополнительных данных отсутствовала и заменена нулями по исходному алгоритму; оценка может быть менее надёжной."]
                     if classification and classification.get("defaulted_features") else []),
        artifacts=artifacts or [], partial_error=partial_error,
        raw_output=raw,
        summary="Извлечение характеристик движений завершено",
        parameters=parameters,
        warnings=[],
    )
