const AnticheatLog = require("../model/anticheat.js");
const Bans = require("../model/bans.js");
const User = require("../model/user.js");
const log = require("./log.js");

class AnticheatSystem {
    constructor() {
        // Thresholds for automatic actions
        this.thresholds = {
            warning: 3,      // 3 violations = warning
            tempBan: 5,      // 5 violations = temp ban
            permBan: 10      // 10 violations = permanent ban
        };

        // Track player stats in memory for real-time detection
        this.playerStats = new Map();
        
        // Movement tracking
        this.movementTracking = new Map();
        
        // Kill tracking for suspicious activity
        this.killTracking = new Map();
    }

    /**
     * Log a violation and take appropriate action
     */
    async logViolation(accountId, username, violationType, severity, details = {}, gameSession = null) {
        try {
            // Create violation log
            const violation = await AnticheatLog.create({
                accountId,
                username,
                violationType,
                severity,
                detectedAt: new Date(),
                gameSession,
                details,
                actionTaken: "none",
                resolved: false
            });

            log.anticheat(`[ANTICHEAT] ${username} (${accountId}) - ${violationType} detected (Severity: ${severity})`);

            // Check violation history
            const violationCount = await AnticheatLog.countDocuments({
                accountId,
                resolved: false,
                detectedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Last 7 days
            });

            // Determine action based on violation count and severity
            let action = "none";
            
            if (severity >= 9 || violationCount >= this.thresholds.permBan) {
                action = "permanent_ban";
                await this.banPlayer(accountId, username, "permanent", "Anticheat: Multiple violations detected", null);
            } else if (severity >= 7 || violationCount >= this.thresholds.tempBan) {
                action = "temp_ban";
                const banDuration = 24 * 60 * 60 * 1000; // 24 hours
                await this.banPlayer(accountId, username, "matchmaking", "Anticheat: Suspicious activity", new Date(Date.now() + banDuration));
            } else if (violationCount >= this.thresholds.warning) {
                action = "warning";
                log.anticheat(`[ANTICHEAT] Warning issued to ${username}`);
            }

            // Update violation with action taken
            await violation.updateOne({ $set: { actionTaken: action } });

            // Kick player from current session if severe
            if (severity >= 7) {
                this.kickPlayer(accountId);
            }

            return { violation, action, violationCount };
        } catch (err) {
            log.error(`[ANTICHEAT] Error logging violation: ${err.message}`);
            return null;
        }
    }

    /**
     * Ban a player
     */
    async banPlayer(accountId, username, banType, reason, expiresAt) {
        try {
            // Check if already banned
            const existingBan = await Bans.findOne({
                accountId,
                isActive: true,
                $or: [
                    { expiresAt: null },
                    { expiresAt: { $gt: new Date() } }
                ]
            });

            if (existingBan) {
                log.anticheat(`[ANTICHEAT] ${username} is already banned`);
                return existingBan;
            }

            // Create ban
            const ban = await Bans.create({
                accountId,
                username,
                banType,
                reason,
                bannedBy: "Anticheat System",
                bannedAt: new Date(),
                expiresAt,
                isActive: true,
                metadata: {
                    automatic: true,
                    source: "anticheat"
                }
            });

            // Update user banned status if permanent
            if (banType === "permanent") {
                await User.updateOne({ accountId }, { $set: { banned: true } });
            }

            // Kick player
            this.kickPlayer(accountId);

            log.anticheat(`[ANTICHEAT] ${username} banned (${banType}) - ${reason}`);
            return ban;
        } catch (err) {
            log.error(`[ANTICHEAT] Error banning player: ${err.message}`);
            return null;
        }
    }

    /**
     * Check if player is banned
     */
    async isPlayerBanned(accountId, banType = null) {
        try {
            const query = {
                accountId,
                isActive: true,
                $or: [
                    { expiresAt: null },
                    { expiresAt: { $gt: new Date() } }
                ]
            };

            if (banType) {
                query.banType = banType;
            }

            const ban = await Bans.findOne(query);
            return ban;
        } catch (err) {
            log.error(`[ANTICHEAT] Error checking ban: ${err.message}`);
            return null;
        }
    }

    /**
     * Kick player from game
     */
    kickPlayer(accountId) {
        try {
            // Remove from XMPP
            if (global.Clients && Array.isArray(global.Clients)) {
                const xmppClient = global.Clients.find(client => client.accountId === accountId);
                if (xmppClient && xmppClient.client) {
                    xmppClient.client.close();
                    log.anticheat(`[ANTICHEAT] Kicked player ${accountId} from XMPP`);
                }
            }

            // Remove tokens
            if (global.accessTokens) {
                const tokenIndex = global.accessTokens.findIndex(t => t.accountId === accountId);
                if (tokenIndex !== -1) {
                    global.accessTokens.splice(tokenIndex, 1);
                }
            }

            if (global.refreshTokens) {
                const refreshIndex = global.refreshTokens.findIndex(t => t.accountId === accountId);
                if (refreshIndex !== -1) {
                    global.refreshTokens.splice(refreshIndex, 1);
                }
            }

            return true;
        } catch (err) {
            log.error(`[ANTICHEAT] Error kicking player: ${err.message}`);
            return false;
        }
    }

    /**
     * Track player movement for anomaly detection
     */
    trackMovement(accountId, position, velocity, timestamp) {
        if (!this.movementTracking.has(accountId)) {
            this.movementTracking.set(accountId, []);
        }

        const history = this.movementTracking.get(accountId);
        history.push({ position, velocity, timestamp });

        // Keep only last 100 positions
        if (history.length > 100) {
            history.shift();
        }

        // Check for suspicious movement
        if (history.length >= 3) {
            const recent = history.slice(-3);
            const avgSpeed = this.calculateAverageSpeed(recent);
            
            // Speed hack detection (adjust threshold as needed)
            const MAX_SPEED = 2000; // units per second
            if (avgSpeed > MAX_SPEED) {
                return { suspicious: true, type: "speed_hack", value: avgSpeed };
            }

            // Teleport detection
            if (this.detectTeleport(recent)) {
                return { suspicious: true, type: "teleport" };
            }

            // Fly hack detection (if position.z increases rapidly)
            if (this.detectFlyHack(recent)) {
                return { suspicious: true, type: "fly_hack" };
            }
        }

        return { suspicious: false };
    }

    calculateAverageSpeed(positions) {
        if (positions.length < 2) return 0;
        
        let totalSpeed = 0;
        for (let i = 1; i < positions.length; i++) {
            const prev = positions[i - 1];
            const curr = positions[i];
            const timeDiff = (curr.timestamp - prev.timestamp) / 1000; // seconds
            
            if (timeDiff > 0 && prev.position && curr.position) {
                const distance = Math.sqrt(
                    Math.pow(curr.position.x - prev.position.x, 2) +
                    Math.pow(curr.position.y - prev.position.y, 2) +
                    Math.pow(curr.position.z - prev.position.z, 2)
                );
                totalSpeed += distance / timeDiff;
            }
        }
        
        return totalSpeed / (positions.length - 1);
    }

    detectTeleport(positions) {
        if (positions.length < 2) return false;
        
        const last = positions[positions.length - 1];
        const prev = positions[positions.length - 2];
        
        if (!last.position || !prev.position) return false;
        
        const distance = Math.sqrt(
            Math.pow(last.position.x - prev.position.x, 2) +
            Math.pow(last.position.y - prev.position.y, 2) +
            Math.pow(last.position.z - prev.position.z, 2)
        );
        
        const timeDiff = (last.timestamp - prev.timestamp) / 1000;
        
        // Teleport if moved more than 5000 units in less than 0.1 seconds
        return distance > 5000 && timeDiff < 0.1;
    }

    detectFlyHack(positions) {
        if (positions.length < 3) return false;
        
        let verticalVelocity = 0;
        for (let i = 1; i < positions.length; i++) {
            const prev = positions[i - 1];
            const curr = positions[i];
            
            if (prev.position && curr.position) {
                const timeDiff = (curr.timestamp - prev.timestamp) / 1000;
                if (timeDiff > 0) {
                    verticalVelocity += (curr.position.z - prev.position.z) / timeDiff;
                }
            }
        }
        
        const avgVerticalVelocity = verticalVelocity / (positions.length - 1);
        
        // Sustained upward movement faster than max jump velocity
        return avgVerticalVelocity > 1000;
    }

    /**
     * Track kills for aimbot/ESP detection
     */
    trackKill(killerAccountId, victimAccountId, distance, headshot, timestamp) {
        if (!this.killTracking.has(killerAccountId)) {
            this.killTracking.set(killerAccountId, {
                kills: [],
                headshotCount: 0,
                totalKills: 0,
                suspiciousKills: 0
            });
        }

        const stats = this.killTracking.get(killerAccountId);
        stats.kills.push({ victimAccountId, distance, headshot, timestamp });
        stats.totalKills++;
        
        if (headshot) {
            stats.headshotCount++;
        }

        // Keep only last 50 kills
        if (stats.kills.length > 50) {
            stats.kills.shift();
        }

        // Aimbot detection: High headshot percentage
        const headshotPercentage = (stats.headshotCount / stats.totalKills) * 100;
        if (stats.totalKills >= 10 && headshotPercentage > 80) {
            stats.suspiciousKills++;
            return { suspicious: true, type: "aimbot", headshotPercentage };
        }

        // ESP/Wallhack: Kills at extreme distances consistently
        if (distance > 300 && stats.kills.filter(k => k.distance > 300).length > 5) {
            stats.suspiciousKills++;
            return { suspicious: true, type: "esp_wallhack", avgDistance: distance };
        }

        // Rapid fire detection: Multiple kills in very short time
        if (stats.kills.length >= 3) {
            const recentKills = stats.kills.slice(-3);
            const timeSpan = recentKills[2].timestamp - recentKills[0].timestamp;
            if (timeSpan < 2000) { // 3 kills in 2 seconds
                return { suspicious: true, type: "rapid_fire", timeSpan };
            }
        }

        return { suspicious: false };
    }

    /**
     * Clean up expired bans
     */
    async cleanupExpiredBans() {
        try {
            const result = await Bans.updateMany(
                {
                    isActive: true,
                    expiresAt: { $ne: null, $lte: new Date() }
                },
                {
                    $set: { isActive: false }
                }
            );

            if (result.modifiedCount > 0) {
                log.anticheat(`[ANTICHEAT] Cleaned up ${result.modifiedCount} expired bans`);
            }
        } catch (err) {
            log.error(`[ANTICHEAT] Error cleaning up bans: ${err.message}`);
        }
    }

    /**
     * Get player violation history
     */
    async getViolationHistory(accountId, days = 30) {
        try {
            const violations = await AnticheatLog.find({
                accountId,
                detectedAt: { $gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) }
            }).sort({ detectedAt: -1 });

            return violations;
        } catch (err) {
            log.error(`[ANTICHEAT] Error fetching violation history: ${err.message}`);
            return [];
        }
    }

    /**
     * Clear player tracking data
     */
    clearPlayerTracking(accountId) {
        this.movementTracking.delete(accountId);
        this.killTracking.delete(accountId);
        this.playerStats.delete(accountId);
    }
}

// Create singleton instance
const anticheatSystem = new AnticheatSystem();

// Run cleanup every hour
setInterval(() => {
    anticheatSystem.cleanupExpiredBans();
}, 60 * 60 * 1000);

module.exports = anticheatSystem;

