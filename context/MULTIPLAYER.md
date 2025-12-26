# Multiplayer System

## Overview
Real-time multiplayer using WebSocket connections. Server handles lobby management, game state synchronization, and authoritative zombie positioning.

## Connection Flow

### Client Side
1. User clicks "Multiplayer" button
2. `connectToServer()` creates WebSocket to `ws(s)://host`
3. Status shown: "Connecting to server..."
4. On success, sends player name and cosmetic selection
5. Server responds with 'init' message containing player ID
6. Client shows lobby with player list

### Server Side (server.js)
1. WebSocket server listens alongside HTTP server
2. On connection: assigns unique ID, creates player object
3. Sends 'init' with player info and current lobby state
4. Broadcasts 'playerJoined' to all other clients

## Message Types

### Client to Server
- `setName` - Update player display name
- `setCosmetic` - Update player cosmetic selection
- `ready` - Toggle ready state in lobby
- `playerUpdate` - Position/rotation update (throttled)
- `shoot` - Weapon fire event with position/direction
- `zombieHit` - Damage dealt to zombie
- `chat` - Chat message (if implemented)

### Server to Client
- `init` - Initial connection data (player ID, lobby state, game state)
- `lobbyUpdate` - Player list changes
- `lobbyCountdown` - Countdown when all players ready
- `playerJoined` - New player connected
- `playerLeft` - Player disconnected
- `playerUpdate` - Other player position updates
- `zombieSync` - Authoritative zombie positions
- `gameStart` - Lobby ended, game beginning
- `waveStart` - New wave beginning
- `gameOver` - Game ended

## State Management

### GameState Flags
```javascript
GameState.mode = 'multiplayer'  // vs 'singleplayer'
GameState.isConnected = true/false
GameState.isInLobby = true/false
GameState.isRunning = true/false
GameState.isReady = true/false
```

### LobbyState
```javascript
LobbyState.players = new Map()  // playerId -> {id, name, isReady, color, cosmetic}
```

### Player Tracking
- `localPlayerId` - This client's assigned ID
- `localPlayerData` - This client's player object
- `remotePlayers` - Map of other players' Three.js meshes

## Synchronization

### Position Updates
- Client sends updates at capped rate (16ms throttle)
- Server broadcasts to all other clients
- Clients interpolate remote player positions
- Uses `Interpolation.applyInterpolation()` for smooth movement

### Sync Throttling (Anti-Freeze)
- `handleSync()` limited to max 20 syncs per second (50ms throttle)
- Prevents CPU overload from rapid sync messages
- Uses `lastSyncProcess` timestamp to track throttling:
```javascript
const SYNC_THROTTLE_MS = 50;
if (now - lastSyncProcess < SYNC_THROTTLE_MS) return;
```

### Zombie Authority
- In multiplayer, server is authoritative for zombie positions
- Clients can fire and hit zombies locally for responsiveness
- Damage is reported to server
- Server reconciles and broadcasts final zombie states

### Latency Handling
- Connection timeout: 10 seconds
- Reconnection attempts: 5 with exponential backoff
- Status messages keep user informed of connection state

## Lobby System

### Ready Check
- All players must click "READY"
- When all ready, 5-second countdown begins
- If anyone un-readies, countdown cancels
- Countdown complete triggers game start

### UI Elements
- `#lobby-screen` - Main lobby container
- `#lobby-player-list` - List of connected players
- `#lobby-status` - Connection/ready status text
- `#ready-button` - Toggle ready state
- `#leave-lobby-button` - Return to main menu

## Error Handling

### Connection Failures
- Timeout after 10 seconds of connecting
- Max 5 reconnection attempts
- Clear status messages for each state
- Ready button disabled when not connected

### Disconnection
- Player removed from lobby/game
- Other players notified via 'playerLeft'
- Remote player mesh cleaned up
- Auto-reconnect if still in lobby mode

## Mobile Considerations
- Same WebSocket protocol works on mobile
- Connection may be less reliable on mobile networks
- Status messages optimized for small screens
- Touch-friendly lobby buttons
