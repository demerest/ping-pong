# Runs the CPU vs CPU suite at all three difficulties under headless Chrome.
#
# The runs go in parallel: an Insane match to 5 needs several hundred seconds of
# simulated time, and running the three sequentially exceeds a sane wait. Chrome's
# virtual clock is deterministic and independent of wall time, so parallelism
# changes how long the suite takes, not what it concludes.
#
# Exits 0 when every difficulty passes, 1 otherwise.
$ErrorActionPreference = 'Stop'

$here = $PSScriptRoot
$url = & (Join-Path $here 'build-harness.ps1') | Select-Object -Last 1
if (-not $url) { throw 'harness build failed' }

$candidates = @(
  (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
  (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
  (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe')
)
$browser = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browser) { throw 'no Chrome or Edge installation found' }

# Each difficulty gets its own profile, wiped first: the suite asserts on the
# default settings seen at load, and the game persists them to localStorage.
$runs = @()
foreach ($d in 'easy', 'normal', 'insane') {
  $prof = Join-Path $env:TEMP "neonpong-prof-$d"
  $out = Join-Path $env:TEMP "neonpong-cpu-$d.html"
  if (Test-Path $prof) { Remove-Item -Recurse -Force $prof }
  $argv = @(
    '--headless=new', '--disable-gpu', '--no-first-run',
    "--user-data-dir=$prof",
    '--virtual-time-budget=520000', '--timeout=560000',
    '--dump-dom', "$url#$d"
  )
  $proc = Start-Process -FilePath $browser -ArgumentList $argv -NoNewWindow -PassThru `
    -RedirectStandardOutput $out -RedirectStandardError "$out.err"
  $runs += [pscustomobject]@{ Diff = $d; Out = $out; Proc = $proc }
}

foreach ($r in $runs) { $r.Proc.WaitForExit() }

$fails = 0
foreach ($r in $runs) {
  Write-Output "=== $($r.Diff) ==="
  $txt = if (Test-Path $r.Out) { Get-Content -Raw $r.Out } else { '' }
  ($txt -split "`n") | Where-Object { $_ -match '(PASS |FAIL |SUMMARY )' } |
    ForEach-Object { Write-Output $_.Trim() }
  if ($txt -notmatch 'SUMMARY pass=') {
    Write-Output '  no summary - page or game.js did not load'
    $fails++
  } elseif ($txt -notmatch 'fail=0') {
    $fails++
  }
  Remove-Item "$($r.Out).err" -ErrorAction SilentlyContinue
}

Write-Output ''
if ($fails) {
  Write-Output "RESULT: FAIL - $fails of 3 difficulty runs failed"
  exit 1
}
Write-Output 'RESULT: PASS - easy, normal, insane'
exit 0
