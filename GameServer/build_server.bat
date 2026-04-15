@echo off
echo ================================
echo Building Fortnite Game Server
echo ================================
echo.

REM Check for CMake
where cmake >nul 2>&1
if errorlevel 1 (
    echo ERROR: CMake not found!
    echo Please install CMake from https://cmake.org/download/
    pause
    exit /b 1
)

REM Check for vcpkg
if not exist "C:\vcpkg\vcpkg.exe" (
    if not exist "%USERPROFILE%\vcpkg\vcpkg.exe" (
        echo WARNING: vcpkg not found in default locations
        echo Please install vcpkg and dependencies:
        echo   1. git clone https://github.com/Microsoft/vcpkg.git
        echo   2. cd vcpkg
        echo   3. bootstrap-vcpkg.bat
        echo   4. vcpkg install curl:x64-windows jsoncpp:x64-windows
        echo   5. vcpkg integrate install
        echo.
        pause
    )
)

REM Create build directory
if not exist "build" mkdir build

echo [1/2] Configuring with CMake...
cd build
cmake .. -G "Visual Studio 16 2019" -A x64
if errorlevel 1 (
    echo.
    echo ERROR: CMake configuration failed!
    echo Make sure you have Visual Studio 2019 installed
    cd ..
    pause
    exit /b 1
)

echo.
echo [2/2] Building project...
cmake --build . --config Release
if errorlevel 1 (
    echo.
    echo ERROR: Build failed!
    echo Check the error messages above
    cd ..
    pause
    exit /b 1
)

cd ..

echo.
echo ================================
echo Build completed successfully!
echo ================================
echo.
echo Executable location: build\bin\Release\GameServer.exe
echo.
echo Next steps:
echo 1. Edit server_config.json
echo 2. Start backend: cd .. ^&^& node index.js
echo 3. Run: start_server.bat
echo.
pause

