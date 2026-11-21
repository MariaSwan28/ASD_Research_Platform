"""Restore our own validated backup. Existing data is replaced only on opt-in."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tarfile

def sha256(path):
    result=hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda:stream.read(1024*1024),b''):result.update(block)
    return result.hexdigest()

parser=argparse.ArgumentParser()
parser.add_argument('backup_folder')
parser.add_argument('--compose',default='docker-compose.yml')
parser.add_argument('--confirm-restore',action='store_true')
args=parser.parse_args()
if not args.confirm_restore:parser.error('Make a current backup, then pass --confirm-restore to replace active data')
folder=Path(args.backup_folder).resolve()
manifest=json.loads((folder/'manifest.json').read_text())
for filename,roots in [('bff.tar.gz',{'data','files','static'}),('ml-service.tar.gz',{'dataset'})]:
    archive=folder/filename
    if sha256(archive)!=manifest.get(filename):raise ValueError('Backup checksum mismatch')
    with tarfile.open(archive) as tar:
        for entry in tar:
            pieces=entry.name.split('/')
            if pieces[0] not in roots or '..' in pieces or not (entry.isdir() or entry.isfile()):raise ValueError('Unsafe backup entry')
root=Path(__file__).resolve().parents[1];os.chdir(root)
compose=['docker','compose','-f',args.compose]
subprocess.run(compose+['stop','bff','ml-service'],check=True)
for service,roots in [('bff',['data','files','static']),('ml-service',['dataset'])]:
    # Clear WAL as well as the main DB before extraction. Keep services stopped
    # on any failure instead of starting against an incomplete restoration.
    command='find '+' '.join('/app/'+p for p in roots)+' -mindepth 1 -delete; tar -xzf - -C /app'
    with (folder/(service+'.tar.gz')).open('rb') as stream:
        subprocess.run(compose+['run','--rm','--no-deps','-T',service,'sh','-ec',command],stdin=stream,check=True)
subprocess.run(compose+['start','ml-service','bff'],check=True)
print('Data restored. private.env was NOT restored automatically; preserve the current deployment secrets.')
