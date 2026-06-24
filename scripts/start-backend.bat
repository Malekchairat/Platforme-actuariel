@echo off
cd /d "%~dp0.."
echo Stopping process on port 8000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
echo Starting backend on http://127.0.0.1:8000
python -m uvicorn backend.api.main:app --host 127.0.0.1 --port 8000 --reload
