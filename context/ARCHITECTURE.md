# Aspen's Playground - Architecture Overview

## Project Summary
A 3D zombie survival shooter game set in a haunted Chuck E. Cheese-style venue. Built with vanilla JavaScript and Three.js for browser-based gameplay, supporting both single-player and multiplayer modes.

## Core Technology Stack
- **Rendering**: Three.js (WebGL)
- **Networking**: WebSocket for multiplayer
- **Storage**: localStorage for settings, achievements, leaderboards
- **Platform**: Browser-based (desktop and mobile responsive)

## File Structure

### Main Files
- `index.html` - Single-page application containing all HTML, CSS, and game container
- `game.js` - Main game logic (~12,000+ lines, contains all game systems)
- `server.js` - WebSocket server for multiplayer lobby, game state sync, and leaderboard API
- `leaderboard.json` - Persistent storage for global leaderboard (auto-generated)

### Modules Directory (`modules/`)
The code has been split into logical modules for better organization:
- `modules/config.js` - CONFIG object with game constants (player, weapons, arena, network)
- `modules/utils.js` - Utility objects: DebugLog, SpatialGrid, CollisionGrid, DeltaCompression, Interpolation, GameStats
- `modules/ui.js` - UI components: KillFeed, DamageNumbers, initScreenOrientation

Note: game.js currently contains inline copies of these modules for backwards compatibility. The modules are loaded first and provide the authoritative definitions.

### Key Sections in game.js (approximate line numbers)

#### Configuration & State (1-1000)
- `CONFIG` object - Game constants (arena size, player stats, weapons, etc.)
- `DevSettings` object - Developer settings (godMode toggle)
- `GameState` object - Global game state flags
- `playerState` object - Local player health, position, score
- `DebugLog` utility - Categorized console logging with color coding

#### Leaderboard System (521-644)
- `fetchLeaderboard()` - GET request to server API
- `submitScore()` - POST score with name, wave, kills
- `renderLeaderboard()` - Displays top 10 in UI
- `getPlayerName()` - Prompts user for name on new high score
- `initLeaderboard()` - Loads leaderboard on game start

#### Weapon System (1000-1200)
- `WeaponUpgrades` object - Between-wave upgrade shop system
- `Achievements` object - Achievement tracking and unlocking
- `getWeaponStats()` - Returns modified weapon stats based on upgrades

#### Networking (2990-3500)
- `connectToServer()` - WebSocket connection with reconnection logic
- `handleServerMessage()` - Message routing for multiplayer events
- `sendToServer()` - Throttled outgoing message queue
- Multiplayer state synchronization for player positions, zombies, projectiles

#### Player System (3500-4000)
- Player mesh creation with cosmetics
- Weapon switching and firing
- Health/damage system
- Grenade throwing

#### Zombie AI (9500-10500)
- A* pathfinding with NavGrid
- Steering-based movement with obstacle avoidance
- Stuck detection and recovery
- Special abilities (runner leap, tank charge, spitter acid pools)
- Boss wave mechanics

#### Environment Creation (5000-6500)
- Arena walls and floor
- Arcade machines, tables, chairs
- Destructible props (barrels, crates, barricades)
- Themed areas (ball pit, play structure, restrooms, stage)

#### Rendering & Animation (7000-8500)
- Camera controls (desktop mouse, mobile joystick)
- Weapon rendering and animations (with emissive lighting for visibility)
- Zombie skeletal animation system
- Particle effects (muzzle flash, blood, explosions)

#### Minimap System (~8790-8850)
- Canvas-based radar showing zombies, players, obstacles
- Player-relative coordinate transformation:
  - Uses rotation matrix for proper orientation
  - `localRight = dx * cosT - dz * sinT`
  - `localForward = -dx * sinT - dz * cosT`
  - Player always centered, facing up

#### UI & HUD (8500-9500)
- HUD updates (health, ammo, wave, score)
- Mobile-specific UI (virtual joysticks, HP bar)
- Menus (start, pause, game over, upgrade shop)
- Achievement notifications

## Key Design Patterns

### Collision System
All collidable objects store bounds in `userData.collision`:
```javascript
group.userData.collision = {
    minX: ..., maxX: ...,
    minZ: ..., maxZ: ...,
    maxY: ...  // Height for jump-over detection
};
collisionObjects.push(group);
```

### Entity Management
- Zombies stored in `zombies[]` array with properties: position, health, type, mesh, pathfinding state
- Remote players tracked via `remotePlayers` Map keyed by player ID
- Projectiles in `projectiles[]` with velocity, damage, owner info

### State Synchronization (Multiplayer)
- Client sends position/rotation updates at throttled rate
- Server broadcasts authoritative zombie positions
- Damage events sent as discrete messages, not positions

## Important Constants (CONFIG object)

### Arena
- `width`: 60 (arena size)
- `wallHeight`: 6 (prevents jumping out)
- `wallThickness`: 0.5

### Player
- `height`: 1.65 (eye height, used for camera position)
- `speed`: 8 (movement speed)
- `sprintMultiplier`: 1.5
- `jumpForce`: 12
- `radius`: 0.4 (collision radius)
- `maxHealth`: 100

### Weapons (indexed 0-4)
0. Pistol - Semi-auto, 12 rounds
1. Shotgun - Spread shot, 6 shells
2. SMG - Full auto, 30 rounds
3. Assault Rifle - Burst fire, 25 rounds
4. Sniper - High damage, 5 rounds

## Mobile Considerations
- `isMobile` flag detected via screen width and touch capability
- Virtual joysticks replace keyboard/mouse input
- Simplified UI with mobile-specific HP bar
- Touch-based shooting via screen tap

## Common Modification Points

### Adding New Weapons
1. Add to `CONFIG.weapons` array
2. Create `createWeaponModel_WeaponName()` function
3. Update `getWeaponStats()` if needed
4. Add upgrade costs to `WeaponUpgrades`

### Adding New Zombie Types
1. Add type configuration to zombie spawning logic
2. Create mesh in `createZombieMesh()`
3. Add special abilities in zombie update loop
4. Update damage/health scaling

### Adding New Environment Objects
1. Create function like `createNewObject()`
2. Add collision bounds with `maxY` for jump detection
3. Optionally register as destructible in `destructibleObjects`
4. Call from `createWorld()`

### UI Modifications
- Desktop-specific styles: use default CSS
- Mobile-specific styles: use `@media (max-width: 900px), (hover: none)`
- Always test both viewport sizes
