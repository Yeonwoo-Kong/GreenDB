@echo off
cd /d "%~dp0"
set "GREENDB_PYTHON=%LOCALAPPDATA%\Programs\Python\Python310\python.exe"
if exist "%GREENDB_PYTHON%" (
  "%GREENDB_PYTHON%" server.py 8765
) else (
  py -3 server.py 8765
)
pause
