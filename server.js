// ============================================
// ASPEN'S PLAYGROUND - Multiplayer Server
// ============================================

const express = require('express');
const http = require('http');
const https = require('https');
const net = require('net');
const WebSocket = require('ws');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');

// ==================== RATE LIMITING CONFIG ====================
const RATE_LIMIT = {
    // HTTP API limits
    api: {
        windowMs: 60 * 1000,      // 1 minute window
        maxRequests: 30           // 30 requests per minute per IP
    },
    // WebSocket limits
    ws: {
        maxConnectionsPerIP: 5,   // Max 5 simultaneous connections per IP
        maxMessagesPerSecond: 60, // Max 60 messages per second per client
        banDurationMs: 5 * 60 * 1000  // 5 minute ban for abusive IPs
    }
};

// Track connections and bans per IP
const ipConnections = new Map();  // IP -> Set of WebSocket connections
const ipBans = new Map();         // IP -> ban expiry timestamp
const clientMessageRates = new Map(); // playerId -> { count, windowStart }

// ==================== MIN-HEAP PRIORITY QUEUE ====================
// Binary heap for O(log n) A* pathfinding operations
class MinHeap {
    constructor() {
        this.heap = [];
        this.indices = new Map(); // key -> index for O(1) lookup
    }

    get length() {
        return this.heap.length;
    }

    push(node) {
        const key = `${node.x},${node.z}`;
        this.heap.push(node);
        this.indices.set(key, this.heap.length - 1);
        this._bubbleUp(this.heap.length - 1);
    }

    pop() {
        if (this.heap.length === 0) return null;
        const min = this.heap[0];
        const key = `${min.x},${min.z}`;
        this.indices.delete(key);

        if (this.heap.length === 1) {
            this.heap.pop();
            return min;
        }

        const last = this.heap.pop();
        this.heap[0] = last;
        this.indices.set(`${last.x},${last.z}`, 0);
        this._bubbleDown(0);
        return min;
    }

    has(x, z) {
        return this.indices.has(`${x},${z}`);
    }

    updateF(x, z, newF) {
        const key = `${x},${z}`;
        const idx = this.indices.get(key);
        if (idx === undefined) return false;

        const oldF = this.heap[idx].f;
        this.heap[idx].f = newF;

        if (newF < oldF) {
            this._bubbleUp(idx);
        } else {
            this._bubbleDown(idx);
        }
        return true;
    }

    _bubbleUp(idx) {
        while (idx > 0) {
            const parentIdx = Math.floor((idx - 1) / 2);
            if (this.heap[parentIdx].f <= this.heap[idx].f) break;

            this._swap(idx, parentIdx);
            idx = parentIdx;
        }
    }

    _bubbleDown(idx) {
        const length = this.heap.length;
        while (true) {
            const leftIdx = 2 * idx + 1;
            const rightIdx = 2 * idx + 2;
            let smallest = idx;

            if (leftIdx < length && this.heap[leftIdx].f < this.heap[smallest].f) {
                smallest = leftIdx;
            }
            if (rightIdx < length && this.heap[rightIdx].f < this.heap[smallest].f) {
                smallest = rightIdx;
            }

            if (smallest === idx) break;
            this._swap(idx, smallest);
            idx = smallest;
        }
    }

    _swap(i, j) {
        const nodeI = this.heap[i];
        const nodeJ = this.heap[j];
        this.heap[i] = nodeJ;
        this.heap[j] = nodeI;
        this.indices.set(`${nodeI.x},${nodeI.z}`, j);
        this.indices.set(`${nodeJ.x},${nodeJ.z}`, i);
    }
}

// ==================== SPATIAL PARTITIONING GRID ====================
// Grid-based spatial partitioning for O(1) nearby entity lookups
// Reduces zombie targeting from O(n*m) to O(n) where n=zombies, m=players
class SpatialGrid {
    constructor(cellSize = 10, arenaWidth = 50, arenaDepth = 50) {
        this.cellSize = cellSize;
        this.arenaWidth = arenaWidth;
        this.arenaDepth = arenaDepth;
        this.halfWidth = arenaWidth / 2;
        this.halfDepth = arenaDepth / 2;
        this.cols = Math.ceil(arenaWidth / cellSize);
        this.rows = Math.ceil(arenaDepth / cellSize);
        this.cells = new Map(); // "col,row" -> Set of entities
    }

    // Convert world position to cell coordinates
    _getCellCoords(x, z) {
        const col = Math.floor((x + this.halfWidth) / this.cellSize);
        const row = Math.floor((z + this.halfDepth) / this.cellSize);
        return {
            col: Math.max(0, Math.min(this.cols - 1, col)),
            row: Math.max(0, Math.min(this.rows - 1, row))
        };
    }

    _getCellKey(col, row) {
        return `${col},${row}`;
    }

    // Clear all entities from the grid
    clear() {
        this.cells.clear();
    }

    // Add an entity to the grid
    insert(entity, x, z) {
        const { col, row } = this._getCellCoords(x, z);
        const key = this._getCellKey(col, row);

        if (!this.cells.has(key)) {
            this.cells.set(key, new Set());
        }
        this.cells.get(key).add(entity);
    }

    // Get all entities in a cell
    getEntitiesInCell(col, row) {
        const key = this._getCellKey(col, row);
        return this.cells.get(key) || new Set();
    }

    // Get all entities within a radius (checks neighboring cells)
    getNearbyEntities(x, z, radius = 0) {
        const { col, row } = this._getCellCoords(x, z);
        const cellRadius = Math.ceil(radius / this.cellSize);
        const nearby = [];

        for (let dc = -cellRadius; dc <= cellRadius; dc++) {
            for (let dr = -cellRadius; dr <= cellRadius; dr++) {
                const c = col + dc;
                const r = row + dr;
                if (c >= 0 && c < this.cols && r >= 0 && r < this.rows) {
                    const entities = this.getEntitiesInCell(c, r);
                    for (const entity of entities) {
                        nearby.push(entity);
                    }
                }
            }
        }

        return nearby;
    }

    // Find the closest entity to a point
    findClosest(x, z, maxRadius = 100) {
        let closestEntity = null;
        let closestDistSq = Infinity;

        // Start with immediate cell, then expand outward
        const { col, row } = this._getCellCoords(x, z);
        const maxCellRadius = Math.ceil(maxRadius / this.cellSize);

        for (let radius = 0; radius <= maxCellRadius; radius++) {
            let foundInRing = false;

            // Check cells at current radius ring
            for (let dc = -radius; dc <= radius; dc++) {
                for (let dr = -radius; dr <= radius; dr++) {
                    // Only check cells on the ring perimeter (skip inner cells)
                    if (radius > 0 && Math.abs(dc) < radius && Math.abs(dr) < radius) continue;

                    const c = col + dc;
                    const r = row + dr;
                    if (c < 0 || c >= this.cols || r < 0 || r >= this.rows) continue;

                    const entities = this.getEntitiesInCell(c, r);
                    for (const entity of entities) {
                        if (!entity.position) continue;
                        const dx = entity.position.x - x;
                        const dz = entity.position.z - z;
                        const distSq = dx * dx + dz * dz;
                        if (distSq < closestDistSq) {
                            closestDistSq = distSq;
                            closestEntity = entity;
                            foundInRing = true;
                        }
                    }
                }
            }

            // If we found something and checked one more ring, we can stop
            // (ensures we didn't miss a closer entity in an adjacent cell)
            if (closestEntity && radius > 0) break;
        }

        return {
            entity: closestEntity,
            distance: closestEntity ? Math.sqrt(closestDistSq) : Infinity
        };
    }

    // Rebuild grid from a collection of entities (call once per tick)
    rebuild(entities) {
        this.clear();
        for (const entity of entities) {
            if (entity.position && entity.isAlive !== false) {
                this.insert(entity, entity.position.x, entity.position.z);
            }
        }
    }
}

// Global player spatial grid (rebuilt each tick)
const playerSpatialGrid = new SpatialGrid(10, 50, 50);

// ==================== ENTITY CACHE ====================
// Caches alive entity arrays to avoid repeated O(n) filtering per tick
// Mark cache dirty when entities spawn/die, rebuild once per tick on first access
const EntityCache = {
    _alivePlayers: null,
    _aliveZombies: null,
    _playersDirty: true,
    _zombiesDirty: true,
    _lastRoomId: null,

    // Mark caches as needing rebuild
    invalidatePlayers() { this._playersDirty = true; },
    invalidateZombies() { this._zombiesDirty = true; },
    invalidateAll() { this._playersDirty = true; this._zombiesDirty = true; },

    // Get cached alive players (rebuilds if dirty)
    getAlivePlayers(room) {
        if (!room) return [];
        if (this._playersDirty || this._lastRoomId !== room.id) {
            this._alivePlayers = Array.from(room.players.values()).filter(p => p.isAlive);
            this._playersDirty = false;
            this._lastRoomId = room.id;
        }
        return this._alivePlayers;
    },

    // Get cached alive zombies (rebuilds if dirty)
    getAliveZombies(room) {
        if (!room) return [];
        if (this._zombiesDirty || this._lastRoomId !== room.id) {
            this._aliveZombies = Array.from(room.zombies.values()).filter(z => z.isAlive);
            this._zombiesDirty = false;
            this._lastRoomId = room.id;
        }
        return this._aliveZombies;
    },

    // Call at start of each tick to reset for fresh rebuilds
    beginTick() {
        // Optionally force rebuild each tick for safety
        // Comment these out if you want aggressive caching across tick phases
        this._playersDirty = true;
        this._zombiesDirty = true;
    }
};

// ==================== SESSION AUTHENTICATION ====================
// Game sessions - tracks active players and their server-verified stats
const gameSessions = new Map();  // sessionToken -> { playerId, visitorId, score, kills, wave, startTime, isActive }

function generateSessionToken() {
    return crypto.randomBytes(32).toString('hex');
}

function createGameSession(playerId, visitorId = null) {
    const token = generateSessionToken();
    const session = {
        playerId,
        visitorId,  // Optional: for tracking returning visitors
        token,
        score: 0,
        kills: 0,
        wave: 1,
        startTime: Date.now(),
        isActive: true,
        isInGame: false  // True once they've started playing (not just in lobby)
    };
    gameSessions.set(token, session);
    return session;
}

function getSessionByToken(token) {
    return gameSessions.get(token);
}

function getSessionByPlayerId(playerId) {
    for (const [token, session] of gameSessions) {
        if (session.playerId === playerId && session.isActive) {
            return session;
        }
    }
    return null;
}

function endGameSession(token) {
    const session = gameSessions.get(token);
    if (session) {
        session.isActive = false;
        // Keep session for 5 minutes for leaderboard submission
        setTimeout(() => {
            gameSessions.delete(token);
        }, 5 * 60 * 1000);
    }
    return session;
}

// Server-side score tracking
function addKillToSession(playerId, points, isHeadshot = false) {
    const session = getSessionByPlayerId(playerId);
    if (session && session.isActive) {
        session.kills++;
        session.score += points;
        return true;
    }
    return false;
}

function updateSessionWave(playerId, wave) {
    const session = getSessionByPlayerId(playerId);
    if (session && session.isActive) {
        session.wave = wave;
    }
}

// Cleanup old sessions periodically
setInterval(() => {
    const now = Date.now();
    for (const [token, session] of gameSessions) {
        // Remove inactive sessions older than 10 minutes
        if (!session.isActive && now - session.startTime > 10 * 60 * 1000) {
            gameSessions.delete(token);
        }
        // Remove abandoned active sessions (no activity for 30 minutes)
        if (session.isActive && now - session.startTime > 30 * 60 * 1000) {
            session.isActive = false;
        }
    }
}, 60 * 1000); // Check every minute

const app = express();

// ==================== SSL CERTIFICATE CONFIGURATION ====================
const DOMAIN = process.env.DOMAIN || 'aspensplayground.com';

// Certificate paths - priority order:
// 1. Environment variables (SSL_KEY_PATH, SSL_CERT_PATH)
// 2. Let's Encrypt standard paths
// 3. Local ssl/ directory (self-signed fallback)

const LETSENCRYPT_PATHS = {
    // Linux standard paths
    linux: {
        key: `/etc/letsencrypt/live/${DOMAIN}/privkey.pem`,
        cert: `/etc/letsencrypt/live/${DOMAIN}/fullchain.pem`
    },
    // Windows paths (if using win-acme or certbot for Windows)
    win32: {
        key: `C:\\Certbot\\live\\${DOMAIN}\\privkey.pem`,
        cert: `C:\\Certbot\\live\\${DOMAIN}\\fullchain.pem`
    }
};

const LOCAL_SSL_DIR = path.join(__dirname, 'ssl');
const LOCAL_KEY_PATH = path.join(LOCAL_SSL_DIR, 'key.pem');
const LOCAL_CERT_PATH = path.join(LOCAL_SSL_DIR, 'cert.pem');

function findSSLCerts() {
    // Priority 1: Environment variables
    if (process.env.SSL_KEY_PATH && process.env.SSL_CERT_PATH) {
        if (fs.existsSync(process.env.SSL_KEY_PATH) && fs.existsSync(process.env.SSL_CERT_PATH)) {
            console.log('Using SSL certificates from environment variables');
            return {
                key: process.env.SSL_KEY_PATH,
                cert: process.env.SSL_CERT_PATH,
                trusted: true
            };
        }
    }

    // Priority 2: Let's Encrypt certificates
    const platform = process.platform;
    const lePaths = LETSENCRYPT_PATHS[platform] || LETSENCRYPT_PATHS.linux;

    if (fs.existsSync(lePaths.key) && fs.existsSync(lePaths.cert)) {
        console.log(`Using Let's Encrypt certificates for ${DOMAIN}`);
        return {
            key: lePaths.key,
            cert: lePaths.cert,
            trusted: true
        };
    }

    // Priority 3: Local self-signed certificates
    return null;
}

function ensureSSLCerts() {
    // First, try to find trusted certificates
    const trustedCerts = findSSLCerts();
    if (trustedCerts) {
        return trustedCerts;
    }

    // Fall back to self-signed certificates
    console.log('\n' + '='.repeat(60));
    console.log('WARNING: No trusted SSL certificates found!');
    console.log('Using self-signed certificates (NOT suitable for production)');
    console.log('');
    console.log('To get trusted certificates, run:');
    console.log(`  certbot certonly --standalone -d ${DOMAIN}`);
    console.log('');
    console.log('Or set environment variables:');
    console.log('  SSL_KEY_PATH=/path/to/privkey.pem');
    console.log('  SSL_CERT_PATH=/path/to/fullchain.pem');
    console.log('='.repeat(60) + '\n');

    // Generate self-signed if needed
    if (!fs.existsSync(LOCAL_SSL_DIR)) {
        fs.mkdirSync(LOCAL_SSL_DIR);
    }

    if (!fs.existsSync(LOCAL_KEY_PATH) || !fs.existsSync(LOCAL_CERT_PATH)) {
        console.log('Generating self-signed SSL certificates...');
        try {
            execSync(`openssl req -x509 -newkey rsa:2048 -keyout "${LOCAL_KEY_PATH}" -out "${LOCAL_CERT_PATH}" -days 365 -nodes -subj "/CN=${DOMAIN}"`, {
                stdio: 'pipe'
            });
            console.log('Self-signed certificates generated successfully!');
        } catch (e) {
            console.error('Failed to generate SSL certificates. Make sure openssl is installed.');
            console.error('Falling back to HTTP only...');
            return null;
        }
    }

    return {
        key: LOCAL_KEY_PATH,
        cert: LOCAL_CERT_PATH,
        trusted: false
    };
}

// Single port for both HTTP and HTTPS (protocol auto-detection)
const PORT = process.env.PORT || 3000;

// Create internal HTTP server (not exposed directly)
const httpServer = http.createServer(app);

// Try to create HTTPS server
const sslCerts = ensureSSLCerts();
let httpsServer = null;
let usingTrustedCerts = false;

if (sslCerts) {
    try {
        const sslOptions = {
            key: fs.readFileSync(sslCerts.key),
            cert: fs.readFileSync(sslCerts.cert)
        };
        httpsServer = https.createServer(sslOptions, app);
        usingTrustedCerts = sslCerts.trusted;
    } catch (e) {
        log(`Failed to load SSL certificates: ${e.message}`, 'ERROR');
        log('Continuing with HTTP only', 'WARN');
    }
}

// Create WebSocket server (shared by both HTTP and HTTPS)
const wss = new WebSocket.Server({ noServer: true });

// Handle WebSocket upgrades for both servers
function handleUpgrade(request, socket, head) {
    const ip = getClientIP(request);

    // Check if IP is banned
    if (isIPBanned(ip)) {
        log(`Rejected connection from banned IP: ${ip}`, 'WARN');
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
    }

    // Check connection limit per IP
    if (getIPConnectionCount(ip) >= RATE_LIMIT.ws.maxConnectionsPerIP) {
        log(`Rejected connection from IP ${ip}: too many connections (${getIPConnectionCount(ip)})`, 'WARN');
        socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
        socket.destroy();
        return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
}

httpServer.on('upgrade', handleUpgrade);
if (httpsServer) {
    httpsServer.on('upgrade', handleUpgrade);
}

// Protocol detection server - routes to HTTP or HTTPS based on first byte
const mainServer = net.createServer((socket) => {
    socket.once('readable', () => {
        // Peek at the first byte without consuming it
        let chunk = socket.read(1);
        if (!chunk) return;

        // Put the byte back
        socket.unshift(chunk);

        // Determine protocol: TLS handshake starts with 0x16 or 0x80 (SSLv2)
        const firstByte = chunk[0];
        const isTLS = firstByte === 0x16 || firstByte === 0x80;

        // Choose the appropriate server and emit the connection
        if (isTLS && httpsServer) {
            httpsServer.emit('connection', socket);
        } else {
            httpServer.emit('connection', socket);
        }
    });

    socket.on('error', (err) => {
        log('Socket protocol detection error: ' + err.message, 'ERROR');
    });
});

const LEADERBOARD_FILE = path.join(__dirname, 'leaderboard.json');
const MAX_LEADERBOARD_SIZE = 10;

// ==================== SECURITY HEADERS ====================
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],  // Allow Three.js CDN
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'", "ws:", "wss:"],  // Allow WebSocket connections
            workerSrc: ["'self'", "blob:"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: []
        }
    },
    crossOriginEmbedderPolicy: false,  // Required for some game assets
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// ==================== CORS CONFIGURATION ====================
const allowedOrigins = [
    `https://${DOMAIN}`,
    `https://www.${DOMAIN}`,
    'http://localhost:3000',      // Local development
    'https://localhost:3000'      // Local development with self-signed cert
];

app.use(cors({
    origin: function(origin, callback) {
        // Allow requests with no origin (like mobile apps, curl, or same-origin)
        if (!origin) return callback(null, true);

        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            log(`CORS blocked request from: ${origin}`, 'WARN');
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));

// Serve static files and parse JSON
app.use(express.static(path.join(__dirname)));
app.use(express.json());

// ==================== API RATE LIMITING ====================
const apiLimiter = rateLimit({
    windowMs: RATE_LIMIT.api.windowMs,
    max: RATE_LIMIT.api.maxRequests,
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        log(`Rate limit exceeded for IP: ${req.ip}`, 'WARN');
        res.status(429).json({ error: 'Too many requests, please try again later.' });
    }
});

// Apply rate limiting to API endpoints
app.use('/api/', apiLimiter);

// ==================== IP MANAGEMENT HELPERS ====================
function getClientIP(req) {
    // Handle proxied requests
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }
    return req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown';
}

function isIPBanned(ip) {
    const banExpiry = ipBans.get(ip);
    if (banExpiry) {
        if (Date.now() < banExpiry) {
            return true;
        }
        // Ban expired, remove it
        ipBans.delete(ip);
    }
    return false;
}

function banIP(ip, reason) {
    const expiry = Date.now() + RATE_LIMIT.ws.banDurationMs;
    ipBans.set(ip, expiry);
    log(`Banned IP ${ip} for ${RATE_LIMIT.ws.banDurationMs / 1000}s - Reason: ${reason}`, 'WARN');
}

function trackIPConnection(ip, ws) {
    if (!ipConnections.has(ip)) {
        ipConnections.set(ip, new Set());
    }
    ipConnections.get(ip).add(ws);
}

function untrackIPConnection(ip, ws) {
    const connections = ipConnections.get(ip);
    if (connections) {
        connections.delete(ws);
        if (connections.size === 0) {
            ipConnections.delete(ip);
        }
    }
}

function getIPConnectionCount(ip) {
    const connections = ipConnections.get(ip);
    return connections ? connections.size : 0;
}

// Check message rate for a client
function checkMessageRate(playerId) {
    const now = Date.now();
    let rateData = clientMessageRates.get(playerId);

    if (!rateData || now - rateData.windowStart > 1000) {
        // New window
        rateData = { count: 1, windowStart: now };
        clientMessageRates.set(playerId, rateData);
        return true;
    }

    rateData.count++;
    if (rateData.count > RATE_LIMIT.ws.maxMessagesPerSecond) {
        return false; // Rate exceeded
    }
    return true;
}

// Cleanup old rate data periodically
setInterval(() => {
    const now = Date.now();
    for (const [playerId, data] of clientMessageRates) {
        if (now - data.windowStart > 5000) {
            clientMessageRates.delete(playerId);
        }
    }
    // Also cleanup expired bans
    for (const [ip, expiry] of ipBans) {
        if (now >= expiry) {
            ipBans.delete(ip);
        }
    }
}, 10000); // Every 10 seconds

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
    const { name, sessionToken } = req.body;

    // Require valid session token
    if (!sessionToken) {
        log('Leaderboard submission rejected: No session token', 'WARN');
        return res.status(401).json({ error: 'Session token required' });
    }

    const session = getSessionByToken(sessionToken);
    if (!session) {
        log('Leaderboard submission rejected: Invalid session token', 'WARN');
        return res.status(401).json({ error: 'Invalid session token' });
    }

    // Use server-tracked values, not client-submitted ones
    const serverScore = session.score;
    const serverWave = session.wave;
    const serverKills = session.kills;

    if (serverScore <= 0) {
        return res.status(400).json({ error: 'No score to submit' });
    }

    // Mark session as used for leaderboard (prevent duplicate submissions)
    if (session.leaderboardSubmitted) {
        return res.status(400).json({ error: 'Score already submitted' });
    }
    session.leaderboardSubmitted = true;

    const result = addToLeaderboard(name, serverScore, serverWave, serverKills);
    log(`Leaderboard: Session ${sessionToken.substring(0, 8)}... submitted score ${serverScore}`, 'INFO');

    res.json({
        ...result,
        leaderboard,
        verifiedScore: serverScore,
        verifiedWave: serverWave,
        verifiedKills: serverKills
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

// ==================== NAVIGATION GRID ====================
const NavGrid = {
    cellSize: 1.0,
    gridWidth: 60,
    gridHeight: 60,
    offsetX: -30,
    offsetZ: -30,
    grid: null,
    initialized: false,

    init() {
        this.grid = [];
        for (let z = 0; z < this.gridHeight; z++) {
            this.grid[z] = new Array(this.gridWidth).fill(0);
        }
        // Mark arena boundaries as blocked
        for (let x = 0; x < this.gridWidth; x++) {
            this.grid[0][x] = 1;
            this.grid[this.gridHeight - 1][x] = 1;
        }
        for (let z = 0; z < this.gridHeight; z++) {
            this.grid[z][0] = 1;
            this.grid[z][this.gridWidth - 1] = 1;
        }
        this.initialized = true;
        log(`NavGrid initialized: ${this.gridWidth}x${this.gridHeight}`, 'INFO');
    },

    worldToGridX(x) {
        return Math.floor((x - this.offsetX) / this.cellSize);
    },

    worldToGridZ(z) {
        return Math.floor((z - this.offsetZ) / this.cellSize);
    },

    gridToWorldX(gx) {
        return gx * this.cellSize + this.offsetX + this.cellSize / 2;
    },

    gridToWorldZ(gz) {
        return gz * this.cellSize + this.offsetZ + this.cellSize / 2;
    },

    isWalkable(gx, gz) {
        if (gx < 0 || gx >= this.gridWidth || gz < 0 || gz >= this.gridHeight) {
            return false;
        }
        return this.grid[gz][gx] === 0;
    },

    markBlocked(minX, maxX, minZ, maxZ) {
        const gMinX = Math.max(0, this.worldToGridX(minX) - 1);
        const gMaxX = Math.min(this.gridWidth - 1, this.worldToGridX(maxX) + 1);
        const gMinZ = Math.max(0, this.worldToGridZ(minZ) - 1);
        const gMaxZ = Math.min(this.gridHeight - 1, this.worldToGridZ(maxZ) + 1);

        for (let gz = gMinZ; gz <= gMaxZ; gz++) {
            for (let gx = gMinX; gx <= gMaxX; gx++) {
                this.grid[gz][gx] = 1;
            }
        }
    },

    buildFromObstacles(obstacles) {
        // Reset grid
        for (let z = 0; z < this.gridHeight; z++) {
            for (let x = 0; x < this.gridWidth; x++) {
                // Keep arena boundaries blocked
                if (z === 0 || z === this.gridHeight - 1 || x === 0 || x === this.gridWidth - 1) {
                    this.grid[z][x] = 1;
                } else {
                    this.grid[z][x] = 0;
                }
            }
        }
        // Mark obstacles
        obstacles.forEach(obs => {
            this.markBlocked(obs.minX, obs.maxX, obs.minZ, obs.maxZ);
        });
        log(`NavGrid built with ${obstacles.length} obstacles`, 'INFO');
    }
};

// ==================== A* PATHFINDER ====================
const Pathfinder = {
    pathCache: new Map(),
    cacheTimeout: 500, // ms

    clearCache() {
        this.pathCache.clear();
    },

    findPath(startX, startZ, goalX, goalZ) {
        if (!NavGrid.initialized) return null;

        const startGX = NavGrid.worldToGridX(startX);
        const startGZ = NavGrid.worldToGridZ(startZ);
        const goalGX = NavGrid.worldToGridX(goalX);
        const goalGZ = NavGrid.worldToGridZ(goalZ);

        // Check if start/goal are valid
        if (!NavGrid.isWalkable(startGX, startGZ)) {
            // Find nearest walkable cell to start
            const nearest = this.findNearestWalkable(startGX, startGZ);
            if (!nearest) return null;
        }

        if (!NavGrid.isWalkable(goalGX, goalGZ)) {
            // Find nearest walkable cell to goal
            const nearest = this.findNearestWalkable(goalGX, goalGZ);
            if (!nearest) return null;
        }

        // A* implementation with MinHeap for O(log n) operations
        const openSet = new MinHeap();
        const closedSet = new Set();
        const cameFrom = new Map();
        const gScore = new Map();

        const startKey = `${startGX},${startGZ}`;

        gScore.set(startKey, 0);
        const startF = this.heuristic(startGX, startGZ, goalGX, goalGZ);
        openSet.push({ x: startGX, z: startGZ, f: startF });

        const neighbors = [
            { dx: 0, dz: -1, cost: 1 },
            { dx: 0, dz: 1, cost: 1 },
            { dx: -1, dz: 0, cost: 1 },
            { dx: 1, dz: 0, cost: 1 },
            { dx: -1, dz: -1, cost: 1.414 },
            { dx: 1, dz: -1, cost: 1.414 },
            { dx: -1, dz: 1, cost: 1.414 },
            { dx: 1, dz: 1, cost: 1.414 }
        ];

        let iterations = 0;
        const maxIterations = 2000;

        while (openSet.length > 0 && iterations < maxIterations) {
            iterations++;

            // Get node with lowest fScore - O(log n) with heap
            const current = openSet.pop();
            const currentKey = `${current.x},${current.z}`;

            if (current.x === goalGX && current.z === goalGZ) {
                // Reconstruct path
                return this.reconstructPath(cameFrom, current, startGX, startGZ);
            }

            closedSet.add(currentKey);

            for (const neighbor of neighbors) {
                const nx = current.x + neighbor.dx;
                const nz = current.z + neighbor.dz;
                const neighborKey = `${nx},${nz}`;

                if (closedSet.has(neighborKey)) continue;
                if (!NavGrid.isWalkable(nx, nz)) continue;

                // For diagonal movement, check if we can cut the corner
                if (neighbor.dx !== 0 && neighbor.dz !== 0) {
                    if (!NavGrid.isWalkable(current.x + neighbor.dx, current.z) ||
                        !NavGrid.isWalkable(current.x, current.z + neighbor.dz)) {
                        continue;
                    }
                }

                const tentativeG = gScore.get(currentKey) + neighbor.cost;

                if (!gScore.has(neighborKey) || tentativeG < gScore.get(neighborKey)) {
                    cameFrom.set(neighborKey, current);
                    gScore.set(neighborKey, tentativeG);
                    const f = tentativeG + this.heuristic(nx, nz, goalGX, goalGZ);

                    // O(log n) update or insert
                    if (openSet.has(nx, nz)) {
                        openSet.updateF(nx, nz, f);
                    } else {
                        openSet.push({ x: nx, z: nz, f: f });
                    }
                }
            }
        }

        return null; // No path found
    },

    heuristic(x1, z1, x2, z2) {
        // Euclidean distance
        const dx = x2 - x1;
        const dz = z2 - z1;
        return Math.sqrt(dx * dx + dz * dz);
    },

    reconstructPath(cameFrom, goal, startX, startZ) {
        const path = [];
        let current = goal;

        while (current) {
            path.unshift({
                x: NavGrid.gridToWorldX(current.x),
                z: NavGrid.gridToWorldZ(current.z)
            });
            const key = `${current.x},${current.z}`;
            current = cameFrom.get(key);
        }

        // Smooth path - remove unnecessary waypoints
        return this.smoothPath(path);
    },

    smoothPath(path) {
        if (path.length <= 2) return path;

        const smoothed = [path[0]];
        let i = 0;

        while (i < path.length - 1) {
            let furthest = i + 1;
            for (let j = i + 2; j < path.length; j++) {
                if (this.hasLineOfSight(path[i].x, path[i].z, path[j].x, path[j].z)) {
                    furthest = j;
                }
            }
            smoothed.push(path[furthest]);
            i = furthest;
        }

        return smoothed;
    },

    hasLineOfSight(x1, z1, x2, z2) {
        const dx = x2 - x1;
        const dz = z2 - z1;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const steps = Math.ceil(dist / 0.5);

        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const x = x1 + dx * t;
            const z = z1 + dz * t;
            const gx = NavGrid.worldToGridX(x);
            const gz = NavGrid.worldToGridZ(z);
            if (!NavGrid.isWalkable(gx, gz)) {
                return false;
            }
        }
        return true;
    },

    findNearestWalkable(gx, gz) {
        const maxRadius = 5;
        for (let r = 1; r <= maxRadius; r++) {
            for (let dx = -r; dx <= r; dx++) {
                for (let dz = -r; dz <= r; dz++) {
                    if (Math.abs(dx) === r || Math.abs(dz) === r) {
                        if (NavGrid.isWalkable(gx + dx, gz + dz)) {
                            return { x: gx + dx, z: gz + dz };
                        }
                    }
                }
            }
        }
        return null;
    }
};

// ==================== MAP OBSTACLES PER MAP ====================
// Obstacle data for each map - synced with client map definitions
const MAP_OBSTACLES = {
    dining_hall: [
        // Tables in diamond pattern
        { minX: -9.5, maxX: -6.5, minZ: -9.5, maxZ: -6.5 },
        { minX: 6.5, maxX: 9.5, minZ: -9.5, maxZ: -6.5 },
        { minX: -9.5, maxX: -6.5, minZ: 6.5, maxZ: 9.5 },
        { minX: 6.5, maxX: 9.5, minZ: 6.5, maxZ: 9.5 },
        // Pillars
        { minX: -18.8, maxX: -17.2, minZ: -18.8, maxZ: -17.2 },
        { minX: 17.2, maxX: 18.8, minZ: -18.8, maxZ: -17.2 },
        { minX: -18.8, maxX: -17.2, minZ: 17.2, maxZ: 18.8 },
        { minX: 17.2, maxX: 18.8, minZ: 17.2, maxZ: 18.8 },
        // Stage
        { minX: -6, maxX: 6, minZ: -22, maxZ: -18 },
        // Counter
        { minX: -5, maxX: 5, minZ: 19.25, maxZ: 20.75 }
    ],
    arcade_zone: [
        // Left wall cabinets
        { minX: -23.1, maxX: -20.9, minZ: -13.1, maxZ: -10.9 },
        { minX: -23.1, maxX: -20.9, minZ: -5.1, maxZ: -2.9 },
        { minX: -23.1, maxX: -20.9, minZ: 2.9, maxZ: 5.1 },
        { minX: -23.1, maxX: -20.9, minZ: 10.9, maxZ: 13.1 },
        // Right wall cabinets
        { minX: 20.9, maxX: 23.1, minZ: -13.1, maxZ: -10.9 },
        { minX: 20.9, maxX: 23.1, minZ: -5.1, maxZ: -2.9 },
        { minX: 20.9, maxX: 23.1, minZ: 2.9, maxZ: 5.1 },
        { minX: 20.9, maxX: 23.1, minZ: 10.9, maxZ: 13.1 },
        // Back wall cabinets
        { minX: -9.1, maxX: -6.9, minZ: -23.1, maxZ: -20.9 },
        { minX: -1.1, maxX: 1.1, minZ: -23.1, maxZ: -20.9 },
        { minX: 6.9, maxX: 9.1, minZ: -23.1, maxZ: -20.9 },
        // Center clusters
        { minX: -9.1, maxX: -6.9, minZ: -4.1, maxZ: 4.1 },
        { minX: 6.9, maxX: 9.1, minZ: -4.1, maxZ: 4.1 },
        // Prize counter
        { minX: -4, maxX: 4, minZ: 17, maxZ: 19 },
        // Prize shelves
        { minX: -5, maxX: 5, minZ: 21.5, maxZ: 22.5 },
        // Token machines
        { minX: -18.6, maxX: -17.4, minZ: 17.6, maxZ: 18.4 },
        { minX: 17.4, maxX: 18.6, minZ: 17.6, maxZ: 18.4 },
        // Pillars
        { minX: -15.6, maxX: -14.4, minZ: -15.6, maxZ: -14.4 },
        { minX: 14.4, maxX: 15.6, minZ: -15.6, maxZ: -14.4 },
        { minX: -15.6, maxX: -14.4, minZ: 9.4, maxZ: 10.6 },
        { minX: 14.4, maxX: 15.6, minZ: 9.4, maxZ: 10.6 }
    ],
    backstage: [
        // Large crates left
        { minX: -19.5, maxX: -16.5, minZ: -16.5, maxZ: -13.5 },
        { minX: -19.25, maxX: -16.75, minZ: -9.25, maxZ: -6.75 },
        { minX: -23, maxX: -21, minZ: -13, maxZ: -11 },
        { minX: -21, maxX: -19, minZ: 3.5, maxZ: 6.5 },
        { minX: -17.25, maxX: -14.75, minZ: 7, maxZ: 9 },
        // Large crates right
        { minX: 16.5, maxX: 19.5, minZ: -16.5, maxZ: -13.5 },
        { minX: 16.75, maxX: 19.25, minZ: -9.25, maxZ: -6.75 },
        { minX: 21, maxX: 23, minZ: -13, maxZ: -11 },
        { minX: 19, maxX: 21, minZ: 3.5, maxZ: 6.5 },
        { minX: 14.75, maxX: 17.25, minZ: 7, maxZ: 9 },
        // Equipment racks
        { minX: -7, maxX: -5, minZ: -10.6, maxZ: -9.4 },
        { minX: 5, maxX: 7, minZ: -10.6, maxZ: -9.4 },
        // Center crate
        { minX: -2, maxX: 2, minZ: -19, maxZ: -17 },
        // Workbenches
        { minX: -10.5, maxX: -5.5, minZ: 17.25, maxZ: 18.75 },
        { minX: 5.5, maxX: 10.5, minZ: 17.25, maxZ: 18.75 },
        // Tool cabinets
        { minX: -16, maxX: -14, minZ: 21.5, maxZ: 22.5 },
        { minX: 14, maxX: 16, minZ: 21.5, maxZ: 22.5 },
        // Forklift
        { minX: -1, maxX: 1, minZ: 6.5, maxZ: 10.5 },
        // Pillars
        { minX: -12.7, maxX: -11.3, minZ: -18.7, maxZ: -17.3 },
        { minX: 11.3, maxX: 12.7, minZ: -18.7, maxZ: -17.3 },
        { minX: -12.7, maxX: -11.3, minZ: 14.3, maxZ: 15.7 },
        { minX: 11.3, maxX: 12.7, minZ: 14.3, maxZ: 15.7 }
    ],
    kitchen: [
        // Main prep counter
        { minX: -6, maxX: 6, minZ: -5.75, maxZ: -4.25 },
        // Stoves
        { minX: -13.4, maxX: -10.6, minZ: -21, maxZ: -19 },
        { minX: -5.4, maxX: -2.6, minZ: -21, maxZ: -19 },
        { minX: 2.6, maxX: 5.4, minZ: -21, maxZ: -19 },
        { minX: 10.6, maxX: 13.4, minZ: -21, maxZ: -19 },
        // Walk-in cooler
        { minX: -25, maxX: -19, minZ: -14, maxZ: -6 },
        // Shelves
        { minX: 21.1, maxX: 22.9, minZ: -15.7, maxZ: -14.3 },
        { minX: 21.1, maxX: 22.9, minZ: -5.7, maxZ: -4.3 },
        { minX: 21.1, maxX: 22.9, minZ: 4.3, maxZ: 5.7 },
        // Dishwashing counter
        { minX: 14, maxX: 22, minZ: 14, maxZ: 16 },
        // Serving counters
        { minX: -13, maxX: -3, minZ: 19.4, maxZ: 20.6 },
        { minX: 3, maxX: 13, minZ: 19.4, maxZ: 20.6 },
        // Island prep tables
        { minX: -14.5, maxX: -9.5, minZ: 6.5, maxZ: 9.5 },
        { minX: 9.5, maxX: 14.5, minZ: 6.5, maxZ: 9.5 },
        // Pillars
        { minX: -10.5, maxX: -9.5, minZ: -12.5, maxZ: -11.5 },
        { minX: 9.5, maxX: 10.5, minZ: -12.5, maxZ: -11.5 }
    ],
    party_room: [
        // Central pillar
        { minX: -1.2, maxX: 1.2, minZ: -1.2, maxZ: 1.2 },
        // Party tables (hexagonal pattern)
        { minX: -15.8, maxX: -12.2, minZ: -1.8, maxZ: 1.8 },
        { minX: 12.2, maxX: 15.8, minZ: -1.8, maxZ: 1.8 },
        { minX: -8.8, maxX: -5.2, minZ: -13.9, maxZ: -10.1 },
        { minX: 5.2, maxX: 8.8, minZ: -13.9, maxZ: -10.1 },
        { minX: -8.8, maxX: -5.2, minZ: 10.1, maxZ: 13.9 },
        { minX: 5.2, maxX: 8.8, minZ: 10.1, maxZ: 13.9 },
        // Gift piles
        { minX: -18.8, maxX: -17.2, minZ: -10.8, maxZ: -9.2 },
        { minX: 17.2, maxX: 18.8, minZ: -10.8, maxZ: -9.2 },
        { minX: -18.8, maxX: -17.2, minZ: 9.2, maxZ: 10.8 },
        { minX: 17.2, maxX: 18.8, minZ: 9.2, maxZ: 10.8 },
        // Stage
        { minX: -8, maxX: 8, minZ: -26.5, maxZ: -21.5 },
        // Cake table
        { minX: -2.2, maxX: 2.2, minZ: 18.8, maxZ: 21.2 },
        // Pillars
        { minX: -20.8, maxX: -19.2, minZ: -15.8, maxZ: -14.2 },
        { minX: 19.2, maxX: 20.8, minZ: -15.8, maxZ: -14.2 },
        { minX: -20.8, maxX: -19.2, minZ: 14.2, maxZ: 15.8 },
        { minX: 19.2, maxX: 20.8, minZ: 14.2, maxZ: 15.8 }
    ]
};

// Current active map for pathfinding
let currentServerMapId = 'dining_hall';

// Function to switch server map obstacles
function setServerMap(mapId) {
    if (MAP_OBSTACLES[mapId]) {
        currentServerMapId = mapId;
        NavGrid.buildFromObstacles(MAP_OBSTACLES[mapId]);
        Pathfinder.clearCache();
        log(`Server NavGrid rebuilt for map: ${mapId}`, 'INFO');
    }
}

// Initialize NavGrid with first map
NavGrid.init();
NavGrid.buildFromObstacles(MAP_OBSTACLES.dining_hall);

// ==================== MULTI-LOBBY SYSTEM ====================
const gameRooms = new Map(); // roomId -> GameRoom
const playerRooms = new Map(); // playerId -> roomId

// Map configuration - which map for which waves
const WAVE_MAP_CONFIG = [
    { waves: [1, 2], mapId: 'dining_hall' },
    { waves: [3, 4], mapId: 'arcade_zone' },
    { waves: [5, 6], mapId: 'backstage' },
    { waves: [7, 8], mapId: 'kitchen' },
    { waves: [9, 10, 11, 12], mapId: 'party_room' }
];

function getMapForWave(wave) {
    for (const config of WAVE_MAP_CONFIG) {
        if (config.waves.includes(wave)) {
            return config.mapId;
        }
    }
    // Default to party room for high waves
    return 'party_room';
}

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
        gameLoopInterval: null,
        currentMapId: 'dining_hall',  // Track current map
        bossMode: false               // Track boss mode state
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
        baseMaxZombies: 20,        // Base max zombies alive
        maxZombiesPerWave: 5,      // Additional zombies per wave
        absoluteMaxZombies: 100,   // Hard cap for performance
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
    // Server-authoritative weapon damage (must match client WEAPONS config)
    weapons: {
        pistol: { damage: 20, headshotMultiplier: 2 },
        smg: { damage: 15, headshotMultiplier: 2 },
        shotgun: { damage: 12, pellets: 8, headshotMultiplier: 1.5 },  // 12 per pellet
        rocketLauncher: { damage: 250, splashDamage: 150, headshotMultiplier: 1 },
        laserGun: { damage: 25, headshotMultiplier: 1.5 }
    },
    tickRate: 10 // Server updates per second (reduced from 20 for less lag)
};

// Valid weapon names for validation
const VALID_WEAPONS = Object.keys(CONFIG.weapons);

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
        currentWeapon: 'pistol',  // Track current weapon for server-side damage calc
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
        // Use try-finally to ensure cleanup happens even if stopGameInRoom fails
        if (room.players.size === 0) {
            try {
                stopGameInRoom(room);
            } catch (e) {
                log(`Error stopping game in room ${room.id}: ${e.message}`, 'ERROR');
            } finally {
                cleanupEmptyRooms();
            }
        }
    }
}

// ==================== ZOMBIE MANAGEMENT ====================

// Calculate max zombies allowed based on current wave
function getMaxZombiesForWave(wave) {
    const scaled = CONFIG.waves.baseMaxZombies + (wave * CONFIG.waves.maxZombiesPerWave);
    return Math.min(scaled, CONFIG.waves.absoluteMaxZombies);
}

function spawnZombie() {
    if (!GameState.isRunning) return;

    const currentWave = GameState.wave || 1;
    const maxZombies = getMaxZombiesForWave(currentWave);
    const aliveZombies = Array.from(GameState.zombies.values()).filter(z => z.isAlive);
    if (aliveZombies.length >= maxZombies) {
        log(`Max zombies alive (${maxZombies} for wave ${currentWave}), waiting...`, 'WARN');
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

function updateZombies(room = null) {
    // Use passed room or fall back to GameState proxy for legacy compatibility
    const state = room || GameState;
    if (!state.isRunning || state.players.size === 0) return;

    const now = Date.now();
    const delta = 1 / CONFIG.tickRate;

    // Use cached alive players to avoid filtering every tick
    const players = room ? EntityCache.getAlivePlayers(room) :
        Array.from(state.players.values()).filter(p => p.isAlive);

    if (players.length === 0) return;

    // Rebuild spatial grid with alive players once per tick (O(m))
    // This enables O(1) lookups per zombie instead of O(m)
    playerSpatialGrid.rebuild(players);

    state.zombies.forEach((zombie, id) => {
        if (!zombie.isAlive) return;

        // Find closest player using spatial grid (O(1) average case)
        const { entity: closestPlayer, distance } = playerSpatialGrid.findClosest(
            zombie.position.x,
            zombie.position.z
        );

        if (!closestPlayer) return;

        zombie.targetPlayerId = closestPlayer.id;

        // Calculate direction to player
        const dx = closestPlayer.position.x - zombie.position.x;
        const dz = closestPlayer.position.z - zombie.position.z;

        // Attack if close enough
        if (distance <= CONFIG.zombie.attackRange) {
            zombie.isAttacking = true;
            // Face player directly when attacking
            zombie.rotation = Math.atan2(dx, dz);

            if (now - zombie.lastAttack > CONFIG.zombie.attackCooldown) {
                zombie.lastAttack = now;
                damagePlayer(closestPlayer.id, zombie.damage);

                broadcast({
                    type: 'zombieAttack',
                    zombieId: zombie.id,
                    targetId: closestPlayer.id
                });
            }
            return;
        }

        zombie.isAttacking = false;

        // Initialize path data if needed
        if (!zombie.path) {
            zombie.path = null;
            zombie.pathIndex = 0;
            zombie.lastPathUpdate = 0;
            zombie.lastTargetPos = null;
        }

        // Initialize stuck detection data
        if (!zombie.stuckData) {
            zombie.stuckData = {
                lastPos: { x: zombie.position.x, z: zombie.position.z },
                lastMoveTime: now,
                stuckCount: 0
            };
        }

        // Check if zombie is stuck (hasn't moved significantly in 3 seconds)
        const stuckDx = zombie.position.x - zombie.stuckData.lastPos.x;
        const stuckDz = zombie.position.z - zombie.stuckData.lastPos.z;
        const stuckMoveDist = Math.sqrt(stuckDx * stuckDx + stuckDz * stuckDz);

        if (stuckMoveDist > 0.5) {
            // Zombie moved, update last position
            zombie.stuckData.lastPos = { x: zombie.position.x, z: zombie.position.z };
            zombie.stuckData.lastMoveTime = now;
            zombie.stuckData.stuckCount = 0;
        } else if (now - zombie.stuckData.lastMoveTime > 3000) {
            // Zombie stuck for 3 seconds - respawn at spawn point
            zombie.stuckData.stuckCount++;

            if (zombie.stuckData.stuckCount >= 2) {
                // Really stuck - respawn at random spawn location
                const arenaSize = 25;
                const side = Math.floor(Math.random() * 4);
                let newPos = { x: 0, z: 0 };

                switch (side) {
                    case 0: newPos = { x: (Math.random() - 0.5) * arenaSize, z: -arenaSize }; break;
                    case 1: newPos = { x: (Math.random() - 0.5) * arenaSize, z: arenaSize }; break;
                    case 2: newPos = { x: -arenaSize, z: (Math.random() - 0.5) * arenaSize }; break;
                    case 3: newPos = { x: arenaSize, z: (Math.random() - 0.5) * arenaSize }; break;
                }

                zombie.position.x = newPos.x;
                zombie.position.z = newPos.z;
                zombie.path = null;
                zombie.stuckData.lastPos = { x: newPos.x, z: newPos.z };
                zombie.stuckData.lastMoveTime = now;
                zombie.stuckData.stuckCount = 0;

                log(`Zombie ${id} was stuck - respawned at (${newPos.x.toFixed(1)}, ${newPos.z.toFixed(1)})`, 'WARN');
            } else {
                // First stuck detection - clear path and try again
                zombie.path = null;
                zombie.stuckData.lastMoveTime = now;
            }
        }

        // Check if we need to recalculate path
        const pathAge = now - zombie.lastPathUpdate;
        const targetMoved = zombie.lastTargetPos &&
            (Math.abs(closestPlayer.position.x - zombie.lastTargetPos.x) > 3 ||
             Math.abs(closestPlayer.position.z - zombie.lastTargetPos.z) > 3);

        if (!zombie.path || pathAge > 500 || targetMoved || zombie.pathIndex >= zombie.path.length) {
            // Calculate new path
            const newPath = Pathfinder.findPath(
                zombie.position.x, zombie.position.z,
                closestPlayer.position.x, closestPlayer.position.z
            );

            if (newPath && newPath.length > 1) {
                zombie.path = newPath;
                zombie.pathIndex = 1; // Skip first waypoint (current position)
                zombie.lastPathUpdate = now;
                zombie.lastTargetPos = { x: closestPlayer.position.x, z: closestPlayer.position.z };
            } else {
                // No path found - try direct movement as fallback
                zombie.path = null;
            }
        }

        // Move along path or directly
        let targetX, targetZ;

        if (zombie.path && zombie.pathIndex < zombie.path.length) {
            const waypoint = zombie.path[zombie.pathIndex];
            targetX = waypoint.x;
            targetZ = waypoint.z;

            // Check if reached waypoint
            const wpDx = targetX - zombie.position.x;
            const wpDz = targetZ - zombie.position.z;
            const wpDist = Math.sqrt(wpDx * wpDx + wpDz * wpDz);

            if (wpDist < 1.0) {
                zombie.pathIndex++;
                if (zombie.pathIndex < zombie.path.length) {
                    targetX = zombie.path[zombie.pathIndex].x;
                    targetZ = zombie.path[zombie.pathIndex].z;
                }
            }
        } else {
            // Direct fallback (when no path available)
            targetX = closestPlayer.position.x;
            targetZ = closestPlayer.position.z;
        }

        // Move towards target
        const moveDx = targetX - zombie.position.x;
        const moveDz = targetZ - zombie.position.z;
        const moveDist = Math.sqrt(moveDx * moveDx + moveDz * moveDz);

        if (moveDist > 0.1) {
            // Face movement direction
            zombie.rotation = Math.atan2(moveDx, moveDz);

            // Move
            const moveX = (moveDx / moveDist) * zombie.speed * delta;
            const moveZ = (moveDz / moveDist) * zombie.speed * delta;
            zombie.position.x += moveX;
            zombie.position.z += moveZ;
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

    // Track kill in player's authenticated session (server-side verification)
    addKillToSession(killerId, points, isHeadshot);

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

    // Update all player sessions with current wave
    GameState.players.forEach((player, playerId) => {
        const session = getSessionByPlayerId(playerId);
        if (session) {
            session.wave = GameState.wave;
            session.isInGame = true;
        }
    });

    // Check if map needs to change
    const targetMapId = getMapForWave(GameState.wave);
    const mapChanged = targetMapId !== GameState.currentMapId;
    if (mapChanged) {
        GameState.currentMapId = targetMapId;
        setServerMap(targetMapId);  // Rebuild pathfinding for new map
        log(`Map changed to ${targetMapId} for wave ${GameState.wave}`, 'GAME');
    }

    // Check if this is a boss wave (every 5th wave starting at 5)
    const isBossWave = GameState.wave >= 5 && GameState.wave % 5 === 0;
    if (isBossWave) {
        GameState.bossMode = true;
    }

    log(`Starting Wave ${GameState.wave} with ${zombieCount} zombies`, 'GAME');

    broadcast({
        type: 'waveStart',
        wave: GameState.wave,
        zombieCount: zombieCount,
        mapId: GameState.currentMapId,
        mapChanged: mapChanged,
        bossMode: GameState.bossMode
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
    // Deactivate boss mode when wave completes
    if (GameState.bossMode) {
        GameState.bossMode = false;
    }

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
    if (!room || !room.players) return;
    const data = JSON.stringify(message);
    // Create a snapshot of players to avoid race conditions during iteration
    const playerSnapshot = Array.from(room.players.entries());
    playerSnapshot.forEach(([id, player]) => {
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
wss.on('connection', (ws, request) => {
    const ip = getClientIP(request);
    const playerId = uuidv4();

    // Track this connection
    trackIPConnection(ip, ws);
    ws._clientIP = ip;  // Store IP for later reference
    ws._playerId = playerId;
    ws._messageViolations = 0;  // Track rate limit violations

    // Create authenticated game session
    const session = createGameSession(playerId);
    ws._sessionToken = session.token;

    const player = createPlayer(ws, playerId);
    const room = getPlayerRoom(playerId);

    log(`New WebSocket connection from player ${playerId} (IP: ${ip}) in room ${room ? room.id : 'unknown'}`, 'INFO');

    // Send initial lobby/game state to new player
    const initMessage = {
        type: 'init',
        playerId: playerId,
        sessionToken: session.token,  // Client needs this for leaderboard submission
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
        // Check message rate limit
        if (!checkMessageRate(playerId)) {
            ws._messageViolations++;
            if (ws._messageViolations >= 3) {
                // Too many violations, ban the IP
                banIP(ws._clientIP, 'Message rate limit exceeded repeatedly');
                ws.close(1008, 'Rate limit exceeded');
                return;
            }
            // Skip processing this message but don't disconnect yet
            return;
        }

        try {
            const message = JSON.parse(data);
            handleMessage(playerId, message);
        } catch (e) {
            log(`Error parsing message from ${playerId}: ${e.message}`, 'ERROR');
        }
    });

    ws.on('close', () => {
        // Untrack this connection
        untrackIPConnection(ws._clientIP, ws);
        clientMessageRates.delete(playerId);
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

function isValidDirection(dir) {
    if (!dir || typeof dir !== 'object') return false;
    // Direction vectors should be normalized (length ~1), allow -2 to 2 range
    return isValidNumber(dir.x, -2, 2) &&
           isValidNumber(dir.y, -2, 2) &&
           isValidNumber(dir.z, -2, 2);
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
            if (!isValidPosition(message.origin) || !isValidDirection(message.direction)) break;

            broadcastToRoom(room, {
                type: 'playerShoot',
                playerId: playerId,
                origin: message.origin,
                direction: message.direction
            }, playerId);

            // Calculate damage server-side based on player's current weapon
            if (message.hitZombieId && typeof message.hitZombieId === 'string') {
                const currentWeapon = player.currentWeapon || 'pistol';
                const weaponConfig = CONFIG.weapons[currentWeapon];
                if (weaponConfig) {
                    let damage = weaponConfig.damage;
                    const isHeadshot = !!message.isHeadshot;

                    // Apply headshot multiplier
                    if (isHeadshot && weaponConfig.headshotMultiplier) {
                        damage *= weaponConfig.headshotMultiplier;
                    }

                    damageZombie(message.hitZombieId, damage, playerId, isHeadshot);
                }
            }
            break;

        case 'weaponSwitch':
            // Track player's current weapon for server-side damage calculation
            if (message.weapon && VALID_WEAPONS.includes(message.weapon)) {
                player.currentWeapon = message.weapon;
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

// ==================== BINARY PROTOCOL ====================
// Message types for binary encoding
const BinaryMsgType = {
    SYNC: 1,
    ZOMBIE_SPAWN: 2,
    ZOMBIE_KILL: 3,
    PLAYER_POS: 4
};

// ==================== INTEREST MANAGEMENT ====================
// Distance-based filtering to reduce bandwidth for distant entities
const INTEREST_CONFIG = {
    zombieViewDistance: 40,     // Only send zombie updates within this distance
    alwaysIncludeTargeting: true // Always include zombies targeting this player
};

// Filter zombies relevant to a specific player
function getRelevantZombies(zombieMap, playerPosition, playerId) {
    const relevant = [];
    const viewDistSq = INTEREST_CONFIG.zombieViewDistance * INTEREST_CONFIG.zombieViewDistance;

    zombieMap.forEach(zombie => {
        if (!zombie.isAlive) return;

        // Always include zombies targeting this player
        if (INTEREST_CONFIG.alwaysIncludeTargeting && zombie.targetPlayerId === playerId) {
            relevant.push(zombie);
            return;
        }

        // Distance check
        const dx = zombie.position.x - playerPosition.x;
        const dz = zombie.position.z - playerPosition.z;
        const distSq = dx * dx + dz * dz;

        if (distSq <= viewDistSq) {
            relevant.push(zombie);
        }
    });

    return relevant;
}

// Binary encoder for high-frequency messages (~60% bandwidth reduction)
const BinaryProtocol = {
    // Encode sync message to binary from zombie array (for interest management)
    encodeSyncFromArray(zombieArray, gameState) {
        // Calculate buffer size: header(5) + gameState(16) + zombies(20 each)
        const bufferSize = 5 + 16 + (zombieArray.length * 20);
        const buffer = Buffer.alloc(bufferSize);
        let offset = 0;

        // Header: type(1) + zombie count(2) + reserved(2)
        buffer.writeUInt8(BinaryMsgType.SYNC, offset); offset += 1;
        buffer.writeUInt16LE(zombieArray.length, offset); offset += 2;
        buffer.writeUInt16LE(0, offset); offset += 2; // reserved

        // Game state: wave(2) + remaining(2) + kills(4) + score(4) + reserved(4)
        buffer.writeUInt16LE(gameState.wave || 0, offset); offset += 2;
        buffer.writeUInt16LE(gameState.zombiesRemaining || 0, offset); offset += 2;
        buffer.writeUInt32LE(gameState.totalKills || 0, offset); offset += 4;
        buffer.writeUInt32LE(gameState.totalScore || 0, offset); offset += 4;
        buffer.writeUInt32LE(0, offset); offset += 4; // reserved

        // Zombies: each 20 bytes
        zombieArray.forEach((zombie, idx) => {
            // ID as index (2 bytes) - client maps by received order
            buffer.writeUInt16LE(idx, offset); offset += 2;
            // Type encoded (1 byte): 0=normal, 1=runner, 2=tank, 3=boss
            const typeCode = { normal: 0, runner: 1, tank: 2, boss: 3 }[zombie.type] || 0;
            buffer.writeUInt8(typeCode, offset); offset += 1;
            // Alive flag (1 byte)
            buffer.writeUInt8(zombie.isAlive ? 1 : 0, offset); offset += 1;
            // Position x, z as floats (8 bytes)
            buffer.writeFloatLE(zombie.position?.x || 0, offset); offset += 4;
            buffer.writeFloatLE(zombie.position?.z || 0, offset); offset += 4;
            // Rotation (4 bytes)
            buffer.writeFloatLE(zombie.rotation || 0, offset); offset += 4;
            // Health (2 bytes)
            buffer.writeUInt16LE(Math.max(0, Math.min(65535, zombie.health || 0)), offset); offset += 2;
        });

        return buffer;
    },

    // Legacy: Encode sync message to binary (sends all zombies)
    encodeSync(zombies, gameState) {
        return this.encodeSyncFromArray(Array.from(zombies.values()), gameState);
    }
};

// Binary broadcast for sync messages
function broadcastBinaryToRoom(room, buffer) {
    if (!room) return;
    room.players.forEach((player, id) => {
        if (player.ws && player.ws.readyState === WebSocket.OPEN) {
            try {
                player.ws.send(buffer);
            } catch (e) {
                log(`Binary WebSocket send error to ${id}: ${e.message}`, 'ERROR');
            }
        }
    });
}

// ==================== GAME LOOP ====================
setInterval(() => {
    // Process all active game rooms
    gameRooms.forEach((room, roomId) => {
        if (room.isRunning && !room.isPaused) {
            // Reset entity cache for this tick
            EntityCache.beginTick();

            // For legacy compatibility, set the current room for global functions
            updateZombies(room);

            // Game state shared by all players
            const gameState = {
                wave: room.wave,
                zombiesRemaining: room.zombiesRemaining,
                totalKills: room.totalKills,
                totalScore: room.totalScore
            };

            // Send personalized sync to each player (interest management)
            room.players.forEach((player, playerId) => {
                if (!player.ws || player.ws.readyState !== WebSocket.OPEN) return;
                if (!player.isAlive || !player.position) return;

                // Filter zombies relevant to this player
                const relevantZombies = getRelevantZombies(
                    room.zombies,
                    player.position,
                    playerId
                );

                // Encode and send personalized update
                const binaryData = BinaryProtocol.encodeSyncFromArray(relevantZombies, gameState);
                try {
                    player.ws.send(binaryData);
                } catch (e) {
                    log(`Binary WebSocket send error to ${playerId}: ${e.message}`, 'ERROR');
                }
            });
        }
    });
}, 1000 / CONFIG.tickRate);

// ==================== START SERVER ====================
mainServer.listen(PORT, '0.0.0.0', () => {
    log(`========================================`, 'SUCCESS');
    log(`ASPEN'S PLAYGROUND - Multiplayer Server`, 'SUCCESS');
    log(`========================================`, 'SUCCESS');
    log(`Server running on port ${PORT}`, 'SUCCESS');
    log(`Domain: ${DOMAIN}`, 'INFO');
    log(``, 'INFO');
    if (sslCerts) {
        if (usingTrustedCerts) {
            log(`SSL: Using TRUSTED certificates (Let's Encrypt)`, 'SUCCESS');
            log(``, 'INFO');
            log(`Public:  https://${DOMAIN}`, 'SUCCESS');
        } else {
            log(`SSL: Using SELF-SIGNED certificates (development only)`, 'WARN');
            log(``, 'INFO');
            log(`Local:   https://localhost:${PORT}`, 'INFO');
            log(`         (Accept the certificate warning in browser)`, 'WARN');
        }
    } else {
        log(`SSL: Disabled (HTTP only)`, 'WARN');
        log(``, 'INFO');
        log(`Local:   http://localhost:${PORT}`, 'INFO');
    }
    log(``, 'INFO');
    log(`Waiting for players to connect...`, 'INFO');
});
