"""Generate a local report example without changing the platform or its database."""
import argparse
import json
import os
from pathlib import Path
import sys
from uuid import uuid4
from unittest.mock import patch

parser=argparse.ArgumentParser(description='Пример отчёта: текст, таблица и три изображения')
parser.add_argument('--output-dir',default='report-demo')
parser.add_argument('--text-file',help='Необязательный TXT для технической статистики')
args=parser.parse_args()
root=Path(__file__).resolve().parents[1]
output=Path(args.output_dir).resolve()
os.environ['ML_DIR_PATH']=str(output)
sys.path.insert(0,str(root/'ml-service'))
from core.adapter_runner import run_model
from templates import report_example
content=Path(args.text_file).read_text(encoding='utf-8') if args.text_file else 'Пример текста.\nВторая строка для проверки отчёта.'
payload={'user_id':'demo-owner','analysis_id':str(uuid4()),'file_id':str(uuid4()),'text':content}
with patch('core.adapter_runner.get_adapter',return_value=report_example):
    result,status=run_model(report_example.MODEL['id'],payload)
output.mkdir(parents=True,exist_ok=True)
target=output/'report.json';target.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(f'Отчёт: {target}')
print(f'Статус: {result["status"]}. Блоков: {len(result.get("report",{}).get("blocks",[]))}')
if status!=200 or result['status']!='completed':raise SystemExit(1)
