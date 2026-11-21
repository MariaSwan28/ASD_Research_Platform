param([string]$Domain = '', [string]$AdminEmail = 'demo@autmama.local')
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$file = Join-Path $root '.env'
$values = [ordered]@{}
if (Test-Path $file) {
  foreach ($line in Get-Content $file) {
    if ($line -match '^([^#=]+)=(.*)$') { $values[$matches[1].Trim()] = $matches[2].Trim() }
  }
}
function New-HexSecret([int]$Size) {
  $bytes = New-Object byte[] $Size
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  return [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
}
foreach ($key in @('JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'ML_INTERNAL_TOKEN')) {
  if (-not $values[$key] -or $values[$key].Length -lt 32 -or $values[$key].StartsWith('jwt-secret-')) { $values[$key] = New-HexSecret 32 }
}
if ($values['JWT_ACCESS_SECRET'] -eq $values['JWT_REFRESH_SECRET']) { $values['JWT_REFRESH_SECRET'] = New-HexSecret 32 }
if (-not $values['SUPERUSER_LOGIN']) { $values['SUPERUSER_LOGIN'] = $AdminEmail }
if (-not $values['SUPREUSER_PASS'] -or $values['SUPREUSER_PASS'] -eq '!oRka12*') { $values['SUPREUSER_PASS'] = New-HexSecret 16 }
if (-not $values['ALLOW_REGISTRATION']) { $values['ALLOW_REGISTRATION'] = 'true' }
if (-not $values['VIDEO_CLASSIFIER']) { $values['VIDEO_CLASSIFIER'] = 'random_forest' }
if ($Domain) {
  if ($Domain -notmatch '^[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z0-9-]+$') { throw 'Use a domain without scheme or path' }
  $values['SITE_HOST'] = $Domain
}
$content = ($values.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join "`n"
[System.IO.File]::WriteAllText($file, $content + "`n", (New-Object System.Text.UTF8Encoding($false)))
Write-Output 'Configuration saved to .env. Keep it private. Admin credentials: SUPERUSER_LOGIN and SUPREUSER_PASS.'
