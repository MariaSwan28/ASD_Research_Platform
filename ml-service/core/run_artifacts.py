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
