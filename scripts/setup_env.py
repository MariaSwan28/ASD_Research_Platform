"""Create deployment secrets without printing them or replacing existing data."""
import argparse
import os
from pathlib import Path
import secrets

parser = argparse.ArgumentParser()
parser.add_argument('--domain', help='Domain name, without scheme or path')
parser.add_argument('--admin-email', default='demo@autmama.local')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
path = root/'.env'
values = {}
if path.exists():
    for line in path.read_text(encoding='utf-8').splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            key, value = line.split('=', 1); values[key.strip()] = value.strip()
for key in ('JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'ML_INTERNAL_TOKEN'):
    if len(values.get(key, '')) < 32 or values[key].startswith('jwt-secret-'):
        values[key] = secrets.token_hex(32)
if values['JWT_ACCESS_SECRET'] == values['JWT_REFRESH_SECRET']:
    values['JWT_REFRESH_SECRET'] = secrets.token_hex(32)
if not values.get('SUPERUSER_LOGIN'): values['SUPERUSER_LOGIN'] = args.admin_email
if not values.get('SUPREUSER_PASS') or values['SUPREUSER_PASS'] == '!oRka12*': values['SUPREUSER_PASS'] = secrets.token_urlsafe(24)
if not values.get('ALLOW_REGISTRATION'): values['ALLOW_REGISTRATION'] = 'true'
values.setdefault('VIDEO_CLASSIFIER', 'random_forest')
if args.domain:
    import re
    if not re.fullmatch(r'[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?', args.domain) or '.' not in args.domain: parser.error('Use a domain name, without https:// or a path')
    values['SITE_HOST'] = args.domain
path.write_text('\n'.join(k+'='+v for k,v in values.items())+'\n', encoding='utf-8')
try: os.chmod(path, 0o600)
except OSError: pass
print('Configuration saved to .env. Keep this file private. Admin login/password are SUPERUSER_LOGIN and SUPREUSER_PASS.')
