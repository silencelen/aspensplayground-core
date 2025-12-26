# Weapons and Upgrade System

## Weapon Configuration

Weapons are defined in `CONFIG.weapons` array (index 0-4):

| Index | Name          | Damage | Fire Rate | Mag Size | Reload | Spread |
|-------|---------------|--------|-----------|----------|--------|--------|
| 0     | Pistol        | 25     | 0.2s      | 12       | 1.5s   | 0      |
| 1     | Shotgun       | 15x6   | 0.8s      | 6        | 2.5s   | varies |
| 2     | SMG           | 15     | 0.08s     | 30       | 2.0s   | 0.03   |
| 3     | Assault Rifle | 20     | 0.12s     | 25       | 2.2s   | 0.02   |
| 4     | Sniper        | 100    | 1.2s      | 5        | 3.0s   | 0      |

## Weapon Switching
- Keys 1-5 or mouse scroll
- `currentWeaponIndex` tracks active weapon
- Switching plays animation via `animateWeaponSwitch()`
- Cannot switch during reload

## Weapon Rendering
- All weapon materials use `MeshStandardMaterial` with emissive properties
- `emissive` color matches base color, `emissiveIntensity: 0.08` (8%)
- Ensures weapon is always visible even in dark areas
- Example material:
```javascript
const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x333333,
    metalness: 0.4,
    roughness: 0.6,
    emissive: 0x333333,
    emissiveIntensity: 0.08
});
```

## Upgrade Shop System

### When It Appears
- After completing each wave (except wave 1)
- Shows before next wave starts
- 15-second countdown timer
- Click "Continue" or wait for timer to proceed

### WeaponUpgrades Object Structure
```javascript
WeaponUpgrades = {
    levels: {
        pistol: { damage: 0, fireRate: 0, magSize: 0, reloadTime: 0 },
        // ... other weapons
    },
    maxLevel: 5,
    costs: {
        pistol: { damage: 200, fireRate: 150, magSize: 100, reloadTime: 100 },
        // ... scaling costs per weapon
    },
    multipliers: {
        damage: [1, 1.2, 1.4, 1.6, 1.85, 2.1],
        fireRate: [1, 0.9, 0.8, 0.72, 0.65, 0.58],
        magSize: [1, 1.2, 1.4, 1.6, 1.8, 2],
        reloadTime: [1, 0.9, 0.8, 0.72, 0.65, 0.58]
    }
}
```

### Upgrade Costs
- Base cost defined per weapon per stat
- Each level increases cost: `baseCost * (level + 1)`
- Higher tier weapons have higher base costs

### Upgrade Effects
- **Damage**: Direct multiplier on base damage
- **Fire Rate**: Reduces time between shots (lower = faster)
- **Mag Size**: Increases magazine capacity
- **Reload Time**: Reduces reload duration

### UI Components
- `#upgrade-shop` - Main shop container
- `.weapon-upgrade-card` - One per weapon
- `.upgrade-row` - One per stat per weapon
- `.pip` - Visual level indicators (5 per stat)
- `.upgrade-btn` - Purchase buttons with cost display

### Key Functions
- `showShop()` - Displays shop, unlocks cursor, starts countdown
- `hideShop()` - Closes shop, re-locks cursor, starts wave
- `purchase(weapon, stat)` - Deducts score, increases level
- `updateShopUI()` - Refreshes all UI elements
- `getModifiedStat(weapon, stat, base)` - Returns upgraded value
- `reset()` - Resets all upgrades on new game

## Cursor Lock Behavior
- `showShop()` calls `document.exitPointerLock()` for mouse access
- `hideShop()` calls `canvas.requestPointerLock()` for FPS controls

## Ammo System
- `weapon.ammo` - Current magazine count
- `weapon.reserveAmmo` - Total reserve ammo
- Reloading takes from reserve to fill magazine
- Reserve displays as "current / reserve" in HUD

## Grenade System
- Press G to throw
- Arcing trajectory with gravity
- Explosion damages zombies in radius
- Visual explosion with particles
- Achievement tracking for multi-kills
