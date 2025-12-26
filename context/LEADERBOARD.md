# Leaderboard System

## Overview
Global persistent leaderboard tracking top 10 high scores. Displayed on main menu and game over screen.

## Server-Side (server.js)

### API Endpoints
- `GET /api/leaderboard` - Returns current top 10 scores
- `POST /api/leaderboard` - Submit a new score

### Data Storage
- File: `leaderboard.json` (auto-generated in project root)
- Format: Array of score objects sorted by score descending
- Max entries: 10 (11th+ are pruned on save)

### Score Object Structure
```javascript
{
    name: "PlayerName",    // Max 20 chars, sanitized
    score: 15000,          // Total points
    wave: 12,              // Wave reached
    kills: 145,            // Total zombie kills
    date: "2025-01-15T..."  // ISO timestamp
}
```

### Server Functions
- `loadLeaderboard()` - Reads from JSON file on startup
- `saveLeaderboard()` - Writes to JSON file after changes
- `addToLeaderboard(name, score, wave, kills)` - Validates and inserts score

### Validation
- Name trimmed and limited to 20 characters
- Score must be positive number
- Duplicate prevention: same name + score within 1 minute ignored

## Client-Side (game.js)

### Key Functions (~521-644)
- `fetchLeaderboard()` - Async GET to server API
- `submitScore(name, score, wave, kills)` - Async POST to server
- `renderLeaderboard(container, scores)` - Updates DOM with score table
- `getPlayerName()` - Prompts user for name via input modal
- `initLeaderboard()` - Called on game load to populate main menu

### UI Elements

#### Main Menu
- `#menu-leaderboard-container` - Container in start screen
- Shows "Loading..." initially, then top 10

#### Game Over Screen
- `#gameover-leaderboard-container` - Container in game over screen
- Shows player's rank if they made top 10
- Highlights player's entry

### CSS Classes
- `.leaderboard-table` - Main table styling
- `.leaderboard-header` - Column headers
- `.leaderboard-row` - Individual score row
- `.player-highlight` - Applied to current player's row

## Score Submission Flow

1. Player dies in singleplayer mode
2. `singlePlayerGameOver()` is called
3. Score checked against current leaderboard
4. If eligible (top 10), `getPlayerName()` prompts for name
5. `submitScore()` sends to server
6. Server validates and inserts score
7. `renderLeaderboard()` updates display with new rankings

## God Mode Protection
- If `DevSettings.godMode` was active during session, score is NOT submitted
- Prevents cheated scores from appearing on leaderboard
- Check in `singlePlayerGameOver()`:
```javascript
if (DevSettings.godMode) {
    DebugLog.warning("God mode active - score not submitted");
    return;
}
```

## Error Handling
- Network failures show "Could not load leaderboard" message
- Graceful degradation if server unavailable
- Scores cached locally until submit succeeds (future enhancement)
