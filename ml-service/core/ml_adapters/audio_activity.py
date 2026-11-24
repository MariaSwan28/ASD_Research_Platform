"""Third, explicitly algorithmic adapter: sound activity, NOT vocalization ML."""
import json
import logging
import shutil
import subprocess
import tempfile
from pathlib import Path
import wave
from core.run_artifacts import run_directory, register_artifact
from core.report_plots import make_plot
from core.result_contract import AdapterError, make_result, parameter
from core.report_contract import text_block, table_block, file_block, metric_rows, METRIC_COLUMNS


MODEL = {'id': 'audio-activity-v1', 'version': 'energy-1.0', 'label': 'Звуковая активность',
         'modality': 'audio', 'operation': 'sound-activity-detection', 'result_schema_version': '1.3',
         'extensions': ['.wav', '.mp3', '.m4a', '.flac', '.ogg', '.aac', '.mp4', '.mov', '.webm'],
         'input_types': ['audio/wav', 'audio/mpeg', 'audio/mp4', 'audio/flac', 'audio/ogg', 'audio/aac', 'video/mp4', 'video/quicktime', 'video/webm']}

MODEL['report_schema'] = {'version':'1.0','blocks':[
    {'id':'conclusion','type':'text','title':'Итог анализа','required':True},
    {'id':'metrics','type':'table','title':'Основные показатели','required':True,'columns':METRIC_COLUMNS},
    {'id':'intervals','type':'table','title':'Участки звуковой активности','required':True,
     'columns':[{'key':'start_sec','label':'Начало','unit':'с'},{'key':'end_sec','label':'Конец','unit':'с'},{'key':'duration_sec','label':'Длительность','unit':'с'}]},
    {'id':'timeline','type':'image','title':'Активность на записи','required':False,'media_types':['image/png']},
    {'id':'recording','type':'audio','title':'Проанализированная звуковая дорожка','required':False,'media_types':['audio/wav']}
]}

def status():
    return ('configured', None) if shutil.which('ffmpeg') and shutil.which('ffprobe') else ('unavailable', 'Аудиоанализ недоступен')

def detect(samples, sample_rate):
    import numpy as np
    signal = np.asarray(samples, dtype=np.float64)
    frame, hop = int(sample_rate * 0.1), int(sample_rate * 0.05)
    if len(signal) < frame: return [], 0.0
    starts = list(range(0, len(signal) - frame + 1, hop))
    rms = np.array([np.sqrt(np.mean(signal[i:i+frame]**2)) for i in starts])
    threshold = max(float(np.median(rms)) * 1.5, 0.0001)
    # Join active windows, then retain intervals of at least half a second.
    spans = []
    for offset, active in zip(starts, rms > threshold):
        if not active: continue
        start, end = offset/sample_rate, min((offset+frame)/sample_rate, len(signal)/sample_rate)
        if spans and start <= spans[-1][1] + 1e-9: spans[-1][1] = end
        else: spans.append([start, end])
    spans = [x for x in spans if x[1]-x[0] >= 0.5]
    merged = []
    for start, end in spans:
        if merged and start - merged[-1][1] <= 1.0: merged[-1][1] = end
        else: merged.append([start, end])
    return [{'start_sec': start, 'end_sec': end, 'duration_sec': end-start} for start, end in merged], threshold

def analyze(payload):
    import numpy as np
    artifacts = []
    path = Path(payload['file_path'])
    if not path.is_file(): raise AdapterError('audio_missing', 'Запись не найдена', 404)
    try:
        probe = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-show_entries', 'stream=codec_type', '-of', 'json', str(path)], capture_output=True, text=True, timeout=20, check=True)
        info = json.loads(probe.stdout)
        if not any(x.get('codec_type') == 'audio' for x in info.get('streams', [])):
            raise AdapterError('no_audio_stream', 'В записи нет звуковой дорожки', 422)
        duration = float(info.get('format', {}).get('duration', 0))
        if duration <= 0 or duration > 600: raise AdapterError('audio_duration', 'Для аудиоанализа нужна запись до 10 минут', 422)
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)/'audio.wav'
            subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-vn', '-ac', '1', '-ar', '16000', '-t', '601', '-c:a', 'pcm_s16le', str(output)], capture_output=True, timeout=120, check=True)
            with wave.open(str(output), 'rb') as audio:
                if audio.getnframes() > 16000*601: raise ValueError('audio_too_large')
                samples = np.frombuffer(audio.readframes(audio.getnframes()), dtype='<i2').astype(np.float64)/32768
            intervals, threshold = detect(samples, 16000)
            if payload.get('user_id') and payload.get('analysis_id'):
                try:
                    saved = run_directory(payload)/'audio'/'analyzed.wav'
                    saved.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copyfile(output, saved)
                    artifacts.append(register_artifact(payload, saved, 'analyzed-audio', 'Звуковая дорожка', 'audio/wav'))
                except Exception:
                    logging.getLogger(__name__).exception('Optional report recording could not be saved')
    except AdapterError: raise
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        raise AdapterError('audio_processing_failed', 'Не удалось обработать звуковую дорожку', 422) from error
    total = sum(x['duration_sec'] for x in intervals)
    raw = {'intervals': intervals, 'activity_count': len(intervals), 'active_duration_sec': total,
           'duration_sec': duration, 'rms_threshold': threshold, 'sample_rate': 16000,
           'algorithm': 'RMS median*1.5; window=0.1s; hop=0.05s; min=0.5s; merge=1s'}
    plot = make_plot(payload, 'activity', raw)
    if plot: artifacts.append(plot)
    result = make_result(conclusion={'code': 'activity_found' if intervals else 'activity_not_found',
            'title': 'Найдены участки звуковой активности' if intervals else 'Звуковая активность не обнаружена',
            'explanation': 'Отмечены участки с повышенной громкостью.' if intervals else 'Участки повышенной громкости не найдены.'},
        metrics=[parameter('activity_count', len(intervals), 'Участки активности', description='Число объединённых звуковых участков.'),
                 parameter('active_duration_sec', total, 'Общая длительность', unit='с', description='Суммарная длительность выделенных участков.')],
        limitations=['Алгоритм не различает речь, вокализации и посторонний шум.'], raw_output=raw,
        parameters=[parameter('activity_intervals', intervals, 'Временные интервалы', type='table',
                    columns=[{'key':'start_sec','label':'Начало','unit':'с'}, {'key':'end_sec','label':'Конец','unit':'с'}, {'key':'duration_sec','label':'Длительность','unit':'с'}]),
                    parameter('method', raw, 'Данные обработки')])

    result['artifacts'] = artifacts
    result['report_blocks'] = [text_block('conclusion', result['conclusion']['title']+'\n'+result['conclusion']['explanation']),
                               table_block('metrics', metric_rows(result['metrics'])), table_block('intervals', intervals)]
    if plot: result['report_blocks'].append(file_block('timeline', plot['id']))
    if any(x['id']=='analyzed-audio' for x in artifacts): result['report_blocks'].append(file_block('recording', 'analyzed-audio'))
    return result
