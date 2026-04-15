const express = require("express");
const functions = require("../structs/functions.js");
const fs = require("fs");
const uuid = require("uuid");
const app = express.Router();
const log = require("../structs/log.js");
const path = require("path");
const { getAccountIdData, addEliminationHypePoints, addVictoryHypePoints, deductBusFareHypePoints, updateTournamentStats, getTournamentStats, addTournamentEliminationPoints, addVictoryTournamentPoints, addTournamentMatchPlayed } = require("./../structs/functions.js");
const User = require("../model/user.js");
const Profile = require("../model/profiles.js");
const Arena = require("../model/arena.js");
const Tournament = require("../model/tournament.js");
const config = JSON.parse(fs.readFileSync("./Config/config.json").toString());
const ENABLE_TOURNAMENTS = config.enableTournaments === true;

const { verifyToken, verifyClient } = require("../tokenManager/tokenVerify.js");
const anticheatSystem = require("../structs/anticheat.js");

// Tournament leaderboard endpoint - THE CORRECT ONE THE GAME CALLS!
// This is the endpoint the game actually uses: /api/v1/leaderboards/Fortnite/:eventId/:eventWindowId/:accountId
app.get("/api/v1/leaderboards/Fortnite/:eventId/:eventWindowId/:accountId", async (req, res) => {
    try {
        const { eventId, eventWindowId, accountId } = req.params;
        
        console.log(`\n========== [Leaderboard Request - CORRECT ENDPOINT] ==========`);
        console.log(`[Leaderboard] FULL URL: ${req.originalUrl}`);
        console.log(`[Leaderboard] Request received - eventId: "${eventId}", eventWindowId: "${eventWindowId}", accountId: "${accountId}"`);
        
        if (eventId === "corelg_cup" || eventId === "corelg" || eventId === "corelg_cup1") {
            console.log(`[Leaderboard] Processing tournament leaderboard request`);
            
            // Get all tournament entries sorted by points (descending)
            // Include players with eliminations > 0 OR wins > 0 OR tournamentPoints > 0
            const tournamentEntries = await Tournament.find({
                $or: [
                    { tournamentPoints: { $gt: 0 } },
                    { eliminations: { $gt: 0 } },
                    { wins: { $gt: 0 } }
                ]
            })
                .sort({ tournamentPoints: -1, lastUpdated: 1 })
                .limit(100); // Top 100 players
            
            console.log(`[Leaderboard] Found ${tournamentEntries.length} tournament entries`);
            
            if (tournamentEntries.length === 0) {
                console.log(`[Leaderboard] WARNING: No tournament entries found!`);
            }
            
            // Build entries array following the correct format
            const entries = tournamentEntries.map((entry, index) => {
                // Calculate percentile
                const totalPlayers = tournamentEntries.length;
                const percentile = totalPlayers > 0 ? ((index + 1) / totalPlayers) * 0.1 : 0.1;
                
                // Build pointBreakdown in the correct format
                const pointBreakdown = {};
                
                if (entry.wins > 0) {
                    // For wins (placement), use PLACEMENT_STAT_INDEX:1 (1st place = keyValue 1)
                    const winPoints = entry.wins * 10; // 10 points per win
                    pointBreakdown["PLACEMENT_STAT_INDEX:1"] = {
                        timesAchieved: entry.wins,
                        pointsEarned: winPoints
                    };
                }
                
                if (entry.eliminations > 0) {
                    // For eliminations, use TEAM_ELIMS_STAT_INDEX:1
                    const elimPoints = entry.eliminations * 2; // 2 points per elimination
                    pointBreakdown["TEAM_ELIMS_STAT_INDEX:1"] = {
                        timesAchieved: entry.eliminations,
                        pointsEarned: elimPoints
                    };
                }
                
                return {
                    scoreKey: {
                        gameId: "Fortnite",
                        eventId: eventId,
                        eventWindowId: eventWindowId || "",
                        _scoreId: null
                    },
                    teamId: entry.accountId,
                    teamAccountIds: [entry.accountId],
                    liveSessionId: null,
                    pointsEarned: entry.tournamentPoints,
                    score: entry.tournamentPoints,
                    rank: index + 1,
                    percentile: percentile,
                    pointBreakdown: pointBreakdown,
                    sessionHistory: []
                };
            });
            
            const leaderboard = {
                gameId: "Fortnite",
                eventId: eventId,
                eventWindowId: eventWindowId || "",
                page: 0,
                totalPages: 1,
                updatedTime: new Date().toISOString(),
                entryTemplate: {
                    gameId: "Fortnite",
                    eventId: eventId,
                    eventWindowId: eventWindowId || "",
                    teamAccountIds: [],
                    pointsEarned: 1,
                    score: 1.0,
                    rank: 1,
                    percentile: 0.1,
                    tokens: ["GroupIdentity_GeoIdentity_fortnite"],
                    teamId: "",
                    liveSessionId: null,
                    pointBreakdown: {
                        "PLACEMENT_STAT_INDEX:1": {
                            timesAchieved: 1,
                            pointsEarned: 10
                        },
                        "TEAM_ELIMS_STAT_INDEX:1": {
                            timesAchieved: 1,
                            pointsEarned: 2
                        }
                    },
                    sessionHistory: []
                },
                entries: entries,
                liveSessions: {}
            };
            
            console.log(`[Leaderboard] Returning ${entries.length} entries to client`);
            if (entries.length > 0) {
                console.log(`[Leaderboard] Top entry: ${entries[0].teamAccountIds[0]} - ${entries[0].pointsEarned} points (rank ${entries[0].rank})`);
            }
            res.json(leaderboard);
        } else {
            // Return empty leaderboard for other events
            console.log(`[Leaderboard] Event not handled (${eventId}) - returning empty leaderboard`);
            res.json({
                gameId: "Fortnite",
                eventId: eventId || "",
                eventWindowId: eventWindowId || "",
                page: 0,
                totalPages: 1,
                updatedTime: "",
                entryTemplate: {
                    gameId: "Fortnite",
                    eventId: eventId || "",
                    eventWindowId: eventWindowId || "",
                    teamId: "",
                    teamAccountIds: [],
                    score: [0],
                    pointsEarned: 0,
                    rank: 1,
                    percentile: 0,
                    liveSessionId: null,
                    pointBreakdown: {},
                    sessionHistory: []
                },
                entries: [],
                liveSessions: {}
            });
        }
    } catch (error) {
        log.error(`Error getting tournament leaderboard: ${error}`);
        console.error("Error getting tournament leaderboard:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Tournament leaderboard endpoint - MUST BE AT THE TOP TO CATCH REQUESTS FIRST
// Also handle endpoint without eventWindowId
app.get("/fortnite/api/game/v2/leaderboards/:eventId", async (req, res) => {
    try {
        const { eventId } = req.params;
        
        console.log(`\n========== [Leaderboard Request - No Window] ==========`);
        console.log(`[Leaderboard] FULL URL: ${req.originalUrl}`);
        console.log(`[Leaderboard] Request received - eventId: "${eventId}" (no eventWindowId)`);
        
        // Redirect to main leaderboard handler with empty eventWindowId
        if (eventId === "corelg_cup" || eventId === "corelg" || eventId === "corelg_cup1") {
            req.params.eventWindowId = "";
            // Call the main handler logic
            const tournamentEntries = await Tournament.find({ tournamentPoints: { $gt: 0 } })
                .sort({ tournamentPoints: -1, lastUpdated: 1 })
                .limit(100);
            
            const responseEventId = eventId === "corelg" ? "corelg" : "corelg_cup";
            
            const entries = tournamentEntries.map((entry, index) => {
                const totalPlayers = tournamentEntries.length;
                const percentile = totalPlayers > 0 ? ((index + 1) / totalPlayers) * 0.1 : 0.1;
                const pointBreakdown = {};
                
                if (entry.wins > 0) {
                    const winPoints = entry.wins * 4;
                    pointBreakdown["PLACEMENT_STAT_INDEX:1"] = {
                        timesAchieved: entry.wins,
                        pointsEarned: winPoints
                    };
                }
                
                if (entry.eliminations > 0) {
                    const elimPoints = entry.eliminations * 1;
                    pointBreakdown["TEAM_ELIMS_STAT_INDEX:1"] = {
                        timesAchieved: entry.eliminations,
                        pointsEarned: elimPoints
                    };
                }
                
                return {
                    scoreKey: {
                        gameId: "Fortnite",
                        eventId: responseEventId,
                        eventWindowId: "",
                        _scoreId: null
                    },
                    teamId: "",
                    teamAccountIds: [entry.accountId],
                    liveSessionId: null,
                    pointsEarned: entry.tournamentPoints,
                    score: entry.tournamentPoints,
                    rank: index + 1,
                    percentile: percentile,
                    pointBreakdown: pointBreakdown,
                    sessionHistory: []
                };
            });
            
            const leaderboard = {
                gameId: "Fortnite",
                eventId: responseEventId,
                eventWindowId: "",
                page: 0,
                totalPages: 1,
                updatedTime: new Date().toISOString(),
                entryTemplate: {
                    gameId: "Fortnite",
                    eventId: responseEventId,
                    eventWindowId: "",
                    teamAccountIds: [],
                    pointsEarned: 1,
                    score: 1.0,
                    rank: 1,
                    percentile: 0.1,
                    tokens: ["GroupIdentity_GeoIdentity_fortnite"],
                    teamId: "",
                    liveSessionId: null,
                    pointBreakdown: {
                        "PLACEMENT_STAT_INDEX:1": {
                            timesAchieved: 1,
                            pointsEarned: 10
                        },
                        "TEAM_ELIMS_STAT_INDEX:1": {
                            timesAchieved: 1,
                            pointsEarned: 2
                        }
                    },
                    sessionHistory: []
                },
                entries: entries,
                liveSessions: {}
            };
            
            console.log(`[Leaderboard] Returning ${entries.length} entries (no window)`);
            res.json(leaderboard);
            return;
        }
        
        res.json({
            gameId: "Fortnite",
            eventId: eventId || "",
            eventWindowId: "",
            page: 0,
            totalPages: 1,
            updatedTime: "",
            entryTemplate: {
                gameId: "Fortnite",
                eventId: eventId || "",
                eventWindowId: "",
                teamId: "",
                teamAccountIds: [],
                score: [0],
                pointsEarned: 0,
                rank: 1,
                percentile: 0,
                liveSessionId: null,
                pointBreakdown: {},
                sessionHistory: []
            },
            entries: [],
            liveSessions: {}
        });
    } catch (error) {
        log.error(`Error getting tournament leaderboard (no window): ${error}`);
        console.error("Error getting tournament leaderboard (no window):", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.get("/fortnite/api/game/v2/leaderboards/:eventId/:eventWindowId", async (req, res) => {
    try {
        const { eventId, eventWindowId } = req.params;
        
        console.log(`\n========== [Leaderboard Request] ==========`);
        console.log(`[Leaderboard] FULL URL: ${req.originalUrl}`);
        console.log(`[Leaderboard] Request received - eventId: "${eventId}", eventWindowId: "${eventWindowId}"`);
        log.debug(`GET /fortnite/api/game/v2/leaderboards/${eventId}/${eventWindowId} called`);
        
        // Handle tournament leaderboard (corelg_cup1)
        // Also handle if eventId is just "corelg" (some clients might use this)
        // Also handle empty eventWindowId or any variation
        if (eventId === "corelg_cup" || eventId === "corelg" || eventId === "corelg_cup1") {
            console.log(`[Leaderboard] Processing tournament leaderboard request`);
            
            // Use the eventId from request - keep "corelg" if that's what was requested
            const responseEventId = eventId === "corelg" ? "corelg" : "corelg_cup";
            // Use empty string if eventWindowId is empty or undefined, otherwise use the provided value
            const responseEventWindowId = (eventWindowId === "" || !eventWindowId) ? "" : eventWindowId;
            
            // Get all tournament entries sorted by points (descending)
            // Include players with eliminations > 0 OR wins > 0 OR tournamentPoints > 0
            const tournamentEntries = await Tournament.find({
                $or: [
                    { tournamentPoints: { $gt: 0 } },
                    { eliminations: { $gt: 0 } },
                    { wins: { $gt: 0 } }
                ]
            })
                .sort({ tournamentPoints: -1, lastUpdated: 1 })
                .limit(100); // Top 100 players
            
            console.log(`[Leaderboard] Found ${tournamentEntries.length} tournament entries`);
            
            if (tournamentEntries.length === 0) {
                console.log(`[Leaderboard] WARNING: No tournament entries found!`);
            }
            
            // Build entries array following the correct format
            const entries = tournamentEntries.map((entry, index) => {
                // Calculate percentile
                const totalPlayers = tournamentEntries.length;
                const percentile = totalPlayers > 0 ? ((index + 1) / totalPlayers) * 0.1 : 0.1;
                
                // Build pointBreakdown in the correct format
                const pointBreakdown = {};
                
                if (entry.wins > 0) {
                    // For wins (placement), use PLACEMENT_STAT_INDEX:1 (1st place = keyValue 1)
                    const winPoints = entry.wins * 10; // 10 points per win
                    pointBreakdown["PLACEMENT_STAT_INDEX:1"] = {
                        timesAchieved: entry.wins,
                        pointsEarned: winPoints
                    };
                }
                
                if (entry.eliminations > 0) {
                    // For eliminations, use TEAM_ELIMS_STAT_INDEX:1
                    const elimPoints = entry.eliminations * 2; // 2 points per elimination
                    pointBreakdown["TEAM_ELIMS_STAT_INDEX:1"] = {
                        timesAchieved: entry.eliminations,
                        pointsEarned: elimPoints
                    };
                }
                
                return {
                    scoreKey: {
                        gameId: "Fortnite",
                        eventId: responseEventId,
                        eventWindowId: responseEventWindowId,
                        _scoreId: null
                    },
                    teamId: "",
                    teamAccountIds: [entry.accountId],
                    liveSessionId: null,
                    pointsEarned: entry.tournamentPoints,
                    score: entry.tournamentPoints,
                    rank: index + 1,
                    percentile: percentile,
                    pointBreakdown: pointBreakdown,
                    sessionHistory: []
                };
            });
            
            const leaderboard = {
                gameId: "Fortnite",
                eventId: responseEventId,
                eventWindowId: responseEventWindowId,
                page: 0,
                totalPages: 1,
                updatedTime: new Date().toISOString(),
                entryTemplate: {
                    gameId: "Fortnite",
                    eventId: responseEventId,
                    eventWindowId: responseEventWindowId,
                    teamAccountIds: [],
                    pointsEarned: 1,
                    score: 1.0,
                    rank: 1,
                    percentile: 0.1,
                    tokens: ["GroupIdentity_GeoIdentity_fortnite"],
                    teamId: "",
                    liveSessionId: null,
                    pointBreakdown: {
                        "PLACEMENT_STAT_INDEX:1": {
                            timesAchieved: 1,
                            pointsEarned: 10
                        },
                        "TEAM_ELIMS_STAT_INDEX:1": {
                            timesAchieved: 1,
                            pointsEarned: 2
                        }
                    },
                    sessionHistory: []
                },
                entries: entries,
                liveSessions: {}
            };
            
            console.log(`[Leaderboard] Returning ${entries.length} entries to client`);
            if (entries.length > 0) {
                console.log(`[Leaderboard] Top entry: ${entries[0].teamAccountIds[0]} - ${entries[0].pointsEarned} points (rank ${entries[0].rank})`);
            }
            res.json(leaderboard);
        } else {
            // Return empty leaderboard for other events
            console.log(`[Leaderboard] Event not handled (${eventId}/${eventWindowId}) - returning empty leaderboard`);
            res.json({
                gameId: "Fortnite",
                eventId: eventId || "",
                eventWindowId: eventWindowId || "",
                page: 0,
                totalPages: 1,
                updatedTime: "",
                entryTemplate: {
                    gameId: "Fortnite",
                    eventId: eventId || "",
                    eventWindowId: eventWindowId || "",
                    teamId: "",
                    teamAccountIds: [],
                    score: [0],
                    pointsEarned: 0,
                    rank: 1,
                    percentile: 0,
                    liveSessionId: null,
                    pointBreakdown: {},
                    sessionHistory: []
                },
                entries: [],
                liveSessions: {}
            });
        }
    } catch (error) {
        log.error(`Error getting tournament leaderboard: ${error}`);
        console.error("Error getting tournament leaderboard:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.post("/fortnite/api/game/v2/chat/*/*/*/pc", (req, res) => {
    log.debug("POST /fortnite/api/game/v2/chat/*/*/*/pc called");
    let resp = config.chat.EnableGlobalChat ? { "GlobalChatRooms": [{ "roomName": "Project Pulseglobal" }] } : {};

    res.json(resp);
});

app.post("/fortnite/api/game/v2/tryPlayOnPlatform/account/*", (req, res) => {
    log.debug("POST /fortnite/api/game/v2/tryPlayOnPlatform/account/* called");
    res.setHeader("Content-Type", "text/plain");
    res.send(true);
});

app.get("/launcher/api/public/distributionpoints/", (req, res) => {
    log.debug("GET /launcher/api/public/distributionpoints/ called");
    res.json({
        "distributions": [
            "https://download.epicgames.com/",
            "https://download2.epicgames.com/",
            "https://download3.epicgames.com/",
            "https://download4.epicgames.com/",
            "https://epicgames-download1.akamaized.net/"
        ]
    });
});

app.get("/launcher/api/public/assets/*", async (req, res) => {
    res.json({
        "appName": "FortniteContentBuilds",
        "labelName": "Project Pulse Backend",
        "buildVersion": "++Fortnite+Release-20.00-CL-19458861-Windows",
        "catalogItemId": "5cb97847cee34581afdbc445400e2f77",
        "expires": "9999-12-31T23:59:59.999Z",
        "items": {
            "MANIFEST": {
                "signature": "Project Pulse Backend",
                "distribution": "https://Project Pulse.ol.epicgames.com/",
                "path": "Builds/Fortnite/Content/CloudDir/Project PulseBackend.manifest",
                "hash": "55bb954f5596cadbe03693e1c06ca73368d427f3",
                "additionalDistributions": []
            },
            "CHUNKS": {
                "signature": "Project Pulse Backend",
                "distribution": "https://Project Pulse.ol.epicgames.com/",
                "path": "Builds/Fortnite/Content/CloudDir/Project PulseBackend.manifest",
                "additionalDistributions": []
            }
        },
        "assetId": "FortniteContentBuilds"
    });
})

app.get("/Builds/Fortnite/Content/CloudDir/*.manifest", async (req, res) => {
    res.set("Content-Type", "application/octet-stream")

    const manifest = fs.readFileSync(path.join(__dirname, "..", "responses", "CloudDir", "Project Pulse Backend.manifest"));

    res.status(200).send(manifest).end();
})

app.get("/Builds/Fortnite/Content/CloudDir/*.chunk", async (req, res) => {
    res.set("Content-Type", "application/octet-stream")

    const chunk = fs.readFileSync(path.join(__dirname, "..", "responses", "CloudDir", "Project Pulse Backend.chunk"));

    res.status(200).send(chunk).end();
})

app.post("/fortnite/api/game/v2/grant_access/*", async (req, res) => {
    log.debug("POST /fortnite/api/game/v2/grant_access/* called");
    res.json({});
    res.status(204);
})

app.post("/api/v1/user/setting", async (req, res) => {
    log.debug("POST /api/v1/user/setting called");
    res.json([]);
})

app.get("/Builds/Fortnite/Content/CloudDir/*.ini", async (req, res) => {
    const ini = fs.readFileSync(path.join(__dirname, "..", "responses", "CloudDir", "Full.ini"));

    res.status(200).send(ini).end();
})

app.get("/waitingroom/api/waitingroom", (req, res) => {
    log.debug("GET /waitingroom/api/waitingroom called");
    res.status(204);
    res.end();
}); 

app.get("/socialban/api/public/v1/*", (req, res) => {
    log.debug("GET /socialban/api/public/v1/* called");
    res.json({
        "bans": [],
        "warnings": []
    });
});

app.get("/fortnite/api/game/v2/events/tournamentandhistory/*/EU/WindowsClient", async (req, res) => {
    log.debug("GET /fortnite/api/game/v2/events/tournamentandhistory/*/EU/WindowsClient called");
    console.log(`[Tournament] tournamentandhistory endpoint called`);
    
    // Try to return tournament data from eventlistactive.json
    try {
        const eventListPath = path.join(__dirname, "./../responses/eventlistactive.json");
        const eventListRaw = fs.readFileSync(eventListPath, "utf8");
        const eventList = JSON.parse(eventListRaw);
        
        // Find tournament event
        const tournamentEvent = eventList.events.find(event => event.eventId === "corelg_cup");
        if (tournamentEvent) {
            res.json({
                events: [tournamentEvent],
                player: eventList.player || {},
                templates: eventList.templates.filter(t => t.eventTemplateId === "corelg_cups")
            });
        } else {
            res.json({});
        }
    } catch (error) {
        console.error("Error in tournamentandhistory:", error);
        res.json({});
    }
});

// Tournament history endpoint - the game calls this to get player's tournament history
app.get("/api/v1/events/Fortnite/:eventId/history/:accountId", async (req, res) => {
    try {
        const { eventId, accountId } = req.params;
        
        console.log(`\n========== [Tournament History] ==========`);
        console.log(`[Tournament History] Request received - eventId: ${eventId}, accountId: ${accountId}`);
        
        if (eventId === "corelg_cup") {
            // Get player's tournament stats
            const tournamentData = await Tournament.findOne({ accountId: accountId });
            
            if (!tournamentData || tournamentData.tournamentPoints === 0) {
                // Return empty history if player has no tournament data
                console.log(`[Tournament History] No data found for accountId: ${accountId}`);
                res.json([]);
                return;
            }
            
            // Calculate player's rank from leaderboard
            const allPlayers = await Tournament.find({ tournamentPoints: { $gt: 0 } })
                .sort({ tournamentPoints: -1, lastUpdated: 1 });
            const playerRank = allPlayers.findIndex(p => p.accountId === accountId) + 1;
            const totalPlayers = allPlayers.length;
            const percentile = totalPlayers > 0 ? (playerRank / totalPlayers) * 0.1 : 0.0;
            
            // Build pointBreakdown in the correct format
            const pointBreakdown = {};
            
                if (tournamentData.wins > 0) {
                    // For wins (placement), use PLACEMENT_STAT_INDEX:1 (1st place = keyValue 1)
                    const winPoints = tournamentData.wins * 10; // 10 points per win
                    pointBreakdown["PLACEMENT_STAT_INDEX:1"] = {
                        timesAchieved: tournamentData.wins,
                        pointsEarned: winPoints
                    };
                }
                
                if (tournamentData.eliminations > 0) {
                    // For eliminations, use TEAM_ELIMS_STAT_INDEX:1
                    const elimPoints = tournamentData.eliminations * 2; // 2 points per elimination
                    pointBreakdown["TEAM_ELIMS_STAT_INDEX:1"] = {
                        timesAchieved: tournamentData.eliminations,
                        pointsEarned: elimPoints
                    };
                }
            
            // Build history response - the game expects an array format
            const history = [
                {
                    scoreKey: {
                        gameId: "Fortnite",
                        eventId: eventId,
                        eventWindowId: "corelg_cup1",
                        _scoreId: null
                    },
                    teamId: "",
                    teamAccountIds: [accountId],
                    liveSessionId: null,
                    pointsEarned: tournamentData.tournamentPoints || 0,
                    score: tournamentData.tournamentPoints || 0,
                    rank: playerRank || 0,
                    percentile: percentile,
                    pointBreakdown: pointBreakdown,
                    sessionHistory: [],
                    unscoredSessions: []
                }
            ];
            
            console.log(`[Tournament History] Returning history for ${accountId}:`);
            console.log(`  - Points: ${tournamentData.tournamentPoints}`);
            console.log(`  - Wins: ${tournamentData.wins || 0}`);
            console.log(`  - Eliminations: ${tournamentData.eliminations || 0}`);
            console.log(`  - Rank: ${playerRank}`);
            console.log(`  - PointBreakdown:`, JSON.stringify(pointBreakdown, null, 2));
            res.json(history);
        } else {
            // Return empty for other events
            console.log(`[Tournament History] Event ${eventId} not handled, returning empty`);
            res.json([]);
        }
    } catch (error) {
        log.error(`Error getting tournament history: ${error}`);
        console.error("Error getting tournament history:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.get("/fortnite/api/statsv2/account/:accountId", (req, res) => {
    log.debug(`GET /fortnite/api/statsv2/account/${req.params.accountId} called`);
    res.json({
        "startTime": 0,
        "endTime": 0,
        "stats": {},
        "accountId": req.params.accountId
    });
});

app.get("/statsproxy/api/statsv2/account/:accountId", (req, res) => {
    log.debug(`GET /statsproxy/api/statsv2/account/${req.params.accountId} called`);
    res.json({
        "startTime": 0,
        "endTime": 0,
        "stats": {},
        "accountId": req.params.accountId
    });
});

app.get("/fortnite/api/stats/accountId/:accountId/bulk/window/alltime", (req, res) => {
    log.debug(`GET /fortnite/api/stats/accountId/${req.params.accountId}/bulk/window/alltime called`);
    res.json({
        "startTime": 0,
        "endTime": 0,
        "stats": {},
        "accountId": req.params.accountId
    });
});

app.get("/d98eeaac-2bfa-4bf4-8a59-bdc95469c693", async (req, res) => {
    res.json({
        "playlist": "PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4KPE1QRCB4bWxucz0idXJuOm1wZWc6ZGFzaDpzY2hlbWE6bXBkOjIwMTEiIHhtbG5zOnhzaT0iaHR0cDovL3d3dy53My5vcmcvMjAwMS9YTUxTY2hlbWEtaW5zdGFuY2UiIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB4c2k6c2NoZW1hTG9jYXRpb249InVybjptcGVnOkRBU0g6c2NoZW1hOk1QRDoyMDExIGh0dHA6Ly9zdGFuZGFyZHMuaXNvLm9yZy9pdHRmL1B1YmxpY2x5QXZhaWxhYmxlU3RhbmRhcmRzL01QRUctREFTSF9zY2hlbWFfZmlsZXMvREFTSC1NUEQueHNkIiBwcm9maWxlcz0idXJuOm1wZWc6ZGFzaDpwcm9maWxlOmlzb2ZmLWxpdmU6MjAxMSIgdHlwZT0ic3RhdGljIiBtZWRpYVByZXNlbnRhdGlvbkR1cmF0aW9uPSJQVDMwLjIxM1MiIG1heFNlZ21lbnREdXJhdGlvbj0iUFQyLjAwMFMiIG1pbkJ1ZmZlclRpbWU9IlBUNC4xMDZTIj4KICA8QmFzZVVSTD5odHRwczovL2ZvcnRuaXRlLXB1YmxpYy1zZXJ2aWNlLXByb2QxMS5vbC5lcGljZ2FtZXMuY29tL2F1ZGlvL0phbVRyYWNrcy9PR1JlbWl4LzwvQmFzZVVSTD4KICA8UHJvZ3JhbUluZm9ybWF0aW9uPjwvUHJvZ3JhbUluZm9ybWF0aW9uPgogIDxQZXJpb2QgaWQ9IjAiIHN0YXJ0PSJQVDBTIj4KICAgIDxBZGFwdGF0aW9uU2V0IGlkPSIwIiBjb250ZW50VHlwZT0iYXVkaW8iIHN0YXJ0V2l0aFNBUD0iMSIgc2VnbWVudEFsaWdubWVudD0idHJ1ZSIgYml0c3RyZWFtU3dpdGNoaW5nPSJ0cnVlIj4KICAgICAgPFJlcHJlc2VudGF0aW9uIGlkPSIwIiBhdWRpb1NhbXBsaW5nUmF0ZT0iNDgwMDAiIGJhbmR3aWR0aD0iMTI4MDAwIiBtaW1lVHlwZT0iYXVkaW8vbXA0IiBjb2RlY3M9Im1wNGEuNDAuMiI+CiAgICAgICAgPFNlZ21lbnRUZW1wbGF0ZSBkdXJhdGlvbj0iMjAwMDAwMCIgdGltZXNjYWxlPSIxMDAwMDAwIiBpbml0aWFsaXphdGlvbj0iaW5pdF8kUmVwcmVzZW50YXRpb25JRCQubXA0IiBtZWRpYT0ic2VnbWVudF8kUmVwcmVzZW50YXRpb25JRCRfJE51bWJlciQubTRzIiBzdGFydE51bWJlcj0iMSI+PC9TZWdtZW50VGVtcGxhdGU+CiAgICAgICAgPEF1ZGlvQ2hhbm5lbENvbmZpZ3VyYXRpb24gc2NoZW1lSWRVcmk9InVybjptcGVnOmRhc2g6MjMwMDM6MzphdWRpb19jaGFubmVsX2NvbmZpZ3VyYXRpb246MjAxMSIgdmFsdWU9IjIiPjwvQXVkaW9DaGFubmVsQ29uZmlndXJhdGlvbj4KICAgICAgPC9SZXByZXNlbnRhdGlvbj4KICAgIDwvQWRhcHRhdGlvblNldD4KICA8L1BlcmlvZD4KPC9NUEQ+",
        "playlistType": "application/dash+xml",
        "metadata": {
            "assetId": "",
            "baseUrls": [
                "https://fortnite-public-service-prod11.ol.epicgames.com/audio/JamTracks/OGRemix/"
            ],
            "supportsCaching": true,
            "ucp": "a",
            "version": "f2528fa1-5f30-42ff-8ae5-a03e3b023a0a"
        }
    })
})

app.post("/fortnite/api/feedback/*", (req, res) => {
    log.debug("POST /fortnite/api/feedback/* called");
    res.status(200);
    res.end();
});

app.post("/fortnite/api/statsv2/query", (req, res) => {
    log.debug("POST /fortnite/api/statsv2/query called");
    res.json([]);
});

app.post("/statsproxy/api/statsv2/query", (req, res) => {
    log.debug("POST /statsproxy/api/statsv2/query called");
    res.json([]);
});

app.post("/fortnite/api/game/v2/events/v2/setSubgroup/*", (req, res) => {
    log.debug("POST /fortnite/api/game/v2/events/v2/setSubgroup/* called");
    res.status(204);
    res.end();
});

app.get("/fortnite/api/game/v2/enabled_features", (req, res) => {
    log.debug("GET /fortnite/api/game/v2/enabled_features called");
    res.json([]);
});

app.get("/api/v1/events/Fortnite/download/:accountId", async (req, res) => {
    const accountId = req.params.accountId;

    try {
        // console.log(req.params);
       // console.log("accountId: " + accountId);
        const playerData = await Arena.findOne({ accountId: accountId });
        const hypePoints = playerData ? playerData.hype : 0;
        const division = playerData ? playerData.division : 0;

        const eventsDataPath = path.join(__dirname, "./../responses/eventlistactive.json");
        const events = JSON.parse(fs.readFileSync(eventsDataPath, 'utf-8'));
// console.log("hypePoints: " + hypePoints);
        events.player = {
            accountId: accountId,
            gameId: "Fortnite",
            persistentScores: {
                Hype: hypePoints
            },
            tokens: [`ARENA_S17_Division${division + 1}`]
        };

        res.json(events);

    } catch (error) {
        console.error("Error fetching Arena data:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
});

app.get("/fortnite/api/game/v2/twitch/*", (req, res) => {
    log.debug("GET /fortnite/api/game/v2/twitch/* called");
    res.status(200);
    res.end();
});

app.get("/fortnite/api/game/v2/world/info", (req, res) => {
    log.debug("GET /fortnite/api/game/v2/world/info called");
    res.json({});
});

app.post("/fortnite/api/game/v2/chat/*/recommendGeneralChatRooms/pc", (req, res) => {
    log.debug("POST /fortnite/api/game/v2/chat/*/recommendGeneralChatRooms/pc called");
    res.json({});
});

app.get("/presence/api/v1/_/*/last-online", async (req, res) => {
    log.debug("GET /presence/api/v1/_/*/last-online called");
    res.json({})
})

app.get("/fortnite/api/receipts/v1/account/*/receipts", (req, res) => {
    log.debug("GET /fortnite/api/receipts/v1/account/*/receipts called");
    res.json([]);
});

app.get("/fortnite/api/game/v2/leaderboards/cohort/*", async (req, res) => {
    log.debug("GET /fortnite/api/game/v2/leaderboards/cohort/* called");
    console.log(`[Leaderboard] Cohort endpoint called: ${req.url}`);
    
    // Try to return tournament leaderboard if it's a tournament request
    try {
        const tournamentEntries = await Tournament.find({ tournamentPoints: { $gt: 0 } })
            .sort({ tournamentPoints: -1, lastUpdated: 1 })
            .limit(100);
        
        if (tournamentEntries.length > 0) {
            const entries = tournamentEntries.map((entry, index) => ({
                gameId: "Fortnite",
                eventId: "corelg",
                eventWindowId: "corelg_cup1",
                teamId: "",
                teamAccountIds: [entry.accountId],
                score: [entry.tournamentPoints],
                pointsEarned: entry.tournamentPoints,
                rank: index + 1,
                percentile: 0,
                liveSessionId: null,
                pointBreakdown: {
                    eliminations: entry.eliminations || 0,
                    wins: entry.wins || 0
                },
                sessionHistory: []
            }));
            
            console.log(`[Leaderboard] Cohort returning ${entries.length} entries`);
            res.json(entries);
            return;
        }
    } catch (error) {
        console.error("Error in cohort leaderboard:", error);
    }
    
    res.json([]);
});

app.post("/api/v1/assets/Fortnite/*/*", async (req, res) => {
    log.debug("POST /api/v1/assets/Fortnite/*/* called");
    if (req.body.hasOwnProperty("FortCreativeDiscoverySurface") && req.body.FortCreativeDiscoverySurface == 0) {
        const discovery_api_assets = require("./../responses/Discovery/discovery_api_assets.json");
        res.json(discovery_api_assets)
    } else {
        res.json({
            "FortCreativeDiscoverySurface": {
                "meta": {
                    "promotion": req.body.FortCreativeDiscoverySurface || 0
                },
                "assets": {}
            }
        })
    }
})

app.get("/region", async (req, res) => {
    log.debug("GET /region called");
    res.json({
        "continent": {
            "code": "EU",
            "geoname_id": 6255148,
            "names": {
                "de": "Europa",
                "en": "Europe",
                "es": "Europa",
                "it": "Europa",
                "fr": "Europe",
                "ja": "ヨーロッパ",
                "pt-BR": "Europa",
                "ru": "Европа",
                "zh-CN": "欧洲"
            }
        },
        "country": {
            "geoname_id": 2635167,
            "is_in_european_union": false,
            "iso_code": "GB",
            "names": {
                "de": "UK",
                "en": "United Kingdom",
                "es": "RU",
                "it": "Stati Uniti",
                "fr": "Royaume Uni",
                "ja": "英国",
                "pt-BR": "Reino Unido",
                "ru": "Британия",
                "zh-CN": "英国"
            }
        },
        "subdivisions": [
            {
                "geoname_id": 6269131,
                "iso_code": "ENG",
                "names": {
                    "de": "England",
                    "en": "England",
                    "es": "Inglaterra",
                    "it": "Inghilterra",
                    "fr": "Angleterre",
                    "ja": "イングランド",
                    "pt-BR": "Inglaterra",
                    "ru": "Англия",
                    "zh-CN": "英格兰"
                }
            },
            {
                "geoname_id": 3333157,
                "iso_code": "KEC",
                "names": {
                    "en": "Royal Kensington and Chelsea"
                }
            }
        ]
    })
})

app.all("/v1/epic-settings/public/users/*/values", async (req, res) => {
    const epicsettings = require("./../responses/epic-settings.json");
    res.json(epicsettings)
})

app.get("/fortnite/api/game/v2/br-inventory/account/*", async (req, res) => {
    log.debug(`GET /fortnite/api/game/v2/br-inventory/account/${req.params.accountId} called`);
    res.json({
        "stash": {
            "globalcash": 0
        }
    })
})

app.get("/hotconfigs/v2/livefn.json", async (req, res) => {
    log.debug("GET /hotconfigs/v2/livefn.json called");

    res.json({
        "HotConfigData": [
        {
          "AppId": "livefn",
          "EpicApp": "FortniteLivefn",
          "Modules": [
            {
              "ModuleName": "GameServiceMcp",
              "Endpoints": {
                "Android": "fngw-mcp-gc-livefn.ol.epicgames.com",
                "DedicatedServer": "fngw-mcp-ds-livefn.ol.epicgames.com",
                "Default": "fngw-mcp-gc-livefn.ol.epicgames.com",
                "IOS": "fngw-mcp-gc-livefn.ol.epicgames.com",
                "Linux": "fngw-mcp-gc-livefn.ol.epicgames.com",
                "Mac": "fngw-mcp-gc-livefn.ol.epicgames.com",
                "PS4": "fngw-mcp-gc-livefn.ol.epicgames.com",
                "PS5": "fngw-mcp-gc-livefn.ol.epicgames.com",
                "Switch": "fngw-mcp-gc-livefn.ol.epicgames.com",
                "Windows": "fngw-mcp-gc-livefn.ol.epicgames.com",
                "XB1": "fngw-mcp-gc-livefn.ol.epicgames.com",
                "XSX": "fngw-mcp-gc-livefn.ol.epicgames.com",
                "XboxOneGDK": "fngw-mcp-gc-livefn.ol.epicgames.com",
              },
            },
          ],
        },
      ],
    })
})

app.post("/publickey/v2/publickey", async (req, res) => {
    const body = req.body || {};
    return res.json({
        "key": body.key,
        "accountId": req.query.accountId,
        "key_guid": uuid.v4(),
        //"kid": "20230621",
        "expiration": "9999-12-31T23:59:59.999Z",
        "jwt": "Interlude",
        "type2": "legacy",
    });
})

app.post("/publickey/v2/publickey/", async (req, res) => {
    const body = req.body || {};
    return res.json({
        "key": body.key,
        "accountId": req.query.accountId || "Havoc",
        "key_guid": uuid.v4(),
        //"kid": "20230621",
        "expiration": "9999-12-31T23:59:59.999Z",
        "jwt": "Interlude",
        "type": "legacy",
    });
})

app.post("/datarouter/api/v1/public/data", async (req, res) => {
    try {
        const accountId = getAccountIdData(req.query.UserID);
        const data = req.body.Events;

        if (Array.isArray(data) && data.length > 0) {
            const findUser = await User.findOne({accountId});

            if (findUser) {
                // Get player's current playlist from KV store (set during matchmaking)
                let currentPlaylist = null;
                try {
                    if (global.kv && typeof global.kv.get === 'function') {
                        currentPlaylist = await global.kv.get(`playerPlaylist:${accountId}`);
                        console.log(`[Tournament Check] Player ${accountId} current playlist from KV: "${currentPlaylist}"`);
                    } else {
                        console.log(`[Tournament Check] KV store not available`);
                    }
                } catch (err) {
                    console.log(`[Tournament Check] Could not get playlist from KV:`, err.message);
                }
                
                // Check PlaylistName from event data as fallback
                let eventPlaylistName = null;
                if (data && data.length > 0 && data[0].PlaylistName) {
                    eventPlaylistName = data[0].PlaylistName;
                    console.log(`[Tournament Check] PlaylistName from event: "${eventPlaylistName}"`);
                }
                
                // Check if player is in tournament playlist (check both KV and event data)
                const isTournamentPlaylist = currentPlaylist === "playlist_showdowntournament_solo" || 
                                             currentPlaylist === "Playlist_ShowdownTournament_Solo" ||
                                             (currentPlaylist && typeof currentPlaylist === 'string' && currentPlaylist.toLowerCase().includes("showdowntournament")) ||
                                             (currentPlaylist && typeof currentPlaylist === 'string' && currentPlaylist.toLowerCase().includes("tournament")) ||
                                             eventPlaylistName === "playlist_showdowntournament_solo" ||
                                             eventPlaylistName === "Playlist_ShowdownTournament_Solo" ||
                                             (eventPlaylistName && typeof eventPlaylistName === 'string' && eventPlaylistName.toLowerCase().includes("showdowntournament")) ||
                                             (eventPlaylistName && typeof eventPlaylistName === 'string' && eventPlaylistName.toLowerCase().includes("tournament"));
                
                if (isTournamentPlaylist) {
                    console.log(`[Tournament Check] ✓ Player ${accountId} is in TOURNAMENT playlist (KV: "${currentPlaylist}", Event: "${eventPlaylistName}")`);
                } else {
                    console.log(`[Tournament Check] ✗ Player ${accountId} is NOT in tournament playlist (KV: "${currentPlaylist}", Event: "${eventPlaylistName}")`);
                }
                
                for (const event of data) {
                    const {
                        EventName,
                        ProviderType,
                        PlayerKilledPlayerEventCount,
                        PlaylistName: eventPlaylistName,
                        GameSessionID,
                        GameSessionId,
                    } = event;

                    // Check PlaylistName from this specific event as fallback
                    let finalIsTournament = isTournamentPlaylist;
                    if (!finalIsTournament && eventPlaylistName) {
                        finalIsTournament = eventPlaylistName === "playlist_showdowntournament_solo" ||
                                           eventPlaylistName === "Playlist_ShowdownTournament_Solo" ||
                                           (typeof eventPlaylistName === 'string' && eventPlaylistName.toLowerCase().includes("showdowntournament")) ||
                                           (typeof eventPlaylistName === 'string' && eventPlaylistName.toLowerCase().includes("tournament"));
                        if (finalIsTournament) {
                            console.log(`[Tournament Check] Event ${EventName} has tournament PlaylistName: "${eventPlaylistName}"`);
                        }
                    }
                    
                    // CRITICAL: If tournaments are disabled in config, FORCE arena mode (V-Bucks/XP)
                    // This ensures V-Bucks and XP work even if playlist name suggests tournament
                    if (!ENABLE_TOURNAMENTS) {
                        finalIsTournament = false;
                    }

                    // Some clients/events omit ProviderType or use a different value.
                    // We accept missing ProviderType, but still require EventName.
                    if (EventName && (!ProviderType || ProviderType === "Client")) {
                        // Kills can come in different fields depending on build/event variant.
                        const rawKillsCount =
                            Number(PlayerKilledPlayerEventCount) ||
                            Number(event.Eliminations) ||
                            Number(event.eliminations) ||
                            Number(event.Kills) ||
                            Number(event.kills) ||
                            0;

                        // Use GameSessionID to avoid "won=true forever" and to prevent duplicate win in same match.
                        const sessionId = GameSessionID || GameSessionId || null;
                        if (sessionId) {
                            if (!global.gameRewards) global.gameRewards = {};
                            if (!global.gameRewards[accountId]) {
                                // Minimal session-scoped tracking (kept small to avoid interfering with arena rewards)
                                global.gameRewards[accountId] = { won: false, lastSessionId: sessionId, lastKillCount: 0, matchPlayedCounted: false };
                            }

                            if (global.gameRewards[accountId].lastSessionId !== sessionId) {
                                // New match -> reset duplicate guards
                                global.gameRewards[accountId].lastSessionId = sessionId;
                                global.gameRewards[accountId].won = false;
                                global.gameRewards[accountId].matchPlayedCounted = false;
                                global.gameRewards[accountId].lastKillCount = 0;
                            }
                        }

                        // IMPORTANT:
                        // Some builds send kills as a cumulative match counter (2,4,6...),
                        // others send per-event (usually 1). To avoid overcounting:
                        // - If value increases -> add the delta
                        // - If value stays at 1 repeatedly -> treat as per-event 1
                        let killDelta = 0;
                        const lastKillCount =
                            global.gameRewards && global.gameRewards[accountId]
                                ? Number(global.gameRewards[accountId].lastKillCount || 0)
                                : 0;

                        if (rawKillsCount > lastKillCount) {
                            killDelta = rawKillsCount - lastKillCount;
                        } else if (rawKillsCount === 1 && lastKillCount === 1) {
                            // Likely per-event reporting
                            killDelta = 1;
                        } else {
                            killDelta = 0;
                        }

                        if (global.gameRewards && global.gameRewards[accountId]) {
                            global.gameRewards[accountId].lastKillCount = Math.max(lastKillCount, rawKillsCount);
                        }

                        switch (EventName) {
                            case "Athena.ClientWonMatch": // When a player wins a match
                                console.log(`[EVENT] Athena.ClientWonMatch received for player ${accountId}, isTournament: ${finalIsTournament}`);

                                // Prevent duplicate win processing
                                if (global.gameRewards && global.gameRewards[accountId] && global.gameRewards[accountId].won === true) {
                                    console.log(`[Win] Player ${accountId} already won this match, skipping duplicate processing`);
                                    break;
                                }

                                if (finalIsTournament) {
                                    // TOURNAMENT MODE: Add tournament victory points immediately
                                    console.log(`[Tournament Win] Processing win for player ${accountId}`);
                                    try {
                                        await addVictoryTournamentPoints(findUser);
                                        console.log(`[Tournament Win] ✓ Added victory tournament points for ${accountId}`);
                                        
                                        // Mark as won to prevent duplicates
                                        if (!global.gameRewards) global.gameRewards = {};
                                        if (!global.gameRewards[accountId]) {
                                            global.gameRewards[accountId] = { eliminations: 0, won: false, matchCompleted: false, matchesCompleted: 0, xpEarned: 0, isTournament: true };
                                        }
                                        global.gameRewards[accountId].won = true;
                                        global.gameRewards[accountId].matchCompleted = true;
                                        global.gameRewards[accountId].isTournament = true;
                                    } catch (err) {
                                        console.error(`[Tournament Win] Error adding victory tournament points:`, err);
                                    }
                                } else {
                                    // ARENA MODE: Add hype points and V-Bucks
                                    await addVictoryHypePoints(findUser);
                                    console.log(`[Arena Win] Added victory hype points for user: ${accountId}`);
                                    
                                    // CRITICAL: Mark for V-Bucks/XP reward
                                    if (!global.gameFinishedReward) global.gameFinishedReward = {};
                                    global.gameFinishedReward[accountId] = true;
                                    
                                    // CRITICAL: Ensure gameRewards object exists with all required fields
                                    if (!global.gameRewards) global.gameRewards = {};
                                    if (!global.gameRewards[accountId] || typeof global.gameRewards[accountId] !== "object") {
                                        global.gameRewards[accountId] = {
                                            eliminations: 0,
                                            won: false,
                                            matchCompleted: false,
                                            matchesCompleted: 0,
                                            xpEarned: 0,
                                            isTournament: false
                                        };
                                    }
                                    
                                    // Ensure all fields are numbers (not NaN) and isTournament is explicitly false
                                    global.gameRewards[accountId].eliminations = Number(global.gameRewards[accountId].eliminations || 0);
                                    global.gameRewards[accountId].xpEarned = Number(global.gameRewards[accountId].xpEarned || 0);
                                    global.gameRewards[accountId].matchesCompleted = Number(global.gameRewards[accountId].matchesCompleted || 0);
                                    global.gameRewards[accountId].isTournament = false; // CRITICAL: Must be false for mcp.js to grant V-Bucks
                                    global.gameRewards[accountId].won = true;
                                    global.gameRewards[accountId].matchCompleted = true;
                                    global.gameRewards[accountId].matchesCompleted = (global.gameRewards[accountId].matchesCompleted || 0) + 1;
                                    
                                    const winXP = event.TotalXp || event.totalXp || event.XP || event.xp || 12000;
                                    global.gameRewards[accountId].xpEarned = (global.gameRewards[accountId].xpEarned || 0) + winXP;
                                    
                                    console.log(`[Arena Win] ✓ Marked for V-Bucks/XP: eliminations=${global.gameRewards[accountId].eliminations}, xpEarned=${global.gameRewards[accountId].xpEarned}, isTournament=${global.gameRewards[accountId].isTournament}`);
                                }

                                break;
                            case "Combat.AthenaClientEngagement": // When a player kill someone
                                console.log(
                                    `[KILL EVENT] ${accountId} - rawKills=${rawKillsCount}, deltaKills=${killDelta}, isTournament: ${finalIsTournament}`
                                );

                                if (finalIsTournament) {
                                    // TOURNAMENT MODE: Add tournament elimination points immediately for each kill
                                    console.log(`[Tournament Kill] Processing ${killDelta} new kill(s) for player ${accountId}`);
                                    try {
                                        // Call addTournamentEliminationPoints for EACH kill (like arena does)
                                        for (let i = 0; i < killDelta; i++) {
                                            await addTournamentEliminationPoints(findUser);
                                            console.log(`[Tournament Kill] ✓ Added elimination ${i + 1}/${killDelta} for ${accountId}`);
                                        }
                                    } catch (err) {
                                        console.error(`[Tournament Kill] Error adding tournament elimination points:`, err);
                                    }
                                } else {
                                    // ARENA MODE: Add hype points
                                    for (let i = 0; i < killDelta; i++) {
                                        await addEliminationHypePoints(findUser);
                                        console.log(`[Arena Kill] Added elimination hype points for user: ${accountId}`);
                                    }
                                    
                                    // Track elimination rewards: 25 V-Bucks per kill
                                    if (!global.gameRewards) global.gameRewards = {};
                                    if (!global.gameRewards[accountId] || typeof global.gameRewards[accountId] !== "object") {
                                        global.gameRewards[accountId] = {
                                            eliminations: 0,
                                            won: false,
                                            matchCompleted: false,
                                            matchesCompleted: 0,
                                            xpEarned: 0,
                                            isTournament: false
                                        };
                                    }
                                    
                                    // CRITICAL: Ensure isTournament is false and fields are numbers
                                    global.gameRewards[accountId].isTournament = false;
                                    global.gameRewards[accountId].eliminations = (Number(global.gameRewards[accountId].eliminations) || 0) + killDelta;
                                    
                                    const killXP = (event.TotalXp || event.totalXp || event.XP || event.xp || 0) + (killDelta * 50);
                                    global.gameRewards[accountId].xpEarned = (Number(global.gameRewards[accountId].xpEarned) || 0) + (killDelta * 50);
                                    
                                    console.log(`[Arena Kill] ✓ Tracked: eliminations=${global.gameRewards[accountId].eliminations}, xpEarned=${global.gameRewards[accountId].xpEarned}, isTournament=${global.gameRewards[accountId].isTournament}`);
                                }

                                break;

                            case "Combat.ClientPlayerDeath": // When a player dies
                                console.log(`[DEATH EVENT] ${accountId} - isTournament: ${finalIsTournament}`);

                                if (finalIsTournament) {
                                    // TOURNAMENT MODE: Just update matches played (kills and wins already processed)
                                    console.log(`[Tournament Death] Player ${accountId} died - updating matches played`);
                                    try {
                                        // Only count matchPlayed once per match (session)
                                        if (
                                            !global.gameRewards ||
                                            !global.gameRewards[accountId] ||
                                            global.gameRewards[accountId].won
                                        ) {
                                            console.log(`[Tournament Death] Player won - matches played already updated in win event`);
                                        } else if (global.gameRewards[accountId].matchPlayedCounted) {
                                            console.log(`[Tournament Death] matchesPlayed already counted for this session - skipping`);
                                        } else {
                                            await addTournamentMatchPlayed(findUser);
                                            global.gameRewards[accountId].matchPlayedCounted = true;
                                            console.log(`[Tournament Death] ✓ matchesPlayed incremented for ${accountId}`);
                                        }
                                    } catch (err) {
                                        console.error("Error updating tournament stats for death:", err);
                                    }
                                } else {
                                    // ARENA MODE: Deduct hype points and track V-Bucks
                                    await deductBusFareHypePoints(findUser);
                                    console.log(`[Arena Death] Deducted bus fare hype points for user: ${accountId}`);
                                    
                                    // CRITICAL: Mark for V-Bucks/XP reward
                                    if (!global.gameFinishedReward) global.gameFinishedReward = {};
                                    global.gameFinishedReward[accountId] = true;
                                    
                                    // CRITICAL: Ensure gameRewards object exists with all required fields
                                    if (!global.gameRewards) global.gameRewards = {};
                                    if (!global.gameRewards[accountId] || typeof global.gameRewards[accountId] !== "object") {
                                        global.gameRewards[accountId] = {
                                            eliminations: 0,
                                            won: false,
                                            matchCompleted: false,
                                            matchesCompleted: 0,
                                            xpEarned: 0,
                                            isTournament: false
                                        };
                                    }
                                    
                                    // Ensure all fields are numbers and isTournament is explicitly false
                                    global.gameRewards[accountId].isTournament = false; // CRITICAL: Must be false for mcp.js to grant V-Bucks
                                    global.gameRewards[accountId].eliminations = Number(global.gameRewards[accountId].eliminations || 0);
                                    global.gameRewards[accountId].xpEarned = Number(global.gameRewards[accountId].xpEarned || 0);
                                    global.gameRewards[accountId].matchesCompleted = Number(global.gameRewards[accountId].matchesCompleted || 0);
                                    global.gameRewards[accountId].matchCompleted = true;
                                    global.gameRewards[accountId].matchesCompleted = (global.gameRewards[accountId].matchesCompleted || 0) + 1;
                                    
                                    const matchXP = event.TotalXp || event.totalXp || event.XP || event.xp || 6000;
                                    if (!global.gameRewards[accountId].won) {
                                        global.gameRewards[accountId].xpEarned = (global.gameRewards[accountId].xpEarned || 0) + matchXP;
                                    }
                                    
                                    console.log(`[Arena Death] ✓ Marked for V-Bucks/XP: eliminations=${global.gameRewards[accountId].eliminations}, xpEarned=${global.gameRewards[accountId].xpEarned}, matchCompleted=${global.gameRewards[accountId].matchCompleted}, isTournament=${global.gameRewards[accountId].isTournament}`);
                                }

                                break;
                            default:
                                // Track XP from other events (chests, challenges, etc.) - ONLY if NOT tournament
                                if (!finalIsTournament) {
                                    if (event.TotalXp || event.totalXp || event.XP || event.xp) {
                                        const eventXP = event.TotalXp || event.totalXp || event.XP || event.xp;
                                        if (!global.gameRewards[accountId]) {
                                            global.gameRewards[accountId] = { eliminations: 0, won: false, matchCompleted: false, matchesCompleted: 0, xpEarned: 0 };
                                        }
                                        global.gameRewards[accountId].xpEarned = (global.gameRewards[accountId].xpEarned || 0) + eventXP;
                                    }
                                }
                                log.debug(`Event List: ${EventName}`); // If you want to get all the events, remove the comment from here
                                break;
                        }
                    }
                }
            } else {
                // console.log(`User not found: ${accountId}`);
            }
        }

        res.status(204).end();
    } catch (error) {
        log.error("Error processing data:", error);
        console.log("Error processing data:", error);
        res.status(500).send("Internal Server Error");
    }
});

// Endpoint temporário para resetar level para 1 (para testes)
app.post("/api/reset-level/:username", async (req, res) => {
    try {
        const username = decodeURIComponent(req.params.username);
        const user = await User.findOne({ username: username }).lean();
        
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }
        
        const playerProfile = await Profile.findOne({ accountId: user.accountId });
        if (!playerProfile) {
            return res.status(404).json({ error: "Profile not found" });
        }
        
        // Reset level e XP para 1
        const athenaStats = playerProfile.profiles.athena.stats.attributes;
        const oldLevel = athenaStats.level || athenaStats.book_level || 1;
        const oldXP = athenaStats.xp || athenaStats.book_xp || 0;
        
        // Set level to 1 and XP to 0
        athenaStats.level = 1;
        athenaStats.accountLevel = 1;
        athenaStats.book_level = 1;
        athenaStats.xp = 0;
        athenaStats.book_xp = 0;
        
        playerProfile.profiles.athena.rvn += 1;
        playerProfile.profiles.athena.commandRevision += 1;
        
        await Profile.updateOne(
            { accountId: user.accountId },
            { $set: { 'profiles.athena': playerProfile.profiles.athena } }
        );
        
        console.log(`[Reset Level] ${username} (${user.accountId}): Level ${oldLevel} -> 1, XP ${oldXP} -> 0`);
        
        return res.json({
            success: true,
            message: `Level resetado para 1`,
            oldLevel: oldLevel,
            oldXP: oldXP,
            newLevel: 1,
            newXP: 0
        });
    } catch (error) {
        console.error("Error resetting level:", error);
        return res.status(500).json({ error: error.message });
    }
});

// Track failed verification attempts per player
if (!global.anticheatAttempts) {
    global.anticheatAttempts = new Map();
}

// Anticheat endpoint - Game server calls this to verify players
// Game server calls this to verify if player is legitimately connected to backend
app.get("/tzy/anticheat/:username/:apikey", sendData(async (req, res) => {
    if (!req.params.apikey || req.params.apikey != "oWIedhweofawhfgTzyTheGoat") {
        return res.send("gay");
    }
    const playerName = decodeURIComponent(req.params.username);
    const user = await User.findOne({ username: playerName });
    if (!user) {
        console.error("[ANTI-CHEAT] Player not found:", playerName);
        // Player not found in database - possible exploiter trying to bypass auth
        console.log(`[ANTI-CHEAT] Player ${playerName} not found in database - possible exploiter`);
        return "Player not found";
    }

    // Check multiple indicators of legitimate connection
    const isOnlineXMPP = global.Clients?.some(i => i.accountId === user.accountId);
    const hasAccessToken = global.accessTokens?.some(i => i.accountId === user.accountId);
    const hasRefreshToken = global.refreshTokens?.some(i => i.accountId === user.accountId);
    
    // Player is verified if they have account AND (XMPP connection OR valid tokens)
    const isVerified = isOnlineXMPP || hasAccessToken || hasRefreshToken;
    
    if (!isVerified) {
        // Track failed attempts instead of banning immediately
        const attemptsKey = user.accountId;
        const currentAttempts = global.anticheatAttempts.get(attemptsKey) || 0;
        const newAttempts = currentAttempts + 1;
        global.anticheatAttempts.set(attemptsKey, newAttempts);
        
        console.warn(`[ANTI-CHEAT] Player ${playerName} (${user.accountId}) not verified - Attempt ${newAttempts}/3`);
        console.warn(`[ANTI-CHEAT] XMPP: ${isOnlineXMPP}, AccessToken: ${hasAccessToken}, RefreshToken: ${hasRefreshToken}`);
        
        // Only ban after 3 consecutive failed attempts (to avoid false positives)
        if (newAttempts >= 3) {
            console.error(`[ANTI-CHEAT] Banning exploiter: ${playerName} (${user.accountId}) - Failed verification ${newAttempts} times`);
            try {
                await anticheatSystem.banPlayer(
                    user.accountId,
                    playerName,
                    "permanent",
                    "Anticheat: Failed online verification multiple times - Possible exploiter",
                    null
                );
                log.anticheat(`[ANTI-CHEAT] Banned exploiter ${playerName} (${user.accountId}) - ${newAttempts} failed attempts`);
                // Reset attempts after ban
                global.anticheatAttempts.delete(attemptsKey);
            } catch (err) {
                console.error(`[ANTI-CHEAT] Error banning exploiter:`, err);
            }
            return "Player is not online";
        }
        
        // Reset attempts after 5 minutes (give player time to connect)
        setTimeout(() => {
            if (global.anticheatAttempts.get(attemptsKey) === newAttempts) {
                global.anticheatAttempts.delete(attemptsKey);
                console.log(`[ANTI-CHEAT] Reset verification attempts for ${playerName} after timeout`);
            }
        }, 5 * 60 * 1000); // 5 minutes
        
        return "Player is not online";
    }
    
    // Player is verified - reset any failed attempts
    if (global.anticheatAttempts.has(user.accountId)) {
        global.anticheatAttempts.delete(user.accountId);
    }
    
    console.log(`[ANTI-CHEAT] Player verified: ${playerName} (XMPP: ${isOnlineXMPP}, Token: ${hasAccessToken || hasRefreshToken})`);
    return "Player verified";
}));

// Helper function to wrap async route handlers
function sendData(block) {
    return async function (req, res) {
        try {
            const result = await block(req, res);
            if (res.headersSent) return;
            res.send(result);
        } catch (error) {
            console.error("Error in sendData:", error.message);
            if (!res.headersSent) {
                res.status(500).send("An error occurred");
            }
        }
    };
}

module.exports = app;