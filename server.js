// ============================================
// ASPEN'S PLAYGROUND - Multiplayer Server
// ============================================

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const LEADERBOARD_FILE = path.join(__dirname, 'leaderboard.json');
const MAX_LEADERBOARD_SIZE = 10;

// Serve static files and parse JSON
app.use(express.static(path.join(__dirname)));
app.use(express.json());

// ==================== LEADERBOARD ====================
let leaderboard = [];

function loadLeaderboard() {
    try {
        if (fs.existsSync(LEADERBOARD_FILE)) {
            const data = fs.readFileSync(LEADERBOARD_FILE, 'utf8');
            leaderboard = JSON.parse(data);
            log(`Loaded ${leaderboard.length} leaderboard entries`, 'SUCCESS');
        } else {
            leaderboard = [];
            saveLeaderboard();
            log('Created new leaderboard file', 'INFO');
        }
    } catch (e) {
        log(`Error loading leaderboard: ${e.message}`, 'ERROR');
        leaderboard = [];
    }
}

function saveLeaderboard() {
    try {
        fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(leaderboard, null, 2));
    } catch (e) {
        log(`Error saving leaderboard: ${e.message}`, 'ERROR');
    }
}

function addToLeaderboard(name, score, wave, kills) {
    // Sanitize name
    name = String(name).substring(0, 20).replace(/[<>]/g, '').trim() || 'Anonymous';
    score = parseInt(score) || 0;
    wave = parseInt(wave) || 1;
    kills = parseInt(kills) || 0;

    // Check if score qualifies for leaderboard
    const minScore = leaderboard.length >= MAX_LEADERBOARD_SIZE
        ? leaderboard[leaderboard.length - 1].score
        : -1;

    // Score must be higher than the lowest (or leaderboard not full yet)
    if (leaderboard.length >= MAX_LEADERBOARD_SIZE && score <= minScore) {
        log(`Leaderboard: ${name} score ${score} didn't qualify (min: ${minScore})`, 'INFO');
        return { added: false, rank: -1 };
    }

    // Add new entry with unique ID for tracking
    const entryId = Date.now() + Math.random();
    const entry = {
        _id: entryId,
        name,
        score,
        wave,
        kills,
        date: new Date().toISOString()
    };

    leaderboard.push(entry);
    leaderboard.sort((a, b) => b.score - a.score);

    // Keep only top entries
    if (leaderboard.length > MAX_LEADERBOARD_SIZE) {
        leaderboard = leaderboard.slice(0, MAX_LEADERBOARD_SIZE);
    }

    // Find rank of new entry (check if it's still in the list)
    const rank = leaderboard.findIndex(e => e._id === entryId) + 1;

    if (rank > 0) {
        // Clean up the _id before saving (not needed in stored data)
        leaderboard.forEach(e => delete e._id);
        saveLeaderboard();
        log(`Leaderboard: ${name} added with score ${score} (rank #${rank})`, 'SUCCESS');
        return { added: true, rank };
    }

    log(`Leaderboard: ${name} score ${score} was pushed out`, 'INFO');
    return { added: false, rank: -1 };
}

// Leaderboard API endpoints
app.get('/api/leaderboard', (req, res) => {
    res.json(leaderboard);
});

app.post('/api/leaderboard', (req, res) => {
    const { name, score, wave, kills } = req.body;

    if (typeof score !== 'number' || score < 0) {
        return res.status(400).json({ error: 'Invalid score' });
    }

    const result = addToLeaderboard(name, score, wave, kills);
    res.json({
        ...result,
        leaderboard
    });
});

// Load leaderboard on startup
loadLeaderboard();

// ==================== LOGGING ====================
function log(message, type = 'INFO') {
    const timestamp = new Date().toISOString();
    const colors = {
        'INFO': '\x1b[36m',
        'WARN': '\x1b[33m',
        'ERROR': '\x1b[31m',
        'SUCCESS': '\x1b[32m',
        'GAME': '\x1b[35m',
        'PLAYER': '\x1b[34m'
    };
    const reset = '\x1b[0m';
    console.log(`${colors[type] || ''}[${timestamp}] [${type}] ${message}${reset}`);
}

// ==================== GAME STATE ====================
const GameState = {
    players: new Map(),
    zombies: new Map(),
    pickups: new Map(),
    wave: 1,
    zombiesRemaining: 0,
    zombiesSpawned: 0,
    isRunning: false,
    isInLobby: true, // Start in lobby mode
    isPaused: false,
    lastZombieId: 0,
    lastPickupId: 0,
    spawnInterval: null,
    totalKills: 0,
    totalScore: 0
};

const CONFIG = {
    waves: {
        startZombies: 5,
        zombiesPerWave: 3,
        timeBetweenWaves: 5000,
        maxZombiesAlive: 15,
        spawnInterval: 2000
    },
    zombie: {
        health: 100,
        speed: 3,
        damage: 15,
        attackRange: 2,
        attackCooldown: 1000
    },
    arena: {
        width: 50,
        depth: 50
    },
    scoring: {
        zombieKill: 100,
        headshot: 50,
        waveBonus: 500
    },
    tickRate: 20 // Server updates per second
};

// ==================== PLAYER MANAGEMENT ====================
function createPlayer(ws, id) {
    const colors = [0xff4444, 0x44ff44, 0x4444ff, 0xffff44, 0xff44ff, 0x44ffff, 0xff8844, 0x88ff44];
    const playerNum = GameState.players.size;

    const player = {
        id: id,
        name: `Player ${playerNum + 1}`,
        ws: ws,
        position: { x: (Math.random() - 0.5) * 10, y: 1.8, z: 10 + Math.random() * 5 },
        rotation: { x: 0, y: 0 },
        health: 100,
        isAlive: true,
        isReady: false,
        color: colors[playerNum % colors.length],
        cosmetic: 'default',
        lastUpdate: Date.now(),
        kills: 0,
        score: 0
    };

    GameState.players.set(id, player);
    log(`Player ${player.name} (${id}) joined lobby. Total players: ${GameState.players.size}`, 'PLAYER');

    return player;
}

function removePlayer(id) {
    const player = GameState.players.get(id);
    if (player) {
        log(`Player ${player.name} (${id}) left. Total players: ${GameState.players.size - 1}`, 'PLAYER');
        GameState.players.delete(id);

        // Broadcast player left
        broadcast({
            type: 'playerLeft',
            playerId: id
        });

        // If in lobby, update lobby state
        if (GameState.isInLobby) {
            broadcastLobbyUpdate();
        }

        // Check if game should stop
        if (GameState.players.size === 0) {
            stopGame();
            // Reset to lobby state
            GameState.isInLobby = true;
        }
    }
}

// ==================== ZOMBIE MANAGEMENT ====================
function spawnZombie() {
    if (!GameState.isRunning) return;

    const aliveZombies = Array.from(GameState.zombies.values()).filter(z => z.isAlive);
    if (aliveZombies.length >= CONFIG.waves.maxZombiesAlive) {
        log('Max zombies alive, waiting...', 'WARN');
        return;
    }

    const id = `zombie_${++GameState.lastZombieId}`;
    const side = Math.floor(Math.random() * 4);
    const arenaEdge = CONFIG.arena.width / 2 - 2;
    let position = { x: 0, y: 0, z: 0 };

    switch (side) {
        case 0: position = { x: (Math.random() - 0.5) * CONFIG.arena.width * 0.8, y: 0, z: -arenaEdge }; break;
        case 1: position = { x: (Math.random() - 0.5) * CONFIG.arena.width * 0.8, y: 0, z: arenaEdge }; break;
        case 2: position = { x: -arenaEdge, y: 0, z: (Math.random() - 0.5) * CONFIG.arena.depth * 0.8 }; break;
        case 3: position = { x: arenaEdge, y: 0, z: (Math.random() - 0.5) * CONFIG.arena.depth * 0.8 }; break;
    }

    // Determine zombie type based on wave
    let zombieType = 'normal';
    const typeRoll = Math.random();
    if (GameState.wave >= 3 && typeRoll < 0.2) zombieType = 'runner';
    else if (GameState.wave >= 5 && typeRoll < 0.35) zombieType = 'tank';
    else if (GameState.wave >= 7 && typeRoll < 0.15) zombieType = 'boss';

    const typeProps = {
        normal: { health: 100, speed: 3, damage: 15, scale: 1 },
        runner: { health: 50, speed: 5.4, damage: 10, scale: 0.8 },
        tank: { health: 250, speed: 1.8, damage: 22, scale: 1.3 },
        boss: { health: 500, speed: 1.2, damage: 37, scale: 1.8 }
    };

    const props = typeProps[zombieType];

    const zombie = {
        id: id,
        type: zombieType,
        position: position,
        rotation: 0,
        health: props.health,
        maxHealth: props.health,
        speed: props.speed * (0.9 + Math.random() * 0.2),
        damage: props.damage,
        scale: props.scale,
        isAlive: true,
        targetPlayerId: null,
        lastAttack: 0
    };

    GameState.zombies.set(id, zombie);
    GameState.zombiesSpawned++;

    log(`Spawned ${zombieType} zombie ${id} at (${position.x.toFixed(1)}, ${position.z.toFixed(1)})`, 'GAME');

    broadcast({
        type: 'zombieSpawned',
        zombie: zombie
    });
}

function updateZombies() {
    if (!GameState.isRunning || GameState.players.size === 0) return;

    const now = Date.now();
    const delta = 1 / CONFIG.tickRate;
    const players = Array.from(GameState.players.values()).filter(p => p.isAlive);

    if (players.length === 0) return;

    GameState.zombies.forEach((zombie, id) => {
        if (!zombie.isAlive) return;

        // Find closest player
        let closestPlayer = null;
        let closestDist = Infinity;

        players.forEach(player => {
            const dx = player.position.x - zombie.position.x;
            const dz = player.position.z - zombie.position.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist < closestDist) {
                closestDist = dist;
                closestPlayer = player;
            }
        });

        if (!closestPlayer) return;

        zombie.targetPlayerId = closestPlayer.id;

        // Calculate direction to player
        const dx = closestPlayer.position.x - zombie.position.x;
        const dz = closestPlayer.position.z - zombie.position.z;
        const distance = Math.sqrt(dx * dx + dz * dz);

        // Face player
        zombie.rotation = Math.atan2(dx, dz);

        // Move towards player or attack
        if (distance > CONFIG.zombie.attackRange) {
            zombie.isAttacking = false;
            const moveX = (dx / distance) * zombie.speed * delta;
            const moveZ = (dz / distance) * zombie.speed * delta;
            zombie.position.x += moveX;
            zombie.position.z += moveZ;
        } else {
            // Attack player
            if (now - zombie.lastAttack > CONFIG.zombie.attackCooldown) {
                zombie.lastAttack = now;
                zombie.isAttacking = true;
                damagePlayer(closestPlayer.id, zombie.damage);

                // Broadcast zombie attack animation
                broadcast({
                    type: 'zombieAttack',
                    zombieId: zombie.id,
                    targetId: closestPlayer.id
                });
            }
        }
    });
}

function damageZombie(zombieId, damage, attackerId, isHeadshot) {
    const zombie = GameState.zombies.get(zombieId);
    if (!zombie || !zombie.isAlive) return false;

    zombie.health -= damage;
    log(`Zombie ${zombieId} took ${damage} damage (${zombie.health}/${zombie.maxHealth} HP)`, 'GAME');

    if (zombie.health <= 0) {
        killZombie(zombieId, attackerId, isHeadshot);
        return true;
    }

    broadcast({
        type: 'zombieDamaged',
        zombieId: zombieId,
        health: zombie.health,
        maxHealth: zombie.maxHealth
    });

    return false;
}

function killZombie(zombieId, killerId, isHeadshot) {
    const zombie = GameState.zombies.get(zombieId);
    if (!zombie) return;

    zombie.isAlive = false;
    GameState.zombiesRemaining--;
    GameState.totalKills++;

    const points = CONFIG.scoring.zombieKill + (isHeadshot ? CONFIG.scoring.headshot : 0);
    GameState.totalScore += points;

    // Award points to killer
    const killer = GameState.players.get(killerId);
    if (killer) {
        killer.kills++;
        killer.score += points;
    }

    log(`Zombie ${zombieId} killed by ${killerId}! Remaining: ${GameState.zombiesRemaining}`, 'SUCCESS');

    // Chance to spawn pickup
    const dropChance = Math.random();
    if (dropChance < 0.25) {
        spawnPickup(zombie.position, dropChance < 0.12 ? 'health' : 'ammo');
    }

    broadcast({
        type: 'zombieKilled',
        zombieId: zombieId,
        killerId: killerId,
        isHeadshot: isHeadshot,
        position: zombie.position
    });

    // Check wave completion
    if (GameState.zombiesRemaining <= 0) {
        const expectedZombies = CONFIG.waves.startZombies + (GameState.wave - 1) * CONFIG.waves.zombiesPerWave;
        if (GameState.zombiesSpawned >= expectedZombies) {
            nextWave();
        }
    }

    // Clean up zombie after delay
    setTimeout(() => {
        GameState.zombies.delete(zombieId);
    }, 5000);
}

// ==================== PICKUP MANAGEMENT ====================
function spawnPickup(position, type) {
    const id = `pickup_${++GameState.lastPickupId}`;

    const pickup = {
        id: id,
        type: type,
        position: { x: position.x, y: 0.5, z: position.z }
    };

    GameState.pickups.set(id, pickup);
    log(`Spawned ${type} pickup ${id}`, 'GAME');

    broadcast({
        type: 'pickupSpawned',
        pickup: pickup
    });

    // Remove after 15 seconds
    setTimeout(() => {
        if (GameState.pickups.has(id)) {
            GameState.pickups.delete(id);
            broadcast({
                type: 'pickupRemoved',
                pickupId: id
            });
        }
    }, 15000);
}

function collectPickup(pickupId, playerId) {
    const pickup = GameState.pickups.get(pickupId);
    const player = GameState.players.get(playerId);

    if (!pickup || !player) return;

    let collected = false;

    if (pickup.type === 'health' && player.health < 100) {
        player.health = Math.min(player.health + 25, 100);
        collected = true;
        log(`Player ${playerId} collected health pickup (+25 HP)`, 'GAME');
    } else if (pickup.type === 'ammo') {
        collected = true;
        log(`Player ${playerId} collected ammo pickup`, 'GAME');
    }

    if (collected) {
        GameState.pickups.delete(pickupId);
        broadcast({
            type: 'pickupCollected',
            pickupId: pickupId,
            playerId: playerId,
            pickupType: pickup.type
        });
    }
}

// ==================== PLAYER DAMAGE ====================
function damagePlayer(playerId, damage) {
    const player = GameState.players.get(playerId);
    if (!player || !player.isAlive) return;

    player.health -= damage;
    log(`Player ${playerId} took ${damage} damage (${player.health} HP)`, 'WARN');

    if (player.health <= 0) {
        player.health = 0;
        player.isAlive = false;
        log(`Player ${playerId} died!`, 'ERROR');

        broadcast({
            type: 'playerDied',
            playerId: playerId
        });

        // Check if all players dead
        const alivePlayers = Array.from(GameState.players.values()).filter(p => p.isAlive);
        if (alivePlayers.length === 0) {
            gameOver();
        }
    } else {
        // Send damage update to specific player
        const ws = player.ws;
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'playerDamaged',
                health: player.health,
                damage: damage
            }));
        }
    }
}

// ==================== WAVE MANAGEMENT ====================
function startWave() {
    const zombieCount = CONFIG.waves.startZombies + (GameState.wave - 1) * CONFIG.waves.zombiesPerWave;
    GameState.zombiesRemaining = zombieCount;
    GameState.zombiesSpawned = 0;

    log(`Starting Wave ${GameState.wave} with ${zombieCount} zombies`, 'GAME');

    broadcast({
        type: 'waveStart',
        wave: GameState.wave,
        zombieCount: zombieCount
    });

    // Spawn zombies gradually
    let spawned = 0;
    GameState.spawnInterval = setInterval(() => {
        if (!GameState.isRunning) {
            clearInterval(GameState.spawnInterval);
            return;
        }

        if (spawned < zombieCount) {
            spawnZombie();
            spawned++;
        } else {
            clearInterval(GameState.spawnInterval);
            GameState.spawnInterval = null;
        }
    }, CONFIG.waves.spawnInterval);
}

function nextWave() {
    GameState.wave++;
    GameState.totalScore += CONFIG.scoring.waveBonus;

    log(`Wave ${GameState.wave - 1} complete! Starting Wave ${GameState.wave}...`, 'SUCCESS');

    broadcast({
        type: 'waveComplete',
        wave: GameState.wave - 1,
        nextWave: GameState.wave,
        bonus: CONFIG.scoring.waveBonus
    });

    setTimeout(() => {
        if (GameState.isRunning) {
            startWave();
        }
    }, CONFIG.waves.timeBetweenWaves);
}

// ==================== GAME CONTROL ====================
function startGame() {
    if (GameState.isRunning) return;

    log('Starting game...', 'GAME');

    GameState.isRunning = true;
    GameState.isPaused = false;
    GameState.wave = 1;
    GameState.zombiesRemaining = 0;
    GameState.zombiesSpawned = 0;
    GameState.totalKills = 0;
    GameState.totalScore = 0;
    GameState.lastZombieId = 0;
    GameState.lastPickupId = 0;

    // Clear existing zombies and pickups
    GameState.zombies.clear();
    GameState.pickups.clear();

    // Reset all players
    GameState.players.forEach(player => {
        player.health = 100;
        player.isAlive = true;
        player.kills = 0;
        player.score = 0;
        player.position = { x: (Math.random() - 0.5) * 10, y: 1.8, z: 10 + Math.random() * 5 };
    });

    broadcast({
        type: 'gameStart',
        players: getPlayersData()
    });

    startWave();

    log('Game started!', 'SUCCESS');
}

function stopGame() {
    log('Stopping game...', 'GAME');

    GameState.isRunning = false;

    if (GameState.spawnInterval) {
        clearInterval(GameState.spawnInterval);
        GameState.spawnInterval = null;
    }

    GameState.zombies.clear();
    GameState.pickups.clear();
}

function gameOver() {
    log('Game Over!', 'ERROR');

    stopGame();

    broadcast({
        type: 'gameOver',
        wave: GameState.wave,
        totalKills: GameState.totalKills,
        totalScore: GameState.totalScore,
        players: getPlayersData()
    });
}

function resetGame() {
    stopGame();

    // Reset player states
    GameState.players.forEach(player => {
        player.health = 100;
        player.isAlive = true;
        player.kills = 0;
        player.score = 0;
    });

    GameState.wave = 1;
    GameState.totalKills = 0;
    GameState.totalScore = 0;

    broadcast({
        type: 'gameReset'
    });

    log('Game reset', 'GAME');
}

// ==================== UTILITY FUNCTIONS ====================
function getPlayersData() {
    const data = [];
    GameState.players.forEach((player, id) => {
        data.push({
            id: player.id,
            name: player.name,
            position: player.position,
            rotation: player.rotation,
            health: player.health,
            isAlive: player.isAlive,
            color: player.color,
            cosmetic: player.cosmetic,
            kills: player.kills,
            score: player.score
        });
    });
    return data;
}

function getZombiesData() {
    const data = [];
    GameState.zombies.forEach((zombie, id) => {
        if (zombie.isAlive) {
            data.push({
                id: zombie.id,
                type: zombie.type,
                position: zombie.position,
                rotation: zombie.rotation,
                health: zombie.health,
                maxHealth: zombie.maxHealth,
                scale: zombie.scale
            });
        }
    });
    return data;
}

function getPickupsData() {
    const data = [];
    GameState.pickups.forEach((pickup, id) => {
        data.push({
            id: pickup.id,
            type: pickup.type,
            position: pickup.position
        });
    });
    return data;
}

function broadcast(message, excludeId = null) {
    const data = JSON.stringify(message);
    GameState.players.forEach((player, id) => {
        if (id !== excludeId && player.ws && player.ws.readyState === WebSocket.OPEN) {
            player.ws.send(data);
        }
    });
}

function broadcastLobbyUpdate() {
    const lobbyPlayers = [];
    GameState.players.forEach((player, id) => {
        lobbyPlayers.push({
            id: player.id,
            name: player.name,
            isReady: player.isReady,
            color: player.color,
            cosmetic: player.cosmetic
        });
    });

    broadcast({
        type: 'lobbyUpdate',
        players: lobbyPlayers,
        allReady: checkAllReady()
    });
}

function checkAllReady() {
    if (GameState.players.size === 0) return false;

    let allReady = true;
    GameState.players.forEach(player => {
        if (!player.isReady) allReady = false;
    });

    return allReady;
}

function setPlayerReady(playerId, isReady) {
    const player = GameState.players.get(playerId);
    if (player) {
        player.isReady = isReady;
        log(`Player ${player.name} is ${isReady ? 'READY' : 'not ready'}`, 'PLAYER');
        broadcastLobbyUpdate();

        // Check if all players are ready to start
        if (checkAllReady() && GameState.players.size >= 1) {
            log('All players ready! Starting game in 3 seconds...', 'GAME');
            broadcast({ type: 'lobbyCountdown', seconds: 3 });

            setTimeout(() => {
                if (checkAllReady() && GameState.isInLobby) {
                    startMultiplayerGame();
                }
            }, 3000);
        }
    }
}

function startMultiplayerGame() {
    GameState.isInLobby = false;
    GameState.isRunning = true;

    // Reset all players
    GameState.players.forEach(player => {
        player.health = 100;
        player.isAlive = true;
        player.position = { x: (Math.random() - 0.5) * 10, y: 1.8, z: 10 + Math.random() * 5 };
    });

    broadcast({
        type: 'gameStart',
        players: getPlayersData()
    });

    log('Multiplayer game started!', 'SUCCESS');
    startWave();
}

// ==================== WEBSOCKET HANDLING ====================
wss.on('connection', (ws) => {
    const playerId = uuidv4();
    const player = createPlayer(ws, playerId);

    log(`New WebSocket connection from player ${playerId}`, 'INFO');

    // Send initial lobby/game state to new player
    const initMessage = {
        type: 'init',
        playerId: playerId,
        player: {
            id: player.id,
            name: player.name,
            position: player.position,
            rotation: player.rotation,
            health: player.health,
            isAlive: player.isAlive,
            isReady: player.isReady,
            color: player.color,
            cosmetic: player.cosmetic
        },
        gameState: {
            isRunning: GameState.isRunning,
            isInLobby: GameState.isInLobby,
            wave: GameState.wave,
            zombiesRemaining: GameState.zombiesRemaining,
            totalKills: GameState.totalKills,
            totalScore: GameState.totalScore
        },
        players: getPlayersData().filter(p => p.id !== playerId),
        zombies: getZombiesData(),
        pickups: getPickupsData()
    };

    log(`Sending init to ${playerId}: inLobby=${GameState.isInLobby}, gameRunning=${GameState.isRunning}`, 'INFO');
    ws.send(JSON.stringify(initMessage));

    // Broadcast new player to others (lobby update)
    broadcastLobbyUpdate();

    // Also send playerJoined for game compatibility
    broadcast({
        type: 'playerJoined',
        player: {
            id: player.id,
            name: player.name,
            position: player.position,
            rotation: player.rotation,
            health: player.health,
            isAlive: player.isAlive,
            isReady: player.isReady,
            color: player.color,
            cosmetic: player.cosmetic
        }
    }, playerId);

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            handleMessage(playerId, message);
        } catch (e) {
            log(`Error parsing message from ${playerId}: ${e.message}`, 'ERROR');
        }
    });

    ws.on('close', () => {
        log(`WebSocket closed for ${playerId}`, 'WARN');
        removePlayer(playerId);
    });

    ws.on('error', (error) => {
        log(`WebSocket error for ${playerId}: ${error.message}`, 'ERROR');
    });
});

// ==================== INPUT VALIDATION ====================
function isValidNumber(val, min = -Infinity, max = Infinity) {
    return typeof val === 'number' && !isNaN(val) && val >= min && val <= max;
}

function isValidPosition(pos) {
    if (!pos || typeof pos !== 'object') return false;
    const boundary = CONFIG.arena.width / 2 + 5; // Allow slight margin
    return isValidNumber(pos.x, -boundary, boundary) &&
           isValidNumber(pos.y, -10, 50) &&
           isValidNumber(pos.z, -boundary, boundary);
}

function isValidRotation(rot) {
    if (!rot || typeof rot !== 'object') return false;
    return isValidNumber(rot.x, -Math.PI, Math.PI) &&
           isValidNumber(rot.y, -Math.PI * 2, Math.PI * 2);
}

function sanitizeString(str, maxLength = 50) {
    if (typeof str !== 'string') return '';
    return str.substring(0, maxLength).replace(/[<>]/g, '');
}

function handleMessage(playerId, message) {
    const player = GameState.players.get(playerId);
    if (!player) return;

    // Validate message structure
    if (!message || typeof message.type !== 'string') {
        log(`Invalid message from ${playerId}: missing type`, 'WARN');
        return;
    }

    switch (message.type) {
        case 'ready':
            if (typeof message.isReady === 'boolean') {
                setPlayerReady(playerId, message.isReady);
            }
            break;

        case 'update':
            // Validate and update player position and rotation
            if (message.position && isValidPosition(message.position)) {
                player.position = {
                    x: message.position.x,
                    y: message.position.y,
                    z: message.position.z
                };
            }
            if (message.rotation && isValidRotation(message.rotation)) {
                player.rotation = {
                    x: message.rotation.x,
                    y: message.rotation.y
                };
            }
            player.lastUpdate = Date.now();

            // Broadcast to other players
            broadcast({
                type: 'playerUpdate',
                playerId: playerId,
                position: player.position,
                rotation: player.rotation
            }, playerId);
            break;

        case 'shoot':
            // Validate shooting data
            if (!GameState.isRunning || !player.isAlive) break;

            broadcast({
                type: 'playerShoot',
                playerId: playerId,
                origin: message.origin,
                direction: message.direction
            }, playerId);

            // Check if hit zombie with validated damage
            if (message.hitZombieId && typeof message.hitZombieId === 'string') {
                const damage = isValidNumber(message.damage, 1, 100) ? message.damage : 25;
                damageZombie(message.hitZombieId, damage, playerId, !!message.isHeadshot);
            }
            break;

        case 'collectPickup':
            if (typeof message.pickupId === 'string') {
                collectPickup(message.pickupId, playerId);
            }
            break;

        case 'requestStart':
            if (!GameState.isRunning && GameState.players.size > 0) {
                startGame();
            }
            break;

        case 'requestReset':
            if (GameState.isGameOver || !GameState.isRunning) {
                resetGame();
                setTimeout(() => {
                    if (GameState.players.size > 0) {
                        startGame();
                    }
                }, 1000);
            }
            break;

        case 'chat':
            if (message.text) {
                const sanitizedText = sanitizeString(message.text, 200);
                if (sanitizedText.length > 0) {
                    broadcast({
                        type: 'chat',
                        playerId: playerId,
                        playerName: player.name,
                        message: sanitizedText
                    });
                }
            }
            break;

        case 'setName':
            if (message.name) {
                const oldName = player.name;
                player.name = sanitizeString(message.name, 20) || oldName;
                if (player.name !== oldName) {
                    log(`Player ${oldName} changed name to ${player.name}`, 'PLAYER');
                    broadcast({
                        type: 'playerNameChange',
                        playerId: playerId,
                        name: player.name
                    });
                }
            }
            break;

        case 'setCosmetic':
            if (message.cosmetic) {
                const validCosmetics = ['default', 'military', 'hazmat', 'punk', 'mascot'];
                if (validCosmetics.includes(message.cosmetic)) {
                    const oldCosmetic = player.cosmetic;
                    player.cosmetic = message.cosmetic;
                    if (player.cosmetic !== oldCosmetic) {
                        log(`Player ${player.name} changed cosmetic to ${player.cosmetic}`, 'PLAYER');
                        broadcast({
                            type: 'playerCosmeticChange',
                            playerId: playerId,
                            cosmetic: player.cosmetic
                        });
                    }
                }
            }
            break;

        default:
            // Silently ignore unknown message types to prevent log spam
            break;
    }
}

// ==================== GAME LOOP ====================
setInterval(() => {
    if (GameState.isRunning && !GameState.isPaused) {
        updateZombies();

        // Send periodic state sync
        broadcast({
            type: 'sync',
            zombies: getZombiesData(),
            gameState: {
                wave: GameState.wave,
                zombiesRemaining: GameState.zombiesRemaining,
                totalKills: GameState.totalKills,
                totalScore: GameState.totalScore
            }
        });
    }
}, 1000 / CONFIG.tickRate);

// ==================== START SERVER ====================
server.listen(PORT, '0.0.0.0', () => {
    log(`========================================`, 'SUCCESS');
    log(`ASPEN'S PLAYGROUND - Multiplayer Server`, 'SUCCESS');
    log(`========================================`, 'SUCCESS');
    log(`Server running on port ${PORT}`, 'SUCCESS');
    log(`Local: http://localhost:${PORT}`, 'INFO');
    log(`Network: http://0.0.0.0:${PORT}`, 'INFO');
    log(`Waiting for players to connect...`, 'INFO');
});
