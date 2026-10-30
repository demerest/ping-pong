@echo off
rem Runs the CPU vs CPU suite at easy, normal and insane in headless Chrome.
rem No Node required. Exits 0 when every assertion passes, 1 otherwise.
rem Takes a few minutes: each difficulty plays a real match to 5.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-suite.ps1"
exit /b %errorlevel%
