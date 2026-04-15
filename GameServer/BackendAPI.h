#pragma once

#include "GameServer.h"
#include <curl/curl.h>
#include <json/json.h>

// Backend API client
class BackendAPI {
private:
    std::string baseURL;
    std::string apiKey;
    CURL* curl;
    
    // Response callback
    static size_t WriteCallback(void* contents, size_t size, size_t nmemb, std::string* userp);
    
    // HTTP methods
    std::string POST(const std::string& endpoint, const Json::Value& data);
    std::string GET(const std::string& endpoint);
    
public:
    BackendAPI(const std::string& host, int port, const std::string& key);
    ~BackendAPI();
    
    // Initialize
    bool Initialize();
    
    // Kill/Win reporting
    bool ReportKill(const std::string& killerId, const std::string& victimId, float distance, bool headshot);
    bool ReportWin(const std::string& accountId, int placement, int eliminations);
    bool ReportMovement(const std::string& accountId, float x, float y, float z, float vx, float vy, float vz);
    
    // XP management
    bool AwardXP(const std::string& accountId, int xp);
    
    // Ban checking
    bool IsPlayerBanned(const std::string& accountId, std::string& reason);
    
    // Player verification
    bool VerifyPlayer(const std::string& accountId, const std::string& token);
};

// Implementation
BackendAPI::BackendAPI(const std::string& host, int port, const std::string& key)
    : apiKey(key), curl(nullptr) {
    baseURL = "http://" + host + ":" + std::to_string(port);
}

BackendAPI::~BackendAPI() {
    if (curl) {
        curl_easy_cleanup(curl);
    }
    curl_global_cleanup();
}

bool BackendAPI::Initialize() {
    curl_global_init(CURL_GLOBAL_ALL);
    curl = curl_easy_init();
    return curl != nullptr;
}

size_t BackendAPI::WriteCallback(void* contents, size_t size, size_t nmemb, std::string* userp) {
    size_t totalSize = size * nmemb;
    userp->append((char*)contents, totalSize);
    return totalSize;
}

std::string BackendAPI::POST(const std::string& endpoint, const Json::Value& data) {
    if (!curl) return "";
    
    std::string response;
    std::string url = baseURL + endpoint;
    
    Json::StreamWriterBuilder writer;
    std::string jsonStr = Json::writeString(writer, data);
    
    curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
    curl_easy_setopt(curl, CURLOPT_POSTFIELDS, jsonStr.c_str());
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, WriteCallback);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &response);
    
    struct curl_slist* headers = NULL;
    headers = curl_slist_append(headers, "Content-Type: application/json");
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
    
    CURLcode res = curl_easy_perform(curl);
    curl_slist_free_all(headers);
    
    return (res == CURLE_OK) ? response : "";
}

bool BackendAPI::ReportKill(const std::string& killerId, const std::string& victimId, float distance, bool headshot) {
    Json::Value data;
    data["killerAccountId"] = killerId;
    data["victimAccountId"] = victimId;
    data["distance"] = distance;
    data["headshot"] = headshot;
    
    std::string response = POST("/api/game/kill", data);
    return !response.empty();
}

bool BackendAPI::ReportWin(const std::string& accountId, int placement, int eliminations) {
    Json::Value data;
    data["accountId"] = accountId;
    data["placement"] = placement;
    data["eliminations"] = eliminations;
    
    std::string response = POST("/api/game/win", data);
    return !response.empty();
}

bool BackendAPI::ReportMovement(const std::string& accountId, float x, float y, float z, float vx, float vy, float vz) {
    Json::Value data;
    data["accountId"] = accountId;
    data["position"]["x"] = x;
    data["position"]["y"] = y;
    data["position"]["z"] = z;
    data["velocity"]["x"] = vx;
    data["velocity"]["y"] = vy;
    data["velocity"]["z"] = vz;
    
    std::string response = POST("/api/game/movement", data);
    return !response.empty();
}

bool BackendAPI::AwardXP(const std::string& accountId, int xp) {
    Json::Value data;
    data["accountId"] = accountId;
    data["xp"] = xp;
    
    std::string response = POST("/api/game/xp", data);
    return !response.empty();
}

#endif // BACKENDAPI_H

