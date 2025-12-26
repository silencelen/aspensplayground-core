# Collision System

## Overview
All collidable objects in the game use axis-aligned bounding boxes (AABB) stored in their Three.js userData. The collision system supports variable heights for jump-over mechanics.

## Collision Object Structure

```javascript
group.userData.collision = {
    minX: number,    // World-space left boundary
    maxX: number,    // World-space right boundary
    minZ: number,    // World-space back boundary
    maxZ: number,    // World-space front boundary
    maxY: number     // Object height for jump detection (optional)
};
```

## Object Registration
All collidable objects are pushed to the global `collisionObjects` array:
```javascript
collisionObjects.push(group);
```

## Height-Based Collision (Jump Over)

### How It Works
- `maxY` indicates the height of the obstacle
- Player feet position = `player.position.y - CONFIG.player.height`
- If player feet are above `maxY`, collision is skipped
- Allows jumping over tables, crates, barricades

### Jumpable Objects (maxY <= 1.0m)
- Tables with chairs: 1.0m
- Crates: 0.9m
- Barrels: 1.0m
- Sandbag barricades: 0.75m
- Benches: 1.0m
- Ball pit walls: 1.0m

### Non-Jumpable Objects (maxY > 1.5m)
- Arcade machines: 1.9m
- Token machines: 1.9m
- Prize counter: 2.5m
- Play structure: 3.5m
- Pillars: wallHeight (6m)
- Interior walls: variable, uses wall.h
- Party rooms: 3.5m
- Restrooms: 3.5m
- Kitchen counter: 2.6m
- Skeeball lanes: 2.0m

## Collision Detection (updatePlayer)

```javascript
// Calculate player feet height
const playerFeetY = player.position.y - CONFIG.player.height;

for (const obj of collisionObjects) {
    const bounds = obj.userData.collision;

    // Skip if player's feet are above obstacle
    if (bounds.maxY !== undefined && playerFeetY > bounds.maxY) {
        continue;
    }

    // AABB circle collision check
    if (px + pr > bounds.minX && px - pr < bounds.maxX &&
        pz + pr > bounds.minZ && pz - pr < bounds.maxZ) {
        // Push player out of collision
    }
}
```

## Arena Boundary Collision
Separate from object collision, handled via:
```javascript
const boundary = CONFIG.arena.width / 2 - CONFIG.player.radius - CONFIG.arena.wallThickness;
player.position.x = Math.max(-boundary, Math.min(boundary, player.position.x));
player.position.z = Math.max(-boundary, Math.min(boundary, player.position.z));
```

## Collision Resolution
Uses minimum overlap approach:
1. Calculate overlap in X and Z axes
2. Push player along axis with smaller overlap
3. Prevents getting stuck on corners

## Destructible Objects
Objects in `destructibleObjects[]` array can be destroyed:
- Have separate health tracking
- When destroyed, removed from `collisionObjects`
- Mesh removed from scene
- NavGrid updated if pathfinding-relevant

## Zombie Collision
Zombies use the same obstacle data for pathfinding avoidance but with different logic:
- NavGrid uses obstacle positions for A* walkability
- Steering behaviors use raycasts, not AABB checks
- Zombies can walk through each other (no inter-zombie collision)

## Adding New Collidable Objects
1. Create Three.js Group with visual meshes
2. Calculate world-space AABB bounds
3. Add `maxY` based on actual object height
4. Set `group.userData.collision = { minX, maxX, minZ, maxZ, maxY }`
5. Push to `collisionObjects` array
6. Optionally add to `destructibleObjects` if breakable
