@echo off
rem dskit launcher - uses the repo venv, so no long interpreter paths needed.
rem ASCII-only + CRLF on purpose: cmd.exe parses .bat with the OEM code page
rem (936 here), so UTF-8 Chinese text in a .bat turns into garbage.
rem
rem   dskit.bat                             double-click / no-arg: start web UI and open browser
rem   dskit.bat ui [--port 8765] [--open]   start the local web UI
rem   dskit.bat build-ui                    build the web UI (needs Node)
rem   dskit.bat help                        show this help
rem   dskit.bat <other args>                forwarded verbatim to cli.py
setlocal

set "HERE=%~dp0"
set "PY=%HERE%..\..\venv\Scripts\python.exe"
if not exist "%PY%" set "PY=python"

if /I "%~1"=="ui"       goto :ui
if /I "%~1"=="build-ui" goto :build
if /I "%~1"=="help"     goto :help
if /I "%~1"=="-h"       goto :help
if /I "%~1"=="--help"   goto :help
if "%~1"==""            goto :default_run
goto :cli

:default_run
echo ========================================================
echo  dskit - LoRA Dataset Curation, Tagging ^& Zen Mode Web UI
echo ========================================================
echo Launching local server on http://127.0.0.1:8765 ...
echo Press Ctrl+C in this console to stop the service.
echo.
"%PY%" "%HERE%webapp.py" --port 8765 --open
if %ERRORLEVEL% NEQ 0 pause
exit /b %ERRORLEVEL%

:ui
shift
"%PY%" "%HERE%webapp.py" %1 %2 %3 %4 %5 %6 %7 %8 %9
exit /b %ERRORLEVEL%

:build
"%PY%" "%HERE%build_ui.py" %2 %3 %4 %5 %6 %7 %8 %9
exit /b %ERRORLEVEL%

:cli
"%PY%" "%HERE%cli.py" %*
exit /b %ERRORLEVEL%

:help
echo dskit - reuse AnimaLoraStudio dataset curation and tag editing on any folder
echo.
echo   dskit.bat                             start local Web UI ^& auto-open browser
echo   dskit.bat ui [--port 8765] [--open]   start the local web UI (127.0.0.1 only)
echo   dskit.bat build-ui                    build the web UI (requires Node)
echo   dskit.bat help                        show this help
echo   dskit.bat ^<args...^>                    forwarded verbatim to cli.py, e.g.
echo       dskit.bat ls "D:\some\folder" --tag 1girl
echo       dskit.bat edit "D:\some\folder" --add "best quality" --at-index 0
echo.
echo All write operations are dry-run by default; add --apply to write for real,
echo and a restore point is saved automatically.
echo.
"%PY%" "%HERE%cli.py" --help
exit /b 0