"""Execute adapters without Flask; HTTP is only a transport layer."""
import logging
import time
from core.model_registry import get_adapter
from core.result_contract import AdapterError, ContractError, envelope, utc_now, validate_presentation

logger = logging.getLogger(__name__)


def run_model(model_id, payload):
    started_at, clock = utc_now(), time.monotonic()
    context = payload if isinstance(payload, dict) else {}
    model = {"id": model_id, "label": model_id, "version": "unknown",
             "modality": "unknown", "operation": "unknown"}
    try:
        adapter = get_adapter(model_id)
        if adapter is None:
            raise AdapterError("model_not_found", "Модель не найдена", 404)
        model = adapter.MODEL
        if not isinstance(payload, dict):
            raise AdapterError("invalid_payload", "Ожидается JSON-объект", 400)
        for field in ("analysis_id", "file_id"):
            if field in payload and (not isinstance(payload[field], str) or not payload[field].strip()):
                raise AdapterError("invalid_context", "Некорректный идентификатор запуска или файла", 400)
        state, reason = adapter.status()
        if state != "configured":
            raise AdapterError("model_unavailable", reason or "Модель недоступна", 503)
        result = adapter.analyze(payload)
        if model.get("result_schema_version") in ("1.1", "1.2"):
            if not isinstance(result, dict):
                raise ContractError("adapter_result_must_be_object")
            validate_presentation(result)
        return envelope(model, context, started_at, round((time.monotonic() - clock) * 1000), result=result), 200
    except AdapterError as exc:
        code, message, http_status = exc.code, str(exc), exc.http_status
    except ContractError:
        logger.exception("Invalid adapter output: %s", model_id)
        code, message, http_status = "invalid_model_result", "Модель вернула результат с неверной структурой", 502
    except (ValueError, KeyError, TypeError):
        logger.exception("Invalid model input: %s", model_id)
        code, message, http_status = "invalid_model_input", "Входные данные не подходят для модели", 400
    except Exception:
        logger.exception("Adapter execution failed: %s", model_id)
        code, message, http_status = "model_execution_failed", "Не удалось выполнить модель", 503
    # Untrusted malformed context must not break JSON serialization of failures.
    context = {k: v for k, v in context.items() if k in ("analysis_id", "file_id") and isinstance(v, str)}
    return envelope(model, context, started_at, round((time.monotonic() - clock) * 1000),
                    error={"code": code, "message": message}), http_status
