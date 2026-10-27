# Builds a disposable copy of index.html that loads the real style.css and game.js
# plus the assertion suite, then prints its file:// URL on the last line.
# Paths are derived from this script's location so the repo can live anywhere.
$ErrorActionPreference = 'Stop'

function To-FileUrl([string]$p) { 'file:///' + ($p -replace '\\', '/') }

$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $env:TEMP 'neonpong-cpu-harness.html'

$html = Get-Content -Raw -LiteralPath (Join-Path $root 'index.html')
$html = $html.Replace('href="style.css"', 'href="' + (To-FileUrl (Join-Path $root 'style.css')) + '"')

# Under --virtual-time-budget Chrome fast-forwards timers but never fires
# requestAnimationFrame, so the rAF-driven game loop would stall. game.js resolves
# requestAnimationFrame from the global on every call, so a timer-backed shim
# installed before it loads lets a whole match run on virtual time.
$shim = @'
<script>
window.requestAnimationFrame = function (cb) {
  return window.setTimeout(function () { cb(performance.now()); }, 16);
};
window.cancelAnimationFrame = function (id) { window.clearTimeout(id); };
</script>
'@

$inject = $shim + "`n<script src=`"" + (To-FileUrl (Join-Path $root 'game.js')) + "`"></script>" +
          "`n<script src=`"" + (To-FileUrl (Join-Path $PSScriptRoot 'cpu-vs-cpu.js')) + "`"></script>"
$html = $html.Replace('<script src="game.js"></script>', $inject)

if (-not $html.Contains('cpu-vs-cpu.js')) { throw 'index.html no longer loads game.js as expected' }

Set-Content -LiteralPath $out -Value $html -Encoding UTF8 -NoNewline
Write-Output (To-FileUrl $out)
