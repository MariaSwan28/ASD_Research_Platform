"""Developer-only adapter discovery and dispatch.

To add an adapter, place a trusted Python module in ``core/ml_adapters``
which exports MODEL, status() and analyze(payload). No server routes or
frontend code need to be changed. Modules may execute code on import, so
never load these files from user-upload directories.
"""
import importlib
import pkgutil
import logging
import re
from core.report_contract import validate_schema
from core import ml_adapters


def _adapters():
    found = {}
    for info in pkgutil.iter_modules(ml_adapters.__path__, ml_adapters.__name__ + "."):
        try:
            adapter = importlib.import_module(info.name)
        except Exception:
            logging.getLogger(__name__).exception("Cannot import adapter: %s", info.name)
            continue
        definition = getattr(adapter, "MODEL", None)
        if not isinstance(definition, dict):
            continue
        identifier = definition.get("id")
        if not isinstance(identifier, str) or not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}", identifier):
            raise RuntimeError(f"Invalid model ID in {info.name}")
        if identifier in found:
            raise RuntimeError(f"Duplicate model ID: {identifier}")
        if not callable(getattr(adapter, "analyze", None)):
            raise RuntimeError(f"Missing analyze() in {info.name}")
        if not callable(getattr(adapter, "status", None)):
            raise RuntimeError(f"Missing status() in {info.name}")
        for key in ("version", "modality", "operation", "label"):
            if not isinstance(definition.get(key), str) or not definition[key].strip():
                raise RuntimeError(f"Missing {key} in {info.name}")
        for key in ("extensions", "input_types"):
            if not isinstance(definition.get(key), list) or not definition[key] or not all(isinstance(v, str) for v in definition[key]):
                raise RuntimeError(f"Invalid {key} in {info.name}")
        if definition.get("result_schema_version") not in ("1.0", "1.1", "1.2", "1.3"):
            raise RuntimeError(f"Unsupported result schema in {info.name}")
        if definition.get('result_schema_version') == '1.3':
            validate_schema(definition.get('report_schema'))
        found[identifier] = adapter
    return found


def get_adapter(model_id):
    return _adapters().get(model_id)


def list_capabilities():
    result = []
    for identifier, adapter in _adapters().items():
        try:
            state, reason = adapter.status()
            if state not in ("configured", "unavailable"):
                raise ValueError("invalid_adapter_status")
        except Exception:
            logging.getLogger(__name__).exception("Adapter status failed: %s", identifier)
            state, reason = "unavailable", "status_check_failed"
        result.append({**adapter.MODEL, "status": state, "reason": reason})
    return result
