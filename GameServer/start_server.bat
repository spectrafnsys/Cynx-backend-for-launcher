@echo off
echo ================================
echo Fortnite Game Server - v12.41
echo Chapter 2 Season 2
echo ================================
echo.

REM Check if GameServer.exe exists
if not exist "build\bin\Release\GameServer.exe" (
    if not exist "build\bin\Debug\GameServer.exe" (
        echo ERROR: GameServer.exe not found!
        echo Please build the project first using CMake
        echo.
        echo Run: build_server.bat
        pause
        exit /b 1
    )
)

REM Check if backend is running
echo [1/3] Checking backend status...
curl -s http://localhost:3551 >nul 2>&1
if errorlevel 1 (
    echo WARNING: Backend might not be running on port 3551
    echo Make sure to start backend with: node index.js
    echo.
)

REM Check if config exists
if not exist "server_config.json" (
    echo ERROR: server_config.json not found!
    echo Please create config file from template
    pause
    exit /b 1
)

echo [2/3] Checking Fortnite server path...
REM TODO: Add validation for FortniteServer path from config

echo [3/3] Starting game server...
echo.

REM Try Release build first, then Debug
if exist "build\bin\Release\GameServer.exe" (
    start "" "build\bin\Release\GameServer.exe" server_config.json
) else (
    start "" "build\bin\Debug\GameServer.exe" server_config.json
)

echo Game server is starting...
echo Check the game server window for status
echo.
echo Press any key to exit this window
pause >nul

