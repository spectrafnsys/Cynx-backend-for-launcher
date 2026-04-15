#pragma once

#include <string>
#include <vector>
#include <map>
#include <memory>
#include <windows.h>
#include <winsock2.h>
#include <ws2tcpip.h>

#pragma comment(lib, "ws2_32.lib")

// Forward declarations
class BackendAPI;
class PlayerManager;
class GameEventHandler;
class AnticheatMonitor;

// Player structure
struct Player {
    std::string accountId;
    std::string username;
    DWORD processId;
    uintptr_t baseAddress;
    
    // Stats
    int kills;
    int deaths;
    int placement;
    bool isAlive;
    
    // Position
    struct Vector3 {
        float x, y, z;
    } position, velocity;
    
    // Timestamps
    time_t joinTime;
    time_t lastUpdateTime;
    
    Player() : kills(0), deaths(0), placement(0), isAlive(true), processId(0), baseAddress(0) {
        position = {0, 0, 0};
        velocity = {0, 0, 0};
        joinTime = time(nullptr);
        lastUpdateTime = time(nullptr);
    }
};

// Game event types
enum class GameEventType {
    PLAYER_KILL,
    PLAYER_DEATH,
    PLAYER_WIN,
    PLAYER_MOVEMENT,
    PLAYER_JOIN,
    PLAYER_LEAVE,
    MATCH_START,
    MATCH_END
};

// Game event structure
struct GameEvent {
    GameEventType type;
    std::string playerId;
    std::map<std::string, std::string> data;
    time_t timestamp;
    
    GameEvent(GameEventType t, const std::string& pid) 
        : type(t), playerId(pid), timestamp(time(nullptr)) {}
};

// Backend API configuration
struct BackendConfig {
    std::string host;
    int port;
    std::string apiKey;
    bool useSSL;
    
    BackendConfig() : host("localhost"), port(3551), apiKey(""), useSSL(false) {}
};

// Game server configuration
struct GameServerConfig {
    std::string fortniteServerPath;
    std::string gameVersion;
    int maxPlayers;
    int serverPort;
    std::string playlist;
    bool enableAnticheat;
    bool enableRewards;
    
    GameServerConfig() 
        : gameVersion("12.41"), maxPlayers(100), serverPort(7777),
          playlist("playlist_defaultsolo"), enableAnticheat(true), enableRewards(true) {}
};

// Main game server class
class GameServer {
private:
    GameServerConfig config;
    BackendConfig backendConfig;
    
    std::unique_ptr<BackendAPI> backendAPI;
    std::unique_ptr<PlayerManager> playerManager;
    std::unique_ptr<GameEventHandler> eventHandler;
    std::unique_ptr<AnticheatMonitor> anticheatMonitor;
    
    HANDLE serverProcessHandle;
    DWORD serverProcessId;
    bool isRunning;
    
public:
    GameServer();
    ~GameServer();
    
    // Initialization
    bool Initialize(const std::string& configFile);
    bool Start();
    void Stop();
    
    // Server management
    bool LaunchFortniteServer();
    bool InjectDLL(const std::string& dllPath);
    bool AttachToServer();
    
    // Event handling
    void ProcessGameEvents();
    void OnPlayerKill(const std::string& killerId, const std::string& victimId, float distance, bool headshot);
    void OnPlayerWin(const std::string& playerId, int placement, int eliminations);
    void OnPlayerMovement(const std::string& playerId, float x, float y, float z, float vx, float vy, float vz);
    
    // Player management
    bool AddPlayer(const std::string& accountId, const std::string& username);
    bool RemovePlayer(const std::string& accountId);
    Player* GetPlayer(const std::string& accountId);
    
    // Getters
    bool IsRunning() const { return isRunning; }
    const GameServerConfig& GetConfig() const { return config; }
};

#endif // GAMESERVER_H

