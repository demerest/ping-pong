@echo off
rem Runs the CPU vs CPU suite in headless Chrome. No Node required.
rem Exits 0 when every assertion passes, 1 otherwise.
setlocal EnableExtensions
set "HERE=%~dp0"
set "OUT=%TEMP%\neonpong-cpu-result.html"

set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%BROWSER%" set "BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%BROWSER%" set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%BROWSER%" (
  echo No Chrome or Edge installation found.
  exit /b 1
)

set "URL="
for /f "usebackq delims=" %%u in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%HERE%build-harness.ps1"`) do set "URL=%%u"
if not defined URL (
  echo Harness build failed.
  exit /b 1
)

"%BROWSER%" --headless=new --disable-gpu --no-first-run ^
  --user-data-dir="%TEMP%\neonpong-test-profile" ^
  --virtual-time-budget=180000 --timeout=240000 ^
  --dump-dom "%URL%" > "%OUT%" 2>nul

findstr /C:"PASS" /C:"FAIL" /C:"SUMMARY" "%OUT%"

findstr /C:"SUMMARY pass=" "%OUT%" >nul
if errorlevel 1 (
  echo RESULT: FAIL - the suite never reported; page or game.js did not load.
  exit /b 1
)
findstr /C:"fail=0" "%OUT%" >nul
if errorlevel 1 (
  echo RESULT: FAIL
  exit /b 1
)
echo RESULT: PASS
exit /b 0
