# AI Context Documentation

This folder contains documentation designed to help AI code editors (like Claude Code) understand and modify this codebase effectively.

## Quick Start for AI Editors

### Before Making Changes
1. Read `ARCHITECTURE.md` for overall structure
2. Check relevant system documentation for the area you're modifying
3. Look for `// Key Section:` comments in game.js for navigation

### Common Tasks

| Task | Read First | Key Files |
|------|------------|-----------|
| Add new weapon | WEAPONS_UPGRADES.md | game.js (CONFIG.weapons, createWeaponModel) |
| Add zombie type | ZOMBIE_AI.md | game.js (createZombieMesh, updateZombieSinglePlayer) |
| Add environment object | COLLISION.md | game.js (createWorld section) |
| Modify UI | UI_MOBILE.md | index.html |
| Change multiplayer | MULTIPLAYER.md | game.js, server.js |
| Modify leaderboard | LEADERBOARD.md | game.js, server.js |
| Add dev settings | DEV_SETTINGS.md | game.js (DevSettings object) |

### Code Navigation Tips

The `game.js` file is large (~12,000 lines). Use these landmarks:

- **Line 1-100**: CONFIG object (game constants)
- **Line 100-200**: GameState, playerState objects
- **Line 1000-1200**: WeaponUpgrades, Achievements
- **Line 2990-3100**: connectToServer, WebSocket handlers
- **Line 5000-6500**: Environment creation functions
- **Line 9400-9500**: updatePlayer (movement, collision)
- **Line 9500-10500**: Zombie AI and pathfinding
- **Line 11700+**: Event listeners and initialization

### Important Patterns

1. **Always add `maxY` to collision objects** for jump detection
2. **Use DebugLog** instead of console.log for categorized logging
3. **Check `isMobile`** when adding input handlers
4. **Test both platforms** - desktop and mobile have different UIs

## Documentation Files

| File | Contents |
|------|----------|
| ARCHITECTURE.md | Overall structure, file layout, key sections |
| ZOMBIE_AI.md | Pathfinding, zombie types, abilities |
| MULTIPLAYER.md | WebSocket protocol, lobby system, sync throttling |
| COLLISION.md | AABB system, jump-over heights |
| WEAPONS_UPGRADES.md | Weapon stats, upgrade shop, ammo, rendering |
| UI_MOBILE.md | HUD, mobile controls, responsive design |
| LEADERBOARD.md | Global leaderboard, score submission, API |
| DEV_SETTINGS.md | God mode, developer tools, debug features |

## Postulates (Design Decisions)

1. **Single-file approach**: game.js contains all game logic for simplicity
2. **Mobile-first touch controls**: Virtual joysticks over on-screen buttons
3. **Client-side prediction**: Shooting feels responsive, server reconciles
4. **Coarse NavGrid + Fine steering**: Balance performance and smoothness
5. **localStorage for persistence**: No backend DB needed for saves
6. **CSS-in-HTML**: Styles in index.html for single-file deployment
7. **File-based leaderboard**: JSON file storage for simplicity, no external DB
8. **God mode protection**: Dev features prevent cheated leaderboard entries

## Known Limitations

- No TypeScript (vanilla JS for simplicity)
- Large single file (consider splitting if >15k lines)
- NavGrid rebuilds on destructible changes (performance cost)
- Mobile WebSocket may be unreliable on poor connections

## Adding to This Documentation

When making significant changes:
1. Update relevant context file
2. Add new file if creating new major system
3. Keep line number references approximate (they shift)
