// ============================================
// ASPEN'S PLAYGROUND - Multiplayer Server
// ============================================

const express = require('express');
const http = require('http');
const https = require('https');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const app = express();

// SSL Certificate paths
const SSL_KEY_PATH = path.join(__dirname, 'ssl', 'key.pem');
const SSL_CERT_PATH = path.join(__dirname, 'ssl', 'cert.pem');

// Check if SSL certificates exist, generate if not
function ensureSSLCerts() {
    const sslDir = path.join(__dirname, 'ssl');
    if (!fs.existsSync(sslDir)) {
        fs.mkdirSync(sslDir);
    }

    if (!fs.existsSync(SSL_KEY_PATH) || !fs.existsSync(SSL_CERT_PATH)) {
        console.log('Generating self-signed SSL certificates...');
        try {
            // Generate self-signed certificate using openssl
            execSync(`openssl req -x509 -newkey rsa:2048 -keyout "${SSL_KEY_PATH}" -out "${SSL_CERT_PATH}" -days 365 -nodes -subj "/CN=localhost"`, {
                stdio: 'pipe'
            });
            console.log('SSL certificates generated successfully!');
        } catch (e) {
            console.error('Failed to generate SSL certificates. Make sure openssl is installed.');
            console.error('Falling back to HTTP...');
            return false;
        }
    }
    return true;
}

// Try to use HTTPS, fall back to HTTP if SSL not available
const useSSL = ensureSSLCerts();
let server;

if (useSSL) {
    const sslOptions = {
        key: fs.readFileSync(SSL_KEY_PATH),
        cert: fs.readFileSync(SSL_CERT_PATH)
    };
    server = https.createServer(sslOptions, app);
} else {
    server = http.createServer(app);
}

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
            const parsed = JSON.parse(data);
            // Validate parsed data is an array
            if (!Array.isArray(parsed)) {
                throw new Error('Leaderboard data is not an array');
            }
            leaderboard = parsed;
            log(`Loaded ${leaderboard.length} leaderboard entries`, 'SUCCESS');
        } else {
            leaderboard = [];
            saveLeaderboard();
            log('Created new leaderboard file', 'INFO');
        }
    } catch (e) {
        log(`Error loading leaderboard: ${e.message}`, 'ERROR');
        leaderboard = [];
        // Backup corrupted file and create fresh one
        if (fs.existsSync(LEADERBOARD_FILE)) {
            const backupPath = LEADERBOARD_FILE + '.corrupt.' + Date.now();
            fs.renameSync(LEADERBOARD_FILE, backupPath);
            log(`Corrupted file backed up to ${backupPath}`, 'WARN');
        }
        saveLeaderboard();
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

// ==================== MULTI-LOBBY SYSTEM ====================
const gameRooms = new Map(); // roomId -> GameRoom
const playerRooms = new Map(); // playerId -> roomId

function createGameRoom() {
    const roomId = uuidv4();
    const room = {
        id: roomId,
        players: new Map(),
        zombies: new Map(),
        pickups: new Map(),
        wave: 1,
        zombiesRemaining: 0,
        zombiesSpawned: 0,
        isRunning: false,
        isInLobby: true,
        isPaused: false,
        lastZombieId: 0,
        lastPickupId: 0,
        spawnInterval: null,
        totalKills: 0,
        totalScore: 0,
        shopOpen: false,
        shopPlayersReady: new Set(),
        shopTimeout: null,
        countdownTimer: null,
        countdownSeconds: 0,
        gameLoopInterval: null
    };
    gameRooms.set(roomId, room);
    log(`Created new game room: ${roomId}`, 'INFO');
    return room;
}

function findOrCreateLobby() {
    // Find an existing lobby that's not running
    for (const [roomId, room] of gameRooms) {
        if (room.isInLobby && !room.isRunning && room.players.size < 8) {
            log(`Found existing lobby: ${roomId} with ${room.players.size} players`, 'INFO');
            return room;
        }
    }
    // No available lobby, create new one
    return createGameRoom();
}

function getPlayerRoom(playerId) {
    const roomId = playerRooms.get(playerId);
    return roomId ? gameRooms.get(roomId) : null;
}

function cleanupEmptyRooms() {
    for (const [roomId, room] of gameRooms) {
        if (room.players.size === 0) {
            // Clear any intervals
            if (room.spawnInterval) clearInterval(room.spawnInterval);
            if (room.countdownTimer) clearInterval(room.countdownTimer);
            if (room.gameLoopInterval) clearInterval(room.gameLoopInterval);
            if (room.shopTimeout) clearTimeout(room.shopTimeout);
            gameRooms.delete(roomId);
            log(`Removed empty room: ${roomId}`, 'INFO');
        }
    }
}

// Legacy compatibility - points to first room or creates one
// This getter ensures existing code that uses GameState still works
const GameState = new Proxy({}, {
    get(target, prop) {
        // Get the first room or create one
        if (gameRooms.size === 0) {
            createGameRoom();
        }
        const firstRoom = gameRooms.values().next().value;
        return firstRoom ? firstRoom[prop] : undefined;
    },
    set(target, prop, value) {
        if (gameRooms.size === 0) {
            createGameRoom();
        }
        const firstRoom = gameRooms.values().next().value;
        if (firstRoom) firstRoom[prop] = value;
        return true;
    }
});

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
    tickRate: 10 // Server updates per second (reduced from 20 for less lag)
};

// ==================== PLAYER MANAGEMENT ====================
function createPlayer(ws, id) {
    // Find or create a lobby for this player
    const room = findOrCreateLobby();

    const colors = [0xff4444, 0x44ff44, 0x4444ff, 0xffff44, 0xff44ff, 0x44ffff, 0xff8844, 0x88ff44];
    const playerNum = room.players.size;

    const player = {
        id: id,
        name: `Player ${playerNum + 1}`,
        ws: ws,
        roomId: room.id,
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

    room.players.set(id, player);
    playerRooms.set(id, room.id);
    log(`Player ${player.name} (${id}) joined room ${room.id}. Room players: ${room.players.size}`, 'PLAYER');

    return player;
}

function removePlayer(id) {
    const room = getPlayerRoom(id);
    if (!room) return;

    const player = room.players.get(id);
    if (player) {
        log(`Player ${player.name} (${id}) left room ${room.id}. Room players: ${room.players.size - 1}`, 'PLAYER');
        room.players.delete(id);
        playerRooms.delete(id);

        // Broadcast player left to room
        broadcastToRoom(room, {
            type: 'playerLeft',
            playerId: id
        });

        // If in lobby, update lobby state
        if (room.isInLobby) {
            broadcastLobbyUpdateToRoom(room);
        }

        // Check if room should be cleaned up or game stopped
        if (room.players.size === 0) {
            stopGameInRoom(room);
            cleanupEmptyRooms();
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

    // Add small random offset to prevent instant collection when standing on kill spot
    const offsetX = (Math.random() - 0.5) * 1.5;
    const offsetZ = (Math.random() - 0.5) * 1.5;

    const pickup = {
        id: id,
        type: type,
        position: { x: position.x + offsetX, y: 0.5, z: position.z + offsetZ }
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

    log(`Wave ${GameState.wave - 1} complete! Opening upgrade shop...`, 'SUCCESS');

    // Open shop for all players
    openShop();
}

// ==================== UPGRADE SHOP MANAGEMENT ====================
const SHOP_MAX_TIME = 30000; // 30 seconds max

function openShop() {
    GameState.shopOpen = true;
    GameState.shopPlayersReady.clear();
    GameState.isPaused = true;

    // Notify all players to open shop
    broadcast({
        type: 'waveComplete',
        wave: GameState.wave - 1,
        nextWave: GameState.wave,
        bonus: CONFIG.scoring.waveBonus,
        showShop: true
    });

    log(`Upgrade shop opened for ${GameState.players.size} players`, 'GAME');

    // Start shop timeout (30 seconds max)
    if (GameState.shopTimeout) {
        clearTimeout(GameState.shopTimeout);
    }
    GameState.shopTimeout = setTimeout(() => {
        if (GameState.shopOpen) {
            log('Shop timeout - forcing close', 'GAME');
            closeShop();
        }
    }, SHOP_MAX_TIME);
}

function handleShopReady(playerId) {
    if (!GameState.shopOpen) return;

    GameState.shopPlayersReady.add(playerId);
    const totalPlayers = GameState.players.size;
    const readyCount = GameState.shopPlayersReady.size;

    log(`Player ${playerId} ready in shop (${readyCount}/${totalPlayers})`, 'GAME');

    // Notify all players of ready status
    broadcast({
        type: 'shopSync',
        action: 'playerReady',
        playerId: playerId,
        readyCount: readyCount,
        totalPlayers: totalPlayers
    });

    // Check if all players are ready
    if (readyCount >= totalPlayers) {
        log('All players ready - closing shop', 'SUCCESS');
        closeShop();
    }
}

function closeShop() {
    if (!GameState.shopOpen) return;

    GameState.shopOpen = false;
    GameState.shopPlayersReady.clear();
    GameState.isPaused = false;

    if (GameState.shopTimeout) {
        clearTimeout(GameState.shopTimeout);
        GameState.shopTimeout = null;
    }

    // Notify all players to close shop
    broadcast({
        type: 'shopSync',
        action: 'allReady'
    });

    log(`Shop closed, starting wave ${GameState.wave}`, 'GAME');

    // Start next wave after brief delay
    setTimeout(() => {
        if (GameState.isRunning) {
            startWave();
        }
    }, 1000);
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
            try {
                player.ws.send(data);
            } catch (e) {
                log(`WebSocket send error to ${id}: ${e.message}`, 'ERROR');
            }
        }
    });
}

// Room-specific broadcast
function broadcastToRoom(room, message, excludeId = null) {
    if (!room) return;
    const data = JSON.stringify(message);
    room.players.forEach((player, id) => {
        if (id !== excludeId && player.ws && player.ws.readyState === WebSocket.OPEN) {
            try {
                player.ws.send(data);
            } catch (e) {
                log(`WebSocket send error to ${id}: ${e.message}`, 'ERROR');
            }
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

// Room-specific lobby update
function broadcastLobbyUpdateToRoom(room) {
    if (!room) return;
    const lobbyPlayers = [];
    room.players.forEach((player, id) => {
        lobbyPlayers.push({
            id: player.id,
            name: player.name,
            isReady: player.isReady,
            color: player.color,
            cosmetic: player.cosmetic
        });
    });

    broadcastToRoom(room, {
        type: 'lobbyUpdate',
        players: lobbyPlayers,
        allReady: checkAllReadyInRoom(room)
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

function checkAllReadyInRoom(room) {
    if (!room || room.players.size === 0) return false;

    let allReady = true;
    room.players.forEach(player => {
        if (!player.isReady) allReady = false;
    });

    return allReady;
}

function stopGameInRoom(room) {
    if (!room) return;

    room.isRunning = false;
    room.isInLobby = true;

    if (room.spawnInterval) {
        clearInterval(room.spawnInterval);
        room.spawnInterval = null;
    }
    if (room.gameLoopInterval) {
        clearInterval(room.gameLoopInterval);
        room.gameLoopInterval = null;
    }
    if (room.countdownTimer) {
        clearInterval(room.countdownTimer);
        room.countdownTimer = null;
    }

    // Clear zombies and pickups
    room.zombies.clear();
    room.pickups.clear();

    log(`Game stopped in room ${room.id}`, 'GAME');
}

function setPlayerReady(playerId, isReady) {
    const room = getPlayerRoom(playerId);
    if (!room) return;

    const player = room.players.get(playerId);
    if (player) {
        player.isReady = isReady;
        log(`Player ${player.name} is ${isReady ? 'READY' : 'not ready'} in room ${room.id}`, 'PLAYER');
        broadcastLobbyUpdateToRoom(room);

        // Check if all players are ready to start
        if (checkAllReadyInRoom(room) && room.players.size >= 1 && !room.countdownTimer) {
            startLobbyCountdownInRoom(room);
        } else if (!checkAllReadyInRoom(room) && room.countdownTimer) {
            // Cancel countdown if someone un-readies
            cancelLobbyCountdownInRoom(room);
        }
    }
}

function startLobbyCountdownInRoom(room) {
    if (!room || room.countdownTimer) return; // Already counting down

    log(`All players ready in room ${room.id}! Starting countdown...`, 'GAME');
    room.countdownSeconds = 3;

    // Send initial countdown
    broadcastToRoom(room, { type: 'lobbyCountdown', seconds: room.countdownSeconds });

    room.countdownTimer = setInterval(() => {
        room.countdownSeconds--;

        if (room.countdownSeconds > 0) {
            broadcastToRoom(room, { type: 'lobbyCountdown', seconds: room.countdownSeconds });
        } else {
            // Countdown finished
            clearInterval(room.countdownTimer);
            room.countdownTimer = null;

            if (checkAllReadyInRoom(room) && room.isInLobby) {
                startMultiplayerGameInRoom(room);
            }
        }
    }, 1000);
}

function cancelLobbyCountdownInRoom(room) {
    if (room && room.countdownTimer) {
        clearInterval(room.countdownTimer);
        room.countdownTimer = null;
        log(`Countdown cancelled in room ${room.id} - player unreadied`, 'GAME');
        broadcastToRoom(room, { type: 'lobbyCountdown', seconds: 0, cancelled: true });
    }
}

function startMultiplayerGameInRoom(room) {
    if (!room) return;

    room.isInLobby = false;
    room.isRunning = true;

    // Reset all players
    room.players.forEach(player => {
        player.health = 100;
        player.isAlive = true;
        player.position = { x: (Math.random() - 0.5) * 10, y: 1.8, z: 10 + Math.random() * 5 };
    });

    broadcastToRoom(room, {
        type: 'gameStart',
        players: getPlayersDataFromRoom(room)
    });

    log(`Multiplayer game started in room ${room.id}!`, 'SUCCESS');
    startWaveInRoom(room);
}

// Legacy functions for backwards compatibility
function startLobbyCountdown() {
    if (gameRooms.size > 0) {
        const room = gameRooms.values().next().value;
        startLobbyCountdownInRoom(room);
    }
}

function cancelLobbyCountdown() {
    if (gameRooms.size > 0) {
        const room = gameRooms.values().next().value;
        cancelLobbyCountdownInRoom(room);
    }
}

function startMultiplayerGame() {
    if (gameRooms.size > 0) {
        const room = gameRooms.values().next().value;
        startMultiplayerGameInRoom(room);
    }
}

function getPlayersDataFromRoom(room) {
    if (!room) return [];
    const data = [];
    room.players.forEach((player, id) => {
        data.push({
            id: player.id,
            name: player.name,
            position: player.position,
            rotation: player.rotation,
            health: player.health,
            isAlive: player.isAlive,
            isReady: player.isReady,
            color: player.color,
            cosmetic: player.cosmetic
        });
    });
    return data;
}

function startWaveInRoom(room) {
    if (!room) return;
    // This will be called by the existing wave system
    // For now, delegate to the global startWave
    // In a full refactor, all wave logic would be room-specific
    startWave();
}

// ==================== WEBSOCKET HANDLING ====================
wss.on('connection', (ws) => {
    const playerId = uuidv4();
    const player = createPlayer(ws, playerId);
    const room = getPlayerRoom(playerId);

    log(`New WebSocket connection from player ${playerId} in room ${room ? room.id : 'unknown'}`, 'INFO');

    // Send initial lobby/game state to new player
    const initMessage = {
        type: 'init',
        playerId: playerId,
        roomId: room ? room.id : null,
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
            isRunning: room ? room.isRunning : false,
            isInLobby: room ? room.isInLobby : true,
            wave: room ? room.wave : 1,
            zombiesRemaining: room ? room.zombiesRemaining : 0,
            totalKills: room ? room.totalKills : 0,
            totalScore: room ? room.totalScore : 0
        },
        players: room ? getPlayersDataFromRoom(room).filter(p => p.id !== playerId) : [],
        zombies: room ? getZombiesDataFromRoom(room) : [],
        pickups: room ? getPickupsDataFromRoom(room) : []
    };

    log(`Sending init to ${playerId}: inLobby=${room ? room.isInLobby : true}, gameRunning=${room ? room.isRunning : false}`, 'INFO');
    ws.send(JSON.stringify(initMessage));

    // Broadcast new player to others in the same room
    if (room) {
        broadcastLobbyUpdateToRoom(room);

        // Also send playerJoined for game compatibility
        broadcastToRoom(room, {
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
    }

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

// Helper functions to get room-specific data
function getZombiesDataFromRoom(room) {
    if (!room) return [];
    const data = [];
    room.zombies.forEach((zombie, id) => {
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

function getPickupsDataFromRoom(room) {
    if (!room) return [];
    const data = [];
    room.pickups.forEach((pickup, id) => {
        data.push({
            id: pickup.id,
            type: pickup.type,
            position: pickup.position
        });
    });
    return data;
}

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
    const room = getPlayerRoom(playerId);
    if (!room) return;

    const player = room.players.get(playerId);
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

            // Broadcast to other players in the same room
            broadcastToRoom(room, {
                type: 'playerUpdate',
                playerId: playerId,
                position: player.position,
                rotation: player.rotation
            }, playerId);
            break;

        case 'shoot':
            // Validate shooting data
            if (!room.isRunning || !player.isAlive) break;

            broadcastToRoom(room, {
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
            if (!room.isRunning && room.players.size > 0) {
                startGame();
            }
            break;

        case 'requestReset':
            if (room.isGameOver || !room.isRunning) {
                resetGame();
                setTimeout(() => {
                    if (room.players.size > 0) {
                        startGame();
                    }
                }, 1000);
            }
            break;

        case 'chat':
            if (message.text) {
                const sanitizedText = sanitizeString(message.text, 200);
                if (sanitizedText.length > 0) {
                    broadcastToRoom(room, {
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
                    broadcastToRoom(room, {
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
                        broadcastToRoom(room, {
                            type: 'playerCosmeticChange',
                            playerId: playerId,
                            cosmetic: player.cosmetic
                        });
                    }
                }
            }
            break;

        case 'shopOpen':
            // Player opened shop - this is informational, server controls shop timing
            break;

        case 'shopReady':
            handleShopReady(playerId);
            break;

        default:
            // Silently ignore unknown message types to prevent log spam
            break;
    }
}

// ==================== GAME LOOP ====================
setInterval(() => {
    // Process all active game rooms
    gameRooms.forEach((room, roomId) => {
        if (room.isRunning && !room.isPaused) {
            // For legacy compatibility, set the current room for global functions
            updateZombies();

            // Send periodic state sync to room
            broadcastToRoom(room, {
                type: 'sync',
                zombies: getZombiesData(),
                gameState: {
                    wave: room.wave,
                    zombiesRemaining: room.zombiesRemaining,
                    totalKills: room.totalKills,
                    totalScore: room.totalScore
                }
            });
        }
    });
}, 1000 / CONFIG.tickRate);

// ==================== START SERVER ====================
server.listen(PORT, '0.0.0.0', () => {
    const protocol = useSSL ? 'https' : 'http';
    log(`========================================`, 'SUCCESS');
    log(`ASPEN'S PLAYGROUND - Multiplayer Server`, 'SUCCESS');
    log(`========================================`, 'SUCCESS');
    log(`Server running on port ${PORT} (${useSSL ? 'HTTPS' : 'HTTP'})`, 'SUCCESS');
    log(`Local: ${protocol}://localhost:${PORT}`, 'INFO');
    log(`Network: ${protocol}://0.0.0.0:${PORT}`, 'INFO');
    if (useSSL) {
        log(`Note: Accept the self-signed certificate warning in your browser`, 'WARN');
    }
    log(`Waiting for players to connect...`, 'INFO');
});
