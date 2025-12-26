// ============================================
// ASPEN'S PLAYGROUND - Configuration Module
// ============================================

// ==================== GAME CONFIGURATION ====================
const CONFIG = {
    player: {
        height: 1.65,  // Eye height - matches PLAYER_EYE_HEIGHT
        bodyHeight: 1.8, // Full body height
        radius: 0.4, // Collision radius
        speed: 8,
        sprintMultiplier: 1.5,
        jumpForce: 12,
        mouseSensitivity: 0.002,
        maxHealth: 100,
        startAmmo: 30,
        maxAmmo: 30,
        reserveAmmo: 90,
        reloadTime: 2000,
        fireRate: 100,
        damage: 25
    },
    zombie: {
        attackRange: 2
    },
    arena: {
        width: 60,
        depth: 60,
        wallHeight: 6,
        wallThickness: 0.5
    },
    network: {
        updateRate: 50 // ms between position updates
    },
    weapons: {
        pistol: {
            name: 'Pistol',
            damage: 25,
            fireRate: 300,
            magazineSize: 12,
            reserveMax: 60,
            reloadTime: 1500,
            spread: 0.02,
            automatic: false
        },
        shotgun: {
            name: 'Shotgun',
            damage: 15, // per pellet
            pellets: 8,
            fireRate: 800,
            magazineSize: 6,
            reserveMax: 30,
            reloadTime: 2500,
            spread: 0.15,
            automatic: false
        },
        smg: {
            name: 'SMG',
            damage: 15,
            fireRate: 80,
            magazineSize: 30,
            reserveMax: 150,
            reloadTime: 2000,
            spread: 0.05,
            automatic: true
        },
        rifle: {
            name: 'Assault Rifle',
            damage: 30,
            fireRate: 120,
            magazineSize: 25,
            reserveMax: 100,
            reloadTime: 2200,
            spread: 0.03,
            automatic: true
        },
        sniper: {
            name: 'Sniper',
            damage: 150,
            fireRate: 1500,
            magazineSize: 5,
            reserveMax: 20,
            reloadTime: 3000,
            spread: 0.001,
            automatic: false
        }
    }
};

// Freeze config to prevent accidental modifications
Object.freeze(CONFIG);
Object.freeze(CONFIG.player);
Object.freeze(CONFIG.zombie);
Object.freeze(CONFIG.arena);
Object.freeze(CONFIG.network);
Object.freeze(CONFIG.weapons);
Object.keys(CONFIG.weapons).forEach(key => Object.freeze(CONFIG.weapons[key]));
