"""Developer example only: three plots, a table and text; NOT a clinical model.

Outside core/ml_adapters, so it never appears in the production model catalog.
"""
import importlib.util
from core.result_contract import make_result
from core.report_contract import text_block, table_block, file_block
from core.run_artifacts import run_directory, register_artifact

MODEL = {'id':'report-layout-example','version':'demo-1','label':'Пример структуры отчёта',
         'modality':'text','operation':'developer-demo','extensions':['.txt'],'input_types':['text/plain'],
         'result_schema_version':'1.3','report_schema':{'version':'1.0','blocks':[
             {'id':'summary','type':'text','title':'Описание','required':True},
             {'id':'table','type':'table','title':'Статистика текста','required':True,'columns':[{'key':'metric','label':'Показатель'},{'key':'value','label':'Количество'}]},
             *[{'id':f'plot-{i}','type':'image','title':title,'required':True,'media_types':['image/png']}
               for i,title in enumerate(['Длина текста','Слова','Строки'],1)]
         ]}}

def status():
    return ('configured',None) if importlib.util.find_spec('matplotlib') else ('unavailable','Для примера нужен matplotlib')

def analyze(payload):
    from matplotlib.figure import Figure
    from matplotlib.backends.backend_agg import FigureCanvasAgg
    content = payload['text']
    rows = [{'metric':'Символы','value':len(content)}, {'metric':'Слова','value':len(content.split())},
            {'metric':'Непустые строки','value':sum(bool(line.strip()) for line in content.splitlines())}]
    artifacts=[]
    for i,row in enumerate(rows,1):
        figure=Figure(figsize=(6,2.8),layout='constrained');FigureCanvasAgg(figure);axis=figure.subplots()
        axis.barh([row['metric']],[row['value']],color='#698f7b');axis.set_xlabel('Количество');axis.set_title(row['metric'])
        destination=run_directory(payload)/'images'/f'plot-{i}.png';destination.parent.mkdir(parents=True,exist_ok=True)
        figure.savefig(destination,dpi=130);figure.clear()
        artifacts.append(register_artifact(payload,destination,f'image-{i}',row['metric'],'image/png'))
    return make_result(conclusion={'code':'demo','title':'Пример отчёта сформирован','explanation':'Технический пример, не модель оценки РАС.'},
                       metrics=[],limitations=[],raw_output={'statistics':rows},artifacts=artifacts,
                       report_blocks=[text_block('summary','Технический пример: три изображения, таблица и текст. Числа рассчитаны по входному тексту и не имеют медицинского смысла.'),
                                      table_block('table',rows),*[file_block(f'plot-{i}',f'image-{i}') for i in range(1,4)]])
