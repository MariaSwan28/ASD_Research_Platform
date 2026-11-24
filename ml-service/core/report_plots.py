"""Plots are prepared by the adapter, never inferred by the web interface."""
import logging
import threading
from core.run_artifacts import run_directory, register_artifact
_lock = threading.Lock()
logger = logging.getLogger(__name__)

def make_plot(payload, kind, data):
    if not payload.get('user_id') or not payload.get('analysis_id'): return None
    try:
        from matplotlib.figure import Figure
        from matplotlib.backends.backend_agg import FigureCanvasAgg
        with _lock:
            figure = Figure(figsize=(8, 3.6), layout='constrained')
            FigureCanvasAgg(figure)
            axes = figure.subplots()
            if kind == 'activity':
                axes.set_title('Участки звуковой активности')
                for span in data['intervals']: axes.broken_barh([(span['start_sec'], span['duration_sec'])], (0.2,0.6), facecolors='#698f7b')
                axes.set_xlim(0, max(data['duration_sec'], .1)); axes.set_ylim(0,1)
                axes.set_yticks([]); axes.set_xlabel('Время, с')
                label = 'Участки звуковой активности'
            else:
                values = data.get('aggregated_features', {}).get('movement_frequency', {})
                pairs = [(key.replace('_',' '), value) for key,value in values.items() if isinstance(value,(int,float))]
                if not pairs: return None
                axes.barh([x[0] for x in pairs], [x[1] for x in pairs], color='#698f7b')
                axes.set_title('Резкие движения по частям тела'); axes.set_xlabel('События в минуту')
                label = 'Частота резких движений'
            axes.tick_params(labelsize=11)
            axes.xaxis.label.set_size(12)
            axes.title.set_size(14)
            axes.grid(axis='x', alpha=.2)
            destination = run_directory(payload)/'images'/(kind+'.png')
            destination.parent.mkdir(parents=True, exist_ok=True)
            figure.savefig(destination, dpi=130)
            figure.clear()
        return register_artifact(payload, destination, kind+'-plot', label, 'image/png')
    except Exception:
        logger.exception('Optional report plot could not be created')
        return None
