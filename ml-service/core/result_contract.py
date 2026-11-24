"""Versioned, dependency-free result contract shared by trusted adapters."""
import json
import math
from datetime import datetime, timezone
from uuid import uuid4

SCHEMA_VERSION = "1.2"


class AdapterError(Exception):
    def __init__(self, code, message, http_status=400):
        super().__init__(message)
        self.code = code
        self.http_status = http_status


class ContractError(ValueError):
    pass


def utc_now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def parameter(key, value, label=None, **metadata):
    """Describe existing output without dropping unknown keys or list items."""
    if value is not None and not isinstance(value, (str, bool, int, float, dict, list)):
        # numpy scalars/arrays, without making numpy a registry dependency.
        if hasattr(value, "tolist"):
            value = value.tolist()
    if isinstance(value, dict):
        kind = "object"
        value = {str(k): parameter(str(k), v) for k, v in value.items()}
    elif isinstance(value, list):
        kind = "array"
    elif isinstance(value, bool):
        kind = "boolean"
    elif isinstance(value, int):
        kind = "integer"
    elif isinstance(value, float):
        kind = "number"
    elif isinstance(value, str):
        kind = "string"
    elif value is None:
        kind = "json"
    else:
        raise ContractError("unsupported_parameter_value")
    return {"key": key, "label": label or key, "type": kind, "value": value, **metadata}


def _require(condition, message):
    if not condition:
        raise ContractError(message)


def validate_parameter(item):
    _require(isinstance(item, dict), "parameter_must_be_object")
    for key in ("key", "label", "type"):
        _require(isinstance(item.get(key), str) and bool(item[key].strip()), "parameter_" + key + "_required")
    _require("value" in item, "parameter_value_required")
    for key in ("unit", "description"):
        _require(key not in item or isinstance(item[key], str), "invalid_parameter_" + key)
    value, kind = item["value"], item["type"]
    if value is None:
        return  # missing values are never replaced by zero
    checks = {
        "string": lambda: isinstance(value, str),
        "boolean": lambda: isinstance(value, bool),
        "integer": lambda: type(value) is int,
        "number": lambda: type(value) in (int, float) and math.isfinite(value),
        "array": lambda: isinstance(value, list),
        "object": lambda: isinstance(value, dict),
        "table": lambda: isinstance(value, list),
    }
    # Unknown types are permitted as JSON; the UI provides a fallback.
    if kind in checks:
        _require(checks[kind](), "parameter_type_mismatch:" + item["key"])
    if kind == "object":
        for key, child in value.items():
            validate_parameter(child)
            _require(child["key"] == key, "object_parameter_key_mismatch")
    if kind == "table":
        columns = item.get("columns")
        _require(isinstance(columns, list) and bool(columns), "table_columns_required")
        keys = []
        for column in columns:
            _require(isinstance(column, dict) and isinstance(column.get("key"), str)
                     and isinstance(column.get("label"), str), "invalid_table_column")
            keys.append(column["key"])
        _require(len(keys) == len(set(keys)), "duplicate_table_column")
        _require(all(isinstance(row, dict) and set(row).issubset(keys) for row in value), "invalid_table_row")


def validate_adapter_result(result):
    _require(isinstance(result, dict), "adapter_result_must_be_object")
    base = {"summary", "parameters", "artifacts", "warnings"}
    extra = {"conclusion", "metrics", "limitations", "raw_output"}
    _require(base.issubset(result) and set(result).issubset(base | extra | {"partial_error", "report_blocks", "report"}), "invalid_adapter_result_fields")
    _require(not (set(result) & extra) or extra.issubset(result), "incomplete_presentation")
    if "conclusion" in result:
        validate_presentation(result)
    _require(isinstance(result["summary"], str) and bool(result["summary"].strip()), "summary_required")
    _require(isinstance(result["parameters"], list), "parameters_must_be_array")
    keys = []
    for item in result["parameters"]:
        validate_parameter(item)
        keys.append(item["key"])
    _require(len(keys) == len(set(keys)), "duplicate_parameter_key")
    _require(isinstance(result["warnings"], list) and all(isinstance(w, str) for w in result["warnings"]), "invalid_warnings")
    _require(isinstance(result["artifacts"], list), "invalid_artifacts")
    for item in result["artifacts"]:
        _require(isinstance(item, dict) and set(item).issubset({"id", "label", "media_type", "file_id"}), "invalid_artifact_fields")
        _require(all(isinstance(item.get(k), str) and bool(item[k]) for k in ("id", "label", "media_type")), "invalid_artifact")
        _require("file_id" not in item or isinstance(item["file_id"], str), "invalid_artifact_file_id")
    if 'report_blocks' in result:
        _require(isinstance(result['report_blocks'], list), 'report_blocks_must_be_list')
    if 'report' in result:
        from core.report_contract import validate_report
        validate_report(result['report'], result['artifacts'])
    if result.get("partial_error") is not None:
        err = result["partial_error"]
        _require(isinstance(err, dict) and all(isinstance(err.get(k), str) and err[k].strip() for k in ("code", "message")), "invalid_partial_error")
    try:
        json.dumps(result, allow_nan=False)
    except (ValueError, TypeError) as exc:
        raise ContractError("result_not_finite_json") from exc
    return result


def validate_presentation(result):
    c = result.get("conclusion")
    _require(isinstance(c, dict), "conclusion_required")
    for key in ("code", "title", "explanation"):
        _require(isinstance(c.get(key), str) and bool(c[key].strip()), "conclusion_" + key + "_required")
    _require(isinstance(result.get("metrics"), list), "metrics_required")
    for item in result["metrics"]:
        validate_parameter(item)
        _require(item["type"] in ("string", "number", "integer", "boolean") and not isinstance(item["value"], (list, dict)), "metric_must_be_scalar")
        _require(isinstance(item.get("description"), str) and bool(item["description"].strip()), "metric_description_required")
    _require(len({m["key"] for m in result["metrics"]}) == len(result["metrics"]), "duplicate_metric")
    _require(isinstance(result.get("limitations"), list) and all(isinstance(x, str) for x in result["limitations"]), "limitations_required")
    _require("raw_output" in result, "raw_output_required")


def envelope(model, context, started_at, duration_ms, result=None, error=None):
    if error is None:
        validate_adapter_result(result)
    presentation = {
        "conclusion": {"code": error["code"] if error else "completed",
                       "title": "Анализ не выполнен" if error else "Обработка завершена",
                       "explanation": error["message"] if error else result["summary"]},
        "metrics": [], "limitations": result["warnings"] if result else [],
        "raw_output": {"parameters": result["parameters"]} if result else None,
    }
    if result and "conclusion" in result:
        presentation = {key: result[key] for key in presentation}
    report = result.get('report') if result else None
    if error and model.get('result_schema_version') == '1.3':
        from core.report_contract import build_report
        try: report = build_report(model.get('report_schema'), [], [], failure_message='Анализ не выполнен')
        except ContractError: report = None
    return {
        **({'report': report} if report is not None else {}),
        **presentation,
        "schema_version": "1.3" if report is not None else SCHEMA_VERSION,
        "analysis_id": context.get("analysis_id") or str(uuid4()),
        "status": "failed" if error else "partial" if result.get("partial_error") else "completed",
        "model": {"id": model["id"], "name": model["label"], "version": model["version"],
                  "modality": model["modality"], "operation": model["operation"]},
        "input": {"file_id": context.get("file_id"), "modality": model["modality"]},
        "execution": {"started_at": started_at, "finished_at": utc_now(), "duration_ms": duration_ms},
        "summary": result["summary"] if result else error["message"],
        "parameters": result["parameters"] if result else [],
        "artifacts": result["artifacts"] if result else [],
        "warnings": result["warnings"] if result else [],
        "error": error or (result.get("partial_error") if result else None),
    }


def make_result(*, conclusion, metrics, limitations, raw_output,
                parameters=None, artifacts=None, warnings=None, summary=None, partial_error=None, report_blocks=None):
    """Build a validated adapter payload; execution metadata belongs to runner.

    Four domain fields are deliberately required. The raw output is retained in
    full, including unknown future fields. Never infer labels in this helper.
    """
    _require(isinstance(conclusion, dict), "conclusion_required")
    result = {
        "summary": summary if summary is not None else conclusion.get("title", ""),
        "conclusion": conclusion,
        "metrics": metrics,
        "limitations": limitations,
        "raw_output": raw_output,
        "parameters": parameters if parameters is not None else [parameter("raw_output", raw_output, "Исходные показатели модели")],
        "artifacts": artifacts if artifacts is not None else [],
        "warnings": warnings if warnings is not None else [],
    }
    if report_blocks is not None:
        result["report_blocks"] = report_blocks
    if partial_error is not None:
        result["partial_error"] = partial_error
    return validate_adapter_result(result)
