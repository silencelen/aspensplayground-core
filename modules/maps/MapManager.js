// ==================== MAP MANAGER ====================
// Handles loading, switching, and managing game maps

const MapManager = {
    currentMapId: null,
    currentMap: null,
    maps: {},
    scene: null,
    isTransitioning: false,
    transitionPromise: null,
    bossMode: false,
    bossBarriers: [],

    // Map to wave mapping
    waveMapConfig: [
        { waves: [1, 2], mapId: 'dining_hall' },
        { waves: [3, 4], mapId: 'arcade_zone' },
        { waves: [5, 6], mapId: 'backstage' },
        { waves: [7, 8], mapId: 'kitchen' },
        { waves: [9, 10, 11, 12], mapId: 'party_room' }  // Boss waves cycle here
    ],

    // Initialize with scene reference
    init(scene) {
        this.scene = scene;
        this.maps = {};
        this.currentMapId = null;
        this.currentMap = null;
        console.log('[MapManager] Initialized');
    },

    // Reset map state for new game - forces reload on next loadMap call
    reset() {
        console.log('[MapManager] Resetting for new game');
        
        // Deactivate boss mode if active
        this.deactivateBossMode();
        
        // Destroy current map to clean up any leftover state
        if (this.currentMap && this.scene) {
            this.currentMap.destroy(this.scene);
        }
        
        // Clear current map reference so next loadMap will actually load
        this.currentMapId = null;
        this.currentMap = null;
        this.isTransitioning = false;
        this.transitionPromise = null;
    },

    // Register a map
    registerMap(mapId, mapInstance) {
        this.maps[mapId] = mapInstance;
        console.log(`[MapManager] Registered map: ${mapId}`);
    },

    // Get map ID for a given wave
    getMapForWave(wave) {
        for (const config of this.waveMapConfig) {
            if (config.waves.includes(wave)) {
                return config.mapId;
            }
        }
        // Default to party room for high waves
        return 'party_room';
    },

    // Check if wave is a boss wave (every 10th wave)
    // Uses GameCore if available, otherwise uses constant 10
    isBossWave(wave) {
        const interval = (typeof GameCore !== 'undefined' && GameCore.Constants && GameCore.Constants.BOSS)
            ? GameCore.Constants.BOSS.WAVE_INTERVAL
            : 10;
        return wave > 0 && wave % interval === 0;
    },

    // Load a map by ID
    async loadMap(mapId) {
        // If a transition is in progress, wait for it to complete first
        if (this.isTransitioning && this.transitionPromise) {
            console.log('[MapManager] Waiting for current transition to complete...');
            await this.transitionPromise;
        }

        const newMap = this.maps[mapId];
        if (!newMap) {
            console.error(`[MapManager] Map not found: ${mapId}`);
            return false;
        }

        // Skip if already on this map
        if (this.currentMapId === mapId) {
            console.log(`[MapManager] Already on map: ${mapId}`);
            return true;
        }

        this.isTransitioning = true;
        console.log(`[MapManager] Loading map: ${mapId}`);

        // Store promise so other callers can wait for this transition
        this.transitionPromise = this._performTransition(mapId, newMap);
        const result = await this.transitionPromise;
        this.transitionPromise = null;
        return result;
    },

    // Internal method to perform the actual map transition
    async _performTransition(mapId, newMap) {

        // Fade out transition
        await this.fadeTransition(true);

        // Destroy current map
        if (this.currentMap) {
            this.currentMap.destroy(this.scene);
        }

        // Clear boss mode
        this.deactivateBossMode();

        // Create new map
        this.currentMap = newMap;
        this.currentMapId = mapId;
        newMap.create(this.scene);

        // Update collision and pathfinding
        this.updateCollisionSystem();

        // Fade in transition
        await this.fadeTransition(false);

        this.isTransitioning = false;
        console.log(`[MapManager] Map loaded: ${mapId}`);

        return true;
    },

    // Update collision objects and NavGrid
    updateCollisionSystem() {
        if (!this.currentMap) return;

        // Clear existing collision objects
        collisionObjects.length = 0;

        // Add map obstacles to collision system
        const obstacles = this.currentMap.getObstacles();
        obstacles.forEach(obs => {
            // Create a dummy object with collision data for the collision system
            const collisionObj = {
                userData: {
                    collision: {
                        minX: obs.minX,
                        maxX: obs.maxX,
                        minZ: obs.minZ,
                        maxZ: obs.maxZ,
                        maxY: obs.maxY || 2
                    }
                }
            };
            collisionObjects.push(collisionObj);
        });

        // Rebuild spatial grid
        if (typeof CollisionGrid !== 'undefined') {
            CollisionGrid.build(collisionObjects);
        }

        // Rebuild pathfinding grid
        if (typeof NavGrid !== 'undefined') {
            NavGrid.rebuildFromObstacles();
        }
        if (typeof Pathfinder !== 'undefined') {
            Pathfinder.clearCache();
        }

        console.log(`[MapManager] Collision system updated with ${obstacles.length} obstacles`);
    },

    // Fade transition effect
    fadeTransition(fadeOut) {
        return new Promise(resolve => {
            let overlay = document.getElementById('map-transition-overlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'map-transition-overlay';
                overlay.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: #000;
                    opacity: 0;
                    pointer-events: none;
                    transition: opacity 0.5s ease;
                    z-index: 9999;
                `;
                document.body.appendChild(overlay);
            }

            if (fadeOut) {
                overlay.style.opacity = '1';
                setTimeout(resolve, 500);
            } else {
                overlay.style.opacity = '0';
                setTimeout(resolve, 500);
            }
        });
    },

    // Activate boss mode - lock down arena
    activateBossMode() {
        if (this.bossMode || !this.currentMap) return;

        this.bossMode = true;
        console.log('[MapManager] Boss mode activated');

        // Add barriers at spawn points
        const barrierMaterial = new THREE.MeshStandardMaterial({
            color: 0xff0000,
            emissive: 0x330000,
            transparent: true,
            opacity: 0.7
        });

        // Create barriers at zombie spawn points
        const spawns = this.currentMap.getZombieSpawns();
        spawns.forEach((spawn, i) => {
            const barrierGeo = new THREE.BoxGeometry(4, 4, 0.5);
            const barrier = new THREE.Mesh(barrierGeo, barrierMaterial);
            barrier.position.set(spawn.x, 2, spawn.z);
            barrier.rotation.y = spawn.rotation || 0;
            this.scene.add(barrier);
            this.bossBarriers.push(barrier);

            // Add to collision
            collisionObjects.push({
                userData: {
                    collision: {
                        minX: spawn.x - 2,
                        maxX: spawn.x + 2,
                        minZ: spawn.z - 0.5,
                        maxZ: spawn.z + 0.5,
                        maxY: 4
                    }
                }
            });
        });

        // Change lighting to red warning
        this.setBossLighting(true);
    },

    // Deactivate boss mode
    deactivateBossMode() {
        if (!this.bossMode) return;

        this.bossMode = false;
        console.log('[MapManager] Boss mode deactivated');

        // Remove barriers
        this.bossBarriers.forEach(barrier => {
            this.scene.remove(barrier);
            barrier.geometry.dispose();
            barrier.material.dispose();
        });
        this.bossBarriers = [];

        // Reset lighting
        this.setBossLighting(false);
    },

    // Toggle boss lighting
    setBossLighting(enabled) {
        // Find ambient light and modify
        this.scene.traverse(obj => {
            if (obj.isAmbientLight) {
                obj.color.setHex(enabled ? 0x330000 : 0x1a0505);
            }
        });
    },

    // Handle wave change
    onWaveChange(newWave) {
        const targetMapId = this.getMapForWave(newWave);

        // Check if we need to change maps
        if (targetMapId !== this.currentMapId) {
            this.loadMap(targetMapId);
        }

        // Check for boss wave
        if (this.isBossWave(newWave)) {
            // Delay boss mode activation slightly
            setTimeout(() => this.activateBossMode(), 2000);
        }
    },

    // Get current map's spawn point for player
    getPlayerSpawn() {
        if (!this.currentMap) {
            return { x: 0, y: 1.65, z: 10 };
        }
        const spawns = this.currentMap.getPlayerSpawns();
        if (spawns.length === 0) {
            return { x: 0, y: 1.65, z: 10 };
        }
        // Random spawn point
        const spawn = spawns[Math.floor(Math.random() * spawns.length)];
        return { x: spawn.x, y: 1.65, z: spawn.z };
    },

    // Get zombie spawn points for current map
    getZombieSpawns() {
        if (!this.currentMap) return [];
        return this.currentMap.getZombieSpawns();
    }
};

// Export for use in game.js
if (typeof window !== 'undefined') {
    window.MapManager = MapManager;
}
