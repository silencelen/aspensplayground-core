# Zombie AI System

## Overview
Zombies use a hybrid pathfinding approach combining A* grid-based pathfinding with steering behaviors for smooth movement.

## Zombie Types

### Regular (type: 'normal')
- Base health, speed, and damage
- No special abilities
- Most common enemy

### Runner (type: 'runner')
- Lower health, higher speed
- Special Ability: **Leap Attack**
  - Triggers when close to player with clear line of sight
  - Parabolic jump trajectory over 400ms
  - Deals damage on landing near player
  - Cooldown prevents spam

### Tank (type: 'tank')
- High health, slow speed, high damage
- Special Ability: **Charge Attack**
  - When player is within range, charges in straight line
  - 4x normal speed during charge
  - Deals heavy damage on impact
  - Cannot turn during charge

### Spitter (type: 'spitter')
- Medium health, keeps distance from player
- Special Ability: **Acid Spit**
  - Ranged attack creating acid pool at target location
  - Acid pools deal DoT (damage over time)
  - Pools last 6 seconds with visual fading

### Boss (isBossWaveBoss: true)
- Massive health pool (scales with wave)
- Three attack phases based on health percentage
- Special Attacks:
  - Ground Slam (AoE damage)
  - Charge (high-speed rush)
  - Summon (spawns regular zombies)
- Has dedicated AI loop separate from regular zombies

## Pathfinding Components

### NavGrid
- Coarse grid representation of walkable areas
- Cell size configurable (currently ~1 unit)
- Rebuilt when destructible objects change
- Used for A* long-range pathfinding

### A* Implementation
- Standard A* with 8-directional movement
- Returns array of grid positions as path
- Path is cached per-zombie with timeout (150ms)
- Invalidated on significant target movement

### Line of Sight Check
- Fine-grained raycast between zombie and target
- Uses actual obstacle collision bounds
- If clear LOS exists, zombie moves directly
- Prevents unnecessary pathfinding overhead

### Steering Behaviors
Located in `calculateObstacleAvoidance()`:
- 5 raycasts at different angles (center, ±30°, ±60°)
- Weights closest obstacles more heavily
- Returns avoidance vector blended with movement direction
- Allows smooth navigation around props

## Stuck Detection System
- Tracks position history over time window
- If zombie hasn't moved >1m in threshold time AND is >4m from player:
  - Enters "unstuck mode"
  - Tries 8 cardinal/diagonal directions
  - Uses raycast to find clear direction
  - Times out after 5 seconds, resets to normal AI

## Movement Flow (per zombie per frame)
1. Check if zombie should use special ability
2. If special ability active, use ability-specific movement
3. Check direct line of sight to player
4. If LOS clear: move directly toward player
5. If LOS blocked: follow A* path (cached or recomputed)
6. Apply steering avoidance to prevent prop collisions
7. Check for stuck condition
8. Apply final velocity with speed and deltaTime

## Key Functions

### updateZombieSinglePlayer(zombie, delta)
Main zombie update loop for singleplayer mode

### hasLineOfSight(start, end)
Returns boolean if path is clear of obstacles

### findPath(start, end)
A* pathfinding returning grid path

### calculateObstacleAvoidance(zombie, direction)
Returns modified direction vector avoiding nearby obstacles

## Damage System
- Zombies take damage from bullets, explosions, melee
- Headshots deal 2x damage with separate hit detection
- On death: plays death animation, spawns score pickup, removes from array
- Achievement tracking for kills, headshots, multi-kills
