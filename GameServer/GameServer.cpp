#include "GameServer.h"
#include "BackendAPI.h"
#include <iostream>
#include <fstream>
#include <thread>
#include <chrono>
#include <json/json.h>

// Player Manager
class PlayerManager {
private:
    std::map<std::string, Player> players;
    std::mutex playerMutex;
    
public:
    bool AddPlayer(const std::string& accountId, const std::string& username) {
        std::lock_guard<std::mutex> lock(playerMutex);
        
        if (players.find(accountId) != players.end()) {
            return false; // Player already exists
        }
        
        Player player;
        player.accountId = accountId;
        player.username = username;
        players[accountId] = player;
        
        std::cout << "[PlayerManager] Player joined: " << username << " (" << accountId << ")" << std::endl;
        return true;
    }
    
    bool RemovePlayer(const std::string& accountId) {
        std::lock_guard<std::mutex> lock(playerMutex);
        
        auto it = players.find(accountId);
        if (it == players.end()) {
            return false;
        }
        
        std::cout << "[PlayerManager] Player left: " << it->second.username << std::endl;
        players.erase(it);
        return true;
    }
    
    Player* GetPlayer(const std::string& accountId) {
        std::lock_guard<std::mutex> lock(playerMutex);
        
        auto it = players.find(accountId);
        if (it == players.end()) {
            return nullptr;
        }
        
        return &it->second;
    }
    
    std::vector<Player*> GetAllPlayers() {
        std::lock_guard<std::mutex> lock(playerMutex);
        std::vector<Player*> result;
        
        for (auto& pair : players) {
            result.push_back(&pair.second);
        }
        
        return result;
    }
    
    int GetPlayerCount() const {
        return players.size();
    }
};

// Game Event Handler
class GameEventHandler {
private:
    std::queue<GameEvent> eventQueue;
    std::mutex queueMutex;
    BackendAPI* backendAPI;
    
public:
    GameEventHandler(BackendAPI* api) : backendAPI(api) {}
    
    void QueueEvent(const GameEvent& event) {
        std::lock_guard<std::mutex> lock(queueMutex);
        eventQueue.push(event);
    }
    
    void ProcessEvents() {
        std::lock_guard<std::mutex> lock(queueMutex);
        
        while (!eventQueue.empty()) {
            GameEvent event = eventQueue.front();
            eventQueue.pop();
            
            ProcessEvent(event);
        }
    }
    
private:
    void ProcessEvent(const GameEvent& event) {
        switch (event.type) {
            case GameEventType::PLAYER_KILL: {
                std::string killerId = event.playerId;
                std::string victimId = event.data.at("victimId");
                float distance = std::stof(event.data.at("distance"));
                bool headshot = event.data.at("headshot") == "true";
                
                backendAPI->ReportKill(killerId, victimId, distance, headshot);
                std::cout << "[Event] Kill: " << killerId << " eliminated " << victimId << std::endl;
                break;
            }
            
            case GameEventType::PLAYER_WIN: {
                std::string playerId = event.playerId;
                int placement = std::stoi(event.data.at("placement"));
                int eliminations = std::stoi(event.data.at("eliminations"));
                
                backendAPI->ReportWin(playerId, placement, eliminations);
                std::cout << "[Event] Win: " << playerId << " placed #" << placement << std::endl;
                break;
            }
            
            case GameEventType::PLAYER_MOVEMENT: {
                std::string playerId = event.playerId;
                float x = std::stof(event.data.at("x"));
                float y = std::stof(event.data.at("y"));
                float z = std::stof(event.data.at("z"));
                float vx = std::stof(event.data.at("vx"));
                float vy = std::stof(event.data.at("vy"));
                float vz = std::stof(event.data.at("vz"));
                
                backendAPI->ReportMovement(playerId, x, y, z, vx, vy, vz);
                break;
            }
            
            default:
                break;
        }
    }
};

// Anticheat Monitor
class AnticheatMonitor {
private:
    bool enabled;
    std::thread monitorThread;
    bool running;
    PlayerManager* playerManager;
    GameEventHandler* eventHandler;
    
public:
    AnticheatMonitor(PlayerManager* pm, GameEventHandler* eh) 
        : enabled(true), running(false), playerManager(pm), eventHandler(eh) {}
    
    ~AnticheatMonitor() {
        Stop();
    }
    
    void Start() {
        if (running) return;
        
        running = true;
        monitorThread = std::thread(&AnticheatMonitor::MonitorLoop, this);
        std::cout << "[Anticheat] Monitor started" << std::endl;
    }
    
    void Stop() {
        if (!running) return;
        
        running = false;
        if (monitorThread.joinable()) {
            monitorThread.join();
        }
        std::cout << "[Anticheat] Monitor stopped" << std::endl;
    }
    
private:
    void MonitorLoop() {
        while (running) {
            auto players = playerManager->GetAllPlayers();
            
            for (Player* player : players) {
                // Monitor player movement for anticheat
                time_t now = time(nullptr);
                if (now - player->lastUpdateTime >= 1) { // Check every second
                    GameEvent event(GameEventType::PLAYER_MOVEMENT, player->accountId);
                    event.data["x"] = std::to_string(player->position.x);
                    event.data["y"] = std::to_string(player->position.y);
                    event.data["z"] = std::to_string(player->position.z);
                    event.data["vx"] = std::to_string(player->velocity.x);
                    event.data["vy"] = std::to_string(player->velocity.y);
                    event.data["vz"] = std::to_string(player->velocity.z);
                    
                    eventHandler->QueueEvent(event);
                    player->lastUpdateTime = now;
                }
            }
            
            std::this_thread::sleep_for(std::chrono::milliseconds(100));
        }
    }
};

// GameServer Implementation
GameServer::GameServer() 
    : serverProcessHandle(nullptr), serverProcessId(0), isRunning(false) {}

GameServer::~GameServer() {
    Stop();
}

bool GameServer::Initialize(const std::string& configFile) {
    std::cout << "[GameServer] Initializing..." << std::endl;
    
    // Load configuration
    std::ifstream file(configFile);
    if (!file.is_open()) {
        std::cerr << "[GameServer] Failed to open config file: " << configFile << std::endl;
        return false;
    }
    
    Json::Value root;
    file >> root;
    file.close();
    
    // Parse config
    config.fortniteServerPath = root.get("fortniteServerPath", "").asString();
    config.gameVersion = root.get("gameVersion", "12.41").asString();
    config.maxPlayers = root.get("maxPlayers", 100).asInt();
    config.serverPort = root.get("serverPort", 7777).asInt();
    config.playlist = root.get("playlist", "playlist_defaultsolo").asString();
    config.enableAnticheat = root.get("enableAnticheat", true).asBool();
    config.enableRewards = root.get("enableRewards", true).asBool();
    
    backendConfig.host = root["backend"].get("host", "localhost").asString();
    backendConfig.port = root["backend"].get("port", 3551).asInt();
    backendConfig.apiKey = root["backend"].get("apiKey", "").asString();
    
    // Initialize components
    backendAPI = std::make_unique<BackendAPI>(backendConfig.host, backendConfig.port, backendConfig.apiKey);
    if (!backendAPI->Initialize()) {
        std::cerr << "[GameServer] Failed to initialize Backend API" << std::endl;
        return false;
    }
    
    playerManager = std::make_unique<PlayerManager>();
    eventHandler = std::make_unique<GameEventHandler>(backendAPI.get());
    anticheatMonitor = std::make_unique<AnticheatMonitor>(playerManager.get(), eventHandler.get());
    
    std::cout << "[GameServer] Initialized successfully" << std::endl;
    std::cout << "[GameServer] Backend: " << backendConfig.host << ":" << backendConfig.port << std::endl;
    std::cout << "[GameServer] Version: " << config.gameVersion << std::endl;
    std::cout << "[GameServer] Playlist: " << config.playlist << std::endl;
    
    return true;
}

bool GameServer::Start() {
    if (isRunning) {
        std::cerr << "[GameServer] Server is already running" << std::endl;
        return false;
    }
    
    std::cout << "[GameServer] Starting server..." << std::endl;
    
    // Launch Fortnite server
    if (!LaunchFortniteServer()) {
        std::cerr << "[GameServer] Failed to launch Fortnite server" << std::endl;
        return false;
    }
    
    // Start anticheat monitor
    if (config.enableAnticheat) {
        anticheatMonitor->Start();
    }
    
    isRunning = true;
    std::cout << "[GameServer] Server started successfully" << std::endl;
    std::cout << "[GameServer] Players: 0/" << config.maxPlayers << std::endl;
    
    return true;
}

void GameServer::Stop() {
    if (!isRunning) return;
    
    std::cout << "[GameServer] Stopping server..." << std::endl;
    
    isRunning = false;
    
    // Stop anticheat
    if (anticheatMonitor) {
        anticheatMonitor->Stop();
    }
    
    // Terminate Fortnite server process
    if (serverProcessHandle) {
        TerminateProcess(serverProcessHandle, 0);
        CloseHandle(serverProcessHandle);
        serverProcessHandle = nullptr;
    }
    
    std::cout << "[GameServer] Server stopped" << std::endl;
}

bool GameServer::LaunchFortniteServer() {
    std::string commandLine = config.fortniteServerPath;
    commandLine += " -log -Port=" + std::to_string(config.serverPort);
    commandLine += " -QueryPort=" + std::to_string(config.serverPort + 1);
    
    STARTUPINFOA si = {sizeof(si)};
    PROCESS_INFORMATION pi;
    
    if (!CreateProcessA(
        nullptr,
        const_cast<char*>(commandLine.c_str()),
        nullptr,
        nullptr,
        FALSE,
        0,
        nullptr,
        nullptr,
        &si,
        &pi)) {
        std::cerr << "[GameServer] Failed to launch Fortnite server: " << GetLastError() << std::endl;
        return false;
    }
    
    serverProcessHandle = pi.hProcess;
    serverProcessId = pi.dwProcessId;
    CloseHandle(pi.hThread);
    
    std::cout << "[GameServer] Fortnite server launched (PID: " << serverProcessId << ")" << std::endl;
    
    // Wait for server to initialize
    std::this_thread::sleep_for(std::chrono::seconds(5));
    
    return true;
}

void GameServer::ProcessGameEvents() {
    eventHandler->ProcessEvents();
}

void GameServer::OnPlayerKill(const std::string& killerId, const std::string& victimId, float distance, bool headshot) {
    GameEvent event(GameEventType::PLAYER_KILL, killerId);
    event.data["victimId"] = victimId;
    event.data["distance"] = std::to_string(distance);
    event.data["headshot"] = headshot ? "true" : "false";
    
    eventHandler->QueueEvent(event);
    
    // Update player stats
    Player* killer = playerManager->GetPlayer(killerId);
    Player* victim = playerManager->GetPlayer(victimId);
    
    if (killer) killer->kills++;
    if (victim) {
        victim->deaths++;
        victim->isAlive = false;
    }
}

void GameServer::OnPlayerWin(const std::string& playerId, int placement, int eliminations) {
    GameEvent event(GameEventType::PLAYER_WIN, playerId);
    event.data["placement"] = std::to_string(placement);
    event.data["eliminations"] = std::to_string(eliminations);
    
    eventHandler->QueueEvent(event);
}

void GameServer::OnPlayerMovement(const std::string& playerId, float x, float y, float z, float vx, float vy, float vz) {
    Player* player = playerManager->GetPlayer(playerId);
    if (player) {
        player->position = {x, y, z};
        player->velocity = {vx, vy, vz};
    }
}

bool GameServer::AddPlayer(const std::string& accountId, const std::string& username) {
    return playerManager->AddPlayer(accountId, username);
}

bool GameServer::RemovePlayer(const std::string& accountId) {
    return playerManager->RemovePlayer(accountId);
}

Player* GameServer::GetPlayer(const std::string& accountId) {
    return playerManager->GetPlayer(accountId);
}

