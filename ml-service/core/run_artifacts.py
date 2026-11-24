"""Run-local output manifests. Only opaque IDs cross the public API."""
import json
from pathlib import Path

def register_video_outputs(directory, video_stem):
    directory = Path(directory)
    definitions = [('processed-video', 'Обработанное видео', 'video/mp4', f'videos/{video_stem}_analysis.mp4'),
                   ('features-json', 'Характеристики движений', 'application/json', f'features/{video_stem}.json'),
                   ('time-series', 'Временные ряды', 'application/octet-stream', f'timeseries/{video_stem}.npz')]
    manifest = {}
    artifacts = []
    for identifier, label, media_type, relative in definitions:
        if (directory/relative).is_file():
            manifest[identifier] = {'path': relative, 'media_type': media_type}
            artifacts.append({'id': identifier, 'label': label, 'media_type': media_type, 'file_id': identifier})
    temporary = directory/'manifest.tmp'
    temporary.write_text(json.dumps(manifest, ensure_ascii=False), encoding='utf-8')
    temporary.replace(directory/'manifest.json')
    return artifacts

# Shared helpers for report images/audio/video and downloadable files.
import re
from config.config import DATASET_PATH

_SAFE_ID = re.compile(r'^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$')

def run_directory(payload):
    from core.result_contract import AdapterError
    user, run = payload.get('user_id'), payload.get('analysis_id')
    if not isinstance(user, str) or not _SAFE_ID.fullmatch(user) or not isinstance(run, str) or not _SAFE_ID.fullmatch(run):
        raise AdapterError('invalid_run_context', 'Не указан контекст сохранения отчёта', 400)
    root = Path(DATASET_PATH).resolve() / user / 'runs' / run
    if root.resolve() != root: raise AdapterError('invalid_run_directory', 'Каталог отчёта недоступен', 400)
    return root

def register_artifact(payload, file_path, artifact_id, label, media_type):
    from core.result_contract import ContractError
    if not isinstance(artifact_id, str) or not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}', artifact_id): raise ContractError('invalid_artifact_id')
    root = run_directory(payload).resolve()
    actual = Path(file_path).resolve()
    try: relative = actual.relative_to(root)
    except ValueError as error: raise ContractError('artifact_outside_run') from error
    if not relative.parts or not actual.is_file(): raise ContractError('artifact_file_missing')
    manifest_path = root / 'manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8')) if manifest_path.exists() else {}
    entry = {'path': relative.as_posix(), 'media_type': media_type}
    if artifact_id in manifest and manifest[artifact_id] != entry: raise ContractError('duplicate_artifact_id')
    manifest[artifact_id] = entry
    temporary = root / 'manifest.tmp'
    temporary.write_text(json.dumps(manifest, ensure_ascii=False), encoding='utf-8')
    temporary.replace(manifest_path)
    return {'id': artifact_id, 'label': label, 'media_type': media_type, 'file_id': artifact_id}

def artifact_exists(payload, artifact):
    try:
        root = run_directory(payload).resolve()
        manifest = json.loads((root/'manifest.json').read_text(encoding='utf-8'))
        entry = manifest.get(artifact['id'])
        if not isinstance(entry, dict) or entry.get('media_type') != artifact['media_type'] or not isinstance(entry.get('path'), str): return False
        relative = Path(entry['path'])
        if relative.is_absolute() or '..' in relative.parts: return False
        actual = (root/relative).resolve()
        actual.relative_to(root)
        return actual != root and actual.is_file()
    except (OSError, ValueError, KeyError, TypeError): return False
    except Exception: return False
