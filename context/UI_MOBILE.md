# UI and Mobile System

## Platform Detection
```javascript
const isMobile = window.innerWidth <= 900 ||
    ('ontouchstart' in window) ||
    (navigator.maxTouchPoints > 0);
```

## Desktop UI

### HUD Elements
- `#hud` - Bottom HUD container
  - `#health-panel` - Health bar and label
  - `#weapon-panel` - Weapon name, ammo count, grenades
- `#center-hud` - Wave and score display
- `#minimap` - Top-right corner minimap
- `#boss-health-container` - Boss health (during boss waves)

### Controls Display
- `.controls-info` - Shows on start screen
- Lists WASD, mouse, spacebar, shift, number keys, G for grenade

### Pointer Lock
- FPS controls use `requestPointerLock()` on canvas
- Mouse movement captured for camera rotation
- `document.exitPointerLock()` for menus

## Mobile UI

### Virtual Joysticks
- Left joystick: Movement (WASD equivalent)
- Right joystick: Look/aim (mouse equivalent)
- Created dynamically on touch start
- Semi-transparent overlays

### Mobile Controls
- `#mobile-controls` - Container for touch buttons
- `#shoot-btn` - Fire button
- `#reload-btn` - Reload button
- `#switch-weapon-btn` - Next weapon
- `#mobile-jump-btn` - Jump button

### Mobile HUD
- `#mobile-health` - Compact HP bar (top-left)
  - Shows "HP" label with health bar
  - Desktop health panel hidden on mobile
- Simplified ammo display

### Mobile-Specific CSS
Uses media query:
```css
@media (max-width: 900px), (hover: none) {
    /* Mobile styles */
}
```

Key mobile adjustments:
- `#health-panel { display: none }` - Use mobile HP instead
- `#center-hud { display: none }` - Removed for screen space
- `.controls-info { display: none }` - Not needed on mobile
- `#minimap` - Smaller (80px vs 120px)
- Touch control areas positioned for thumbs

## Screen States

### Start Screen (`#start-screen`)
- Game title and subtitle
- Player name input
- Mode selection (Single/Multiplayer)
- Cosmetics and Achievements buttons (stacked bottom-right)
- Leaderboard toggle
- Controls info (desktop only)

### Lobby Screen (`#lobby-screen`)
- Player list with ready status
- Connection status
- Ready/Leave buttons

### Game Over Screen (`#game-over-screen`)
- Final score display
- Stats summary
- Leaderboard
- Play Again / Main Menu buttons

### Pause Menu (`#pause-menu`)
- Resume / Settings / Main Menu
- Only available in singleplayer

### Upgrade Shop (`#upgrade-shop`)
- Shows between waves
- 5 weapon cards with upgrade options
- Countdown timer
- Continue button

## Responsive Design Breakpoints
- Desktop: > 900px width
- Mobile: <= 900px width OR no hover capability OR touch device

## Menu Transitions
- Screens toggled via `display: none/flex`
- Fade animations via CSS transitions
- Pointer lock released for menus, re-acquired for gameplay

## Achievement Notifications
- Toast-style popups on unlock
- Slide in from bottom-right
- Auto-dismiss after delay
- Show icon, name, description

## Button Styling
- `.menu-button` - Base button class
- Primary: red gradient
- Secondary: gray gradient
- `.cosmetics-button` - Purple gradient
- `.ready` state - Green when ready

## Performance Considerations
- Mobile uses simplified rendering (lower shadow quality)
- Touch event handlers optimized for responsiveness
- UI updates throttled to prevent layout thrashing
