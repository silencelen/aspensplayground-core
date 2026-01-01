// ============================================
// ASPEN'S PLAYGROUND - Multiplayer Zombie Shooter
// Haunted Chuck E. Cheese Theme
// ============================================
// Note: CONFIG, DebugLog, and utility objects are loaded from modules/

// ==================== DEV SETTINGS ====================
const DevSettings = {
    godMode: false,      // When true, player takes no damage in singleplayer
    infiniteAmmo: false  // When true, ammo and grenades are not consumed
};

// ==================== STATIC VECTOR3 CONSTANTS ====================
// Reusable Vector3 objects to reduce garbage collection pressure
const Vec3 = {
    UP: null,      // (0, 1, 0) - initialized after THREE.js loads
    RIGHT: null,   // (1, 0, 0)
    FORWARD: null, // (0, 0, 1)
    temp: null,    // Temporary vector for calculations
    temp2: null,   // Second temporary vector

    init() {
        this.UP = new THREE.Vector3(0, 1, 0);
        this.RIGHT = new THREE.Vector3(1, 0, 0);
        this.FORWARD = new THREE.Vector3(0, 0, 1);
        this.temp = new THREE.Vector3();
        this.temp2 = new THREE.Vector3();
    }
};

// Collision objects for camera bounds
const collisionObjects = [];

// Destructible environment objects
const destructibleObjects = [];

// ==================== PROCEDURAL MAP GENERATION ====================
// ==================== MAP LAYOUT ====================
// Fixed, organized map layout for better zombie pathfinding
const ProceduralMap = {
    currentLayout: 'standard',

    init(seed = Date.now()) {
        // No longer random - use fixed layout
        this.currentLayout = 'standard';
    },

    // Fixed table positions - organized in 2 rows with clear pathways
    getTablePositions() {
        return [
            // Row 1 (z=6) - 3 tables with gaps
            { x: -8, z: 6 },
            { x: 0, z: 6 },
            { x: 8, z: 6 },
            // Row 2 (z=14) - 3 tables with gaps
            { x: -8, z: 14 },
            { x: 0, z: 14 },
            { x: 8, z: 14 }
        ];
    },

    // Fixed destructible prop positions - strategic cover spots
    getDestructiblePropPositions() {
        return {
            barrels: [
                // Near play structure
                { x: -14, z: -12 },
                // Near kitchen
                { x: 12, z: 10 },
                // Near skeeball
                { x: -10, z: -14 },
                // Center area cover
                { x: -4, z: 0 },
                { x: 4, z: 0 }
            ],
            crates: [
                // Near stage corners
                { x: -10, z: -18 },
                { x: 10, z: -18 },
                // Near waiting area
                { x: -6, z: 20 },
                { x: 6, z: 20 }
            ]
        };
    },

    // Fixed barricade positions - no random placement
    getBarricadePositions() {
        return [
            // Cover near center - player defensive positions
            { x: -5, z: -5, rotation: 0, length: 2 },
            { x: 5, z: -5, rotation: 0, length: 2 }
        ];
    }
};

// ==================== AUTO-QUALITY DETECTION ====================
function detectOptimalQuality() {
    let score = 0;
    const factors = [];

    // Check device memory (in GB)
    const memory = navigator.deviceMemory || 4; // Default to 4GB if not available
    if (memory >= 8) {
        score += 3;
        factors.push('High memory: ' + memory + 'GB');
    } else if (memory >= 4) {
        score += 2;
        factors.push('Medium memory: ' + memory + 'GB');
    } else {
        score += 1;
        factors.push('Low memory: ' + memory + 'GB');
    }

    // Check CPU cores
    const cores = navigator.hardwareConcurrency || 4;
    if (cores >= 8) {
        score += 3;
        factors.push('High CPU cores: ' + cores);
    } else if (cores >= 4) {
        score += 2;
        factors.push('Medium CPU cores: ' + cores);
    } else {
        score += 1;
        factors.push('Low CPU cores: ' + cores);
    }

    // Check screen resolution (higher = more GPU work needed)
    const pixels = window.screen.width * window.screen.height * (window.devicePixelRatio || 1);
    if (pixels > 4000000) { // > 4MP (e.g., 4K displays)
        score -= 1; // Penalize high-res displays
        factors.push('High resolution display');
    }

    // Check GPU via WebGL
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (gl) {
            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            if (debugInfo) {
                const gpuRenderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL).toLowerCase();

                // Check for integrated/low-end GPUs
                const lowEndGPUs = ['intel', 'mesa', 'swiftshader', 'llvmpipe', 'mali-4', 'adreno 3', 'adreno 4', 'powervr'];
                const midRangeGPUs = ['mali-g', 'adreno 5', 'adreno 6', 'geforce mx', 'radeon vega', 'intel iris'];
                const highEndGPUs = ['geforce rtx', 'geforce gtx', 'radeon rx', 'apple m1', 'apple m2', 'apple m3'];

                if (highEndGPUs.some(gpu => gpuRenderer.includes(gpu))) {
                    score += 3;
                    factors.push('High-end GPU detected');
                } else if (midRangeGPUs.some(gpu => gpuRenderer.includes(gpu))) {
                    score += 2;
                    factors.push('Mid-range GPU detected');
                } else if (lowEndGPUs.some(gpu => gpuRenderer.includes(gpu))) {
                    score += 1;
                    factors.push('Low-end GPU detected');
                } else {
                    score += 2; // Unknown GPU, assume mid-range
                    factors.push('Unknown GPU: ' + gpuRenderer.substring(0, 30));
                }
            } else {
                score += 2; // Can't detect GPU, assume mid-range
            }
        }
    } catch (e) {
        score += 2; // WebGL check failed, assume mid-range
    }

    // Mobile devices get penalized (thermal throttling, battery concerns)
    if (isMobile) {
        score -= 2;
        factors.push('Mobile device detected');
    }

    // Determine quality level based on score
    // Score range: 1-9 (3 categories * 1-3 points each, minus penalties)
    let quality;
    if (score >= 7) {
        quality = 'high';
    } else if (score >= 4) {
        quality = 'medium';
    } else {
        quality = 'low';
    }

    DebugLog.log('Auto-detected quality: ' + quality + ' (score: ' + score + ')', 'info');
    factors.forEach(f => DebugLog.log('  - ' + f, 'info'));

    return quality;
}

// ==================== WEBGL DETECTION ====================
function isWebGLAvailable() {
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        return !!(gl && gl instanceof WebGLRenderingContext);
    } catch (e) {
        return false;
    }
}

function showWebGLError() {
    const overlay = document.getElementById('webgl-error-overlay');
    if (overlay) {
        overlay.style.display = 'flex';
    }
    // Hide loading screen
    const loading = document.getElementById('loading-screen');
    if (loading) {
        loading.style.display = 'none';
    }
    DebugLog.log('WebGL not available - showing error overlay', 'error');
}

// ==================== USER SETTINGS ==
const DEFAULT_SETTINGS = {
    mouseSensitivity: 1.0,    // Multiplier (0.25 - 2.0)
    masterVolume: 0.7,        // 0 - 1
    sfxVolume: 1.0,           // 0 - 1
    musicVolume: 0.5,         // 0 - 1
    graphicsQuality: 'high',  // 'low', 'medium', 'high'
    showFPS: false,
    screenShake: true,
    fieldOfView: 75           // 60 - 110
};

let userSettings = { ...DEFAULT_SETTINGS };

function loadSettings() {
    try {
        const saved = localStorage.getItem('gameSettings');
        if (saved) {
            const parsed = JSON.parse(saved);
            userSettings = { ...DEFAULT_SETTINGS, ...parsed };
            DebugLog.log('Settings loaded from localStorage', 'info');
        } else {
            // First time user - auto-detect optimal quality
            userSettings = { ...DEFAULT_SETTINGS };
            userSettings.graphicsQuality = detectOptimalQuality();
            // Save the auto-detected settings
            saveSettings();
            DebugLog.log('First run: auto-detected graphics quality', 'info');
        }
    } catch (e) {
        DebugLog.log('Failed to load settings (corrupted data), using defaults', 'warn');
        userSettings = { ...DEFAULT_SETTINGS };
        // Clear corrupted data and save fresh defaults
        try {
            localStorage.removeItem('gameSettings');
            saveSettings();
        } catch (clearErr) {
            // localStorage might be full or unavailable
        }
    }
    applySettings();
}

function saveSettings() {
    try {
        localStorage.setItem('gameSettings', JSON.stringify(userSettings));
        DebugLog.log('Settings saved', 'success');
    } catch (e) {
        DebugLog.log('Failed to save settings', 'error');
    }
}

function applySettings() {
    // Apply mouse sensitivity
    CONFIG.player.mouseSensitivity = 0.002 * userSettings.mouseSensitivity;

    // Apply graphics quality
    if (renderer) {
        switch (userSettings.graphicsQuality) {
            case 'low':
                renderer.setPixelRatio(0.75);
                renderer.shadowMap.enabled = false;
                break;
            case 'medium':
                renderer.setPixelRatio(1);
                renderer.shadowMap.enabled = true;
                renderer.shadowMap.type = THREE.BasicShadowMap;
                break;
            case 'high':
                renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
                renderer.shadowMap.enabled = true;
                renderer.shadowMap.type = THREE.PCFSoftShadowMap;
                break;
        }
    }

    // Apply FOV
    if (camera) {
        camera.fov = userSettings.fieldOfView;
        camera.updateProjectionMatrix();
    }

    // Update FPS display
    const fpsDisplay = document.getElementById('fps-display');
    if (fpsDisplay) {
        fpsDisplay.style.display = userSettings.showFPS ? 'block' : 'none';
    }
}

// Debounced version for slider input events (prevents excessive updates)
let applySettingsTimeout = null;
function applySettingsDebounced() {
    if (applySettingsTimeout) clearTimeout(applySettingsTimeout);
    applySettingsTimeout = setTimeout(() => {
        applySettings();
        applySettingsTimeout = null;
    }, 50); // 50ms debounce
}

function resetSettings() {
    userSettings = { ...DEFAULT_SETTINGS };
    saveSettings();
    applySettings();
    updateSettingsUI();
}

function updateSettingsUI() {
    // Update sliders and checkboxes to match current settings
    const sensitivitySlider = document.getElementById('sensitivity-slider');
    const masterVolumeSlider = document.getElementById('master-volume-slider');
    const sfxVolumeSlider = document.getElementById('sfx-volume-slider');
    const musicVolumeSlider = document.getElementById('music-volume-slider');
    const fovSlider = document.getElementById('fov-slider');
    const graphicsSelect = document.getElementById('graphics-select');
    const fpsCheckbox = document.getElementById('fps-checkbox');
    const shakeCheckbox = document.getElementById('shake-checkbox');

    if (sensitivitySlider) {
        sensitivitySlider.value = userSettings.mouseSensitivity;
        const sensitivityValue = document.getElementById('sensitivity-value');
        if (sensitivityValue) sensitivityValue.textContent = userSettings.mouseSensitivity.toFixed(2);
    }
    if (masterVolumeSlider) {
        masterVolumeSlider.value = userSettings.masterVolume;
        const masterVolumeValue = document.getElementById('master-volume-value');
        if (masterVolumeValue) masterVolumeValue.textContent = Math.round(userSettings.masterVolume * 100) + '%';
    }
    if (sfxVolumeSlider) {
        sfxVolumeSlider.value = userSettings.sfxVolume;
        const sfxVolumeValue = document.getElementById('sfx-volume-value');
        if (sfxVolumeValue) sfxVolumeValue.textContent = Math.round(userSettings.sfxVolume * 100) + '%';
    }
    if (musicVolumeSlider) {
        musicVolumeSlider.value = userSettings.musicVolume;
        const musicVolumeValue = document.getElementById('music-volume-value');
        if (musicVolumeValue) musicVolumeValue.textContent = Math.round(userSettings.musicVolume * 100) + '%';
    }
    if (fovSlider) {
        fovSlider.value = userSettings.fieldOfView;
        const fovValue = document.getElementById('fov-value');
        if (fovValue) fovValue.textContent = userSettings.fieldOfView + '°';
    }
    if (graphicsSelect) graphicsSelect.value = userSettings.graphicsQuality;
    if (fpsCheckbox) fpsCheckbox.checked = userSettings.showFPS;
    if (shakeCheckbox) shakeCheckbox.checked = userSettings.screenShake;
}

// ==================== MULTIPLAYER STATE ====================
let socket = null;
let localPlayerId = null;
let localPlayerData = null;
let sessionToken = null;  // Server-issued session token for authenticated actions
const remotePlayers = new Map();
const remotePlayerMeshes = new Map();

// Spectator mode state
const SpectatorMode = {
    isSpectating: false,
    spectatingPlayerId: null,
    spectatorCamera: null,

    // Get list of alive players to spectate
    getAlivePlayers() {
        const alive = [];
        remotePlayers.forEach((player, id) => {
            if (player.isAlive) {
                alive.push({ id, name: player.name });
            }
        });
        return alive;
    },

    // Enter spectator mode
    enter() {
        const alivePlayers = this.getAlivePlayers();
        if (alivePlayers.length === 0) {
            DebugLog.log('No players to spectate', 'warn');
            return false;
        }

        this.isSpectating = true;
        this.spectatingPlayerId = alivePlayers[0].id;

        // Detach camera from player and make it independent
        player.remove(camera);
        scene.add(camera);

        this.showSpectatorUI();
        DebugLog.log(`Now spectating: ${alivePlayers[0].name}`, 'info');
        return true;
    },

    // Exit spectator mode
    exit() {
        this.isSpectating = false;
        this.spectatingPlayerId = null;

        // Reattach camera to player
        scene.remove(camera);
        player.add(camera);
        camera.position.set(0, 0, 0);

        this.hideSpectatorUI();
    },

    // Cycle to next alive player
    cycleNext() {
        const alivePlayers = this.getAlivePlayers();
        if (alivePlayers.length === 0) return;

        const currentIndex = alivePlayers.findIndex(p => p.id === this.spectatingPlayerId);
        const nextIndex = (currentIndex + 1) % alivePlayers.length;
        this.spectatingPlayerId = alivePlayers[nextIndex].id;

        this.updateSpectatorUI();
        DebugLog.log(`Now spectating: ${alivePlayers[nextIndex].name}`, 'info');
    },

    // Cycle to previous alive player
    cyclePrev() {
        const alivePlayers = this.getAlivePlayers();
        if (alivePlayers.length === 0) return;

        const currentIndex = alivePlayers.findIndex(p => p.id === this.spectatingPlayerId);
        const prevIndex = (currentIndex - 1 + alivePlayers.length) % alivePlayers.length;
        this.spectatingPlayerId = alivePlayers[prevIndex].id;

        this.updateSpectatorUI();
        DebugLog.log(`Now spectating: ${alivePlayers[prevIndex].name}`, 'info');
    },

    // Update camera position to follow spectated player
    updateCamera() {
        if (!this.isSpectating || !this.spectatingPlayerId) return;

        const playerData = remotePlayers.get(this.spectatingPlayerId);
        const mesh = remotePlayerMeshes.get(this.spectatingPlayerId);

        if (!playerData || !mesh) {
            // Player no longer available, try to find another
            const alivePlayers = this.getAlivePlayers();
            if (alivePlayers.length > 0) {
                this.spectatingPlayerId = alivePlayers[0].id;
                this.updateSpectatorUI();
            } else {
                // No one left to spectate
                this.isSpectating = false;
            }
            return;
        }

        // Position camera exactly at the spectated player's eye position
        const targetPos = new THREE.Vector3(
            mesh.position.x,
            CONFIG.player.height, // Eye height
            mesh.position.z
        );

        // Instant position update for first-person feel
        camera.position.copy(targetPos);

        // Match player rotation exactly for first-person view
        if (playerData.rotation) {
            camera.rotation.order = 'YXZ';
            camera.rotation.y = playerData.rotation.y || 0;
            camera.rotation.x = playerData.rotation.x || 0;
            camera.rotation.z = 0;
        }
    },

    // Show spectator UI
    showSpectatorUI() {
        let ui = document.getElementById('spectator-ui');
        if (!ui) {
            ui = document.createElement('div');
            ui.id = 'spectator-ui';
            ui.style.cssText = `
                position: fixed;
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(0, 0, 0, 0.7);
                color: #fff;
                padding: 12px 30px;
                border-radius: 8px;
                font-family: 'Creepster', cursive;
                text-align: center;
                z-index: 1000;
                border: 2px solid #ff4444;
                pointer-events: none;
            `;
            document.body.appendChild(ui);
        }
        this.updateSpectatorUI();
        ui.style.display = 'block';
    },

    // Update spectator UI with current player name
    updateSpectatorUI() {
        const ui = document.getElementById('spectator-ui');
        if (!ui) return;

        const playerData = remotePlayers.get(this.spectatingPlayerId);
        const playerName = playerData ? playerData.name : 'Unknown';
        const alivePlayers = this.getAlivePlayers();

        ui.innerHTML = `
            <span style="color: #ff4444;">SPECTATING</span>
            <span style="color: #ffcc00; margin: 0 10px;">${playerName}</span>
            <span style="color: #888;">(${alivePlayers.length} alive)</span>
            <span style="color: #666; margin-left: 15px;">[Q/E] Switch</span>
        `;
    },

    // Hide spectator UI
    hideSpectatorUI() {
        const ui = document.getElementById('spectator-ui');
        if (ui) ui.style.display = 'none';
    }
};

// ==================== GAME STATE ====================
const GameState = {
    mode: null, // 'singleplayer' or 'multiplayer'
    isRunning: false,
    isPaused: false,
    isGameOver: false,
    isConnected: false,
    isInLobby: false,
    isReady: false,
    wave: 1,
    zombiesRemaining: 0,
    zombiesSpawned: 0,
    zombiesToSpawn: 0,
    zombiesPerWave: 5,
    totalKills: 0,
    totalScore: 0,
    spawnTimer: null,
    lastZombieId: 0,
    // Map loading state to prevent zombie spawn race conditions
    isMapLoading: false,
    pendingZombieSpawns: []
};

// Note: GameStats loaded from modules/utils.js

// Lobby state
const LobbyState = {
    players: new Map(),
    allReady: false
};

// ==================== OPTIMIZATION SYSTEMS ====================

// === OBJECT POOLING ===
const ZombiePool = {
    available: [],
    active: new Map(),
    maxSize: 30,

    init() {
        DebugLog.log(`Zombie pool initialized (max: ${this.maxSize})`, 'info');
    },

    acquire(zombieData) {
        let mesh;
        // Find a mesh of the same type to reuse (avoid visual mismatch)
        const sameTypeIndex = this.available.findIndex(m => m.userData.zombieType === zombieData.type);
        if (sameTypeIndex >= 0) {
            // Reuse mesh of same type
            mesh = this.available.splice(sameTypeIndex, 1)[0];
            this.resetMesh(mesh, zombieData);
            DebugLog.log(`Pool: Reused ${zombieData.type} mesh (${this.available.length} available)`, 'info');
        } else {
            // Create new mesh for this type
            mesh = createZombieMeshPooled(zombieData);
            DebugLog.log(`Pool: Created new ${zombieData.type} mesh`, 'info');
        }
        mesh.visible = true;
        scene.add(mesh);
        this.active.set(zombieData.id, mesh);
        return mesh;
    },

    release(zombieId) {
        const mesh = this.active.get(zombieId);
        if (mesh) {
            this.active.delete(zombieId);
            scene.remove(mesh);
            mesh.visible = false;
            // Reset transformations
            mesh.position.set(0, 0, 0);
            mesh.rotation.set(0, 0, 0);
            mesh.scale.set(1, 1, 1);
            // Reset opacity on all materials
            mesh.traverse(child => {
                if (child.material) {
                    child.material.opacity = 1;
                    child.material.transparent = false;
                }
            });
            if (this.available.length < this.maxSize) {
                this.available.push(mesh);
            }
        }
    },

    resetMesh(mesh, zombieData) {
        mesh.position.set(zombieData.position.x, 0, zombieData.position.z);
        mesh.rotation.set(0, zombieData.rotation || 0, 0);
        mesh.scale.setScalar(zombieData.scale || 1);
        mesh.visible = true;
        // Reset all materials to full opacity
        mesh.traverse(child => {
            if (child.material) {
                child.material.opacity = 1;
                child.material.transparent = false;
            }
        });
    },

    clear() {
        this.active.forEach((mesh, id) => {
            scene.remove(mesh);
        });
        this.active.clear();
        this.available = [];
    }
};

// Note: SpatialGrid, CollisionGrid, Interpolation, DeltaCompression loaded from modules/utils.js

// === OBSTACLE DATA FOR PATHFINDING ===
const obstacles = [];

// ==================== A* PATHFINDING SYSTEM ====================
const NavGrid = {
    cellSize: 1.0,        // Size of each grid cell in world units
    gridWidth: 0,
    gridHeight: 0,
    offsetX: 0,
    offsetZ: 0,
    grid: null,           // 2D array: 0 = walkable, 1 = blocked
    initialized: false,

    // Initialize the navigation grid based on arena size
    init() {
        const arenaSize = CONFIG.arena.width;
        this.gridWidth = Math.ceil(arenaSize / this.cellSize);
        this.gridHeight = Math.ceil(arenaSize / this.cellSize);
        this.offsetX = -arenaSize / 2;
        this.offsetZ = -arenaSize / 2;

        // Create empty grid (all walkable)
        this.grid = new Array(this.gridWidth);
        for (let x = 0; x < this.gridWidth; x++) {
            this.grid[x] = new Array(this.gridHeight).fill(0);
        }

        this.initialized = true;
        DebugLog.log(`NavGrid initialized: ${this.gridWidth}x${this.gridHeight}`, 'info');
    },

    // Rebuild grid based on current obstacles
    rebuildFromObstacles() {
        if (!this.initialized) this.init();

        // Reset grid
        for (let x = 0; x < this.gridWidth; x++) {
            for (let z = 0; z < this.gridHeight; z++) {
                this.grid[x][z] = 0;
            }
        }

        // Mark obstacle cells as blocked
        const buffer = 0.5; // Extra buffer around obstacles
        for (const obs of obstacles) {
            const minGX = Math.max(0, this.worldToGridX(obs.minX - buffer));
            const maxGX = Math.min(this.gridWidth - 1, this.worldToGridX(obs.maxX + buffer));
            const minGZ = Math.max(0, this.worldToGridZ(obs.minZ - buffer));
            const maxGZ = Math.min(this.gridHeight - 1, this.worldToGridZ(obs.maxZ + buffer));

            for (let gx = minGX; gx <= maxGX; gx++) {
                for (let gz = minGZ; gz <= maxGZ; gz++) {
                    this.grid[gx][gz] = 1;
                }
            }
        }

        // Mark arena boundaries as blocked
        for (let x = 0; x < this.gridWidth; x++) {
            this.grid[x][0] = 1;
            this.grid[x][this.gridHeight - 1] = 1;
        }
        for (let z = 0; z < this.gridHeight; z++) {
            this.grid[0][z] = 1;
            this.grid[this.gridWidth - 1][z] = 1;
        }

        DebugLog.log('NavGrid rebuilt from obstacles', 'info');
    },

    // Convert world coordinates to grid coordinates
    worldToGridX(wx) { return Math.floor((wx - this.offsetX) / this.cellSize); },
    worldToGridZ(wz) { return Math.floor((wz - this.offsetZ) / this.cellSize); },

    // Convert grid coordinates to world coordinates (center of cell)
    gridToWorldX(gx) { return this.offsetX + (gx + 0.5) * this.cellSize; },
    gridToWorldZ(gz) { return this.offsetZ + (gz + 0.5) * this.cellSize; },

    // Check if grid cell is walkable
    isWalkable(gx, gz) {
        if (gx < 0 || gx >= this.gridWidth || gz < 0 || gz >= this.gridHeight) return false;
        return this.grid[gx][gz] === 0;
    }
};

// A* Pathfinding implementation
const Pathfinder = {
    // Priority queue (min-heap) for A*
    openSet: [],
    pathCache: new Map(),  // Cache computed paths
    cacheTimeout: 150,     // ms before path is recomputed (reduced for responsiveness)

    // Find path from start to goal using A*
    findPath(startX, startZ, goalX, goalZ) {
        if (!NavGrid.initialized) return null;

        const startGX = NavGrid.worldToGridX(startX);
        const startGZ = NavGrid.worldToGridZ(startZ);
        const goalGX = NavGrid.worldToGridX(goalX);
        const goalGZ = NavGrid.worldToGridZ(goalZ);

        // Validate start and goal
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

        // Check cache
        const cacheKey = `${startGX},${startGZ}-${goalGX},${goalGZ}`;
        const cached = this.pathCache.get(cacheKey);
        if (cached && Date.now() - cached.time < this.cacheTimeout) {
            return cached.path;
        }

        // A* algorithm
        const openSet = [];
        const openSetKeys = new Set(); // O(1) membership check optimization
        const closedSet = new Set();
        const cameFrom = new Map();
        const gScore = new Map();
        const fScore = new Map();

        const startKey = `${startGX},${startGZ}`;
        gScore.set(startKey, 0);
        fScore.set(startKey, this.heuristic(startGX, startGZ, goalGX, goalGZ));
        openSet.push({ x: startGX, z: startGZ, f: fScore.get(startKey) });
        openSetKeys.add(startKey);

        const maxIterations = 2000; // Prevent infinite loops
        let iterations = 0;

        while (openSet.length > 0 && iterations < maxIterations) {
            iterations++;

            // Get node with lowest fScore
            openSet.sort((a, b) => a.f - b.f);
            const current = openSet.shift();
            const currentKey = `${current.x},${current.z}`;
            openSetKeys.delete(currentKey);

            // Reached goal?
            if (current.x === goalGX && current.z === goalGZ) {
                const path = this.reconstructPath(cameFrom, current);
                this.pathCache.set(cacheKey, { path, time: Date.now() });
                return path;
            }

            closedSet.add(currentKey);

            // Check all 8 neighbors (including diagonals)
            const neighbors = [
                { x: current.x + 1, z: current.z, cost: 1 },
                { x: current.x - 1, z: current.z, cost: 1 },
                { x: current.x, z: current.z + 1, cost: 1 },
                { x: current.x, z: current.z - 1, cost: 1 },
                { x: current.x + 1, z: current.z + 1, cost: 1.414 },
                { x: current.x - 1, z: current.z + 1, cost: 1.414 },
                { x: current.x + 1, z: current.z - 1, cost: 1.414 },
                { x: current.x - 1, z: current.z - 1, cost: 1.414 }
            ];

            for (const neighbor of neighbors) {
                const neighborKey = `${neighbor.x},${neighbor.z}`;

                if (closedSet.has(neighborKey)) continue;
                if (!NavGrid.isWalkable(neighbor.x, neighbor.z)) continue;

                // For diagonal movement, check that both adjacent cells are walkable
                if (neighbor.cost > 1) {
                    if (!NavGrid.isWalkable(current.x, neighbor.z) ||
                        !NavGrid.isWalkable(neighbor.x, current.z)) {
                        continue;
                    }
                }

                const tentativeG = gScore.get(currentKey) + neighbor.cost;

                if (!gScore.has(neighborKey) || tentativeG < gScore.get(neighborKey)) {
                    cameFrom.set(neighborKey, current);
                    gScore.set(neighborKey, tentativeG);
                    const f = tentativeG + this.heuristic(neighbor.x, neighbor.z, goalGX, goalGZ);
                    fScore.set(neighborKey, f);

                    // Add to open set if not already there (O(1) lookup)
                    if (!openSetKeys.has(neighborKey)) {
                        openSet.push({ x: neighbor.x, z: neighbor.z, f });
                        openSetKeys.add(neighborKey);
                    }
                }
            }
        }

        // No path found
        return null;
    },

    // Euclidean distance heuristic
    heuristic(x1, z1, x2, z2) {
        const dx = x2 - x1;
        const dz = z2 - z1;
        return Math.sqrt(dx * dx + dz * dz);
    },

    // Reconstruct path from A* result
    reconstructPath(cameFrom, current) {
        const path = [];
        let curr = current;

        while (curr) {
            path.unshift({
                x: NavGrid.gridToWorldX(curr.x),
                z: NavGrid.gridToWorldZ(curr.z)
            });
            const key = `${curr.x},${curr.z}`;
            curr = cameFrom.get(key);
        }

        // Smooth path by removing unnecessary waypoints
        return this.smoothPath(path);
    },

    // Path smoothing - remove unnecessary waypoints
    smoothPath(path) {
        if (path.length <= 2) return path;

        const smoothed = [path[0]];

        for (let i = 1; i < path.length - 1; i++) {
            const prev = smoothed[smoothed.length - 1];
            const curr = path[i];
            const next = path[i + 1];

            // Check if we can skip this waypoint (line of sight to next)
            if (!this.hasLineOfSight(prev.x, prev.z, next.x, next.z)) {
                smoothed.push(curr);
            }
        }

        smoothed.push(path[path.length - 1]);
        return smoothed;
    },

    // Check line of sight between two points using actual obstacle collision
    // Optimized: pre-filter obstacles using bounding box, then check only relevant ones
    hasLineOfSight(x1, z1, x2, z2) {
        const dx = x2 - x1;
        const dz = z2 - z1;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 0.1) return true;

        const radius = 0.4; // Zombie collision radius

        // Calculate bounding box of the line (expanded by radius)
        const lineMinX = Math.min(x1, x2) - radius;
        const lineMaxX = Math.max(x1, x2) + radius;
        const lineMinZ = Math.min(z1, z2) - radius;
        const lineMaxZ = Math.max(z1, z2) + radius;

        // Pre-filter: only check obstacles that could possibly intersect
        const relevantObstacles = [];
        for (const obs of obstacles) {
            if (obs.maxX >= lineMinX && obs.minX <= lineMaxX &&
                obs.maxZ >= lineMinZ && obs.minZ <= lineMaxZ) {
                relevantObstacles.push(obs);
            }
        }

        // If no obstacles in the way, clear line of sight
        if (relevantObstacles.length === 0) return true;

        // Check against filtered obstacles with fine-grained steps
        const stepSize = 0.3;
        const steps = Math.ceil(dist / stepSize);

        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const x = x1 + dx * t;
            const z = z1 + dz * t;

            // Check collision only with relevant obstacles
            for (const obs of relevantObstacles) {
                if (x + radius > obs.minX && x - radius < obs.maxX &&
                    z + radius > obs.minZ && z - radius < obs.maxZ) {
                    return false;
                }
            }
        }

        return true;
    },

    // Find nearest walkable cell
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
    },

    // Clear path cache
    clearCache() {
        this.pathCache.clear();
    }
};

// ==================== SAFE DOM HELPERS ====================
// Safely set element display property with null check
function setElementDisplay(id, display) {
    const el = document.getElementById(id);
    if (el) el.style.display = display;
}

// Safely set element style property with null check
function setElementStyle(id, property, value) {
    const el = document.getElementById(id);
    if (el) el.style[property] = value;
}

// ==================== HAPTIC FEEDBACK ====================
// Vibration durations for different events
const HAPTIC = {
    TAP: 25,           // Quick button tap
    BUTTON: 50,        // Standard button press
    WEAPON_SWITCH: 40, // Switching weapons
    RELOAD: [50, 30, 50], // Reload pattern
    DAMAGE: 100,       // Taking damage
    KILL: [30, 20, 30],   // Killing an enemy
    DEATH: [100, 50, 100, 50, 200] // Player death
};

// Trigger haptic feedback with feature detection
function hapticFeedback(pattern = HAPTIC.BUTTON) {
    if (navigator.vibrate && isMobile) {
        try {
            navigator.vibrate(pattern);
        } catch (e) {
            // Silently fail if vibration not supported
        }
    }
}

// ==================== THREE.JS SETUP ====================
let scene, camera, renderer;
let player, zombies = new Map(), pickups = new Map();
let bullets = []; // Active bullet tracers

// Cached zombie meshes for raycasting - avoids rebuilding array every shot
let zombieMeshesCache = [];
let zombieMeshesDirty = true;

function getZombieMeshes() {
    if (zombieMeshesDirty) {
        zombieMeshesCache = [];
        zombies.forEach(z => {
            if (z.isAlive && z.mesh) zombieMeshesCache.push(z.mesh);
        });
        zombieMeshesDirty = false;
    }
    return zombieMeshesCache;
}

function invalidateZombieMeshCache() {
    zombieMeshesDirty = true;
}
let nearbyPickup = null; // Pickup that can be collected with E key
let clock, deltaTime;
let raycaster;
let pointerLocked = false;

// Audio
let audioContext;

// Physics
const gravity = -30;
let playerVelocity = new THREE.Vector3();
let canJump = true;

// Controls state
const keys = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    sprint: false,
    lookUp: false,
    lookDown: false,
    lookLeft: false,
    lookRight: false
};

// ==================== WEAPON SYSTEM ====================
const WEAPONS = {
    pistol: {
        name: 'Pistol',
        damage: 20,
        fireRate: 250,      // ms between shots
        magSize: 12,
        reserveMax: 60,
        reloadTime: 1200,
        spread: 0.02,       // accuracy (lower = better)
        pellets: 1,         // bullets per shot
        automatic: false,   // semi-auto
        recoil: 0.03,
        sound: 'pistol'
    },
    smg: {
        name: 'SMG',
        damage: 15,
        fireRate: 80,
        magSize: 30,
        reserveMax: 120,
        reloadTime: 1800,
        spread: 0.05,
        pellets: 1,
        automatic: true,
        recoil: 0.04,
        sound: 'smg'
    },
    shotgun: {
        name: 'Shotgun',
        damage: 12,         // per pellet
        fireRate: 800,
        magSize: 8,
        reserveMax: 32,
        reloadTime: 2500,
        spread: 0.15,
        pellets: 8,         // 8 pellets per shot
        automatic: false,
        recoil: 0.12,
        sound: 'shotgun'
    },
    rocketLauncher: {
        name: 'Rocket Launcher',
        damage: 250,        // Direct hit damage (increased)
        splashDamage: 150,  // Splash damage (increased)
        splashRadius: 5,    // Splash radius in units (unchanged)
        fireRate: 1500,     // Slow fire rate
        magSize: 1,         // Single rocket
        reserveMax: 8,
        reloadTime: 2000,
        spread: 0,
        pellets: 1,
        automatic: false,
        recoil: 0.25,
        sound: 'rocket',
        projectile: true    // Fires projectile instead of hitscan
    },
    laserGun: {
        name: 'Laser Gun',
        damage: 25,         // Damage per tick (increased from 8)
        fireRate: 50,       // Rapid fire beam
        magSize: 100,       // Energy units
        reserveMax: 200,
        reloadTime: 2500,
        spread: 0,
        pellets: 1,
        automatic: true,
        recoil: 0.01,
        sound: 'laser',
        isBeam: true        // Continuous beam weapon
    }
};

// ==================== WEAPON UPGRADE SYSTEM ====================
const WeaponUpgrades = {
    // Current upgrade levels (0-5 for each stat)
    levels: {
        pistol: { damage: 0, fireRate: 0, magSize: 0, reloadTime: 0 },
        smg: { damage: 0, fireRate: 0, magSize: 0, reloadTime: 0 },
        shotgun: { damage: 0, pellets: 0, magSize: 0, reloadTime: 0 },
        rocketLauncher: { damage: 0, splashRadius: 0, magSize: 0, reloadTime: 0 },
        laserGun: { damage: 0, fireRate: 0, magSize: 0, reloadTime: 0 }
    },

    // Stat descriptions for tooltips
    statDescriptions: {
        damage: { name: 'Damage', desc: 'Increases damage dealt per hit. Higher damage kills zombies faster.', unit: '' },
        fireRate: { name: 'Fire Rate', desc: 'Decreases time between shots. Fire faster to clear hordes quickly.', unit: 'ms', invert: true },
        magSize: { name: 'Magazine Size', desc: 'Increases ammo capacity per magazine. Reload less often.', unit: ' rounds' },
        reloadTime: { name: 'Reload Speed', desc: 'Decreases reload time. Get back in action faster.', unit: 'ms', invert: true },
        pellets: { name: 'Pellets', desc: 'Increases pellets fired per shot. More pellets = more damage spread.', unit: '' },
        splashRadius: { name: 'Splash Radius', desc: 'Increases explosion radius. Hit more zombies per rocket.', unit: ' units' }
    },

    // Base costs for each weapon/upgrade
    costs: {
        pistol: { damage: 100, fireRate: 100, magSize: 150, reloadTime: 100 },
        smg: { damage: 150, fireRate: 150, magSize: 200, reloadTime: 150 },
        shotgun: { damage: 200, pellets: 250, magSize: 200, reloadTime: 150 },
        rocketLauncher: { damage: 300, splashRadius: 350, magSize: 400, reloadTime: 250 },
        laserGun: { damage: 250, fireRate: 250, magSize: 300, reloadTime: 200 }
    },

    // Upgrade multipliers per level
    multipliers: {
        damage: [1, 1.2, 1.4, 1.6, 1.85, 2.1],      // +20%, +40%, +60%, +85%, +110%
        fireRate: [1, 0.9, 0.8, 0.72, 0.65, 0.58],   // Faster (lower is better)
        magSize: [1, 1.25, 1.5, 1.75, 2, 2.5],       // +25%, +50%, +75%, +100%, +150%
        reloadTime: [1, 0.9, 0.8, 0.7, 0.6, 0.5],    // Faster reload
        pellets: [1, 1.25, 1.5, 1.75, 2, 2.5],       // More pellets
        splashRadius: [1, 1.15, 1.3, 1.45, 1.6, 1.8] // Bigger explosions
    },

    maxLevel: 5,
    shopCountdown: null,
    shopTimer: null,

    // Get cost for next upgrade
    getCost(weapon, stat) {
        const level = this.levels[weapon][stat];
        if (level >= this.maxLevel) return null;
        const baseCost = this.costs[weapon][stat];
        return Math.floor(baseCost * (1 + level * 0.5)); // Cost increases 50% per level
    },

    // Purchase upgrade
    purchase(weapon, stat) {
        const cost = this.getCost(weapon, stat);
        if (cost === null) return false;
        if (playerState.score < cost) return false;

        playerState.score -= cost;
        this.levels[weapon][stat]++;
        Achievements.trackUpgrade(this.levels[weapon][stat]);
        this.updateShopUI();
        playSound('pickup');
        DebugLog.log(`Upgraded ${weapon} ${stat} to level ${this.levels[weapon][stat]}`, 'success');
        return true;
    },

    // Get modified weapon stat
    getModifiedStat(weapon, stat, baseValue) {
        const level = this.levels[weapon]?.[stat] ?? 0;
        const multiplier = this.multipliers[stat]?.[level] ?? 1;
        return Math.round(baseValue * multiplier);
    },

    // Shop state for multiplayer sync
    shopOpen: false,
    localPlayerReady: false,
    playersReady: new Set(),
    shopMaxTime: 30,

    // Show upgrade shop
    showShop() {
        this.shopOpen = true;
        this.localPlayerReady = false;
        this.playersReady.clear();

        setElementDisplay('upgrade-shop', 'flex');
        GameState.isPaused = true;
        this.updateShopUI();

        // Unlock cursor for shop interaction
        document.exitPointerLock();

        // Start countdown (30 seconds max)
        let countdown = this.shopMaxTime;
        const shopCountdownEl = document.getElementById('shop-countdown');
        if (shopCountdownEl) shopCountdownEl.textContent = countdown;

        this.shopCountdown = setInterval(() => {
            countdown--;
            const el = document.getElementById('shop-countdown');
            if (el) el.textContent = countdown;
            if (countdown <= 0) {
                this.closeShop();
            }
        }, 1000);

        // In multiplayer, notify server that we're in shop
        if (GameState.mode === 'multiplayer' && GameState.isConnected) {
            sendToServer({ type: 'shopOpen' });
        }

        DebugLog.log('Upgrade shop opened', 'game');
    },

    // Player clicks continue - mark as ready
    playerReady() {
        if (!this.shopOpen) return;

        this.localPlayerReady = true;

        if (GameState.mode === 'singleplayer') {
            // Singleplayer: close immediately
            this.closeShop();
        } else if (GameState.mode === 'multiplayer' && GameState.isConnected) {
            // Multiplayer: notify server we're ready
            sendToServer({ type: 'shopReady' });
            const continueBtn = document.getElementById('shop-continue-btn');
            if (continueBtn) {
                continueBtn.textContent = 'WAITING FOR OTHERS...';
                continueBtn.disabled = true;
            }
        }
    },

    // Called when all players are ready or timer expires
    closeShop() {
        if (!this.shopOpen) return;

        this.shopOpen = false;
        this.localPlayerReady = false;
        this.playersReady.clear();

        if (this.shopCountdown) {
            clearInterval(this.shopCountdown);
            this.shopCountdown = null;
        }

        setElementDisplay('upgrade-shop', 'none');
        const continueBtn = document.getElementById('shop-continue-btn');
        if (continueBtn) {
            continueBtn.textContent = 'CONTINUE TO NEXT WAVE';
            continueBtn.disabled = false;
        }
        GameState.isPaused = false;

        // Prevent pointer lock loss from triggering pause during transition
        inShopTransition = true;

        // Re-lock cursor for gameplay
        const canvas = document.querySelector('canvas');
        if (canvas) {
            canvas.requestPointerLock();
        }

        DebugLog.log('Upgrade shop closed, starting next wave', 'game');

        // Start next wave (singleplayer) or wait for server (multiplayer)
        if (GameState.mode === 'singleplayer') {
            startSinglePlayerWave();
        }

        // Clear transition flag after pointer lock events have settled
        setTimeout(() => {
            inShopTransition = false;
        }, 500);
    },

    // Handle multiplayer shop sync message
    handleShopSync(message) {
        if (message.action === 'playerReady') {
            this.playersReady.add(message.playerId);
            DebugLog.log(`Player ${message.playerId} ready (${this.playersReady.size}/${message.totalPlayers})`, 'network');
        } else if (message.action === 'allReady' || message.action === 'forceClose') {
            // All players ready or server forced close
            this.closeShop();
        }
    },

    // Legacy hideShop for backwards compatibility
    hideShop() {
        this.playerReady();
    },

    // Update shop UI to reflect current state
    updateShopUI() {
        const shopPoints = document.getElementById('shop-points');
        if (shopPoints) shopPoints.textContent = playerState.score;

        document.querySelectorAll('.weapon-upgrade-card').forEach(card => {
            const weaponName = card.dataset.weapon;

            card.querySelectorAll('.upgrade-row').forEach(row => {
                const stat = row.dataset.upgrade;
                const level = this.levels[weaponName][stat];
                const cost = this.getCost(weaponName, stat);
                const btn = row.querySelector('.upgrade-btn');
                const pips = row.querySelectorAll('.pip');

                // Update pips
                pips.forEach((pip, i) => {
                    pip.classList.remove('filled', 'maxed');
                    if (i < level) {
                        pip.classList.add(level >= this.maxLevel ? 'maxed' : 'filled');
                    }
                });

                // Update button
                if (level >= this.maxLevel) {
                    btn.textContent = 'MAX';
                    btn.disabled = true;
                    btn.classList.add('maxed');
                } else {
                    btn.textContent = cost;
                    btn.disabled = playerState.score < cost;
                    btn.classList.remove('maxed');
                }

                // Update tooltip for this row
                const existingTooltip = row.querySelector('.upgrade-tooltip');
                if (existingTooltip) existingTooltip.remove();
                row.insertAdjacentHTML('beforeend', this.createTooltipHTML(weaponName, stat));
            });
        });
    },

    // Reset upgrades for new game
    reset() {
        for (const weapon in this.levels) {
            for (const stat in this.levels[weapon]) {
                this.levels[weapon][stat] = 0;
            }
        }
    },

    // Get base stat value for a weapon
    getBaseStat(weapon, stat) {
        const base = WEAPONS[weapon];
        if (!base) return 0;
        if (stat === 'damage') return base.damage;
        if (stat === 'fireRate') return base.fireRate;
        if (stat === 'magSize') return base.magSize;
        if (stat === 'reloadTime') return base.reloadTime;
        if (stat === 'pellets') return base.pellets || 0;
        if (stat === 'splashRadius') return base.splashRadius || 0;
        return 0;
    },

    // Create tooltip HTML for an upgrade row
    createTooltipHTML(weapon, stat) {
        const desc = this.statDescriptions[stat];
        if (!desc) return '';

        const level = this.levels[weapon][stat];
        const baseStat = this.getBaseStat(weapon, stat);
        const currentValue = this.getModifiedStat(weapon, stat, baseStat);
        const cost = this.getCost(weapon, stat);
        const isMaxed = level >= this.maxLevel;

        let nextValue = currentValue;
        if (!isMaxed) {
            const nextMultiplier = this.multipliers[stat]?.[level + 1] ?? 1;
            nextValue = Math.round(baseStat * nextMultiplier);
        }

        // For inverted stats (lower is better), show improvement direction
        const improves = desc.invert ? nextValue < currentValue : nextValue > currentValue;

        let statsHTML = '';
        if (isMaxed) {
            statsHTML = `<div class="tooltip-maxed">✓ MAXED OUT</div>`;
        } else {
            statsHTML = `
                <div class="tooltip-stats">
                    <span class="tooltip-current">${currentValue}${desc.unit}</span>
                    <span class="tooltip-arrow">→</span>
                    <span class="tooltip-next">${nextValue}${desc.unit}</span>
                </div>
                <div class="tooltip-cost">Cost: ${cost} points</div>
            `;
        }

        return `
            <div class="upgrade-tooltip">
                <div class="tooltip-title">${desc.name}</div>
                <div class="tooltip-desc">${desc.desc}</div>
                ${statsHTML}
            </div>
        `;
    },

    // Generate tooltips for all upgrade rows
    generateTooltips() {
        document.querySelectorAll('.weapon-upgrade-card').forEach(card => {
            const weapon = card.dataset.weapon;
            card.querySelectorAll('.upgrade-row').forEach(row => {
                const stat = row.dataset.upgrade;
                // Remove existing tooltip if any
                const existing = row.querySelector('.upgrade-tooltip');
                if (existing) existing.remove();
                // Add new tooltip
                row.insertAdjacentHTML('beforeend', this.createTooltipHTML(weapon, stat));
            });
        });
    },

    // Initialize shop event listeners
    init() {
        // Generate tooltips
        this.generateTooltips();

        // Upgrade button clicks
        document.querySelectorAll('.upgrade-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const row = e.target.closest('.upgrade-row');
                const card = e.target.closest('.weapon-upgrade-card');
                if (row && card) {
                    this.purchase(card.dataset.weapon, row.dataset.upgrade);
                }
            });
        });

        // Continue button
        document.getElementById('shop-continue-btn')?.addEventListener('click', () => {
            this.hideShop();
        });
    }
};

// ==================== ACHIEVEMENT SYSTEM ====================
const Achievements = {
    // Achievement definitions
    list: {
        firstBlood: { id: 'firstBlood', name: 'First Blood', desc: 'Kill your first zombie', icon: '🩸', unlocked: false },
        massacre: { id: 'massacre', name: 'Massacre', desc: 'Kill 100 zombies in one game', icon: '💀', unlocked: false },
        survivor5: { id: 'survivor5', name: 'Survivor', desc: 'Reach wave 5', icon: '🏆', unlocked: false },
        survivor10: { id: 'survivor10', name: 'Veteran', desc: 'Reach wave 10', icon: '🎖️', unlocked: false },
        bossSlayer: { id: 'bossSlayer', name: 'Boss Slayer', desc: 'Defeat your first boss', icon: '👑', unlocked: false },
        headhunter: { id: 'headhunter', name: 'Headhunter', desc: 'Get 50 headshots in one game', icon: '🎯', unlocked: false },
        explosiveExpert: { id: 'explosiveExpert', name: 'Explosive Expert', desc: 'Kill 3 zombies with one explosion', icon: '💥', unlocked: false },
        untouchable: { id: 'untouchable', name: 'Untouchable', desc: 'Complete a wave without taking damage', icon: '🛡️', unlocked: false },
        richSurvivor: { id: 'richSurvivor', name: 'Rich Survivor', desc: 'Accumulate 10,000 points', icon: '💰', unlocked: false },
        upgradeAll: { id: 'upgradeAll', name: 'Fully Loaded', desc: 'Max upgrade any weapon stat', icon: '⚡', unlocked: false },
        speedKill: { id: 'speedKill', name: 'Speed Demon', desc: 'Kill 5 zombies in 3 seconds', icon: '⚡', unlocked: false },
        grenadeMulti: { id: 'grenadeMulti', name: 'Grenadier', desc: 'Kill 5 zombies with one grenade', icon: '🧨', unlocked: false }
    },

    // Session stats for tracking
    sessionStats: {
        kills: 0,
        headshots: 0,
        waveReached: 0,
        bossesKilled: 0,
        damageTakenThisWave: 0,
        recentKills: [], // timestamps of recent kills for speed tracking
        explosionKills: 0, // kills in current explosion
        grenadeKills: 0 // kills from current grenade
    },

    // Load unlocked achievements from localStorage
    load() {
        try {
            const saved = localStorage.getItem('aspensPlaygroundAchievements');
            if (saved) {
                const unlocked = JSON.parse(saved);
                unlocked.forEach(id => {
                    if (this.list[id]) {
                        this.list[id].unlocked = true;
                    }
                });
            }
        } catch (e) {
            console.log('Failed to load achievements (corrupted data)');
            // Clear corrupted data
            try {
                localStorage.removeItem('aspensPlaygroundAchievements');
            } catch (clearErr) {
                // localStorage might be unavailable
            }
        }
    },

    // Save unlocked achievements to localStorage
    save() {
        try {
            const unlocked = Object.values(this.list)
                .filter(a => a.unlocked)
                .map(a => a.id);
            localStorage.setItem('aspensPlaygroundAchievements', JSON.stringify(unlocked));
        } catch (e) {
            console.log('Failed to save achievements');
        }
    },

    // Unlock an achievement
    unlock(id) {
        const achievement = this.list[id];
        if (!achievement || achievement.unlocked) return false;

        achievement.unlocked = true;
        this.save();
        this.showUnlockNotification(achievement);
        DebugLog.log(`Achievement unlocked: ${achievement.name}`, 'success');
        return true;
    },

    // Show achievement unlock notification
    showUnlockNotification(achievement) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 100px;
            right: -300px;
            width: 280px;
            background: linear-gradient(135deg, rgba(20,20,30,0.95), rgba(40,40,60,0.95));
            border: 2px solid #ffd700;
            border-radius: 10px;
            padding: 15px;
            z-index: 1000;
            transition: right 0.5s ease-out;
            box-shadow: 0 0 20px rgba(255, 215, 0, 0.5);
        `;
        notification.innerHTML = `
            <div style="color: #ffd700; font-size: 12px; margin-bottom: 5px;">🏆 ACHIEVEMENT UNLOCKED</div>
            <div style="display: flex; align-items: center; gap: 10px;">
                <div style="font-size: 32px;">${achievement.icon}</div>
                <div>
                    <div style="color: #fff; font-size: 16px; font-weight: bold;">${achievement.name}</div>
                    <div style="color: #aaa; font-size: 12px;">${achievement.desc}</div>
                </div>
            </div>
        `;
        document.body.appendChild(notification);

        // Animate in
        setTimeout(() => notification.style.right = '20px', 50);

        // Animate out and remove
        setTimeout(() => {
            notification.style.right = '-300px';
            setTimeout(() => notification.remove(), 500);
        }, 4000);

        playSound('pickup');
    },

    // Reset session stats for new game
    resetSession() {
        this.sessionStats = {
            kills: 0,
            headshots: 0,
            waveReached: 0,
            bossesKilled: 0,
            damageTakenThisWave: 0,
            recentKills: [],
            explosionKills: 0,
            grenadeKills: 0
        };
    },

    // Track a kill
    trackKill(isHeadshot = false, isBoss = false) {
        this.sessionStats.kills++;
        if (isHeadshot) this.sessionStats.headshots++;
        if (isBoss) this.sessionStats.bossesKilled++;

        // Track recent kills for speed achievement
        const now = Date.now();
        this.sessionStats.recentKills.push(now);
        this.sessionStats.recentKills = this.sessionStats.recentKills.filter(t => now - t < 3000);

        // Check kill-based achievements
        if (this.sessionStats.kills === 1) this.unlock('firstBlood');
        if (this.sessionStats.kills >= 100) this.unlock('massacre');
        if (this.sessionStats.headshots >= 50) this.unlock('headhunter');
        if (this.sessionStats.bossesKilled >= 1) this.unlock('bossSlayer');
        if (this.sessionStats.recentKills.length >= 5) this.unlock('speedKill');
    },

    // Track wave progress
    trackWave(wave) {
        this.sessionStats.waveReached = wave;
        if (wave >= 5) this.unlock('survivor5');
        if (wave >= 10) this.unlock('survivor10');

        // Check untouchable achievement at wave end
        if (this.sessionStats.damageTakenThisWave === 0 && wave > 1) {
            this.unlock('untouchable');
        }
        this.sessionStats.damageTakenThisWave = 0;
    },

    // Track damage taken
    trackDamage(amount) {
        this.sessionStats.damageTakenThisWave += amount;
    },

    // Track explosion kills
    trackExplosionKill(count) {
        if (count >= 3) this.unlock('explosiveExpert');
    },

    // Track grenade kills
    trackGrenadeKill(count) {
        if (count >= 5) this.unlock('grenadeMulti');
    },

    // Track score
    trackScore(score) {
        if (score >= 10000) this.unlock('richSurvivor');
    },

    // Track upgrade
    trackUpgrade(level) {
        if (level >= 5) this.unlock('upgradeAll');
    },

    // Show achievements screen
    showScreen() {
        this.populateGrid();
        setElementDisplay('achievements-screen', 'flex');
        setElementDisplay('start-screen', 'none');
    },

    // Hide achievements screen
    hideScreen() {
        setElementDisplay('achievements-screen', 'none');
        setElementDisplay('start-screen', 'flex');
    },

    // Populate achievements grid
    populateGrid() {
        const grid = document.getElementById('achievements-grid');
        if (!grid) return;

        grid.innerHTML = '';
        let unlockedCount = 0;
        const total = Object.keys(this.list).length;

        Object.values(this.list).forEach(achievement => {
            if (achievement.unlocked) unlockedCount++;

            const card = document.createElement('div');
            card.className = `achievement-card ${achievement.unlocked ? 'unlocked' : 'locked'}`;
            card.innerHTML = `
                <div class="achievement-icon">${achievement.unlocked ? achievement.icon : '🔒'}</div>
                <div class="achievement-name">${achievement.name}</div>
                <div class="achievement-desc">${achievement.desc}</div>
                ${achievement.unlocked ? '<div class="achievement-status">UNLOCKED</div>' : ''}
            `;
            grid.appendChild(card);
        });

        const unlockedEl = document.getElementById('achievements-unlocked');
        const totalEl = document.getElementById('achievements-total');
        if (unlockedEl) unlockedEl.textContent = unlockedCount;
        if (totalEl) totalEl.textContent = total;
    },

    // Initialize
    init() {
        this.load();
    }
};

// Current weapon state
const weapon = {
    current: 'pistol',
    ammo: WEAPONS.pistol.magSize,
    reserveAmmo: WEAPONS.pistol.reserveMax,
    isReloading: false,
    lastFired: 0,
    isFiring: false,
    // Inventory: ammo for each weapon
    inventory: {
        pistol: { ammo: 12, reserve: 60 },
        smg: { ammo: 30, reserve: 120 },
        shotgun: { ammo: 8, reserve: 32 },
        rocketLauncher: { ammo: 1, reserve: 8 },
        laserGun: { ammo: 100, reserve: 200 }
    },
    // Grenade inventory
    grenades: 3
};

// Weapon list for cycling
const weaponList = ['pistol', 'smg', 'shotgun', 'rocketLauncher', 'laserGun'];

// Active projectiles (rockets, grenades)
const projectiles = [];

// Acid pools from spitter zombies
const acidPools = [];

// Laser beam state
let laserBeam = null;

// ==================== RECOIL SYSTEM ====================
const recoilSystem = {
    currentRecoil: 0,           // Current accumulated recoil (radians)
    maxRecoil: 0.5,             // Max recoil angle (radians, ~28 degrees)
    recoveryRate: 2.5,          // Radians per second to recover
    recoilPerShot: 0.05         // Base 5% upward kick per shot (modified by weapon)
};

// Apply recoil recovery every frame
function updateRecoilRecovery(delta) {
    if (recoilSystem.currentRecoil > 0) {
        // Gradually recover recoil
        const recovery = recoilSystem.recoveryRate * delta;
        recoilSystem.currentRecoil = Math.max(0, recoilSystem.currentRecoil - recovery);

        // Apply recovery to camera
        if (recovery > 0 && playerState.rotation.x > 0) {
            playerState.rotation.x = Math.max(0, playerState.rotation.x - recovery);
            camera.rotation.x = playerState.rotation.x;
        }
    }
}

// Get current weapon stats
function getWeaponStats() {
    const base = WEAPONS[weapon.current];
    const w = weapon.current;

    // Apply upgrades to weapon stats
    return {
        ...base,
        damage: WeaponUpgrades.getModifiedStat(w, 'damage', base.damage),
        fireRate: WeaponUpgrades.getModifiedStat(w, 'fireRate', base.fireRate),
        magSize: WeaponUpgrades.getModifiedStat(w, 'magSize', base.magSize),
        reloadTime: WeaponUpgrades.getModifiedStat(w, 'reloadTime', base.reloadTime),
        pellets: base.pellets ? WeaponUpgrades.getModifiedStat(w, 'pellets', base.pellets) : base.pellets,
        splashRadius: base.splashRadius ? WeaponUpgrades.getModifiedStat(w, 'splashRadius', base.splashRadius) : base.splashRadius,
        splashDamage: base.splashDamage ? WeaponUpgrades.getModifiedStat(w, 'damage', base.splashDamage) : base.splashDamage
    };
}

// Switch weapon
function switchWeapon(weaponName) {
    if (!WEAPONS[weaponName] || weapon.current === weaponName || weapon.isReloading) return;

    // Save current weapon's ammo
    weapon.inventory[weapon.current].ammo = weapon.ammo;
    weapon.inventory[weapon.current].reserve = weapon.reserveAmmo;

    // Switch to new weapon
    weapon.current = weaponName;
    weapon.ammo = weapon.inventory[weaponName].ammo;
    weapon.reserveAmmo = weapon.inventory[weaponName].reserve;
    weapon.isFiring = false;

    // Notify server of weapon switch (for server-side damage calculation)
    sendToServer({ type: 'weaponSwitch', weapon: weaponName });

    // Update weapon model
    updateWeaponModel();

    playSound('weaponSwitch');
    updateHUD();
    DebugLog.log(`Switched to ${WEAPONS[weaponName].name}`, 'info');
}

// Cycle to next/previous weapon
function cycleWeapon(direction) {
    const currentIndex = weaponList.indexOf(weapon.current);
    let newIndex = currentIndex + direction;

    // Wrap around
    if (newIndex < 0) newIndex = weaponList.length - 1;
    if (newIndex >= weaponList.length) newIndex = 0;

    switchWeapon(weaponList[newIndex]);
}

// ==================== KILL STREAK SYSTEM ====================
const killStreak = {
    current: 0,
    lastKillTime: 0,
    streakTimeout: 3000,  // ms to maintain streak
    milestones: [3, 5, 10, 15, 20, 25]
};

// Player state
const playerState = {
    health: CONFIG.player.maxHealth,
    isAlive: true,
    position: new THREE.Vector3(0, CONFIG.player.height, 0),
    rotation: new THREE.Euler(0, 0, 0, 'YXZ'),
    kills: 0,
    score: 0
};

// Network update tracking
let lastNetworkUpdate = 0;

// ==================== LEADERBOARD ====================
let cachedLeaderboard = [];
let playerRank = -1;

async function fetchLeaderboard() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    try {
        const response = await fetch('/api/leaderboard', { signal: controller.signal });
        clearTimeout(timeoutId);
        if (response.ok) {
            const data = await response.json();
            if (Array.isArray(data)) {
                cachedLeaderboard = data;
                DebugLog.log(`Fetched ${cachedLeaderboard.length} leaderboard entries`, 'info');
                return cachedLeaderboard;
            } else {
                DebugLog.log('Leaderboard response was not an array', 'warn');
            }
        }
    } catch (e) {
        clearTimeout(timeoutId);
        if (e.name === 'AbortError') {
            DebugLog.log('Leaderboard fetch timed out', 'warn');
        } else {
            DebugLog.log(`Failed to fetch leaderboard: ${e.message}`, 'error');
        }
    }
    return cachedLeaderboard;
}

async function submitScore(name) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    try {
        let response;

        if (sessionToken) {
            // Multiplayer: use session-based submission (server-verified scores)
            response = await fetch('/api/leaderboard', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, sessionToken }),
                signal: controller.signal
            });
        } else {
            // Singleplayer: submit score directly (client-side tracking)
            response = await fetch('/api/leaderboard/singleplayer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    score: playerState.score,
                    wave: GameState.wave,
                    kills: playerState.kills
                }),
                signal: controller.signal
            });
        }
        clearTimeout(timeoutId);

        if (response.ok) {
            const result = await response.json();
            if (result && Array.isArray(result.leaderboard)) {
                cachedLeaderboard = result.leaderboard;
                playerRank = result.rank;
                DebugLog.log(`Score submitted: rank #${result.rank} (verified: ${result.verifiedScore} pts)`, 'success');
                return result;
            }
            DebugLog.log('Score submission returned invalid data', 'warn');
            return { added: false, rank: -1, leaderboard: cachedLeaderboard };
        } else {
            // Safely parse error response - may not be JSON
            try {
                const error = await response.json();
                DebugLog.log(`Score submission rejected: ${error.error || 'Unknown error'}`, 'warn');
                return { added: false, rank: -1, leaderboard: cachedLeaderboard, error: error.error };
            } catch (parseError) {
                DebugLog.log(`Score submission failed: HTTP ${response.status}`, 'warn');
                return { added: false, rank: -1, leaderboard: cachedLeaderboard };
            }
        }
    } catch (e) {
        clearTimeout(timeoutId);
        if (e.name === 'AbortError') {
            DebugLog.log('Score submission timed out', 'warn');
        } else {
            DebugLog.log(`Failed to submit score: ${e.message}`, 'error');
        }
    }
    return { added: false, rank: -1, leaderboard: cachedLeaderboard };
}

function renderLeaderboard(containerId, highlightRank = -1) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (cachedLeaderboard.length === 0) {
        container.innerHTML = '<div class="leaderboard-empty">No scores yet. Be the first!</div>';
        return;
    }

    let html = `
        <table class="leaderboard-table">
            <thead>
                <tr>
                    <th>#</th>
                    <th>NAME</th>
                    <th>WAVE</th>
                    <th>KILLS</th>
                    <th class="score">SCORE</th>
                </tr>
            </thead>
            <tbody>
    `;

    cachedLeaderboard.forEach((entry, index) => {
        const rank = index + 1;
        const isHighlighted = rank === highlightRank;
        const rankClass = rank <= 3 ? `rank-${rank}` : '';

        html += `
            <tr class="${isHighlighted ? 'leaderboard-highlight' : ''}">
                <td class="rank ${rankClass}">${rank}</td>
                <td class="player-name">${escapeHtml(entry.name)}</td>
                <td>${entry.wave}</td>
                <td>${entry.kills}</td>
                <td class="score">${entry.score.toLocaleString()}</td>
            </tr>
        `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Sanitize player name to prevent XSS and ensure valid input
function sanitizePlayerName(name) {
    if (typeof name !== 'string') return '';

    // Remove control characters and zero-width characters
    let sanitized = name.replace(/[\x00-\x1F\x7F\u200B-\u200D\uFEFF]/g, '');

    // Remove HTML/script tags and entities
    sanitized = sanitized.replace(/[<>&"'`]/g, '');

    // Collapse multiple spaces into one
    sanitized = sanitized.replace(/\s+/g, ' ').trim();

    // Limit length
    sanitized = sanitized.substring(0, 20);

    // Must have at least one alphanumeric character
    if (!/[a-zA-Z0-9]/.test(sanitized)) {
        return '';
    }

    return sanitized;
}

function getPlayerName() {
    // First check the input field on the main menu
    const nameInput = document.getElementById('player-name-input');
    let name = nameInput ? sanitizePlayerName(nameInput.value) : '';

    // If no name in input, check localStorage
    if (!name) {
        const savedName = localStorage.getItem('playerName');
        name = savedName ? sanitizePlayerName(savedName) : '';
    }

    // If still no name, prompt the user
    if (!name) {
        const prompted = prompt('Enter your name for the leaderboard:', 'Survivor') || 'Anonymous';
        name = sanitizePlayerName(prompted) || 'Anonymous';
    }

    // Save to localStorage for future use
    if (name) {
        localStorage.setItem('playerName', name);
        if (nameInput) {
            nameInput.value = name;
        }
    }

    return name || 'Anonymous';
}

function initPlayerNameInput() {
    const nameInput = document.getElementById('player-name-input');
    if (!nameInput) return;

    // Load saved name from localStorage (sanitize on load)
    const savedName = localStorage.getItem('playerName');
    if (savedName) {
        const sanitized = sanitizePlayerName(savedName);
        nameInput.value = sanitized;
        // Update localStorage if sanitization changed the value
        if (sanitized !== savedName && sanitized) {
            localStorage.setItem('playerName', sanitized);
        }
    }

    // Save name when input changes
    nameInput.addEventListener('input', () => {
        const name = sanitizePlayerName(nameInput.value);
        if (name) {
            localStorage.setItem('playerName', name);
        }
    });

    // Also save on blur (when user clicks away) and send to server if connected
    nameInput.addEventListener('blur', () => {
        const name = sanitizePlayerName(nameInput.value);
        if (name) {
            nameInput.value = name; // Update field with sanitized value
            localStorage.setItem('playerName', name);
            // Send name update to server if in multiplayer mode
            if (GameState.mode === 'multiplayer' && GameState.isConnected) {
                sendToServer({ type: 'setName', name: name });
            }
        }
    });

    // Send name on Enter key
    nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const name = sanitizePlayerName(nameInput.value);
            if (name) {
                nameInput.value = name; // Update field with sanitized value
                localStorage.setItem('playerName', name);
                if (GameState.mode === 'multiplayer' && GameState.isConnected) {
                    sendToServer({ type: 'setName', name: name });
                }
                nameInput.blur();
            }
        }
    });
}

// ==================== COSMETICS SYSTEM ====================
const COSMETICS = {
    default: {
        name: 'Survivor',
        bodyColor: 0x2d4a2d,
        shirtColor: 0x3d5a3d,
        pantsColor: 0x1a2a1a,
        bootsColor: 0x2a1a0a,
        skinColor: 0xd4a574,
        hairColor: 0x3d2314,
        hasHelmet: false,
        hasMask: false,
        glowColor: null
    },
    military: {
        name: 'Soldier',
        bodyColor: 0x4a5a3d,
        shirtColor: 0x5a6a4d,
        pantsColor: 0x3a4a2d,
        bootsColor: 0x1a1a0a,
        skinColor: 0xc49a6c,
        hairColor: 0x1a1a1a,
        hasHelmet: true,
        helmetColor: 0x3a4a2d,
        hasMask: false,
        glowColor: null
    },
    hazmat: {
        name: 'Hazmat',
        bodyColor: 0xcccc00,
        shirtColor: 0xdddd00,
        pantsColor: 0xaaaa00,
        bootsColor: 0x444400,
        skinColor: 0xd4a574,
        hairColor: 0x000000,
        hasHelmet: true,
        helmetColor: 0xeeee00,
        hasMask: true,
        maskColor: 0x333333,
        glowColor: 0x00ff00
    },
    punk: {
        name: 'Punk',
        bodyColor: 0x1a1a1a,
        shirtColor: 0x8b0000,
        pantsColor: 0x0a0a0a,
        bootsColor: 0x000000,
        skinColor: 0xe0b090,
        hairColor: 0xff00ff,
        hasHelmet: false,
        hasMask: false,
        hasMohawk: true,
        glowColor: 0xff00ff
    },
    mascot: {
        name: 'Mascot',
        bodyColor: 0x808080,
        shirtColor: 0x9040a0,
        pantsColor: 0x604080,
        bootsColor: 0x303030,
        skinColor: 0x808080,
        hairColor: 0x808080,
        hasHelmet: false,
        hasMask: true,
        maskColor: 0x808080,
        isMascot: true,
        glowColor: 0xff0000
    }
};

let selectedCosmetic = 'default';
let cosmeticPreviewScenes = {};
let cosmeticPreviewRenderers = {};
let cosmeticPreviewRAFs = {}; // Track RAF IDs for proper cleanup

function loadSelectedCosmetic() {
    const saved = localStorage.getItem('selectedCosmetic');
    if (saved && COSMETICS[saved]) {
        selectedCosmetic = saved;
    }
}

function saveSelectedCosmetic(cosmeticId) {
    selectedCosmetic = cosmeticId;
    localStorage.setItem('selectedCosmetic', cosmeticId);
}

function initCosmeticsScreen() {
    const cosmeticsBtn = document.getElementById('cosmetics-button');
    const cosmeticsScreen = document.getElementById('cosmetics-screen');
    const backBtn = document.getElementById('cosmetics-back-button');

    if (!cosmeticsBtn || !cosmeticsScreen) return;

    // Load saved cosmetic
    loadSelectedCosmetic();

    // Open cosmetics screen
    cosmeticsBtn.addEventListener('click', () => {
        setElementDisplay('start-screen', 'none');
        cosmeticsScreen.style.display = 'flex';
        initCosmeticPreviews();
        updateCosmeticSelection();
    });

    // Back button
    backBtn.addEventListener('click', () => {
        cosmeticsScreen.style.display = 'none';
        setElementDisplay('start-screen', 'flex');
        cleanupCosmeticPreviews();
    });

    // Cosmetic option clicks
    document.querySelectorAll('.cosmetic-option').forEach(option => {
        option.addEventListener('click', () => {
            const cosmeticId = option.dataset.cosmetic;
            if (COSMETICS[cosmeticId]) {
                saveSelectedCosmetic(cosmeticId);
                updateCosmeticSelection();
            }
        });
    });
}

function initAchievementsScreen() {
    const achievementsBtn = document.getElementById('achievements-button');
    const achievementsCloseBtn = document.getElementById('achievements-close-btn');

    if (achievementsBtn) {
        achievementsBtn.addEventListener('click', () => {
            Achievements.showScreen();
        });
    }

    if (achievementsCloseBtn) {
        achievementsCloseBtn.addEventListener('click', () => {
            Achievements.hideScreen();
        });
    }
}

function updateCosmeticSelection() {
    document.querySelectorAll('.cosmetic-option').forEach(option => {
        const isSelected = option.dataset.cosmetic === selectedCosmetic;
        option.classList.toggle('selected', isSelected);
        option.setAttribute('aria-selected', isSelected.toString());
    });
}

function initCosmeticPreviews() {
    Object.keys(COSMETICS).forEach(cosmeticId => {
        const container = document.getElementById(`preview-${cosmeticId}`);
        if (!container || cosmeticPreviewRenderers[cosmeticId]) return;

        // Create mini scene for preview
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1a1a2e);

        // Camera
        const camera = new THREE.PerspectiveCamera(45, 120 / 150, 0.1, 100);
        camera.position.set(0, 1.2, 2.5);
        camera.lookAt(0, 0.9, 0);

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(1, 2, 2);
        scene.add(directionalLight);

        // Create character model
        const character = createCosmeticCharacterModel(cosmeticId);
        scene.add(character);

        // Renderer
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(120, 150);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        container.appendChild(renderer.domElement);

        cosmeticPreviewScenes[cosmeticId] = { scene, camera, character };
        cosmeticPreviewRenderers[cosmeticId] = renderer;

        // Animate rotation with cancellable RAF
        function animatePreview() {
            if (!cosmeticPreviewRenderers[cosmeticId]) return;
            character.rotation.y += 0.01;
            renderer.render(scene, camera);
            cosmeticPreviewRAFs[cosmeticId] = requestAnimationFrame(animatePreview);
        }
        animatePreview();
    });
}

function cleanupCosmeticPreviews() {
    // Cancel all RAF callbacks first
    Object.keys(cosmeticPreviewRAFs).forEach(id => {
        if (cosmeticPreviewRAFs[id]) {
            cancelAnimationFrame(cosmeticPreviewRAFs[id]);
        }
    });
    cosmeticPreviewRAFs = {};

    // Then dispose renderers
    Object.keys(cosmeticPreviewRenderers).forEach(id => {
        const renderer = cosmeticPreviewRenderers[id];
        if (renderer) {
            renderer.dispose();
            const container = document.getElementById(`preview-${id}`);
            if (container) container.innerHTML = '';
        }
    });
    cosmeticPreviewRenderers = {};
    cosmeticPreviewScenes = {};
}

function createCosmeticCharacterModel(cosmeticId) {
    const cosmetic = COSMETICS[cosmeticId] || COSMETICS.default;
    const group = new THREE.Group();

    // Body/Torso
    const torsoGeo = new THREE.BoxGeometry(0.5, 0.6, 0.3);
    const torsoMat = new THREE.MeshStandardMaterial({ color: cosmetic.shirtColor });
    const torso = new THREE.Mesh(torsoGeo, torsoMat);
    torso.position.y = 1.0;
    group.add(torso);

    // Head
    const headGeo = new THREE.BoxGeometry(0.35, 0.35, 0.35);
    const headMat = new THREE.MeshStandardMaterial({ color: cosmetic.skinColor });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.5;
    group.add(head);

    // Hair or Helmet
    if (cosmetic.hasHelmet) {
        const helmetGeo = new THREE.BoxGeometry(0.4, 0.25, 0.4);
        const helmetMat = new THREE.MeshStandardMaterial({ color: cosmetic.helmetColor || 0x3a4a2d });
        const helmet = new THREE.Mesh(helmetGeo, helmetMat);
        helmet.position.y = 1.65;
        group.add(helmet);
    } else if (cosmetic.hasMohawk) {
        // Mohawk for punk
        const mohawkGeo = new THREE.BoxGeometry(0.08, 0.25, 0.3);
        const mohawkMat = new THREE.MeshStandardMaterial({
            color: cosmetic.hairColor,
            emissive: cosmetic.hairColor,
            emissiveIntensity: 0.3
        });
        const mohawk = new THREE.Mesh(mohawkGeo, mohawkMat);
        mohawk.position.y = 1.75;
        group.add(mohawk);
    } else {
        // Normal hair
        const hairGeo = new THREE.BoxGeometry(0.36, 0.12, 0.36);
        const hairMat = new THREE.MeshStandardMaterial({ color: cosmetic.hairColor });
        const hair = new THREE.Mesh(hairGeo, hairMat);
        hair.position.y = 1.7;
        group.add(hair);
    }

    // Mask (for hazmat/mascot)
    if (cosmetic.hasMask) {
        if (cosmetic.isMascot) {
            // Mouse/rat head for mascot
            const mascotHeadGeo = new THREE.SphereGeometry(0.25, 12, 12);
            const mascotMat = new THREE.MeshStandardMaterial({ color: 0x808080 });
            const mascotHead = new THREE.Mesh(mascotHeadGeo, mascotMat);
            mascotHead.position.y = 1.5;
            mascotHead.position.z = 0.05;
            group.add(mascotHead);

            // Ears
            const earGeo = new THREE.CircleGeometry(0.12, 12);
            const earMat = new THREE.MeshStandardMaterial({ color: 0x606060, side: THREE.DoubleSide });
            [-0.2, 0.2].forEach(x => {
                const ear = new THREE.Mesh(earGeo, earMat);
                ear.position.set(x, 1.75, 0);
                ear.rotation.y = x > 0 ? -0.3 : 0.3;
                group.add(ear);
            });

            // Eyes (creepy red)
            const eyeGeo = new THREE.SphereGeometry(0.04, 8, 8);
            const eyeMat = new THREE.MeshStandardMaterial({
                color: 0xff0000,
                emissive: 0xff0000,
                emissiveIntensity: 0.8
            });
            [-0.08, 0.08].forEach(x => {
                const eye = new THREE.Mesh(eyeGeo, eyeMat);
                eye.position.set(x, 1.55, 0.2);
                group.add(eye);
            });
        } else {
            // Visor/mask
            const visorGeo = new THREE.BoxGeometry(0.32, 0.15, 0.1);
            const visorMat = new THREE.MeshStandardMaterial({
                color: 0x333333,
                transparent: true,
                opacity: 0.7
            });
            const visor = new THREE.Mesh(visorGeo, visorMat);
            visor.position.set(0, 1.5, 0.18);
            group.add(visor);
        }
    } else {
        // Eyes
        const eyeGeo = new THREE.SphereGeometry(0.03, 8, 8);
        const eyeMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
        [-0.08, 0.08].forEach(x => {
            const eye = new THREE.Mesh(eyeGeo, eyeMat);
            eye.position.set(x, 1.52, 0.17);
            group.add(eye);
        });
    }

    // Arms
    const armGeo = new THREE.BoxGeometry(0.15, 0.5, 0.15);
    const armMat = new THREE.MeshStandardMaterial({ color: cosmetic.shirtColor });
    [-0.35, 0.35].forEach(x => {
        const arm = new THREE.Mesh(armGeo, armMat);
        arm.position.set(x, 0.95, 0);
        group.add(arm);

        // Hands
        const handGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
        const handMat = new THREE.MeshStandardMaterial({ color: cosmetic.skinColor });
        const hand = new THREE.Mesh(handGeo, handMat);
        hand.position.set(x, 0.65, 0);
        group.add(hand);
    });

    // Legs
    const legGeo = new THREE.BoxGeometry(0.18, 0.55, 0.18);
    const legMat = new THREE.MeshStandardMaterial({ color: cosmetic.pantsColor });
    [-0.12, 0.12].forEach(x => {
        const leg = new THREE.Mesh(legGeo, legMat);
        leg.position.set(x, 0.4, 0);
        group.add(leg);

        // Feet
        const footGeo = new THREE.BoxGeometry(0.16, 0.1, 0.22);
        const footMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
        const foot = new THREE.Mesh(footGeo, footMat);
        foot.position.set(x, 0.12, 0.03);
        group.add(foot);
    });

    // Glow effect for special cosmetics
    if (cosmetic.glowColor) {
        const glowLight = new THREE.PointLight(cosmetic.glowColor, 0.5, 2);
        glowLight.position.y = 1.2;
        group.add(glowLight);
    }

    return group;
}

function getSelectedCosmeticData() {
    return COSMETICS[selectedCosmetic] || COSMETICS.default;
}

// ==================== INITIALIZATION ====================
// Note: initScreenOrientation loaded from modules/ui.js

function init() {
    DebugLog.init();
    DebugLog.log('Initializing Aspen\'s Playground (Multiplayer)...', 'info');

    try {
        loadSettings();
        initScreenOrientation();
        initThreeJS();
        initAudio();
        initMapSystem();  // Initialize new map system
        createPlayer();
        initControls();
        initEventListeners();
        initSettingsMenu();
        initPlayerNameInput();
        initCosmeticsScreen();
        initAchievementsScreen();
        initLeaderboard();
        initFPSCounter();
        initNetworkStatus();
        loadSelectedCosmetic();
        WeaponUpgrades.init();
        Achievements.init();

        setElementDisplay('loading-screen', 'none');
        DebugLog.log('Game initialization complete!', 'success');

        clock = new THREE.Clock();
        animate();

    } catch (error) {
        DebugLog.log(`Initialization error: ${error.message}`, 'error');
        console.error(error);
    }
}

// ==================== SERVICE WORKER REGISTRATION ====================
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/service-worker.js')
                .then((registration) => {
                    DebugLog.log('ServiceWorker registered successfully', 'success');

                    // Check for updates
                    registration.addEventListener('updatefound', () => {
                        const newWorker = registration.installing;
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                DebugLog.log('New version available! Refresh to update.', 'info');
                                showUpdateNotification();
                            }
                        });
                    });
                })
                .catch((error) => {
                    DebugLog.log('ServiceWorker registration failed: ' + error, 'error');
                });

            // Listen for service worker update messages
            navigator.serviceWorker.addEventListener('message', (event) => {
                if (event.data && event.data.type === 'SW_UPDATED') {
                    DebugLog.log(`Game updated to version ${event.data.version}`, 'success');
                }
            });
        });
    }
}

// Show update notification to user
function showUpdateNotification() {
    // Only show if we're not in the middle of a game
    if (GameState.isRunning) return;

    const notification = document.createElement('div');
    notification.id = 'update-notification';
    notification.innerHTML = `
        <div style="position:fixed;top:20px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#2d4a2d,#1a3a1a);border:2px solid #4a7a4a;padding:15px 25px;border-radius:10px;color:#fff;font-family:Arial,sans-serif;z-index:10000;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,0.5);">
            <div style="font-weight:bold;margin-bottom:5px;">Update Available!</div>
            <div style="font-size:14px;color:#aaa;margin-bottom:10px;">A new version of the game is ready.</div>
            <button onclick="location.reload()" style="background:#4a7a4a;border:none;color:#fff;padding:8px 20px;border-radius:5px;cursor:pointer;font-weight:bold;">Refresh Now</button>
            <button onclick="this.parentElement.parentElement.remove()" style="background:transparent;border:1px solid #666;color:#aaa;padding:8px 15px;border-radius:5px;cursor:pointer;margin-left:10px;">Later</button>
        </div>
    `;
    document.body.appendChild(notification);
}

// Register service worker immediately
registerServiceWorker();

// ==================== ONLINE/OFFLINE DETECTION ====================
let isOnline = navigator.onLine;

function initNetworkStatus() {
    const offlineIndicator = document.getElementById('offline-indicator');

    function updateOnlineStatus() {
        isOnline = navigator.onLine;
        if (offlineIndicator) {
            offlineIndicator.style.display = isOnline ? 'none' : 'flex';
        }

        if (isOnline) {
            DebugLog.log('Connection restored', 'success');
        } else {
            DebugLog.log('Connection lost - offline mode', 'warn');
            // If in multiplayer and connection lost, show warning
            if (isMultiplayer && socket) {
                setElementDisplay('lobby-status', 'block');
                const lobbyStatus = document.getElementById('lobby-status');
                if (lobbyStatus) {
                    lobbyStatus.textContent = 'Connection lost. Waiting for reconnection...';
                }
            }
        }
    }

    // Set initial state
    updateOnlineStatus();

    // Listen for online/offline events
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    DebugLog.log('Network status monitoring initialized', 'info');
}

// FPS Counter
let fpsFrames = 0;
let fpsLastTime = performance.now();
let fpsIntervalId = null;

function initFPSCounter() {
    // Clear any existing interval to prevent leaks
    if (fpsIntervalId) {
        clearInterval(fpsIntervalId);
    }
    fpsIntervalId = setInterval(() => {
        const now = performance.now();
        const fps = Math.round(fpsFrames * 1000 / (now - fpsLastTime));
        const fpsDisplay = document.getElementById('fps-display');
        if (fpsDisplay) {
            fpsDisplay.textContent = `${fps} FPS`;
        }
        fpsFrames = 0;
        fpsLastTime = now;
    }, 500);
}

function cleanupFPSCounter() {
    if (fpsIntervalId) {
        clearInterval(fpsIntervalId);
        fpsIntervalId = null;
    }
}

function initSettingsMenu() {
    // Settings button handler
    document.getElementById('settings-button')?.addEventListener('click', () => {
        setElementDisplay('settings-screen', 'flex');
        updateSettingsUI();
    });

    // Close settings
    document.getElementById('settings-close')?.addEventListener('click', () => {
        setElementDisplay('settings-screen', 'none');
        saveSettings();

        // Return to pause screen if we came from there
        if (window._settingsFromPause && GameState.isPaused) {
            setElementDisplay('pause-screen', 'flex');
            window._settingsFromPause = false;
        }
    });

    // Reset to defaults
    document.getElementById('settings-reset')?.addEventListener('click', () => {
        resetSettings();
    });

    // Sensitivity slider (debounced to prevent excessive updates while dragging)
    document.getElementById('sensitivity-slider')?.addEventListener('input', (e) => {
        userSettings.mouseSensitivity = parseFloat(e.target.value);
        const sensitivityValue = document.getElementById('sensitivity-value');
        if (sensitivityValue) sensitivityValue.textContent = userSettings.mouseSensitivity.toFixed(2);
        applySettingsDebounced();
    });

    // Master volume slider
    document.getElementById('master-volume-slider')?.addEventListener('input', (e) => {
        userSettings.masterVolume = parseFloat(e.target.value);
        const masterVolumeValue = document.getElementById('master-volume-value');
        if (masterVolumeValue) masterVolumeValue.textContent = Math.round(userSettings.masterVolume * 100) + '%';
    });

    // SFX volume slider
    document.getElementById('sfx-volume-slider')?.addEventListener('input', (e) => {
        userSettings.sfxVolume = parseFloat(e.target.value);
        const sfxVolumeValue = document.getElementById('sfx-volume-value');
        if (sfxVolumeValue) sfxVolumeValue.textContent = Math.round(userSettings.sfxVolume * 100) + '%';
    });

    // Music volume slider
    document.getElementById('music-volume-slider')?.addEventListener('input', (e) => {
        userSettings.musicVolume = parseFloat(e.target.value);
        const musicVolumeValue = document.getElementById('music-volume-value');
        if (musicVolumeValue) musicVolumeValue.textContent = Math.round(userSettings.musicVolume * 100) + '%';
    });

    // FOV slider (debounced to prevent excessive updates while dragging)
    document.getElementById('fov-slider')?.addEventListener('input', (e) => {
        userSettings.fieldOfView = parseInt(e.target.value);
        const fovValue = document.getElementById('fov-value');
        if (fovValue) fovValue.textContent = userSettings.fieldOfView + '°';
        applySettingsDebounced();
    });

    // Graphics quality
    document.getElementById('graphics-select')?.addEventListener('change', (e) => {
        userSettings.graphicsQuality = e.target.value;
        applySettings();
    });

    // FPS checkbox
    document.getElementById('fps-checkbox')?.addEventListener('change', (e) => {
        userSettings.showFPS = e.target.checked;
        applySettings();
    });

    // Screen shake checkbox
    document.getElementById('shake-checkbox')?.addEventListener('change', (e) => {
        userSettings.screenShake = e.target.checked;
    });

    updateSettingsUI();
    DebugLog.log('Settings menu initialized', 'success');
}

async function initLeaderboard() {
    await fetchLeaderboard();
    renderLeaderboard('menu-leaderboard-content');
}

function initThreeJS() {
    DebugLog.log('Initializing Three.js renderer...', 'info');

    // Check WebGL availability first
    if (!isWebGLAvailable()) {
        showWebGLError();
        throw new Error('WebGL not available');
    }

    // Initialize static Vector3 constants
    Vec3.init();

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0a);
    scene.fog = new THREE.Fog(0x0a0a0a, 5, 40);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, CONFIG.player.height, 0);

    // Try to create WebGL renderer with error handling
    try {
        renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    } catch (e) {
        DebugLog.log('WebGLRenderer creation failed: ' + e.message, 'error');
        showWebGLError();
        throw new Error('WebGL renderer creation failed');
    }

    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.top = '0';
    renderer.domElement.style.left = '0';
    renderer.domElement.style.zIndex = '1';
    renderer.domElement.style.willChange = 'contents';
    renderer.domElement.id = 'game-canvas';
    document.getElementById('game-container').appendChild(renderer.domElement);

    // Force canvas to stay visible
    renderer.domElement.style.visibility = 'visible';
    renderer.domElement.style.opacity = '1';

    raycaster = new THREE.Raycaster();

    DebugLog.log('Three.js initialized successfully', 'success');
}

function initAudio() {
    DebugLog.log('Initializing audio system...', 'info');
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        DebugLog.log('Audio context created', 'success');
        initAmbientAudio();
    } catch (e) {
        DebugLog.log('Audio not supported: ' + e.message, 'warn');
    }
}

// Check if audio context is ready for use
function isAudioReady() {
    if (!audioContext) return false;
    if (audioContext.state === 'closed') return false;
    // Check for NaN currentTime (can happen in edge cases)
    if (isNaN(audioContext.currentTime)) return false;
    return true;
}

// Pre-warm the audio system to prevent first-shot lag
function warmAudioSystem() {
    if (!audioContext) return;

    try {
        // Resume context if suspended (requires user gesture)
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }

        // Pre-warm by creating and immediately playing a silent oscillator
        // This triggers JIT compilation and buffer allocation
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        gainNode.gain.value = 0; // Silent
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.001);
        oscillator.onended = () => {
            try { oscillator.disconnect(); gainNode.disconnect(); }
            catch (e) { /* Already disconnected */ }
        };

        // Also pre-warm the panner node path
        const panner = audioContext.createPanner();
        const silentOsc = audioContext.createOscillator();
        const silentGain = audioContext.createGain();
        silentGain.gain.value = 0;
        silentOsc.connect(silentGain);
        silentGain.connect(panner);
        panner.connect(audioContext.destination);
        silentOsc.start(audioContext.currentTime);
        silentOsc.stop(audioContext.currentTime + 0.001);
        silentOsc.onended = () => {
            try { silentOsc.disconnect(); silentGain.disconnect(); panner.disconnect(); }
            catch (e) { /* Already disconnected */ }
        };

        DebugLog.log('Audio system warmed up', 'success');
    } catch (e) {
        DebugLog.log('Audio warm-up failed: ' + e.message, 'warn');
    }
}

// ==================== ENHANCED AUDIO SYSTEM ====================
let ambientInterval = null;
let creepyInterval = null;
let droneOscillator = null;
let droneGain = null;
let heartbeatInterval = null;
let footstepTimer = 0;
const FOOTSTEP_INTERVAL = 0.35; // seconds between footsteps when walking
const FOOTSTEP_SPRINT_INTERVAL = 0.25;

// Creepy sound types for random atmospheric effects
const CREEPY_SOUNDS = [
    'whisper',      // Eerie whispers
    'distantScream', // Far-off scream
    'creak',        // Floorboard creak
    'breath',       // Heavy breathing
    'childLaugh',   // Creepy child laugh
    'metalScrape',  // Metal scraping
    'doorSlam',     // Distant door slam
    'footsteps'     // Phantom footsteps
];

function initAmbientAudio() {
    DebugLog.log('Creepy ambient audio system initialized', 'success');
}

function startAmbientSounds() {
    if (ambientInterval) return;

    // Start the creepy drone
    startCreepyDrone();

    // Random zombie groans in the distance
    ambientInterval = setInterval(() => {
        if (!GameState.isRunning || GameState.isPaused) return;

        // Only play if there are zombies
        if (zombies.size > 0 && Math.random() < 0.3) {
            playAmbientZombieSound();
        }
    }, 3000);

    // Random creepy atmospheric sounds
    creepyInterval = setInterval(() => {
        if (!GameState.isRunning || GameState.isPaused) return;

        // 20% chance every 8 seconds
        if (Math.random() < 0.2) {
            const soundType = CREEPY_SOUNDS[Math.floor(Math.random() * CREEPY_SOUNDS.length)];
            playCreepySound(soundType);
        }
    }, 8000);

    // Start heartbeat monitoring
    startHeartbeatMonitor();
}

function stopAmbientSounds() {
    if (ambientInterval) {
        clearInterval(ambientInterval);
        ambientInterval = null;
    }
    if (creepyInterval) {
        clearInterval(creepyInterval);
        creepyInterval = null;
    }
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
    stopCreepyDrone();
}

// Creepy background drone - low rumble that builds tension
function startCreepyDrone() {
    if (!audioContext || droneOscillator) return;

    try {
        // Create multiple oscillators for rich drone sound
        droneOscillator = audioContext.createOscillator();
        const osc2 = audioContext.createOscillator();
        const osc3 = audioContext.createOscillator();

        droneGain = audioContext.createGain();
        const filter = audioContext.createBiquadFilter();

        filter.type = 'lowpass';
        filter.frequency.value = 150;
        filter.Q.value = 2;

        // Connect oscillators
        droneOscillator.connect(filter);
        osc2.connect(filter);
        osc3.connect(filter);
        filter.connect(droneGain);
        droneGain.connect(audioContext.destination);

        // Deep ominous frequencies
        droneOscillator.type = 'sine';
        droneOscillator.frequency.value = 35; // Very low rumble

        osc2.type = 'sine';
        osc2.frequency.value = 52; // Slightly higher

        osc3.type = 'triangle';
        osc3.frequency.value = 28; // Sub-bass

        // Very quiet volume
        const volume = 0.02 * userSettings.masterVolume * userSettings.sfxVolume;
        droneGain.gain.value = volume;

        // Subtle pulsing
        const lfoGain = audioContext.createGain();
        const lfo = audioContext.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 0.1; // Very slow pulse
        lfo.connect(lfoGain);
        lfoGain.gain.value = volume * 0.3;
        lfoGain.connect(droneGain.gain);
        lfo.start();

        droneOscillator.start();
        osc2.start();
        osc3.start();

        // Store references for cleanup
        droneOscillator.osc2 = osc2;
        droneOscillator.osc3 = osc3;
        droneOscillator.lfo = lfo;
        droneOscillator.lfoGain = lfoGain;
        droneOscillator.filter = filter;
    } catch (e) { /* Audio error - silently ignore for user experience */ }
}

function stopCreepyDrone() {
    if (droneOscillator) {
        try {
            droneOscillator.stop();
            droneOscillator.osc2?.stop();
            droneOscillator.osc3?.stop();
            droneOscillator.lfo?.stop();
            // Disconnect nodes to prevent memory leaks
            droneOscillator.disconnect();
            droneOscillator.osc2?.disconnect();
            droneOscillator.osc3?.disconnect();
            droneOscillator.lfo?.disconnect();
            droneOscillator.lfoGain?.disconnect();
            droneOscillator.filter?.disconnect();
        } catch (e) { /* Audio error - silently ignore for user experience */ }
        droneOscillator = null;
        droneGain = null;
    }
}

// Heartbeat sound when low on health
function startHeartbeatMonitor() {
    heartbeatInterval = setInterval(() => {
        if (!GameState.isRunning || GameState.isPaused || !playerState.isAlive) return;

        // Heartbeat when health is low
        if (playerState.health <= 30) {
            playHeartbeat(playerState.health);
        }
    }, 800);
}

function playHeartbeat(health) {
    if (!audioContext) return;

    try {
        const volume = 0.15 * userSettings.masterVolume * userSettings.sfxVolume;
        // Faster and louder as health gets lower
        const intensity = 1 - (health / 30);

        // First beat (lub)
        const osc1 = audioContext.createOscillator();
        const gain1 = audioContext.createGain();
        osc1.type = 'sine';
        osc1.frequency.value = 40;
        osc1.connect(gain1);
        gain1.connect(audioContext.destination);
        gain1.gain.setValueAtTime(volume * (0.3 + intensity * 0.4), audioContext.currentTime);
        gain1.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.1);
        osc1.start(audioContext.currentTime);
        osc1.stop(audioContext.currentTime + 0.1);

        // Second beat (dub)
        setTimeout(() => {
            if (!audioContext) return;
            const osc2 = audioContext.createOscillator();
            const gain2 = audioContext.createGain();
            osc2.type = 'sine';
            osc2.frequency.value = 35;
            osc2.connect(gain2);
            gain2.connect(audioContext.destination);
            gain2.gain.setValueAtTime(volume * (0.2 + intensity * 0.3), audioContext.currentTime);
            gain2.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.15);
            osc2.start(audioContext.currentTime);
            osc2.stop(audioContext.currentTime + 0.15);
        }, 150);
    } catch (e) { /* Audio error - silently ignore for user experience */ }
}

// Random creepy atmospheric sounds
function playCreepySound(type) {
    if (!audioContext) return;

    const volume = 0.06 * userSettings.masterVolume * userSettings.sfxVolume;

    try {
        switch (type) {
            case 'whisper':
                playWhisperSound(volume);
                break;
            case 'distantScream':
                playDistantScream(volume);
                break;
            case 'creak':
                playCreakSound(volume);
                break;
            case 'breath':
                playBreathSound(volume);
                break;
            case 'childLaugh':
                playChildLaugh(volume);
                break;
            case 'metalScrape':
                playMetalScrape(volume);
                break;
            case 'doorSlam':
                playDoorSlam(volume);
                break;
            case 'footsteps':
                playPhantomFootsteps(volume);
                break;
        }
    } catch (e) { /* Audio error - silently ignore for user experience */ }
}

function playWhisperSound(volume) {
    // Filtered noise that sounds like whispering
    const bufferSize = audioContext.sampleRate * 0.8;
    const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.sin(i * 0.001) * Math.exp(-i / (bufferSize * 0.7));
    }

    const source = audioContext.createBufferSource();
    source.buffer = buffer;

    const filter = audioContext.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 800;
    filter.Q.value = 3;

    const gain = audioContext.createGain();
    gain.gain.setValueAtTime(0, audioContext.currentTime);
    gain.gain.linearRampToValueAtTime(volume * 0.5, audioContext.currentTime + 0.2);
    gain.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.8);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(audioContext.destination);
    source.start();
}

function playDistantScream(volume) {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();

    filter.type = 'lowpass';
    filter.frequency.value = 600;

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(400 + Math.random() * 200, audioContext.currentTime);
    osc.frequency.linearRampToValueAtTime(600, audioContext.currentTime + 0.3);
    osc.frequency.linearRampToValueAtTime(200, audioContext.currentTime + 0.8);

    gain.gain.setValueAtTime(0, audioContext.currentTime);
    gain.gain.linearRampToValueAtTime(volume * 0.3, audioContext.currentTime + 0.1);
    gain.gain.linearRampToValueAtTime(0, audioContext.currentTime + 1);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(audioContext.destination);
    osc.start();
    osc.stop(audioContext.currentTime + 1);
}

function playCreakSound(volume) {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();

    osc.type = 'sawtooth';
    const baseFreq = 200 + Math.random() * 100;
    osc.frequency.setValueAtTime(baseFreq, audioContext.currentTime);
    osc.frequency.linearRampToValueAtTime(baseFreq * 1.3, audioContext.currentTime + 0.2);
    osc.frequency.linearRampToValueAtTime(baseFreq * 0.8, audioContext.currentTime + 0.4);

    gain.gain.setValueAtTime(volume * 0.15, audioContext.currentTime);
    gain.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.4);

    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.start();
    osc.stop(audioContext.currentTime + 0.4);
}

function playBreathSound(volume) {
    const bufferSize = audioContext.sampleRate * 1.2;
    const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
        const envelope = Math.sin((i / bufferSize) * Math.PI);
        data[i] = (Math.random() * 2 - 1) * envelope * 0.5;
    }

    const source = audioContext.createBufferSource();
    source.buffer = buffer;

    const filter = audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;

    const gain = audioContext.createGain();
    gain.gain.value = volume * 0.4;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(audioContext.destination);
    source.start();
}

function playChildLaugh(volume) {
    // High-pitched oscillating sound
    for (let i = 0; i < 3; i++) {
        setTimeout(() => {
            if (!audioContext) return;
            const osc = audioContext.createOscillator();
            const gain = audioContext.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(800 + i * 100, audioContext.currentTime);
            osc.frequency.linearRampToValueAtTime(600 + i * 50, audioContext.currentTime + 0.15);

            gain.gain.setValueAtTime(volume * 0.2, audioContext.currentTime);
            gain.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.15);

            osc.connect(gain);
            gain.connect(audioContext.destination);
            osc.start();
            osc.stop(audioContext.currentTime + 0.15);
        }, i * 200);
    }
}

function playMetalScrape(volume) {
    const osc = audioContext.createOscillator();
    const osc2 = audioContext.createOscillator();
    const gain = audioContext.createGain();

    osc.type = 'sawtooth';
    osc2.type = 'square';

    const freq = 100 + Math.random() * 50;
    osc.frequency.setValueAtTime(freq, audioContext.currentTime);
    osc.frequency.linearRampToValueAtTime(freq * 2, audioContext.currentTime + 0.5);
    osc2.frequency.setValueAtTime(freq * 1.01, audioContext.currentTime);
    osc2.frequency.linearRampToValueAtTime(freq * 2.02, audioContext.currentTime + 0.5);

    gain.gain.setValueAtTime(volume * 0.15, audioContext.currentTime);
    gain.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.5);

    osc.connect(gain);
    osc2.connect(gain);
    gain.connect(audioContext.destination);
    osc.start();
    osc2.start();
    osc.stop(audioContext.currentTime + 0.5);
    osc2.stop(audioContext.currentTime + 0.5);
}

function playDoorSlam(volume) {
    const bufferSize = audioContext.sampleRate * 0.3;
    const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.1));
    }

    const source = audioContext.createBufferSource();
    source.buffer = buffer;

    const filter = audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 200;

    const gain = audioContext.createGain();
    gain.gain.value = volume * 0.8;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(audioContext.destination);
    source.start();
}

function playPhantomFootsteps(volume) {
    for (let i = 0; i < 4; i++) {
        setTimeout(() => {
            if (!audioContext) return;
            const bufferSize = audioContext.sampleRate * 0.1;
            const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
            const data = buffer.getChannelData(0);

            for (let j = 0; j < bufferSize; j++) {
                data[j] = (Math.random() * 2 - 1) * Math.exp(-j / (bufferSize * 0.2));
            }

            const source = audioContext.createBufferSource();
            source.buffer = buffer;

            const filter = audioContext.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 300;

            const gain = audioContext.createGain();
            gain.gain.value = volume * 0.3;

            source.connect(filter);
            filter.connect(gain);
            gain.connect(audioContext.destination);
            source.start();
        }, i * 400 + Math.random() * 100);
    }
}

function playAmbientZombieSound() {
    if (!audioContext) return;

    try {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        const filter = audioContext.createBiquadFilter();

        filter.type = 'lowpass';
        filter.frequency.value = 200;

        oscillator.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.type = 'sawtooth';
        const baseFreq = 50 + Math.random() * 30;
        oscillator.frequency.setValueAtTime(baseFreq, audioContext.currentTime);
        oscillator.frequency.linearRampToValueAtTime(baseFreq * 0.7, audioContext.currentTime + 0.5);
        oscillator.frequency.linearRampToValueAtTime(baseFreq * 0.5, audioContext.currentTime + 1);

        const volume = 0.05 * userSettings.masterVolume * userSettings.sfxVolume;
        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(volume, audioContext.currentTime + 0.2);
        gainNode.gain.linearRampToValueAtTime(volume * 0.5, audioContext.currentTime + 0.8);
        gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 1.2);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 1.2);
    } catch (e) { /* Audio error - silently ignore for user experience */ }
}

function updateFootsteps(delta, isMoving, isSprinting) {
    if (!isMoving || !playerState.isAlive) {
        footstepTimer = 0;
        return;
    }

    const interval = isSprinting ? FOOTSTEP_SPRINT_INTERVAL : FOOTSTEP_INTERVAL;
    footstepTimer += delta;

    if (footstepTimer >= interval) {
        footstepTimer = 0;
        playFootstepSound();
    }
}

function playFootstepSound() {
    if (!isAudioReady()) return;

    try {
        // Create noise for footstep
        const bufferSize = audioContext.sampleRate * 0.08;
        const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
        }

        const source = audioContext.createBufferSource();
        source.buffer = buffer;

        const filter = audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 800 + Math.random() * 400;

        const gainNode = audioContext.createGain();
        const volume = 0.08 * userSettings.masterVolume * userSettings.sfxVolume;
        gainNode.gain.setValueAtTime(volume, audioContext.currentTime);

        source.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(audioContext.destination);

        source.start(audioContext.currentTime);
    } catch (e) { /* Audio error - silently ignore for user experience */ }
}

function playZombieDeathSound(position) {
    if (!isAudioReady()) return;

    try {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        // 3D positioning
        const panner = audioContext.createPanner();
        panner.panningModel = 'HRTF';
        panner.distanceModel = 'inverse';
        panner.refDistance = 2;
        panner.maxDistance = 40;
        panner.setPosition(position.x, position.y || 1, position.z);

        if (player) {
            const listener = audioContext.listener;
            listener.setPosition(player.position.x, player.position.y, player.position.z);
        }

        oscillator.connect(gainNode);
        gainNode.connect(panner);
        panner.connect(audioContext.destination);

        // Dying groan
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(120, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(40, audioContext.currentTime + 0.4);

        const volume = 0.2 * userSettings.masterVolume * userSettings.sfxVolume;
        gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.4);

        // Clean up audio nodes when oscillator ends to prevent memory leaks
        oscillator.onended = () => {
            try { oscillator.disconnect(); gainNode.disconnect(); panner.disconnect(); }
            catch (e) { /* Already disconnected */ }
        };
    } catch (e) { /* Audio error - silently ignore for user experience */ }
}

function getEffectiveVolume() {
    return userSettings.masterVolume * userSettings.sfxVolume;
}

// ==================== CACHED GEOMETRIES (Prevent first-shot lag) ====================
// Pre-created geometries and materials to avoid JIT compilation on first use
const cachedGeometries = {
    initialized: false,
    // Geometries
    flashCore: null,
    flashGlow: null,
    spark: null,
    bloodSphere: null,
    shellCasing: null,
    hitMarker: null,
    // Materials
    flashCoreMat: null,
    flashGlowMat: null,
    sparkMat: null,

    init() {
        if (this.initialized) return;

        // Muzzle flash geometries
        this.flashCore = new THREE.SphereGeometry(0.08, 12, 12);
        this.flashGlow = new THREE.SphereGeometry(0.15, 12, 12);
        this.spark = new THREE.SphereGeometry(0.02, 4, 4);

        // Blood and debris
        this.bloodSphere = new THREE.SphereGeometry(0.03, 4, 4);
        this.shellCasing = new THREE.CylinderGeometry(0.008, 0.008, 0.025, 6);

        // Hit marker
        this.hitMarker = new THREE.RingGeometry(0.03, 0.06, 16);

        // Pre-create materials (cloned when used)
        this.flashCoreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1 });
        this.flashGlowMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.8 });
        this.sparkMat = new THREE.MeshBasicMaterial({ color: 0xffff44, transparent: true, opacity: 1 });

        this.initialized = true;
        DebugLog.log('Cached geometries initialized', 'info');
    }
};

// ==================== PARTICLE SYSTEM (Object Pooling) ====================
// Pool stores inactive particles for reuse, reducing GC pressure
const particlePool = {
    blood: [],
    shells: [],
    debris: [],
    flash: [],       // Muzzle flash components
    sparks: [],      // Spark particles
    maxParticles: 100,

    // Pre-allocate common particles to avoid initial allocation spikes
    preallocate() {
        // Initialize cached geometries first
        cachedGeometries.init();

        const bloodMat = new THREE.MeshBasicMaterial({ color: 0x8b0000, transparent: true });
        for (let i = 0; i < 20; i++) {
            const mesh = new THREE.Mesh(cachedGeometries.bloodSphere, bloodMat.clone());
            mesh.visible = false;
            this.blood.push({ mesh, type: 'blood' });
        }

        // Pre-allocate shell casings
        const shellMat = new THREE.MeshStandardMaterial({ color: 0xd4a017, metalness: 0.8 });
        for (let i = 0; i < 10; i++) {
            const mesh = new THREE.Mesh(cachedGeometries.shellCasing, shellMat.clone());
            mesh.visible = false;
            this.shells.push({ mesh, type: 'shell' });
        }

        // Pre-allocate muzzle flash components
        for (let i = 0; i < 3; i++) {
            const core = new THREE.Mesh(cachedGeometries.flashCore, cachedGeometries.flashCoreMat.clone());
            const glow = new THREE.Mesh(cachedGeometries.flashGlow, cachedGeometries.flashGlowMat.clone());
            core.visible = false;
            glow.visible = false;
            this.flash.push({ core, glow });
        }

        // Pre-allocate spark particles
        for (let i = 0; i < 20; i++) {
            const spark = new THREE.Mesh(cachedGeometries.spark, cachedGeometries.sparkMat.clone());
            spark.visible = false;
            this.sparks.push(spark);
        }

        DebugLog.log(`Particle pool pre-allocated: ${this.blood.length} blood, ${this.shells.length} shells, ${this.flash.length} flash sets, ${this.sparks.length} sparks`, 'info');
    },

    // Get stats for debugging
    getStats() {
        return {
            blood: this.blood.length,
            shells: this.shells.length,
            debris: this.debris.length,
            flash: this.flash.length,
            sparks: this.sparks.length,
            active: activeParticles.length
        };
    },

    // Dispose all pooled particles and their materials
    dispose() {
        // Dispose blood particles
        this.blood.forEach(p => {
            if (p.mesh) {
                if (p.mesh.material) p.mesh.material.dispose();
                if (p.mesh.geometry && p.mesh.geometry !== cachedGeometries.bloodSphere) {
                    p.mesh.geometry.dispose();
                }
            }
        });
        this.blood.length = 0;

        // Dispose shell casings
        this.shells.forEach(p => {
            if (p.mesh) {
                if (p.mesh.material) p.mesh.material.dispose();
            }
        });
        this.shells.length = 0;

        // Dispose debris
        this.debris.forEach(p => {
            if (p.mesh) {
                if (p.mesh.material) p.mesh.material.dispose();
                if (p.mesh.geometry) p.mesh.geometry.dispose();
            }
        });
        this.debris.length = 0;

        // Dispose muzzle flash components
        this.flash.forEach(f => {
            if (f.core && f.core.material) f.core.material.dispose();
            if (f.glow && f.glow.material) f.glow.material.dispose();
        });
        this.flash.length = 0;

        // Dispose sparks
        this.sparks.forEach(s => {
            if (s.material) s.material.dispose();
        });
        this.sparks.length = 0;

        // Also clear active particles array
        activeParticles.length = 0;

        DebugLog.log('Particle pool disposed', 'info');
    }
};

const activeParticles = [];

function spawnBloodParticles(position, count = 8) {
    const bloodMat = new THREE.MeshBasicMaterial({ color: 0x8b0000 });

    for (let i = 0; i < count; i++) {
        let particle;

        // Reuse from pool if available
        if (particlePool.blood.length > 0) {
            particle = particlePool.blood.pop();
            particle.mesh.visible = true;
            // Reset opacity from previous use
            if (particle.mesh.material) {
                particle.mesh.material.opacity = 1;
            }
        } else {
            const geo = new THREE.SphereGeometry(0.03 + Math.random() * 0.02, 4, 4);
            const mesh = new THREE.Mesh(geo, bloodMat.clone());
            particle = { mesh, type: 'blood' };
        }

        // Set initial position
        particle.mesh.position.set(
            position.x + (Math.random() - 0.5) * 0.3,
            position.y + Math.random() * 0.5 + 0.5,
            position.z + (Math.random() - 0.5) * 0.3
        );

        // Random velocity (reuse existing Vector3 if available)
        if (particle.velocity) {
            particle.velocity.set(
                (Math.random() - 0.5) * 4,
                Math.random() * 3 + 1,
                (Math.random() - 0.5) * 4
            );
        } else {
            particle.velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 4,
                Math.random() * 3 + 1,
                (Math.random() - 0.5) * 4
            );
        }

        particle.life = 1.0;
        particle.decay = 0.8 + Math.random() * 0.4;

        scene.add(particle.mesh);
        activeParticles.push(particle);
    }
}

function spawnShellCasing(position, direction) {
    const shellMat = new THREE.MeshStandardMaterial({
        color: 0xd4a017,
        metalness: 0.8,
        roughness: 0.3,
        emissive: 0xd4a017,
        emissiveIntensity: 0.1
    });

    let particle;

    if (particlePool.shells.length > 0) {
        particle = particlePool.shells.pop();
        particle.mesh.visible = true;
    } else {
        const geo = new THREE.CylinderGeometry(0.008, 0.008, 0.025, 6);
        const mesh = new THREE.Mesh(geo, shellMat.clone());
        particle = { mesh, type: 'shell' };
    }

    // Eject to the right of the weapon (use static vector to avoid allocation)
    const right = Vec3.temp.copy(Vec3.RIGHT).applyQuaternion(camera.quaternion);

    particle.mesh.position.copy(position);
    particle.mesh.position.add(Vec3.temp2.copy(right).multiplyScalar(0.2));

    // Reuse existing Vector3 objects if available
    if (particle.velocity) {
        particle.velocity.set(
            right.x * 3 + (Math.random() - 0.5),
            2 + Math.random(),
            right.z * 3 + (Math.random() - 0.5)
        );
    } else {
        particle.velocity = new THREE.Vector3(
            right.x * 3 + (Math.random() - 0.5),
            2 + Math.random(),
            right.z * 3 + (Math.random() - 0.5)
        );
    }

    if (particle.angularVelocity) {
        particle.angularVelocity.set(
            Math.random() * 10,
            Math.random() * 10,
            Math.random() * 10
        );
    } else {
        particle.angularVelocity = new THREE.Vector3(
            Math.random() * 10,
            Math.random() * 10,
            Math.random() * 10
        );
    }

    particle.life = 1.0;
    particle.decay = 0.3;

    scene.add(particle.mesh);
    activeParticles.push(particle);
}

function spawnDebris(position, count = 5) {
    const colors = [0x444444, 0x555555, 0x666666, 0x333333];

    for (let i = 0; i < count; i++) {
        let particle;

        if (particlePool.debris.length > 0) {
            particle = particlePool.debris.pop();
            particle.mesh.visible = true;
        } else {
            const size = 0.02 + Math.random() * 0.03;
            const geo = new THREE.BoxGeometry(size, size, size);
            const mat = new THREE.MeshStandardMaterial({
                color: colors[Math.floor(Math.random() * colors.length)]
            });
            const mesh = new THREE.Mesh(geo, mat);
            particle = { mesh, type: 'debris' };
        }

        particle.mesh.position.copy(position);

        // Reuse existing Vector3 objects if available
        if (particle.velocity) {
            particle.velocity.set(
                (Math.random() - 0.5) * 5,
                Math.random() * 4 + 2,
                (Math.random() - 0.5) * 5
            );
        } else {
            particle.velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 5,
                Math.random() * 4 + 2,
                (Math.random() - 0.5) * 5
            );
        }

        if (particle.angularVelocity) {
            particle.angularVelocity.set(
                Math.random() * 8,
                Math.random() * 8,
                Math.random() * 8
            );
        } else {
            particle.angularVelocity = new THREE.Vector3(
                Math.random() * 8,
                Math.random() * 8,
                Math.random() * 8
            );
        }

        particle.life = 1.0;
        particle.decay = 0.5 + Math.random() * 0.3;

        scene.add(particle.mesh);
        activeParticles.push(particle);
    }
}

function updateParticles(delta) {
    const gravity = -15;

    for (let i = activeParticles.length - 1; i >= 0; i--) {
        const particle = activeParticles[i];

        // Update position (use static vector to avoid allocation)
        Vec3.temp.copy(particle.velocity).multiplyScalar(delta);
        particle.mesh.position.add(Vec3.temp);

        // Apply gravity
        particle.velocity.y += gravity * delta;

        // Update rotation for shells and debris
        if (particle.angularVelocity) {
            particle.mesh.rotation.x += particle.angularVelocity.x * delta;
            particle.mesh.rotation.y += particle.angularVelocity.y * delta;
            particle.mesh.rotation.z += particle.angularVelocity.z * delta;
        }

        // Bounce off ground
        if (particle.mesh.position.y < 0.05) {
            particle.mesh.position.y = 0.05;
            particle.velocity.y *= -0.3;
            particle.velocity.x *= 0.7;
            particle.velocity.z *= 0.7;

            if (particle.angularVelocity) {
                particle.angularVelocity.multiplyScalar(0.5);
            }
        }

        // Decay life
        particle.life -= particle.decay * delta;

        // Fade out blood particles
        if (particle.type === 'blood' && particle.mesh.material) {
            particle.mesh.material.opacity = particle.life;
            particle.mesh.material.transparent = true;
        }

        // Remove dead particles
        if (particle.life <= 0) {
            scene.remove(particle.mesh);
            particle.mesh.visible = false;

            // Return to pool
            if (particlePool[particle.type] && particlePool[particle.type].length < particlePool.maxParticles) {
                particlePool[particle.type].push(particle);
            }

            activeParticles.splice(i, 1);
        }
    }
}

// ==================== MULTIPLAYER CONNECTION ====================
let reconnectAttempts = 0;
let isReconnecting = false;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_BASE = 2000;

let connectionTimeout = null;

function connectToServer() {
    // Don't reconnect if we've exceeded attempts or user left lobby
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        DebugLog.log('Max reconnection attempts reached', 'error');
        const lobbyStatus = document.getElementById('lobby-status');
        const readyBtn = document.getElementById('ready-button');
        if (lobbyStatus) lobbyStatus.textContent = 'Connection failed. Please try again.';
        if (readyBtn) readyBtn.disabled = true;
        return;
    }

    // Determine WebSocket URL - use production server for Electron/file:// or same host for web
    let wsUrl;
    if (window.location.protocol === 'file:' || !window.location.host) {
        // Running in Electron or local file - connect to production server
        wsUrl = 'wss://aspensplayground.com';
    } else {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        wsUrl = `${protocol}//${window.location.host}`;
    }

    DebugLog.log(`Connecting to server: ${wsUrl}`, 'net');

    // Update status to show we're connecting
    const lobbyStatusEl = document.getElementById('lobby-status');
    const readyBtnEl = document.getElementById('ready-button');
    if (lobbyStatusEl) lobbyStatusEl.textContent = 'Connecting to server...';
    if (readyBtnEl) readyBtnEl.disabled = true;

    try {
        socket = new WebSocket(wsUrl);
    } catch (e) {
        DebugLog.log(`Failed to create WebSocket: ${e.message}`, 'error');
        if (lobbyStatusEl) lobbyStatusEl.textContent = 'Failed to connect. Check your connection.';
        return;
    }

    // Set a connection timeout for mobile - if no response in 10 seconds, assume failure
    if (connectionTimeout) clearTimeout(connectionTimeout);
    connectionTimeout = setTimeout(() => {
        if (!GameState.isConnected && socket && socket.readyState === WebSocket.CONNECTING) {
            DebugLog.log('Connection timeout', 'error');
            socket.close();
            const status = document.getElementById('lobby-status');
            const btn = document.getElementById('ready-button');
            if (status) status.textContent = 'Connection timed out. Tap to retry.';
            if (btn) btn.disabled = true;
        }
    }, 10000);

    socket.onopen = () => {
        if (connectionTimeout) {
            clearTimeout(connectionTimeout);
            connectionTimeout = null;
        }
        DebugLog.log('Connected to server!', 'success');
        GameState.isConnected = true;
        reconnectAttempts = 0; // Reset on successful connection
        updateConnectionStatus(true);
        const lobbyStatus = document.getElementById('lobby-status');
        if (lobbyStatus) lobbyStatus.textContent = 'Connected! Waiting for server...';

        // Send player name to server
        const playerName = getPlayerName();
        if (playerName && playerName !== 'Anonymous') {
            sendToServer({ type: 'setName', name: playerName });
        }

        // Send cosmetic selection to server
        sendToServer({ type: 'setCosmetic', cosmetic: selectedCosmetic });

        // Start latency tracking
        startPingInterval();
    };

    socket.onclose = (event) => {
        // Stop latency tracking
        stopPingInterval();
        if (connectionTimeout) {
            clearTimeout(connectionTimeout);
            connectionTimeout = null;
        }
        DebugLog.log(`Disconnected from server (code: ${event.code})`, 'warn');
        GameState.isConnected = false;
        updateConnectionStatus(false);
        const readyBtn = document.getElementById('ready-button');
        if (readyBtn) readyBtn.disabled = true;

        // Only reconnect if we're still in multiplayer mode and in lobby
        // Use isReconnecting flag to prevent multiple parallel reconnect attempts
        if (GameState.mode === 'multiplayer' && GameState.isInLobby && !isReconnecting) {
            isReconnecting = true;
            reconnectAttempts++;
            const delay = RECONNECT_DELAY_BASE * Math.pow(1.5, reconnectAttempts - 1);
            const lobbyStatus = document.getElementById('lobby-status');
            if (lobbyStatus) lobbyStatus.textContent = `Reconnecting... (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`;

            setTimeout(() => {
                isReconnecting = false;
                if (GameState.mode === 'multiplayer' && !GameState.isConnected) {
                    connectToServer();
                }
            }, delay);
        }
    };

    socket.onerror = (error) => {
        if (connectionTimeout) {
            clearTimeout(connectionTimeout);
            connectionTimeout = null;
        }
        // Log more details about the error
        const errorDetails = error.message || error.type || 'Unknown WebSocket error';
        DebugLog.log(`WebSocket error: ${errorDetails}`, 'error');
        console.error('WebSocket error details:', error);
        const lobbyStatus = document.getElementById('lobby-status');
        const readyBtn = document.getElementById('ready-button');
        if (lobbyStatus) lobbyStatus.textContent = 'Connection error. Check your network.';
        if (readyBtn) readyBtn.disabled = true;
    };

    socket.onmessage = async (event) => {
        try {
            // Check if message is binary (ArrayBuffer or Blob)
            if (event.data instanceof ArrayBuffer) {
                handleBinaryMessage(new DataView(event.data));
            } else if (event.data instanceof Blob) {
                const buffer = await event.data.arrayBuffer();
                handleBinaryMessage(new DataView(buffer));
            } else {
                // JSON message
                const message = JSON.parse(event.data);
                handleServerMessage(message);
            }
        } catch (e) {
            DebugLog.log(`Error parsing server message: ${e.message}`, 'error');
        }
    };
}

// ==================== BINARY PROTOCOL DECODER ====================
const BinaryMsgType = { SYNC: 1, ZOMBIE_SPAWN: 2, ZOMBIE_KILL: 3, PLAYER_POS: 4 };
const ZombieTypes = ['normal', 'runner', 'crawler', 'tank', 'spitter', 'exploder', 'minion', 'boss'];

function handleBinaryMessage(view) {
    const msgType = view.getUint8(0);

    if (msgType === BinaryMsgType.SYNC) {
        decodeBinarySync(view);
    }
}

function decodeBinarySync(view) {
    let offset = 1;

    // Header
    const zombieCount = view.getUint16(offset, true); offset += 2;
    offset += 2; // reserved

    // Game state
    const wave = view.getUint16(offset, true); offset += 2;
    const zombiesRemaining = view.getUint16(offset, true); offset += 2;
    const totalKills = view.getUint32(offset, true); offset += 4;
    const totalScore = view.getUint32(offset, true); offset += 4;
    offset += 4; // reserved

    // Update game state
    GameState.wave = wave;
    GameState.zombiesRemaining = zombiesRemaining;
    GameState.totalKills = totalKills;
    GameState.totalScore = totalScore;

    // Server sends actual zombie ID numbers now
    // No need for ID mapping - server sends actual zombie IDs

    // Decode zombies
    for (let i = 0; i < zombieCount; i++) {
        // Using UInt32 for zombie ID to prevent overflow after 65535 zombies
        const idx = view.getUint32(offset, true); offset += 4;
        const typeCode = view.getUint8(offset); offset += 1;
        const isAlive = view.getUint8(offset) === 1; offset += 1;
        const x = view.getFloat32(offset, true); offset += 4;
        const z = view.getFloat32(offset, true); offset += 4;
        const rotation = view.getFloat32(offset, true); offset += 4;
        const health = view.getUint16(offset, true); offset += 2;

        // Find matching zombie by index or create position reference
        const zombieId = `zombie_${idx}`;
        if (zombieId) {
            const zombie = zombies.get(zombieId);
            if (zombie) {
                zombie.position.x = x;
                zombie.position.z = z;
                zombie.rotation = rotation;
                zombie.health = health;
                zombie.isAlive = isAlive;
                zombie.type = ZombieTypes[typeCode] || 'normal';

                // Update interpolation targets (used by render loop)
                zombie.targetPosition = { x: x, z: z };
                zombie.targetRotation = rotation;

                // Update mesh position
                if (zombie.mesh) {
                    // Let interpolation handle position - zombie.mesh.position.x = x;
                    // zombie.mesh.position.z = z;
                    // zombie.mesh.rotation.y = rotation;
                    zombie.mesh.visible = isAlive;
                }
            }
        }
    }

    updateHUD();
}

function handleServerMessage(message) {
    switch (message.type) {
        case 'init':
            handleInit(message);
            break;

        case 'lobbyUpdate':
            handleLobbyUpdate(message);
            break;

        case 'lobbyCountdown':
            handleLobbyCountdown(message);
            break;

        case 'playerJoined':
            handlePlayerJoined(message.player);
            break;

        case 'playerLeft':
            handlePlayerLeft(message.playerId);
            break;

        case 'playerUpdate':
            handlePlayerUpdate(message);
            break;

        case 'playerShoot':
            handleRemotePlayerShoot(message);
            break;

        case 'playerDamaged':
            handlePlayerDamaged(message);
            break;

        case 'playerDied':
            handlePlayerDied(message.playerId);
            break;

        case 'playerHealthSync':
            handlePlayerHealthSync(message);
            break;

        case 'zombieSpawned':
            handleZombieSpawned(message.zombie);
            break;

        case 'zombieDamaged':
            handleZombieDamaged(message);
            break;

        case 'zombieKilled':
            handleZombieKilled(message);
            break;

        case 'zombieAttack':
            handleZombieAttack(message);
            break;

        case 'pickupSpawned':
            handlePickupSpawned(message.pickup);
            break;

        case 'pickupCollected':
            handlePickupCollected(message);
            break;

        case 'pickupRemoved':
            handlePickupRemoved(message.pickupId);
            break;

        case 'waveStart':
            handleWaveStart(message).catch(err => {
                DebugLog.log('Error in handleWaveStart: ' + err.message, 'error');
            });
            break;

        case 'waveComplete':
            handleWaveComplete(message);
            break;

        case 'gameStart':
            handleGameStart(message);
            break;

        case 'gameOver':
            handleGameOver(message);
            break;

        case 'gameReset':
            handleGameReset();
            break;

        case 'sync':
            handleSync(message);
            break;

        case 'playerNameChange':
            handlePlayerNameChange(message);
            break;

        case 'playerCosmeticChange':
            handlePlayerCosmeticChange(message);
            break;

        case 'chat':
            handleChat(message);
            break;

        case 'shopSync':
            WeaponUpgrades.handleShopSync(message);
            break;

        case 'pong':
            handlePong(message);
            break;

        case 'zombieAbility':
            handleZombieAbility(message);
            break;

        case 'bossGroundSlam':
            handleBossGroundSlam(message);
            break;

        case 'bossCharge':
            handleBossCharge(message);
            break;

        case 'bossSummon':
            handleBossSummon(message);
            break;

        case 'exploderExplosion':
            handleExploderExplosion(message);
            break;

        default:
            DebugLog.log(`Unknown message type: ${message.type}`, 'warn');
    }
}

// ==================== NETWORK LATENCY TRACKING ====================
let lastPingTime = 0;
let networkLatency = 0;
let pingInterval = null;

function startPingInterval() {
    // Send ping every 5 seconds to track latency
    if (pingInterval) clearInterval(pingInterval);
    pingInterval = setInterval(() => {
        if (socket && socket.readyState === WebSocket.OPEN) {
            lastPingTime = performance.now();
            sendToServer({ type: 'ping', timestamp: lastPingTime });
        }
    }, 5000);
}

function stopPingInterval() {
    if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
    }
}

function handlePong(message) {
    if (lastPingTime > 0) {
        networkLatency = Math.round(performance.now() - lastPingTime);
        // Log high latency warnings
        if (networkLatency > 200) {
            DebugLog.log(`High latency detected: ${networkLatency}ms`, 'warn');
        }
    }
}

function getNetworkLatency() {
    return networkLatency;
}

function sendToServer(message) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        try {
            socket.send(JSON.stringify(message));
        } catch (e) {
            DebugLog.log(`WebSocket send error: ${e.message}`, 'error');
            // Socket may have closed between readyState check and send
            if (socket.readyState !== WebSocket.OPEN) {
                GameState.isConnected = false;
            }
        }
    }
}

// ==================== MESSAGE HANDLERS ====================
function handleInit(message) {
    localPlayerId = message.playerId;
    localPlayerData = message.player;
    sessionToken = message.sessionToken;  // Store session token for authenticated actions

    DebugLog.log(`Initialized as ${localPlayerData.name} (${localPlayerId})`, 'success');

    // Set initial position
    player.position.set(
        localPlayerData.position.x,
        CONFIG.player.height,
        localPlayerData.position.z
    );

    // Set player state from server
    playerState.health = localPlayerData.health || CONFIG.player.maxHealth;
    playerState.isAlive = true;

    // Add local player to lobby state first
    LobbyState.players.set(localPlayerId, {
        id: localPlayerId,
        name: localPlayerData.name,
        isReady: localPlayerData.isReady || false,
        color: localPlayerData.color,
        cosmetic: localPlayerData.cosmetic || selectedCosmetic
    });

    // Add existing players to lobby state
    if (Array.isArray(message.players)) {
        message.players.forEach(p => {
            LobbyState.players.set(p.id, p);
            handlePlayerJoined(p);
        });
    }

    // Check if in lobby or game
    if (message.gameState.isInLobby) {
        GameState.isInLobby = true;
        GameState.isRunning = false;
        GameState.isReady = localPlayerData.isReady || false;

        // Enable ready button
        const readyBtn = document.getElementById('ready-button');
        const lobbyStatus = document.getElementById('lobby-status');
        if (readyBtn) readyBtn.disabled = false;
        if (lobbyStatus) lobbyStatus.textContent = 'Press READY when you want to start!';

        // Update lobby player list
        updateLobbyPlayerList();

        // Send player name to server (in case it wasn't sent or was sent before init)
        const savedName = localStorage.getItem('playerName');
        if (savedName && savedName !== localPlayerData.name) {
            sendToServer({ type: 'setName', name: savedName });
            // Update local lobby entry immediately for better UX
            const localLobbyPlayer = LobbyState.players.get(localPlayerId);
            if (localLobbyPlayer) {
                localLobbyPlayer.name = savedName;
                updateLobbyPlayerList();
            }
        }

        DebugLog.log('Connected to lobby', 'net');
    } else if (message.gameState.isRunning) {
        // Join existing game
        GameState.isInLobby = false;
        GameState.isRunning = true;
        GameState.isGameOver = false;
        GameState.wave = message.gameState.wave;
        GameState.zombiesRemaining = message.gameState.zombiesRemaining;

        // Add existing zombies
        if (Array.isArray(message.zombies)) {
            message.zombies.forEach(z => {
                handleZombieSpawned(z);
            });
        }

        // Add existing pickups
        if (Array.isArray(message.pickups)) {
            message.pickups.forEach(p => {
                handlePickupSpawned(p);
            });
        }

        DebugLog.log(`Joining existing game at Wave ${GameState.wave}`, 'game');

        // Make sure UI is in game state
        setElementDisplay('lobby-screen', 'none');
        setElementDisplay('start-screen', 'none');
        setElementDisplay('game-over-screen', 'none');
        setElementDisplay('hud', 'flex');
        setElementDisplay('crosshair', 'block');
        setElementDisplay('multiplayer-panel', 'block');

        // Request pointer lock after a short delay
        setTimeout(() => {
            document.body.requestPointerLock();
        }, 500);

        updateHUD();
    }

    updatePlayerList();
}

function handleLobbyUpdate(message) {
    // Update lobby players
    LobbyState.players.clear();
    if (!Array.isArray(message.players)) return;
    message.players.forEach(p => {
        LobbyState.players.set(p.id, p);

        // Sync local player's ready state with server
        if (p.id === localPlayerId) {
            GameState.isReady = p.isReady;
            const btn = document.getElementById('ready-button');
            if (btn) {
                if (p.isReady) {
                    btn.textContent = 'READY!';
                    btn.classList.add('ready');
                } else {
                    btn.textContent = 'READY';
                    btn.classList.remove('ready');
                }
            }
        }
    });
    LobbyState.allReady = message.allReady;

    updateLobbyPlayerList();
}

function handleLobbyCountdown(message) {
    const lobbyStatus = document.getElementById('lobby-status');
    if (!lobbyStatus) return;

    if (message.cancelled) {
        lobbyStatus.textContent = 'Countdown cancelled - waiting for players';
    } else if (message.seconds > 0) {
        lobbyStatus.textContent = `Game starting in ${message.seconds}...`;
    }
}

function updateLobbyPlayerList() {
    const listEl = document.getElementById('lobby-player-list');
    if (!listEl) return;

    listEl.innerHTML = '';

    LobbyState.players.forEach((player, id) => {
        const div = document.createElement('div');
        div.className = 'lobby-player' + (player.isReady ? ' ready' : '') + (id === localPlayerId ? ' you' : '');

        div.innerHTML = `
            <span class="player-name">${escapeHtml(player.name)}</span>
            <span class="player-status ${player.isReady ? 'ready' : 'waiting'}">${player.isReady ? 'READY' : 'Waiting...'}</span>
        `;

        listEl.appendChild(div);
    });

    // Update lobby status
    const readyCount = Array.from(LobbyState.players.values()).filter(p => p.isReady).length;
    const total = LobbyState.players.size;
    if (total > 0 && !LobbyState.allReady) {
        const lobbyStatus = document.getElementById('lobby-status');
        if (lobbyStatus) lobbyStatus.textContent = `${readyCount}/${total} players ready`;
    }
}

function handlePlayerJoined(playerData) {
    DebugLog.log(`Player joined: ${playerData.name}`, 'net');

    // Add animation tracking properties
    playerData.walkCycle = Math.random() * Math.PI * 2;
    playerData.prevPosition = { x: playerData.position.x, z: playerData.position.z };
    playerData.isMoving = false;
    playerData.shootAnimTime = 0;

    // Initialize health tracking
    playerData.health = playerData.health || 100;
    playerData.maxHealth = playerData.maxHealth || 100;

    remotePlayers.set(playerData.id, playerData);
    createRemotePlayerMesh(playerData);

    // Update nametag with initial health
    const healthPercent = playerData.health / playerData.maxHealth;
    updatePlayerNametag(playerData.id, healthPercent);

    updatePlayerList();
}

function handlePlayerLeft(playerId) {
    const playerData = remotePlayers.get(playerId);
    if (playerData) {
        DebugLog.log(`Player left: ${playerData.name}`, 'net');
    }

    remotePlayers.delete(playerId);

    const mesh = remotePlayerMeshes.get(playerId);
    if (mesh) {
        scene.remove(mesh);
        remotePlayerMeshes.delete(playerId);
    }

    updatePlayerList();
}

function handlePlayerUpdate(message) {
    const playerData = remotePlayers.get(message.playerId);
    if (playerData) {
        // Track movement for animation
        const dx = message.position.x - playerData.position.x;
        const dz = message.position.z - playerData.position.z;
        const moveDistance = Math.sqrt(dx * dx + dz * dz);
        playerData.isMoving = moveDistance > 0.01;
        playerData.prevPosition = { x: playerData.position.x, z: playerData.position.z };

        playerData.position = message.position;
        playerData.rotation = message.rotation;

        // Set interpolation targets (mesh will smoothly move toward these)
        Interpolation.updateEntity(playerData, message.position, message.rotation.y);
        playerData.targetHeadRotation = message.rotation.x; // Full vertical aim range
    }
}

// Apply interpolation to remote players each frame
function updateRemotePlayerPositions() {
    remotePlayers.forEach((playerData, playerId) => {
        const mesh = remotePlayerMeshes.get(playerId);
        if (mesh && playerData.targetPosition) {
            // Smooth position interpolation and body rotation (rotation.y)
            Interpolation.applyInterpolation(playerData, mesh);

            // Get the vertical aim pitch (rotation.x)
            const targetPitch = playerData.targetHeadRotation !== undefined ? playerData.targetHeadRotation : 0;

            // Smooth head rotation (pitch)
            const head = mesh.children.find(c => c.userData.isHead);
            if (head) {
                head.rotation.x = Interpolation.lerp(head.rotation.x, targetPitch, 0.2);
            }

            // Arms follow head pitch (but more subtle)
            const armGroup = mesh.children.find(c => c.userData.isArms);
            if (armGroup) {
                // Apply pitch to the entire arm group
                const armPitch = targetPitch * 0.7; // Arms pitch slightly less than head
                armGroup.rotation.x = Interpolation.lerp(armGroup.rotation.x || 0, armPitch, 0.2);
            }

            // Weapon follows head pitch
            const weaponGroup = mesh.children.find(c => c.userData.isWeapon);
            if (weaponGroup) {
                // Weapon pitches with the player's aim
                const weaponPitch = targetPitch * 0.8;
                weaponGroup.rotation.x = Interpolation.lerp(
                    weaponGroup.rotation.x || -0.2,
                    -0.2 + weaponPitch, // Base rotation + pitch
                    0.2
                );
            }
        }
    });
}

function handleRemotePlayerShoot(message) {
    // Trigger shoot animation on remote player
    const playerData = remotePlayers.get(message.playerId);
    if (playerData) {
        playerData.shootAnimTime = 0.2; // 200ms shoot animation
    }

    // Create muzzle flash for remote player
    const mesh = remotePlayerMeshes.get(message.playerId);
    if (mesh) {
        createRemoteMuzzleFlash(mesh);
        playSound('shoot');
    }
}

function handlePlayerDamaged(message) {
    if (typeof message.health === 'number') {
        playerState.health = message.health;
    }

    // Red flash effect
    const overlay = document.getElementById('damage-overlay');
    if (overlay) {
        overlay.style.opacity = '0.5';
        setTimeout(() => {
            overlay.style.opacity = '0';
        }, 200);
    }

    // Screen shake
    screenShake();
    updateHUD();
}

function handlePlayerDied(playerId) {
    if (playerId === localPlayerId) {
        playerState.isAlive = false;
        playerState.health = 0;
        DebugLog.log('You died!', 'error');

        // In multiplayer, try to enter spectator mode if other players are alive
        if (GameState.mode === 'multiplayer') {
            const alivePlayers = SpectatorMode.getAlivePlayers();
            if (alivePlayers.length > 0) {
                SpectatorMode.enter();
            }
        }
    } else {
        const playerData = remotePlayers.get(playerId);
        if (playerData) {
            playerData.isAlive = false;
            DebugLog.log(`${playerData.name} died!`, 'warn');

            // Hide remote player mesh
            const mesh = remotePlayerMeshes.get(playerId);
            if (mesh) {
                mesh.visible = false;
            }

            // If we're spectating this player, switch to another
            if (SpectatorMode.isSpectating && SpectatorMode.spectatingPlayerId === playerId) {
                const alivePlayers = SpectatorMode.getAlivePlayers();
                if (alivePlayers.length > 0) {
                    SpectatorMode.spectatingPlayerId = alivePlayers[0].id;
                    SpectatorMode.updateSpectatorUI();
                } else {
                    // No one left to spectate
                    SpectatorMode.hideSpectatorUI();
                    SpectatorMode.isSpectating = false;
                }
            }
        }
    }
    updateHUD();
}

// Handle health sync for remote players (updates nametag health bars)
function handlePlayerHealthSync(message) {
    if (!message.playerId || typeof message.health !== 'number') return;

    // Skip if it's our own health (handled separately)
    if (message.playerId === localPlayerId) return;

    const playerData = remotePlayers.get(message.playerId);
    if (playerData) {
        playerData.health = message.health;
        playerData.maxHealth = message.maxHealth || 100;

        // Update nametag health bar
        const healthPercent = playerData.health / playerData.maxHealth;
        updatePlayerNametag(message.playerId, healthPercent);
    }
}

function handleZombieSpawned(zombieData) {
    // Buffer zombie spawns during map loading to prevent collision data race
    if (GameState.isMapLoading) {
        GameState.pendingZombieSpawns.push(zombieData);
        DebugLog.log(`Zombie ${zombieData.id} queued (map loading)`, 'game');
        return;
    }

    DebugLog.log(`Zombie spawned: ${zombieData.id} (${zombieData.type})`, 'game');

    // Use object pooling for better performance
    const mesh = ZombiePool.acquire(zombieData);
    const zombieEntry = {
        ...zombieData,
        mesh: mesh,
        walkCycle: Math.random() * Math.PI * 2,
        // Interpolation targets
        targetPosition: { x: zombieData.position.x, z: zombieData.position.z },
        targetRotation: zombieData.rotation || 0
    };
    zombies.set(zombieData.id, zombieEntry);
    invalidateZombieMeshCache();

    // Add to spatial grid for optimized collision detection
    SpatialGrid.insert(zombieEntry);
}

// Process any zombie spawns that were buffered during map loading
function processPendingZombieSpawns() {
    if (GameState.pendingZombieSpawns.length > 0) {
        DebugLog.log(`Processing ${GameState.pendingZombieSpawns.length} queued zombie spawns`, 'game');
        const pending = GameState.pendingZombieSpawns;
        GameState.pendingZombieSpawns = [];
        pending.forEach(zombieData => handleZombieSpawned(zombieData));
    }
}

function handleZombieDamaged(message) {
    const zombie = zombies.get(message.zombieId);
    if (zombie) {
        zombie.health = message.health;
        // Health indicator removed - only bosses show health bars
    }
}

function handleZombieAttack(message) {
    const zombie = zombies.get(message.zombieId);
    if (zombie && zombie.mesh) {
        // Start attack animation
        zombie.isAttacking = true;
        zombie.attackStartTime = Date.now();

        // Play attack sound if zombie is close
        const dx = zombie.position.x - player.position.x;
        const dz = zombie.position.z - player.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 10) {
            playSound('zombieAttack');
        }
    }
}

function handleZombieAbility(message) {
    const zombie = zombies.get(message.zombieId);
    if (!zombie) return;

    // Initialize abilityState if needed
    if (!zombie.abilityState) {
        zombie.abilityState = {
            isLeaping: false,
            leapStartTime: 0,
            leapStartPos: null,
            leapTargetPos: null,
            isCharging: false,
            chargeStartTime: 0,
            chargeDirection: null,
            lastAbilityUse: 0,
            abilityCooldown: 4000
        };
    }

    const now = performance.now();

    if (message.ability === 'leap') {
        zombie.abilityState.isLeaping = true;
        zombie.abilityState.leapStartTime = now;
        zombie.abilityState.leapStartPos = { x: zombie.position.x, z: zombie.position.z };
        // Target position will be interpolated by server sync
        zombie.abilityState.leapTargetPos = { x: zombie.position.x, z: zombie.position.z };
        DebugLog.log('Runner ' + message.zombieId + ' started leap', 'game');
    } else if (message.ability === 'charge') {
        zombie.abilityState.isCharging = true;
        zombie.abilityState.chargeStartTime = now;
        DebugLog.log('Tank ' + message.zombieId + ' started charge', 'game');
    }
}

function handleBossGroundSlam(message) {
    const zombie = zombies.get(message.zombieId);
    if (!zombie || !zombie.mesh) return;

    // Visual warning - boss raises arms
    if (zombie.mesh.userData.leftArm) {
        zombie.mesh.userData.leftArm.rotation.x = -Math.PI / 2;
        zombie.mesh.userData.rightArm.rotation.x = -Math.PI / 2;
    }

    // Create warning circle on ground
    const radius = zombie.bossAttackState?.attacks?.groundSlam?.radius || 6;
    const warningGeo = new THREE.RingGeometry(0.5, radius, 32);
    const warningMat = new THREE.MeshBasicMaterial({
        color: 0xff0000,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide
    });
    const warning = new THREE.Mesh(warningGeo, warningMat);
    warning.rotation.x = -Math.PI / 2;
    warning.position.copy(zombie.mesh.position);
    warning.position.y = 0.1;
    scene.add(warning);

    // Animate warning circle then create slam effect
    const startTime = Date.now();
    const windupTime = 800;
    function animateWarning() {
        const elapsed = Date.now() - startTime;
        if (elapsed > windupTime) {
            scene.remove(warning);
            warningGeo.dispose();
            warningMat.dispose();
            // Create slam effect
            createGroundSlamEffect(zombie.mesh.position, radius);
            // Reset arms
            if (zombie.mesh.userData.leftArm) {
                zombie.mesh.userData.leftArm.rotation.x = 0;
                zombie.mesh.userData.rightArm.rotation.x = 0;
            }
            return;
        }
        // Pulse warning
        const pulse = Math.sin(elapsed * 0.02) * 0.3 + 0.5;
        warning.material.opacity = pulse;
        requestAnimationFrame(animateWarning);
    }
    animateWarning();
    DebugLog.log('Boss ground slam incoming!', 'game');
}

function handleBossCharge(message) {
    const zombie = zombies.get(message.zombieId);
    if (!zombie || !zombie.mesh) return;

    // Visual indicator - boss leans forward
    zombie.mesh.rotation.x = 0.3;

    // Create warning line from boss toward player
    if (playerState && playerState.position) {
        createChargeWarningLine(zombie.mesh.position, playerState.position);
    }

    // Reset lean after charge duration
    setTimeout(() => {
        if (zombie.mesh) zombie.mesh.rotation.x = 0;
    }, GameCore.Constants.BOSS.ATTACKS.charge.duration || 1500);

    DebugLog.log('Boss charging!', 'game');
}

function handleBossSummon(message) {
    const zombie = zombies.get(message.zombieId);
    if (!zombie || !zombie.mesh) return;

    // Spawn particle effect around boss
    for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const particleGeo = new THREE.SphereGeometry(0.2, 8, 8);
        const particleMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        const particle = new THREE.Mesh(particleGeo, particleMat);
        particle.position.copy(zombie.mesh.position);
        particle.position.y += 1;
        scene.add(particle);

        const velocity = { x: Math.cos(angle) * 3, y: 2, z: Math.sin(angle) * 3 };
        const startTime = Date.now();
        function animateParticle() {
            const elapsed = (Date.now() - startTime) / 1000;
            if (elapsed > 0.8) {
                scene.remove(particle);
                particleGeo.dispose();
                particleMat.dispose();
                return;
            }
            particle.position.x += velocity.x * 0.016;
            particle.position.y += velocity.y * 0.016 - elapsed * 0.3;
            particle.position.z += velocity.z * 0.016;
            particle.material.opacity = 1 - elapsed / 0.8;
            requestAnimationFrame(animateParticle);
        }
        animateParticle();
    }
    DebugLog.log('Boss summoning minions!', 'game');
}

function handleExploderExplosion(message) {
    // Visual-only explosion for multiplayer (server handles damage)
    const explosionPos = new THREE.Vector3(message.position.x, 1, message.position.z);
    const radius = message.radius || GameCore.Combat.getExplosionRadius();

    // Visual explosion effect
    const explosionGeo = new THREE.SphereGeometry(0.5, 16, 16);
    const explosionMat = new THREE.MeshBasicMaterial({
        color: 0xff6600,
        transparent: true,
        opacity: 1
    });
    const explosion = new THREE.Mesh(explosionGeo, explosionMat);
    explosion.position.copy(explosionPos);
    scene.add(explosion);

    // Explosion particles
    for (let i = 0; i < 20; i++) {
        spawnDebris(explosionPos, 1);
    }
    for (let i = 0; i < 15; i++) {
        spawnBloodParticles(explosionPos, 1);
    }

    // Screen shake if player is close
    if (player && player.position) {
        const distToPlayer = player.position.distanceTo(explosionPos);
        if (distToPlayer < radius * 2) {
            screenShake(0.3 * (1 - distToPlayer / (radius * 2)));
        }
    }

    // Animate explosion
    const startTime = Date.now();
    function animateExplosion() {
        const elapsed = Date.now() - startTime;
        const progress = elapsed / 500;

        if (progress < 1) {
            explosion.scale.setScalar(1 + progress * 8);
            explosionMat.opacity = 1 - progress;
            requestAnimationFrame(animateExplosion);
        } else {
            scene.remove(explosion);
            explosionGeo.dispose();
            explosionMat.dispose();
        }
    }
    animateExplosion();
    DebugLog.log('Exploder detonated!', 'game');
}

function handleZombieKilled(message) {
    const zombie = zombies.get(message.zombieId);
    if (zombie) {
        zombie.isAlive = false;
        invalidateZombieMeshCache();

        DebugLog.log(`Zombie killed by ${message.killerId}${message.isHeadshot ? ' (HEADSHOT!)' : ''}`, 'success');

        // Create blood splatter
        createBloodSplatter(new THREE.Vector3(
            message.position.x,
            1,
            message.position.z
        ));

        // Death animation
        animateZombieDeath(zombie);

        // Update kill count if we killed it
        if (message.killerId === localPlayerId) {
            playerState.kills++;
            playerState.score += 100 + (message.isHeadshot ? 50 : 0);
            registerKill(); // Track kill streak
        }

        GameState.totalKills++;
        updateHUD();
    }
}

function handlePickupSpawned(pickupData) {
    DebugLog.log(`Pickup spawned: ${pickupData.id} (${pickupData.type})`, 'game');

    const mesh = createPickupMesh(pickupData);
    pickups.set(pickupData.id, {
        ...pickupData,
        mesh: mesh,
        rotationSpeed: 2 + Math.random(),
        bobOffset: Math.random() * Math.PI * 2
    });
}

function handlePickupCollected(message) {
    const pickup = pickups.get(message.pickupId);
    if (pickup) {
        scene.remove(pickup.mesh);
        pickups.delete(message.pickupId);

        // Clear nearby pickup if it was collected
        if (nearbyPickup === message.pickupId) {
            nearbyPickup = null;
            updateInteractPrompt();
        }

        if (message.playerId === localPlayerId) {
            if (message.pickupType === 'health') {
                playerState.health = Math.min(playerState.health + 25, CONFIG.player.maxHealth);
                DebugLog.log('Collected health! +25 HP', 'success');
            } else if (message.pickupType === 'ammo') {
                weapon.reserveAmmo = Math.min(weapon.reserveAmmo + 15, 180);
                DebugLog.log('Collected ammo! +15', 'success');
            }
            playSound('pickup');
            updateHUD();
        }
    }
}

function handlePickupRemoved(pickupId) {
    const pickup = pickups.get(pickupId);
    if (pickup) {
        scene.remove(pickup.mesh);
        pickups.delete(pickupId);
    }
}

async function handleWaveStart(message) {
    GameState.wave = message.wave;
    GameState.zombiesRemaining = message.zombieCount;

    // Handle map changes from server (multiplayer)
    if (typeof MapManager !== 'undefined' && MapManager.currentMap && message.mapChanged) {
        DebugLog.log(`Server: Map changing to ${message.mapId}`, 'game');

        // Set map loading flag to buffer zombie spawns during transition
        GameState.isMapLoading = true;

        try {
            const mapLoaded = await MapManager.loadMap(message.mapId);

            // Only reposition player if map actually loaded
            if (mapLoaded) {
                const spawn = MapManager.getPlayerSpawn();
                player.position.set(spawn.x, spawn.y, spawn.z);
            }
        } catch (err) {
            DebugLog.log(`Failed to load map ${message.mapId}: ${err.message}`, 'error');
        } finally {
            // Clear map loading flag and process any buffered zombie spawns
            GameState.isMapLoading = false;
            processPendingZombieSpawns();
        }
    }

    // Handle boss mode activation from server
    if (typeof MapManager !== 'undefined' && message.bossMode) {
        MapManager.activateBossMode();
    }

    DebugLog.log(`Wave ${message.wave} starting with ${message.zombieCount} zombies!`, 'game');
    showWaveAnnouncement(message.wave);
    updateHUD();
}

function handleWaveComplete(message) {
    DebugLog.log(`Wave ${message.wave} complete! Bonus: ${message.bonus}`, 'success');
    GameState.totalScore += message.bonus;
    playerState.score += message.bonus;
    updateHUD();

    // Deactivate boss mode when wave completes
    const isBossWave = message.wave % 5 === 0;
    if (isBossWave && typeof MapManager !== 'undefined') {
        MapManager.deactivateBossMode();
    }

    showWaveCompleteAnnouncement(message.wave, message.bonus, isBossWave);

    // Open shop if server says so (after announcement finishes)
    if (message.showShop) {
        setTimeout(() => {
            WeaponUpgrades.showShop();
        }, 1600);
    }
}

function handleGameStart(message) {
    DebugLog.log('Game starting!', 'game');

    // Re-initialize controls (may have been cleaned up on previous quit)
    initControls();

    // Clean up any cosmetic preview renderers that might be stealing WebGL context
    cleanupCosmeticPreviews();

    // Check WebGL context
    if (renderer && renderer.getContext() && renderer.getContext().isContextLost()) {
        console.error('WebGL context was lost!');
        try {
            renderer.forceContextRestore();
            DebugLog.log('WebGL context restored', 'success');
        } catch (e) {
            DebugLog.log('Failed to restore WebGL context - please refresh the page', 'error');
            console.error('WebGL restore failed:', e);
        }
    }

    // Initialize optimization systems
    ZombiePool.init();
    particlePool.preallocate();
    SpatialGrid.clear();
    DeltaCompression.reset();

    GameState.isInLobby = false;
    GameState.isRunning = true;
    GameState.isGameOver = false;
    playerState.isAlive = true;
    playerState.health = CONFIG.player.maxHealth;
    playerState.kills = 0;
    playerState.score = 0;
    weapon.ammo = CONFIG.player.startAmmo;
    weapon.reserveAmmo = CONFIG.player.reserveAmmo;

    // Reset game statistics (sets startTime for survival timer)
    GameStats.reset();

    // Reset player position
    player.position.set(0, CONFIG.player.height, 0);

    // Clear old zombies and pickups
    zombies.forEach((z, id) => {
        if (z.mesh) scene.remove(z.mesh);
    });
    zombies.clear();
    ZombiePool.clear();

    pickups.forEach((p, id) => {
        if (p.mesh) scene.remove(p.mesh);
    });
    pickups.clear();

    // Hide menus/lobby, show HUD
    setElementDisplay('start-screen', 'none');
    setElementDisplay('lobby-screen', 'none');
    setElementDisplay('game-over-screen', 'none');
    setElementDisplay('hud', 'flex');
    setElementDisplay('crosshair', 'block');
    setElementDisplay('multiplayer-panel', 'block');

    // Hide ALL overlays that might be blocking the view
    const overlaysToHide = [
        'click-to-start-overlay',
        'pause-screen',
        'upgrade-shop',
        'cosmetics-screen',
        'loading-screen',
        'controls-overlay'
    ];
    overlaysToHide.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    // Pre-warm audio system to prevent first-shot lag
    warmAudioSystem();

    // Show mobile controls if on mobile device
    if (isMobile) {
        showMobileControls();
    } else {
        // DEBUG: Skip pointer lock in multiplayer to test if it's causing render freeze
        if (GameState.mode !== 'multiplayer') {
            document.body.requestPointerLock();
        }
    }
    updateHUD();
}

// Show overlay requiring click to start (needed for pointer lock in multiplayer)
function showClickToStartOverlay() {
    let overlay = document.getElementById('click-to-start-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'click-to-start-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 9999;
            cursor: pointer;
        `;
        overlay.innerHTML = `
            <div style="text-align: center; color: #ff4444; font-family: 'Creepster', cursive;">
                <h1 style="font-size: 4rem; margin-bottom: 1rem;">GAME STARTING!</h1>
                <p style="font-size: 2rem; color: #ffcc00;">Click anywhere to begin...</p>
            </div>
        `;
        document.body.appendChild(overlay);
    }
    overlay.style.display = 'flex';

    // Pause the game until player clicks (prevents getting attacked while overlay is shown)
    GameState.isPaused = true;

    overlay.onclick = () => {
        overlay.style.display = 'none';
        // Unpause and ensure correct game state
        GameState.isPaused = false;
        GameState.isRunning = true;
        playerState.isAlive = true;
        document.body.requestPointerLock();
        DebugLog.log('Click-to-start: Game unpaused, pointer lock requested', 'game');
    };
}

async function handleGameOver(message) {
    DebugLog.log(`Game Over! Wave: ${message.wave}, Kills: ${message.totalKills}`, 'error');

    GameState.isRunning = false;
    GameState.isGameOver = true;

    // Display score (use player's individual score, not room total)
    const finalScore = document.getElementById('final-score');
    if (finalScore) finalScore.textContent = `Score: ${playerState.score.toLocaleString()}`;

    // Update statistics dashboard using local tracking
    const statAccuracy = document.getElementById('stat-accuracy');
    const statKills = document.getElementById('stat-kills');
    const statHeadshots = document.getElementById('stat-headshots');
    const statWave = document.getElementById('stat-wave');
    const statDamage = document.getElementById('stat-damage');
    const statTime = document.getElementById('stat-time');
    const statFavoriteWeapon = document.getElementById('stat-favorite-weapon');
    const statBestStreak = document.getElementById('stat-best-streak');
    if (statAccuracy) statAccuracy.textContent = `${GameStats.getAccuracy()}%`;
    if (statKills) statKills.textContent = playerState.kills;
    if (statHeadshots) statHeadshots.textContent = GameStats.headshots;
    if (statWave) statWave.textContent = message.wave;
    if (statDamage) statDamage.textContent = GameStats.damageDealt.toLocaleString();
    if (statTime) statTime.textContent = GameStats.getSurvivalTime();
    if (statFavoriteWeapon) statFavoriteWeapon.textContent = GameStats.getFavoriteWeapon();
    if (statBestStreak) statBestStreak.textContent = GameStats.bestKillStreak;

    // Submit score to leaderboard (not in dev mode)
    const rankResult = document.getElementById('rank-result');
    let result = { added: false, rank: -1 };

    if (DevSettings.godMode || DevSettings.infiniteAmmo) {
        const cheats = [];
        if (DevSettings.godMode) cheats.push('GOD MODE');
        if (DevSettings.infiniteAmmo) cheats.push('INFINITE AMMO');
        if (rankResult) rankResult.innerHTML = `<span style="color: #ff6600;">${cheats.join(' + ')} - Score not recorded</span>`;
        await fetchLeaderboard(); // Just refresh leaderboard
    } else {
        const playerName = getPlayerName();
        result = await submitScore(playerName);

        // Display rank result
        if (rankResult) {
            if (result.added && result.rank > 0) {
                rankResult.innerHTML = `<span class="new-highscore">NEW HIGH SCORE! #${result.rank}</span>`;
            } else if (cachedLeaderboard.length >= 10) {
                // Only show 'points away' if score is below minimum required
                const minScore = cachedLeaderboard[cachedLeaderboard.length - 1].score;
                if (playerState.score < minScore) {
                    const diff = minScore - playerState.score;
                    rankResult.textContent = `${diff.toLocaleString()} points away from Top 10`;
                } else {
                    // Score should have qualified - check for submission error
                    rankResult.textContent = 'Score submission error - try again';
                }
            } else {
                rankResult.textContent = '';
            }
        }
    }

    // Render leaderboard with highlight
    renderLeaderboard('gameover-leaderboard-content', result.rank);

    document.exitPointerLock();
    hideMobileControls();
    setElementDisplay('game-over-screen', 'flex');
    setElementDisplay('hud', 'none');
    setElementDisplay('crosshair', 'none');
}

function handleGameReset() {
    DebugLog.log('Game reset', 'game');

    // Clear zombies and pickups
    zombies.forEach((z, id) => {
        if (z.mesh) scene.remove(z.mesh);
    });
    zombies.clear();

    pickups.forEach((p, id) => {
        if (p.mesh) scene.remove(p.mesh);
    });
    pickups.clear();

    // Reset remote players visibility
    remotePlayerMeshes.forEach((mesh, id) => {
        mesh.visible = true;
    });

    GameState.wave = 1;
    GameState.totalKills = 0;
    GameState.totalScore = 0;
    updateHUD();
}

// Throttle sync processing to avoid freezing
let lastSyncProcess = 0;
const SYNC_THROTTLE_MS = 50; // Max 20 syncs per second

function handleSync(message) {
    const now = Date.now();
    if (now - lastSyncProcess < SYNC_THROTTLE_MS) {
        // Skip this sync, too frequent
        return;
    }
    lastSyncProcess = now;

    // Sync zombie positions from server with interpolation
    if (message.zombies && Array.isArray(message.zombies)) {
        message.zombies.forEach(serverZombie => {
            const zombie = zombies.get(serverZombie.id);
            if (zombie && zombie.isAlive) {
                // Update interpolation targets instead of snapping position
                Interpolation.updateEntity(zombie, serverZombie.position, serverZombie.rotation);
                zombie.position = serverZombie.position;
                zombie.rotation = serverZombie.rotation;
                zombie.health = serverZombie.health;
                // Update spatial grid position
                SpatialGrid.update(zombie);
            }
        });
    }

    if (message.gameState) {
        GameState.wave = message.gameState.wave;
        GameState.zombiesRemaining = message.gameState.zombiesRemaining;
        GameState.totalKills = message.gameState.totalKills;
        GameState.totalScore = message.gameState.totalScore;
    }
}

function handlePlayerNameChange(message) {
    // Update remote players data
    const playerData = remotePlayers.get(message.playerId);
    if (playerData) {
        playerData.name = message.name;
        updatePlayerList();
    }

    // Update lobby state if in lobby
    const lobbyPlayer = LobbyState.players.get(message.playerId);
    if (lobbyPlayer) {
        lobbyPlayer.name = message.name;
        updateLobbyPlayerList();
    }

    DebugLog.log(`Player ${message.playerId} changed name to: ${message.name}`, 'net');
}

function handlePlayerCosmeticChange(message) {
    // Update remote players data
    const playerData = remotePlayers.get(message.playerId);
    if (playerData) {
        playerData.cosmetic = message.cosmetic;
        // Recreate player mesh with new cosmetic
        recreateRemotePlayerMesh(message.playerId);
    }

    // Update lobby state if in lobby
    const lobbyPlayer = LobbyState.players.get(message.playerId);
    if (lobbyPlayer) {
        lobbyPlayer.cosmetic = message.cosmetic;
    }

    DebugLog.log(`Player ${message.playerId} changed cosmetic to: ${message.cosmetic}`, 'net');
}

function recreateRemotePlayerMesh(playerId) {
    const playerData = remotePlayers.get(playerId);
    if (!playerData) return;

    // Remove old mesh
    const oldMesh = remotePlayerMeshes.get(playerId);
    if (oldMesh) {
        scene.remove(oldMesh);
    }

    // Create new mesh with updated cosmetic
    createRemotePlayerMesh(playerData);
}

function handleChat(message) {
    DebugLog.log(`[CHAT] ${message.playerName}: ${message.message}`, 'info');
}

// ==================== REMOTE PLAYER RENDERING ====================
// Player eye height matches CONFIG.player.height for camera sync
const PLAYER_EYE_HEIGHT = 1.65; // Eye level for first-person camera (realistic ~5'5" eye height)
const PLAYER_TOTAL_HEIGHT = 1.8; // Total height including top of head

// Draw nametag with health bar on canvas
function drawNametag(ctx, name, color, healthPercent) {
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Background with rounded corners
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.beginPath();
    ctx.roundRect(8, 4, 240, 72, 10);
    ctx.fill();

    // Border with player color
    const colorHex = '#' + color.toString(16).padStart(6, '0');
    ctx.strokeStyle = colorHex;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Player name
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#000000';
    ctx.shadowBlur = 4;
    ctx.fillText(name.substring(0, 12), 128, 26);
    ctx.shadowBlur = 0;

    // Health bar background
    const barX = 24;
    const barY = 48;
    const barWidth = 208;
    const barHeight = 16;

    ctx.fillStyle = 'rgba(60, 60, 60, 0.9)';
    ctx.beginPath();
    ctx.roundRect(barX, barY, barWidth, barHeight, 4);
    ctx.fill();

    // Health bar fill
    const fillWidth = Math.max(0, barWidth * healthPercent);
    if (fillWidth > 0) {
        // Color based on health: green -> yellow -> red
        let barColor;
        if (healthPercent > 0.6) {
            barColor = '#00ff00';
        } else if (healthPercent > 0.3) {
            barColor = '#ffff00';
        } else {
            barColor = '#ff4444';
        }

        ctx.fillStyle = barColor;
        ctx.beginPath();
        ctx.roundRect(barX + 2, barY + 2, fillWidth - 4, barHeight - 4, 3);
        ctx.fill();

        // Glow effect
        ctx.shadowColor = barColor;
        ctx.shadowBlur = 6;
        ctx.fill();
        ctx.shadowBlur = 0;
    }

    // Health percentage text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(Math.round(healthPercent * 100) + '%', 128, barY + barHeight / 2 + 1);
}

// Update a remote player's nametag health bar
function updatePlayerNametag(playerId, healthPercent) {
    const mesh = remotePlayerMeshes.get(playerId);
    if (!mesh || !mesh.userData.nametag) return;

    const nametag = mesh.userData.nametag;
    const userData = nametag.userData;

    // Only update if health changed significantly
    if (Math.abs(userData.currentHealth - healthPercent) < 0.01) return;

    userData.currentHealth = healthPercent;
    drawNametag(userData.ctx, userData.playerName, userData.playerColor, healthPercent);
    userData.texture.needsUpdate = true;
}

function createRemotePlayerMesh(playerData) {
    const group = new THREE.Group();

    // Get cosmetic data - use cosmetic colors if available, otherwise fallback to player color
    const cosmeticId = playerData.cosmetic || 'default';
    const cosmetic = COSMETICS[cosmeticId] || COSMETICS.default;

    const primaryColor = cosmetic.shirtColor || playerData.color;
    const bodyColor = cosmetic.bodyColor || ((primaryColor & 0xfefefe) >> 1);

    const bodyMat = new THREE.MeshStandardMaterial({
        color: primaryColor,
        metalness: 0.2,
        roughness: 0.8
    });

    const bodyMatDark = new THREE.MeshStandardMaterial({
        color: bodyColor,
        metalness: 0.2,
        roughness: 0.8
    });

    const skinMat = new THREE.MeshStandardMaterial({
        color: cosmetic.skinColor || 0xffdbac,
        roughness: 0.9
    });

    // === TORSO (chest and waist) ===
    const torsoGroup = new THREE.Group();

    // Upper chest - raised for better proportions
    const chestGeo = new THREE.BoxGeometry(0.48, 0.38, 0.26);
    const chest = new THREE.Mesh(chestGeo, bodyMat);
    chest.position.y = 1.32;
    torsoGroup.add(chest);

    // Lower torso / waist
    const waistGeo = new THREE.BoxGeometry(0.42, 0.28, 0.22);
    const waist = new THREE.Mesh(waistGeo, bodyMatDark);
    waist.position.y = 1.02;
    torsoGroup.add(waist);

    // Hip area
    const hipGeo = new THREE.BoxGeometry(0.4, 0.15, 0.2);
    const hip = new THREE.Mesh(hipGeo, bodyMatDark);
    hip.position.y = 0.82;
    torsoGroup.add(hip);

    // Shoulders (rounded)
    const shoulderGeo = new THREE.SphereGeometry(0.13, 8, 8);
    [-0.30, 0.30].forEach(offset => {
        const shoulder = new THREE.Mesh(shoulderGeo, bodyMat);
        shoulder.position.set(offset, 1.42, 0);
        torsoGroup.add(shoulder);
    });

    group.add(torsoGroup);

    // === HEAD (positioned at eye level) ===
    const headGroup = new THREE.Group();
    headGroup.userData.isHead = true;

    // Head base
    const headGeo = new THREE.SphereGeometry(0.18, 16, 16);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.scale.set(1, 1.1, 1); // Slightly elongated
    headGroup.add(head);

    // Face features - eyes
    const eyeGeo = new THREE.SphereGeometry(0.03, 8, 8);
    const eyeWhiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const pupilMat = new THREE.MeshStandardMaterial({ color: 0x222222 });

    [-0.06, 0.06].forEach(offset => {
        const eyeWhite = new THREE.Mesh(eyeGeo, eyeWhiteMat);
        eyeWhite.position.set(offset, 0.03, 0.15);
        headGroup.add(eyeWhite);

        const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.015, 6, 6), pupilMat);
        pupil.position.set(offset, 0.03, 0.17);
        headGroup.add(pupil);
    });

    // Cosmetic-specific head features
    if (cosmetic.hasHelmet) {
        // Military helmet
        const helmetGeo = new THREE.SphereGeometry(0.20, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
        const helmetMat = new THREE.MeshStandardMaterial({
            color: cosmetic.helmetColor || 0x3a4a2d,
            roughness: 0.6
        });
        const helmet = new THREE.Mesh(helmetGeo, helmetMat);
        helmet.position.y = 0.06;
        helmet.rotation.x = -0.2;
        headGroup.add(helmet);
    } else if (cosmetic.hasMohawk) {
        // Punk mohawk
        const mohawkGeo = new THREE.BoxGeometry(0.06, 0.20, 0.25);
        const mohawkMat = new THREE.MeshStandardMaterial({
            color: cosmetic.hairColor,
            emissive: cosmetic.hairColor,
            emissiveIntensity: 0.4
        });
        const mohawk = new THREE.Mesh(mohawkGeo, mohawkMat);
        mohawk.position.y = 0.18;
        headGroup.add(mohawk);
    } else if (cosmetic.isMascot) {
        // Mascot mouse/rat head - larger creepy head
        head.visible = false; // Hide normal head

        const mascotHeadGeo = new THREE.SphereGeometry(0.22, 16, 16);
        const mascotMat = new THREE.MeshStandardMaterial({ color: 0x808080 });
        const mascotHead = new THREE.Mesh(mascotHeadGeo, mascotMat);
        mascotHead.position.y = 0;
        headGroup.add(mascotHead);

        // Large round ears
        const earGeo = new THREE.CircleGeometry(0.12, 16);
        const earMat = new THREE.MeshStandardMaterial({ color: 0x606060, side: THREE.DoubleSide });
        [-0.18, 0.18].forEach(x => {
            const ear = new THREE.Mesh(earGeo, earMat);
            ear.position.set(x, 0.18, 0);
            ear.rotation.y = x > 0 ? -0.3 : 0.3;
            headGroup.add(ear);
        });

        // Creepy glowing red eyes
        const mascotEyeGeo = new THREE.SphereGeometry(0.04, 8, 8);
        const mascotEyeMat = new THREE.MeshStandardMaterial({
            color: 0xff0000,
            emissive: 0xff0000,
            emissiveIntensity: 0.8
        });
        [-0.08, 0.08].forEach(offset => {
            const eye = new THREE.Mesh(mascotEyeGeo, mascotEyeMat);
            eye.position.set(offset, 0.02, 0.18);
            headGroup.add(eye);
        });
    } else if (cosmetic.hasMask) {
        // Hazmat visor/mask
        const visorGeo = new THREE.BoxGeometry(0.30, 0.12, 0.08);
        const visorMat = new THREE.MeshStandardMaterial({
            color: 0x222222,
            transparent: true,
            opacity: 0.7,
            emissive: cosmetic.glowColor || 0x00ff00,
            emissiveIntensity: 0.3
        });
        const visor = new THREE.Mesh(visorGeo, visorMat);
        visor.position.set(0, 0.03, 0.16);
        headGroup.add(visor);

        // Hood
        const hoodGeo = new THREE.SphereGeometry(0.20, 16, 16);
        const hoodMat = new THREE.MeshStandardMaterial({ color: cosmetic.shirtColor });
        const hood = new THREE.Mesh(hoodGeo, hoodMat);
        hood.position.y = 0.02;
        hood.scale.set(1.05, 1.0, 1.0);
        headGroup.add(hood);
    } else {
        // Default tactical helmet
        const helmetGeo = new THREE.SphereGeometry(0.19, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
        const helmetMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.6 });
        const helmet = new THREE.Mesh(helmetGeo, helmetMat);
        helmet.position.y = 0.05;
        helmet.rotation.x = -0.2;
        headGroup.add(helmet);
    }

    // Position head at eye level
    headGroup.position.y = PLAYER_EYE_HEIGHT;
    group.add(headGroup);

    // === ARMS ===
    const armGroup = new THREE.Group();
    armGroup.userData.isArms = true;

    // Upper arms - slightly longer
    const upperArmGeo = new THREE.CylinderGeometry(0.06, 0.07, 0.32, 8);
    // Forearms
    const forearmGeo = new THREE.CylinderGeometry(0.05, 0.06, 0.30, 8);
    // Hands
    const handGeo = new THREE.SphereGeometry(0.06, 8, 8);

    [-1, 1].forEach((side, idx) => {
        const armSubGroup = new THREE.Group();
        armSubGroup.userData.armSide = side;

        const upperArm = new THREE.Mesh(upperArmGeo, bodyMat);
        upperArm.position.y = -0.16;
        armSubGroup.add(upperArm);

        const forearm = new THREE.Mesh(forearmGeo, skinMat);
        forearm.position.y = -0.45;
        forearm.rotation.x = -0.3;
        armSubGroup.add(forearm);

        const hand = new THREE.Mesh(handGeo, skinMat);
        hand.position.set(0, -0.62, 0.08);
        armSubGroup.add(hand);

        armSubGroup.position.set(side * 0.38, 1.42, 0);
        armSubGroup.rotation.x = -0.4; // Arms slightly forward
        armSubGroup.rotation.z = side * 0.12;

        armGroup.add(armSubGroup);
    });
    group.add(armGroup);

    // === LEGS ===
    const legGroup = new THREE.Group();
    legGroup.userData.isLegs = true;

    // Longer leg segments for full height
    const thighGeo = new THREE.CylinderGeometry(0.09, 0.08, 0.42, 8);
    const shinGeo = new THREE.CylinderGeometry(0.07, 0.08, 0.40, 8);
    const footGeo = new THREE.BoxGeometry(0.12, 0.08, 0.24);
    const pantsMat = new THREE.MeshStandardMaterial({ color: cosmetic.pantsColor || 0x2a2a3a, roughness: 0.9 });
    const bootMat = new THREE.MeshStandardMaterial({ color: cosmetic.bootsColor || 0x1a1a1a, roughness: 0.7 });

    [-0.13, 0.13].forEach((offset, idx) => {
        const legSubGroup = new THREE.Group();
        legSubGroup.userData.legSide = idx === 0 ? -1 : 1;

        // Thigh - positioned below hip (0.82)
        const thigh = new THREE.Mesh(thighGeo, pantsMat);
        thigh.position.y = 0.55;
        legSubGroup.add(thigh);

        // Shin - positioned below thigh
        const shin = new THREE.Mesh(shinGeo, pantsMat);
        shin.position.y = 0.20;
        legSubGroup.add(shin);

        // Foot/boot
        const foot = new THREE.Mesh(footGeo, bootMat);
        foot.position.set(0, 0.04, 0.04);
        legSubGroup.add(foot);

        legSubGroup.position.x = offset;
        legGroup.add(legSubGroup);
    });
    group.add(legGroup);

    // === WEAPON ===
    const weaponGroup = new THREE.Group();
    weaponGroup.userData.isWeapon = true;

    // Rifle body
    const rifleBodyGeo = new THREE.BoxGeometry(0.06, 0.1, 0.5);
    const rifleMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.4, roughness: 0.6 });
    const rifleBody = new THREE.Mesh(rifleBodyGeo, rifleMat);
    weaponGroup.add(rifleBody);

    // Barrel
    const barrelGeo = new THREE.CylinderGeometry(0.02, 0.025, 0.3, 8);
    const barrel = new THREE.Mesh(barrelGeo, rifleMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = -0.38;
    weaponGroup.add(barrel);

    // Stock
    const stockGeo = new THREE.BoxGeometry(0.05, 0.08, 0.2);
    const stock = new THREE.Mesh(stockGeo, new THREE.MeshStandardMaterial({ color: 0x4a3a2a }));
    stock.position.z = 0.32;
    stock.position.y = -0.02;
    weaponGroup.add(stock);

    // Magazine
    const magGeo = new THREE.BoxGeometry(0.04, 0.12, 0.08);
    const mag = new THREE.Mesh(magGeo, rifleMat);
    mag.position.set(0, -0.1, 0.05);
    weaponGroup.add(mag);

    weaponGroup.position.set(0.28, 1.05, 0.40);
    weaponGroup.rotation.x = -0.2;
    group.add(weaponGroup);

    // === NAME TAG WITH HEALTH BAR ===
    const nametagGroup = new THREE.Group();
    nametagGroup.name = 'nametag';

    // Create canvas for nametag
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 80;
    const ctx = canvas.getContext('2d');

    // Draw nametag (will be updated dynamically)
    drawNametag(ctx, playerData.name, primaryColor, 1.0);

    const nameTexture = new THREE.CanvasTexture(canvas);
    nameTexture.needsUpdate = true;
    const nameMat = new THREE.SpriteMaterial({
        map: nameTexture,
        transparent: true,
        depthTest: false,
        depthWrite: false
    });
    const nameSprite = new THREE.Sprite(nameMat);
    nameSprite.renderOrder = 998;
    nameSprite.position.y = PLAYER_TOTAL_HEIGHT + 0.5;
    nameSprite.scale.set(1.8, 0.56, 1);
    nametagGroup.add(nameSprite);

    // Store references for dynamic updates
    nametagGroup.userData.canvas = canvas;
    nametagGroup.userData.ctx = ctx;
    nametagGroup.userData.texture = nameTexture;
    nametagGroup.userData.playerName = playerData.name;
    nametagGroup.userData.playerColor = primaryColor;
    nametagGroup.userData.currentHealth = 1.0;

    group.add(nametagGroup);
    group.userData.nametag = nametagGroup;

    // Position the entire model (no scaling - built at correct proportions)
    group.position.set(playerData.position.x, 0, playerData.position.z);
    group.rotation.y = playerData.rotation?.y || 0;

    scene.add(group);
    remotePlayerMeshes.set(playerData.id, group);

    return group;
}

function createRemoteMuzzleFlash(playerMesh) {
    const flashGeo = new THREE.SphereGeometry(0.1, 8, 8);
    const flashMat = new THREE.MeshBasicMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 1
    });
    const flash = new THREE.Mesh(flashGeo, flashMat);
    flash.position.set(0.3, 0.9, 0.6);
    playerMesh.add(flash);

    setTimeout(() => {
        playerMesh.remove(flash);
    }, 50);
}

// ==================== ZOMBIE MESH CREATION ====================
// Helper to create capsule-like shape (r128 doesn't have CapsuleGeometry)
function createCapsule(radius, height, radialSegments) {
    const group = new THREE.Group();

    // Cylinder for body
    const cylHeight = height;
    const cylGeo = new THREE.CylinderGeometry(radius, radius, cylHeight, radialSegments);
    const cyl = new THREE.Mesh(cylGeo);
    group.add(cyl);

    // Top sphere
    const sphereGeo = new THREE.SphereGeometry(radius, radialSegments, radialSegments / 2);
    const topSphere = new THREE.Mesh(sphereGeo);
    topSphere.position.y = cylHeight / 2;
    group.add(topSphere);

    // Bottom sphere
    const bottomSphere = new THREE.Mesh(sphereGeo);
    bottomSphere.position.y = -cylHeight / 2;
    group.add(bottomSphere);

    return group;
}

// ==================== ZOMBIE HEALTH BAR SYSTEM ====================
function createZombieHealthBar(scale = 1) {
    const group = new THREE.Group();
    group.name = 'healthBar';

    // Background bar (dark)
    const bgGeo = new THREE.PlaneGeometry(0.8 * scale, 0.1 * scale);
    const bgMat = new THREE.MeshBasicMaterial({
        color: 0x222222,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        depthTest: false
    });
    const bgBar = new THREE.Mesh(bgGeo, bgMat);
    bgBar.renderOrder = 999;
    group.add(bgBar);

    // Health bar (green/yellow/red based on health)
    const healthGeo = new THREE.PlaneGeometry(0.76 * scale, 0.06 * scale);
    const healthMat = new THREE.MeshBasicMaterial({
        color: 0x00ff00,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthTest: false
    });
    const healthBar = new THREE.Mesh(healthGeo, healthMat);
    healthBar.renderOrder = 1000;
    healthBar.name = 'healthFill';
    group.add(healthBar);

    // Border
    const borderGeo = new THREE.EdgesGeometry(bgGeo);
    const borderMat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.9 });
    const border = new THREE.LineSegments(borderGeo, borderMat);
    border.renderOrder = 1001;
    group.add(border);

    group.visible = false; // Hidden until damaged
    return group;
}

function updateZombieHealthBar(zombie) {
    if (!zombie.mesh || !zombie.mesh.userData.healthBar) return;

    const healthBar = zombie.mesh.userData.healthBar;
    const healthFill = healthBar.getObjectByName('healthFill');
    if (!healthFill) return;

    // Clamp health percent to valid range to prevent negative values
    const healthPercent = Math.max(0, Math.min(1, zombie.health / zombie.maxHealth));

    // Show health bar only when damaged
    healthBar.visible = healthPercent < 1 && zombie.isAlive;

    if (!healthBar.visible) return;

    // Update fill width and position (scale from left)
    healthFill.scale.x = Math.max(0.01, healthPercent);
    healthFill.position.x = -0.38 * (1 - healthPercent) * (zombie.scale || 1);

    // Color based on health: green -> yellow -> red
    if (healthPercent > 0.6) {
        healthFill.material.color.setHex(0x00ff00); // Green
    } else if (healthPercent > 0.3) {
        healthFill.material.color.setHex(0xffff00); // Yellow
    } else {
        healthFill.material.color.setHex(0xff0000); // Red
    }

    // Billboard: face camera
    if (camera) {
        healthBar.quaternion.copy(camera.quaternion);
    }
}

// ==================== SKELETAL ZOMBIE SYSTEM ====================
const ZombieSkeleton = {
    // Create a complete skeletal zombie with bones and animation support
    create(zombieData) {
        const group = new THREE.Group();
        group.userData.zombieType = zombieData.type;

        // Type configurations with expanded enemy types
        const typeConfigs = {
            normal: { body: 0x3a5a3a, skin: 0x6a8a5a, eyes: 0x00ff00, wounds: true, torn: false },
            runner: { body: 0x5a3a3a, skin: 0x7a5a5a, eyes: 0xff6600, wounds: true, torn: true },
            tank: { body: 0x2a3a5a, skin: 0x4a5a6a, eyes: 0x0066ff, wounds: false, torn: false, armored: true },
            boss: { body: 0x4a1a4a, skin: 0x6a3a6a, eyes: 0xff00ff, wounds: true, torn: true, crowned: true },
            crawler: { body: 0x2a3a2a, skin: 0x4a5a3a, eyes: 0x88ff00, wounds: true, torn: true, lowProfile: true },
            exploder: { body: 0x5a4a2a, skin: 0x8a6a3a, eyes: 0xff3300, wounds: false, bloated: true },
            spitter: { body: 0x3a4a3a, skin: 0x5a7a5a, eyes: 0x00ffaa, wounds: true, elongated: true }
        };

        const config = typeConfigs[zombieData.type] || typeConfigs.normal;
        const scale = zombieData.scale || 1;

        // Create materials
        const bodyMat = new THREE.MeshStandardMaterial({ color: config.body, roughness: 0.95, metalness: 0.1 });
        const skinMat = new THREE.MeshStandardMaterial({ color: config.skin, roughness: 0.9 });
        const eyeMat = new THREE.MeshStandardMaterial({ color: config.eyes, emissive: config.eyes, emissiveIntensity: 1.5 });

        // === CREATE BONE HIERARCHY ===
        const bones = {};

        // Root bone (hips)
        bones.root = new THREE.Bone();
        bones.root.name = 'root';
        bones.root.position.y = 0.8 * scale;

        // Spine bones
        bones.spine = new THREE.Bone();
        bones.spine.name = 'spine';
        bones.spine.position.y = 0.3 * scale;
        bones.root.add(bones.spine);

        bones.chest = new THREE.Bone();
        bones.chest.name = 'chest';
        bones.chest.position.y = 0.3 * scale;
        bones.spine.add(bones.chest);

        // Neck and head
        bones.neck = new THREE.Bone();
        bones.neck.name = 'neck';
        bones.neck.position.y = 0.25 * scale;
        bones.chest.add(bones.neck);

        bones.head = new THREE.Bone();
        bones.head.name = 'head';
        bones.head.position.y = 0.15 * scale;
        bones.neck.add(bones.head);

        // Left arm chain
        bones.leftShoulder = new THREE.Bone();
        bones.leftShoulder.name = 'leftShoulder';
        bones.leftShoulder.position.set(-0.25 * scale, 0.15 * scale, 0);
        bones.chest.add(bones.leftShoulder);

        bones.leftElbow = new THREE.Bone();
        bones.leftElbow.name = 'leftElbow';
        bones.leftElbow.position.y = -0.25 * scale;
        bones.leftShoulder.add(bones.leftElbow);

        bones.leftHand = new THREE.Bone();
        bones.leftHand.name = 'leftHand';
        bones.leftHand.position.y = -0.25 * scale;
        bones.leftElbow.add(bones.leftHand);

        // Right arm chain
        bones.rightShoulder = new THREE.Bone();
        bones.rightShoulder.name = 'rightShoulder';
        bones.rightShoulder.position.set(0.25 * scale, 0.15 * scale, 0);
        bones.chest.add(bones.rightShoulder);

        bones.rightElbow = new THREE.Bone();
        bones.rightElbow.name = 'rightElbow';
        bones.rightElbow.position.y = -0.25 * scale;
        bones.rightShoulder.add(bones.rightElbow);

        bones.rightHand = new THREE.Bone();
        bones.rightHand.name = 'rightHand';
        bones.rightHand.position.y = -0.25 * scale;
        bones.rightElbow.add(bones.rightHand);

        // Left leg chain
        bones.leftHip = new THREE.Bone();
        bones.leftHip.name = 'leftHip';
        bones.leftHip.position.set(-0.12 * scale, 0, 0);
        bones.root.add(bones.leftHip);

        bones.leftKnee = new THREE.Bone();
        bones.leftKnee.name = 'leftKnee';
        bones.leftKnee.position.y = -0.35 * scale;
        bones.leftHip.add(bones.leftKnee);

        bones.leftFoot = new THREE.Bone();
        bones.leftFoot.name = 'leftFoot';
        bones.leftFoot.position.y = -0.35 * scale;
        bones.leftKnee.add(bones.leftFoot);

        // Right leg chain
        bones.rightHip = new THREE.Bone();
        bones.rightHip.name = 'rightHip';
        bones.rightHip.position.set(0.12 * scale, 0, 0);
        bones.root.add(bones.rightHip);

        bones.rightKnee = new THREE.Bone();
        bones.rightKnee.name = 'rightKnee';
        bones.rightKnee.position.y = -0.35 * scale;
        bones.rightHip.add(bones.rightKnee);

        bones.rightFoot = new THREE.Bone();
        bones.rightFoot.name = 'rightFoot';
        bones.rightFoot.position.y = -0.35 * scale;
        bones.rightKnee.add(bones.rightFoot);

        // Create skeleton
        const boneArray = Object.values(bones);
        const skeleton = new THREE.Skeleton(boneArray);

        // Add root bone to group
        group.add(bones.root);

        // === CREATE BODY PARTS WITH BONE ATTACHMENT ===
        // Instead of skinned mesh (complex), we attach meshes directly to bones

        // Pelvis/hips
        const pelvisGeo = new THREE.BoxGeometry(0.35 * scale, 0.2 * scale, 0.25 * scale);
        const pelvis = new THREE.Mesh(pelvisGeo, bodyMat);
        bones.root.add(pelvis);

        // Spine/lower torso
        const spineGeo = new THREE.BoxGeometry(0.3 * scale, 0.25 * scale, 0.2 * scale);
        const spineMesh = new THREE.Mesh(spineGeo, bodyMat);
        bones.spine.add(spineMesh);

        // Chest
        const chestGeo = new THREE.BoxGeometry(0.45 * scale, 0.35 * scale, 0.28 * scale);
        const chest = new THREE.Mesh(chestGeo, bodyMat);
        chest.rotation.x = 0.15; // Hunched
        bones.chest.add(chest);

        // Belly for bloated type
        if (config.bloated) {
            const bellyGeo = new THREE.SphereGeometry(0.35 * scale, 12, 12);
            const bellyMat = new THREE.MeshStandardMaterial({ color: 0x6a5a2a, roughness: 0.9 });
            const belly = new THREE.Mesh(bellyGeo, bellyMat);
            belly.position.set(0, -0.1 * scale, 0.15 * scale);
            bones.spine.add(belly);

            // Glowing pustules
            for (let i = 0; i < 5; i++) {
                const pustuleGeo = new THREE.SphereGeometry(0.06 * scale, 8, 8);
                const pustuleMat = new THREE.MeshStandardMaterial({
                    color: 0xff6600, emissive: 0xff3300, emissiveIntensity: 0.8
                });
                const pustule = new THREE.Mesh(pustuleGeo, pustuleMat);
                pustule.position.set(
                    (Math.random() - 0.5) * 0.3 * scale,
                    (Math.random() - 0.5) * 0.3 * scale,
                    0.2 * scale + Math.random() * 0.1 * scale
                );
                bones.spine.add(pustule);
            }
        }

        // Armor plates for tank
        if (config.armored) {
            const armorMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, metalness: 0.6, roughness: 0.4 });
            const armorGeo = new THREE.BoxGeometry(0.5 * scale, 0.3 * scale, 0.06 * scale);
            const armor = new THREE.Mesh(armorGeo, armorMat);
            armor.position.z = 0.18 * scale;
            bones.chest.add(armor);

            // Shoulder pads
            [-1, 1].forEach(side => {
                const padGeo = new THREE.BoxGeometry(0.15 * scale, 0.1 * scale, 0.15 * scale);
                const pad = new THREE.Mesh(padGeo, armorMat);
                pad.position.set(side * 0.28 * scale, 0.1 * scale, 0);
                bones.chest.add(pad);
            });
        }

        // HEAD
        const headGroup = new THREE.Group();
        headGroup.userData.isHead = true;

        const headGeo = config.elongated
            ? new THREE.SphereGeometry(0.22 * scale, 16, 16)
            : new THREE.SphereGeometry(0.2 * scale, 16, 16);
        const head = new THREE.Mesh(headGeo, skinMat);
        if (config.elongated) head.scale.set(0.8, 1.2, 0.9);
        headGroup.add(head);

        // Jaw
        const jawGeo = new THREE.BoxGeometry(0.15 * scale, 0.08 * scale, 0.12 * scale);
        const jaw = new THREE.Mesh(jawGeo, skinMat);
        jaw.position.set(0, -0.12 * scale, 0.06 * scale);
        jaw.rotation.x = 0.25;
        headGroup.add(jaw);

        // Eyes
        const eyeGeo = new THREE.SphereGeometry(0.04 * scale, 8, 8);
        [-0.07, 0.07].forEach(offset => {
            const socket = new THREE.Mesh(
                new THREE.SphereGeometry(0.05 * scale, 8, 8),
                new THREE.MeshStandardMaterial({ color: 0x1a1a1a })
            );
            socket.position.set(offset * scale, 0.03 * scale, 0.15 * scale);
            headGroup.add(socket);

            const eye = new THREE.Mesh(eyeGeo, eyeMat);
            eye.position.set(offset * scale, 0.03 * scale, 0.18 * scale);
            headGroup.add(eye);
        });

        // Teeth
        const teethMat = new THREE.MeshStandardMaterial({ color: 0xffffcc });
        for (let i = -2; i <= 2; i++) {
            const toothGeo = new THREE.ConeGeometry(0.012 * scale, 0.035 * scale, 4);
            const tooth = new THREE.Mesh(toothGeo, teethMat);
            tooth.position.set(i * 0.025 * scale, -0.06 * scale, 0.15 * scale);
            tooth.rotation.x = Math.PI;
            headGroup.add(tooth);
        }

        // Boss crown
        if (config.crowned) {
            const crownMat = new THREE.MeshStandardMaterial({
                color: 0xffaa00, metalness: 0.8, roughness: 0.2, emissive: 0x442200, emissiveIntensity: 0.3
            });
            for (let i = 0; i < 5; i++) {
                const spikeGeo = new THREE.ConeGeometry(0.03 * scale, 0.12 * scale, 4);
                const spike = new THREE.Mesh(spikeGeo, crownMat);
                const angle = (i / 5) * Math.PI - Math.PI / 2;
                spike.position.set(Math.sin(angle) * 0.15 * scale, 0.22 * scale, Math.cos(angle) * 0.08 * scale);
                headGroup.add(spike);
            }
        }

        bones.head.add(headGroup);

        // ARMS
        const createArm = (shoulderBone, elbowBone, handBone, side) => {
            // Upper arm
            const upperArmGeo = new THREE.CylinderGeometry(0.06 * scale, 0.08 * scale, 0.25 * scale, 8);
            const upperArm = new THREE.Mesh(upperArmGeo, bodyMat);
            upperArm.position.y = -0.12 * scale;
            shoulderBone.add(upperArm);

            // Forearm
            const forearmGeo = new THREE.CylinderGeometry(0.05 * scale, 0.06 * scale, 0.25 * scale, 8);
            const forearm = new THREE.Mesh(forearmGeo, config.torn ? skinMat : bodyMat);
            forearm.position.y = -0.12 * scale;
            elbowBone.add(forearm);

            // Hand with claws
            const handGeo = new THREE.SphereGeometry(0.055 * scale, 8, 8);
            const hand = new THREE.Mesh(handGeo, skinMat);
            hand.scale.set(1, 0.7, 1.2);
            handBone.add(hand);

            // Claws
            const clawMat = new THREE.MeshStandardMaterial({ color: 0x2a2a1a });
            for (let c = 0; c < 3; c++) {
                const clawGeo = new THREE.ConeGeometry(0.012 * scale, 0.06 * scale, 4);
                const claw = new THREE.Mesh(clawGeo, clawMat);
                claw.position.set((c - 1) * 0.025 * scale, -0.04 * scale, 0.03 * scale);
                claw.rotation.x = -0.5;
                handBone.add(claw);
            }
        };

        createArm(bones.leftShoulder, bones.leftElbow, bones.leftHand, -1);
        createArm(bones.rightShoulder, bones.rightElbow, bones.rightHand, 1);

        // LEGS
        const createLeg = (hipBone, kneeBone, footBone) => {
            // Thigh
            const thighGeo = new THREE.CylinderGeometry(0.08 * scale, 0.1 * scale, 0.35 * scale, 8);
            const thigh = new THREE.Mesh(thighGeo, bodyMat);
            thigh.position.y = -0.17 * scale;
            hipBone.add(thigh);

            // Shin
            const shinGeo = new THREE.CylinderGeometry(0.06 * scale, 0.08 * scale, 0.35 * scale, 8);
            const shin = new THREE.Mesh(shinGeo, bodyMat);
            shin.position.y = -0.17 * scale;
            kneeBone.add(shin);

            // Foot
            const footGeo = new THREE.BoxGeometry(0.1 * scale, 0.06 * scale, 0.18 * scale);
            const foot = new THREE.Mesh(footGeo, new THREE.MeshStandardMaterial({ color: 0x2a2a2a }));
            foot.position.set(0, -0.03 * scale, 0.04 * scale);
            footBone.add(foot);
        };

        createLeg(bones.leftHip, bones.leftKnee, bones.leftFoot);
        createLeg(bones.rightHip, bones.rightKnee, bones.rightFoot);

        // Crawler modifications - lower posture
        if (config.lowProfile) {
            bones.root.position.y = 0.4 * scale;
            bones.chest.rotation.x = 0.8;
            bones.leftShoulder.rotation.x = -1.2;
            bones.rightShoulder.rotation.x = -1.2;
        }

        // Wounds
        if (config.wounds) {
            const woundMat = new THREE.MeshStandardMaterial({ color: 0x4a0000, roughness: 1 });
            for (let i = 0; i < 3; i++) {
                const woundGeo = new THREE.CircleGeometry(0.025 * scale + Math.random() * 0.02 * scale, 8);
                const wound = new THREE.Mesh(woundGeo, woundMat);
                wound.position.set(
                    (Math.random() - 0.5) * 0.2 * scale,
                    (Math.random() - 0.5) * 0.2 * scale,
                    0.15 * scale
                );
                bones.chest.add(wound);
            }
        }

        // Store bone references for animation
        group.userData.bones = bones;
        group.userData.skeleton = skeleton;
        group.userData.animState = {
            walkCycle: Math.random() * Math.PI * 2,
            attackPhase: 0,
            isAttacking: false,
            isDying: false,
            deathProgress: 0
        };

        // Add health bar above zombie head
        const healthBar = createZombieHealthBar(scale);
        const headHeight = zombieData.type === 'tank' ? 2.4 : (zombieData.type === 'boss' ? 2.8 : 2.0);
        healthBar.position.y = headHeight * scale;
        group.add(healthBar);
        group.userData.healthBar = healthBar;

        // Position in world
        group.position.set(zombieData.position.x, 0, zombieData.position.z);
        group.rotation.y = zombieData.rotation || 0;

        return group;
    },

    // Animate zombie bones based on state
    animate(zombie, delta) {
        if (!zombie.mesh || !zombie.mesh.userData.bones) return;

        const bones = zombie.mesh.userData.bones;
        const anim = zombie.mesh.userData.animState;
        const speed = zombie.speed || 3;
        const isMoving = !zombie.isAttacking && zombie.isAlive;

        if (zombie.isAlive) {
            if (isMoving) {
                // Walk/run cycle
                const cycleSpeed = speed * 2.5;
                anim.walkCycle += delta * cycleSpeed;

                const legSwing = Math.sin(anim.walkCycle) * 0.6;
                const armSwing = Math.sin(anim.walkCycle) * 0.4;
                const bodyBob = Math.abs(Math.sin(anim.walkCycle * 2)) * 0.03;

                // Leg animation
                bones.leftHip.rotation.x = legSwing;
                bones.rightHip.rotation.x = -legSwing;
                bones.leftKnee.rotation.x = Math.max(0, -legSwing * 0.8);
                bones.rightKnee.rotation.x = Math.max(0, legSwing * 0.8);

                // Arm animation (opposite to legs, reaching forward)
                bones.leftShoulder.rotation.x = -0.5 - armSwing;
                bones.rightShoulder.rotation.x = -0.5 + armSwing;
                bones.leftElbow.rotation.x = -0.3;
                bones.rightElbow.rotation.x = -0.3;

                // Body bob
                bones.root.position.y = 0.8 * (zombie.scale || 1) + bodyBob;

                // Spine twist
                bones.spine.rotation.y = Math.sin(anim.walkCycle) * 0.1;

                // Head bob
                bones.head.rotation.x = Math.sin(anim.walkCycle * 2) * 0.05;

            } else if (zombie.isAttacking) {
                // Attack animation
                anim.attackPhase += delta * 8;

                if (anim.attackPhase < Math.PI) {
                    // Wind up
                    const progress = anim.attackPhase / Math.PI;
                    bones.leftShoulder.rotation.x = -0.5 - progress * 1.5;
                    bones.rightShoulder.rotation.x = -0.5 - progress * 1.5;
                    bones.chest.rotation.x = 0.15 - progress * 0.3;
                } else if (anim.attackPhase < Math.PI * 2) {
                    // Strike
                    const progress = (anim.attackPhase - Math.PI) / Math.PI;
                    bones.leftShoulder.rotation.x = -2 + progress * 2.5;
                    bones.rightShoulder.rotation.x = -2 + progress * 2.5;
                    bones.chest.rotation.x = -0.15 + progress * 0.5;
                } else {
                    // Reset
                    anim.attackPhase = 0;
                    zombie.isAttacking = false;
                }
            }
        }

        // Apply rotation to face direction
        if (zombie.rotation !== undefined) {
            zombie.mesh.rotation.y = zombie.rotation;
        }

        // Update health bar (billboard towards camera, show when damaged)
        updateZombieHealthBar(zombie);
    }
};

function createZombieMesh(zombieData) {
    // Use the new skeletal system
    const mesh = ZombieSkeleton.create(zombieData);
    scene.add(mesh);
    return mesh;
}

// Keep original for reference but mark as legacy
function createZombieMeshLegacy(zombieData) {
    const group = new THREE.Group();

    const typeConfigs = {
        normal: {
            body: 0x3a5a3a, skin: 0x6a8a5a, eyes: 0x00ff00,
            wounds: true, torn: false
        },
        runner: {
            body: 0x5a3a3a, skin: 0x7a5a5a, eyes: 0xff6600,
            wounds: true, torn: true
        },
        tank: {
            body: 0x2a3a5a, skin: 0x4a5a6a, eyes: 0x0066ff,
            wounds: false, torn: false, armored: true
        },
        boss: {
            body: 0x4a1a4a, skin: 0x6a3a6a, eyes: 0xff00ff,
            wounds: true, torn: true, crowned: true
        }
    };

    const config = typeConfigs[zombieData.type] || typeConfigs.normal;

    const bodyMat = new THREE.MeshStandardMaterial({
        color: config.body,
        roughness: 0.95,
        metalness: 0.1
    });

    const skinMat = new THREE.MeshStandardMaterial({
        color: config.skin,
        roughness: 0.9
    });

    const eyeMat = new THREE.MeshStandardMaterial({
        color: config.eyes,
        emissive: config.eyes,
        emissiveIntensity: 1.5
    });

    // === TORSO ===
    const torsoGroup = new THREE.Group();

    // Main body - hunched posture, taller
    const chestGeo = new THREE.BoxGeometry(0.52, 0.48, 0.36);
    const chest = new THREE.Mesh(chestGeo, bodyMat);
    chest.position.set(0, 1.28, 0.05);
    chest.rotation.x = 0.15; // Hunched forward
    torsoGroup.add(chest);

    // Belly (slightly protruding)
    const bellyGeo = new THREE.SphereGeometry(0.24, 12, 12);
    const belly = new THREE.Mesh(bellyGeo, bodyMat);
    belly.position.set(0, 0.98, 0.12);
    belly.scale.set(1, 0.8, 1);
    torsoGroup.add(belly);

    // Add wound details for some types
    if (config.wounds) {
        const woundMat = new THREE.MeshStandardMaterial({
            color: 0x4a0000,
            roughness: 1
        });
        for (let i = 0; i < 3; i++) {
            const woundGeo = new THREE.CircleGeometry(0.03 + Math.random() * 0.03, 8);
            const wound = new THREE.Mesh(woundGeo, woundMat);
            wound.position.set(
                (Math.random() - 0.5) * 0.3,
                1.15 + (Math.random() - 0.5) * 0.3,
                0.19
            );
            wound.rotation.y = Math.PI;
            torsoGroup.add(wound);
        }
    }

    // Armor plates for tank type
    if (config.armored) {
        const armorMat = new THREE.MeshStandardMaterial({
            color: 0x3a3a3a,
            metalness: 0.6,
            roughness: 0.4
        });
        const armorGeo = new THREE.BoxGeometry(0.58, 0.38, 0.08);
        const armor = new THREE.Mesh(armorGeo, armorMat);
        armor.position.set(0, 1.32, 0.24);
        torsoGroup.add(armor);
    }

    group.add(torsoGroup);

    // === HEAD ===
    const headGroup = new THREE.Group();
    headGroup.userData.isHead = true;

    // Skull shape - slightly deformed
    const headGeo = new THREE.SphereGeometry(0.28, 16, 16);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.scale.set(0.9, 1.05, 0.95);
    headGroup.add(head);

    // Jaw (hanging slightly open)
    const jawGeo = new THREE.BoxGeometry(0.2, 0.1, 0.15);
    const jaw = new THREE.Mesh(jawGeo, skinMat);
    jaw.position.set(0, -0.15, 0.1);
    jaw.rotation.x = 0.3; // Mouth open
    headGroup.add(jaw);

    // Teeth
    const teethMat = new THREE.MeshStandardMaterial({ color: 0xffffcc });
    for (let i = -2; i <= 2; i++) {
        const toothGeo = new THREE.ConeGeometry(0.015, 0.04, 4);
        const tooth = new THREE.Mesh(toothGeo, teethMat);
        tooth.position.set(i * 0.035, -0.08, 0.2);
        tooth.rotation.x = Math.PI;
        headGroup.add(tooth);
    }

    // Glowing eyes
    const eyeGeo = new THREE.SphereGeometry(0.055, 8, 8);
    [-0.1, 0.1].forEach(offset => {
        // Eye socket (dark)
        const socketGeo = new THREE.SphereGeometry(0.07, 8, 8);
        const socketMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
        const socket = new THREE.Mesh(socketGeo, socketMat);
        socket.position.set(offset, 0.05, 0.2);
        headGroup.add(socket);

        // Glowing pupil
        const eye = new THREE.Mesh(eyeGeo, eyeMat);
        eye.position.set(offset, 0.05, 0.24);
        headGroup.add(eye);
    });

    // Boss crown
    if (config.crowned) {
        const crownMat = new THREE.MeshStandardMaterial({
            color: 0xffaa00,
            metalness: 0.8,
            roughness: 0.2,
            emissive: 0x442200,
            emissiveIntensity: 0.3
        });
        for (let i = 0; i < 5; i++) {
            const spikeGeo = new THREE.ConeGeometry(0.04, 0.15, 4);
            const spike = new THREE.Mesh(spikeGeo, crownMat);
            const angle = (i / 5) * Math.PI - Math.PI / 2;
            spike.position.set(Math.sin(angle) * 0.2, 0.35, Math.cos(angle) * 0.1);
            spike.rotation.z = -angle * 0.3;
            headGroup.add(spike);
        }
    }

    headGroup.position.set(0, 1.68, 0.1);
    headGroup.rotation.x = 0.15; // Head tilted forward
    group.add(headGroup);

    // === ARMS ===
    const armGroup = new THREE.Group();
    armGroup.userData.isArms = true;

    [-1, 1].forEach((side, idx) => {
        const armSubGroup = new THREE.Group();
        armSubGroup.userData.armIndex = idx;

        // Upper arm
        const upperArmGeo = new THREE.CylinderGeometry(0.08, 0.1, 0.4, 8);
        const upperArm = new THREE.Mesh(upperArmGeo, bodyMat);
        upperArm.position.y = -0.2;
        armSubGroup.add(upperArm);

        // Forearm (with exposed bone for torn types)
        const forearmGeo = new THREE.CylinderGeometry(0.06, 0.08, 0.38, 8);
        const forearm = new THREE.Mesh(forearmGeo, config.torn ? skinMat : bodyMat);
        forearm.position.y = -0.52;
        forearm.rotation.x = -0.4;
        armSubGroup.add(forearm);

        // Clawed hand
        const handGeo = new THREE.SphereGeometry(0.07, 8, 8);
        const hand = new THREE.Mesh(handGeo, skinMat);
        hand.position.set(0, -0.72, 0.12);
        hand.scale.set(1, 0.7, 1.2);
        armSubGroup.add(hand);

        // Claws
        const clawMat = new THREE.MeshStandardMaterial({ color: 0x2a2a1a });
        for (let c = 0; c < 3; c++) {
            const clawGeo = new THREE.ConeGeometry(0.015, 0.08, 4);
            const claw = new THREE.Mesh(clawGeo, clawMat);
            claw.position.set((c - 1) * 0.03, -0.78, 0.18);
            claw.rotation.x = -0.5;
            armSubGroup.add(claw);
        }

        armSubGroup.position.set(side * 0.40, 1.38, 0.05);
        armSubGroup.rotation.x = -0.6; // Arms reaching forward
        armSubGroup.rotation.z = side * 0.25;

        armGroup.add(armSubGroup);
    });
    group.add(armGroup);

    // === LEGS ===
    const legGroup = new THREE.Group();
    legGroup.userData.isLegs = true;

    [-0.16, 0.16].forEach((offset, idx) => {
        const legSubGroup = new THREE.Group();
        legSubGroup.userData.legIndex = idx;

        // Thigh - taller
        const thighGeo = new THREE.CylinderGeometry(0.1, 0.12, 0.44, 8);
        const thigh = new THREE.Mesh(thighGeo, bodyMat);
        thigh.position.y = 0.58;
        legSubGroup.add(thigh);

        // Shin - taller
        const shinGeo = new THREE.CylinderGeometry(0.07, 0.1, 0.42, 8);
        const shin = new THREE.Mesh(shinGeo, bodyMat);
        shin.position.y = 0.21;
        legSubGroup.add(shin);

        // Foot
        const footGeo = new THREE.BoxGeometry(0.14, 0.08, 0.24);
        const foot = new THREE.Mesh(footGeo, new THREE.MeshStandardMaterial({ color: 0x2a2a2a }));
        foot.position.set(0, 0.04, 0.06);
        legSubGroup.add(foot);

        legSubGroup.position.x = offset;
        legGroup.add(legSubGroup);
    });
    group.add(legGroup);

    // Scale and position (using zombieData.scale only for type variations like boss/tank)
    group.scale.setScalar(zombieData.scale || 1);
    group.position.set(zombieData.position.x, 0, zombieData.position.z);
    group.rotation.y = zombieData.rotation || 0;

    scene.add(group);
    return group;
}

// Pooled version - doesn't add to scene (pool handles that)
function createZombieMeshPooled(zombieData) {
    // Use the new skeletal system for pooled zombies too
    return ZombieSkeleton.create(zombieData);
}

// Legacy pooled zombie creator (kept for reference)
function createZombieMeshPooledLegacy(zombieData) {
    const group = new THREE.Group();
    group.userData.zombieType = zombieData.type;

    const typeConfigs = {
        normal: { body: 0x3a5a3a, skin: 0x6a8a5a, eyes: 0x00ff00, wounds: true, torn: false },
        runner: { body: 0x5a3a3a, skin: 0x7a5a5a, eyes: 0xff6600, wounds: true, torn: true },
        tank: { body: 0x2a3a5a, skin: 0x4a5a6a, eyes: 0x0066ff, wounds: false, torn: false, armored: true },
        boss: { body: 0x4a1a4a, skin: 0x6a3a6a, eyes: 0xff00ff, wounds: true, torn: true, crowned: true }
    };

    const config = typeConfigs[zombieData.type] || typeConfigs.normal;

    const bodyMat = new THREE.MeshStandardMaterial({ color: config.body, roughness: 0.95, metalness: 0.1 });
    const skinMat = new THREE.MeshStandardMaterial({ color: config.skin, roughness: 0.9 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: config.eyes, emissive: config.eyes, emissiveIntensity: 1.5 });

    // Torso
    const torsoGroup = new THREE.Group();
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.48, 0.36), bodyMat);
    chest.position.set(0, 1.28, 0.05);
    chest.rotation.x = 0.15;
    torsoGroup.add(chest);

    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 12), bodyMat);
    belly.position.set(0, 0.98, 0.12);
    belly.scale.set(1, 0.8, 1);
    torsoGroup.add(belly);

    if (config.armored) {
        const armorMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, metalness: 0.6, roughness: 0.4 });
        const armor = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.38, 0.08), armorMat);
        armor.position.set(0, 1.32, 0.24);
        torsoGroup.add(armor);
    }
    group.add(torsoGroup);

    // Head
    const headGroup = new THREE.Group();
    headGroup.userData.isHead = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 16), skinMat);
    head.scale.set(0.9, 1.05, 0.95);
    headGroup.add(head);

    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.15), skinMat);
    jaw.position.set(0, -0.15, 0.1);
    jaw.rotation.x = 0.3;
    headGroup.add(jaw);

    [-0.1, 0.1].forEach(offset => {
        const socket = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
        socket.position.set(offset, 0.05, 0.2);
        headGroup.add(socket);
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), eyeMat);
        eye.position.set(offset, 0.05, 0.24);
        headGroup.add(eye);
    });

    if (config.crowned) {
        const crownMat = new THREE.MeshStandardMaterial({ color: 0xffaa00, metalness: 0.8, roughness: 0.2, emissive: 0x442200, emissiveIntensity: 0.3 });
        for (let i = 0; i < 5; i++) {
            const spike = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.15, 4), crownMat);
            const angle = (i / 5) * Math.PI - Math.PI / 2;
            spike.position.set(Math.sin(angle) * 0.2, 0.35, Math.cos(angle) * 0.1);
            spike.rotation.z = -angle * 0.3;
            headGroup.add(spike);
        }
    }
    headGroup.position.set(0, 1.68, 0.1);
    headGroup.rotation.x = 0.15;
    group.add(headGroup);

    // Arms
    const armGroup = new THREE.Group();
    armGroup.userData.isArms = true;
    [-1, 1].forEach((side, idx) => {
        const armSubGroup = new THREE.Group();
        armSubGroup.userData.armIndex = idx;
        const upperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.4, 8), bodyMat);
        upperArm.position.y = -0.2;
        armSubGroup.add(upperArm);
        const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.38, 8), config.torn ? skinMat : bodyMat);
        forearm.position.y = -0.52;
        forearm.rotation.x = -0.4;
        armSubGroup.add(forearm);
        const hand = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), skinMat);
        hand.position.set(0, -0.72, 0.12);
        hand.scale.set(1, 0.7, 1.2);
        armSubGroup.add(hand);
        armSubGroup.position.set(side * 0.40, 1.38, 0.05);
        armSubGroup.rotation.x = -0.6;
        armSubGroup.rotation.z = side * 0.25;
        armGroup.add(armSubGroup);
    });
    group.add(armGroup);

    // Legs
    const legGroup = new THREE.Group();
    legGroup.userData.isLegs = true;
    [-0.16, 0.16].forEach((offset, idx) => {
        const legSubGroup = new THREE.Group();
        legSubGroup.userData.legIndex = idx;
        const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.44, 8), bodyMat);
        thigh.position.y = 0.58;
        legSubGroup.add(thigh);
        const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.42, 8), bodyMat);
        shin.position.y = 0.21;
        legSubGroup.add(shin);
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.24), new THREE.MeshStandardMaterial({ color: 0x2a2a2a }));
        foot.position.set(0, 0.04, 0.06);
        legSubGroup.add(foot);
        legSubGroup.position.x = offset;
        legGroup.add(legSubGroup);
    });
    group.add(legGroup);

    group.scale.setScalar(zombieData.scale || 1);
    group.position.set(zombieData.position.x, 0, zombieData.position.z);
    group.rotation.y = zombieData.rotation || 0;

    return group; // Don't add to scene - pool handles that
}

function animateZombieDeath(zombie) {
    const fallDuration = 800;
    const startTime = Date.now();

    // Random fall direction
    const fallDirection = Math.random() * Math.PI * 2;
    const fallAxisX = Math.cos(fallDirection);
    const fallAxisZ = Math.sin(fallDirection);

    // Random death type: fall forward, backward, or to side
    const deathType = Math.floor(Math.random() * 3);

    // Play death sound
    if (zombie.mesh && zombie.mesh.position) {
        playZombieDeathSound(zombie.mesh.position);
    }

    // Spawn extra blood and debris at death position
    if (zombie.mesh) {
        const pos = zombie.mesh.position.clone();
        pos.y += 0.5;
        spawnBloodParticles(pos, 10);
        spawnDebris(pos, 3);
    }

    // Store original position
    const startY = zombie.mesh ? zombie.mesh.position.y : 0;
    const startRotX = zombie.mesh ? zombie.mesh.rotation.x : 0;
    const startRotZ = zombie.mesh ? zombie.mesh.rotation.z : 0;

    // Recursively set opacity on all materials
    function setOpacity(obj, opacity) {
        if (obj.material) {
            obj.material.transparent = true;
            obj.material.opacity = opacity;
        }
        if (obj.children) {
            obj.children.forEach(child => setOpacity(child, opacity));
        }
    }

    const animate = () => {
        if (!zombie.mesh) return;

        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / fallDuration, 1);

        // Easing for more natural fall
        const easeProgress = 1 - Math.pow(1 - progress, 3);

        // Apply rotation based on death type
        switch (deathType) {
            case 0: // Fall forward
                zombie.mesh.rotation.x = startRotX + easeProgress * (Math.PI / 2);
                break;
            case 1: // Fall backward
                zombie.mesh.rotation.x = startRotX - easeProgress * (Math.PI / 2);
                break;
            case 2: // Fall to side
                zombie.mesh.rotation.z = startRotZ + easeProgress * (Math.PI / 2) * (Math.random() > 0.5 ? 1 : -1);
                break;
        }

        // Drop to ground with slight horizontal movement
        zombie.mesh.position.y = Math.max(0.1, startY - easeProgress * (startY - 0.1));
        zombie.mesh.position.x += fallAxisX * 0.01 * (1 - progress);
        zombie.mesh.position.z += fallAxisZ * 0.01 * (1 - progress);

        // Fade out slower
        setOpacity(zombie.mesh, 1 - progress * 0.5);

        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            // Continue fading after fall complete
            let fadeProgress = 0;
            const fadeAnimate = () => {
                fadeProgress += 0.02;
                setOpacity(zombie.mesh, 0.5 - fadeProgress * 0.5);

                if (fadeProgress < 1) {
                    requestAnimationFrame(fadeAnimate);
                } else {
                    // Remove from spatial grid
                    SpatialGrid.remove(zombie);
                    // Release mesh back to pool for reuse
                    ZombiePool.release(zombie.id);
                    zombies.delete(zombie.id);
                    invalidateZombieMeshCache();
                }
            };
            setTimeout(fadeAnimate, 2000);
        }
    };
    animate();
}

// ==================== PICKUP MESH CREATION ====================
function createPickupMesh(pickupData) {
    const group = new THREE.Group();

    const colors = {
        health: { main: 0xff0000, emissive: 0xff0000 },
        ammo: { main: 0xffaa00, emissive: 0xff6600 },
        grenade: { main: 0x00ff00, emissive: 0x00aa00 }
    };
    const c = colors[pickupData.type] || colors.ammo;

    const geo = new THREE.OctahedronGeometry(0.3, 0);
    const mat = new THREE.MeshStandardMaterial({
        color: c.main,
        emissive: c.emissive,
        emissiveIntensity: 0.5,
        metalness: 0.8,
        roughness: 0.2
    });
    const mesh = new THREE.Mesh(geo, mat);
    group.add(mesh);

    const glowGeo = new THREE.SphereGeometry(0.4, 16, 16);
    const glowMat = new THREE.MeshBasicMaterial({
        color: c.emissive,
        transparent: true,
        opacity: 0.3
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    group.add(glow);

    group.position.set(pickupData.position.x, pickupData.position.y, pickupData.position.z);
    scene.add(group);

    return group;
}

// ==================== MAP SYSTEM INITIALIZATION ====================
function initMapSystem() {
    // Check if MapManager is available (new map system)
    if (typeof MapManager !== 'undefined') {
        DebugLog.log('Initializing new map system...', 'info');

        // Initialize MapManager with scene
        MapManager.init(scene);

        // Register all maps
        MapManager.registerMap('dining_hall', new DiningHallMap());
        MapManager.registerMap('arcade_zone', new ArcadeZoneMap());
        MapManager.registerMap('backstage', new BackstageMap());
        MapManager.registerMap('kitchen', new KitchenMap());
        MapManager.registerMap('party_room', new PartyRoomMap());

        // Load the first map (dining hall for wave 1)
        MapManager.loadMap('dining_hall').catch(err => {
            DebugLog.log(`Failed to load initial map: ${err.message}`, 'error');
        });

        DebugLog.log('Map system initialized with 5 maps', 'success');
    } else {
        // Fall back to legacy environment
        DebugLog.log('MapManager not found, using legacy environment', 'warn');
        createEnvironment();
    }
}

// ==================== ENVIRONMENT (LEGACY) ====================
function createEnvironment() {
    // Initialize procedural map with random seed
    ProceduralMap.init(Date.now());
    DebugLog.log(`Creating environment with layout: ${ProceduralMap.currentLayout}`, 'info');
    createLighting();
    createFloor();
    createWalls();
    createInteriorWalls();
    createPillars();
    createDecorations();
    createArcadeMachines();
    createTables();
    createDestructibleProps();
    createPrizeCounter();
    createKitchenCounter();
    createBallPit();
    createStage();
    createPlayStructure();
    createPartyRooms();
    createRestrooms();
    createSkeeballLanes();
    createTokenMachines();
    createWaitingArea();
    registerObstaclesForPathfinding();
    CollisionGrid.build(collisionObjects);
    DebugLog.log('Environment created successfully', 'success');
}

// Register all collidable objects as pathfinding obstacles
function registerObstaclesForPathfinding() {
    obstacles.length = 0; // Clear existing
    collisionObjects.forEach(obj => {
        if (obj.userData && obj.userData.collision) {
            const c = obj.userData.collision;
            obstacles.push({
                minX: c.minX,
                maxX: c.maxX,
                minZ: c.minZ,
                maxZ: c.maxZ,
                centerX: (c.minX + c.maxX) / 2,
                centerZ: (c.minZ + c.maxZ) / 2,
                radius: Math.max(c.maxX - c.minX, c.maxZ - c.minZ) / 2 + 0.5 // Add buffer
            });
        }
    });
    DebugLog.log(`Registered ${obstacles.length} obstacles for pathfinding`, 'info');

    // Build navigation grid for A* pathfinding
    NavGrid.rebuildFromObstacles();
    Pathfinder.clearCache();
}

function createLighting() {
    // Creepy ambient light
    const ambient = new THREE.AmbientLight(0x1a0505, 0.25);
    scene.add(ambient);

    // Add fog for atmosphere
    scene.fog = new THREE.Fog(0x0a0000, 5, 45);

    // Flickering point lights throughout the venue
    const lightPositions = [
        { x: -15, z: -15, broken: false },
        { x: 15, z: -15, broken: true },   // This one flickers more
        { x: -15, z: 15, broken: false },
        { x: 15, z: 15, broken: false },
        { x: 0, z: 0, broken: false },
        { x: -8, z: 8, broken: true },     // Extra broken light
        { x: 8, z: -8, broken: false }
    ];

    lightPositions.forEach((pos) => {
        const light = new THREE.PointLight(0xff4400, 0.8, 22);
        light.position.set(pos.x, 4, pos.z);
        light.castShadow = true;
        light.userData.flickerOffset = Math.random() * Math.PI * 2;
        light.userData.baseIntensity = pos.broken ? 0.3 : (0.5 + Math.random() * 0.4);
        light.userData.isBroken = pos.broken;
        light.userData.flickerSpeed = pos.broken ? 15 + Math.random() * 10 : 5;
        scene.add(light);

        // Light fixture
        const fixtureGeo = new THREE.CylinderGeometry(0.3, 0.5, 0.3, 8);
        const fixtureMat = new THREE.MeshStandardMaterial({
            color: 0x333333,
            emissive: pos.broken ? 0x550000 : 0xff2200,
            emissiveIntensity: pos.broken ? 0.1 : 0.3
        });
        const fixture = new THREE.Mesh(fixtureGeo, fixtureMat);
        fixture.position.set(pos.x, 4.5, pos.z);
        fixture.userData.light = light;
        scene.add(fixture);
    });

    // Eerie stage spotlight
    const stageSpot = new THREE.SpotLight(0xff0000, 1.2, 35, Math.PI / 6, 0.5);
    stageSpot.position.set(0, 6, -20);
    stageSpot.target.position.set(0, 0, -22);
    stageSpot.castShadow = true;
    stageSpot.userData.flickerOffset = Math.random() * Math.PI * 2;
    stageSpot.userData.baseIntensity = 1.2;
    stageSpot.userData.flickerSpeed = 3;
    scene.add(stageSpot);
    scene.add(stageSpot.target);

    // Emergency exit light (green glow)
    const exitLight = new THREE.PointLight(0x00ff00, 0.4, 10);
    exitLight.position.set(25, 3, 0);
    scene.add(exitLight);

    // Create exit sign
    const exitSignGeo = new THREE.BoxGeometry(1.5, 0.5, 0.1);
    const exitSignMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const exitSign = new THREE.Mesh(exitSignGeo, exitSignMat);
    exitSign.position.set(25, 3, 0.5);
    scene.add(exitSign);
}

function createFloor() {
    const floorSize = CONFIG.arena.width;
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    const tilePixels = canvas.width / 8;
    for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
            ctx.fillStyle = (i + j) % 2 === 0 ? '#2a1a1a' : '#1a0a0a';
            ctx.fillRect(i * tilePixels, j * tilePixels, tilePixels, tilePixels);
        }
    }

    ctx.fillStyle = 'rgba(80, 20, 20, 0.3)';
    for (let i = 0; i < 20; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const r = 20 + Math.random() * 40;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }

    const floorTexture = new THREE.CanvasTexture(canvas);
    floorTexture.wrapS = THREE.RepeatWrapping;
    floorTexture.wrapT = THREE.RepeatWrapping;
    floorTexture.repeat.set(12.5, 12.5);

    const floorGeo = new THREE.PlaneGeometry(floorSize, floorSize);
    const floorMat = new THREE.MeshStandardMaterial({ map: floorTexture, roughness: 0.8 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    floor.userData.isFloor = true;
    scene.add(floor);
}

function createWalls() {
    const wallHeight = CONFIG.arena.wallHeight;
    const arenaSize = CONFIG.arena.width / 2;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#3a1a2a');
    gradient.addColorStop(1, '#2a0a1a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(100, 30, 50, 0.5)';
    ctx.lineWidth = 8;
    for (let x = 0; x < canvas.width; x += 32) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }

    const wallTexture = new THREE.CanvasTexture(canvas);
    wallTexture.wrapS = THREE.RepeatWrapping;
    wallTexture.wrapT = THREE.RepeatWrapping;
    wallTexture.repeat.set(4, 1);

    const wallMat = new THREE.MeshStandardMaterial({ map: wallTexture, roughness: 0.9 });

    const walls = [
        { pos: [0, wallHeight / 2, -arenaSize], rot: [0, 0, 0] },
        { pos: [0, wallHeight / 2, arenaSize], rot: [0, Math.PI, 0] },
        { pos: [-arenaSize, wallHeight / 2, 0], rot: [0, Math.PI / 2, 0] },
        { pos: [arenaSize, wallHeight / 2, 0], rot: [0, -Math.PI / 2, 0] }
    ];

    walls.forEach(wall => {
        const geo = new THREE.PlaneGeometry(CONFIG.arena.width, wallHeight);
        const mesh = new THREE.Mesh(geo, wallMat);
        mesh.position.set(...wall.pos);
        mesh.rotation.set(...wall.rot);
        mesh.receiveShadow = true;
        mesh.userData.isWall = true;
        scene.add(mesh);
    });

    const ceilingGeo = new THREE.PlaneGeometry(CONFIG.arena.width, CONFIG.arena.depth);
    const ceilingMat = new THREE.MeshStandardMaterial({ color: 0x1a0a0a });
    const ceiling = new THREE.Mesh(ceilingGeo, ceilingMat);
    ceiling.position.y = wallHeight;
    ceiling.rotation.x = Math.PI / 2;
    scene.add(ceiling);
}

function createDecorations() {
    for (let i = 0; i < 15; i++) {
        const boxGeo = new THREE.BoxGeometry(0.4, 0.05, 0.4);
        const boxMat = new THREE.MeshStandardMaterial({ color: 0x8b4513 });
        const box = new THREE.Mesh(boxGeo, boxMat);
        box.position.set((Math.random() - 0.5) * 40, 0.025, (Math.random() - 0.5) * 40);
        box.rotation.y = Math.random() * Math.PI;
        scene.add(box);
    }

    for (let i = 0; i < 10; i++) {
        const splatGeo = new THREE.CircleGeometry(0.5 + Math.random() * 1, 16);
        const splatMat = new THREE.MeshStandardMaterial({ color: 0x4a0000, transparent: true, opacity: 0.6 });
        const splat = new THREE.Mesh(splatGeo, splatMat);
        splat.position.set((Math.random() - 0.5) * 40, 0.01, (Math.random() - 0.5) * 40);
        splat.rotation.x = -Math.PI / 2;
        scene.add(splat);
    }
}

function createPillars() {
    // Support pillars throughout the venue
    const pillarPositions = [
        { x: -15, z: -15 }, { x: 15, z: -15 },
        { x: -15, z: 15 }, { x: 15, z: 15 },
        { x: 0, z: 0 }
    ];

    const pillarMat = new THREE.MeshStandardMaterial({
        color: 0x3a2a2a,
        roughness: 0.9
    });

    pillarPositions.forEach(pos => {
        const group = new THREE.Group();

        // Main pillar
        const pillarGeo = new THREE.CylinderGeometry(0.6, 0.7, CONFIG.arena.wallHeight, 12);
        const pillar = new THREE.Mesh(pillarGeo, pillarMat);
        pillar.position.y = CONFIG.arena.wallHeight / 2;
        pillar.castShadow = true;
        pillar.receiveShadow = true;
        group.add(pillar);

        // Base
        const baseGeo = new THREE.CylinderGeometry(0.8, 0.9, 0.3, 12);
        const base = new THREE.Mesh(baseGeo, pillarMat);
        base.position.y = 0.15;
        group.add(base);

        // Top capital
        const capGeo = new THREE.CylinderGeometry(0.9, 0.6, 0.3, 12);
        const cap = new THREE.Mesh(capGeo, pillarMat);
        cap.position.y = CONFIG.arena.wallHeight - 0.15;
        group.add(cap);

        group.position.set(pos.x, 0, pos.z);

        // Register collision - pillars are full height (not jumpable)
        group.userData.collision = {
            minX: pos.x - 0.8,
            maxX: pos.x + 0.8,
            minZ: pos.z - 0.8,
            maxZ: pos.z + 0.8,
            maxY: CONFIG.arena.wallHeight // Full height pillar
        };
        collisionObjects.push(group);

        scene.add(group);
    });
}

function createArcadeMachines() {
    // Arcade machines along walls only - no center row for clear pathways
    const positions = [
        // Left wall - spaced for pathways
        { x: -25, z: -16, rot: Math.PI / 2 },
        { x: -25, z: -10, rot: Math.PI / 2 },
        { x: -25, z: -4, rot: Math.PI / 2 },
        { x: -25, z: 6, rot: Math.PI / 2 },
        // Right wall - spaced for pathways
        { x: 25, z: -16, rot: -Math.PI / 2 },
        { x: 25, z: -10, rot: -Math.PI / 2 },
        { x: 25, z: 6, rot: -Math.PI / 2 }
    ];

    const arcadeColors = [0x2a1a4a, 0x4a2a1a, 0x1a3a2a, 0x4a1a1a, 0x1a1a4a];

    positions.forEach((pos, i) => {
        const group = new THREE.Group();

        // Cabinet body - taller and wider for realistic arcade cabinet (~1.8m tall)
        const bodyGeo = new THREE.BoxGeometry(1.0, 1.9, 0.85);
        const bodyMat = new THREE.MeshStandardMaterial({
            color: arcadeColors[i % arcadeColors.length],
            roughness: 0.7
        });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 0.95;
        body.castShadow = true;
        group.add(body);

        // Screen bezel (black frame)
        const bezelGeo = new THREE.BoxGeometry(0.85, 0.65, 0.05);
        const bezelMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
        const bezel = new THREE.Mesh(bezelGeo, bezelMat);
        bezel.position.set(0, 1.35, 0.43);
        group.add(bezel);

        // Screen (glowing)
        const screenGeo = new THREE.PlaneGeometry(0.75, 0.55);
        const screenMat = new THREE.MeshBasicMaterial({
            color: Math.random() > 0.3 ? 0x002200 : 0x220000, // Some broken
            transparent: true,
            opacity: 0.95
        });
        const screen = new THREE.Mesh(screenGeo, screenMat);
        screen.position.set(0, 1.35, 0.46);
        group.add(screen);

        // Control panel - angled
        const panelGeo = new THREE.BoxGeometry(0.95, 0.35, 0.55);
        const panel = new THREE.Mesh(panelGeo, new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
        panel.position.set(0, 0.75, 0.35);
        panel.rotation.x = -0.35;
        group.add(panel);

        // Joystick
        const stickBase = new THREE.Mesh(
            new THREE.CylinderGeometry(0.04, 0.05, 0.02, 12),
            new THREE.MeshStandardMaterial({ color: 0x333333 })
        );
        stickBase.position.set(-0.25, 0.88, 0.38);
        group.add(stickBase);

        const stick = new THREE.Mesh(
            new THREE.CylinderGeometry(0.015, 0.015, 0.08, 8),
            new THREE.MeshStandardMaterial({ color: 0x111111 })
        );
        stick.position.set(-0.25, 0.93, 0.38);
        group.add(stick);

        const stickBall = new THREE.Mesh(
            new THREE.SphereGeometry(0.025, 8, 8),
            new THREE.MeshStandardMaterial({ color: 0xff0000 })
        );
        stickBall.position.set(-0.25, 0.98, 0.38);
        group.add(stickBall);

        // Buttons - larger
        const buttonColors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00];
        buttonColors.forEach((color, bi) => {
            const btnGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.025, 12);
            const btn = new THREE.Mesh(btnGeo, new THREE.MeshStandardMaterial({
                color: color,
                emissive: color,
                emissiveIntensity: 0.4
            }));
            btn.position.set(0.05 + bi * 0.1, 0.90, 0.40);
            btn.rotation.x = -0.35;
            group.add(btn);
        });

        // Coin slot area
        const coinSlot = new THREE.Mesh(
            new THREE.BoxGeometry(0.15, 0.08, 0.02),
            new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.5 })
        );
        coinSlot.position.set(0, 0.45, 0.44);
        group.add(coinSlot);

        group.position.set(pos.x, 0, pos.z);
        group.rotation.y = pos.rot;

        // Collision bounds (in world space) - adjusted for larger size
        const cos = Math.cos(pos.rot);
        const sin = Math.sin(pos.rot);
        const hw = 0.55, hd = 0.5;
        group.userData.collision = {
            minX: pos.x - Math.abs(cos * hw) - Math.abs(sin * hd) - 0.25,
            maxX: pos.x + Math.abs(cos * hw) + Math.abs(sin * hd) + 0.25,
            minZ: pos.z - Math.abs(sin * hw) - Math.abs(cos * hd) - 0.25,
            maxZ: pos.z + Math.abs(sin * hw) + Math.abs(cos * hd) + 0.25,
            maxY: 1.9 // Arcade machine height - not jumpable
        };
        collisionObjects.push(group);

        scene.add(group);
    });
}

function createTables() {
    // Use fixed positions from ProceduralMap for organized layout
    const positions = ProceduralMap.getTablePositions();

    positions.forEach(pos => {
        const group = new THREE.Group();

        // Table top - scaled up for realism (about waist height ~0.9m)
        const tableGeo = new THREE.CylinderGeometry(1.4, 1.4, 0.10, 16);
        const tableMat = new THREE.MeshStandardMaterial({
            color: 0x8b4513,
            roughness: 0.6
        });
        const table = new THREE.Mesh(tableGeo, tableMat);
        table.position.y = 0.9;
        table.receiveShadow = true;
        group.add(table);

        // Central leg - taller
        const legGeo = new THREE.CylinderGeometry(0.10, 0.14, 0.90, 8);
        const legMat = new THREE.MeshStandardMaterial({ color: 0x2a1a0a });
        const leg = new THREE.Mesh(legGeo, legMat);
        leg.position.y = 0.45;
        group.add(leg);

        // Base - larger
        const baseGeo = new THREE.CylinderGeometry(0.5, 0.6, 0.06, 12);
        const base = new THREE.Mesh(baseGeo, legMat);
        base.position.y = 0.03;
        group.add(base);

        // Chairs around table - scaled up for adult size
        for (let i = 0; i < 4; i++) {
            const angle = (i / 4) * Math.PI * 2;
            const chairGroup = new THREE.Group();

            // Seat - larger and higher (standard chair seat ~0.45-0.5m)
            const seatGeo = new THREE.BoxGeometry(0.45, 0.06, 0.42);
            const seatMat = new THREE.MeshStandardMaterial({ color: 0x4a2a1a });
            const seat = new THREE.Mesh(seatGeo, seatMat);
            seat.position.y = 0.48;
            chairGroup.add(seat);

            // Back - taller (chair back ~0.9-1.0m from ground)
            const backGeo = new THREE.BoxGeometry(0.45, 0.50, 0.06);
            const back = new THREE.Mesh(backGeo, seatMat);
            back.position.set(0, 0.76, -0.20);
            chairGroup.add(back);

            // Four legs - taller
            const legPositions = [
                { x: 0.18, z: 0.16 }, { x: -0.18, z: 0.16 },
                { x: 0.18, z: -0.16 }, { x: -0.18, z: -0.16 }
            ];
            legPositions.forEach(lp => {
                const chairLeg = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.025, 0.025, 0.48, 6),
                    legMat
                );
                chairLeg.position.set(lp.x, 0.24, lp.z);
                chairGroup.add(chairLeg);
            });

            chairGroup.position.set(Math.sin(angle) * 2.0, 0, Math.cos(angle) * 2.0);
            chairGroup.rotation.y = angle + Math.PI;
            group.add(chairGroup);
        }

        group.position.set(pos.x, 0, pos.z);

        // Collision for table - adjusted for larger size
        // Tables with chairs are ~1.0m tall - jumpable
        group.userData.collision = {
            minX: pos.x - 1.6,
            maxX: pos.x + 1.6,
            minZ: pos.z - 1.6,
            maxZ: pos.z + 1.6,
            maxY: 1.0 // Table/chair height - jumpable
        };
        collisionObjects.push(group);

        // Register as destructible object
        destructibleObjects.push({
            mesh: group,
            collision: group.userData.collision,
            health: 80,
            maxHealth: 80,
            material: 'wood',
            height: 1.0,
            size: 1.5,
            destroyed: false
        });

        scene.add(group);
    });
}

function createDestructibleProps() {
    // Get procedural positions or use defaults
    const propPositions = ProceduralMap.getDestructiblePropPositions();
    const barrelPositions = propPositions.barrels.length > 0 ? propPositions.barrels : [
        { x: -20, z: -5 }, { x: -18, z: 8 }, { x: 18, z: -8 },
        { x: 15, z: 10 }, { x: -10, z: -18 }, { x: 5, z: -20 },
        { x: -22, z: 18 }, { x: 22, z: -18 }
    ];

    barrelPositions.forEach(pos => {
        const group = new THREE.Group();

        // Barrel body
        const barrelGeo = new THREE.CylinderGeometry(0.4, 0.45, 1.0, 12);
        const barrelMat = new THREE.MeshStandardMaterial({
            color: 0x8b4513,
            roughness: 0.7
        });
        const barrel = new THREE.Mesh(barrelGeo, barrelMat);
        barrel.position.y = 0.5;
        barrel.castShadow = true;
        group.add(barrel);

        // Metal bands
        const bandGeo = new THREE.TorusGeometry(0.42, 0.03, 8, 16);
        const bandMat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.6 });
        [-0.3, 0, 0.3].forEach(y => {
            const band = new THREE.Mesh(bandGeo, bandMat);
            band.rotation.x = Math.PI / 2;
            band.position.y = 0.5 + y;
            group.add(band);
        });

        group.position.set(pos.x, 0, pos.z);

        const collision = {
            minX: pos.x - 0.5,
            maxX: pos.x + 0.5,
            minZ: pos.z - 0.5,
            maxZ: pos.z + 0.5,
            maxY: 1.0 // Barrel height - jumpable
        };
        group.userData.collision = collision;
        collisionObjects.push(group);

        destructibleObjects.push({
            mesh: group,
            collision: collision,
            health: 40,
            maxHealth: 40,
            material: 'wood',
            height: 1.0,
            size: 0.8,
            destroyed: false
        });

        scene.add(group);
    });

    // Crate positions - use procedural or defaults
    const cratePositions = propPositions.crates.length > 0 ? propPositions.crates : [
        { x: -15, z: -15 }, { x: 10, z: -15 }, { x: -8, z: 20 },
        { x: 20, z: 5 }, { x: -20, z: -20 }, { x: 8, z: 22 }
    ];

    cratePositions.forEach(pos => {
        const group = new THREE.Group();

        // Crate body
        const crateGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
        const crateMat = new THREE.MeshStandardMaterial({
            color: 0xa0825a,
            roughness: 0.9
        });
        const crate = new THREE.Mesh(crateGeo, crateMat);
        crate.position.y = 0.45;
        crate.castShadow = true;
        group.add(crate);

        // Cross boards
        const boardGeo = new THREE.BoxGeometry(0.92, 0.08, 0.08);
        const boardMat = new THREE.MeshStandardMaterial({ color: 0x6a4a3a });

        // Front/back crosses
        [[0, 0.45, 0.45], [0, 0.45, -0.45]].forEach(([x, y, z]) => {
            const board1 = new THREE.Mesh(boardGeo, boardMat);
            board1.position.set(x, y - 0.2, z);
            board1.rotation.z = 0.7;
            group.add(board1);

            const board2 = new THREE.Mesh(boardGeo, boardMat);
            board2.position.set(x, y + 0.2, z);
            board2.rotation.z = -0.7;
            group.add(board2);
        });

        group.position.set(pos.x, 0, pos.z);
        group.rotation.y = Math.random() * Math.PI;

        const collision = {
            minX: pos.x - 0.55,
            maxX: pos.x + 0.55,
            minZ: pos.z - 0.55,
            maxZ: pos.z + 0.55,
            maxY: 0.9 // Crate height - jumpable
        };
        group.userData.collision = collision;
        collisionObjects.push(group);

        destructibleObjects.push({
            mesh: group,
            collision: collision,
            health: 50,
            maxHealth: 50,
            material: 'wood',
            height: 0.9,
            size: 0.9,
            destroyed: false
        });

        scene.add(group);
    });

    // Create procedural barricades based on layout
    createProceduralBarricades();
}

function createProceduralBarricades() {
    const barricades = ProceduralMap.getBarricadePositions();

    barricades.forEach(bar => {
        const group = new THREE.Group();
        const length = bar.length || 2;

        // Sandbag-style barricade
        const numBags = Math.ceil(length * 2);
        for (let row = 0; row < 2; row++) {
            for (let i = 0; i < numBags; i++) {
                const bagGeo = new THREE.BoxGeometry(0.5, 0.25, 0.35);
                const bagMat = new THREE.MeshStandardMaterial({
                    color: 0x8b7355,
                    roughness: 0.9
                });
                const bag = new THREE.Mesh(bagGeo, bagMat);
                bag.position.set(
                    (i - numBags / 2 + 0.5) * 0.48,
                    row * 0.25 + 0.125,
                    (row % 2) * 0.05
                );
                bag.rotation.y = (i % 2) * 0.1;
                bag.castShadow = true;
                group.add(bag);
            }
        }

        // Top layer (offset)
        for (let i = 0; i < numBags - 1; i++) {
            const bagGeo = new THREE.BoxGeometry(0.5, 0.25, 0.35);
            const bagMat = new THREE.MeshStandardMaterial({
                color: 0x7a6345,
                roughness: 0.9
            });
            const bag = new THREE.Mesh(bagGeo, bagMat);
            bag.position.set(
                (i - numBags / 2 + 1) * 0.48,
                0.625,
                0.025
            );
            bag.castShadow = true;
            group.add(bag);
        }

        group.position.set(bar.x, 0, bar.z);
        group.rotation.y = bar.rotation || 0;

        // Calculate collision bounds
        const halfLength = (numBags * 0.48) / 2 + 0.2;
        const cos = Math.cos(bar.rotation || 0);
        const sin = Math.sin(bar.rotation || 0);

        const collision = {
            minX: bar.x - Math.abs(cos * halfLength) - Math.abs(sin * 0.4),
            maxX: bar.x + Math.abs(cos * halfLength) + Math.abs(sin * 0.4),
            minZ: bar.z - Math.abs(sin * halfLength) - Math.abs(cos * 0.4),
            maxZ: bar.z + Math.abs(sin * halfLength) + Math.abs(cos * 0.4),
            maxY: 0.75 // Sandbag barricade height - jumpable
        };
        group.userData.collision = collision;
        collisionObjects.push(group);

        // Barricades are destructible too
        destructibleObjects.push({
            mesh: group,
            collision: collision,
            health: 100 + length * 20,
            maxHealth: 100 + length * 20,
            material: 'wood',
            height: 0.75,
            size: length * 0.5,
            destroyed: false
        });

        scene.add(group);
    });
}

function createPrizeCounter() {
    const group = new THREE.Group();

    // Counter base
    const counterGeo = new THREE.BoxGeometry(8, 1.2, 2);
    const counterMat = new THREE.MeshStandardMaterial({ color: 0x6a4a3a, roughness: 0.8 });
    const counter = new THREE.Mesh(counterGeo, counterMat);
    counter.position.y = 0.6;
    counter.receiveShadow = true;
    group.add(counter);

    // Counter top (glass display)
    const glassGeo = new THREE.BoxGeometry(7.5, 0.8, 1.5);
    const glassMat = new THREE.MeshStandardMaterial({
        color: 0x88ccff,
        transparent: true,
        opacity: 0.3,
        roughness: 0.1,
        metalness: 0.2
    });
    const glass = new THREE.Mesh(glassGeo, glassMat);
    glass.position.y = 1.6;
    group.add(glass);

    // Prize items on shelves behind
    const shelfGeo = new THREE.BoxGeometry(8, 0.1, 0.8);
    const shelfMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2a });
    [1.5, 2.5, 3.5].forEach(y => {
        const shelf = new THREE.Mesh(shelfGeo, shelfMat);
        shelf.position.set(0, y, -1.2);
        group.add(shelf);

        // Add prize items (stuffed animals, toys)
        for (let i = -3; i <= 3; i++) {
            const prizeGeo = new THREE.SphereGeometry(0.15 + Math.random() * 0.1, 8, 8);
            const prizeMat = new THREE.MeshStandardMaterial({
                color: Math.random() * 0xffffff
            });
            const prize = new THREE.Mesh(prizeGeo, prizeMat);
            prize.position.set(i * 1, y + 0.2, -1.2);
            group.add(prize);
        }
    });

    group.position.set(20, 0, -22);
    group.rotation.y = -Math.PI / 2;

    group.userData.collision = {
        minX: 18, maxX: 22,
        minZ: -26, maxZ: -18,
        maxY: 2.5 // Prize counter is tall - not jumpable
    };
    collisionObjects.push(group);

    scene.add(group);
}

function createBallPit() {
    const group = new THREE.Group();

    // Pit walls
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xff4444, roughness: 0.8 });
    const wallGeo = new THREE.BoxGeometry(0.2, 1, 6);

    // Four walls
    const wall1 = new THREE.Mesh(wallGeo, wallMat);
    wall1.position.set(-3, 0.5, 0);
    group.add(wall1);

    const wall2 = new THREE.Mesh(wallGeo, wallMat);
    wall2.position.set(3, 0.5, 0);
    group.add(wall2);

    const wall3 = new THREE.Mesh(new THREE.BoxGeometry(6.4, 1, 0.2), wallMat);
    wall3.position.set(0, 0.5, -3);
    group.add(wall3);

    const wall4 = new THREE.Mesh(new THREE.BoxGeometry(6.4, 1, 0.2), wallMat);
    wall4.position.set(0, 0.5, 3);
    group.add(wall4);

    // Balls (lots of them!)
    const ballColors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff];
    for (let i = 0; i < 150; i++) {
        const ballGeo = new THREE.SphereGeometry(0.12, 8, 8);
        const ballMat = new THREE.MeshStandardMaterial({
            color: ballColors[Math.floor(Math.random() * ballColors.length)]
        });
        const ball = new THREE.Mesh(ballGeo, ballMat);
        ball.position.set(
            (Math.random() - 0.5) * 5.5,
            0.15 + Math.random() * 0.5,
            (Math.random() - 0.5) * 5.5
        );
        group.add(ball);
    }

    group.position.set(-20, 0, 15);

    group.userData.collision = {
        minX: -23.2, maxX: -16.8,
        minZ: 11.8, maxZ: 18.2,
        maxY: 1.0 // Ball pit walls are 1m - jumpable
    };
    collisionObjects.push(group);

    scene.add(group);
}

function createPlayStructure() {
    const group = new THREE.Group();

    const tubeMat = new THREE.MeshStandardMaterial({ color: 0x00aa00, roughness: 0.7 });
    const platformMat = new THREE.MeshStandardMaterial({ color: 0xffaa00, roughness: 0.8 });

    // Main platform
    const platformGeo = new THREE.BoxGeometry(4, 0.3, 4);
    const platform = new THREE.Mesh(platformGeo, platformMat);
    platform.position.y = 2;
    group.add(platform);

    // Support posts
    const postGeo = new THREE.CylinderGeometry(0.15, 0.15, 2, 8);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x3333aa });
    [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]].forEach(([x, z]) => {
        const post = new THREE.Mesh(postGeo, postMat);
        post.position.set(x, 1, z);
        group.add(post);
    });

    // Slide
    const slidePath = new THREE.CurvePath();
    slidePath.add(new THREE.LineCurve3(
        new THREE.Vector3(0, 2, 2),
        new THREE.Vector3(0, 0, 5)
    ));
    const slideGeo = new THREE.BoxGeometry(1, 0.1, 4);
    const slideMat = new THREE.MeshStandardMaterial({ color: 0xffff00, roughness: 0.3 });
    const slide = new THREE.Mesh(slideGeo, slideMat);
    slide.position.set(0, 1, 3.5);
    slide.rotation.x = 0.5;
    group.add(slide);

    // Tube tunnel
    const tubeGeo = new THREE.CylinderGeometry(0.6, 0.6, 3, 16, 1, true);
    const tube = new THREE.Mesh(tubeGeo, tubeMat);
    tube.position.set(-2.5, 2, 0);
    tube.rotation.z = Math.PI / 2;
    group.add(tube);

    // Roof
    const roofGeo = new THREE.ConeGeometry(3, 1.5, 6);
    const roofMat = new THREE.MeshStandardMaterial({ color: 0xff4444 });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = 3;
    group.add(roof);

    group.position.set(-20, 0, -15);

    group.userData.collision = {
        minX: -24, maxX: -16,
        minZ: -19, maxZ: -10,
        maxY: 3.5 // Play structure is tall - not jumpable
    };
    collisionObjects.push(group);

    scene.add(group);
}

function createStage() {
    const stageGeo = new THREE.BoxGeometry(15, 1, 5);
    const stageMat = new THREE.MeshStandardMaterial({ color: 0x2a1a2a });
    const stage = new THREE.Mesh(stageGeo, stageMat);
    stage.position.set(0, 0.5, -22);
    scene.add(stage);

    const curtainGeo = new THREE.PlaneGeometry(8, 4);
    const curtainMat = new THREE.MeshStandardMaterial({ color: 0x4a0a2a, side: THREE.DoubleSide });
    [-6, 6].forEach(x => {
        const curtain = new THREE.Mesh(curtainGeo, curtainMat);
        curtain.position.set(x, 3, -24);
        scene.add(curtain);
    });

    // Animatronics
    [[-4, 0x8b4513], [0, 0x666666], [4, 0x4a2a6a]].forEach(([x, color]) => {
        const bodyGeo = new THREE.CylinderGeometry(0.4, 0.5, 1.2, 8);
        const bodyMat = new THREE.MeshStandardMaterial({ color });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.set(x, 1.5, -22);
        scene.add(body);

        const headGeo = new THREE.SphereGeometry(0.4, 16, 16);
        const head = new THREE.Mesh(headGeo, bodyMat);
        head.position.set(x, 2.4, -22);
        scene.add(head);

        const eyeGeo = new THREE.SphereGeometry(0.08, 8, 8);
        const eyeMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 2 });
        [-0.15, 0.15].forEach(offset => {
            const eye = new THREE.Mesh(eyeGeo, eyeMat);
            eye.position.set(x + offset, 2.45, -21.65);
            scene.add(eye);
        });
    });
}

// Interior dividing walls for zones
function createInteriorWalls() {
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x3a2a3a, roughness: 0.9 });
    const wallHeight = 3.5;

    // Wall definitions: [x, z, width, depth, rotation]
    const walls = [
        // Divider between dining and arcade area
        { x: 0, z: 0, w: 12, d: 0.3, h: wallHeight, rot: 0 },
        // Half-wall near ball pit
        { x: -15, z: 10, w: 6, d: 0.3, h: 1.5, rot: Math.PI / 2 },
        // Kitchen separation wall
        { x: 18, z: 10, w: 8, d: 0.3, h: wallHeight, rot: 0 },
        // Party room entrance walls
        { x: 22, z: 0, w: 5, d: 0.3, h: wallHeight, rot: Math.PI / 2 },
        { x: 22, z: -8, w: 5, d: 0.3, h: wallHeight, rot: Math.PI / 2 }
    ];

    walls.forEach(wall => {
        const group = new THREE.Group();
        const geo = new THREE.BoxGeometry(wall.w, wall.h, wall.d);
        const mesh = new THREE.Mesh(geo, wallMat);
        mesh.position.y = wall.h / 2;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);

        // Add baseboard trim
        const trimGeo = new THREE.BoxGeometry(wall.w + 0.1, 0.15, wall.d + 0.05);
        const trimMat = new THREE.MeshStandardMaterial({ color: 0x2a1a2a });
        const trim = new THREE.Mesh(trimGeo, trimMat);
        trim.position.y = 0.075;
        group.add(trim);

        group.position.set(wall.x, 0, wall.z);
        group.rotation.y = wall.rot || 0;

        // Calculate collision bounds
        const cos = Math.cos(wall.rot || 0);
        const sin = Math.sin(wall.rot || 0);
        const hw = wall.w / 2, hd = wall.d / 2 + 0.2;
        group.userData.collision = {
            minX: wall.x - Math.abs(cos * hw) - Math.abs(sin * hd),
            maxX: wall.x + Math.abs(cos * hw) + Math.abs(sin * hd),
            minZ: wall.z - Math.abs(sin * hw) - Math.abs(cos * hd),
            maxZ: wall.z + Math.abs(sin * hw) + Math.abs(cos * hd),
            maxY: wall.h // Interior walls use their specified height
        };
        collisionObjects.push(group);
        scene.add(group);
    });
}

// Kitchen/food counter with pizza oven
function createKitchenCounter() {
    const group = new THREE.Group();
    const counterMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.3, roughness: 0.7 });
    const ovenMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.5 });

    // Main counter (L-shaped)
    const counter1 = new THREE.Mesh(new THREE.BoxGeometry(10, 1.1, 1.5), counterMat);
    counter1.position.set(0, 0.55, 0);
    counter1.receiveShadow = true;
    group.add(counter1);

    const counter2 = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.1, 6), counterMat);
    counter2.position.set(-4.25, 0.55, 3.75);
    counter2.receiveShadow = true;
    group.add(counter2);

    // Counter top surface (stainless steel look)
    const topMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.6, roughness: 0.3 });
    const counterTop = new THREE.Mesh(new THREE.BoxGeometry(10.2, 0.08, 1.7), topMat);
    counterTop.position.set(0, 1.14, 0);
    group.add(counterTop);

    // Pizza oven
    const ovenBody = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.8, 1.8), ovenMat);
    ovenBody.position.set(2, 0.9, -1.5);
    group.add(ovenBody);

    // Oven door
    const ovenDoor = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.8, 0.1), new THREE.MeshStandardMaterial({ color: 0x111111 }));
    ovenDoor.position.set(2, 0.8, -0.55);
    group.add(ovenDoor);

    // Oven glow
    const ovenGlow = new THREE.PointLight(0xff4400, 0.5, 3);
    ovenGlow.position.set(2, 0.8, -1);
    group.add(ovenGlow);

    // Heat lamp over counter
    const lampGeo = new THREE.ConeGeometry(0.4, 0.3, 8);
    const lampMat = new THREE.MeshStandardMaterial({ color: 0x444444 });
    [-2, 0, 2].forEach(x => {
        const lamp = new THREE.Mesh(lampGeo, lampMat);
        lamp.position.set(x, 2.5, 0.3);
        lamp.rotation.x = Math.PI;
        group.add(lamp);

        const heatLight = new THREE.PointLight(0xff6600, 0.3, 2);
        heatLight.position.set(x, 2.2, 0.3);
        group.add(heatLight);
    });

    // Soda fountain
    const sodaMachine = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.5, 0.6), new THREE.MeshStandardMaterial({ color: 0x222288 }));
    sodaMachine.position.set(-3, 1.85, 0);
    group.add(sodaMachine);

    group.position.set(14, 0, 18);
    group.rotation.y = Math.PI;

    group.userData.collision = {
        minX: 8, maxX: 20,
        minZ: 14, maxZ: 22,
        maxY: 2.6 // Kitchen counter with soda machine - not jumpable
    };
    collisionObjects.push(group);
    scene.add(group);
}

// Party rooms (enclosed areas)
function createPartyRooms() {
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x4a3a4a, roughness: 0.85 });

    // Party Room 1
    const room1 = new THREE.Group();

    // Back wall
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(6, 3.5, 0.3), wallMat);
    backWall.position.set(0, 1.75, -3);
    room1.add(backWall);

    // Side wall with doorway
    const sideWall1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.5, 2), wallMat);
    sideWall1.position.set(-3, 1.75, -2);
    room1.add(sideWall1);

    const sideWall2 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.5, 2), wallMat);
    sideWall2.position.set(3, 1.75, -2);
    room1.add(sideWall2);

    // Door frame above
    const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.2, 2.2), wallMat);
    doorFrame.position.set(-3, 2.9, 0);
    room1.add(doorFrame);

    // Party table
    const partyTable = new THREE.Mesh(new THREE.BoxGeometry(4, 0.1, 2), new THREE.MeshStandardMaterial({ color: 0x8b4513 }));
    partyTable.position.set(0, 0.75, -1.5);
    room1.add(partyTable);

    // Table legs
    [[-1.8, -0.8], [1.8, -0.8], [-1.8, -2.2], [1.8, -2.2]].forEach(([x, z]) => {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.75, 8), new THREE.MeshStandardMaterial({ color: 0x2a1a0a }));
        leg.position.set(x, 0.375, z);
        room1.add(leg);
    });

    // Balloons decoration (creepy deflated look)
    [-1.5, 0, 1.5].forEach((x, i) => {
        const balloonGeo = new THREE.SphereGeometry(0.25, 8, 8);
        const balloonMat = new THREE.MeshStandardMaterial({
            color: [0x880000, 0x008800, 0x000088][i],
            transparent: true,
            opacity: 0.7
        });
        const balloon = new THREE.Mesh(balloonGeo, balloonMat);
        balloon.position.set(x, 2.5 - Math.random() * 0.5, -1.5);
        balloon.scale.y = 0.7 + Math.random() * 0.2; // Deflated look
        room1.add(balloon);

        // String
        const stringGeo = new THREE.CylinderGeometry(0.005, 0.005, 1.5, 4);
        const stringMat = new THREE.MeshBasicMaterial({ color: 0x444444 });
        const string = new THREE.Mesh(stringGeo, stringMat);
        string.position.set(x, 1.5, -1.5);
        room1.add(string);
    });

    room1.position.set(24, 0, -4);
    room1.userData.collision = { minX: 20.5, maxX: 27.5, minZ: -7.5, maxZ: -0.5, maxY: 3.5 };
    collisionObjects.push(room1);
    scene.add(room1);
}

// Restroom area
function createRestrooms() {
    const group = new THREE.Group();
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x3a3a4a, roughness: 0.9 });
    const tileMat = new THREE.MeshStandardMaterial({ color: 0x6a6a7a, roughness: 0.6 });

    // Restroom enclosure
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(8, 3.5, 0.3), wallMat);
    backWall.position.set(0, 1.75, 0);
    group.add(backWall);

    // Dividing wall between M/F
    const divider = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.5, 4), wallMat);
    divider.position.set(0, 1.75, 2);
    group.add(divider);

    // Side walls
    const sideWall1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.5, 4), wallMat);
    sideWall1.position.set(-4, 1.75, 2);
    group.add(sideWall1);

    const sideWall2 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.5, 4), wallMat);
    sideWall2.position.set(4, 1.75, 2);
    group.add(sideWall2);

    // Door frames (no actual doors, just openings marked)
    const doorFrame1 = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.3, 0.15), wallMat);
    doorFrame1.position.set(-2, 2.5, 4);
    group.add(doorFrame1);

    const doorFrame2 = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.3, 0.15), wallMat);
    doorFrame2.position.set(2, 2.5, 4);
    group.add(doorFrame2);

    // Restroom signs
    const signMat1 = new THREE.MeshBasicMaterial({ color: 0x0066ff });
    const signMat2 = new THREE.MeshBasicMaterial({ color: 0xff0066 });
    const sign1 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.05), signMat1);
    sign1.position.set(-2, 2.8, 4.1);
    group.add(sign1);
    const sign2 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.05), signMat2);
    sign2.position.set(2, 2.8, 4.1);
    group.add(sign2);

    // Flickering restroom light
    const restroomLight = new THREE.PointLight(0xffffcc, 0.4, 8);
    restroomLight.position.set(0, 3, 2);
    restroomLight.userData.flickerOffset = Math.random() * Math.PI * 2;
    restroomLight.userData.baseIntensity = 0.4;
    restroomLight.userData.isBroken = true;
    restroomLight.userData.flickerSpeed = 20;
    group.add(restroomLight);

    group.position.set(-24, 0, -8);

    group.userData.collision = { minX: -28.5, maxX: -19.5, minZ: -8.5, maxZ: -3.5, maxY: 3.5 };
    collisionObjects.push(group);
    scene.add(group);
}

// Skeeball lanes
function createSkeeballLanes() {
    const laneMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.7 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a });

    for (let i = 0; i < 4; i++) {
        const group = new THREE.Group();

        // Lane base
        const laneBase = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 5), laneMat);
        laneBase.position.set(0, 0.15, 0);
        group.add(laneBase);

        // Lane surface (angled)
        const laneSurface = new THREE.Mesh(new THREE.BoxGeometry(1, 0.08, 4), new THREE.MeshStandardMaterial({ color: 0x8b7355, roughness: 0.4 }));
        laneSurface.position.set(0, 0.4, -0.3);
        laneSurface.rotation.x = -0.15;
        group.add(laneSurface);

        // Target rings at the end (elevated)
        const ringBackboard = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.5, 0.3), new THREE.MeshStandardMaterial({ color: 0x2a4a2a }));
        ringBackboard.position.set(0, 1.1, -2.3);
        group.add(ringBackboard);

        // Score holes
        [{ y: 0.6, r: 0.2, pts: 10 }, { y: 1.0, r: 0.15, pts: 20 }, { y: 1.4, r: 0.1, pts: 50 }].forEach(hole => {
            const holeGeo = new THREE.CircleGeometry(hole.r, 16);
            const holeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
            const holeMesh = new THREE.Mesh(holeGeo, holeMat);
            holeMesh.position.set(0, hole.y, -2.14);
            group.add(holeMesh);

            // Ring around hole
            const ringGeo = new THREE.TorusGeometry(hole.r + 0.02, 0.02, 8, 16);
            const ringMesh = new THREE.Mesh(ringGeo, new THREE.MeshStandardMaterial({ color: 0xffcc00, emissive: 0x332200 }));
            ringMesh.position.set(0, hole.y, -2.13);
            group.add(ringMesh);
        });

        // Side rails
        const railGeo = new THREE.BoxGeometry(0.1, 0.3, 5);
        const leftRail = new THREE.Mesh(railGeo, rimMat);
        leftRail.position.set(-0.6, 0.45, 0);
        group.add(leftRail);
        const rightRail = new THREE.Mesh(railGeo, rimMat);
        rightRail.position.set(0.6, 0.45, 0);
        group.add(rightRail);

        group.position.set(-10 + i * 2, 0, -18);
        group.rotation.y = Math.PI;

        group.userData.collision = {
            minX: -10.8 + i * 2, maxX: -9.2 + i * 2,
            minZ: -20.5, maxZ: -15.5,
            maxY: 2.0 // Skeeball lane with target area - not jumpable
        };
        collisionObjects.push(group);
        scene.add(group);
    }
}

// Token/ticket machines
function createTokenMachines() {
    const positions = [
        { x: -22, z: 5, rot: Math.PI / 2 },
        { x: -22, z: -2, rot: Math.PI / 2 },
        { x: 10, z: -18, rot: 0 },
        { x: 14, z: -18, rot: 0 }
    ];

    positions.forEach(pos => {
        const group = new THREE.Group();

        // Machine body
        const bodyGeo = new THREE.BoxGeometry(1.2, 1.8, 0.8);
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2a4a2a, roughness: 0.7 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 0.9;
        group.add(body);

        // Display screen
        const screenGeo = new THREE.PlaneGeometry(0.8, 0.5);
        const screenMat = new THREE.MeshBasicMaterial({ color: 0x003300 });
        const screen = new THREE.Mesh(screenGeo, screenMat);
        screen.position.set(0, 1.3, 0.41);
        group.add(screen);

        // Coin slot
        const slotGeo = new THREE.BoxGeometry(0.3, 0.05, 0.05);
        const slotMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.5 });
        const slot = new THREE.Mesh(slotGeo, slotMat);
        slot.position.set(0, 0.9, 0.41);
        group.add(slot);

        // Token dispenser
        const dispenserGeo = new THREE.BoxGeometry(0.4, 0.15, 0.1);
        const dispenser = new THREE.Mesh(dispenserGeo, slotMat);
        dispenser.position.set(0, 0.4, 0.41);
        group.add(dispenser);

        // "TOKENS" sign
        const signGeo = new THREE.BoxGeometry(0.9, 0.25, 0.05);
        const signMat = new THREE.MeshStandardMaterial({ color: 0xffcc00, emissive: 0x332200, emissiveIntensity: 0.5 });
        const sign = new THREE.Mesh(signGeo, signMat);
        sign.position.set(0, 1.7, 0.41);
        group.add(sign);

        group.position.set(pos.x, 0, pos.z);
        group.rotation.y = pos.rot;

        const cos = Math.cos(pos.rot);
        const sin = Math.sin(pos.rot);
        group.userData.collision = {
            minX: pos.x - Math.abs(cos * 0.7) - Math.abs(sin * 0.5) - 0.2,
            maxX: pos.x + Math.abs(cos * 0.7) + Math.abs(sin * 0.5) + 0.2,
            minZ: pos.z - Math.abs(sin * 0.7) - Math.abs(cos * 0.5) - 0.2,
            maxZ: pos.z + Math.abs(sin * 0.7) + Math.abs(cos * 0.5) + 0.2,
            maxY: 1.9 // Token machine height - not jumpable
        };
        collisionObjects.push(group);
        scene.add(group);
    });
}

// Waiting area with benches
function createWaitingArea() {
    const group = new THREE.Group();
    const benchMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.8 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.5 });

    // Create benches
    for (let i = 0; i < 3; i++) {
        const benchGroup = new THREE.Group();

        // Seat
        const seat = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.12, 0.5), benchMat);
        seat.position.y = 0.5;
        benchGroup.add(seat);

        // Backrest
        const back = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.5, 0.1), benchMat);
        back.position.set(0, 0.8, -0.22);
        benchGroup.add(back);

        // Metal legs
        [[-1, 0.1], [1, 0.1]].forEach(([x, z]) => {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.35), metalMat);
            leg.position.set(x, 0.25, z);
            benchGroup.add(leg);
        });

        benchGroup.position.set(i * 3, 0, 0);
        group.add(benchGroup);
    }

    // Trash can
    const trashGeo = new THREE.CylinderGeometry(0.35, 0.3, 1, 12);
    const trashMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a });
    const trash = new THREE.Mesh(trashGeo, trashMat);
    trash.position.set(-2, 0.5, 0.5);
    group.add(trash);

    // Planter with dead plant
    const planterGeo = new THREE.CylinderGeometry(0.5, 0.4, 0.8, 8);
    const planterMat = new THREE.MeshStandardMaterial({ color: 0x5a4a3a });
    const planter = new THREE.Mesh(planterGeo, planterMat);
    planter.position.set(10, 0.4, 0.5);
    group.add(planter);

    // Dead plant
    const plantGeo = new THREE.ConeGeometry(0.3, 0.8, 6);
    const plantMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a });
    const plant = new THREE.Mesh(plantGeo, plantMat);
    plant.position.set(10, 1.2, 0.5);
    plant.rotation.z = 0.3; // Wilted
    group.add(plant);

    group.position.set(-5, 0, 25);

    // Benches are ~1.0m tall - jumpable
    group.userData.collision = { minX: -8, maxX: 6, minZ: 24, maxZ: 26, maxY: 1.0 };
    collisionObjects.push(group);
    scene.add(group);
}

// ==================== PLAYER ====================
// Player flashlight
let playerFlashlight = null;

function createPlayer() {
    DebugLog.log('Initializing player...', 'info');

    player = new THREE.Object3D();
    player.position.set(0, CONFIG.player.height, 10);
    player.add(camera);
    // Reset camera local position since player is already at eye height
    camera.position.set(0, 0, 0);
    scene.add(player);

    playerState.position.copy(player.position);
    createWeaponModel();
    createPlayerFlashlight();

    DebugLog.log('Player initialized', 'success');
}

function createPlayerFlashlight() {
    // Create a spotlight attached to the camera
    playerFlashlight = new THREE.SpotLight(0xffffee, 1.5, 40, Math.PI / 6, 0.3, 1);
    playerFlashlight.position.set(0, 0, 0);
    playerFlashlight.castShadow = false; // Performance optimization

    // Create a target that the light points at (forward from camera)
    const flashlightTarget = new THREE.Object3D();
    flashlightTarget.position.set(0, 0, -10);
    camera.add(flashlightTarget);
    playerFlashlight.target = flashlightTarget;

    camera.add(playerFlashlight);
    DebugLog.log('Player flashlight created', 'success');
}

// Weapon model storage
const weaponModels = {};

function createWeaponModel() {
    // Create all weapon models upfront
    createPistolModel();
    createSMGModel();
    createShotgunModel();
    createRocketLauncherModel();
    createLaserGunModel();

    // Start with pistol visible
    updateWeaponModel();
}

function createPistolModel() {
    const gunGroup = new THREE.Group();
    gunGroup.name = 'pistol';

    // Add slight emissive so weapon is always visible (1% self-lit)
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.4, roughness: 0.6, emissive: 0x333333, emissiveIntensity: 0.08 });
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, emissive: 0x4a3a2a, emissiveIntensity: 0.08 });
    const magMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.4, roughness: 0.6, emissive: 0x1a1a1a, emissiveIntensity: 0.08 });

    // Compact slide
    const slideGeo = new THREE.BoxGeometry(0.04, 0.06, 0.18);
    const slide = new THREE.Mesh(slideGeo, bodyMat);
    slide.position.z = -0.02;
    gunGroup.add(slide);

    // Short barrel
    const barrelGeo = new THREE.CylinderGeometry(0.012, 0.014, 0.08, 8);
    const barrel = new THREE.Mesh(barrelGeo, bodyMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = -0.14;
    gunGroup.add(barrel);

    // Handle / grip
    const handleGeo = new THREE.BoxGeometry(0.035, 0.1, 0.06);
    const handle = new THREE.Mesh(handleGeo, handleMat);
    handle.position.y = -0.07;
    handle.position.z = 0.03;
    handle.rotation.x = -0.25;
    gunGroup.add(handle);

    // Magazine
    const magGroup = new THREE.Group();
    magGroup.userData.isMagazine = true;
    const magBodyGeo = new THREE.BoxGeometry(0.028, 0.08, 0.045);
    const magBody = new THREE.Mesh(magBodyGeo, magMat);
    magGroup.add(magBody);
    magGroup.position.set(0, -0.08, 0.03);
    gunGroup.add(magGroup);

    // Trigger guard
    const triggerGuardGeo = new THREE.TorusGeometry(0.02, 0.004, 6, 8, Math.PI);
    const triggerGuard = new THREE.Mesh(triggerGuardGeo, bodyMat);
    triggerGuard.rotation.x = Math.PI / 2;
    triggerGuard.position.set(0, -0.04, 0.01);
    gunGroup.add(triggerGuard);

    gunGroup.position.set(0.22, -0.18, -0.35);
    gunGroup.rotation.y = 0.05;
    gunGroup.visible = false;
    camera.add(gunGroup);

    // Add barrel tip marker for muzzle flash
    const barrelTip = new THREE.Object3D();
    barrelTip.position.set(0, 0, -0.18); // End of pistol barrel
    gunGroup.add(barrelTip);

    weaponModels.pistol = {
        group: gunGroup,
        magazine: magGroup,
        magazineOriginalPos: magGroup.position.clone(),
        originalPos: gunGroup.position.clone(),
        originalRot: gunGroup.rotation.clone(),
        barrelTip: barrelTip
    };
}

function createSMGModel() {
    const gunGroup = new THREE.Group();
    gunGroup.name = 'smg';

    // Add slight emissive so weapon is always visible (1% self-lit)
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.3, roughness: 0.7, emissive: 0x222222, emissiveIntensity: 0.08 });
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, emissive: 0x4a3a2a, emissiveIntensity: 0.08 });
    const magMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.4, roughness: 0.6, emissive: 0x1a1a1a, emissiveIntensity: 0.08 });

    // Main receiver
    const bodyGeo = new THREE.BoxGeometry(0.06, 0.08, 0.32);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    gunGroup.add(body);

    // Barrel with suppressor look
    const barrelGeo = new THREE.CylinderGeometry(0.018, 0.02, 0.2, 8);
    const barrel = new THREE.Mesh(barrelGeo, bodyMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = -0.25;
    gunGroup.add(barrel);

    // Handle / grip
    const handleGeo = new THREE.BoxGeometry(0.045, 0.12, 0.06);
    const handle = new THREE.Mesh(handleGeo, handleMat);
    handle.position.y = -0.1;
    handle.position.z = 0.08;
    handle.rotation.x = -0.3;
    gunGroup.add(handle);

    // Forward grip
    const fwdGripGeo = new THREE.BoxGeometry(0.03, 0.06, 0.03);
    const fwdGrip = new THREE.Mesh(fwdGripGeo, handleMat);
    fwdGrip.position.set(0, -0.06, -0.1);
    gunGroup.add(fwdGrip);

    // Extended magazine
    const magGroup = new THREE.Group();
    magGroup.userData.isMagazine = true;
    const magBodyGeo = new THREE.BoxGeometry(0.04, 0.16, 0.06);
    const magBody = new THREE.Mesh(magBodyGeo, magMat);
    magGroup.add(magBody);
    for (let i = 0; i < 4; i++) {
        const ridgeGeo = new THREE.BoxGeometry(0.042, 0.008, 0.062);
        const ridge = new THREE.Mesh(ridgeGeo, bodyMat);
        ridge.position.y = -0.06 + i * 0.04;
        magGroup.add(ridge);
    }
    magGroup.position.set(0, -0.12, 0);
    gunGroup.add(magGroup);

    // Stock (folded)
    const stockGeo = new THREE.BoxGeometry(0.04, 0.05, 0.08);
    const stock = new THREE.Mesh(stockGeo, bodyMat);
    stock.position.set(0, 0.02, 0.18);
    gunGroup.add(stock);

    // Top rail
    const railGeo = new THREE.BoxGeometry(0.05, 0.015, 0.2);
    const rail = new THREE.Mesh(railGeo, bodyMat);
    rail.position.set(0, 0.05, -0.05);
    gunGroup.add(rail);

    gunGroup.position.set(0.25, -0.2, -0.4);
    gunGroup.rotation.y = 0.05;
    gunGroup.visible = false;
    camera.add(gunGroup);

    // Add barrel tip marker for muzzle flash
    const barrelTip = new THREE.Object3D();
    barrelTip.position.set(0, 0, -0.35); // End of SMG barrel
    gunGroup.add(barrelTip);

    weaponModels.smg = {
        group: gunGroup,
        magazine: magGroup,
        magazineOriginalPos: magGroup.position.clone(),
        originalPos: gunGroup.position.clone(),
        originalRot: gunGroup.rotation.clone(),
        barrelTip: barrelTip
    };
}

function createShotgunModel() {
    const gunGroup = new THREE.Group();
    gunGroup.name = 'shotgun';

    // Add slight emissive so weapon is always visible (1% self-lit)
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.5, roughness: 0.5, emissive: 0x2a2a2a, emissiveIntensity: 0.08 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x5c3a21, emissive: 0x5c3a21, emissiveIntensity: 0.08 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.6, roughness: 0.4, emissive: 0x1a1a1a, emissiveIntensity: 0.08 });

    // Receiver
    const receiverGeo = new THREE.BoxGeometry(0.06, 0.08, 0.25);
    const receiver = new THREE.Mesh(receiverGeo, bodyMat);
    gunGroup.add(receiver);

    // Long barrel
    const barrelGeo = new THREE.CylinderGeometry(0.025, 0.028, 0.45, 8);
    const barrel = new THREE.Mesh(barrelGeo, bodyMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = -0.32;
    gunGroup.add(barrel);

    // Pump slide (tube magazine)
    const pumpGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.35, 8);
    const pump = new THREE.Mesh(pumpGeo, metalMat);
    pump.rotation.x = Math.PI / 2;
    pump.position.set(0, -0.04, -0.25);
    gunGroup.add(pump);

    // Pump grip
    const pumpGripGeo = new THREE.BoxGeometry(0.05, 0.04, 0.1);
    const pumpGrip = new THREE.Mesh(pumpGripGeo, woodMat);
    pumpGrip.position.set(0, -0.04, -0.12);
    gunGroup.add(pumpGrip);

    // Wooden stock
    const stockGeo = new THREE.BoxGeometry(0.05, 0.12, 0.25);
    const stock = new THREE.Mesh(stockGeo, woodMat);
    stock.position.set(0, -0.02, 0.2);
    stock.rotation.x = -0.1;
    gunGroup.add(stock);

    // Pistol grip
    const handleGeo = new THREE.BoxGeometry(0.04, 0.1, 0.05);
    const handle = new THREE.Mesh(handleGeo, woodMat);
    handle.position.y = -0.08;
    handle.position.z = 0.08;
    handle.rotation.x = -0.4;
    gunGroup.add(handle);

    // Shell tube (acts as magazine for animation)
    const magGroup = new THREE.Group();
    magGroup.userData.isMagazine = true;
    const shellTubeGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.2, 8);
    const shellTube = new THREE.Mesh(shellTubeGeo, metalMat);
    shellTube.rotation.x = Math.PI / 2;
    magGroup.add(shellTube);
    magGroup.position.set(0, -0.04, -0.15);
    magGroup.visible = false; // Hidden but used for reload animation
    gunGroup.add(magGroup);

    // Front sight
    const sightGeo = new THREE.BoxGeometry(0.01, 0.02, 0.01);
    const sight = new THREE.Mesh(sightGeo, metalMat);
    sight.position.set(0, 0.05, -0.5);
    gunGroup.add(sight);

    gunGroup.position.set(0.28, -0.22, -0.42);
    gunGroup.rotation.y = 0.05;
    gunGroup.visible = false;
    camera.add(gunGroup);

    // Add barrel tip marker for muzzle flash
    const barrelTip = new THREE.Object3D();
    barrelTip.position.set(0, 0, -0.55); // End of shotgun barrel
    gunGroup.add(barrelTip);

    weaponModels.shotgun = {
        group: gunGroup,
        magazine: magGroup,
        magazineOriginalPos: magGroup.position.clone(),
        originalPos: gunGroup.position.clone(),
        originalRot: gunGroup.rotation.clone(),
        barrelTip: barrelTip
    };
}

function createRocketLauncherModel() {
    const gunGroup = new THREE.Group();
    gunGroup.name = 'rocketLauncher';

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2d4a2d, metalness: 0.4, roughness: 0.6, emissive: 0x2d4a2d, emissiveIntensity: 0.08 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.7, roughness: 0.3, emissive: 0x1a1a1a, emissiveIntensity: 0.08 });
    const detailMat = new THREE.MeshStandardMaterial({ color: 0x8b0000, metalness: 0.3, roughness: 0.5, emissive: 0x8b0000, emissiveIntensity: 0.1 });

    // Main tube (launch tube)
    const tubeGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.7, 12);
    const tube = new THREE.Mesh(tubeGeo, bodyMat);
    tube.rotation.x = Math.PI / 2;
    gunGroup.add(tube);

    // Front cone/muzzle
    const muzzleGeo = new THREE.CylinderGeometry(0.065, 0.055, 0.08, 12);
    const muzzle = new THREE.Mesh(muzzleGeo, metalMat);
    muzzle.rotation.x = Math.PI / 2;
    muzzle.position.z = -0.39;
    gunGroup.add(muzzle);

    // Rear flare (backblast vent)
    const rearGeo = new THREE.CylinderGeometry(0.055, 0.07, 0.1, 12);
    const rear = new THREE.Mesh(rearGeo, metalMat);
    rear.rotation.x = Math.PI / 2;
    rear.position.z = 0.4;
    gunGroup.add(rear);

    // Sight rail on top
    const railGeo = new THREE.BoxGeometry(0.02, 0.025, 0.25);
    const rail = new THREE.Mesh(railGeo, metalMat);
    rail.position.set(0, 0.075, -0.1);
    gunGroup.add(rail);

    // Front sight
    const frontSightGeo = new THREE.BoxGeometry(0.015, 0.04, 0.015);
    const frontSight = new THREE.Mesh(frontSightGeo, detailMat);
    frontSight.position.set(0, 0.1, -0.2);
    gunGroup.add(frontSight);

    // Rear sight
    const rearSightGeo = new THREE.BoxGeometry(0.03, 0.03, 0.02);
    const rearSight = new THREE.Mesh(rearSightGeo, detailMat);
    rearSight.position.set(0, 0.1, 0.02);
    gunGroup.add(rearSight);

    // Pistol grip
    const gripGeo = new THREE.BoxGeometry(0.04, 0.12, 0.05);
    const grip = new THREE.Mesh(gripGeo, metalMat);
    grip.position.set(0, -0.1, 0.15);
    grip.rotation.x = -0.3;
    gunGroup.add(grip);

    // Forward grip
    const fwdGripGeo = new THREE.BoxGeometry(0.035, 0.08, 0.04);
    const fwdGrip = new THREE.Mesh(fwdGripGeo, metalMat);
    fwdGrip.position.set(0, -0.08, -0.15);
    gunGroup.add(fwdGrip);

    // Shoulder rest
    const shoulderGeo = new THREE.BoxGeometry(0.08, 0.06, 0.12);
    const shoulder = new THREE.Mesh(shoulderGeo, bodyMat);
    shoulder.position.set(0, -0.03, 0.35);
    gunGroup.add(shoulder);

    // Rocket visible in tube (magazine stand-in)
    const magGroup = new THREE.Group();
    magGroup.userData.isMagazine = true;
    const rocketGeo = new THREE.CylinderGeometry(0.03, 0.035, 0.25, 8);
    const rocketMat = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, metalness: 0.6, roughness: 0.4 });
    const rocket = new THREE.Mesh(rocketGeo, rocketMat);
    rocket.rotation.x = Math.PI / 2;
    magGroup.add(rocket);
    // Rocket warhead
    const warheadGeo = new THREE.ConeGeometry(0.035, 0.08, 8);
    const warheadMat = new THREE.MeshStandardMaterial({ color: 0x8b0000, metalness: 0.5, roughness: 0.5, emissive: 0x8b0000, emissiveIntensity: 0.2 });
    const warhead = new THREE.Mesh(warheadGeo, warheadMat);
    warhead.rotation.x = -Math.PI / 2;
    warhead.position.z = -0.16;
    magGroup.add(warhead);
    magGroup.position.set(0, 0, -0.05);
    gunGroup.add(magGroup);

    gunGroup.position.set(0.32, -0.25, -0.5);
    gunGroup.rotation.y = 0.05;
    gunGroup.visible = false;
    camera.add(gunGroup);

    const barrelTip = new THREE.Object3D();
    barrelTip.position.set(0, 0, -0.45);
    gunGroup.add(barrelTip);

    weaponModels.rocketLauncher = {
        group: gunGroup,
        magazine: magGroup,
        magazineOriginalPos: magGroup.position.clone(),
        originalPos: gunGroup.position.clone(),
        originalRot: gunGroup.rotation.clone(),
        barrelTip: barrelTip
    };
}

function createLaserGunModel() {
    const gunGroup = new THREE.Group();
    gunGroup.name = 'laserGun';

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, metalness: 0.6, roughness: 0.3, emissive: 0x1a1a2e, emissiveIntensity: 0.1 });
    const glowMat = new THREE.MeshStandardMaterial({ color: 0x00ffff, metalness: 0.2, roughness: 0.3, emissive: 0x00ffff, emissiveIntensity: 0.8 });
    const accentMat = new THREE.MeshStandardMaterial({ color: 0x4a00ff, metalness: 0.5, roughness: 0.4, emissive: 0x4a00ff, emissiveIntensity: 0.5 });

    // Main body (futuristic angular shape)
    const bodyGeo = new THREE.BoxGeometry(0.06, 0.1, 0.35);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    gunGroup.add(body);

    // Barrel housing
    const barrelHousingGeo = new THREE.BoxGeometry(0.05, 0.06, 0.2);
    const barrelHousing = new THREE.Mesh(barrelHousingGeo, bodyMat);
    barrelHousing.position.set(0, 0.02, -0.27);
    gunGroup.add(barrelHousing);

    // Energy barrel (glowing core)
    const barrelGeo = new THREE.CylinderGeometry(0.015, 0.02, 0.3, 8);
    const barrel = new THREE.Mesh(barrelGeo, glowMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, -0.32);
    gunGroup.add(barrel);

    // Focusing lens
    const lensGeo = new THREE.RingGeometry(0.01, 0.025, 16);
    const lensMat = new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x00ffff, emissiveIntensity: 1, side: THREE.DoubleSide });
    const lens = new THREE.Mesh(lensGeo, lensMat);
    lens.position.set(0, 0.02, -0.47);
    gunGroup.add(lens);

    // Energy coils (decorative)
    for (let i = 0; i < 3; i++) {
        const coilGeo = new THREE.TorusGeometry(0.035, 0.005, 8, 16);
        const coil = new THREE.Mesh(coilGeo, accentMat);
        coil.position.set(0, 0.02, -0.2 - i * 0.08);
        coil.rotation.y = Math.PI / 2;
        gunGroup.add(coil);
    }

    // Power cell (acts as magazine)
    const magGroup = new THREE.Group();
    magGroup.userData.isMagazine = true;
    const cellGeo = new THREE.BoxGeometry(0.04, 0.08, 0.06);
    const cell = new THREE.Mesh(cellGeo, accentMat);
    magGroup.add(cell);
    // Energy glow in cell
    const cellGlowGeo = new THREE.BoxGeometry(0.02, 0.06, 0.03);
    const cellGlow = new THREE.Mesh(cellGlowGeo, glowMat);
    magGroup.add(cellGlow);
    magGroup.position.set(0, -0.08, 0.05);
    gunGroup.add(magGroup);

    // Pistol grip
    const gripGeo = new THREE.BoxGeometry(0.04, 0.1, 0.06);
    const grip = new THREE.Mesh(gripGeo, bodyMat);
    grip.position.set(0, -0.08, 0.1);
    grip.rotation.x = -0.25;
    gunGroup.add(grip);

    // Top rail with holographic sight
    const railGeo = new THREE.BoxGeometry(0.025, 0.015, 0.12);
    const rail = new THREE.Mesh(railGeo, bodyMat);
    rail.position.set(0, 0.065, -0.05);
    gunGroup.add(rail);

    // Holographic sight frame
    const sightFrameGeo = new THREE.BoxGeometry(0.03, 0.04, 0.04);
    const sightFrame = new THREE.Mesh(sightFrameGeo, bodyMat);
    sightFrame.position.set(0, 0.09, -0.05);
    gunGroup.add(sightFrame);

    // Holographic reticle
    const reticleGeo = new THREE.RingGeometry(0.008, 0.01, 16);
    const reticleMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
    const reticle = new THREE.Mesh(reticleGeo, reticleMat);
    reticle.position.set(0, 0.09, -0.07);
    gunGroup.add(reticle);

    gunGroup.position.set(0.25, -0.2, -0.4);
    gunGroup.rotation.y = 0.05;
    gunGroup.visible = false;
    camera.add(gunGroup);

    const barrelTip = new THREE.Object3D();
    barrelTip.position.set(0, 0.02, -0.48);
    gunGroup.add(barrelTip);

    weaponModels.laserGun = {
        group: gunGroup,
        magazine: magGroup,
        magazineOriginalPos: magGroup.position.clone(),
        originalPos: gunGroup.position.clone(),
        originalRot: gunGroup.rotation.clone(),
        barrelTip: barrelTip
    };
}

function updateWeaponModel() {
    // Hide all weapon models
    Object.keys(weaponModels).forEach(key => {
        weaponModels[key].group.visible = false;
    });

    // Show current weapon
    const currentModel = weaponModels[weapon.current];
    if (currentModel) {
        currentModel.group.visible = true;
        weapon.model = currentModel.group;
        weapon.magazine = currentModel.magazine;
        weapon.magazineOriginalPos = currentModel.magazineOriginalPos;
        weapon.modelOriginalPos = currentModel.originalPos;
        weapon.modelOriginalRot = currentModel.originalRot;

        // Reset position/rotation
        currentModel.group.position.copy(currentModel.originalPos);
        currentModel.group.rotation.copy(currentModel.originalRot);
    }
}

// ==================== MOBILE DETECTION ====================
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints && navigator.maxTouchPoints > 2);

// Mobile joystick state
const mobileInput = {
    moveX: 0,
    moveZ: 0,
    lookX: 0,
    lookY: 0,
    shooting: false,
    lastLookTouch: null,
    joystickTouch: null
};

// ==================== CONTROLS ====================
let controlsInitialized = false;
let mobileAbortController = null;

// Named wheel handler for proper cleanup
function onWheel(e) {
    if (!pointerLocked || !GameState.isRunning || weapon.isReloading) return;
    e.preventDefault();
    cycleWeapon(e.deltaY > 0 ? 1 : -1);
}

function initControls() {
    // Prevent double-initialization
    if (controlsInitialized) return;
    controlsInitialized = true;

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    document.addEventListener('wheel', onWheel, { passive: false });

    // Initialize mobile controls if on mobile device
    if (isMobile) {
        initMobileControls();
    }
}

function cleanupControls() {
    if (!controlsInitialized) return;
    controlsInitialized = false;

    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mousedown', onMouseDown);
    document.removeEventListener('mouseup', onMouseUp);
    document.removeEventListener('pointerlockchange', onPointerLockChange);
    document.removeEventListener('wheel', onWheel);

    // Clean up mobile controls
    if (mobileAbortController) {
        mobileAbortController.abort();
        mobileAbortController = null;
    }

    // Reset control states
    keys.forward = false;
    keys.backward = false;
    keys.left = false;
    keys.right = false;
    keys.sprint = false;
}

function initMobileControls() {
    DebugLog.log('Initializing mobile controls...', 'info');

    // Clean up any existing listeners first, then create new controller
    if (mobileAbortController) {
        mobileAbortController.abort();
    }
    mobileAbortController = new AbortController();
    const signal = mobileAbortController.signal;

    const mobileControls = document.getElementById('mobile-controls');
    const joystickBase = document.getElementById('joystick-base');
    const joystickStick = document.getElementById('joystick-stick');
    const lookArea = document.getElementById('mobile-look-area');
    const shootBtn = document.getElementById('mobile-shoot');
    const reloadBtn = document.getElementById('mobile-reload');
    const jumpBtn = document.getElementById('mobile-jump');
    const interactBtn = document.getElementById('mobile-interact');
    const sprintBtn = document.getElementById('mobile-sprint');
    const weaponBtns = document.querySelectorAll('.mobile-weapon-btn');

    // Joystick handling - larger radius for better control
    const joystickRadius = 45;

    function updateJoystick(touch) {
        const rect = joystickBase.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        let dx = touch.clientX - centerX;
        let dy = touch.clientY - centerY;

        // Clamp to radius (with divide-by-zero protection)
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > 0 && distance > joystickRadius) {
            dx = (dx / distance) * joystickRadius;
            dy = (dy / distance) * joystickRadius;
        }

        // Update stick position
        joystickStick.style.transform = `translate(${dx}px, ${dy}px)`;

        // Update movement input (-1 to 1)
        mobileInput.moveX = dx / joystickRadius;
        mobileInput.moveZ = dy / joystickRadius;
    }

    function resetJoystick() {
        joystickStick.style.transform = 'translate(0, 0)';
        mobileInput.moveX = 0;
        mobileInput.moveZ = 0;
        mobileInput.joystickTouch = null;
    }

    joystickBase.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.changedTouches[0];
        mobileInput.joystickTouch = touch.identifier;
        updateJoystick(touch);
    }, { passive: false, signal });

    joystickBase.addEventListener('touchmove', (e) => {
        e.preventDefault();
        for (let touch of e.changedTouches) {
            if (touch.identifier === mobileInput.joystickTouch) {
                updateJoystick(touch);
                break;
            }
        }
    }, { passive: false, signal });

    joystickBase.addEventListener('touchend', (e) => {
        for (let touch of e.changedTouches) {
            if (touch.identifier === mobileInput.joystickTouch) {
                resetJoystick();
                break;
            }
        }
    }, { passive: true, signal });

    joystickBase.addEventListener('touchcancel', resetJoystick, { passive: true, signal });

    // Sprint button (toggle)
    sprintBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        keys.sprint = !keys.sprint;
        sprintBtn.classList.toggle('active', keys.sprint);
    }, { passive: false, signal });

    // Look area handling - improved sensitivity and smoothing
    lookArea.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.changedTouches[0];
        mobileInput.lastLookTouch = {
            id: touch.identifier,
            x: touch.clientX,
            y: touch.clientY
        };
    }, { passive: false, signal });

    lookArea.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (!mobileInput.lastLookTouch) return;

        for (let touch of e.changedTouches) {
            if (touch.identifier === mobileInput.lastLookTouch.id) {
                const dx = touch.clientX - mobileInput.lastLookTouch.x;
                const dy = touch.clientY - mobileInput.lastLookTouch.y;

                // Apply look rotation (scaled for mobile sensitivity)
                const sensitivity = CONFIG.player.mouseSensitivity * 2.0;
                playerState.rotation.y -= dx * sensitivity;
                playerState.rotation.x -= dy * sensitivity;
                playerState.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, playerState.rotation.x));

                camera.rotation.x = playerState.rotation.x;
                player.rotation.y = playerState.rotation.y;

                mobileInput.lastLookTouch.x = touch.clientX;
                mobileInput.lastLookTouch.y = touch.clientY;
                break;
            }
        }
    }, { passive: false, signal });

    lookArea.addEventListener('touchend', (e) => {
        for (let touch of e.changedTouches) {
            if (mobileInput.lastLookTouch && touch.identifier === mobileInput.lastLookTouch.id) {
                mobileInput.lastLookTouch = null;
                break;
            }
        }
    }, { passive: true, signal });

    // Shoot button - supports automatic weapons and camera panning while firing
    let shootInterval = null;
    let shootTouchData = null;

    shootBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        hapticFeedback(HAPTIC.TAP);

        // Clear any existing interval to prevent orphaned intervals
        if (shootInterval) {
            clearInterval(shootInterval);
            shootInterval = null;
        }

        const touch = e.changedTouches[0];
        mobileInput.shooting = true;
        shootBtn.classList.add('firing');

        // Store initial touch position for camera panning
        shootTouchData = {
            id: touch.identifier,
            startX: touch.clientX,
            startY: touch.clientY,
            lastX: touch.clientX,
            lastY: touch.clientY
        };

        const stats = getWeaponStats();
        shoot();

        if (stats.automatic) {
            shootInterval = setInterval(() => {
                if (mobileInput.shooting) shoot();
            }, stats.fireRate);
        }
    }, { passive: false, signal });

    // Allow camera panning while holding fire button
    shootBtn.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (!shootTouchData) return;

        for (let touch of e.changedTouches) {
            if (touch.identifier === shootTouchData.id) {
                const dx = touch.clientX - shootTouchData.lastX;
                const dy = touch.clientY - shootTouchData.lastY;

                // Apply camera rotation while shooting (slightly lower sensitivity for better control)
                const sensitivity = CONFIG.player.mouseSensitivity * 1.5;
                playerState.rotation.y -= dx * sensitivity;
                playerState.rotation.x -= dy * sensitivity;
                playerState.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, playerState.rotation.x));

                camera.rotation.x = playerState.rotation.x;
                player.rotation.y = playerState.rotation.y;

                shootTouchData.lastX = touch.clientX;
                shootTouchData.lastY = touch.clientY;
                break;
            }
        }
    }, { passive: false, signal });

    shootBtn.addEventListener('touchend', (e) => {
        for (let touch of e.changedTouches) {
            if (shootTouchData && touch.identifier === shootTouchData.id) {
                mobileInput.shooting = false;
                shootBtn.classList.remove('firing');
                shootTouchData = null;
                if (shootInterval) {
                    clearInterval(shootInterval);
                    shootInterval = null;
                }
                break;
            }
        }
    }, { passive: true, signal });

    shootBtn.addEventListener('touchcancel', () => {
        mobileInput.shooting = false;
        shootBtn.classList.remove('firing');
        shootTouchData = null;
        if (shootInterval) {
            clearInterval(shootInterval);
            shootInterval = null;
        }
    }, { passive: true, signal });

    // Reload button
    reloadBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        hapticFeedback(HAPTIC.BUTTON);
        const stats = getWeaponStats();
        if (!weapon.isReloading && weapon.ammo < stats.magSize && weapon.reserveAmmo > 0) {
            hapticFeedback(HAPTIC.RELOAD);
            reload();
        }
    }, { passive: false, signal });

    // Jump button
    jumpBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        hapticFeedback(HAPTIC.TAP);
        if (canJump) {
            playerVelocity.y = CONFIG.player.jumpForce;
            canJump = false;
        }
    }, { passive: false, signal });

    // Interact button
    interactBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        hapticFeedback(HAPTIC.BUTTON);
        if (nearbyPickup) {
            if (GameState.mode === 'singleplayer') {
                collectSinglePlayerPickup(nearbyPickup);
            } else {
                sendToServer({ type: 'collectPickup', pickupId: nearbyPickup });
            }
            nearbyPickup = null;
            updateInteractPrompt();
        }
    }, { passive: false, signal });

    // Weapon switching buttons
    const weaponList = ['pistol', 'smg', 'shotgun', 'rocketLauncher', 'laserGun'];
    weaponBtns.forEach(btn => {
        btn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const weaponIndex = parseInt(btn.dataset.weapon);
            const weaponName = !isNaN(weaponIndex) ? weaponList[weaponIndex] : btn.dataset.weapon;
            if (weaponName && weaponName !== weapon.current) {
                hapticFeedback(HAPTIC.WEAPON_SWITCH);
                switchWeapon(weaponName);
                updateMobileWeaponButtons();
            }
        }, { passive: false, signal });
    });

    // Mobile grenade button
    const grenadeBtn = document.getElementById('mobile-grenade');
    if (grenadeBtn) {
        grenadeBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            hapticFeedback(HAPTIC.BUTTON);
            throwGrenade();
        }, { passive: false, signal });
    }

    // Initialize weapon icons on buttons
    updateMobileWeaponButtons();

    DebugLog.log('Mobile controls initialized', 'success');
}

// Weapon icon SVGs for mobile buttons
const WEAPON_ICONS = {
    pistol: `<svg viewBox="0 0 32 32" fill="currentColor">
        <rect x="8" y="12" width="16" height="8" rx="1"/>
        <rect x="12" y="18" width="6" height="8" rx="1"/>
        <rect x="22" y="14" width="4" height="4"/>
    </svg>`,
    smg: `<svg viewBox="0 0 32 32" fill="currentColor">
        <rect x="4" y="10" width="22" height="7" rx="1"/>
        <rect x="12" y="16" width="6" height="9" rx="1"/>
        <rect x="6" y="8" width="3" height="6"/>
        <rect x="24" y="12" width="4" height="3"/>
    </svg>`,
    shotgun: `<svg viewBox="0 0 32 32" fill="currentColor">
        <rect x="2" y="13" width="26" height="6" rx="1"/>
        <rect x="20" y="17" width="5" height="7" rx="1"/>
        <rect x="26" y="14" width="4" height="4"/>
        <circle cx="6" cy="16" r="2"/>
    </svg>`,
    rocketLauncher: `<svg viewBox="0 0 32 32" fill="currentColor">
        <rect x="4" y="11" width="20" height="10" rx="2"/>
        <polygon points="24,16 30,12 30,20"/>
        <rect x="8" y="8" width="4" height="6"/>
        <rect x="10" y="19" width="6" height="6" rx="1"/>
    </svg>`,
    laserGun: `<svg viewBox="0 0 32 32" fill="currentColor">
        <rect x="6" y="12" width="16" height="8" rx="2"/>
        <rect x="20" y="14" width="8" height="4" rx="1"/>
        <circle cx="10" cy="16" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/>
        <rect x="10" y="18" width="6" height="7" rx="1"/>
    </svg>`,
    grenade: `<svg viewBox="0 0 32 32" fill="currentColor">
        <ellipse cx="16" cy="18" rx="8" ry="9"/>
        <rect x="13" y="6" width="6" height="6" rx="1"/>
        <rect x="15" y="3" width="2" height="4"/>
    </svg>`
};

// Update mobile weapon button states with icons
function updateMobileWeaponButtons() {
    const weaponBtns = document.querySelectorAll('.mobile-weapon-btn');
    const weaponList = ['pistol', 'smg', 'shotgun', 'rocketLauncher', 'laserGun'];
    
    weaponBtns.forEach(btn => {
        const weaponIndex = parseInt(btn.dataset.weapon);
        const weaponName = !isNaN(weaponIndex) ? weaponList[weaponIndex] : btn.dataset.weapon;
        
        // Skip grenade button
        if (btn.id === 'mobile-grenade') return;
        
        btn.classList.toggle('active', weaponName === weapon.current);

        // Add weapon icon if not already present
        if (weaponName && WEAPON_ICONS[weaponName] && !btn.querySelector('svg')) {
            btn.innerHTML = WEAPON_ICONS[weaponName];
        }
    });

    // Update grenade button
    const grenadeBtn = document.getElementById('mobile-grenade');
    if (grenadeBtn && !grenadeBtn.querySelector('svg')) {
        grenadeBtn.innerHTML = WEAPON_ICONS.grenade;
    }
}

// Update mobile interact button visibility
function updateMobileInteractButton() {
    const interactBtn = document.getElementById('mobile-interact');
    if (interactBtn) {
        interactBtn.classList.toggle('visible', nearbyPickup !== null);
    }
}

function showMobileControls() {
    if (isMobile) {
        const mobileControls = document.getElementById('mobile-controls');
        if (mobileControls) mobileControls.classList.add('visible');
    }
}

function hideMobileControls() {
    const mobileControls = document.getElementById('mobile-controls');
    if (mobileControls) mobileControls.classList.remove('visible');
}

function onKeyDown(event) {
    // Spectator controls work even when dead
    if (SpectatorMode.isSpectating) {
        switch (event.code) {
            case 'KeyQ':
                SpectatorMode.cyclePrev();
                return;
            case 'KeyE':
                SpectatorMode.cycleNext();
                return;
            case 'Escape':
                togglePause();
                return;
        }
    }

    if (!GameState.isRunning || GameState.isPaused) return;

    switch (event.code) {
        case 'KeyW': keys.forward = true; break;
        case 'KeyS': keys.backward = true; break;
        case 'KeyA': keys.left = true; break;
        case 'KeyD': keys.right = true; break;
        case 'ArrowUp': keys.lookUp = true; break;
        case 'ArrowDown': keys.lookDown = true; break;
        case 'ArrowLeft': keys.lookLeft = true; break;
        case 'ArrowRight': keys.lookRight = true; break;
        case 'Space':
            if (canJump) {
                playerVelocity.y = CONFIG.player.jumpForce;
                canJump = false;
            }
            break;
        case 'ShiftLeft': keys.sprint = true; break;
        case 'KeyR':
            const stats = getWeaponStats();
            if (!weapon.isReloading && weapon.ammo < stats.magSize && weapon.reserveAmmo > 0) {
                reload();
            }
            break;
        case 'Escape': togglePause(); break;
        case 'F3':
            event.preventDefault();
            DebugLog.toggle();
            break;
        case 'F4':
            // Dev: Toggle god mode (singleplayer only)
            event.preventDefault();
            if (GameState.mode === 'singleplayer') {
                DevSettings.godMode = !DevSettings.godMode;
                DebugLog.log(`God Mode: ${DevSettings.godMode ? 'ENABLED' : 'DISABLED'}`, DevSettings.godMode ? 'success' : 'warn');
                showDevIndicators();
            }
            break;
        case 'F6':
            // Dev: Toggle infinite ammo (singleplayer only)
            event.preventDefault();
            if (GameState.mode === 'singleplayer') {
                DevSettings.infiniteAmmo = !DevSettings.infiniteAmmo;
                DebugLog.log(`Infinite Ammo: ${DevSettings.infiniteAmmo ? 'ENABLED' : 'DISABLED'}`, DevSettings.infiniteAmmo ? 'success' : 'warn');
                showDevIndicators();
            }
            break;
        case 'KeyE':
            // Interact/pickup (only when alive)
            if (playerState.isAlive && nearbyPickup) {
                if (GameState.mode === 'singleplayer') {
                    collectSinglePlayerPickup(nearbyPickup);
                } else {
                    sendToServer({ type: 'collectPickup', pickupId: nearbyPickup });
                }
                nearbyPickup = null;
                updateInteractPrompt();
            }
            break;
        // Weapon switching
        case 'Digit1': switchWeapon('pistol'); break;
        case 'Digit2': switchWeapon('smg'); break;
        case 'Digit3': switchWeapon('shotgun'); break;
        case 'Digit4': switchWeapon('rocketLauncher'); break;
        case 'Digit5': switchWeapon('laserGun'); break;
        // Grenade throw
        case 'KeyG': throwGrenade(); break;
    }
}

function onKeyUp(event) {
    switch (event.code) {
        case 'KeyW': keys.forward = false; break;
        case 'KeyS': keys.backward = false; break;
        case 'KeyA': keys.left = false; break;
        case 'KeyD': keys.right = false; break;
        case 'ArrowUp': keys.lookUp = false; break;
        case 'ArrowDown': keys.lookDown = false; break;
        case 'ArrowLeft': keys.lookLeft = false; break;
        case 'ArrowRight': keys.lookRight = false; break;
        case 'ShiftLeft': keys.sprint = false; break;
    }
}

function onMouseMove(event) {
    if (!pointerLocked || !GameState.isRunning || GameState.isPaused) return;

    const movementX = event.movementX || 0;
    const movementY = event.movementY || 0;

    playerState.rotation.y -= movementX * CONFIG.player.mouseSensitivity;
    playerState.rotation.x -= movementY * CONFIG.player.mouseSensitivity;
    playerState.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, playerState.rotation.x));

    camera.rotation.x = playerState.rotation.x;
    player.rotation.y = playerState.rotation.y;
}

function onMouseDown(event) {
    if (event.button === 0) {
        if (!pointerLocked && GameState.isRunning && !GameState.isPaused) {
            document.body.requestPointerLock();
        } else if (GameState.isRunning && !GameState.isPaused) {
            weapon.isFiring = true;
            shoot();
        }
    }
}

function onMouseUp(event) {
    if (event.button === 0) {
        weapon.isFiring = false;
    }
}

// Track if we're in a transition where pointer lock loss shouldn't pause
let inShopTransition = false;

function onPointerLockChange() {
    pointerLocked = document.pointerLockElement === document.body;

    // Don't auto-pause on mobile when pointer lock is lost
    const isMobileDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    // In multiplayer, don't auto-pause if pointer lock fails (might be initial request)
    // Only pause if we HAD pointer lock and lost it (user pressed ESC)
    // Also don't pause during shop transition
    if (!isMobileDevice && !pointerLocked && GameState.isRunning && !GameState.isPaused && !GameState.isGameOver && !inShopTransition) {
        // Only pause in singleplayer, or if we explicitly had pointer lock before
        if (GameState.mode === 'singleplayer') {
            togglePause();
        }
    }
}

// ==================== SHOOTING ====================
function shoot() {
    const stats = getWeaponStats();
    const isPistol = weapon.current === 'pistol';

    // Pistol has infinite ammo, others require ammo
    if (!isPistol && (weapon.isReloading || weapon.ammo <= 0)) {
        if (weapon.ammo <= 0 && weapon.reserveAmmo > 0) reload();
        return;
    }

    const now = Date.now();
    if (now - weapon.lastFired < stats.fireRate) return;

    weapon.lastFired = now;

    // Only consume ammo for non-pistol weapons (unless infinite ammo is enabled)
    if (!isPistol && !(DevSettings.infiniteAmmo && GameState.mode === 'singleplayer')) {
        weapon.ammo--;
    }

    // Track shot for accuracy stats
    GameStats.recordShot();

    const origin = camera.getWorldPosition(new THREE.Vector3());
    const baseDirection = camera.getWorldDirection(new THREE.Vector3());

    // Handle rocket launcher
    if (stats.projectile) {
        fireRocket(origin, baseDirection);
        applyWeaponRecoil(stats.recoil);
        playSound(stats.sound);
        updateHUD();
        return;
    }

    // Handle laser gun
    if (stats.isBeam) {
        fireLaser(origin, baseDirection, stats.damage);
        playSound(stats.sound);
        updateHUD();
        return;
    }

    createMuzzleFlash();

    // Spawn shell casing
    spawnShellCasing(origin.clone(), baseDirection.clone());

    // Fire multiple pellets for shotgun
    const zombieMeshes = getZombieMeshes();

    let totalHits = 0;

    for (let p = 0; p < stats.pellets; p++) {
        // Apply spread to direction
        const spreadDirection = baseDirection.clone();
        if (stats.spread > 0) {
            spreadDirection.x += (Math.random() - 0.5) * stats.spread;
            spreadDirection.y += (Math.random() - 0.5) * stats.spread;
            spreadDirection.z += (Math.random() - 0.5) * stats.spread;
            spreadDirection.normalize();
        }

        // Set raycaster with spread direction
        raycaster.set(origin, spreadDirection);
        const intersects = raycaster.intersectObjects(zombieMeshes, true);

        if (intersects.length > 0) {
            const hitObject = intersects[0].object;

            function findRootMesh(obj) {
                while (obj.parent && obj.parent !== scene) {
                    obj = obj.parent;
                }
                return obj;
            }
            const rootMesh = findRootMesh(hitObject);

            zombies.forEach((zombie, id) => {
                if (zombie.mesh === rootMesh) {
                    // Headshot if hit above neck height (1.5 * scale from ground)
                    // Use ground reference (0) instead of mesh.position.y which bounces during animation
                    const headHeight = 1.5 * (zombie.scale || 1);
                    const isHeadshot = intersects[0].point.y > headHeight;
                    const damage = isHeadshot ? stats.damage * 2 : stats.damage;

                    createBloodSplatter(intersects[0].point);
                    showHitMarker(isHeadshot, intersects[0].point);
                    totalHits++;

                    // Track hit for accuracy stats
                    GameStats.recordHit(damage, isHeadshot, stats.name);

                    if (GameState.mode === 'singleplayer') {
                        damageSinglePlayerZombie(id, damage, isHeadshot);
                    } else {
                        // Show damage numbers immediately for client feedback
                        DamageNumbers.show(
                            zombie.position,
                            damage,
                            isHeadshot,
                            damage >= 50
                        );
                        sendToServer({
                            type: 'shoot',
                            origin: { x: origin.x, y: origin.y, z: origin.z },
                            direction: { x: spreadDirection.x, y: spreadDirection.y, z: spreadDirection.z },
                            hitZombieId: id,
                            isHeadshot: isHeadshot,
                            damage: damage
                        });
                    }
                }
            });
        } else {
            // No zombie hit - check for destructible objects
            const destructibleHit = checkBulletDestructibleHit(origin, spreadDirection);
            if (destructibleHit) {
                damageDestructible(destructibleHit.destructible, stats.damage, destructibleHit.hitPoint);
            }
        }

        // Create bullet tracer
        const gunWorldPos = new THREE.Vector3();
        if (weapon.model) weapon.model.getWorldPosition(gunWorldPos);
        else gunWorldPos.copy(origin);
        createBulletTracer(gunWorldPos, spreadDirection);
    }

    // Gun recoil based on weapon stats - accumulates and recovers over time
    const recoilAmount = stats.recoil;

    // Add to accumulated recoil (capped at max)
    const recoilKick = recoilSystem.recoilPerShot * (recoilAmount / 0.05); // Scale by weapon recoil
    recoilSystem.currentRecoil = Math.min(recoilSystem.maxRecoil, recoilSystem.currentRecoil + recoilKick);

    // Apply immediate camera kick
    playerState.rotation.x += recoilKick;
    playerState.rotation.x = Math.min(recoilSystem.maxRecoil, playerState.rotation.x);
    camera.rotation.x = playerState.rotation.x;

    // Visual weapon kick (recovers quickly)
    if (weapon.model) {
        const horizontalRecoil = (Math.random() - 0.5) * recoilAmount;

        weapon.model.position.z += recoilAmount * 0.8;
        weapon.model.position.y += recoilAmount * 0.2;
        weapon.model.rotation.x -= recoilAmount * 1.5;
        weapon.model.rotation.z += horizontalRecoil;

        const startTime = Date.now();
        const recoilDuration = 60;

        function animateWeaponRecoil() {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / recoilDuration, 1);
            const easeOut = 1 - Math.pow(1 - progress, 2);

            weapon.model.position.z = -0.4 + (recoilAmount * 0.8 * (1 - easeOut));
            weapon.model.position.y = -0.25 + (recoilAmount * 0.2 * (1 - easeOut));
            weapon.model.rotation.x = -recoilAmount * 1.5 * (1 - easeOut);
            weapon.model.rotation.z = horizontalRecoil * (1 - easeOut);

            if (progress < 1) {
                requestAnimationFrame(animateWeaponRecoil);
            }
        }
        animateWeaponRecoil();
    }

    playSound(stats.sound);
    updateHUD();
}

function reload() {
    if (weapon.isReloading) return;
    if (weapon.reserveAmmo <= 0) return;

    weapon.isReloading = true;
    DebugLog.log('Reloading...', 'game');
    playSound('reload');

    const stats = getWeaponStats();
    const reloadDuration = stats.reloadTime;
    const startTime = Date.now();

    // Show reload progress indicator
    const reloadProgress = document.getElementById('reload-progress');
    const reloadFill = reloadProgress ? reloadProgress.querySelector('.reload-fill') : null;
    if (reloadProgress) {
        reloadProgress.style.display = 'block';
        reloadProgress.classList.remove('complete');
    }

    // Animation phases (as percentage of total time)
    const phases = {
        tiltDown: 0.15,      // 0-15%: Tilt weapon down
        magOut: 0.35,        // 15-35%: Magazine drops out
        pause: 0.50,         // 35-50%: Brief pause
        magIn: 0.75,         // 50-75%: New magazine inserted
        tiltUp: 1.0          // 75-100%: Weapon returns to ready
    };

    function animateReload() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / reloadDuration, 1);

        // Update reload progress indicator
        if (reloadFill) {
            // Circle circumference = 2 * PI * r = 2 * 3.14159 * 26 = 163.36
            const circumference = 163.36;
            const dashOffset = circumference * (1 - progress);
            reloadFill.style.strokeDashoffset = dashOffset;

            // Change color based on progress: green -> yellow -> flash at end
            if (progress > 0.9) {
                reloadFill.style.stroke = '#ffff00';
            } else {
                reloadFill.style.stroke = '#00ff00';
            }
        }

        if (!weapon.model || !weapon.magazine) {
            weapon.isReloading = false;
            if (reloadProgress) reloadProgress.style.display = 'none';
            return;
        }

        // Phase 1: Tilt weapon down and to the side
        if (progress < phases.tiltDown) {
            const phaseProgress = progress / phases.tiltDown;
            weapon.model.rotation.x = 0.6 * phaseProgress;
            weapon.model.rotation.z = -0.3 * phaseProgress;
            weapon.model.position.y = weapon.modelOriginalPos.y - 0.05 * phaseProgress;
        }
        // Phase 2: Magazine drops out
        else if (progress < phases.magOut) {
            const phaseProgress = (progress - phases.tiltDown) / (phases.magOut - phases.tiltDown);
            weapon.model.rotation.x = 0.6;
            weapon.model.rotation.z = -0.3;
            weapon.magazine.position.y = weapon.magazineOriginalPos.y - 0.3 * phaseProgress;
            weapon.magazine.rotation.x = -0.2 * phaseProgress;
        }
        // Phase 3: Pause (magazine invisible, being replaced)
        else if (progress < phases.pause) {
            weapon.magazine.visible = false;
        }
        // Phase 4: New magazine inserted
        else if (progress < phases.magIn) {
            const phaseProgress = (progress - phases.pause) / (phases.magIn - phases.pause);
            weapon.magazine.visible = true;
            weapon.magazine.position.y = weapon.magazineOriginalPos.y - 0.3 + 0.3 * phaseProgress;
            weapon.magazine.rotation.x = -0.2 + 0.2 * phaseProgress;
        }
        // Phase 5: Weapon returns to ready position
        else {
            const phaseProgress = (progress - phases.magIn) / (1 - phases.magIn);
            weapon.model.rotation.x = 0.6 * (1 - phaseProgress);
            weapon.model.rotation.z = -0.3 * (1 - phaseProgress);
            weapon.model.position.y = weapon.modelOriginalPos.y - 0.05 * (1 - phaseProgress);
            weapon.magazine.position.copy(weapon.magazineOriginalPos);
            weapon.magazine.rotation.x = 0;
        }

        if (progress < 1) {
            requestAnimationFrame(animateReload);
        } else {
            // Reload complete - reset everything
            weapon.model.rotation.x = weapon.modelOriginalRot.x;
            weapon.model.rotation.z = weapon.modelOriginalRot.z;
            weapon.model.position.copy(weapon.modelOriginalPos);
            weapon.magazine.position.copy(weapon.magazineOriginalPos);
            weapon.magazine.rotation.x = 0;
            weapon.magazine.visible = true;

            const ammoNeeded = stats.magSize - weapon.ammo;
            const ammoToAdd = Math.min(ammoNeeded, weapon.reserveAmmo);

            weapon.ammo += ammoToAdd;
            weapon.reserveAmmo -= ammoToAdd;
            weapon.isReloading = false;

            // Hide reload progress indicator with completion flash
            if (reloadProgress) {
                reloadProgress.classList.add('complete');
                setTimeout(() => {
                    reloadProgress.style.display = 'none';
                    reloadProgress.classList.remove('complete');
                    if (reloadFill) reloadFill.style.strokeDashoffset = 163.36;
                }, 200);
            }

            DebugLog.log(`Reloaded! Ammo: ${weapon.ammo}/${weapon.reserveAmmo}`, 'success');
            updateHUD();
        }
    }

    animateReload();
}

// ==================== SPECIAL WEAPONS ====================

// Apply weapon recoil (extracted for reuse)
function applyWeaponRecoil(recoilAmount) {
    const recoilKick = recoilSystem.recoilPerShot * (recoilAmount / 0.05);
    recoilSystem.currentRecoil = Math.min(recoilSystem.maxRecoil, recoilSystem.currentRecoil + recoilKick);
    playerState.rotation.x += recoilKick;
    playerState.rotation.x = Math.min(recoilSystem.maxRecoil, playerState.rotation.x);
    camera.rotation.x = playerState.rotation.x;

    if (weapon.model) {
        const horizontalRecoil = (Math.random() - 0.5) * recoilAmount;
        weapon.model.position.z += recoilAmount * 0.8;
        weapon.model.position.y += recoilAmount * 0.2;
        weapon.model.rotation.x -= recoilAmount * 1.5;
        weapon.model.rotation.z += horizontalRecoil;

        const startTime = Date.now();
        const recoilDuration = 80;

        function animateRecoil() {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / recoilDuration, 1);
            const easeOut = 1 - Math.pow(1 - progress, 2);

            weapon.model.position.z = -0.4 + (recoilAmount * 0.8 * (1 - easeOut));
            weapon.model.position.y = -0.25 + (recoilAmount * 0.2 * (1 - easeOut));
            weapon.model.rotation.x = -recoilAmount * 1.5 * (1 - easeOut);
            weapon.model.rotation.z = horizontalRecoil * (1 - easeOut);

            if (progress < 1) requestAnimationFrame(animateRecoil);
        }
        animateRecoil();
    }
}

// Fire a rocket projectile
function fireRocket(origin, direction) {
    const rocketGroup = new THREE.Group();

    // Rocket body
    const bodyGeo = new THREE.CylinderGeometry(0.05, 0.06, 0.3, 8);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, metalness: 0.6, roughness: 0.4 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.rotation.x = Math.PI / 2;
    rocketGroup.add(body);

    // Warhead
    const warheadGeo = new THREE.ConeGeometry(0.06, 0.12, 8);
    const warheadMat = new THREE.MeshStandardMaterial({ color: 0x8b0000, emissive: 0x8b0000, emissiveIntensity: 0.3 });
    const warhead = new THREE.Mesh(warheadGeo, warheadMat);
    warhead.rotation.x = -Math.PI / 2;
    warhead.position.z = -0.21;
    rocketGroup.add(warhead);

    // Fins
    for (let i = 0; i < 4; i++) {
        const finGeo = new THREE.BoxGeometry(0.02, 0.1, 0.08);
        const finMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
        const fin = new THREE.Mesh(finGeo, finMat);
        fin.position.z = 0.12;
        fin.rotation.z = (i * Math.PI) / 2;
        fin.position.x = Math.sin(fin.rotation.z) * 0.06;
        fin.position.y = Math.cos(fin.rotation.z) * 0.06;
        rocketGroup.add(fin);
    }

    // Rocket exhaust glow
    const exhaustGeo = new THREE.ConeGeometry(0.04, 0.15, 8);
    const exhaustMat = new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.8 });
    const exhaust = new THREE.Mesh(exhaustGeo, exhaustMat);
    exhaust.rotation.x = Math.PI / 2;
    exhaust.position.z = 0.22;
    rocketGroup.add(exhaust);

    rocketGroup.position.copy(origin);
    rocketGroup.lookAt(origin.clone().add(direction));
    scene.add(rocketGroup);

    const stats = WEAPONS.rocketLauncher;
    projectiles.push({
        mesh: rocketGroup,
        velocity: direction.clone().multiplyScalar(40), // Rocket speed
        damage: stats.damage,
        splashDamage: stats.splashDamage,
        splashRadius: stats.splashRadius,
        type: 'rocket',
        createdAt: Date.now()
    });

    // Smoke trail effect
    createRocketSmokeTrail(rocketGroup);
}

// Create smoke trail for rocket
function createRocketSmokeTrail(rocketMesh) {
    const smokeInterval = setInterval(() => {
        if (!rocketMesh.parent) {
            clearInterval(smokeInterval);
            return;
        }

        const smokeGeo = new THREE.SphereGeometry(0.1, 6, 6);
        const smokeMat = new THREE.MeshBasicMaterial({
            color: 0x888888,
            transparent: true,
            opacity: 0.5
        });
        const smoke = new THREE.Mesh(smokeGeo, smokeMat);
        smoke.position.copy(rocketMesh.position);
        scene.add(smoke);

        // Fade out smoke
        const startTime = Date.now();
        function fadeSmoke() {
            const elapsed = Date.now() - startTime;
            const progress = elapsed / 500;
            if (progress < 1) {
                smoke.material.opacity = 0.5 * (1 - progress);
                smoke.scale.setScalar(1 + progress);
                requestAnimationFrame(fadeSmoke);
            } else {
                scene.remove(smoke);
                smoke.geometry.dispose();
                smoke.material.dispose();
            }
        }
        fadeSmoke();
    }, 30);
}

// Rocket/Grenade explosion with splash damage
function createProjectileExplosion(position, splashRadius, splashDamage) {
    // Visual explosion
    const explosionGroup = new THREE.Group();

    // Fireball
    const fireGeo = new THREE.SphereGeometry(splashRadius * 0.3, 16, 16);
    const fireMat = new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.9 });
    const fire = new THREE.Mesh(fireGeo, fireMat);
    explosionGroup.add(fire);

    // Outer glow
    const glowGeo = new THREE.SphereGeometry(splashRadius * 0.5, 16, 16);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.5 });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    explosionGroup.add(glow);

    explosionGroup.position.copy(position);
    scene.add(explosionGroup);

    // Animate explosion
    const startTime = Date.now();
    function animateExplosion() {
        const elapsed = Date.now() - startTime;
        const progress = elapsed / 400;
        if (progress < 1) {
            const scale = 1 + progress * 2;
            fire.scale.setScalar(scale);
            glow.scale.setScalar(scale * 1.2);
            fire.material.opacity = 0.9 * (1 - progress);
            glow.material.opacity = 0.5 * (1 - progress);
            requestAnimationFrame(animateExplosion);
        } else {
            scene.remove(explosionGroup);
            fire.geometry.dispose();
            fire.material.dispose();
            glow.geometry.dispose();
            glow.material.dispose();
        }
    }
    animateExplosion();

    // Apply splash damage to zombies
    zombies.forEach((zombie, id) => {
        if (!zombie.isAlive || !zombie.mesh) return;
        const distance = zombie.mesh.position.distanceTo(position);
        if (distance <= splashRadius) {
            const damageFalloff = 1 - (distance / splashRadius);
            const damage = Math.floor(splashDamage * damageFalloff);
            if (GameState.mode === 'singleplayer') {
                damageSinglePlayerZombie(id, damage, false);
            }
        }
    });

    // Damage player if too close
    const playerDist = playerState.position.distanceTo(position);
    if (playerDist <= splashRadius && playerDist > 0) {
        const damageFalloff = 1 - (playerDist / splashRadius);
        const selfDamage = Math.floor(splashDamage * 0.5 * damageFalloff);
        damagePlayer(selfDamage);
    }

    playSound('explosion');

    // Damage nearby destructible objects
    damageDestructiblesInRadius(position, splashRadius, splashDamage);
}

// ==================== DESTRUCTIBLE ENVIRONMENT ====================
function damageDestructible(destructible, damage, hitPoint) {
    if (!destructible || !destructible.mesh || destructible.destroyed) return;

    destructible.health -= damage;

    // Visual damage feedback - darken the object
    destructible.mesh.traverse(child => {
        if (child.isMesh && child.material) {
            if (!child.userData.originalColor) {
                child.userData.originalColor = child.material.color ? child.material.color.getHex() : 0xffffff;
            }
            const healthPercent = Math.max(0, destructible.health / destructible.maxHealth);
            const darkenFactor = 0.3 + healthPercent * 0.7;
            const originalColor = new THREE.Color(child.userData.originalColor);
            child.material.color.setRGB(
                originalColor.r * darkenFactor,
                originalColor.g * darkenFactor,
                originalColor.b * darkenFactor
            );
        }
    });

    // Create spark/debris particles on hit
    if (hitPoint) {
        createDestructibleHitEffect(hitPoint, destructible.material || 'wood');
    }

    // Check if destroyed
    if (destructible.health <= 0) {
        destroyObject(destructible);
    }
}

function damageDestructiblesInRadius(position, radius, damage) {
    destructibleObjects.forEach(destructible => {
        if (destructible.destroyed || !destructible.mesh) return;

        const objCenter = new THREE.Vector3(
            destructible.collision.centerX || (destructible.collision.minX + destructible.collision.maxX) / 2,
            1, // Approximate center height
            destructible.collision.centerZ || (destructible.collision.minZ + destructible.collision.maxZ) / 2
        );

        const distance = objCenter.distanceTo(position);
        if (distance <= radius) {
            const damageFalloff = 1 - (distance / radius);
            const actualDamage = Math.floor(damage * damageFalloff);
            damageDestructible(destructible, actualDamage, objCenter);
        }
    });
}

function destroyObject(destructible) {
    if (destructible.destroyed) return;
    destructible.destroyed = true;

    const position = destructible.mesh.position.clone();
    const material = destructible.material || 'wood';

    // Create destruction debris
    createDestructionDebris(position, material, destructible.size || 1);

    // Remove from scene
    scene.remove(destructible.mesh);

    // Dispose of geometries and materials
    destructible.mesh.traverse(child => {
        if (child.isMesh) {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => m.dispose());
                } else {
                    child.material.dispose();
                }
            }
        }
    });

    // Remove from collision objects and spatial hash grid
    const collisionIndex = collisionObjects.indexOf(destructible.mesh);
    if (collisionIndex > -1) {
        collisionObjects.splice(collisionIndex, 1);
    }
    CollisionGrid.remove(destructible.mesh);

    // Remove from obstacles array
    const obstacleIndex = obstacles.findIndex(o =>
        o.minX === destructible.collision.minX &&
        o.maxX === destructible.collision.maxX &&
        o.minZ === destructible.collision.minZ &&
        o.maxZ === destructible.collision.maxZ
    );
    if (obstacleIndex > -1) {
        obstacles.splice(obstacleIndex, 1);
    }

    // Rebuild nav grid
    NavGrid.rebuildFromObstacles();
    Pathfinder.clearCache();

    // Chance to drop pickup
    if (Math.random() < 0.3) {
        const pickupTypes = ['health', 'ammo', 'ammo'];
        const type = pickupTypes[Math.floor(Math.random() * pickupTypes.length)];
        spawnPickup(position.x, position.z, type);
    }

    playSound('glass'); // Destruction sound
}

function createDestructibleHitEffect(position, material) {
    const colors = {
        wood: [0x8b4513, 0x654321, 0xa0522d],
        metal: [0x888888, 0xaaaaaa, 0x666666],
        glass: [0x88ccff, 0xaaddff, 0x66bbee],
        plastic: [0xff4444, 0x44ff44, 0x4444ff]
    };
    const particleColors = colors[material] || colors.wood;

    for (let i = 0; i < 8; i++) {
        const geo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
        const mat = new THREE.MeshBasicMaterial({
            color: particleColors[Math.floor(Math.random() * particleColors.length)]
        });
        const particle = new THREE.Mesh(geo, mat);
        particle.position.copy(position);

        const velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 3,
            Math.random() * 2 + 1,
            (Math.random() - 0.5) * 3
        );

        scene.add(particle);

        const startTime = Date.now();
        function animateParticle() {
            const elapsed = (Date.now() - startTime) / 1000;
            if (elapsed > 0.5) {
                scene.remove(particle);
                geo.dispose();
                mat.dispose();
                return;
            }

            velocity.y -= 15 * 0.016; // Gravity
            Vec3.temp.copy(velocity).multiplyScalar(0.016);
            particle.position.add(Vec3.temp);
            particle.rotation.x += 0.2;
            particle.rotation.y += 0.3;
            particle.material.opacity = 1 - elapsed * 2;

            requestAnimationFrame(animateParticle);
        }
        animateParticle();
    }
}

function createDestructionDebris(position, material, size) {
    const colors = {
        wood: [0x8b4513, 0x654321, 0xa0522d, 0x5c3317],
        metal: [0x888888, 0xaaaaaa, 0x666666, 0x444444],
        glass: [0x88ccff, 0xaaddff, 0x66bbee, 0x99ddff],
        plastic: [0xff4444, 0x44ff44, 0x4444ff, 0xffff44]
    };
    const particleColors = colors[material] || colors.wood;
    const numPieces = Math.floor(15 + size * 10);

    for (let i = 0; i < numPieces; i++) {
        const pieceSize = 0.1 + Math.random() * 0.2 * size;
        const geo = new THREE.BoxGeometry(pieceSize, pieceSize * 0.5, pieceSize);
        const mat = new THREE.MeshStandardMaterial({
            color: particleColors[Math.floor(Math.random() * particleColors.length)],
            roughness: 0.8
        });
        const piece = new THREE.Mesh(geo, mat);
        piece.position.copy(position);
        piece.position.y += Math.random() * size;
        piece.position.x += (Math.random() - 0.5) * size;
        piece.position.z += (Math.random() - 0.5) * size;
        piece.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);

        const velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 6,
            Math.random() * 4 + 2,
            (Math.random() - 0.5) * 6
        );
        const angularVel = new THREE.Vector3(
            (Math.random() - 0.5) * 8,
            (Math.random() - 0.5) * 8,
            (Math.random() - 0.5) * 8
        );

        scene.add(piece);

        const startTime = Date.now();
        const lifetime = 2000 + Math.random() * 1000;

        function animateDebris() {
            const elapsed = Date.now() - startTime;
            if (elapsed > lifetime) {
                scene.remove(piece);
                geo.dispose();
                mat.dispose();
                return;
            }

            const dt = 0.016;
            velocity.y -= 12 * dt; // Gravity

            Vec3.temp.copy(velocity).multiplyScalar(dt);
            piece.position.add(Vec3.temp);
            piece.rotation.x += angularVel.x * dt;
            piece.rotation.y += angularVel.y * dt;
            piece.rotation.z += angularVel.z * dt;

            // Ground collision
            if (piece.position.y < pieceSize / 2) {
                piece.position.y = pieceSize / 2;
                velocity.y *= -0.3; // Bounce
                velocity.x *= 0.8; // Friction
                velocity.z *= 0.8;
                angularVel.multiplyScalar(0.7);
            }

            // Fade out near end of life
            if (elapsed > lifetime - 500) {
                const fadeProgress = (elapsed - (lifetime - 500)) / 500;
                piece.material.opacity = 1 - fadeProgress;
                piece.material.transparent = true;
            }

            requestAnimationFrame(animateDebris);
        }
        animateDebris();
    }
}

function checkBulletDestructibleHit(origin, direction, maxDistance = 100) {
    // Create bounding box checks for destructibles
    for (const destructible of destructibleObjects) {
        if (destructible.destroyed || !destructible.mesh) continue;

        const col = destructible.collision;
        const minY = 0;
        const maxY = destructible.height || 2;

        // Simple ray-box intersection
        const hitPoint = rayBoxIntersection(origin, direction, col.minX, col.maxX, minY, maxY, col.minZ, col.maxZ);
        if (hitPoint && hitPoint.distance < maxDistance) {
            return { destructible, hitPoint: hitPoint.point, distance: hitPoint.distance };
        }
    }
    return null;
}

function rayBoxIntersection(origin, direction, minX, maxX, minY, maxY, minZ, maxZ) {
    let tmin = (minX - origin.x) / direction.x;
    let tmax = (maxX - origin.x) / direction.x;

    if (tmin > tmax) [tmin, tmax] = [tmax, tmin];

    let tymin = (minY - origin.y) / direction.y;
    let tymax = (maxY - origin.y) / direction.y;

    if (tymin > tymax) [tymin, tymax] = [tymax, tymin];

    if (tmin > tymax || tymin > tmax) return null;

    if (tymin > tmin) tmin = tymin;
    if (tymax < tmax) tmax = tymax;

    let tzmin = (minZ - origin.z) / direction.z;
    let tzmax = (maxZ - origin.z) / direction.z;

    if (tzmin > tzmax) [tzmin, tzmax] = [tzmax, tzmin];

    if (tmin > tzmax || tzmin > tmax) return null;

    if (tzmin > tmin) tmin = tzmin;

    if (tmin < 0) return null;

    const point = origin.clone().add(direction.clone().multiplyScalar(tmin));
    return { point, distance: tmin };
}

// Fire laser beam
function fireLaser(origin, direction, damage) {
    // Get the muzzle position from the laser gun model
    let muzzlePos = origin.clone();
    if (weapon.current === 'laserGun' && weaponModels.laserGun && weaponModels.laserGun.barrelTip) {
        const barrelTip = weaponModels.laserGun.barrelTip;
        muzzlePos = new THREE.Vector3();
        barrelTip.getWorldPosition(muzzlePos);
    }

    // Raycast for hit detection
    const zombieMeshes = getZombieMeshes();

    raycaster.set(origin, direction);
    const intersects = raycaster.intersectObjects(zombieMeshes, true);

    let hitPoint = origin.clone().add(direction.clone().multiplyScalar(50)); // Max range

    if (intersects.length > 0) {
        hitPoint = intersects[0].point;
        const hitObject = intersects[0].object;

        function findRootMesh(obj) {
            while (obj.parent && obj.parent !== scene) {
                obj = obj.parent;
            }
            return obj;
        }
        const rootMesh = findRootMesh(hitObject);

        zombies.forEach((zombie, id) => {
            if (zombie.mesh === rootMesh) {
                // Headshot if hit above neck height (1.5 * scale from ground)
                const headHeight = 1.5 * (zombie.scale || 1);
                const isHeadshot = intersects[0].point.y > headHeight;
                const actualDamage = isHeadshot ? damage * 1.5 : damage;
                showHitMarker(isHeadshot, intersects[0].point);
                if (GameState.mode === 'singleplayer') {
                    damageSinglePlayerZombie(id, actualDamage, isHeadshot);
                } else {
                    // Show damage numbers immediately for client feedback
                    DamageNumbers.show(
                        zombie.position,
                        actualDamage,
                        isHeadshot,
                        actualDamage >= 50
                    );
                    // Send hit to server
                    sendToServer({
                        type: 'shoot',
                        origin: { x: origin.x, y: origin.y, z: origin.z },
                        direction: { x: direction.x, y: direction.y, z: direction.z },
                        hitZombieId: id,
                        isHeadshot: isHeadshot,
                        damage: actualDamage
                    });
                }
            }
        });
    } else {
        // No zombie hit - check for destructible objects
        const destructibleHit = checkBulletDestructibleHit(origin, direction, 50);
        if (destructibleHit) {
            hitPoint = destructibleHit.hitPoint;
            damageDestructible(destructibleHit.destructible, damage, destructibleHit.hitPoint);
        }
    }

    // Create laser beam visual from muzzle to hit point
    createLaserBeamVisual(muzzlePos, hitPoint, true);
}

// Laser beam group for continuous display
let laserBeamGroup = null;
let laserImpact = null;

// Create laser beam visual - continuous beam from muzzle to target
function createLaserBeamVisual(start, end, continuous = false) {
    // Clean up old beam components
    if (laserBeamGroup) {
        scene.remove(laserBeamGroup);
        laserBeamGroup.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
        laserBeamGroup = null;
    }
    if (laserImpact) {
        scene.remove(laserImpact);
        laserImpact.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
        laserImpact = null;
    }
    if (laserBeam) {
        scene.remove(laserBeam);
        if (laserBeam.geometry) laserBeam.geometry.dispose();
        if (laserBeam.material) laserBeam.material.dispose();
        laserBeam = null;
    }

    const distance = start.distanceTo(end);
    const direction = end.clone().sub(start).normalize();

    // Calculate midpoint between start and end
    const midPoint = start.clone().add(end).multiplyScalar(0.5);

    // Create beam group
    laserBeamGroup = new THREE.Group();

    // Helper function to create and orient a beam cylinder
    function createBeamCylinder(radius, color, opacity) {
        const geo = new THREE.CylinderGeometry(radius, radius, distance, 8);
        const mat = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: opacity
        });
        const mesh = new THREE.Mesh(geo, mat);

        // Position at midpoint
        mesh.position.copy(midPoint);

        // Orient cylinder to point from start to end
        // Cylinder's default orientation is along Y axis
        // We need to rotate it to align with our direction
        const quaternion = new THREE.Quaternion();
        quaternion.setFromUnitVectors(Vec3.UP, direction);
        mesh.quaternion.copy(quaternion);

        return mesh;
    }

    // Inner core beam (bright white-cyan)
    const coreBeam = createBeamCylinder(0.008, 0xffffff, 1.0);
    laserBeamGroup.add(coreBeam);

    // Middle glow beam (cyan)
    const midBeam = createBeamCylinder(0.02, 0x00ffff, 0.7);
    laserBeamGroup.add(midBeam);

    // Outer glow beam (soft cyan glow)
    const outerBeam = createBeamCylinder(0.05, 0x00aaff, 0.25);
    laserBeamGroup.add(outerBeam);

    scene.add(laserBeamGroup);

    // Create impact effect at hit point
    laserImpact = new THREE.Group();

    // Impact core
    const impactCoreGeo = new THREE.SphereGeometry(0.08, 12, 12);
    const impactCoreMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.9
    });
    const impactCore = new THREE.Mesh(impactCoreGeo, impactCoreMat);
    laserImpact.add(impactCore);

    // Impact glow
    const impactGlowGeo = new THREE.SphereGeometry(0.15, 12, 12);
    const impactGlowMat = new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.5
    });
    const impactGlow = new THREE.Mesh(impactGlowGeo, impactGlowMat);
    laserImpact.add(impactGlow);

    // Outer impact glow
    const impactOuterGeo = new THREE.SphereGeometry(0.25, 8, 8);
    const impactOuterMat = new THREE.MeshBasicMaterial({
        color: 0x0088ff,
        transparent: true,
        opacity: 0.2
    });
    const impactOuter = new THREE.Mesh(impactOuterGeo, impactOuterMat);
    laserImpact.add(impactOuter);

    laserImpact.position.copy(end);
    scene.add(laserImpact);

    // Add light at muzzle
    const muzzleLight = new THREE.PointLight(0x00ffff, 1, 3);
    muzzleLight.position.copy(start);
    scene.add(muzzleLight);

    // Add light at impact point
    const impactLight = new THREE.PointLight(0x00ffff, 0.8, 4);
    impactLight.position.copy(end);
    scene.add(impactLight);

    // Fade beam after short delay (continuous means quick refresh)
    const fadeTime = continuous ? 60 : 100;
    setTimeout(() => {
        if (laserBeamGroup) {
            scene.remove(laserBeamGroup);
            laserBeamGroup.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
            laserBeamGroup = null;
        }
        if (laserImpact) {
            scene.remove(laserImpact);
            laserImpact.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
            laserImpact = null;
        }
        scene.remove(muzzleLight);
        scene.remove(impactLight);
    }, fadeTime);
}

// Throw grenade
function throwGrenade() {
    if (weapon.grenades <= 0 && !(DevSettings.infiniteAmmo && GameState.mode === 'singleplayer')) return;
    if (!(DevSettings.infiniteAmmo && GameState.mode === 'singleplayer')) {
        weapon.grenades--;
    }

    const origin = camera.getWorldPosition(new THREE.Vector3());
    const direction = camera.getWorldDirection(new THREE.Vector3());

    // Create grenade mesh
    const grenadeGroup = new THREE.Group();

    // Body
    const bodyGeo = new THREE.SphereGeometry(0.08, 12, 12);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2d4a2d, metalness: 0.3, roughness: 0.7 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    grenadeGroup.add(body);

    // Cap
    const capGeo = new THREE.CylinderGeometry(0.03, 0.04, 0.04, 8);
    const capMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.5 });
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.y = 0.1;
    grenadeGroup.add(cap);

    // Lever
    const leverGeo = new THREE.BoxGeometry(0.015, 0.08, 0.02);
    const lever = new THREE.Mesh(leverGeo, capMat);
    lever.position.set(0.04, 0.06, 0);
    lever.rotation.z = -0.3;
    grenadeGroup.add(lever);

    grenadeGroup.position.copy(origin);
    scene.add(grenadeGroup);

    // Add arc to throw
    const throwVelocity = direction.clone().multiplyScalar(15);
    throwVelocity.y += 5; // Add arc

    projectiles.push({
        mesh: grenadeGroup,
        velocity: throwVelocity,
        damage: 0,
        splashDamage: 120,
        splashRadius: 6,
        type: 'grenade',
        createdAt: Date.now(),
        fuseTime: 2000, // 2 second fuse
        gravity: -15
    });

    playSound('grenadeThrow');
    updateHUD();
}

// Update projectiles each frame
function updateProjectiles(deltaTime) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const proj = projectiles[i];

        // Apply velocity (use static vector to avoid allocation)
        Vec3.temp.copy(proj.velocity).multiplyScalar(deltaTime);
        proj.mesh.position.add(Vec3.temp);

        // Apply gravity for grenades
        if (proj.gravity) {
            proj.velocity.y += proj.gravity * deltaTime;

            // Bounce off floor
            if (proj.mesh.position.y <= 0.1) {
                proj.mesh.position.y = 0.1;
                proj.velocity.y *= -0.4;
                proj.velocity.x *= 0.8;
                proj.velocity.z *= 0.8;
            }

            // Bounce off obstacles
            const grenadePos = proj.mesh.position;
            const nearbyObstacles = CollisionGrid.getNearby(grenadePos.x, grenadePos.z, 1);
            for (const obj of nearbyObstacles) {
                if (!obj.userData || !obj.userData.collision) continue;
                const bounds = obj.userData.collision;

                // Check if grenade is inside obstacle bounds
                if (grenadePos.x > bounds.minX && grenadePos.x < bounds.maxX &&
                    grenadePos.z > bounds.minZ && grenadePos.z < bounds.maxZ &&
                    grenadePos.y < (bounds.maxY || 2)) {

                    // Determine which face was hit and bounce accordingly
                    const overlapX1 = grenadePos.x - bounds.minX;
                    const overlapX2 = bounds.maxX - grenadePos.x;
                    const overlapZ1 = grenadePos.z - bounds.minZ;
                    const overlapZ2 = bounds.maxZ - grenadePos.z;
                    const minOverlap = Math.min(overlapX1, overlapX2, overlapZ1, overlapZ2);

                    if (minOverlap === overlapX1 || minOverlap === overlapX2) {
                        // Hit X face - bounce X velocity
                        proj.velocity.x *= -0.5;
                        grenadePos.x += (minOverlap === overlapX1) ? -0.15 : 0.15;
                    } else {
                        // Hit Z face - bounce Z velocity
                        proj.velocity.z *= -0.5;
                        grenadePos.z += (minOverlap === overlapZ1) ? -0.15 : 0.15;
                    }
                    break;
                }
            }

            // Bounce off arena walls
            const arenaHalfWidth = CONFIG.arena.width / 2 - CONFIG.arena.wallThickness - 0.1;
            if (Math.abs(grenadePos.x) > arenaHalfWidth) {
                proj.velocity.x *= -0.5;
                grenadePos.x = Math.sign(grenadePos.x) * arenaHalfWidth;
            }
            if (Math.abs(grenadePos.z) > arenaHalfWidth) {
                proj.velocity.z *= -0.5;
                grenadePos.z = Math.sign(grenadePos.z) * arenaHalfWidth;
            }
        }

        // Rotate grenade
        if (proj.type === 'grenade') {
            proj.mesh.rotation.x += deltaTime * 5;
            proj.mesh.rotation.z += deltaTime * 3;
        }

        // Check for rocket collision with zombies, obstacles, or walls
        if (proj.type === 'rocket') {
            let hit = false;
            const rocketPos = proj.mesh.position;

            // Check zombie hits (use spatial grid for efficiency)
            const nearbyZombies = SpatialGrid.getNearby(rocketPos.x, rocketPos.z, 2);
            for (const zombie of nearbyZombies) {
                if (!zombie.isAlive || !zombie.mesh || hit) continue;
                const distance = zombie.mesh.position.distanceTo(rocketPos);
                if (distance < 1.2) {
                    // Direct hit - full damage plus splash
                    if (GameState.mode === 'singleplayer') {
                        const zombieId = Array.from(zombies.entries()).find(([id, z]) => z === zombie)?.[0];
                        if (zombieId) damageSinglePlayerZombie(zombieId, proj.damage, false);
                    }
                    createProjectileExplosion(rocketPos.clone(), proj.splashRadius, proj.splashDamage);
                    hit = true;
                    break;
                }
            }

            // Check obstacle collision using spatial hash grid
            if (!hit) {
                const nearbyObstacles = CollisionGrid.getNearby(rocketPos.x, rocketPos.z, 1);
                for (const obj of nearbyObstacles) {
                    if (!obj.userData || !obj.userData.collision) continue;
                    const bounds = obj.userData.collision;

                    // Check if rocket is inside obstacle bounds
                    if (rocketPos.x > bounds.minX && rocketPos.x < bounds.maxX &&
                        rocketPos.z > bounds.minZ && rocketPos.z < bounds.maxZ &&
                        rocketPos.y < (bounds.maxY || CONFIG.arena.wallHeight)) {
                        createProjectileExplosion(rocketPos.clone(), proj.splashRadius, proj.splashDamage);
                        hit = true;
                        break;
                    }
                }
            }

            // Check wall/floor/ceiling collision
            const arenaHalfWidth = CONFIG.arena.width / 2 - CONFIG.arena.wallThickness;
            if (!hit && (
                rocketPos.y <= 0.2 ||                              // Floor
                rocketPos.y >= CONFIG.arena.wallHeight - 0.2 ||    // Ceiling
                Math.abs(rocketPos.x) > arenaHalfWidth ||          // Side walls
                Math.abs(rocketPos.z) > arenaHalfWidth             // Front/back walls
            )) {
                createProjectileExplosion(rocketPos.clone(), proj.splashRadius, proj.splashDamage);
                hit = true;
            }

            // Remove if hit or timeout
            if (hit || Date.now() - proj.createdAt > 5000) {
                scene.remove(proj.mesh);
                projectiles.splice(i, 1);
                continue;
            }
        }

        // Grenade fuse timer
        if (proj.type === 'grenade') {
            if (Date.now() - proj.createdAt > proj.fuseTime) {
                createProjectileExplosion(proj.mesh.position, proj.splashRadius, proj.splashDamage);
                scene.remove(proj.mesh);
                projectiles.splice(i, 1);
                continue;
            }
        }

        // Enemy spitter projectiles
        if (proj.type === 'spitter' && proj.owner === 'enemy') {
            const distToPlayer = proj.mesh.position.distanceTo(player.position);

            // Hit player - spawn acid pool at impact
            if (distToPlayer < 1) {
                damagePlayer(proj.damage);
                spawnAcidPool(proj.mesh.position.x, proj.mesh.position.z);
                playSound('hit');
                scene.remove(proj.mesh);
                projectiles.splice(i, 1);
                continue;
            }

            // Hit floor - spawn acid pool
            if (proj.mesh.position.y <= 0.1) {
                spawnAcidPool(proj.mesh.position.x, proj.mesh.position.z);
                scene.remove(proj.mesh);
                projectiles.splice(i, 1);
                continue;
            }

            // Hit wall or timeout - just remove
            if (Math.abs(proj.mesh.position.x) > 24 ||
                Math.abs(proj.mesh.position.z) > 24 ||
                Date.now() - proj.createdAt > 3000) {
                scene.remove(proj.mesh);
                projectiles.splice(i, 1);
                continue;
            }
        }
    }
}

function createMuzzleFlash() {
    // Ensure cached geometries are initialized
    cachedGeometries.init();

    // Get flash position from barrel tip for accurate positioning
    const currentWeaponModel = weaponModels[weapon.current];
    const flashPos = new THREE.Vector3();

    if (currentWeaponModel && currentWeaponModel.barrelTip) {
        currentWeaponModel.barrelTip.getWorldPosition(flashPos);
    } else {
        // Fallback to old method
        weapon.model.getWorldPosition(flashPos);
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        flashPos.add(forward.multiplyScalar(0.6));
    }

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);

    // Main flash - bright core (use cached geometry)
    const coreMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 1
    });
    const core = new THREE.Mesh(cachedGeometries.flashCore, coreMat);
    core.position.copy(flashPos);
    scene.add(core);

    // Outer glow - orange/yellow (use cached geometry)
    const glowMat = new THREE.MeshBasicMaterial({
        color: 0xffaa00,
        transparent: true,
        opacity: 0.8
    });
    const glow = new THREE.Mesh(cachedGeometries.flashGlow, glowMat);
    glow.position.copy(flashPos);
    scene.add(glow);

    // Spark particles (use cached geometry)
    const sparks = [];
    for (let i = 0; i < 6; i++) {
        const sparkMat = new THREE.MeshBasicMaterial({
            color: 0xffff44,
            transparent: true,
            opacity: 1
        });
        const spark = new THREE.Mesh(cachedGeometries.spark, sparkMat);
        spark.position.copy(flashPos);

        // Random direction with forward bias
        const spreadAngle = Math.random() * 0.5;
        const spreadDir = new THREE.Vector3(
            (Math.random() - 0.5) * spreadAngle,
            (Math.random() - 0.5) * spreadAngle,
            -1
        ).applyQuaternion(camera.quaternion).normalize();

        spark.userData.velocity = spreadDir.multiplyScalar(8 + Math.random() * 4);
        scene.add(spark);
        sparks.push(spark);
    }

    // Animate flash
    const startTime = Date.now();
    const flashDuration = 80;

    function animateFlash() {
        const elapsed = Date.now() - startTime;
        const progress = elapsed / flashDuration;

        if (progress < 1) {
            // Fade out
            const fadeOut = 1 - progress;
            coreMat.opacity = fadeOut;
            glowMat.opacity = fadeOut * 0.8;
            glow.scale.setScalar(1 + progress * 0.5);

            // Move sparks
            sparks.forEach(spark => {
                Vec3.temp.copy(spark.userData.velocity).multiplyScalar(0.016);
                spark.position.add(Vec3.temp);
                spark.material.opacity = fadeOut;
                spark.scale.setScalar(fadeOut);
            });

            requestAnimationFrame(animateFlash);
        } else {
            // Clean up - dispose materials but keep cached geometries
            scene.remove(core);
            scene.remove(glow);
            coreMat.dispose();
            glowMat.dispose();
            sparks.forEach(spark => {
                scene.remove(spark);
                spark.material.dispose();
            });
        }
    }
    animateFlash();

    // Add a brief point light for dynamic lighting
    const flashLight = new THREE.PointLight(0xffaa00, 2, 8);
    flashLight.position.copy(flashPos);
    scene.add(flashLight);
    setTimeout(() => {
        scene.remove(flashLight);
        flashLight.dispose();  // Properly dispose to prevent memory leak
    }, 50);
}

function createBulletTracer(origin, direction) {
    // Create a glowing bullet tracer
    const tracerLength = 0.8;
    const tracerGeo = new THREE.CylinderGeometry(0.02, 0.02, tracerLength, 6);
    tracerGeo.rotateX(Math.PI / 2); // Align along Z axis

    const tracerMat = new THREE.MeshBasicMaterial({
        color: 0xffff44,
        transparent: true,
        opacity: 0.9
    });

    const tracer = new THREE.Mesh(tracerGeo, tracerMat);
    tracer.position.copy(origin);

    // Orient tracer to face direction of travel
    const lookTarget = new THREE.Vector3().copy(origin).add(direction);
    tracer.lookAt(lookTarget);

    scene.add(tracer);

    // Store bullet data
    bullets.push({
        mesh: tracer,
        direction: direction.clone().normalize(),
        speed: 200, // units per second
        distanceTraveled: 0,
        maxDistance: 500 // despawn after this distance
    });
}

function updateBullets(delta) {
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];

        // Move bullet
        const movement = bullet.direction.clone().multiplyScalar(bullet.speed * delta);
        bullet.mesh.position.add(movement);
        bullet.distanceTraveled += bullet.speed * delta;

        // Fade out over distance
        const fadeStart = bullet.maxDistance * 0.7;
        if (bullet.distanceTraveled > fadeStart) {
            const fadeProgress = (bullet.distanceTraveled - fadeStart) / (bullet.maxDistance - fadeStart);
            bullet.mesh.material.opacity = 0.9 * (1 - fadeProgress);
        }

        // Remove if traveled too far
        if (bullet.distanceTraveled >= bullet.maxDistance) {
            scene.remove(bullet.mesh);
            // Properly dispose geometry and material to prevent memory leak
            if (bullet.mesh.geometry) bullet.mesh.geometry.dispose();
            if (bullet.mesh.material) bullet.mesh.material.dispose();
            bullets.splice(i, 1);
        }
    }
}

function createBloodSplatter(position) {
    // Spawn pooled blood particles (uses particle system for performance)
    spawnBloodParticles(position, 6);

    // Also create a quick visual flash effect
    const flashGeo = new THREE.SphereGeometry(0.15, 6, 6);
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.8 });
    const flash = new THREE.Mesh(flashGeo, flashMat);
    flash.position.copy(position);
    scene.add(flash);

    // Quick fade animation
    let opacity = 0.8;
    const fadeFlash = () => {
        opacity -= 0.1;
        flash.material.opacity = opacity;
        flash.scale.multiplyScalar(1.1);

        if (opacity > 0) {
            requestAnimationFrame(fadeFlash);
        } else {
            scene.remove(flash);
        }
    };
    fadeFlash();
}

function screenShake() {
    const originalPos = camera.position.clone();
    let shakeTime = 0;

    const shake = () => {
        shakeTime += 0.016;
        camera.position.x = originalPos.x + (Math.random() - 0.5) * 0.1;
        camera.position.y = originalPos.y + (Math.random() - 0.5) * 0.1;

        if (shakeTime < 0.2) {
            requestAnimationFrame(shake);
        } else {
            camera.position.copy(originalPos);
        }
    };
    shake();
}

// ==================== UI ====================
function countAliveZombies() {
    let count = 0;
    zombies.forEach(zombie => {
        if (zombie.isAlive) count++;
    });
    return count;
}

function updateHUD() {
    // Clamp health to valid range to prevent negative widths
    const clampedHealth = Math.max(0, Math.min(100, playerState.health));
    setElementStyle('health-bar', 'width', `${clampedHealth}%`);

    // Update mobile health bar too
    const mobileHealthBar = document.getElementById('mobile-health-bar');
    if (mobileHealthBar) {
        mobileHealthBar.style.width = `${clampedHealth}%`;
        // Change color based on health
        if (clampedHealth <= 25) {
            mobileHealthBar.style.background = 'linear-gradient(90deg, #8b0000, #ff0000)';
        } else if (clampedHealth <= 50) {
            mobileHealthBar.style.background = 'linear-gradient(90deg, #8b4500, #ff8c00)';
        } else {
            mobileHealthBar.style.background = 'linear-gradient(90deg, #006400, #00ff00)';
        }
    }

    // Pistol has infinite ammo
    const ammoDisplay = document.getElementById('ammo-display');
    if (ammoDisplay) {
        if (weapon.current === 'pistol') {
            ammoDisplay.textContent = '\u221E'; // Infinity symbol
        } else {
            ammoDisplay.textContent = `${weapon.ammo} / ${weapon.reserveAmmo}`;
        }
    }

    // Total enemies left calculation differs by mode
    // Singleplayer: alive zombies + zombies yet to spawn (client-side tracking)
    // Multiplayer: use server-provided zombiesRemaining (authoritative)
    const totalEnemiesLeft = GameState.mode === "multiplayer"
        ? GameState.zombiesRemaining
        : countAliveZombies() + (GameState.zombiesToSpawn || 0);
    const waveDisplay = document.getElementById('wave-display');
    const scoreDisplay = document.getElementById('score-display');
    const killsDisplay = document.getElementById('kills-display');
    if (waveDisplay) waveDisplay.innerHTML = `WAVE ${GameState.wave} <span id="enemy-count" style="color: #ff4444; font-size: 18px; margin-left: 10px;">- ${totalEnemiesLeft} LEFT</span>`;
    if (scoreDisplay) scoreDisplay.textContent = playerState.score;
    if (killsDisplay) killsDisplay.textContent = playerState.kills;

    // Update weapon display
    const weaponDisplay = document.getElementById('weapon-display');
    if (weaponDisplay) {
        const stats = getWeaponStats();
        weaponDisplay.textContent = stats.name;
    }

    // Update grenade count
    const grenadeDisplay = document.getElementById('grenade-display');
    if (grenadeDisplay) {
        grenadeDisplay.textContent = weapon.grenades;
    }

    // Update mobile HUD elements
    const mobileScore = document.getElementById('mobile-score');
    const mobileKills = document.getElementById('mobile-kills');
    const mobileWaveNum = document.getElementById('mobile-wave-num');
    const mobileWeaponName = document.getElementById('mobile-weapon-name');
    const mobileAmmoCount = document.getElementById('mobile-ammo-count');

    if (mobileScore) mobileScore.textContent = playerState.score;
    if (mobileKills) mobileKills.textContent = playerState.kills;
    if (mobileWaveNum) mobileWaveNum.textContent = GameState.wave;
    if (mobileWeaponName) {
        const stats = getWeaponStats();
        mobileWeaponName.textContent = stats.name;
    }
    if (mobileAmmoCount) {
        if (weapon.current === 'pistol') {
            mobileAmmoCount.textContent = '∞';
        } else {
            mobileAmmoCount.textContent = weapon.ammo + '/' + weapon.reserveAmmo;
        }
    }

    // Low health warning effect
    updateLowHealthEffect();

    // Update minimap
    updateMinimap();
}

// Note: KillFeed and DamageNumbers loaded from modules/ui.js

// ==================== MINIMAP RADAR ====================
function updateMinimap() {
    const canvas = document.getElementById('minimap-canvas');
    if (!canvas || !player) return;

    const ctx = canvas.getContext('2d');
    const size = 120; // Fixed size to avoid scaling issues
    const center = size / 2;
    const scale = size / 60; // 60 units visible radius

    // Ensure canvas size matches
    if (canvas.width !== size || canvas.height !== size) {
        canvas.width = size;
        canvas.height = size;
    }

    // Clear entire canvas (prevent double drawing)
    ctx.clearRect(0, 0, size, size);

    // Fill background
    ctx.fillStyle = 'rgba(0, 20, 0, 0.9)';
    ctx.beginPath();
    ctx.arc(center, center, center - 1, 0, Math.PI * 2);
    ctx.fill();

    // Draw border
    ctx.strokeStyle = '#0f0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(center, center, center - 2, 0, Math.PI * 2);
    ctx.stroke();

    // Player rotation for map orientation
    // In Three.js: rotation.y = 0 means looking at -Z, positive = counterclockwise (looking left)
    // We want: forward (where player looks) = UP on minimap, right = RIGHT on minimap
    const theta = playerState.rotation.y;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);

    // Helper to transform world position to minimap position
    function worldToMinimap(worldX, worldZ) {
        // Get world offset from player
        const dx = worldX - player.position.x;
        const dz = worldZ - player.position.z;

        // Transform to player-local coordinates:
        // Player's right direction: (cos(θ), 0, -sin(θ))
        // Player's forward direction: (-sin(θ), 0, -cos(θ))
        const localRight = dx * cosT - dz * sinT;
        const localForward = -dx * sinT - dz * cosT;

        // Map to canvas: right = +X, forward = -Y (up on screen)
        return {
            x: center + localRight * scale,
            y: center - localForward * scale
        };
    }

    // Clip to circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(center, center, center - 3, 0, Math.PI * 2);
    ctx.clip();

    // Draw zombies as red dots
    ctx.fillStyle = '#ff3333';
    zombies.forEach(zombie => {
        if (!zombie.isAlive) return;

        const dx = zombie.position.x - player.position.x;
        const dz = zombie.position.z - player.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < 30) {
            const pos = worldToMinimap(zombie.position.x, zombie.position.z);
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, zombie.isBossWaveBoss ? 5 : 3, 0, Math.PI * 2);
            ctx.fill();
        }
    });

    // Draw pickups as yellow dots
    ctx.fillStyle = '#ffff00';
    pickups.forEach(pickup => {
        const dx = pickup.position.x - player.position.x;
        const dz = pickup.position.z - player.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < 30) {
            const pos = worldToMinimap(pickup.position.x, pickup.position.z);
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 2, 0, Math.PI * 2);
            ctx.fill();
        }
    });

    // Draw other players as blue dots
    ctx.fillStyle = '#00aaff';
    remotePlayers.forEach(p => {
        if (!p.isAlive) return;

        const dx = p.position.x - player.position.x;
        const dz = p.position.z - player.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < 30) {
            const pos = worldToMinimap(p.position.x, p.position.z);
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 3, 0, Math.PI * 2);
            ctx.fill();
        }
    });

    ctx.restore();

    // Draw player arrow (center, pointing up = forward direction)
    ctx.fillStyle = '#00ff00';
    ctx.beginPath();
    ctx.moveTo(center, center - 6);
    ctx.lineTo(center - 5, center + 5);
    ctx.lineTo(center, center + 2);
    ctx.lineTo(center + 5, center + 5);
    ctx.closePath();
    ctx.fill();
}

// ==================== SCREEN EFFECTS ====================
function showHitMarker(isHeadshot, hitPoint) {
    // Create 3D hitmarker at the hit location
    if (hitPoint) {
        create3DHitMarker(hitPoint, isHeadshot);
    }

    // Also show the HUD hitmarker for feedback
    const hitMarker = document.getElementById('hit-marker');
    if (!hitMarker) return;

    hitMarker.style.color = isHeadshot ? '#ff0' : '#fff';
    hitMarker.style.opacity = '1';
    hitMarker.style.transform = 'scale(1.2)';

    setTimeout(() => {
        hitMarker.style.opacity = '0';
        hitMarker.style.transform = 'scale(1)';
    }, 150);
}

// Create a 3D hitmarker at the hit location
function create3DHitMarker(position, isHeadshot) {
    const markerGroup = new THREE.Group();

    // Create X-shaped hitmarker
    const color = isHeadshot ? 0xffff00 : 0xffffff;
    const size = isHeadshot ? 0.15 : 0.1;

    // Line material
    const lineMat = new THREE.LineBasicMaterial({
        color: color,
        transparent: true,
        opacity: 1,
        linewidth: 2
    });

    // Create 4 lines forming an X
    const lines = [
        [[-size, size, 0], [size, -size, 0]],
        [[size, size, 0], [-size, -size, 0]],
        [[-size, 0, size], [size, 0, -size]],
        [[size, 0, size], [-size, 0, -size]]
    ];

    lines.forEach(linePoints => {
        const geometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(...linePoints[0]),
            new THREE.Vector3(...linePoints[1])
        ]);
        const line = new THREE.Line(geometry, lineMat);
        markerGroup.add(line);
    });

    // Add a small sphere in center
    const sphereGeo = new THREE.SphereGeometry(size * 0.3, 8, 8);
    const sphereMat = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.8
    });
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);
    markerGroup.add(sphere);

    markerGroup.position.copy(position);
    scene.add(markerGroup);

    // Make the marker always face the camera
    markerGroup.lookAt(camera.position);

    // Animate and remove
    const startTime = Date.now();
    const duration = 300;
    const startScale = isHeadshot ? 1.5 : 1;

    function animateMarker() {
        const elapsed = Date.now() - startTime;
        const progress = elapsed / duration;

        if (progress < 1) {
            // Scale down and fade out
            const scale = startScale * (1 - progress * 0.5);
            markerGroup.scale.setScalar(scale);

            // Fade out
            markerGroup.children.forEach(child => {
                if (child.material) {
                    child.material.opacity = 1 - progress;
                }
            });

            // Float upward slightly
            markerGroup.position.y += 0.01;

            requestAnimationFrame(animateMarker);
        } else {
            // Clean up
            markerGroup.children.forEach(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
            scene.remove(markerGroup);
        }
    }
    animateMarker();
}

function updateLowHealthEffect() {
    const lowHealthOverlay = document.getElementById('low-health-overlay');
    if (!lowHealthOverlay) return;

    if (playerState.health <= 25 && playerState.isAlive) {
        const pulse = 0.3 + Math.sin(Date.now() / 200) * 0.15;
        lowHealthOverlay.style.opacity = pulse;
        lowHealthOverlay.style.display = 'block';
    } else {
        lowHealthOverlay.style.display = 'none';
    }
}

function showKillStreak(count) {
    const streakDisplay = document.getElementById('kill-streak-display');
    if (!streakDisplay) return;

    const messages = {
        3: 'TRIPLE KILL!',
        5: 'KILLING SPREE!',
        10: 'UNSTOPPABLE!',
        15: 'DOMINATING!',
        20: 'GODLIKE!',
        25: 'LEGENDARY!'
    };

    const message = messages[count] || `${count} KILL STREAK!`;
    streakDisplay.textContent = message;
    streakDisplay.style.opacity = '1';
    streakDisplay.style.transform = 'scale(1.5)';

    playSound('killStreak');

    setTimeout(() => {
        streakDisplay.style.transform = 'scale(1)';
    }, 100);

    setTimeout(() => {
        streakDisplay.style.opacity = '0';
    }, 2000);
}

function registerKill() {
    const now = Date.now();

    // Check if streak should continue
    if (now - killStreak.lastKillTime < killStreak.streakTimeout) {
        killStreak.current++;
    } else {
        killStreak.current = 1;
    }
    killStreak.lastKillTime = now;

    // Check for milestone
    if (killStreak.milestones.includes(killStreak.current)) {
        showKillStreak(killStreak.current);
    }
}

function updatePlayerList() {
    let listHtml = '';

    // Add local player
    if (localPlayerData) {
        const color = '#' + (localPlayerData.color || 0xffffff).toString(16).padStart(6, '0');
        listHtml += `<div style="color: ${color}; margin: 2px 0;">● ${escapeHtml(localPlayerData.name)} (You)</div>`;
    }

    // Add remote players
    remotePlayers.forEach((p, id) => {
        const color = '#' + (p.color || 0xffffff).toString(16).padStart(6, '0');
        const status = p.isAlive ? '●' : '✗';
        listHtml += `<div style="color: ${color}; margin: 2px 0; opacity: ${p.isAlive ? 1 : 0.5}">${status} ${escapeHtml(p.name)}</div>`;
    });

    const playerList = document.getElementById('player-list');
    const playerCount = document.getElementById('player-count');
    if (playerList) playerList.innerHTML = listHtml;
    if (playerCount) playerCount.textContent = `Players: ${remotePlayers.size + 1}`;
}

function updateConnectionStatus(connected) {
    const status = document.getElementById('connection-status');
    if (connected) {
        status.textContent = '● Connected';
        status.style.color = '#0f0';
    } else {
        status.textContent = '○ Disconnected';
        status.style.color = '#f00';
    }
}

function showWaveCompleteAnnouncement(waveNum, bonus, isBossWave = false) {
    const announcement = document.createElement('div');
    const bonusText = bonus ? `+${bonus} POINTS` : '';

    announcement.style.cssText = `
        position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
        font-size: ${isBossWave ? '56px' : '48px'};
        color: ${isBossWave ? '#ffd700' : '#00ff00'};
        text-shadow: 0 0 30px ${isBossWave ? '#ffd700' : '#00ff00'}, 0 0 60px ${isBossWave ? '#b8860b' : '#008800'};
        font-family: 'Creepster', 'Impact', sans-serif; z-index: 150; pointer-events: none;
        animation: waveComplete 1.5s ease-out forwards; text-align: center;
    `;
    announcement.innerHTML = `
        <div>${isBossWave ? 'BOSS DEFEATED!' : 'WAVE COMPLETE!'}</div>
        <div style="font-size: 28px; margin-top: 10px; color: #ffd700;">${bonusText}</div>
    `;

    const style = document.createElement('style');
    style.textContent = `
        @keyframes waveComplete {
            0% { transform: translate(-50%, -50%) scale(0.5); opacity: 0; }
            20% { transform: translate(-50%, -50%) scale(1.1); opacity: 1; }
            80% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
            100% { transform: translate(-50%, -50%) scale(1); opacity: 0; }
        }
    `;
    document.head.appendChild(style);
    document.body.appendChild(announcement);

    setTimeout(() => {
        announcement.remove();
        style.remove();
    }, 1500);
}

function showWaveAnnouncement(waveNum, isBossWave = false) {
    const announcement = document.createElement('div');

    if (isBossWave) {
        announcement.style.cssText = `
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            font-size: 64px; color: #ff00ff; text-shadow: 0 0 40px #ff00ff, 0 0 80px #8b008b;
            font-family: 'Creepster', 'Impact', sans-serif; z-index: 150; pointer-events: none;
            animation: bossAnnounce 3s ease-out forwards; text-align: center;
        `;
        const bossProps = WaveSystem.getBossProps(waveNum);
        announcement.innerHTML = `<div style="font-size: 36px; margin-bottom: 10px;">BOSS WAVE</div>${escapeHtml(bossProps.name)}`;
    } else {
        announcement.style.cssText = `
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            font-size: 72px; color: #ff0000; text-shadow: 0 0 30px #ff0000, 0 0 60px #8b0000;
            font-family: 'Creepster', 'Impact', sans-serif; z-index: 150; pointer-events: none;
            animation: waveAnnounce 2s ease-out forwards;
        `;
        announcement.textContent = `WAVE ${waveNum}`;
    }

    const style = document.createElement('style');
    style.textContent = `
        @keyframes waveAnnounce {
            0% { transform: translate(-50%, -50%) scale(0.5); opacity: 0; }
            20% { transform: translate(-50%, -50%) scale(1.2); opacity: 1; }
            80% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
            100% { transform: translate(-50%, -50%) scale(1); opacity: 0; }
        }
        @keyframes bossAnnounce {
            0% { transform: translate(-50%, -50%) scale(0.3); opacity: 0; }
            15% { transform: translate(-50%, -50%) scale(1.3); opacity: 1; }
            30% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
            85% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
            100% { transform: translate(-50%, -50%) scale(1.1); opacity: 0; }
        }
    `;
    document.head.appendChild(style);
    document.body.appendChild(announcement);

    const duration = isBossWave ? 3000 : 2000;
    setTimeout(() => {
        announcement.remove();
        style.remove();
    }, duration);
}

function togglePause() {
    if (GameState.isGameOver) return;

    GameState.isPaused = !GameState.isPaused;
    setElementDisplay('pause-screen', GameState.isPaused ? 'flex' : 'none');

    if (GameState.isPaused) {
        document.exitPointerLock();
        // In singleplayer, actually pause the game (stop spawn timer)
        if (GameState.mode === 'singleplayer' && GameState.spawnTimer) {
            clearTimeout(GameState.spawnTimer);
            GameState.spawnTimer = null;
            GameState.spawnWasPaused = true;
        }
    } else {
        // Resume spawning in singleplayer if it was paused mid-spawn
        if (GameState.mode === 'singleplayer' && GameState.spawnWasPaused) {
            GameState.spawnWasPaused = false;
            // If there are still zombies to spawn, restart the spawn chain
            if (GameState.zombiesToSpawn > 0 && GameState.isRunning) {
                const spawnInterval = WaveSystem.getSpawnInterval(GameState.wave);
                spawnNextZombie(GameState.zombiesToSpawn, spawnInterval);
            }
        }
    }
}

// ==================== AUDIO ====================
function playSound(type, position = null) {
    if (!audioContext) return;

    // Apply volume settings
    const volumeMultiplier = userSettings.masterVolume * userSettings.sfxVolume;
    if (volumeMultiplier <= 0) return;

    try {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        // Master volume node
        const masterGain = audioContext.createGain();
        masterGain.gain.value = volumeMultiplier;

        // 3D positional audio if position provided
        let outputNode = gainNode;
        if (position && player) {
            const panner = audioContext.createPanner();
            panner.panningModel = 'HRTF';
            panner.distanceModel = 'inverse';
            panner.refDistance = 1;
            panner.maxDistance = 50;
            panner.rolloffFactor = 1;
            panner.setPosition(position.x, position.y || 1, position.z);

            // Update listener position
            const listener = audioContext.listener;
            listener.setPosition(player.position.x, player.position.y, player.position.z);
            const forward = camera.getWorldDirection(new THREE.Vector3());
            listener.setOrientation(forward.x, forward.y, forward.z, 0, 1, 0);

            gainNode.connect(masterGain);
            masterGain.connect(panner);
            panner.connect(audioContext.destination);
        } else {
            gainNode.connect(masterGain);
            masterGain.connect(audioContext.destination);
        }

        oscillator.connect(gainNode);

        switch (type) {
            case 'pistol':
                oscillator.type = 'sawtooth';
                oscillator.frequency.setValueAtTime(180, audioContext.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(60, audioContext.currentTime + 0.08);
                gainNode.gain.setValueAtTime(0.25, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.08);
                break;
            case 'smg':
                oscillator.type = 'sawtooth';
                oscillator.frequency.setValueAtTime(200, audioContext.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(80, audioContext.currentTime + 0.05);
                gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.05);
                break;
            case 'shotgun':
                oscillator.type = 'sawtooth';
                oscillator.frequency.setValueAtTime(100, audioContext.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(30, audioContext.currentTime + 0.2);
                gainNode.gain.setValueAtTime(0.4, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
                break;
            case 'rocket':
                oscillator.type = 'sawtooth';
                oscillator.frequency.setValueAtTime(80, audioContext.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(150, audioContext.currentTime + 0.1);
                oscillator.frequency.exponentialRampToValueAtTime(40, audioContext.currentTime + 0.3);
                gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
                break;
            case 'laser':
                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(1200, audioContext.currentTime + 0.02);
                oscillator.frequency.exponentialRampToValueAtTime(600, audioContext.currentTime + 0.05);
                gainNode.gain.setValueAtTime(0.15, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.05);
                break;
            case 'explosion':
                oscillator.type = 'sawtooth';
                oscillator.frequency.setValueAtTime(60, audioContext.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(20, audioContext.currentTime + 0.4);
                gainNode.gain.setValueAtTime(0.6, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
                break;
            case 'grenadeThrow':
                oscillator.type = 'square';
                oscillator.frequency.setValueAtTime(200, audioContext.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(100, audioContext.currentTime + 0.1);
                gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
                break;
            case 'shoot': // fallback
                oscillator.type = 'sawtooth';
                oscillator.frequency.setValueAtTime(150, audioContext.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(50, audioContext.currentTime + 0.1);
                gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
                break;
            case 'hit':
                oscillator.type = 'square';
                oscillator.frequency.setValueAtTime(200, audioContext.currentTime);
                gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
                break;
            case 'zombieAttack':
                oscillator.type = 'sawtooth';
                oscillator.frequency.setValueAtTime(80, audioContext.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(40, audioContext.currentTime + 0.3);
                gainNode.gain.setValueAtTime(0.15, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
                break;
            case 'pickup':
                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(880, audioContext.currentTime + 0.1);
                gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
                break;
            case 'reload':
                oscillator.type = 'square';
                oscillator.frequency.setValueAtTime(400, audioContext.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(100, audioContext.currentTime + 0.05);
                gainNode.gain.setValueAtTime(0.15, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.08);
                break;
            case 'weaponSwitch':
                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(300, audioContext.currentTime);
                oscillator.frequency.setValueAtTime(400, audioContext.currentTime + 0.05);
                gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
                break;
            case 'killStreak':
                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(523, audioContext.currentTime);
                oscillator.frequency.setValueAtTime(659, audioContext.currentTime + 0.1);
                oscillator.frequency.setValueAtTime(784, audioContext.currentTime + 0.2);
                gainNode.gain.setValueAtTime(0.25, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
                break;
            case 'lowHealth':
                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(100, audioContext.currentTime);
                gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
                break;
        }

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);

        // Clean up audio nodes when oscillator ends to prevent memory leaks
        oscillator.onended = () => {
            try {
                oscillator.disconnect();
                gainNode.disconnect();
                masterGain.disconnect();
            } catch (e) { /* Already disconnected - ignore */ }
        };
    } catch (e) { /* Audio error - silently ignore for user experience */ }
}

// Play sound at a 3D position (for zombie attacks, pickups, etc.)
function playSound3D(type, worldPosition) {
    playSound(type, worldPosition);
}

// ==================== GAME LOOP ====================
function animate() {
    requestAnimationFrame(animate);

    deltaTime = clock.getDelta();

    // Always update bullets (visual effect even when paused/dead)
    updateBullets(deltaTime);
    updateProjectiles(deltaTime); // Rockets and grenades

    if (GameState.isRunning && !GameState.isPaused && playerState.isAlive) {
        updatePlayer(deltaTime);
        updateRecoilRecovery(deltaTime); // Smooth recoil recovery
        updateRemotePlayerPositions(); // Apply interpolation to remote players
        updateZombieAnimations(deltaTime);
        updateRemotePlayerAnimations(deltaTime);
        updatePickupAnimations(deltaTime);
        updateEffects(deltaTime);
        updateParticles(deltaTime); // Blood, shells, debris
        updateMinimap(); // Live minimap updates
        checkPickupCollisions();

        // Single player zombie AI
        if (GameState.mode === 'singleplayer') {
            updateSinglePlayerZombies(deltaTime);
            EntityCollision.update(); // Resolve all entity collisions
            updateAcidPools(deltaTime); // Update acid pool damage and cleanup
        }

        // Update HUD periodically for live enemy count (throttled to avoid DOM spam)
        if (!window.lastHUDUpdate || Date.now() - window.lastHUDUpdate > 100) {
            updateHUD();
            window.lastHUDUpdate = Date.now();
        }

        if (weapon.isFiring && pointerLocked) {
            shoot();
        }

        // Send position updates to server (multiplayer only) with delta compression
        if (GameState.mode === 'multiplayer') {
            const now = Date.now();
            if (now - lastNetworkUpdate > CONFIG.network.updateRate) {
                // Only send if position/rotation changed significantly
                const compressed = DeltaCompression.getCompressedUpdate(player.position, playerState.rotation);
                if (compressed) {
                    sendToServer({
                        type: 'update',
                        position: { x: compressed.x, y: player.position.y, z: compressed.z },
                        rotation: { x: playerState.rotation.x, y: compressed.rotY }
                    });
                }
                lastNetworkUpdate = now;
            }
        }
    }

    // Spectator mode camera updates (when dead but spectating in multiplayer)
    if (SpectatorMode.isSpectating) {
        SpectatorMode.updateCamera();
        updateRemotePlayerPositions(); // Keep updating remote player positions
        updateRemotePlayerAnimations(deltaTime);
    }

    // Force matrix updates before render (fixes frozen scene in multiplayer)
    player.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    scene.updateMatrixWorld(true);

    renderer.render(scene, camera);

    fpsFrames++;
}

function updatePlayer(delta) {
    if (!playerState.isAlive) return;

    // Arrow key camera look (alternative to mouse)
    const arrowLookSpeed = 2.0; // Radians per second
    if (keys.lookLeft) {
        playerState.rotation.y += arrowLookSpeed * delta;
        player.rotation.y = playerState.rotation.y;
    }
    if (keys.lookRight) {
        playerState.rotation.y -= arrowLookSpeed * delta;
        player.rotation.y = playerState.rotation.y;
    }
    if (keys.lookUp) {
        playerState.rotation.x += arrowLookSpeed * delta;
        playerState.rotation.x = Math.min(Math.PI / 2, playerState.rotation.x);
        camera.rotation.x = playerState.rotation.x;
    }
    if (keys.lookDown) {
        playerState.rotation.x -= arrowLookSpeed * delta;
        playerState.rotation.x = Math.max(-Math.PI / 2, playerState.rotation.x);
        camera.rotation.x = playerState.rotation.x;
    }

    // Calculate intended movement (support both keyboard and mobile input)
    const moveDirection = new THREE.Vector3();

    if (isMobile && (mobileInput.moveX !== 0 || mobileInput.moveZ !== 0)) {
        // Mobile joystick input (already normalized by joystick radius)
        moveDirection.x = mobileInput.moveX;
        moveDirection.z = mobileInput.moveZ;
    } else {
        // Keyboard input
        if (keys.forward) moveDirection.z -= 1;
        if (keys.backward) moveDirection.z += 1;
        if (keys.left) moveDirection.x -= 1;
        if (keys.right) moveDirection.x += 1;
        moveDirection.normalize();
    }

    moveDirection.applyAxisAngle(Vec3.UP, player.rotation.y);

    // Sprint - no stamina limit
    const speed = CONFIG.player.speed * (keys.sprint ? CONFIG.player.sprintMultiplier : 1);
    const moveX = moveDirection.x * speed * delta;
    const moveZ = moveDirection.z * speed * delta;

    // Store old position for collision resolution
    const oldX = player.position.x;
    const oldZ = player.position.z;

    // Apply movement
    player.position.x += moveX;
    player.position.z += moveZ;

    // Collision with arena boundaries (with player radius)
    const boundary = CONFIG.arena.width / 2 - CONFIG.player.radius - CONFIG.arena.wallThickness;
    player.position.x = Math.max(-boundary, Math.min(boundary, player.position.x));
    player.position.z = Math.max(-boundary, Math.min(boundary, player.position.z));

    // Collision with obstacles (tables, arcade machines, etc.)
    // Calculate player feet height (player.position.y is eye level)
    const playerFeetY = player.position.y - CONFIG.player.height;

    // Use spatial hash grid for efficient collision queries
    // Search radius covers player + largest expected object half-size
    const nearbyObstacles = CollisionGrid.getNearby(player.position.x, player.position.z, 3);
    for (const obj of nearbyObstacles) {
        if (!obj.userData || !obj.userData.collision) continue;

        const bounds = obj.userData.collision;

        // Skip collision if player's feet are above the obstacle
        // This allows jumping over low obstacles like tables and chairs
        if (bounds.maxY !== undefined && playerFeetY > bounds.maxY) {
            continue;
        }

        const px = player.position.x;
        const pz = player.position.z;
        const pr = CONFIG.player.radius;

        // Simple AABB collision with player as circle
        if (px + pr > bounds.minX && px - pr < bounds.maxX &&
            pz + pr > bounds.minZ && pz - pr < bounds.maxZ) {

            // Push player out of collision
            const overlapX1 = (bounds.maxX + pr) - px;
            const overlapX2 = px - (bounds.minX - pr);
            const overlapZ1 = (bounds.maxZ + pr) - pz;
            const overlapZ2 = pz - (bounds.minZ - pr);

            const minOverlapX = Math.min(overlapX1, overlapX2);
            const minOverlapZ = Math.min(overlapZ1, overlapZ2);

            if (minOverlapX < minOverlapZ) {
                player.position.x = overlapX1 < overlapX2 ?
                    bounds.maxX + pr : bounds.minX - pr;
            } else {
                player.position.z = overlapZ1 < overlapZ2 ?
                    bounds.maxZ + pr : bounds.minZ - pr;
            }
        }
    }

    // Gravity and jumping
    playerVelocity.y += gravity * delta;
    player.position.y += playerVelocity.y * delta;

    if (player.position.y < CONFIG.player.height) {
        player.position.y = CONFIG.player.height;
        playerVelocity.y = 0;
        canJump = true;
    }

    playerState.position.copy(player.position);

    // Footstep sounds when on ground and moving
    const isMoving = moveX !== 0 || moveZ !== 0;
    const isOnGround = player.position.y <= CONFIG.player.height + 0.1;
    if (isOnGround) {
        updateFootsteps(delta, isMoving, keys.sprint);
    }
}

function updateZombieAnimations(delta) {
    const now = Date.now();

    zombies.forEach(zombie => {
        if (!zombie.mesh) return;

        // Apply smooth interpolation instead of snapping position
        if (GameState.mode === 'multiplayer') {
            Interpolation.applyInterpolation(zombie, zombie.mesh);
            
            // Animate leap/charge Y-height for multiplayer (server handles X/Z)
            if (zombie.abilityState && zombie.abilityState.isLeaping) {
                const leapDuration = GameCore.Constants.ABILITIES.runner.leap.duration;
                const leapProgress = Math.min(1, (performance.now() - zombie.abilityState.leapStartTime) / leapDuration);
                const height = 2.5 * Math.sin(leapProgress * Math.PI);
                zombie.mesh.position.y = height;
                
                if (leapProgress >= 1) {
                    zombie.abilityState.isLeaping = false;
                    zombie.mesh.position.y = 0;
                }
            } else if (zombie.abilityState && zombie.abilityState.isCharging) {
                const chargeDuration = GameCore.Constants.ABILITIES.tank.charge.duration;
                const chargeProgress = (performance.now() - zombie.abilityState.chargeStartTime) / chargeDuration;
                
                if (chargeProgress >= 1) {
                    zombie.abilityState.isCharging = false;
                }
            }
        } else if (zombie.isAlive) {
            // Singleplayer: direct position update (collision system handles mesh sync now)
            zombie.mesh.position.x = zombie.position.x;
            zombie.mesh.position.z = zombie.position.z;
        }

        // Check if attack animation should end (500ms duration)
        if (zombie.isAttacking && zombie.attackStartTime) {
            const attackElapsed = now - zombie.attackStartTime;
            if (attackElapsed > 500) {
                zombie.isAttacking = false;
                if (zombie.mesh.userData.animState) {
                    zombie.mesh.userData.animState.attackPhase = 0;
                }
            }
        }

        // Use skeletal animation system if available
        if (zombie.mesh.userData.bones && zombie.isAlive) {
            ZombieSkeleton.animate(zombie, delta);
        } else if (zombie.isAlive) {
            // Fallback for legacy meshes
            const arms = [];
            zombie.mesh.children.forEach((child, index) => {
                if (index === 2 || index === 3) {
                    arms.push(child);
                }
            });

            if (zombie.isAttacking) {
                const attackProgress = zombie.attackStartTime ?
                    Math.min((now - zombie.attackStartTime) / 250, 1) : 0;
                const attackAngle = Math.sin(attackProgress * Math.PI) * 1.2;

                arms.forEach(arm => {
                    arm.rotation.x = -0.5 - attackAngle;
                });
                zombie.mesh.position.y = 0.1 + Math.sin(attackProgress * Math.PI) * 0.2;
            } else {
                zombie.walkCycle += delta * 8;
                zombie.mesh.position.y = Math.sin(zombie.walkCycle) * 0.1;
                zombie.mesh.rotation.z = Math.sin(zombie.walkCycle) * 0.05;

                arms.forEach((arm, i) => {
                    arm.rotation.x = -0.5 + Math.sin(zombie.walkCycle + i * Math.PI) * 0.3;
                });
            }
        }
    });
}

function updatePickupAnimations(delta) {
    const time = clock.getElapsedTime();

    pickups.forEach(pickup => {
        if (!pickup.mesh) return;
        pickup.mesh.rotation.y += (pickup.rotationSpeed || 2) * delta;
        pickup.mesh.position.y = 0.5 + Math.sin(time * 3 + (pickup.bobOffset || 0)) * 0.15;
    });
}

function updateRemotePlayerAnimations(delta) {
    remotePlayers.forEach((playerData, playerId) => {
        const mesh = remotePlayerMeshes.get(playerId);
        if (!mesh || !playerData.isAlive) return;

        // Find animation groups
        const armGroup = mesh.children.find(c => c.userData.isArms);
        const legGroup = mesh.children.find(c => c.userData.isLegs);
        const weaponGroup = mesh.children.find(c => c.userData.isWeapon);

        // Update shoot animation timer
        if (playerData.shootAnimTime > 0) {
            playerData.shootAnimTime -= delta;
        }

        // Walking animation
        if (playerData.isMoving) {
            playerData.walkCycle += delta * 10;

            // Leg animation
            if (legGroup) {
                legGroup.children.forEach((leg, i) => {
                    const phase = i === 0 ? 0 : Math.PI;
                    leg.rotation.x = Math.sin(playerData.walkCycle + phase) * 0.4;
                });
            }

            // Arm swing (opposite to legs, reduced when shooting)
            if (armGroup && playerData.shootAnimTime <= 0) {
                armGroup.children.forEach((arm, i) => {
                    const phase = i === 0 ? Math.PI : 0;
                    arm.rotation.x = -0.4 + Math.sin(playerData.walkCycle + phase) * 0.25;
                });
            }

            // Slight body bob
            mesh.position.y = Math.abs(Math.sin(playerData.walkCycle * 2)) * 0.03;
        } else {
            // Idle - reset to standing pose
            if (legGroup) {
                legGroup.children.forEach(leg => {
                    leg.rotation.x *= 0.9; // Smooth return to 0
                });
            }

            if (armGroup && playerData.shootAnimTime <= 0) {
                armGroup.children.forEach(arm => {
                    arm.rotation.x = -0.4 + (arm.rotation.x + 0.4) * 0.9;
                });
            }

            mesh.position.y *= 0.9; // Return to ground
        }

        // Shooting animation - arms and weapon recoil
        if (playerData.shootAnimTime > 0) {
            const recoilProgress = playerData.shootAnimTime / 0.2;
            const recoilAmount = Math.sin(recoilProgress * Math.PI) * 0.3;

            if (armGroup) {
                armGroup.children.forEach(arm => {
                    arm.rotation.x = -0.4 - recoilAmount;
                });
            }

            if (weaponGroup) {
                weaponGroup.position.z = 0.35 - recoilAmount * 0.1;
                weaponGroup.rotation.x = -0.2 - recoilAmount * 0.2;
            }
        } else if (weaponGroup) {
            // Reset weapon position
            weaponGroup.position.z = 0.35;
            weaponGroup.rotation.x = -0.2;
        }
    });
}

function checkPickupCollisions() {
    const playerPos = player.position.clone();
    playerPos.y = 0;

    let closestPickup = null;
    let closestDistance = Infinity;

    pickups.forEach((pickup, id) => {
        const pickupPos = new THREE.Vector3(pickup.position.x, 0, pickup.position.z);
        const distance = playerPos.distanceTo(pickupPos);

        if (distance < 2.5 && distance < closestDistance) {
            closestPickup = id;
            closestDistance = distance;
        }
    });

    // Update nearby pickup for E key interaction
    if (nearbyPickup !== closestPickup) {
        nearbyPickup = closestPickup;
        updateInteractPrompt();
    }
}

function updateInteractPrompt() {
    const prompt = document.getElementById('interact-prompt');
    if (!prompt) return;

    if (nearbyPickup && pickups.has(nearbyPickup)) {
        const pickup = pickups.get(nearbyPickup);
        const itemName = pickup.type === 'health' ? 'Health Pack' : 'Ammo Box';
        prompt.innerHTML = `Press <span class="key">E</span> to pick up ${itemName}`;
        prompt.style.display = 'block';
    } else {
        prompt.style.display = 'none';
    }

    // Update mobile interact button visibility
    updateMobileInteractButton();
}

function updateEffects(delta) {
    const time = clock.getElapsedTime();

    scene.children.forEach(child => {
        // Handle point lights
        if (child instanceof THREE.PointLight && child.userData.flickerOffset !== undefined) {
            const speed = child.userData.flickerSpeed || 5;

            if (child.userData.isBroken) {
                // Broken lights flicker erratically
                const flicker1 = Math.sin(time * speed + child.userData.flickerOffset);
                const flicker2 = Math.sin(time * speed * 2.7 + child.userData.flickerOffset * 1.3);
                const randomCut = Math.sin(time * 23) > 0.7 ? 0 : 1; // Random cutouts

                child.intensity = child.userData.baseIntensity *
                    (0.5 + flicker1 * 0.3 + flicker2 * 0.2) * randomCut;

                // Occasionally go completely dark
                if (Math.random() < 0.002) {
                    child.intensity = 0;
                }
            } else {
                // Normal lights have gentle flicker
                child.intensity = child.userData.baseIntensity +
                    Math.sin(time * speed + child.userData.flickerOffset) * 0.15 +
                    Math.sin(time * speed * 2.6 + child.userData.flickerOffset) * 0.05;
            }
        }

        // Handle spotlights
        if (child instanceof THREE.SpotLight && child.userData.flickerOffset !== undefined) {
            const speed = child.userData.flickerSpeed || 3;
            child.intensity = child.userData.baseIntensity +
                Math.sin(time * speed + child.userData.flickerOffset) * 0.2;
        }
    });

    // Update fixture emissive intensity to match lights
    scene.children.forEach(child => {
        if (child.userData && child.userData.light) {
            const light = child.userData.light;
            if (child.material && light.intensity !== undefined) {
                child.material.emissiveIntensity = 0.1 + light.intensity * 0.3;
            }
        }
    });
}

// ==================== SINGLE PLAYER MODE ====================
function startSinglePlayerGame() {
    DebugLog.log('Starting Single Player mode...', 'game');

    // Re-initialize controls (may have been cleaned up on previous quit)
    initControls();

    // Hide menu, show game UI
    setElementDisplay('start-screen', 'none');
    setElementDisplay('hud', 'flex');
    setElementDisplay('crosshair', 'block');

    // Initialize optimization systems
    ZombiePool.init();
    particlePool.preallocate();
    SpatialGrid.clear();
    DeltaCompression.reset();

    // Reset player
    player.position.set(0, CONFIG.player.height, 0);
    playerState.health = CONFIG.player.maxHealth;
    playerState.isAlive = true;
    playerState.kills = 0;
    playerState.score = 0;
    weapon.ammo = CONFIG.player.startAmmo;
    weapon.reserveAmmo = CONFIG.player.reserveAmmo;

    // Reset game state
    GameState.isRunning = true;
    GameState.isGameOver = false;
    GameState.wave = 1;
    GameState.zombiesRemaining = 0;
    GameState.zombiesSpawned = 0;
    GameState.totalKills = 0;
    GameState.totalScore = 0;
    GameState.lastZombieId = 0;

    // Reset map to first map for wave 1
    if (typeof MapManager !== 'undefined' && MapManager.currentMap) {
        MapManager.deactivateBossMode();
        MapManager.loadMap('dining_hall').then(() => {
            const spawn = MapManager.getPlayerSpawn();
            player.position.set(spawn.x, spawn.y, spawn.z);
        }).catch(err => {
            DebugLog.log(`Failed to load map: ${err.message}`, 'error');
        });
    }

    // Reset weapon upgrades for new game
    WeaponUpgrades.reset();

    // Reset game statistics
    GameStats.reset();

    // Clear kill feed
    KillFeed.clear();

    // Reset achievement session stats
    Achievements.resetSession();

    updateHUD();

    // Show mobile controls or request pointer lock
    if (isMobile) {
        showMobileControls();
    } else {
        // Request pointer lock
        setTimeout(() => {
            document.body.requestPointerLock();
        }, 100);
    }

    // Pre-warm audio system to prevent first-shot lag
    warmAudioSystem();

    // Start ambient sounds
    startAmbientSounds();

    // Start first wave after a short delay
    setTimeout(() => {
        startSinglePlayerWave();
    }, 2000);
}

function resetSinglePlayerGame() {
    // Stop ambient sounds
    stopAmbientSounds();

    // Clear zombies
    zombies.forEach((zombie) => {
        if (zombie.mesh) scene.remove(zombie.mesh);
    });
    zombies.clear();

    // Clear optimization systems
    ZombiePool.clear();
    SpatialGrid.clear();

    // Dispose particle pool materials
    particlePool.dispose();

    // Clear pickups
    pickups.forEach((pickup) => {
        if (pickup.mesh) scene.remove(pickup.mesh);
    });
    pickups.clear();

    // Reset destructible objects
    resetDestructibles();

    // Clear spawn timer
    if (GameState.spawnTimer) {
        clearInterval(GameState.spawnTimer);
        GameState.spawnTimer = null;
    }

    GameState.isRunning = false;
}

function resetDestructibles() {
    // Restore destroyed objects
    destructibleObjects.forEach(obj => {
        if (obj.destroyed && obj.originalMeshData) {
            // Recreate mesh would be complex, so we'll rely on full environment rebuild
        }
        // Reset health on non-destroyed objects
        if (!obj.destroyed) {
            obj.health = obj.maxHealth;
            // Restore original colors
            obj.mesh.traverse(child => {
                if (child.isMesh && child.material && child.userData.originalColor !== undefined) {
                    child.material.color.setHex(child.userData.originalColor);
                }
            });
        }
    });
}

// ==================== WAVE SPAWNING SYSTEM ====================
// Now delegates to GameCore for all shared game logic
const WaveSystem = {
    currentBoss: null,
    minionSpawnTimer: null,

    // Delegate to GameCore for shared logic
    isBossWave: (wave) => GameCore.WaveSystem.isBossWave(wave),
    getZombieCount: (wave) => GameCore.WaveSystem.getZombieCount(wave, GameState.zombiesPerWave),
    getSpawnInterval: (wave) => GameCore.WaveSystem.getSpawnInterval(wave),
    getBossProps: (wave) => GameCore.WaveSystem.getBossProps(wave),
    getBossName: (level) => GameCore.WaveSystem.getBossName(level),
    getZombieType: (wave) => GameCore.WaveSystem.getZombieType(wave),
    getWaveBonus: (wave) => GameCore.WaveSystem.getWaveBonus(wave),
    
    // typeProps now references GameCore constants
    get typeProps() {
        return GameCore.Constants.ZOMBIE_TYPES;
    },
    
    // scaleByWave delegates to GameCore
    scaleByWave: (props, wave) => GameCore.WaveSystem.scaleByWave(props, wave, true),

    // Start minion spawning for boss fight
    startMinionSpawning(bossZombie) {
        if (this.minionSpawnTimer) clearInterval(this.minionSpawnTimer);

        this.minionSpawnTimer = setInterval(() => {
            if (!bossZombie.isAlive || !GameState.isRunning) {
                this.stopMinionSpawning();
                return;
            }

            // Count current minions
            let minionCount = 0;
            zombies.forEach(z => {
                if (z.isMinion && z.isAlive) minionCount++;
            });

            // Spawn minion if under limit
            if (minionCount < 5) {
                this.spawnMinion(bossZombie);
            }
        }, 3000);
    },

    stopMinionSpawning() {
        if (this.minionSpawnTimer) {
            clearInterval(this.minionSpawnTimer);
            this.minionSpawnTimer = null;
        }
    },

    spawnMinion(boss) {
        const id = `minion_${++GameState.lastZombieId}`;
        const angle = Math.random() * Math.PI * 2;
        const dist = 3 + Math.random() * 2;

        const position = {
            x: boss.position.x + Math.cos(angle) * dist,
            y: 0,
            z: boss.position.z + Math.sin(angle) * dist
        };

        const props = this.typeProps.minion;

        const zombieData = {
            id: id,
            type: 'minion',
            position: position,
            rotation: 0,
            health: props.health,
            maxHealth: props.health,
            speed: props.speed,
            damage: props.damage,
            scale: props.scale,
            points: props.points,
            isAlive: true,
            lastAttack: 0,
            isMinion: true
        };

        const mesh = createZombieMesh(zombieData);
        const zombieEntry = {
            ...zombieData,
            mesh: mesh,
            walkCycle: Math.random() * Math.PI * 2
        };
        zombies.set(id, zombieEntry);
        invalidateZombieMeshCache();
        SpatialGrid.insert(zombieEntry);
    }
};

async function startSinglePlayerWave() {
    // Clear any existing spawn timer first (safety check)
    if (GameState.spawnTimer) {
        clearTimeout(GameState.spawnTimer);
        GameState.spawnTimer = null;
    }

    // Handle map transitions based on wave
    if (typeof MapManager !== 'undefined' && MapManager.currentMap) {
        const targetMapId = MapManager.getMapForWave(GameState.wave);
        if (targetMapId !== MapManager.currentMapId) {
            DebugLog.log(`Wave ${GameState.wave} - Changing map to ${targetMapId}`, 'game');
            try {
                const mapLoaded = await MapManager.loadMap(targetMapId);

                // Only reposition player if map actually loaded
                if (mapLoaded) {
                    const spawn = MapManager.getPlayerSpawn();
                    player.position.set(spawn.x, spawn.y, spawn.z);
                }
            } catch (err) {
                DebugLog.log(`Failed to load map ${targetMapId}: ${err.message}`, 'error');
            }
        }

        // Activate boss mode if this is a boss wave
        if (MapManager.isBossWave(GameState.wave)) {
            MapManager.activateBossMode();
        }
    }

    // Check if this is a boss wave
    if (WaveSystem.isBossWave(GameState.wave)) {
        startBossWave();
        return;
    }

    const zombieCount = WaveSystem.getZombieCount(GameState.wave);
    const spawnInterval = WaveSystem.getSpawnInterval(GameState.wave);

    GameState.zombiesRemaining = zombieCount;
    GameState.zombiesSpawned = 0;
    GameState.zombiesToSpawn = zombieCount;

    DebugLog.log(`Starting Wave ${GameState.wave} with ${zombieCount} zombies (interval: ${spawnInterval}ms)`, 'game');
    showWaveAnnouncement(GameState.wave);
    updateHUD();
    hideBossHealthBar();

    // Spawn zombies using recursive setTimeout - more reliable on mobile
    if (zombieCount > 0 && GameState.isRunning) {
        spawnNextZombie(zombieCount, spawnInterval);
    }
}

// Recursive spawn function - respects pause state in singleplayer
function spawnNextZombie(totalCount, interval) {
    if (!GameState.isRunning || GameState.isGameOver) return;

    // Don't spawn while paused - will be resumed by togglePause
    if (GameState.isPaused) return;

    if (GameState.zombiesToSpawn > 0) {
        spawnSinglePlayerZombie();
        GameState.zombiesToSpawn--;

        if (GameState.zombiesToSpawn > 0) {
            GameState.spawnTimer = setTimeout(() => {
                spawnNextZombie(totalCount, interval);
            }, interval);
        }
    }
}

// Boss wave handling
function startBossWave() {
    const bossProps = WaveSystem.getBossProps(GameState.wave);

    GameState.zombiesRemaining = 1;
    GameState.zombiesSpawned = 0;

    DebugLog.log(`BOSS WAVE ${GameState.wave}! ${bossProps.name} appears!`, 'warn');
    showWaveAnnouncement(GameState.wave, true);
    updateHUD();

    // Spawn boss after a short delay for dramatic effect
    setTimeout(() => {
        if (GameState.isRunning) {
            spawnBoss(bossProps);
        }
    }, 1500);
}

function spawnBoss(bossProps) {
    const id = `boss_${++GameState.lastZombieId}`;
    const arenaEdge = CONFIG.arena.width / 2 - 5;

    // Spawn boss at opposite side of arena from player
    const playerX = player.position.x;
    const playerZ = player.position.z;
    let position = { x: 0, y: 0, z: 0 };

    if (Math.abs(playerX) > Math.abs(playerZ)) {
        position.x = playerX > 0 ? -arenaEdge : arenaEdge;
        position.z = (Math.random() - 0.5) * CONFIG.arena.depth * 0.5;
    } else {
        position.z = playerZ > 0 ? -arenaEdge : arenaEdge;
        position.x = (Math.random() - 0.5) * CONFIG.arena.width * 0.5;
    }

    const zombieData = {
        id: id,
        type: 'boss',
        position: position,
        rotation: 0,
        health: bossProps.health,
        maxHealth: bossProps.maxHealth,
        speed: bossProps.speed,
        damage: bossProps.damage,
        scale: bossProps.scale,
        points: bossProps.points,
        isAlive: true,
        lastAttack: 0,
        isBossWaveBoss: true,
        bossName: bossProps.name,
        // Boss attack state
        bossAttackState: {
            phase: 1, // 1 = >66% health, 2 = 33-66%, 3 = <33%
            lastGroundSlam: 0,
            lastCharge: 0,
            lastSummon: 0,
            isCharging: false,
            chargeDirection: null,
            chargeStartTime: 0,
            isDoingGroundSlam: false,
            groundSlamStartTime: 0,
            attacks: bossProps.attacks
        }
    };

    const mesh = createZombieMesh(zombieData);
    const zombieEntry = {
        ...zombieData,
        mesh: mesh,
        walkCycle: Math.random() * Math.PI * 2
    };
    zombies.set(id, zombieEntry);
    invalidateZombieMeshCache();
    SpatialGrid.insert(zombieEntry);

    WaveSystem.currentBoss = zombieEntry;
    GameState.zombiesSpawned++;

    // Show boss health bar
    showBossHealthBar(zombieEntry);

    // Start minion spawning
    WaveSystem.startMinionSpawning(zombieEntry);

    DebugLog.log(`${bossProps.name} has spawned!`, 'warn');
}

function showBossHealthBar(boss) {
    const container = document.getElementById('boss-health-container');
    const nameEl = document.getElementById('boss-name');
    const barEl = document.getElementById('boss-health-bar');

    if (container && nameEl && barEl) {
        nameEl.textContent = boss.bossName || 'BOSS';
        barEl.style.width = '100%';
        container.classList.add('visible');
    }
}

function updateBossHealthBar(boss) {
    const barEl = document.getElementById('boss-health-bar');
    if (barEl && boss.maxHealth > 0) {
        const percent = Math.max(0, (boss.health / boss.maxHealth) * 100);
        barEl.style.width = percent + '%';
    }
}

function hideBossHealthBar() {
    const container = document.getElementById('boss-health-container');
    if (container) {
        container.classList.remove('visible');
    }
    WaveSystem.currentBoss = null;
    WaveSystem.stopMinionSpawning();
}

// ==================== BOSS SPECIAL ATTACKS ====================
function updateBossAttacks(boss, deltaTime) {
    if (!boss.isAlive || !boss.bossAttackState) return;

    const state = boss.bossAttackState;
    const now = Date.now();

    // Update phase based on health
    const healthPercent = boss.health / boss.maxHealth;
    if (healthPercent <= 0.33) state.phase = 3;
    else if (healthPercent <= 0.66) state.phase = 2;
    else state.phase = 1;

    // Reduce cooldowns in later phases
    const cooldownMultiplier = state.phase === 3 ? 0.6 : (state.phase === 2 ? 0.8 : 1);

    // Handle ongoing charge
    if (state.isCharging) {
        updateBossCharge(boss, deltaTime);
        return; // Don't do other attacks while charging
    }

    // Handle ongoing ground slam
    if (state.isDoingGroundSlam) {
        updateBossGroundSlam(boss);
        return;
    }

    const distToPlayer = boss.mesh.position.distanceTo(playerState.position);

    // Ground Slam - when close to player
    if (distToPlayer < 8 && now - state.lastGroundSlam > state.attacks.groundSlam.cooldown * cooldownMultiplier) {
        startBossGroundSlam(boss);
        state.lastGroundSlam = now;
        return;
    }

    // Charge - when far from player
    if (distToPlayer > 10 && distToPlayer < 25 && now - state.lastCharge > state.attacks.charge.cooldown * cooldownMultiplier) {
        startBossCharge(boss);
        state.lastCharge = now;
        return;
    }

    // Summon minions - phase 2+
    if (state.phase >= 2 && now - state.lastSummon > state.attacks.summon.cooldown * cooldownMultiplier) {
        bossSummonMinions(boss);
        state.lastSummon = now;
    }

    // Normal boss movement - walk toward player when not doing special attacks
    const dx = player.position.x - boss.position.x;
    const dz = player.position.z - boss.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist > 3) { // Don't move if very close
        const dirX = dx / dist;
        const dirZ = dz / dist;

        // Boss moves slower in later phases (more focus on attacks)
        const speedMultiplier = state.phase === 3 ? 0.7 : (state.phase === 2 ? 0.85 : 1);
        const moveSpeed = boss.speed * speedMultiplier * deltaTime;

        boss.position.x += dirX * moveSpeed;
        boss.position.z += dirZ * moveSpeed;

        // Face player
        boss.rotation = Math.atan2(dx, dz);
    }

    // Melee attack when very close
    if (dist < 3 && now - boss.lastAttack > 1500) {
        boss.lastAttack = now;
        damagePlayer(boss.damage);
        playSound('zombieAttack');
        screenShake(0.3);
    }
}

function startBossGroundSlam(boss) {
    boss.bossAttackState.isDoingGroundSlam = true;
    boss.bossAttackState.groundSlamStartTime = Date.now();

    // Visual warning - boss raises arms
    if (boss.mesh && boss.mesh.userData.leftArm) {
        boss.mesh.userData.leftArm.rotation.x = -Math.PI / 2;
        boss.mesh.userData.rightArm.rotation.x = -Math.PI / 2;
    }

    // Create warning circle on ground
    const warningGeo = new THREE.RingGeometry(0.5, boss.bossAttackState.attacks.groundSlam.radius, 32);
    const warningMat = new THREE.MeshBasicMaterial({
        color: 0xff0000,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide
    });
    const warning = new THREE.Mesh(warningGeo, warningMat);
    warning.rotation.x = -Math.PI / 2;
    warning.position.copy(boss.mesh.position);
    warning.position.y = 0.1;
    scene.add(warning);
    boss.bossAttackState.warningCircle = warning;
}

function updateBossGroundSlam(boss) {
    const elapsed = Date.now() - boss.bossAttackState.groundSlamStartTime;
    const windupTime = 800; // Time before slam hits

    // Animate warning circle
    if (boss.bossAttackState.warningCircle) {
        const pulse = Math.sin(elapsed * 0.02) * 0.3 + 0.5;
        boss.bossAttackState.warningCircle.material.opacity = pulse;
    }

    if (elapsed >= windupTime) {
        executeBossGroundSlam(boss);
    }
}

function executeBossGroundSlam(boss) {
    boss.bossAttackState.isDoingGroundSlam = false;
    const radius = boss.bossAttackState.attacks.groundSlam.radius;
    const damage = boss.bossAttackState.attacks.groundSlam.damage;

    // Remove warning circle
    if (boss.bossAttackState.warningCircle) {
        scene.remove(boss.bossAttackState.warningCircle);
        boss.bossAttackState.warningCircle.geometry.dispose();
        boss.bossAttackState.warningCircle.material.dispose();
        boss.bossAttackState.warningCircle = null;
    }

    // Reset arms
    if (boss.mesh && boss.mesh.userData.leftArm) {
        boss.mesh.userData.leftArm.rotation.x = 0;
        boss.mesh.userData.rightArm.rotation.x = 0;
    }

    // Create shockwave effect
    createGroundSlamEffect(boss.mesh.position, radius);

    // Damage player if in range
    const distToPlayer = boss.mesh.position.distanceTo(playerState.position);
    if (distToPlayer <= radius) {
        damagePlayer(damage);
        // Knockback
        const knockDir = new THREE.Vector3()
            .subVectors(playerState.position, boss.mesh.position)
            .normalize();
        playerState.velocity.x += knockDir.x * 10;
        playerState.velocity.z += knockDir.z * 10;
    }

    // Damage nearby destructibles
    damageDestructiblesInRadius(boss.mesh.position, radius, damage * 2);

    playSound('explosion');
}

function createGroundSlamEffect(position, radius) {
    // Shockwave ring
    const ringGeo = new THREE.RingGeometry(0.5, radius, 32);
    const ringMat = new THREE.MeshBasicMaterial({
        color: 0xff4400,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(position);
    ring.position.y = 0.2;
    scene.add(ring);

    // Debris particles
    for (let i = 0; i < 20; i++) {
        const angle = (i / 20) * Math.PI * 2;
        const dist = Math.random() * radius;
        const debrisGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
        const debrisMat = new THREE.MeshStandardMaterial({ color: 0x444444 });
        const debris = new THREE.Mesh(debrisGeo, debrisMat);
        debris.position.set(
            position.x + Math.cos(angle) * dist,
            0.2,
            position.z + Math.sin(angle) * dist
        );

        const velocity = new THREE.Vector3(
            Math.cos(angle) * 3,
            5 + Math.random() * 3,
            Math.sin(angle) * 3
        );

        scene.add(debris);

        const startTime = Date.now();
        function animateDebris() {
            const elapsed = (Date.now() - startTime) / 1000;
            if (elapsed > 1.5) {
                scene.remove(debris);
                debrisGeo.dispose();
                debrisMat.dispose();
                return;
            }
            velocity.y -= 15 * 0.016;
            Vec3.temp.copy(velocity).multiplyScalar(0.016);
            debris.position.add(Vec3.temp);
            debris.rotation.x += 0.2;
            debris.rotation.z += 0.15;
            if (debris.position.y < 0.15) {
                debris.position.y = 0.15;
                velocity.y *= -0.3;
            }
            requestAnimationFrame(animateDebris);
        }
        animateDebris();
    }

    // Animate ring expansion and fade
    const startTime = Date.now();
    function animateRing() {
        const elapsed = (Date.now() - startTime) / 1000;
        if (elapsed > 0.5) {
            scene.remove(ring);
            ringGeo.dispose();
            ringMat.dispose();
            return;
        }
        const scale = 1 + elapsed * 2;
        ring.scale.set(scale, scale, 1);
        ring.material.opacity = 0.8 * (1 - elapsed * 2);
        requestAnimationFrame(animateRing);
    }
    animateRing();
}

function startBossCharge(boss) {
    boss.bossAttackState.isCharging = true;
    boss.bossAttackState.chargeStartTime = Date.now();

    // Calculate charge direction towards player
    const dir = new THREE.Vector3()
        .subVectors(playerState.position, boss.mesh.position)
        .normalize();
    boss.bossAttackState.chargeDirection = { x: dir.x, z: dir.z };

    // Visual indicator - boss leans forward
    if (boss.mesh) {
        boss.mesh.rotation.x = 0.3;
    }

    // Warning trail
    createChargeWarningLine(boss.mesh.position, playerState.position);
}

function createChargeWarningLine(start, end) {
    const points = [
        new THREE.Vector3(start.x, 0.1, start.z),
        new THREE.Vector3(end.x, 0.1, end.z)
    ];
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.7 });
    const line = new THREE.Line(geo, mat);
    scene.add(line);

    // Fade out the line
    const startTime = Date.now();
    function animateLine() {
        const elapsed = Date.now() - startTime;
        if (elapsed > 600) {
            scene.remove(line);
            geo.dispose();
            mat.dispose();
            return;
        }
        mat.opacity = 0.7 * (1 - elapsed / 600);
        requestAnimationFrame(animateLine);
    }
    animateLine();
}

function updateBossCharge(boss, deltaTime) {
    const elapsed = Date.now() - boss.bossAttackState.chargeStartTime;
    const chargeDelay = 500; // Wind-up time
    const chargeDuration = 1500;

    if (elapsed < chargeDelay) {
        // Wind-up phase - boss shakes
        if (boss.mesh) {
            boss.mesh.position.x += (Math.random() - 0.5) * 0.1;
            boss.mesh.position.z += (Math.random() - 0.5) * 0.1;
        }
        return;
    }

    if (elapsed > chargeDelay + chargeDuration) {
        // Charge complete
        boss.bossAttackState.isCharging = false;
        if (boss.mesh) boss.mesh.rotation.x = 0;
        return;
    }

    // Execute charge movement
    const chargeSpeed = boss.bossAttackState.attacks.charge.speed;
    const dir = boss.bossAttackState.chargeDirection;
    const moveSpeed = chargeSpeed * deltaTime;

    boss.mesh.position.x += dir.x * moveSpeed;
    boss.mesh.position.z += dir.z * moveSpeed;

    // Check collision with player
    const distToPlayer = boss.mesh.position.distanceTo(playerState.position);
    if (distToPlayer < 2.5) {
        damagePlayer(boss.bossAttackState.attacks.charge.damage);
        // Knockback player
        const knockDir = new THREE.Vector3(dir.x, 0.3, dir.z).normalize();
        playerState.velocity.x += knockDir.x * 15;
        playerState.velocity.y += knockDir.y * 8;
        playerState.velocity.z += knockDir.z * 15;
        // Stop charge on hit
        boss.bossAttackState.isCharging = false;
        if (boss.mesh) boss.mesh.rotation.x = 0;
    }

    // Check wall collision
    const arenaEdge = CONFIG.arena.width / 2 - 2;
    if (Math.abs(boss.mesh.position.x) > arenaEdge || Math.abs(boss.mesh.position.z) > arenaEdge) {
        boss.bossAttackState.isCharging = false;
        if (boss.mesh) boss.mesh.rotation.x = 0;
        // Stun effect - boss hit wall
        createGroundSlamEffect(boss.mesh.position, 3);
    }
}

function bossSummonMinions(boss) {
    const count = boss.bossAttackState.attacks.summon.count;

    // Spawn effect
    for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const particleGeo = new THREE.SphereGeometry(0.2, 8, 8);
        const particleMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        const particle = new THREE.Mesh(particleGeo, particleMat);
        particle.position.copy(boss.mesh.position);
        particle.position.y += 1;
        scene.add(particle);

        const velocity = new THREE.Vector3(Math.cos(angle) * 3, 2, Math.sin(angle) * 3);
        const startTime = Date.now();
        function animateParticle() {
            const elapsed = (Date.now() - startTime) / 1000;
            if (elapsed > 0.8) {
                scene.remove(particle);
                particleGeo.dispose();
                particleMat.dispose();
                return;
            }
            velocity.y -= 5 * 0.016;
            Vec3.temp.copy(velocity).multiplyScalar(0.016);
            particle.position.add(Vec3.temp);
            particle.material.opacity = 1 - elapsed / 0.8;
            requestAnimationFrame(animateParticle);
        }
        animateParticle();
    }

    // Actually spawn the minions
    for (let i = 0; i < count; i++) {
        setTimeout(() => {
            if (boss.isAlive && GameState.isRunning) {
                WaveSystem.spawnMinion(boss);
            }
        }, i * 200);
    }

    DebugLog.log(`Boss summoned ${count} minions!`, 'warn');
}

function spawnSinglePlayerZombie() {
    const id = `zombie_${++GameState.lastZombieId}`;
    const minPlayerDistance = 5; // Minimum distance from player
    let position = null;

    // Use MapManager spawn points if available
    if (typeof MapManager !== 'undefined' && MapManager.currentMap) {
        const spawns = MapManager.getZombieSpawns();
        if (spawns.length > 0) {
            // Pick a random spawn point that's far enough from player
            const validSpawns = spawns.filter(spawn => {
                const dx = spawn.x - player.position.x;
                const dz = spawn.z - player.position.z;
                return Math.sqrt(dx * dx + dz * dz) >= minPlayerDistance;
            });

            if (validSpawns.length > 0) {
                const spawn = validSpawns[Math.floor(Math.random() * validSpawns.length)];
                position = { x: spawn.x, y: 0, z: spawn.z };
            } else {
                // Use any spawn if none are far enough
                const spawn = spawns[Math.floor(Math.random() * spawns.length)];
                position = { x: spawn.x, y: 0, z: spawn.z };
            }
        }
    }

    // Fallback to legacy spawn logic if MapManager not available
    if (!position) {
        const arenaEdge = CONFIG.arena.width / 2 - 2;
        const maxAttempts = 10;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const side = Math.floor(Math.random() * 4);
            let testPos = { x: 0, y: 0, z: 0 };

            switch (side) {
                case 0: testPos = { x: (Math.random() - 0.5) * CONFIG.arena.width * 0.8, y: 0, z: -arenaEdge }; break;
                case 1: testPos = { x: (Math.random() - 0.5) * CONFIG.arena.width * 0.8, y: 0, z: arenaEdge }; break;
                case 2: testPos = { x: -arenaEdge, y: 0, z: (Math.random() - 0.5) * CONFIG.arena.depth * 0.8 }; break;
                case 3: testPos = { x: arenaEdge, y: 0, z: (Math.random() - 0.5) * CONFIG.arena.depth * 0.8 }; break;
            }

            const dx = testPos.x - player.position.x;
            const dz = testPos.z - player.position.z;
            const distToPlayer = Math.sqrt(dx * dx + dz * dz);

            if (distToPlayer >= minPlayerDistance) {
                position = testPos;
                break;
            }
        }

        // If still no valid position, use farthest edge from player
        if (!position) {
            const px = player.position.x;
            const pz = player.position.z;
            const arenaEdge = CONFIG.arena.width / 2 - 2;
            if (Math.abs(px) > Math.abs(pz)) {
                position = { x: px > 0 ? -arenaEdge : arenaEdge, y: 0, z: (Math.random() - 0.5) * CONFIG.arena.depth * 0.6 };
            } else {
                position = { x: (Math.random() - 0.5) * CONFIG.arena.width * 0.6, y: 0, z: pz > 0 ? -arenaEdge : arenaEdge };
            }
        }
    }

    // Determine type using wave system
    const zombieType = WaveSystem.getZombieType(GameState.wave);
    const baseProps = WaveSystem.typeProps[zombieType];
    const props = WaveSystem.scaleByWave(baseProps, GameState.wave);

    const zombieData = {
        id: id,
        type: zombieType,
        position: position,
        rotation: 0,
        health: props.health,
        maxHealth: props.health,
        speed: props.speed,
        damage: props.damage,
        scale: baseProps.scale,
        points: baseProps.points,
        isAlive: true,
        lastAttack: 0
    };

    const mesh = createZombieMesh(zombieData);
    const zombieEntry = {
        ...zombieData,
        mesh: mesh,
        walkCycle: Math.random() * Math.PI * 2
    };
    zombies.set(id, zombieEntry);
    invalidateZombieMeshCache();

    // Add to spatial grid for optimized collision detection
    SpatialGrid.insert(zombieEntry);

    GameState.zombiesSpawned++;
    DebugLog.log(`Spawned ${zombieType} zombie at (${position.x.toFixed(1)}, ${position.z.toFixed(1)})`, 'game');
}

// Helper function to damage player (used for explosions, etc.)
function damagePlayer(damage) {
    if (!playerState.isAlive) return;

    // God mode - no damage in singleplayer
    if (DevSettings.godMode && GameState.mode === 'singleplayer') {
        return;
    }

    playerState.health -= damage;
    Achievements.trackDamage(damage);

    // Track damage for statistics and reset kill streak
    GameStats.recordDamageTaken(damage);
    GameStats.resetStreak();

    DebugLog.log(`Took ${damage} damage! (${playerState.health} HP)`, 'warn');
    showDamageEffect();
    updateHUD();

    if (playerState.health <= 0) {
        playerState.health = 0;
        playerState.isAlive = false;
        singlePlayerGameOver();
    }
}

function updateSinglePlayerZombies(delta) {
    if (!GameState.isRunning || GameState.mode !== 'singleplayer') return;

    const now = Date.now();
    const playerPos = player.position;
    const zombieArray = Array.from(zombies.values()).filter(z => z.isAlive);

    zombies.forEach((zombie, id) => {
        if (!zombie.isAlive) return;

        // Calculate direction to player
        const dx = playerPos.x - zombie.position.x;
        const dz = playerPos.z - zombie.position.z;
        const distance = Math.sqrt(dx * dx + dz * dz);

        // Initialize steering state if needed
        if (!zombie.steerState) {
            zombie.steerState = {
                stuckCheckPos: { x: zombie.position.x, z: zombie.position.z }, // Position for 1m stuck check
                stuckCheckTime: now,
                isUnstuckMode: false,
                unstuckStartTime: 0,
                unstuckAngle: 0,
                unstuckPhase: 0, // 0-7 for trying 8 directions
                lastObstacleTime: 0
            };
        }

        // Initialize special ability state
        if (!zombie.abilityState) {
            zombie.abilityState = {
                isLeaping: false,
                leapStartTime: 0,
                leapStartPos: null,
                leapTargetPos: null,
                isCharging: false,
                chargeStartTime: 0,
                chargeDirection: { x: 0, z: 0 },
                lastAbilityUse: 0,
                abilityCooldown: zombie.type === 'runner' ? 4000 : (zombie.type === 'tank' ? 6000 : 3000)
            };
        }

        // ========== BOSS AI ==========
        // Boss zombies use special attack patterns
        if (zombie.isBossWaveBoss && zombie.bossAttackState) {
            updateBossAttacks(zombie, delta);
            // Update boss position for mesh sync
            if (zombie.mesh) {
                zombie.mesh.position.x = zombie.position.x;
                zombie.mesh.position.z = zombie.position.z;
                zombie.mesh.rotation.y = zombie.rotation;
            }
            return; // Boss has its own AI, skip normal zombie behavior
        }

        // Attack range varies by zombie type
        const attackRange = zombie.type === 'spitter' ? 8 : (zombie.type === 'tank' ? 2.5 : 2);

        // ========== SPECIAL ABILITIES ==========
        const canUseAbility = now - zombie.abilityState.lastAbilityUse > zombie.abilityState.abilityCooldown;

        // Runner Leap Attack - leaps toward player when at medium range
        if (zombie.type === 'runner' && zombie.abilityState.isLeaping) {
            const leapDuration = GameCore.Constants.ABILITIES.runner.leap.duration;
            const leapProgress = Math.min(1, (now - zombie.abilityState.leapStartTime) / leapDuration);

            // Parabolic leap trajectory
            const startPos = zombie.abilityState.leapStartPos;
            const targetPos = zombie.abilityState.leapTargetPos;
            const height = 2.5 * Math.sin(leapProgress * Math.PI);

            zombie.position.x = startPos.x + (targetPos.x - startPos.x) * leapProgress;
            zombie.position.z = startPos.z + (targetPos.z - startPos.z) * leapProgress;
            zombie.mesh.position.y = height;

            if (leapProgress >= 1) {
                zombie.abilityState.isLeaping = false;
                zombie.mesh.position.y = 0;
                // Damage player if landed close
                const landDist = Math.sqrt(
                    Math.pow(zombie.position.x - playerPos.x, 2) +
                    Math.pow(zombie.position.z - playerPos.z, 2)
                );
                if (landDist < 2) {
                    damagePlayer(GameCore.ZombieAI.getLeapDamage(zombie.damage));
                    playSound('zombieAttack');
                    screenShake(0.3);
                }
            }
            return; // Skip normal movement while leaping
        }

        // Tank Charge Attack - charges in a straight line
        if (zombie.type === 'tank' && zombie.abilityState.isCharging) {
            const chargeDuration = GameCore.Constants.ABILITIES.tank.charge.duration;
            const chargeProgress = (now - zombie.abilityState.chargeStartTime) / chargeDuration;
            const chargeSpeed = zombie.speed * 4; // Much faster during charge

            if (chargeProgress < 1) {
                const moveX = zombie.abilityState.chargeDirection.x * chargeSpeed * delta;
                const moveZ = zombie.abilityState.chargeDirection.z * chargeSpeed * delta;
                const newX = zombie.position.x + moveX;
                const newZ = zombie.position.z + moveZ;

                // Check for obstacles - stop charge if hit
                if (!isPositionInObstacle(newX, newZ)) {
                    zombie.position.x = newX;
                    zombie.position.z = newZ;
                } else {
                    zombie.abilityState.isCharging = false;
                    screenShake(0.2);
                }

                // Check if hit player during charge
                const chargeDist = Math.sqrt(
                    Math.pow(zombie.position.x - playerPos.x, 2) +
                    Math.pow(zombie.position.z - playerPos.z, 2)
                );
                if (chargeDist < 1.5) {
                    damagePlayer(GameCore.ZombieAI.getChargeDamage(zombie.damage));
                    playSound('zombieAttack');
                    screenShake(0.4);
                    zombie.abilityState.isCharging = false;
                }
            } else {
                zombie.abilityState.isCharging = false;
            }
            return; // Skip normal movement while charging
        }

        // Trigger special abilities
        if (canUseAbility && !zombie.abilityState.isLeaping && !zombie.abilityState.isCharging) {
            // Runner leap - trigger at 4-8 unit range
            if (zombie.type === 'runner' && distance > 4 && distance < 8) {
                zombie.abilityState.isLeaping = true;
                zombie.abilityState.leapStartTime = now;
                zombie.abilityState.lastAbilityUse = now;
                zombie.abilityState.leapStartPos = { x: zombie.position.x, z: zombie.position.z };
                // Predict player position slightly
                zombie.abilityState.leapTargetPos = {
                    x: playerPos.x + (dx / distance) * -1,
                    z: playerPos.z + (dz / distance) * -1
                };
                return;
            }

            // Tank charge - trigger at 6-12 unit range
            if (zombie.type === 'tank' && distance > 6 && distance < 12) {
                zombie.abilityState.isCharging = true;
                zombie.abilityState.chargeStartTime = now;
                zombie.abilityState.lastAbilityUse = now;
                zombie.abilityState.chargeDirection = { x: dx / distance, z: dz / distance };
                return;
            }
        }

        if (distance > attackRange) {
            zombie.isAttacking = false;

            // ========== STUCK DETECTION ==========
            // Check if zombie has moved more than 1m from stuck check position
            const distFromStuckCheck = Math.sqrt(
                Math.pow(zombie.position.x - zombie.steerState.stuckCheckPos.x, 2) +
                Math.pow(zombie.position.z - zombie.steerState.stuckCheckPos.z, 2)
            );

            // Update stuck check every 1 second
            if (now - zombie.steerState.stuckCheckTime > 1000) {
                // If we've moved less than 1m in the last second and we're far from player
                if (distFromStuckCheck < 1.0 && distance > 4.0 && !zombie.steerState.isUnstuckMode) {
                    // Enter unstuck mode
                    zombie.steerState.isUnstuckMode = true;
                    zombie.steerState.unstuckStartTime = now;
                    zombie.steerState.unstuckPhase = 0;
                    // Start with a random direction
                    zombie.steerState.unstuckAngle = Math.random() * Math.PI * 2;
                }

                // Reset stuck check position and time
                zombie.steerState.stuckCheckPos = { x: zombie.position.x, z: zombie.position.z };
                zombie.steerState.stuckCheckTime = now;
            }

            // Exit unstuck mode if we've moved far enough or got close to player
            if (zombie.steerState.isUnstuckMode) {
                if (distFromStuckCheck > 2.0 || distance <= 4.0) {
                    zombie.steerState.isUnstuckMode = false;
                }
                // Timeout after 5 seconds of unstuck attempts
                if (now - zombie.steerState.unstuckStartTime > 5000) {
                    zombie.steerState.isUnstuckMode = false;
                }
            }

            let moveX, moveZ;
            let desiredX = dx / distance;
            let desiredZ = dz / distance;

            // ========== UNSTUCK MODE ==========
            if (zombie.steerState.isUnstuckMode) {
                // Try 8 different directions in sequence, spending 0.5s on each
                const unstuckElapsed = now - zombie.steerState.unstuckStartTime;
                const newPhase = Math.floor(unstuckElapsed / 500) % 8;

                if (newPhase !== zombie.steerState.unstuckPhase) {
                    zombie.steerState.unstuckPhase = newPhase;
                }

                // Calculate direction for current phase (8 directions around the circle)
                const unstuckDir = zombie.steerState.unstuckAngle + (zombie.steerState.unstuckPhase * Math.PI / 4);
                moveX = Math.sin(unstuckDir) * zombie.speed * delta;
                moveZ = Math.cos(unstuckDir) * zombie.speed * delta;

                // Check if this direction is blocked
                const testX = zombie.position.x + Math.sin(unstuckDir) * 0.5;
                const testZ = zombie.position.z + Math.cos(unstuckDir) * 0.5;
                if (isPositionInObstacle(testX, testZ)) {
                    // Skip to next phase immediately
                    zombie.steerState.unstuckPhase = (zombie.steerState.unstuckPhase + 1) % 8;
                }
            }
            // ========== NORMAL STEERING MODE ==========
            else {
                // Spitters try to maintain distance
                if (zombie.type === 'spitter' && distance < 10) {
                    desiredX = -dx / distance;
                    desiredZ = -dz / distance;
                }

                // Check for obstacles ahead using raycasts
                const zombieRadius = 0.5;
                const lookAhead = Math.max(1.5, zombie.speed * 0.3);

                const obstacleAvoidance = calculateObstacleAvoidance(
                    zombie.position.x, zombie.position.z,
                    desiredX, desiredZ,
                    lookAhead, zombieRadius
                );

                // Blend desired direction with avoidance
                moveX = desiredX;
                moveZ = desiredZ;

                if (obstacleAvoidance.blocked) {
                    moveX = obstacleAvoidance.avoidX;
                    moveZ = obstacleAvoidance.avoidZ;
                    zombie.steerState.lastObstacleTime = now;
                }

                // Normalize and apply speed
                const moveMag = Math.sqrt(moveX * moveX + moveZ * moveZ);
                if (moveMag > 0) {
                    moveX = (moveX / moveMag) * zombie.speed * delta;
                    moveZ = (moveZ / moveMag) * zombie.speed * delta;
                }

                // Add zombie separation
                const separation = calculateZombieSeparation(zombie, zombieArray);
                moveX += separation.x * delta * 0.5;
                moveZ += separation.z * delta * 0.5;
            }

            // ========== APPLY MOVEMENT ==========
            const newX = zombie.position.x + moveX;
            const newZ = zombie.position.z + moveZ;

            if (!isPositionInObstacle(newX, newZ)) {
                zombie.position.x = newX;
                zombie.position.z = newZ;
            } else {
                // Wall sliding - try X and Z separately
                if (!isPositionInObstacle(newX, zombie.position.z)) {
                    zombie.position.x = newX;
                } else if (!isPositionInObstacle(zombie.position.x, newZ)) {
                    zombie.position.z = newZ;
                }
            }

            // Face movement direction (smoother turning)
            const faceDir = zombie.steerState.isUnstuckMode ?
                { x: moveX, z: moveZ } : { x: desiredX, z: desiredZ };
            const targetRot = Math.atan2(faceDir.x, faceDir.z);
            const rotDiff = targetRot - zombie.rotation;
            const normalizedDiff = Math.atan2(Math.sin(rotDiff), Math.cos(rotDiff));
            zombie.rotation += normalizedDiff * Math.min(1, 8 * delta);
        } else {
            // Attack player
            zombie.rotation = Math.atan2(dx, dz);
            const attackCooldown = zombie.type === 'spitter' ? 2000 : 1000;

            if (now - zombie.lastAttack > attackCooldown) {
                zombie.lastAttack = now;
                zombie.isAttacking = true;
                zombie.attackStartTime = now;

                // Spitters launch projectile instead of melee
                if (zombie.type === 'spitter') {
                    spawnSpitterProjectile(zombie);
                } else {
                    damagePlayer(zombie.damage);
                    playSound('zombieAttack');
                }
            }
        }
    });
}

// Modern steering-based obstacle avoidance using raycasts
function calculateObstacleAvoidance(x, z, dirX, dirZ, lookAhead, radius) {
    const result = { blocked: false, avoidX: dirX, avoidZ: dirZ };

    // Cast multiple rays to detect obstacles
    const angles = [0, -0.4, 0.4, -0.8, 0.8]; // Forward and sides
    let nearestHit = Infinity;
    let hitObstacle = null;
    let hitAngle = 0;

    for (const angleOffset of angles) {
        // Rotate direction by angle offset
        const cos = Math.cos(angleOffset);
        const sin = Math.sin(angleOffset);
        const rayDirX = dirX * cos - dirZ * sin;
        const rayDirZ = dirX * sin + dirZ * cos;

        // Check ray against obstacles
        const checkDist = angleOffset === 0 ? lookAhead : lookAhead * 0.7;
        for (let d = 0.3; d <= checkDist; d += 0.3) {
            const checkX = x + rayDirX * d;
            const checkZ = z + rayDirZ * d;

            for (const obs of obstacles) {
                const buffer = radius;
                if (checkX > obs.minX - buffer && checkX < obs.maxX + buffer &&
                    checkZ > obs.minZ - buffer && checkZ < obs.maxZ + buffer) {
                    if (d < nearestHit) {
                        nearestHit = d;
                        hitObstacle = obs;
                        hitAngle = angleOffset;
                        result.blocked = true;
                    }
                    break;
                }
            }
        }
    }

    if (result.blocked && hitObstacle) {
        // Calculate avoidance direction - steer away from obstacle
        const obsCenterX = (hitObstacle.minX + hitObstacle.maxX) / 2;
        const obsCenterZ = (hitObstacle.minZ + hitObstacle.maxZ) / 2;

        // Vector from obstacle to zombie
        const awayX = x - obsCenterX;
        const awayZ = z - obsCenterZ;
        const awayDist = Math.sqrt(awayX * awayX + awayZ * awayZ);

        if (awayDist > 0.01) {
            // Blend: steer perpendicular to desired direction, away from obstacle
            // Choose left or right based on which side of obstacle we're on
            const perpX = -dirZ;
            const perpZ = dirX;

            // Dot product to see which side
            const dot = perpX * awayX + perpZ * awayZ;
            const steerSign = dot > 0 ? 1 : -1;

            // Stronger avoidance when closer
            const avoidStrength = Math.max(0.3, 1 - nearestHit / lookAhead);

            // Blend desired direction with perpendicular avoidance
            result.avoidX = dirX * (1 - avoidStrength) + perpX * steerSign * avoidStrength;
            result.avoidZ = dirZ * (1 - avoidStrength) + perpZ * steerSign * avoidStrength;

            // Normalize
            const mag = Math.sqrt(result.avoidX * result.avoidX + result.avoidZ * result.avoidZ);
            if (mag > 0) {
                result.avoidX /= mag;
                result.avoidZ /= mag;
            }
        }
    }

    return result;
}

// Calculate separation force to prevent zombie clumping
function calculateZombieSeparation(zombie, allZombies) {
    const separation = { x: 0, z: 0 };
    const separationRadius = 1.5;
    const separationStrength = 2; // Reduced for smoother movement

    for (const other of allZombies) {
        if (other === zombie || !other.isAlive) continue;

        const dx = zombie.position.x - other.position.x;
        const dz = zombie.position.z - other.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < separationRadius && dist > 0.01) {
            const force = separationStrength * (1 - dist / separationRadius);
            separation.x += (dx / dist) * force;
            separation.z += (dz / dist) * force;
        }
    }

    return separation;
}

// Enhanced obstacle avoidance with lookahead
function calculateEnhancedAvoidance(x, z, moveX, moveZ, speed) {
    const avoidance = { x: 0, z: 0 };
    const lookaheadDist = Math.max(2, speed * 0.5);
    const avoidStrength = 0.3;

    // Check multiple points ahead
    const steps = 3;
    for (let i = 1; i <= steps; i++) {
        const checkDist = (lookaheadDist / steps) * i;
        const checkX = x + (moveX / Math.max(0.001, Math.sqrt(moveX * moveX + moveZ * moveZ))) * checkDist;
        const checkZ = z + (moveZ / Math.max(0.001, Math.sqrt(moveX * moveX + moveZ * moveZ))) * checkDist;

        for (const obs of obstacles) {
            const buffer = 0.6;
            if (checkX > obs.minX - buffer && checkX < obs.maxX + buffer &&
                checkZ > obs.minZ - buffer && checkZ < obs.maxZ + buffer) {

                // Calculate push direction perpendicular to movement
                const toCenterX = obs.centerX - x;
                const toCenterZ = obs.centerZ - z;
                const distToCenter = Math.sqrt(toCenterX * toCenterX + toCenterZ * toCenterZ);

                if (distToCenter > 0.1) {
                    const pushFactor = avoidStrength * (1 - (i - 1) / steps);
                    avoidance.x -= (toCenterX / distToCenter) * pushFactor;
                    avoidance.z -= (toCenterZ / distToCenter) * pushFactor;
                }
            }
        }
    }

    return avoidance;
}

// Calculate movement when zombie is stuck
function calculateUnstuckMovement(zombie, playerPos) {
    const angle = zombie.pathState.wanderAngle;
    const dx = playerPos.x - zombie.position.x;
    const dz = playerPos.z - zombie.position.z;
    const toPlayerAngle = Math.atan2(dx, dz);

    // Try moving perpendicular to player direction
    const perpAngle = toPlayerAngle + (Math.PI / 2) * zombie.pathState.flankDirection;

    return {
        x: Math.sin(perpAngle),
        z: Math.cos(perpAngle)
    };
}

// Wall sliding for smooth movement along obstacles
function calculateWallSlide(x, z, moveX, moveZ) {
    const result = { x: 0, z: 0 };

    // Try X movement only
    if (!isPositionInObstacle(x + moveX, z)) {
        result.x = moveX;
    }
    // Try Z movement only
    if (!isPositionInObstacle(x + result.x, z + moveZ)) {
        result.z = moveZ;
    }

    return result;
}

// Spitter zombie ranged attack
function spawnSpitterProjectile(zombie) {
    const projectileGroup = new THREE.Group();

    // Acid ball
    const ballGeo = new THREE.SphereGeometry(0.15, 8, 8);
    const ballMat = new THREE.MeshBasicMaterial({
        color: 0x00ff00,
        transparent: true,
        opacity: 0.8
    });
    const ball = new THREE.Mesh(ballGeo, ballMat);
    projectileGroup.add(ball);

    // Glow effect
    const glowGeo = new THREE.SphereGeometry(0.25, 8, 8);
    const glowMat = new THREE.MeshBasicMaterial({
        color: 0x00ff00,
        transparent: true,
        opacity: 0.3
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    projectileGroup.add(glow);

    projectileGroup.position.set(zombie.position.x, 1.5, zombie.position.z);
    scene.add(projectileGroup);

    // Direction to player
    const dx = player.position.x - zombie.position.x;
    const dy = player.position.y + 1 - 1.5;
    const dz = player.position.z - zombie.position.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    projectiles.push({
        mesh: projectileGroup,
        velocity: new THREE.Vector3(dx / dist * 12, dy / dist * 12, dz / dist * 12),
        damage: zombie.damage,
        splashDamage: 0,
        splashRadius: 0,
        type: 'spitter',
        createdAt: Date.now(),
        owner: 'enemy'
    });

    playSound('shoot');
}

// Spawn acid pool at location
function spawnAcidPool(x, z) {
    const poolGroup = new THREE.Group();

    // Main pool - flat cylinder
    const poolGeo = new THREE.CylinderGeometry(1.5, 1.5, 0.05, 16);
    const poolMat = new THREE.MeshBasicMaterial({
        color: 0x00ff00,
        transparent: true,
        opacity: 0.6
    });
    const pool = new THREE.Mesh(poolGeo, poolMat);
    pool.position.y = 0.03;
    poolGroup.add(pool);

    // Bubbling effect - smaller spheres
    for (let i = 0; i < 5; i++) {
        const bubbleGeo = new THREE.SphereGeometry(0.1, 6, 6);
        const bubbleMat = new THREE.MeshBasicMaterial({
            color: 0x44ff44,
            transparent: true,
            opacity: 0.7
        });
        const bubble = new THREE.Mesh(bubbleGeo, bubbleMat);
        bubble.position.set(
            (Math.random() - 0.5) * 2,
            0.1,
            (Math.random() - 0.5) * 2
        );
        bubble.userData.originalY = 0.1;
        bubble.userData.bobOffset = Math.random() * Math.PI * 2;
        poolGroup.add(bubble);
    }

    // Glow underneath
    const glowGeo = new THREE.CircleGeometry(1.8, 16);
    const glowMat = new THREE.MeshBasicMaterial({
        color: 0x00ff00,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.01;
    poolGroup.add(glow);

    poolGroup.position.set(x, 0, z);
    scene.add(poolGroup);

    acidPools.push({
        mesh: poolGroup,
        position: { x, z },
        radius: 1.5,
        damage: 5, // Damage per tick
        damageInterval: 500, // ms between damage ticks
        lastDamageTime: 0,
        createdAt: Date.now(),
        duration: 6000 // Pool lasts 6 seconds
    });
}

// Update acid pools
function updateAcidPools(deltaTime) {
    const now = Date.now();

    for (let i = acidPools.length - 1; i >= 0; i--) {
        const pool = acidPools[i];

        // Check if expired
        if (now - pool.createdAt > pool.duration) {
            // Fade out effect
            pool.mesh.children.forEach(child => {
                if (child.material) {
                    child.material.opacity *= 0.9;
                }
            });

            if (pool.mesh.children[0]?.material?.opacity < 0.1) {
                scene.remove(pool.mesh);
                acidPools.splice(i, 1);
                continue;
            }
        }

        // Animate bubbles
        pool.mesh.children.forEach(child => {
            if (child.userData.originalY !== undefined) {
                child.userData.bobOffset += deltaTime * 5;
                child.position.y = child.userData.originalY + Math.sin(child.userData.bobOffset) * 0.1;
            }
        });

        // Check if player is standing in pool
        const playerDist = Math.sqrt(
            Math.pow(player.position.x - pool.position.x, 2) +
            Math.pow(player.position.z - pool.position.z, 2)
        );

        if (playerDist < pool.radius && playerState.isAlive) {
            // Damage player periodically
            if (now - pool.lastDamageTime > pool.damageInterval) {
                damagePlayer(pool.damage);
                pool.lastDamageTime = now;

                // Visual feedback - green flash
                const overlay = document.getElementById('damage-overlay');
                if (overlay) {
                    overlay.style.background = 'radial-gradient(circle, rgba(0,255,0,0.3) 0%, transparent 70%)';
                    overlay.style.opacity = '1';
                    setTimeout(() => {
                        overlay.style.opacity = '0';
                        overlay.style.background = '';
                    }, 100);
                }
            }
        }
    }
}

// Calculate steering force to avoid obstacles
function calculateObstacleAvoidance(x, z, moveX, moveZ) {
    const avoidance = { x: 0, z: 0 };
    const detectionRadius = 3; // How far ahead to look
    const avoidStrength = 0.15;

    obstacles.forEach(obs => {
        const toCenterX = obs.centerX - x;
        const toCenterZ = obs.centerZ - z;
        const distToCenter = Math.sqrt(toCenterX * toCenterX + toCenterZ * toCenterZ);

        // Check if obstacle is nearby
        if (distToCenter < obs.radius + detectionRadius) {
            // Calculate avoidance force (push away from obstacle center)
            const pushStrength = avoidStrength * (1 - distToCenter / (obs.radius + detectionRadius));
            if (distToCenter > 0.1) {
                avoidance.x -= (toCenterX / distToCenter) * pushStrength;
                avoidance.z -= (toCenterZ / distToCenter) * pushStrength;
            }
        }
    });

    return avoidance;
}

// Check if a position is inside an obstacle
function isPositionInObstacle(x, z) {
    const buffer = 0.4; // Zombie radius
    for (const obs of obstacles) {
        if (x > obs.minX - buffer && x < obs.maxX + buffer &&
            z > obs.minZ - buffer && z < obs.maxZ + buffer) {
            return true;
        }
    }
    return false;
}

// ==================== ENTITY COLLISION SYSTEM ====================
const EntityCollision = {
    // Collision radii for different entity types
    radii: {
        zombie: { normal: 0.5, runner: 0.4, tank: 0.7, boss: 1.0, crawler: 0.6, exploder: 0.5, spitter: 0.45 },
        player: 0.4
    },

    // Resolve all zombie-zombie collisions
    resolveZombieCollisions() {
        const zombieArray = Array.from(zombies.values()).filter(z => z.isAlive);
        const pushStrength = 0.5;

        for (let i = 0; i < zombieArray.length; i++) {
            const z1 = zombieArray[i];
            const r1 = this.radii.zombie[z1.type] || 0.5;

            for (let j = i + 1; j < zombieArray.length; j++) {
                const z2 = zombieArray[j];
                const r2 = this.radii.zombie[z2.type] || 0.5;

                const dx = z2.position.x - z1.position.x;
                const dz = z2.position.z - z1.position.z;
                const distSq = dx * dx + dz * dz;
                const minDist = r1 + r2;

                if (distSq < minDist * minDist && distSq > 0.001) {
                    const dist = Math.sqrt(distSq);
                    const overlap = minDist - dist;

                    // Normalize direction
                    const nx = dx / dist;
                    const nz = dz / dist;

                    // Push both zombies apart (weighted by size - bigger zombies move less)
                    const totalMass = r1 + r2;
                    const push1 = (r2 / totalMass) * overlap * pushStrength;
                    const push2 = (r1 / totalMass) * overlap * pushStrength;

                    z1.position.x -= nx * push1;
                    z1.position.z -= nz * push1;
                    z2.position.x += nx * push2;
                    z2.position.z += nz * push2;
                }
            }
        }
    },

    // Resolve zombie-obstacle collisions
    resolveZombieObstacleCollisions() {
        zombies.forEach(zombie => {
            if (!zombie.isAlive) return;

            const r = this.radii.zombie[zombie.type] || 0.5;
            let x = zombie.position.x;
            let z = zombie.position.z;

            for (const obs of obstacles) {
                // Find closest point on obstacle AABB to zombie center
                const closestX = Math.max(obs.minX, Math.min(x, obs.maxX));
                const closestZ = Math.max(obs.minZ, Math.min(z, obs.maxZ));

                const dx = x - closestX;
                const dz = z - closestZ;
                const distSq = dx * dx + dz * dz;

                if (distSq < r * r && distSq > 0.0001) {
                    // Collision - push zombie out
                    const dist = Math.sqrt(distSq);
                    const overlap = r - dist;
                    const nx = dx / dist;
                    const nz = dz / dist;

                    zombie.position.x += nx * overlap * 1.1;
                    zombie.position.z += nz * overlap * 1.1;
                    x = zombie.position.x;
                    z = zombie.position.z;
                } else if (distSq === 0) {
                    // Zombie center is inside obstacle - push to nearest edge
                    const pushLeft = x - obs.minX;
                    const pushRight = obs.maxX - x;
                    const pushUp = z - obs.minZ;
                    const pushDown = obs.maxZ - z;

                    const minPush = Math.min(pushLeft, pushRight, pushUp, pushDown);
                    if (minPush === pushLeft) zombie.position.x = obs.minX - r;
                    else if (minPush === pushRight) zombie.position.x = obs.maxX + r;
                    else if (minPush === pushUp) zombie.position.z = obs.minZ - r;
                    else zombie.position.z = obs.maxZ + r;
                }
            }

            // Keep inside arena bounds
            const boundary = CONFIG.arena.width / 2 - r - CONFIG.arena.wallThickness;
            zombie.position.x = Math.max(-boundary, Math.min(boundary, zombie.position.x));
            zombie.position.z = Math.max(-boundary, Math.min(boundary, zombie.position.z));
        });
    },

    // Sync zombie mesh positions after collision resolution
    syncZombieMeshes() {
        zombies.forEach(zombie => {
            if (zombie.mesh && zombie.isAlive) {
                zombie.mesh.position.x = zombie.position.x;
                zombie.mesh.position.z = zombie.position.z;
            }
        });
    },

    // Run all collision resolutions
    update() {
        this.resolveZombieCollisions();
        this.resolveZombieObstacleCollisions();
        this.syncZombieMeshes();
    }
};

function damageSinglePlayerZombie(zombieId, damage, isHeadshot) {
    const zombie = zombies.get(zombieId);
    if (!zombie || !zombie.isAlive) return false;

    zombie.health -= damage;

    // Show floating damage number
    DamageNumbers.show(
        zombie.position,
        damage,
        isHeadshot,
        damage >= 50 // Critical for high damage
    );

    // Update boss health bar if this is a boss
    if (zombie.isBossWaveBoss) {
        updateBossHealthBar(zombie);
    }

    if (zombie.health <= 0) {
        killSinglePlayerZombie(zombieId, isHeadshot);
        return true;
    }
    return false;
}

function killSinglePlayerZombie(zombieId, isHeadshot) {
    const zombie = zombies.get(zombieId);
    if (!zombie) return;

    zombie.isAlive = false;
    invalidateZombieMeshCache();

    // Minions don't count toward wave completion
    if (!zombie.isMinion) {
        GameState.zombiesRemaining--;
    }

    // Score - use zombie's points value with headshot bonus
    const basePoints = zombie.points || 100;
    const points = basePoints + (isHeadshot ? Math.floor(basePoints * 0.5) : 0);
    playerState.kills++;
    playerState.score += points;
    GameState.totalKills++;
    GameState.totalScore += points;
    registerKill(); // Track kill streak

    // Track achievement progress
    Achievements.trackKill(isHeadshot, zombie.isBossWaveBoss);
    Achievements.trackScore(playerState.score);

    // Add to kill feed
    KillFeed.addKill(zombie.type, isHeadshot, zombie.isBossWaveBoss, points);

    // Track kill for statistics
    const currentWeapon = getWeaponStats().name;
    GameStats.recordKill(currentWeapon);

    DebugLog.log(`${zombie.type} killed!${isHeadshot ? ' HEADSHOT!' : ''} +${points} points`, 'success');

    // Blood splatter
    createBloodSplatter(new THREE.Vector3(zombie.position.x, 1, zombie.position.z));

    // Special behavior for exploder zombies
    if (zombie.type === 'exploder') {
        createExplosion(zombie.position);
    }

    // Boss death - hide health bar and stop minion spawning
    if (zombie.isBossWaveBoss) {
        hideBossHealthBar();
        // Kill all minions when boss dies
        zombies.forEach((z, id) => {
            if (z.isMinion && z.isAlive) {
                z.isAlive = false;
                animateZombieDeath(z);
            }
        });
        invalidateZombieMeshCache();
    }

    // Death animation
    animateZombieDeath(zombie);

    // Chance to drop pickup (higher for special types)
    let dropChance = 0.3;
    if (zombie.isBossWaveBoss) {
        dropChance = 1.0;
        // Boss drops multiple pickups
        for (let i = 0; i < 3; i++) {
            const offsetPos = {
                x: zombie.position.x + (Math.random() - 0.5) * 3,
                y: 0,
                z: zombie.position.z + (Math.random() - 0.5) * 3
            };
            spawnSinglePlayerPickup(offsetPos);
        }
        dropChance = 0; // Already dropped
    } else if (zombie.type === 'tank') {
        dropChance = 0.5;
    }

    if (Math.random() < dropChance) {
        spawnSinglePlayerPickup(zombie.position);
    }

    updateHUD();

    // Check wave completion
    const isBossWave = WaveSystem.isBossWave(GameState.wave);
    const expectedZombies = WaveSystem.getZombieCount(GameState.wave);

    // For boss waves, only complete when boss is dead (zombiesRemaining <= 0)
    // For normal waves, check spawned count
    const waveComplete = isBossWave
        ? (zombie.isBossWaveBoss && GameState.zombiesRemaining <= 0)
        : (GameState.zombiesRemaining <= 0 && GameState.zombiesSpawned >= expectedZombies);

    if (waveComplete) {
        setTimeout(() => {
            if (GameState.isRunning) {
                // Deactivate boss mode when boss wave completes
                if (isBossWave && typeof MapManager !== 'undefined') {
                    MapManager.deactivateBossMode();
                }

                const waveBonus = isBossWave
                    ? 2000 + GameState.wave * 200 // Bigger bonus for boss waves
                    : 500 + GameState.wave * 100;
                const completedWave = GameState.wave;
                GameState.wave++;
                GameState.totalScore += waveBonus;
                playerState.score += waveBonus;
                Achievements.trackWave(GameState.wave);
                Achievements.trackScore(playerState.score);
                DebugLog.log(`Wave ${completedWave} complete! +${waveBonus} bonus`, 'success');
                updateHUD();

                // Show wave complete announcement
                showWaveCompleteAnnouncement(completedWave, waveBonus, isBossWave);

                // Show upgrade shop after announcement
                setTimeout(() => {
                    if (GameState.isRunning) {
                        WeaponUpgrades.showShop();
                    }
                }, 1600);
            }
        }, 1000);
    }
}

// Create explosion effect for exploder zombie death
function createExplosion(position) {
    const explosionPos = new THREE.Vector3(position.x, 1, position.z);

    // Check if player is in explosion radius - use GameCore
    const playerDist = player.position.distanceTo(explosionPos);
    const explosionRadius = GameCore.Combat.getExplosionRadius();
    if (playerDist < explosionRadius) {
        const damage = GameCore.Combat.calculateExploderDamage(playerDist);
        damagePlayer(damage);
        DebugLog.log(`Caught in explosion! -${damage} HP`, 'warn');
    }

    // Visual explosion effect
    const explosionGeo = new THREE.SphereGeometry(0.5, 16, 16);
    const explosionMat = new THREE.MeshBasicMaterial({
        color: 0xff6600,
        transparent: true,
        opacity: 1
    });
    const explosion = new THREE.Mesh(explosionGeo, explosionMat);
    explosion.position.copy(explosionPos);
    scene.add(explosion);

    // Explosion particles
    for (let i = 0; i < 20; i++) {
        spawnDebris(explosionPos, 1);
    }
    for (let i = 0; i < 15; i++) {
        spawnBloodParticles(explosionPos, 1);
    }

    // Animate explosion
    const startTime = Date.now();
    function animateExplosion() {
        const elapsed = Date.now() - startTime;
        const progress = elapsed / 500;

        if (progress < 1) {
            explosion.scale.setScalar(1 + progress * 8);
            explosionMat.opacity = 1 - progress;
            requestAnimationFrame(animateExplosion);
        } else {
            scene.remove(explosion);
            explosionGeo.dispose();
            explosionMat.dispose();
        }
    }
    animateExplosion();

    // Explosion sound
    playSound('zombieAttack');
}

function spawnSinglePlayerPickup(position) {
    const id = `pickup_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    // 40% health, 40% ammo, 20% grenade
    const roll = Math.random();
    const type = roll < 0.4 ? 'health' : (roll < 0.8 ? 'ammo' : 'grenade');

    const pickupData = {
        id: id,
        type: type,
        position: { x: position.x, y: 0.5, z: position.z }
    };

    const mesh = createPickupMesh(pickupData);
    pickups.set(id, {
        ...pickupData,
        mesh: mesh,
        rotationSpeed: 2 + Math.random(),
        bobOffset: Math.random() * Math.PI * 2
    });

    // Auto-remove after 30 seconds
    setTimeout(() => {
        const pickup = pickups.get(id);
        if (pickup) {
            scene.remove(pickup.mesh);
            pickups.delete(id);
        }
    }, 30000);
}

function collectSinglePlayerPickup(pickupId) {
    const pickup = pickups.get(pickupId);
    if (!pickup) return;

    scene.remove(pickup.mesh);
    pickups.delete(pickupId);

    if (pickup.type === 'health') {
        playerState.health = Math.min(playerState.health + 25, CONFIG.player.maxHealth);
        DebugLog.log('Collected health! +25 HP', 'success');
    } else if (pickup.type === 'ammo') {
        weapon.reserveAmmo = Math.min(weapon.reserveAmmo + 15, 180);
        DebugLog.log('Collected ammo! +15', 'success');
    } else if (pickup.type === 'grenade') {
        weapon.grenades = Math.min(weapon.grenades + 2, 10);
        DebugLog.log('Collected grenades! +2', 'success');
    }

    playSound('pickup');
    updateHUD();

    if (nearbyPickup === pickupId) {
        nearbyPickup = null;
        updateInteractPrompt();
    }
}

async function singlePlayerGameOver() {
    GameState.isRunning = false;
    GameState.isGameOver = true;

    if (GameState.spawnTimer) {
        clearInterval(GameState.spawnTimer);
        GameState.spawnTimer = null;
    }

    DebugLog.log('Game Over!', 'error');

    // Display score
    const finalScore = document.getElementById('final-score');
    if (finalScore) finalScore.textContent = `Score: ${playerState.score.toLocaleString()}`;

    // Update statistics dashboard
    const statAccuracy = document.getElementById('stat-accuracy');
    const statKills = document.getElementById('stat-kills');
    const statHeadshots = document.getElementById('stat-headshots');
    const statWave = document.getElementById('stat-wave');
    const statDamage = document.getElementById('stat-damage');
    const statTime = document.getElementById('stat-time');
    const statFavoriteWeapon = document.getElementById('stat-favorite-weapon');
    const statBestStreak = document.getElementById('stat-best-streak');
    if (statAccuracy) statAccuracy.textContent = `${GameStats.getAccuracy()}%`;
    if (statKills) statKills.textContent = playerState.kills;
    if (statHeadshots) statHeadshots.textContent = GameStats.headshots;
    if (statWave) statWave.textContent = GameState.wave;
    if (statDamage) statDamage.textContent = GameStats.damageDealt.toLocaleString();
    if (statTime) statTime.textContent = GameStats.getSurvivalTime();
    if (statFavoriteWeapon) statFavoriteWeapon.textContent = GameStats.getFavoriteWeapon();
    if (statBestStreak) statBestStreak.textContent = GameStats.bestKillStreak;

    // Submit score to leaderboard (not in dev mode)
    const rankResult = document.getElementById('rank-result');
    let result = { added: false, rank: -1 };

    if (DevSettings.godMode || DevSettings.infiniteAmmo) {
        const cheats = [];
        if (DevSettings.godMode) cheats.push('GOD MODE');
        if (DevSettings.infiniteAmmo) cheats.push('INFINITE AMMO');
        if (rankResult) rankResult.innerHTML = `<span style="color: #ff6600;">${cheats.join(' + ')} - Score not recorded</span>`;
        await fetchLeaderboard(); // Just refresh leaderboard
    } else {
        const playerName = getPlayerName();
        result = await submitScore(playerName);  // Score tracked server-side

        // Display rank result
        if (rankResult) {
            if (result.added && result.rank > 0) {
                rankResult.innerHTML = `<span class="new-highscore">NEW HIGH SCORE! #${result.rank}</span>`;
            } else if (cachedLeaderboard.length >= 10) {
                // Only show 'points away' if score is below minimum required
                const minScore = cachedLeaderboard[cachedLeaderboard.length - 1].score;
                if (playerState.score < minScore) {
                    const diff = minScore - playerState.score;
                    rankResult.textContent = `${diff.toLocaleString()} points away from Top 10`;
                } else {
                    // Score should have qualified - check for submission error
                    rankResult.textContent = 'Score submission error - try again';
                }
            } else {
                rankResult.textContent = '';
            }
        }
    }

    // Render leaderboard with highlight
    renderLeaderboard('gameover-leaderboard-content', result.rank);

    setElementDisplay('game-over-screen', 'flex');
    document.exitPointerLock();
    hideMobileControls();
}

function showGodModeIndicator() {
    showDevIndicators();
}

function showDevIndicators() {
    let indicator = document.getElementById('dev-mode-indicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'dev-mode-indicator';
        indicator.style.cssText = `
            position: fixed;
            top: 10px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(255, 100, 0, 0.8);
            color: #fff;
            padding: 5px 15px;
            border-radius: 5px;
            font-family: 'Creepster', sans-serif;
            font-size: 14px;
            z-index: 1000;
            pointer-events: none;
        `;
        document.body.appendChild(indicator);
    }

    const modes = [];
    if (DevSettings.godMode) modes.push('GOD MODE');
    if (DevSettings.infiniteAmmo) modes.push('INFINITE AMMO');

    if (modes.length > 0) {
        indicator.textContent = modes.join(' | ');
        indicator.style.display = 'block';
    } else {
        indicator.style.display = 'none';
    }
}

function showDamageEffect() {
    const overlay = document.getElementById('damage-overlay');
    overlay.style.opacity = '0.5';
    setTimeout(() => {
        overlay.style.opacity = '0';
    }, 200);
}

// ==================== EVENT LISTENERS ====================
function initEventListeners() {
    // Single Player button
    // Show name popup before starting game
    function showNamePopup(mode) {
        const popup = document.getElementById('name-popup');
        const input = document.getElementById('name-popup-input');
        const savedName = localStorage.getItem('playerName') || '';

        if (popup && input) {
            input.value = savedName;
            popup.style.display = 'flex';
            popup.dataset.mode = mode;
            setTimeout(() => input.focus(), 100);
        }
    }

    function hideNamePopup() {
        const popup = document.getElementById('name-popup');
        if (popup) popup.style.display = 'none';
    }

    function confirmNameAndStart() {
        const popup = document.getElementById('name-popup');
        const input = document.getElementById('name-popup-input');
        const nameInput = document.getElementById('player-name-input');

        if (!popup || !input) return;

        const name = sanitizePlayerName(input.value.trim()) || 'Player';

        // Save to localStorage and sync to hidden input
        localStorage.setItem('playerName', name);
        if (nameInput) nameInput.value = name;

        const mode = popup.dataset.mode;
        hideNamePopup();

        if (mode === 'singleplayer') {
            GameState.mode = 'singleplayer';
            startSinglePlayerGame();
        } else if (mode === 'multiplayer') {
            GameState.mode = 'multiplayer';
            setElementDisplay('start-screen', 'none');
            setElementDisplay('lobby-screen', 'flex');
            connectToServer();
        }
    }

    document.getElementById('singleplayer-button')?.addEventListener('click', () => {
        showNamePopup('singleplayer');
    });

    // Multiplayer button - go to lobby
    document.getElementById('multiplayer-button')?.addEventListener('click', () => {
        showNamePopup('multiplayer');
    });

    // Name popup confirm button
    document.getElementById('name-popup-confirm')?.addEventListener('click', confirmNameAndStart);

    // Name popup cancel button
    document.getElementById('name-popup-cancel')?.addEventListener('click', hideNamePopup);

    // Name popup - press Enter to confirm
    document.getElementById('name-popup-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            confirmNameAndStart();
        } else if (e.key === 'Escape') {
            hideNamePopup();
        }
    });

    // Close name popup when clicking overlay
    document.querySelector('.name-popup-overlay')?.addEventListener('click', hideNamePopup);

    // Ready button in lobby
    document.getElementById('ready-button')?.addEventListener('click', () => {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            DebugLog.log('Cannot ready: not connected to server', 'error');
            return;
        }

        GameState.isReady = !GameState.isReady;
        const btn = document.getElementById('ready-button');
        if (GameState.isReady) {
            btn.textContent = 'READY!';
            btn.classList.add('ready');
        } else {
            btn.textContent = 'READY';
            btn.classList.remove('ready');
        }
        sendToServer({ type: 'ready', isReady: GameState.isReady });
    });

    // Leave lobby button
    document.getElementById('leave-lobby-button')?.addEventListener('click', () => {
        leaveLobby();
    });

    // Restart button
    document.getElementById('restart-button')?.addEventListener('click', () => {
        if (GameState.mode === 'singleplayer') {
            resetSinglePlayerGame();
            startSinglePlayerGame();
        } else {
            sendToServer({ type: 'requestReset' });
        }
        setElementDisplay('game-over-screen', 'none');
    });

    document.getElementById('resume-button')?.addEventListener('click', () => {
        togglePause();
        document.body.requestPointerLock();
    });

    document.getElementById('quit-button')?.addEventListener('click', () => {
        quitToMenu();
    });

    // Settings button in pause menu
    document.getElementById('pause-settings-button')?.addEventListener('click', () => {
        // Hide pause screen, show settings
        setElementDisplay('pause-screen', 'none');
        setElementDisplay('settings-screen', 'flex');
        updateSettingsUI();
        // Track that we came from pause menu
        window._settingsFromPause = true;
    });

    // Leaderboard toggle on main menu
    document.getElementById('menu-leaderboard-toggle')?.addEventListener('click', async () => {
        const leaderboard = document.getElementById('menu-leaderboard');
        const controls = document.getElementById('controls-info');
        const toggle = document.getElementById('menu-leaderboard-toggle');

        if (!leaderboard || !toggle) return;

        if (leaderboard.style.display === 'none') {
            await fetchLeaderboard();
            renderLeaderboard('menu-leaderboard-content');
            leaderboard.style.display = 'block';
            toggle.textContent = 'HIDE LEADERBOARD';
        } else {
            leaderboard.style.display = 'none';
            toggle.textContent = 'VIEW LEADERBOARD';
        }
    });

    // Close leaderboard when clicking outside of it
    document.addEventListener('click', (e) => {
        const leaderboard = document.getElementById('menu-leaderboard');
        const toggle = document.getElementById('menu-leaderboard-toggle');
        const controls = document.getElementById('controls-info');

        if (!leaderboard || leaderboard.style.display === 'none') return;

        // Check if click is outside the leaderboard and not on the toggle button
        if (!leaderboard.contains(e.target) && e.target !== toggle) {
            leaderboard.style.display = 'none';
            if (toggle) toggle.textContent = 'VIEW LEADERBOARD';
        }
    });

    // Main menu button on game over screen
    document.getElementById('menu-button')?.addEventListener('click', () => {
        setElementDisplay('game-over-screen', 'none');
        quitToMenu();
    });

    // Share buttons on game over screen
    function getShareText() {
        const score = GameState.totalScore || 0;
        const wave = GameState.wave || 1;
        const kills = GameState.totalKills || 0;
        return `I survived ${wave} waves and scored ${score.toLocaleString()} points with ${kills} zombie kills in Aspen's Playground! Can you beat my score? 🧟`;
    }

    function getShareUrl() {
        return 'https://aspensplayground.com';
    }

    const shareTwitterBtn = document.getElementById('share-twitter');
    if (shareTwitterBtn) {
        shareTwitterBtn.addEventListener('click', () => {
            const text = encodeURIComponent(getShareText());
            const url = encodeURIComponent(getShareUrl());
            window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank', 'width=550,height=420');
        });
    }

    const shareRedditBtn = document.getElementById('share-reddit');
    if (shareRedditBtn) {
        shareRedditBtn.addEventListener('click', () => {
            const title = encodeURIComponent(`I scored ${GameState.totalScore.toLocaleString()} points in Aspen's Playground!`);
            const url = encodeURIComponent(getShareUrl());
            window.open(`https://reddit.com/submit?title=${title}&url=${url}`, '_blank', 'width=550,height=600');
        });
    }

    const shareCopyBtn = document.getElementById('share-copy');
    if (shareCopyBtn) {
        shareCopyBtn.addEventListener('click', async () => {
            const text = `${getShareText()}\n\nPlay now: ${getShareUrl()}`;
            try {
                await navigator.clipboard.writeText(text);
                const originalText = shareCopyBtn.innerHTML;
                shareCopyBtn.innerHTML = '<span>&#x2714;</span> Copied!';
                setTimeout(() => {
                    shareCopyBtn.innerHTML = originalText;
                }, 2000);
            } catch (err) {
                // Fallback for older browsers
                const textarea = document.createElement('textarea');
                textarea.value = text;
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                const originalText = shareCopyBtn.innerHTML;
                shareCopyBtn.innerHTML = '<span>&#x2714;</span> Copied!';
                setTimeout(() => {
                    shareCopyBtn.innerHTML = originalText;
                }, 2000);
            }
        });
    }

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });


    // Page Visibility API - pause when tab/app is hidden
    let wasRunningBeforeHidden = false;
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            // Page is now hidden (user switched tabs/apps)
            if (GameState.isRunning && !GameState.isPaused && !GameState.isGameOver) {
                wasRunningBeforeHidden = true;
                GameState.isPaused = true;
                setElementDisplay('pause-screen', 'flex');
                
                // Suspend audio context to save resources
                if (audioContext && audioContext.state === 'running') {
                    audioContext.suspend();
                }
                
                DebugLog.log('Game paused - page hidden', 'info');
            }
        } else {
            // Page is now visible again
            if (wasRunningBeforeHidden && GameState.isPaused) {
                // Don't auto-resume - let user click to resume
                // But do resume audio context
                if (audioContext && audioContext.state === 'suspended') {
                    audioContext.resume();
                }
                DebugLog.log('Page visible - click to resume', 'info');
            }
            wasRunningBeforeHidden = false;
        }
    });

    // Also handle window blur/focus for desktop
    window.addEventListener('blur', () => {
        if (GameState.isRunning && !GameState.isPaused && !GameState.isGameOver && !isMobile) {
            // On desktop, pause when window loses focus (optional behavior)
            // Uncomment below to enable:
            // GameState.isPaused = true;
            // setElementDisplay('pause-screen', 'flex');
        }
    });

    DebugLog.log('Event listeners initialized', 'success');
}

async function quitToMenu() {
    GameState.isPaused = false;
    GameState.isRunning = false;
    GameState.isGameOver = false;

    // Exit spectator mode if active
    if (SpectatorMode.isSpectating) {
        SpectatorMode.exit();
    }

    // Stop ambient sounds
    stopAmbientSounds();

    // Clean up event listeners
    cleanupControls();

    // Clean up FPS counter interval
    cleanupFPSCounter();

    // Clear all zombies
    zombies.forEach((zombie) => {
        if (zombie.mesh) scene.remove(zombie.mesh);
    });
    zombies.clear();
    invalidateZombieMeshCache();

    // Clear optimization systems
    ZombiePool.clear();
    SpatialGrid.clear();
    particlePool.dispose();

    // Clear pickups
    pickups.forEach((pickup) => {
        if (pickup.mesh) scene.remove(pickup.mesh);
    });
    pickups.clear();

    // Clear remote players (multiplayer)
    remotePlayers.clear();
    remotePlayerMeshes.forEach((mesh) => {
        if (mesh) scene.remove(mesh);
    });
    remotePlayerMeshes.clear();

    // Clear spawn timer (uses setTimeout, not setInterval)
    if (GameState.spawnTimer) {
        clearTimeout(GameState.spawnTimer);
        GameState.spawnTimer = null;
    }

    // Reset shop state
    if (WeaponUpgrades.shopCountdown) {
        clearInterval(WeaponUpgrades.shopCountdown);
        WeaponUpgrades.shopCountdown = null;
    }
    WeaponUpgrades.shopOpen = false;
    WeaponUpgrades.localPlayerReady = false;
    WeaponUpgrades.playersReady.clear();
    inShopTransition = false;
    setElementDisplay('upgrade-shop', 'none');

    if (GameState.mode === 'singleplayer') {
        resetDestructibles();
    } else if (socket) {
        socket.close();
        socket = null;
    }

    // Reset player state
    playerState.health = CONFIG.player.maxHealth;
    playerState.isAlive = true;
    playerState.score = 0;
    playerState.ammo = CONFIG.player.startAmmo;
    playerState.reserveAmmo = CONFIG.player.reserveAmmo;

    // Reset game state
    GameState.wave = 1;
    GameState.totalKills = 0;
    GameState.totalScore = 0;
    GameState.zombiesRemaining = 0;
    GameState.zombiesSpawned = 0;
    GameState.zombiesToSpawn = 0;
    GameState.spawnWasPaused = false;
    GameState.mode = null;
    GameState.isInLobby = false;
    GameState.isReady = false;
    LobbyState.players.clear();

    // Reset player position
    player.position.set(0, 0, 0);

    setElementDisplay('pause-screen', 'none');
    setElementDisplay('game-over-screen', 'none');
    setElementDisplay('lobby-screen', 'none');
    setElementDisplay('start-screen', 'flex');
    setElementDisplay('hud', 'none');
    setElementDisplay('crosshair', 'none');
    setElementDisplay('multiplayer-panel', 'none');
    document.exitPointerLock();

    // Reset leaderboard toggle state and refresh
    setElementDisplay('menu-leaderboard', 'none');
    setElementDisplay('controls-info', 'block');
    const leaderboardToggle = document.getElementById('menu-leaderboard-toggle');
    if (leaderboardToggle) leaderboardToggle.textContent = 'VIEW LEADERBOARD';

    // Refresh leaderboard in background
    await fetchLeaderboard();
    renderLeaderboard('menu-leaderboard-content');
}

function leaveLobby() {
    // Reset connection state before closing
    GameState.isInLobby = false;
    GameState.isReady = false;
    GameState.mode = null;
    reconnectAttempts = MAX_RECONNECT_ATTEMPTS; // Prevent reconnection attempts

    if (socket) {
        socket.close();
    }
    socket = null;
    reconnectAttempts = 0; // Reset for future connections

    LobbyState.players.clear();

    setElementDisplay('lobby-screen', 'none');
    setElementDisplay('start-screen', 'flex');

    // Reset ready button (with null check to prevent crash)
    const btn = document.getElementById('ready-button');
    if (btn) {
        btn.textContent = 'READY';
        btn.classList.remove('ready');
        btn.disabled = true;
    }
}

// ==================== AGE GATE ====================
const AgeGate = {
    STORAGE_KEY: 'ageVerified',

    // Check if user has already verified age
    isVerified() {
        return localStorage.getItem(this.STORAGE_KEY) === 'true';
    },

    // Show the age gate modal
    show() {
        const ageGate = document.getElementById('age-gate');
        if (ageGate) {
            ageGate.classList.remove('hidden');
        }
    },

    // Hide the age gate modal
    hide() {
        const ageGate = document.getElementById('age-gate');
        if (ageGate) {
            ageGate.classList.add('hidden');
        }
    },

    // Handle "Yes" button click - user is 13+
    confirm() {
        localStorage.setItem(this.STORAGE_KEY, 'true');
        this.hide();
        DebugLog.log('Age verification confirmed', 'info');
    },

    // Handle "No" button click - user is under 13
    deny() {
        const prompt = document.getElementById('age-gate-prompt');
        const denied = document.getElementById('age-gate-denied');
        if (prompt) prompt.style.display = 'none';
        if (denied) denied.classList.add('show');
        DebugLog.log('Age verification denied - user under 13', 'warn');
    },

    // Initialize age gate event listeners
    init() {
        const yesBtn = document.getElementById('age-gate-yes');
        const noBtn = document.getElementById('age-gate-no');

        if (yesBtn) {
            yesBtn.addEventListener('click', () => this.confirm());
        }
        if (noBtn) {
            noBtn.addEventListener('click', () => this.deny());
        }

        // Check if verification is needed
        if (!this.isVerified()) {
            this.show();
        }
    }
};

// ==================== GLOBAL ERROR HANDLERS ====================
// Catch uncaught errors
window.addEventListener('error', (event) => {
    const errorInfo = `${event.message} at ${event.filename}:${event.lineno}:${event.colno}`;
    DebugLog.log(`Uncaught error: ${errorInfo}`, 'error');
    console.error('Uncaught error:', event.error);
});

// Catch unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason instanceof Error ? event.reason.message : String(event.reason);
    DebugLog.log(`Unhandled promise rejection: ${reason}`, 'error');
    console.error('Unhandled rejection:', event.reason);
});

// ==================== INITIALIZE ====================
window.addEventListener('load', () => {
    DebugLog.log('Window loaded, starting initialization...', 'info');

    // Initialize age gate first
    AgeGate.init();

    init();
});
