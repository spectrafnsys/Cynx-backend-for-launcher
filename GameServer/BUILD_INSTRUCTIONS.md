# Game Server Build Instructions

## Requirements

### Software
1. **Visual Studio 2019/2022** (with C++ development tools)
2. **CMake 3.15+** (https://cmake.org/download/)
3. **vcpkg** (for dependencies)

### Dependencies
- **libcurl** (for HTTP requests)
- **jsoncpp** (for JSON parsing)
- **Windows SDK** (included with Visual Studio)

## Setup Dependencies with vcpkg

1. Install vcpkg:
```bash
git clone https://github.com/Microsoft/vcpkg.git
cd vcpkg
.\bootstrap-vcpkg.bat
```

2. Install required libraries:
```bash
.\vcpkg install curl:x64-windows
.\vcpkg install jsoncpp:x64-windows
```

3. Integrate with Visual Studio:
```bash
.\vcpkg integrate install
```

## Building with CMake

### Option 1: Command Line

```bash
cd GameServer
mkdir build
cd build
cmake .. -DCMAKE_TOOLCHAIN_FILE=[path-to-vcpkg]/scripts/buildsystems/vcpkg.cmake
cmake --build . --config Release
```

### Option 2: Visual Studio

1. Open **Visual Studio**
2. Select **Open a local folder**
3. Navigate to `GameServer` folder
4. VS will automatically detect CMakeLists.txt
5. Select **Build > Build All**

### Option 3: Pre-built (Without CMake)

You can compile directly with MSVC:

```bash
cl /EHsc /std:c++17 main.cpp GameServer.cpp /I"C:\path\to\curl\include" /I"C:\path\to\jsoncpp\include" /link curl.lib jsoncpp.lib ws2_32.lib
```

## Configuration

1. Edit `server_config.json`:
   - Set `fortniteServerPath` to your FortniteServer-Win64-Shipping.exe location
   - Set `backend.host` to your backend IP/hostname
   - Set `backend.port` to your backend port (default: 3551)

2. Example configuration:
```json
{
  "fortniteServerPath": "C:\\FortniteGame\\Binaries\\Win64\\FortniteServer-Win64-Shipping.exe",
  "backend": {
    "host": "localhost",
    "port": 3551
  }
}
```

## Running the Server

1. Make sure your backend is running:
```bash
cd ../BackendV3
node index.js
```

2. Start the game server:
```bash
cd GameServer/build/bin
GameServer.exe
```

Or with custom config:
```bash
GameServer.exe custom_config.json
```

## Connecting Fortnite

### Method 1: Using Your Fortnite Server Files

If you have the Fortnite 12.41 server binaries, the game server will:
1. Launch FortniteServer-Win64-Shipping.exe
2. Monitor the process
3. Hook into game events
4. Forward events to your backend

### Method 2: DLL Injection

For more advanced integration:
1. Build the game server with hooks
2. Let it inject into the Fortnite server process
3. Hooks will capture game events directly

## Troubleshooting

### "Cannot find curl.lib"
- Install curl via vcpkg
- Make sure vcpkg is integrated
- Add curl include path to CMake

### "Failed to launch Fortnite server"
- Check `fortniteServerPath` in config
- Verify FortniteServer-Win64-Shipping.exe exists
- Run as Administrator

### "Backend connection failed"
- Verify backend is running
- Check firewall settings
- Confirm backend host/port in config

### "Access Denied" when injecting DLL
- Run as Administrator
- Disable antivirus temporarily
- Check Windows Defender exclusions

## Features Implemented

✅ Backend API integration
✅ Player management
✅ Kill/Win/Movement tracking
✅ Anticheat monitoring
✅ Event forwarding to backend
✅ Process management
✅ Configuration system

## What You Need to Add

These require actual Fortnite 12.41 offsets and game logic:

### Memory Offsets (MemoryHooks.h)
You need to find these in FortniteServer-Win64-Shipping.exe using a disassembler:
- Player array pointer
- Kill function address
- Death function address
- Position/velocity offsets
- Health/shield offsets

### Game Logic
The server framework is ready, but you need to implement:
- Boss AI spawning (coordinates and logic)
- Weapon damage calculations
- Building mechanics
- Storm circle movement
- Loot table spawning
- Match flow (lobby → game → victory)

## Recommended Tools

- **IDA Pro / Ghidra**: For reverse engineering offsets
- **Cheat Engine**: For finding memory addresses
- **x64dbg**: For debugging
- **Process Hacker**: For monitoring processes

## Next Steps

1. **Build the server** using instructions above
2. **Find memory offsets** for 12.41
3. **Implement game hooks** in MemoryHooks.h
4. **Add boss logic** (see boss configuration in server_config.json)
5. **Test integration** with backend

## Support

Check the logs:
- `gameserver.log` - Game server logs
- Backend logs in your backend terminal

The server will output detailed information about:
- Player joins/leaves
- Kills and wins
- Backend communication
- Anticheat violations

