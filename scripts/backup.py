"""Consistent cross-platform backup. Requires Python and running Docker Compose."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess

def sha256(path):
    result=hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda:stream.read(1024*1024),b''):result.update(block)
    return result.hexdigest()

parser=argparse.ArgumentParser()
parser.add_argument('--compose',default='docker-compose.yml')
parser.add_argument('--output',default='backups')
args=parser.parse_args()
root=Path(__file__).resolve().parents[1];os.chdir(root)
folder=Path(args.output).resolve()/datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ');folder.mkdir(parents=True,exist_ok=False)
compose=['docker','compose','-f',args.compose]
subprocess.run(compose+['stop','bff','ml-service'],check=True)
try:
    for service,paths in [('bff',['data','files','static']),('ml-service',['dataset'])]:
        with (folder/(service+'.tar.gz')).open('wb') as stream:
            subprocess.run(compose+['run','--rm','--no-deps','-T',service,'tar','-czf','-','-C','/app']+paths,stdout=stream,check=True)
    if (root/'.env').exists():shutil.copyfile(root/'.env',folder/'private.env')
    hashes={p.name:sha256(p) for p in folder.iterdir() if p.is_file()}
    (folder/'manifest.json').write_text(json.dumps(hashes,indent=2))
    try:
        os.chmod(folder,0o700)
        for p in folder.iterdir():os.chmod(p,0o600)
    except OSError:pass
finally:
    subprocess.run(compose+['start','ml-service','bff'],check=True)
print('Backup saved:',folder)
