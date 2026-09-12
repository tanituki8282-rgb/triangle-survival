@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  Triangle Survival - local server
echo  Browser will open http://localhost:8080/
echo  Stop with Ctrl+C in this window.
echo.
where py >nul 2>nul && (
  start "" http://localhost:8080/
  py -3 -m http.server 8080
  goto :eof
)
where python >nul 2>nul && (
  start "" http://localhost:8080/
  python -m http.server 8080
  goto :eof
)
echo Python not found. Install Python 3, or open this folder in Cursor/VS Code Live Server.
pause
