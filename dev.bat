@echo off

echo =========================================
echo   Timer Widget Launch Console
echo =========================================
echo.
echo Select mode:
echo   [1] Dev mode  (Vite + Electron)
echo   [2] Production build
echo   [0] Exit
echo.
set /p choice="Enter option (0-2): "

if "%choice%"=="1" goto dev
if "%choice%"=="2" goto build
if "%choice%"=="0" exit

echo Invalid option. Please run the script again.
pause
exit

:dev
cls
echo [Dev] Installing dependencies and starting dev mode...
if not exist node_modules (
    echo First run detected. Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo Dependency installation failed. Check network or run npm install manually.
        pause
        exit /b 1
    )
)
echo Starting dev server + Electron...
npm run start
pause
exit

:build
echo [Build] Building production version...
if not exist node_modules (
    echo First run detected. Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo Dependency installation failed. Check network or run npm install manually.
        pause
        exit /b 1
    )
)
npm run build
echo.
echo Build complete. Output directory: release
pause
exit
