#include "GameServer.h"
#include <iostream>
#include <signal.h>

GameServer* g_gameServer = nullptr;

void SignalHandler(int signal) {
    std::cout << "\n[Main] Shutting down server..." << std::endl;
    if (g_gameServer) {
        g_gameServer->Stop();
    }
    exit(0);
}

int main(int argc, char* argv[]) {
    std::cout << "=================================" << std::endl;
    std::cout << "  Fortnite Game Server - v12.41" << std::endl;
    std::cout << "  Chapter 2 Season 2" << std::endl;
    std::cout << "=================================" << std::endl;
    std::cout << std::endl;
    
    // Set up signal handlers
    signal(SIGINT, SignalHandler);
    signal(SIGTERM, SignalHandler);
    
    // Get config file path
    std::string configFile = "server_config.json";
    if (argc > 1) {
        configFile = argv[1];
    }
    
    // Create game server
    g_gameServer = new GameServer();
    
    // Initialize
    if (!g_gameServer->Initialize(configFile)) {
        std::cerr << "[Main] Failed to initialize game server" << std::endl;
        delete g_gameServer;
        return 1;
    }
    
    // Start server
    if (!g_gameServer->Start()) {
        std::cerr << "[Main] Failed to start game server" << std::endl;
        delete g_gameServer;
        return 1;
    }
    
    std::cout << "\n[Main] Server is running. Press Ctrl+C to stop." << std::endl;
    std::cout << "[Main] Monitoring Fortnite server and forwarding events to backend..." << std::endl;
    
    // Main loop
    while (g_gameServer->IsRunning()) {
        // Process game events
        g_gameServer->ProcessGameEvents();
        
        // Sleep to avoid high CPU usage
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }
    
    // Cleanup
    delete g_gameServer;
    
    std::cout << "[Main] Server shut down successfully" << std::endl;
    return 0;
}

