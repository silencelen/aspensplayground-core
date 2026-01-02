// ============================================
// ASPEN'S PLAYGROUND - Utilities Module
// ============================================

// ==================== DEBUG LOGGING ====================
const DebugLog = {
    container: null,
    maxLines: 50,
    visible: false,

    init() {
        this.container = document.getElementById('debug-log');
        console.log('[DEBUG] Debug logging system initialized');
    },

    log(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const prefix = {
            'info': '[INFO]',
            'warn': '[WARN]',
            'error': '[ERROR]',
            'success': '[SUCCESS]',
            'game': '[GAME]',
            'net': '[NET]'
        }[type] || '[LOG]';

        const colors = {
            'info': '#0f0',
            'warn': '#ff0',
            'error': '#f00',
            'success': '#0ff',
            'game': '#f0f',
            'net': '#88f'
        };

        const fullMessage = `${timestamp} ${prefix} ${message}`;
        console.log(fullMessage);

        if (this.container) {
            const line = document.createElement('div');
            line.style.color = colors[type] || '#0f0';
            line.textContent = fullMessage;
            this.container.appendChild(line);

            while (this.container.children.length > this.maxLines) {
                this.container.removeChild(this.container.firstChild);
            }

            this.container.scrollTop = this.container.scrollHeight;
        }
    },

    toggle() {
        this.visible = !this.visible;
        if (this.container) {
            this.container.classList.toggle('visible', this.visible);
        }
        this.log(`Debug log ${this.visible ? 'shown' : 'hidden'}`, 'info');
    }
};

// ==================== SPATIAL PARTITIONING (Grid-based for Entities) ====================
const SpatialGrid = {
    cellSize: 10,
    grid: new Map(),

    getKey(x, z) {
        const cx = Math.floor(x / this.cellSize);
        const cz = Math.floor(z / this.cellSize);
        return `${cx},${cz}`;
    },

    insert(entity) {
        const key = this.getKey(entity.position.x, entity.position.z);
        if (!this.grid.has(key)) {
            this.grid.set(key, new Set());
        }
        this.grid.get(key).add(entity);
        entity._gridKey = key;
    },

    remove(entity) {
        if (entity._gridKey && this.grid.has(entity._gridKey)) {
            this.grid.get(entity._gridKey).delete(entity);
        }
    },

    update(entity) {
        const newKey = this.getKey(entity.position.x, entity.position.z);
        if (entity._gridKey !== newKey) {
            this.remove(entity);
            this.insert(entity);
        }
    },

    getNearby(x, z, radius = 1) {
        const nearby = [];
        const cellRadius = Math.ceil(radius / this.cellSize);
        const cx = Math.floor(x / this.cellSize);
        const cz = Math.floor(z / this.cellSize);

        for (let dx = -cellRadius; dx <= cellRadius; dx++) {
            for (let dz = -cellRadius; dz <= cellRadius; dz++) {
                const key = `${cx + dx},${cz + dz}`;
                if (this.grid.has(key)) {
                    nearby.push(...this.grid.get(key));
                }
            }
        }
        return nearby;
    },

    clear() {
        this.grid.clear();
    }
};

// ==================== SPATIAL HASH FOR STATIC COLLISION OBJECTS ====================
const CollisionGrid = {
    cellSize: 8,
    grid: new Map(),
    objects: [],

    getCellKeys(minX, maxX, minZ, maxZ) {
        const keys = [];
        const startCX = Math.floor(minX / this.cellSize);
        const endCX = Math.floor(maxX / this.cellSize);
        const startCZ = Math.floor(minZ / this.cellSize);
        const endCZ = Math.floor(maxZ / this.cellSize);

        for (let cx = startCX; cx <= endCX; cx++) {
            for (let cz = startCZ; cz <= endCZ; cz++) {
                keys.push(`${cx},${cz}`);
            }
        }
        return keys;
    },

    insert(obj) {
        if (!obj.userData || !obj.userData.collision) return;

        const bounds = obj.userData.collision;
        const keys = this.getCellKeys(bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ);

        obj._collisionGridKeys = keys;
        keys.forEach(key => {
            if (!this.grid.has(key)) {
                this.grid.set(key, new Set());
            }
            this.grid.get(key).add(obj);
        });
        this.objects.push(obj);
    },

    remove(obj) {
        if (obj._collisionGridKeys) {
            obj._collisionGridKeys.forEach(key => {
                if (this.grid.has(key)) {
                    this.grid.get(key).delete(obj);
                }
            });
            obj._collisionGridKeys = null;
        }
        const idx = this.objects.indexOf(obj);
        if (idx > -1) this.objects.splice(idx, 1);
    },

    getNearby(x, z, radius = 0) {
        const nearby = new Set();
        const minX = x - radius;
        const maxX = x + radius;
        const minZ = z - radius;
        const maxZ = z + radius;

        const keys = this.getCellKeys(minX, maxX, minZ, maxZ);
        keys.forEach(key => {
            if (this.grid.has(key)) {
                this.grid.get(key).forEach(obj => nearby.add(obj));
            }
        });
        return Array.from(nearby);
    },

    build(collisionObjs) {
        this.clear();
        collisionObjs.forEach(obj => this.insert(obj));
        DebugLog.log(`CollisionGrid built with ${this.objects.length} objects in ${this.grid.size} cells`, 'game');
    },

    clear() {
        this.grid.clear();
        this.objects = [];
    },

    getStats() {
        return {
            objects: this.objects.length,
            cells: this.grid.size,
            avgPerCell: this.grid.size > 0 ?
                (Array.from(this.grid.values()).reduce((sum, set) => sum + set.size, 0) / this.grid.size).toFixed(1) : 0
        };
    }
};

// ==================== DELTA COMPRESSION ====================
const DeltaCompression = {
    lastState: new Map(),
    lastPlayerState: null,
    positionThreshold: 0.01,
    rotationThreshold: 0.01,

    compress(entityId, currentState) {
        const last = this.lastState.get(entityId);
        if (!last) {
            this.lastState.set(entityId, { ...currentState });
            return currentState;
        }

        const delta = {};
        let hasChanges = false;

        for (const key in currentState) {
            if (currentState[key] !== last[key]) {
                delta[key] = currentState[key];
                last[key] = currentState[key];
                hasChanges = true;
            }
        }

        return hasChanges ? delta : null;
    },

    // Get compressed player update - only returns data if position/rotation changed significantly
    getCompressedUpdate(position, rotation) {
        const current = {
            x: position.x,
            z: position.z,
            rotY: rotation.y
        };

        if (!this.lastPlayerState) {
            this.lastPlayerState = { ...current };
            return current;
        }

        const dx = Math.abs(current.x - this.lastPlayerState.x);
        const dz = Math.abs(current.z - this.lastPlayerState.z);
        const dRotY = Math.abs(current.rotY - this.lastPlayerState.rotY);

        if (dx > this.positionThreshold || dz > this.positionThreshold || dRotY > this.rotationThreshold) {
            this.lastPlayerState = { ...current };
            return current;
        }

        return null;
    },

    reset() {
        this.lastState.clear();
        this.lastPlayerState = null;
    }
};

// ==================== CLIENT-SIDE INTERPOLATION ====================
const Interpolation = {
    lerpFactor: 0.25,
    rotLerpFactor: 0.3,

    lerp(current, target, factor) {
        return current + (target - current) * factor;
    },

    lerpAngle(current, target, factor) {
        let diff = target - current;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        return current + diff * factor;
    },

    updateEntity(entity, targetPos, targetRot) {
        // Store raw rotation - lerpAngle handles wrapping during interpolation
        if (!entity.targetPosition) {
            entity.targetPosition = { x: targetPos.x, y: targetPos.y || 0, z: targetPos.z };
            entity.targetRotation = targetRot;
            entity.lastUpdateTime = Date.now();
        } else {
            entity.targetPosition.x = targetPos.x;
            entity.targetPosition.y = targetPos.y !== undefined ? targetPos.y : entity.targetPosition.y;
            entity.targetPosition.z = targetPos.z;
            entity.targetRotation = targetRot;
            entity.lastUpdateTime = Date.now();
        }
    },

    applyInterpolation(entity, mesh, options = {}) {
        if (!entity.targetPosition || !mesh) return;

        mesh.position.x = this.lerp(mesh.position.x, entity.targetPosition.x, this.lerpFactor);
        mesh.position.z = this.lerp(mesh.position.z, entity.targetPosition.z, this.lerpFactor);

        // Interpolate Y position for jump visibility (skip if skipY is true, e.g., for zombies)
        if (!options.skipY && entity.targetPosition.y !== undefined) {
            mesh.position.y = this.lerp(mesh.position.y, entity.targetPosition.y, this.lerpFactor);
        }

        if (entity.targetRotation !== undefined) {
            // Add PI to flip model 180 degrees to face same direction as camera
            const targetWithOffset = entity.targetRotation + Math.PI;
            mesh.rotation.y = this.lerpAngle(mesh.rotation.y, targetWithOffset, this.rotLerpFactor);
        }
    },

    // Normalize angle to -PI to PI range
    normalizeAngle(angle) {
        while (angle > Math.PI) angle -= Math.PI * 2;
        while (angle < -Math.PI) angle += Math.PI * 2;
        return angle;
    }
};

// ==================== GAME STATISTICS TRACKING ====================
const GameStats = {
    shotsFired: 0,
    shotsHit: 0,
    headshots: 0,
    damageDealt: 0,
    damageTaken: 0,
    killStreak: 0,
    bestKillStreak: 0,
    weaponKills: {},
    startTime: 0,

    reset() {
        this.shotsFired = 0;
        this.shotsHit = 0;
        this.headshots = 0;
        this.damageDealt = 0;
        this.damageTaken = 0;
        this.killStreak = 0;
        this.bestKillStreak = 0;
        this.weaponKills = {};
        this.startTime = Date.now();
    },

    recordShot() {
        this.shotsFired++;
    },

    recordHit(damage, isHeadshot = false, weaponName = 'unknown') {
        this.shotsHit++;
        this.damageDealt += damage;
        if (isHeadshot) {
            this.headshots++;
        }
    },

    recordKill(weaponName) {
        this.killStreak++;
        if (this.killStreak > this.bestKillStreak) {
            this.bestKillStreak = this.killStreak;
        }
        if (!this.weaponKills[weaponName]) {
            this.weaponKills[weaponName] = 0;
        }
        this.weaponKills[weaponName]++;
    },

    resetStreak() {
        this.killStreak = 0;
    },

    recordDamageTaken(amount) {
        this.damageTaken += amount;
    },

    getAccuracy() {
        if (this.shotsFired === 0) return 0;
        return Math.round((this.shotsHit / this.shotsFired) * 100);
    },

    getSurvivalTime() {
        const elapsed = Date.now() - this.startTime;
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    },

    getFavoriteWeapon() {
        let maxKills = 0;
        let favorite = 'None';
        for (const [weapon, kills] of Object.entries(this.weaponKills)) {
            if (kills > maxKills) {
                maxKills = kills;
                favorite = weapon;
            }
        }
        return favorite;
    }
};
