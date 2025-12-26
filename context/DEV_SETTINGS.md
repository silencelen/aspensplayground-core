# Developer Settings

## Overview
Developer settings for testing and debugging. Not exposed in normal gameplay UI.

## DevSettings Object
Located at top of `game.js`:
```javascript
const DevSettings = {
    godMode: false  // When true, player takes no damage in singleplayer
};
```

## God Mode

### Activation
- Press **F4** to toggle god mode
- Only works in singleplayer mode
- Visual indicator appears in HUD when active

### Behavior
- Player takes no damage from any source
- Zombies still attack but deal 0 damage
- All other gameplay unchanged (can still shoot, move, etc.)
- Score accumulates normally during gameplay

### Visual Indicator
When god mode is active:
- "GOD MODE" text appears on screen
- Styled with red background, white text
- Position: top-center of viewport

### Leaderboard Protection
- God mode flag tracked throughout session
- On game over, checks `DevSettings.godMode`
- If true, score is NOT submitted to leaderboard
- Prevents cheated scores from appearing

### Implementation
```javascript
function damagePlayer(damage) {
    if (!playerState.isAlive) return;

    // God mode check - no damage in singleplayer
    if (DevSettings.godMode && GameState.mode === 'singleplayer') {
        return;
    }

    // ... rest of damage handling
}
```

### Key Binding
```javascript
if (e.key === 'F4') {
    DevSettings.godMode = !DevSettings.godMode;
    updateGodModeIndicator();
}
```

## Adding New Dev Settings

1. Add property to `DevSettings` object
2. Create toggle key binding in keyboard event listener
3. Add visual indicator if needed
4. Document behavior in this file

## Future Dev Settings (Potential)
- `infiniteAmmo` - Never need to reload
- `speedMultiplier` - Adjust movement speed
- `zombieSpawnRate` - Control spawn frequency
- `showCollisionBoxes` - Debug collision visualization
- `skipWaves` - Jump to specific wave number
