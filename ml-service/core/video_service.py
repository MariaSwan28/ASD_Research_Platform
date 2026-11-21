"""Single-process legacy video workflow, independent of HTTP and Flask."""
import importlib.util
import logging
from pathlib import Path
import re
import shutil
import threading
import time

from config.config import ANALYZE_MV_CONFIG, DATASET_PATH, MODEL_YOLO_NAME
from core.result_contract import AdapterError
from core.run_artifacts import register_video_outputs

logger = logging.getLogger(__name__)


def video_availability():
    # This checks installation, not the accuracy or runtime success of a model.
    missing = [name for name in ("numpy", "scipy", "sklearn", "cv2", "torch", "ultralytics", "ruptures", "matplotlib")
               if importlib.util.find_spec(name) is None]
    if missing:
        return "unavailable", "missing_dependencies:" + ",".join(missing)
    if not Path(MODEL_YOLO_NAME).is_file():
        return "unavailable", "pose_model_missing"
    if not shutil.which("ffmpeg"):
        return "unavailable", "ffmpeg_missing"
    return "configured", None


def create_analyzer():
    from core.movement_analyzer import MovementAnalyzer
    return MovementAnalyzer(ANALYZE_MV_CONFIG)


class VideoAnalysisService:
    def __init__(self, analyzer_factory=create_analyzer, dataset_path=DATASET_PATH):
        self._factory = analyzer_factory
        self._dataset_path = Path(dataset_path)
        self._lock = threading.Lock()
        self._state = {"is_analyzing": False, "progress": 0, "current_video": None, "current_file_id": None,
                       "current_user": None, "started_at": None, "error": None, "result": None}

    def status(self):
        with self._lock:
            return dict(self._state)

    def analyze(self, payload):
        if not isinstance(payload, dict):
            raise AdapterError("invalid_payload", "Ожидается JSON-объект")
        user_id, video_path = payload.get("user_id"), payload.get("video_path")
        if not isinstance(user_id, str) or not re.fullmatch(r"[a-zA-Z0-9_-]{1,100}", user_id):
            raise AdapterError("invalid_user_id", "Некорректный user_id")
        if not isinstance(video_path, str) or not video_path:
            raise AdapterError("invalid_video_path", "Требуется video_path")
        if not Path(video_path).is_file():
            raise AdapterError("video_not_found", "Видеофайл не найден", 404)
        run_id = payload.get("analysis_id")
        if run_id is not None and (not isinstance(run_id, str) or not re.fullmatch(r"[a-zA-Z0-9_-]{1,100}", run_id)):
            raise AdapterError("invalid_analysis_id", "Некорректный запуск анализа")
        with self._lock:
            if self._state["is_analyzing"]:
                raise AdapterError("analysis_busy", "Другое видео уже анализируется", 409)
            self._state.update(is_analyzing=True, progress=0, current_video=video_path,
                               current_file_id=payload.get("file_id"),
                               current_user=user_id, started_at=time.time(), error=None, result=None)
        try:
            # A fresh analyzer prevents metrics from a previous video leaking into this run.
            analyzer = self._factory()
            output_dir = self._dataset_path / user_id
            if run_id:
                output_dir = output_dir / "runs" / run_id
                if output_dir.exists():
                    raise RuntimeError("run_output_already_exists")
            output_dir.mkdir(parents=True, exist_ok=True)

            def update_progress(value):
                with self._lock:
                    self._state["progress"] = value

            analyzer.set_progress_callback(update_progress)
            update_progress(5)
            result = analyzer.export_dataset_sample(video_path=video_path, output_dir=str(output_dir))
            if not isinstance(result, dict):
                raise RuntimeError("invalid_video_result")
            if run_id:
                result["output_artifacts"] = register_video_outputs(output_dir, Path(video_path).stem)
            with self._lock:
                self._state.update(progress=100, result=result)
            return result
        except Exception as exc:
            with self._lock:
                self._state.update(error="video_execution_failed", result=None)
            logger.exception("Video processing failed")
            raise AdapterError("video_execution_failed", "Не удалось обработать видео", 503) from exc
        finally:
            with self._lock:
                self._state["is_analyzing"] = False


video_service = VideoAnalysisService()
