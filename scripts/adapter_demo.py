"""Prove discovery by adding only one adapter in a disposable source copy."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

root=Path(__file__).resolve().parents[1]
ml=root/'ml-service'
source=ml/'core/ml_adapters/audio_activity.py'
core_files=list((root/'frontend/src').rglob('*'))+list((root/'bff/routes').glob('*.js'))+list((root/'bff/controllers').glob('*.js'))
def snapshot():
    return {str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in core_files if p.is_file()}
before_hashes=snapshot()
with tempfile.TemporaryDirectory() as temporary:
    sandbox=Path(temporary)
    for directory in ('core','config','resources'):
        shutil.copytree(ml/directory,sandbox/directory,ignore=shutil.ignore_patterns('__pycache__','*.pyc'))
    target=sandbox/'core/ml_adapters/audio_activity.py'
    target.unlink()
    env={**os.environ,'PYTHONPATH':str(sandbox),'ENABLE_TRUSTED_TEXT_PICKLES':'0'}
    code='import json;from core.model_registry import list_capabilities;print(json.dumps(sorted(x["id"] for x in list_capabilities())))'
    before=json.loads(subprocess.check_output([sys.executable,'-c',code],env=env,cwd=sandbox,text=True))
    shutil.copyfile(source,target)
    after=json.loads(subprocess.check_output([sys.executable,'-c',code],env=env,cwd=sandbox,text=True))
assert sorted(set(after)-set(before))==['audio-activity-v1']
assert snapshot()==before_hashes
print(json.dumps({'before':before,'after':after,'added_file':'core/ml_adapters/audio_activity.py','react_and_bff_unchanged':True},ensure_ascii=False,indent=2))
