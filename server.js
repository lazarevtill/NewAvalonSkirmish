/**
 * @file This file contains the WebSocket server for the multiplayer card table game.
 * It manages game states, player connections, and broadcasting updates.
 */

// FIX: Imported `WebSocket` to correctly check for open connections.
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DECKS_FILE_PATH = path.join(__dirname, 'contentDatabase.json');
const DIST_PATH = path.join(__dirname, 'dist');
const LOGS_DIR = path.join(__dirname, 'logs');

// Create logs directory if it doesn't exist
if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR);
    console.log(`Created logs directory at: ${LOGS_DIR}`);
}

// In-memory storage for game states. A database would be used in a production environment.
const gameStates = new Map(); // gameId -> gameState
const clientGameMap = new Map(); // ws_client -> gameId
const gameLogs = new Map(); // gameId -> string[]
const gameTerminationTimers = new Map(); // gameId -> NodeJS.Timeout (Empty game timeout)
const gameInactivityTimers = new Map(); // gameId -> NodeJS.Timeout (Idle game timeout)
const playerDisconnectTimers = new Map(); // Key: `${gameId}-${playerId}` -> NodeJS.Timeout (Player conversion timeout)

const MAX_PLAYERS = 4;
const INACTIVITY_TIMEOUT_MS = 20 * 60 * 1000; // 20 minutes

let cardDatabase = {};
let tokenDatabase = {};
let deckFiles = [];
try {
    const rawData = fs.readFileSync(DECKS_FILE_PATH, 'utf-8');
    const allDecksData = JSON.parse(rawData);
    cardDatabase = allDecksData.cardDatabase;
    tokenDatabase = allDecksData.tokenDatabase;
    deckFiles = allDecksData.deckFiles;
    console.log('Deck data loaded successfully.');
} catch (error) {
    console.error('Fatal: Could not read or parse contentDatabase.json. The server cannot start.', error);
    process.exit(1);
}

// --- Server-side Game Logic Utilities ---
const PLAYER_COLORS = ['blue', 'purple', 'red', 'green', 'yellow', 'orange', 'pink', 'brown'];

/**
 * Shuffles an array using the Fisher-Yates algorithm.
 * @param {Array<any>} deck The array to shuffle.
 * @returns {Array<any>} A new, shuffled array.
 */
const shuffleDeck = (deck) => {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

const commandCardIds = new Set([
    'overwatch',
    'repositioning',
    'tacticalManeuver',
    'mobilization',
    'inspiration',
    'dataInterception',
    'falseOrders'
]);

/**
 * Creates a new, shuffled deck for a player, assigning ownership to each card.
 * @param {string} deckType The type of deck to create (e.g., 'SynchroTech').
 * @param {number} playerId The ID of the player who will own the deck.
 * @param {string} playerName The name of the player.
 * @returns {Array<object>} The created deck of cards.
 */
const createDeck = (deckType, playerId, playerName) => {
    const deckFile = deckFiles.find(df => df.id === deckType);
    if (!deckFile) {
        console.error(`Invalid deckType requested: ${deckType}`);
        return [];
    }

    const deckList = [];
    for (const deckEntry of deckFile.cards) {
        const cardDef = cardDatabase[deckEntry.cardId];
        if (!cardDef) {
            console.warn(`Card definition not found for ID: ${deckEntry.cardId} in deck: ${deckFile.name}`);
            continue;
        }

        const isCommandCard = commandCardIds.has(deckEntry.cardId);

        for (let i = 0; i < deckEntry.quantity; i++) {
            const cardKey = deckEntry.cardId.toUpperCase().replace(/-/g, '_');
            let card;
            if (isCommandCard) {
                card = {
                    ...cardDef,
                    deck: "Command",
                    id: `CMD_${cardKey}`,
                    ownerId: playerId,
                    ownerName: playerName,
                };
            } else {
                card = {
                    ...cardDef,
                    deck: deckFile.id,
                    id: `${deckFile.id.substring(0, 3).toUpperCase()}_${cardKey}_${i + 1}`,
                    ownerId: playerId,
                    ownerName: playerName,
                };
            }
            deckList.push(card);
        }
    }
    return shuffleDeck(deckList);
};

/**
 * Generates a unique, URL-friendly token for player session identification.
 * @returns {string} A new player token.
 */
const generatePlayerToken = () => Math.random().toString(36).substring(2);

/**
 * Creates a new player object with a default deck and a unique session token.
 * @param {number} id The ID for the new player.
 * @returns {object} The new player object.
 */
const createNewPlayer = (id) => {
    const initialDeck = deckFiles.find(df => df.isSelectable);
    if (!initialDeck) {
        console.error("No selectable decks found in contentDatabase.json!");
        process.exit(1); // Cannot create players without decks
    }
    const initialDeckType = initialDeck.id;

    const newPlayer = {
        id,
        name: `Player ${id}`,
        score: 0,
        hand: [],
        deck: [], // Deck will be created with the correct name.
        discard: [],
        selectedDeck: initialDeckType,
        color: PLAYER_COLORS[id-1] || 'blue',
        isDummy: false,
        isDisconnected: false,
        playerToken: generatePlayerToken(),
        isReady: false,
    };
    newPlayer.deck = createDeck(initialDeckType, id, newPlayer.name);
    return newPlayer;
};

// --- Logging and Game Lifecycle Helpers ---

/**
 * Adds a timestamped message to a game's log.
 * @param {string} gameId The ID of the game.
 * @param {string} message The message to log.
 */
const logToGame = (gameId, message) => {
    if (!gameId) return;
    const logMessages = gameLogs.get(gameId);
    if (logMessages) {
        logMessages.push(`[${new Date().toISOString()}] ${message}`);
    }
};

/**
 * Ends a game, saves its log, and cleans up all associated data.
 * @param {string} gameId The ID of the game to end.
 * @param {string} reason A reason for ending the game, for logging purposes.
 */
const endGame = (gameId, reason) => {
    logToGame(gameId, `Game ending due to: ${reason}.`);
    console.log(`Ending game ${gameId} due to: ${reason}.`);
    
    // 1. Save the log file
    const logData = gameLogs.get(gameId);
    if (logData && logData.length > 0) {
        const timestamp = new Date().toISOString().replace(/:/g, '-');
        const filename = path.join(LOGS_DIR, `game-${gameId}-${timestamp}.log`);
        try {
            fs.writeFileSync(filename, logData.join('\n'));
            console.log(`Log for game ${gameId} saved to ${filename}`);
        } catch (error) {
            console.error(`Failed to write log for game ${gameId}:`, error);
        }
    }

    // 2. Clean up all in-memory data
    gameStates.delete(gameId);
    gameLogs.delete(gameId);
    
    const timerId = gameTerminationTimers.get(gameId);
    if (timerId) {
        clearTimeout(timerId);
        gameTerminationTimers.delete(gameId);
    }

    const inactivityTimerId = gameInactivityTimers.get(gameId);
    if (inactivityTimerId) {
        clearTimeout(inactivityTimerId);
        gameInactivityTimers.delete(gameId);
    }
    
    // Clean up any pending player conversion timers for this game
    for (const [key, timer] of playerDisconnectTimers.entries()) {
        if (key.startsWith(`${gameId}-`)) {
            clearTimeout(timer);
            playerDisconnectTimers.delete(key);
        }
    }
    
    // 3. Disconnect any remaining clients (spectators) in that game
    wss.clients.forEach(client => {
        if (client.gameId === gameId) {
            client.terminate(); // Forcefully close the connection
        }
    });

    // 4. Update the public games list for all clients
    broadcastGamesList();
};

/**
 * Resets the inactivity timer for a game. 
 * If the timer expires, the game is terminated.
 * @param {string} gameId The ID of the game.
 */
const resetInactivityTimer = (gameId) => {
    if (!gameId) return;

    // Clear existing timer
    if (gameInactivityTimers.has(gameId)) {
        clearTimeout(gameInactivityTimers.get(gameId));
    }

    // Set new timer
    const timerId = setTimeout(() => {
        const gameState = gameStates.get(gameId);
        if (gameState) {
            logToGame(gameId, 'Game terminated due to inactivity (20 minutes without action).');
            endGame(gameId, '20 minutes inactivity');
        }
    }, INACTIVITY_TIMEOUT_MS);

    gameInactivityTimers.set(gameId, timerId);
};

/**
 * Converts a disconnected player into a dummy player.
 * @param {string} gameId The game ID.
 * @param {number} playerId The player ID.
 */
const convertPlayerToDummy = (gameId, playerId) => {
    const gameState = gameStates.get(gameId);
    if (!gameState) return;

    const player = gameState.players.find(p => p.id === playerId);
    if (player && player.isDisconnected) {
        logToGame(gameId, `Player ${playerId} (${player.name}) failed to reconnect and is now a Dummy.`);
        console.log(`Converting Player ${playerId} in game ${gameId} to Dummy.`);
        
        player.isDummy = true;
        player.isDisconnected = false; // Dummies are "connected" (part of game state) but not human
        player.name = `Dummy ${player.id}`;
        player.playerToken = null; // Prevent reconnection as this player

        // Remove the timer tracking this conversion
        playerDisconnectTimers.delete(`${gameId}-${playerId}`);

        broadcastState(gameId, gameState);
    }
};

/**
 * Schedules a game to be terminated after a delay if no real players are active.
 * @param {string} gameId The ID of the game.
 */
const scheduleGameTermination = (gameId) => {
    if (gameTerminationTimers.has(gameId)) return; // Timer already scheduled

    logToGame(gameId, 'Last real player disconnected. Starting 1-minute shutdown timer.');
    console.log(`Scheduling termination for game ${gameId} in 1 minute.`);

    const timerId = setTimeout(() => {
        const gameState = gameStates.get(gameId);
        // An active player is one who is not a dummy and not disconnected.
        const activePlayers = gameState ? gameState.players.filter(p => !p.isDummy && !p.isDisconnected) : [];
        if (activePlayers.length === 0) {
            endGame(gameId, 'inactivity timeout (empty game)');
        } else {
             gameTerminationTimers.delete(gameId); // A player reconnected, so just delete the timer
        }
    }, 60 * 1000); // 1 minute

    gameTerminationTimers.set(gameId, timerId);
};

/**
 * Cancels a scheduled game termination, usually because a player has reconnected.
 * @param {string} gameId The ID of the game.
 */
const cancelGameTermination = (gameId) => {
    if (gameTerminationTimers.has(gameId)) {
        clearTimeout(gameTerminationTimers.get(gameId));
        gameTerminationTimers.delete(gameId);
        logToGame(gameId, 'Shutdown timer cancelled due to player activity.');
        console.log(`Termination cancelled for game ${gameId}.`);
    }
};

// --- HTTP Server (for serving static files) ---
const server = http.createServer((req, res) => {
    // This server is now primarily for WebSocket upgrades and serving the production build.
    // For development, use the Vite dev server (`npm run dev`).

    const safeUrl = path.normalize(req.url).replace(/^(\.\.[\/\\])+/, '');
    let filePath = path.join(DIST_PATH, safeUrl);

    // Default to index.html for root path
    if (safeUrl === '/') {
        filePath = path.join(DIST_PATH, 'index.html');
    }

    fs.readFile(filePath, (error, content) => {
        if (error) {
            // If the file is not found, it might be a client-side route.
            // Serve index.html as a fallback for SPAs.
            if (error.code === 'ENOENT') {
                fs.readFile(path.join(DIST_PATH, 'index.html'), (fallbackError, fallbackContent) => {
                    if (fallbackError) {
                        res.writeHead(404, { 'Content-Type': 'text/plain' });
                        res.end('404 Not Found. Please run "npm run build" first.');
                    } else {
                        // For the main HTML file, instruct browser to always re-validate.
                        res.writeHead(200, { 
                            'Content-Type': 'text/html',
                            'Cache-Control': 'no-cache, must-revalidate' 
                        });
                        res.end(fallbackContent);
                    }
                });
            } else {
                console.error(`Server error for ${filePath}: ${error.code}`);
                res.writeHead(500);
                res.end(`Server Error: ${error.code}`);
            }
            return;
        }

        const extname = String(path.extname(filePath)).toLowerCase();
        const mimeTypes = {
            '.html': 'text/html',
            '.js': 'application/javascript',
            '.css': 'text/css',
            '.json': 'application/json',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.svg': 'image/svg+xml',
            '.ico': 'image/x-icon',
        };
        const contentType = mimeTypes[extname] || 'application/octet-stream';
        
        const headers = { 'Content-Type': contentType };
        const imageExtensions = ['.png', '.jpg', '.jpeg', '.svg', '.ico'];
        
        if (imageExtensions.includes(extname)) {
            // For images, tell the browser to always re-validate.
            // This ensures users always get the latest card images.
            headers['Cache-Control'] = 'no-cache, must-revalidate';
        } else if (['.js', '.css'].includes(extname)) {
            // For JS and CSS files, which Vite versions with hashes, we can cache them forever.
            headers['Cache-Control'] = 'public, max-age=31536000, immutable';
        }

        res.writeHead(200, headers);
        res.end(content, 'utf-8');
    });
});

// --- WebSocket Server Logic ---

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

/**
 * Sends the current game state to all clients connected to a specific game.
 * @param {string} gameId The ID of the game to broadcast.
 * @param {object} gameState The current state of the game.
 * @param {WebSocket} [excludeClient=null] A client to exclude from the broadcast (usually the sender).
 */
const broadcastState = (gameId, gameState, excludeClient = null) => {
    wss.clients.forEach(client => {
        // FIX: Used `WebSocket.OPEN` to correctly check the client's ready state. `client.OPEN` is undefined.
        if (client !== excludeClient && client.readyState === WebSocket.OPEN && clientGameMap.get(client) === gameId) {
            client.send(JSON.stringify(gameState));
        }
    });
};

/**
 * Sends the list of all active games to every connected client.
 */
const broadcastGamesList = () => {
    const gamesList = Array.from(gameStates.entries())
        .filter(([gameId, gameState]) => !gameState.isPrivate)
        .map(([gameId, gameState]) => ({
            gameId,
            playerCount: gameState.players.filter(p => !p.isDummy && !p.isDisconnected).length
        }));
    const message = JSON.stringify({ type: 'GAMES_LIST', games: gamesList });
    wss.clients.forEach(client => {
        // FIX: Used `WebSocket.OPEN` to correctly check the client's ready state. `client.OPEN` is undefined.
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
};

/**
 * Handles the logic for a player disconnecting from a game.
 * It marks the player as disconnected, leaving their slot open.
 * @param {string} gameId The ID of the game.
 * @param {number} playerId The ID of the player leaving.
 * @param {boolean} isManualExit If true, do not schedule a dummy conversion timer.
 */
const handlePlayerLeave = (gameId, playerId, isManualExit = false) => {
    if (!gameId || playerId === null || playerId === undefined) return;
    const numericPlayerId = Number(playerId);
    const gameState = gameStates.get(gameId);
    if (!gameState) return;

    let playerFound = false;
    const updatedPlayers = gameState.players.map(p => {
        if (p.id === numericPlayerId && !p.isDisconnected) {
            playerFound = true;
            logToGame(gameId, `Player ${p.name} (ID: ${numericPlayerId}) disconnected${isManualExit ? ' (Manual Exit)' : ''}.`);
            return { ...p, isDisconnected: true, isReady: false };
        }
        return p;
    });

    if (!playerFound) return;
    
    const updatedGameState = { ...gameState, players: updatedPlayers };
    gameStates.set(gameId, updatedGameState);
    
    // Clear existing conversion timer for this player if any
    const timerKey = `${gameId}-${numericPlayerId}`;
    if (playerDisconnectTimers.has(timerKey)) {
        clearTimeout(playerDisconnectTimers.get(timerKey));
        playerDisconnectTimers.delete(timerKey);
    }

    // If NOT a manual exit, schedule conversion to dummy in 60 seconds
    if (!isManualExit) {
        console.log(`Scheduling conversion to Dummy for Player ${numericPlayerId} in game ${gameId} in 60s.`);
        const timerId = setTimeout(() => {
            convertPlayerToDummy(gameId, numericPlayerId);
        }, 60 * 1000); // 1 minute
        playerDisconnectTimers.set(timerKey, timerId);
    }

    // An active player is a human who is currently connected.
    const activePlayers = updatedPlayers.filter(p => !p.isDummy && !p.isDisconnected);

    if (activePlayers.length === 0) {
        scheduleGameTermination(gameId);
    }
    
    broadcastState(gameId, updatedGameState);
    broadcastGamesList();
};

wss.on('connection', ws => {
    console.log('Client connected via WebSocket');

    ws.on('message', message => {
        try {
            const data = JSON.parse(message.toString());
            const { gameId } = data; // Most messages will have a gameId
            const gameState = gameId ? gameStates.get(gameId) : null;

            switch(data.type) {
                case 'GET_GAMES_LIST': {
                    const gamesList = Array.from(gameStates.entries())
                        .filter(([gId, gState]) => !gState.isPrivate)
                        .map(([gId, gState]) => ({
                            gameId: gId,
                            playerCount: gState.players.filter(p => !p.isDummy && !p.isDisconnected).length
                        }));
                    ws.send(JSON.stringify({ type: 'GAMES_LIST', games: gamesList }));
                    break;
                }
                case 'JOIN_GAME': {
                    const { playerToken } = data;
                    if (!gameState) {
                        ws.send(JSON.stringify({ type: 'ERROR', message: `Game with code ${gameId} not found.` }));
                        return;
                    }

                    clientGameMap.set(ws, gameId);
                    ws.gameId = gameId;
                    
                    resetInactivityTimer(gameId); // Activity: Player joined

                    // --- 1. Reconnection Logic ---
                    if (playerToken) {
                        const playerToReconnect = gameState.players.find(p => p.playerToken === playerToken && p.isDisconnected);
                        if (playerToReconnect) {
                            cancelGameTermination(gameId);
                            playerToReconnect.isDisconnected = false;
                            
                            // Clear pending dummy conversion timer
                            const timerKey = `${gameId}-${playerToReconnect.id}`;
                            if (playerDisconnectTimers.has(timerKey)) {
                                clearTimeout(playerDisconnectTimers.get(timerKey));
                                playerDisconnectTimers.delete(timerKey);
                                logToGame(gameId, `Cancelled dummy conversion timer for Player ${playerToReconnect.id}.`);
                            }

                            ws.playerId = playerToReconnect.id;
                            ws.send(JSON.stringify({ type: 'JOIN_SUCCESS', playerId: playerToReconnect.id, playerToken: playerToReconnect.playerToken }));
                            logToGame(gameId, `Player ${playerToReconnect.id} (${playerToReconnect.name}) reconnected.`);
                            broadcastState(gameId, gameState);
                            broadcastGamesList();
                            console.log(`Player ${playerToReconnect.id} reconnected to game ${gameId}.`);
                            return;
                        }
                    }

                    // --- 2. Takeover "Ghost" Player Slot ---
                    const playerToTakeOver = gameState.players.find(p => p.isDisconnected);
                    if (playerToTakeOver) {
                        cancelGameTermination(gameId);
                        playerToTakeOver.isDisconnected = false;
                        playerToTakeOver.name = `Player ${playerToTakeOver.id}`;
                        playerToTakeOver.playerToken = generatePlayerToken();

                        // Clear pending dummy conversion timer for the slot being taken over
                        const timerKey = `${gameId}-${playerToTakeOver.id}`;
                        if (playerDisconnectTimers.has(timerKey)) {
                            clearTimeout(playerDisconnectTimers.get(timerKey));
                            playerDisconnectTimers.delete(timerKey);
                        }

                        ws.playerId = playerToTakeOver.id;
                        ws.send(JSON.stringify({ type: 'JOIN_SUCCESS', playerId: playerToTakeOver.id, playerToken: playerToTakeOver.playerToken }));
                        logToGame(gameId, `A new player took over slot ${playerToTakeOver.id}.`);
                        broadcastState(gameId, gameState);
                        broadcastGamesList();
                        return;
                    }

                    // --- 3. Join as New Player if Space Available ---
                    const activePlayers = gameState.players.filter(p => !p.isDummy && !p.isDisconnected);
                    const dummyPlayers = gameState.players.filter(p => p.isDummy);
                    if (activePlayers.length + dummyPlayers.length < MAX_PLAYERS) {
                        cancelGameTermination(gameId);
                        const existingIds = new Set(gameState.players.map(p => p.id));
                        let newPlayerId = 1;
                        while(existingIds.has(newPlayerId)) {
                            newPlayerId++;
                        }

                        const newPlayer = createNewPlayer(newPlayerId);
                        gameState.players.push(newPlayer);
                        gameState.players.sort((a, b) => a.id - b.id);
                        
                        ws.playerId = newPlayerId;
                        ws.send(JSON.stringify({ type: 'JOIN_SUCCESS', playerId: newPlayerId, playerToken: newPlayer.playerToken }));
                        logToGame(gameId, `Player ${newPlayerId} (${newPlayer.name}) joined the game.`);
                        broadcastState(gameId, gameState);
                        broadcastGamesList();
                        console.log(`New player ${newPlayerId} added to game ${gameId}.`);
                        return;
                    }

                    // --- 4. Join as Spectator ---
                    ws.send(JSON.stringify({ type: 'JOIN_SUCCESS', playerId: null }));
                    ws.send(JSON.stringify(gameState));
                    console.log(`Client joined game ${gameId} as a spectator.`);
                    logToGame(gameId, 'A spectator joined.');
                    break;
                }
                case 'SUBSCRIBE': {
                    clientGameMap.set(ws, gameId);
                    ws.gameId = gameId;
                    console.log(`Client subscribed to game: ${gameId}`);
                    if (gameState) {
                        ws.send(JSON.stringify(gameState));
                    }
                    break;
                }
                case 'UPDATE_STATE': {
                    const { gameState: updatedGameState } = data;
                    const gameIdToUpdate = updatedGameState ? updatedGameState.gameId : null;

                    if (gameIdToUpdate && gameStates.has(gameIdToUpdate)) { // Only update if game exists
                      if (!clientGameMap.has(ws) || clientGameMap.get(ws) !== gameIdToUpdate) {
                          clientGameMap.set(ws, gameIdToUpdate);
                          ws.gameId = gameIdToUpdate;
                      }
                      
                      resetInactivityTimer(gameIdToUpdate); // Activity: Game state updated

                      logToGame(gameIdToUpdate, `Game state updated by player ${ws.playerId || 'spectator'}.`);
                      gameStates.set(gameIdToUpdate, updatedGameState);
                      broadcastState(gameIdToUpdate, updatedGameState, ws);
                    } else if (gameIdToUpdate) { // This is a new game being created
                        gameStates.set(gameIdToUpdate, updatedGameState);
                        
                        resetInactivityTimer(gameIdToUpdate); // Activity: Game created

                        gameLogs.set(gameIdToUpdate, []);
                        logToGame(gameIdToUpdate, `Game created with ID: ${gameIdToUpdate}`);
                        broadcastGamesList();
                        broadcastState(gameIdToUpdate, updatedGameState, ws);
                    }
                    break;
                }
                 case 'FORCE_SYNC': {
                    const { gameState: hostGameState } = data;
                    const gameIdToSync = hostGameState ? hostGameState.gameId : null;

                    if (gameIdToSync && gameStates.has(gameIdToSync)) {
                        // Only the host (player 1) can force a sync
                        if (ws.playerId === 1) {
                            resetInactivityTimer(gameIdToSync); // Activity: Force sync

                            logToGame(gameIdToSync, `Host (Player 1) forced a game state synchronization.`);
                            console.log(`Host forcing sync for game ${gameIdToSync}.`);
                            gameStates.set(gameIdToSync, hostGameState);
                            // Broadcast to ALL clients, including the host to confirm.
                            broadcastState(gameIdToSync, hostGameState); 
                        } else {
                            console.warn(`Non-host player ${ws.playerId} attempted to force sync game ${gameIdToSync}.`);
                        }
                    }
                    break;
                }
                case 'UPDATE_DECK_DATA': {
                    // Allows the host to push their local deck definitions to the server,
                    // ensuring all players use the same card data (images, abilities, etc.)
                    const { deckData } = data;
                    if (deckData && deckData.cardDatabase && deckData.deckFiles) {
                         console.log(`Received updated deck data from client ${ws.playerId}`);
                         cardDatabase = deckData.cardDatabase;
                         tokenDatabase = deckData.tokenDatabase || {};
                         deckFiles = deckData.deckFiles;
                         // Ideally, we might want to broadcast a specific 'REFRESH_ASSETS' event here,
                         // but standard state updates usually carry the card objects anyway.
                         // This mainly fixes new player creation logic on the server side.
                    }
                    break;
                }
                case 'LEAVE_GAME': {
                    const { playerId } = data;
                    if (!gameState) return;

                    const activePlayers = gameState.players.filter(p => !p.isDummy && !p.isDisconnected);
                    const isLeavingPlayerActive = activePlayers.some(p => p.id === playerId);
                    
                    if (isLeavingPlayerActive && activePlayers.length === 1) {
                        // This was the last active human player. End the game immediately.
                        logToGame(gameId, `Player ${playerId} exited. They were the last active player.`);
                        endGame(gameId, 'last player left');
                    } else {
                        // Other active players remain, so just mark this one as disconnected.
                        // Pass TRUE for manual exit to prevent dummy conversion timer
                        handlePlayerLeave(gameId, playerId, true);
                    }
                    
                    clientGameMap.delete(ws);
                    delete ws.playerId;
                    delete ws.gameId;
                    break;
                }
                case 'SET_GAME_MODE': {
                    if (gameState && !gameState.isGameStarted) {
                        resetInactivityTimer(gameId); // Activity: Game settings change
                        gameState.gameMode = data.mode;
                        broadcastState(gameId, gameState);
                    }
                    break;
                }
                case 'SET_GAME_PRIVACY': {
                    if (gameState && !gameState.isGameStarted) {
                        resetInactivityTimer(gameId); // Activity: Privacy change
                        gameState.isPrivate = data.isPrivate;
                        broadcastState(gameId, gameState);
                        broadcastGamesList(); // Update everyone's public list
                    }
                    break;
                }
                 case 'ASSIGN_TEAMS': {
                    if (gameState && !gameState.isGameStarted) {
                        resetInactivityTimer(gameId); // Activity: Team assignment
                        const { assignments } = data; // e.g., { 1: [1, 3], 2: [2, 4] }
                        const playerMap = new Map(gameState.players.map(p => [p.id, p]));
                        
                        // Clear old teams and assign new ones
                        gameState.players.forEach(p => delete p.teamId);
                        for (const teamId in assignments) {
                            const playerIds = assignments[teamId];
                            const teamCaptain = playerMap.get(playerIds[0]);
                            if (!teamCaptain) continue;

                            playerIds.forEach(playerId => {
                                const player = playerMap.get(playerId);
                                if (player) {
                                    player.teamId = Number(teamId);
                                    player.color = teamCaptain.color; // Sync color to captain
                                }
                            });
                        }
                        broadcastState(gameId, gameState);
                    }
                    break;
                }
                case 'START_READY_CHECK': {
                    if (gameState && !gameState.isGameStarted) {
                        resetInactivityTimer(gameId); // Activity: Ready check start
                        // Reset all ready statuses
                        gameState.players.forEach(p => p.isReady = false);
                        gameState.isReadyCheckActive = true;
                        broadcastState(gameId, gameState);
                    }
                    break;
                }
                case 'CANCEL_READY_CHECK': {
                    if (gameState && gameState.isReadyCheckActive && !gameState.isGameStarted) {
                        resetInactivityTimer(gameId); // Activity: Ready check canceled
                        gameState.isReadyCheckActive = false;
                        // Reset ready statuses to keep state clean
                        gameState.players.forEach(p => p.isReady = false);
                        broadcastState(gameId, gameState);
                    }
                    break;
                }
                case 'PLAYER_READY': {
                    const { playerId } = data;
                    if (gameState && gameState.isReadyCheckActive && !gameState.isGameStarted) {
                        resetInactivityTimer(gameId); // Activity: Player ready
                        const player = gameState.players.find(p => p.id === playerId);
                        if (player) {
                            player.isReady = true;
                        }
                        
                        // Check if all non-dummy, connected players are ready
                        const allReady = gameState.players
                            .filter(p => !p.isDummy && !p.isDisconnected)
                            .every(p => p.isReady);

                        if (allReady) {
                            gameState.isGameStarted = true;
                            gameState.isReadyCheckActive = false;

                            // Randomly select starting player from active real players
                            const activePlayers = gameState.players.filter(p => !p.isDummy && !p.isDisconnected);
                            if (activePlayers.length > 0) {
                                const randomIndex = Math.floor(Math.random() * activePlayers.length);
                                gameState.activeTurnPlayerId = activePlayers[randomIndex].id;
                                logToGame(gameId, `Game started. Player ${gameState.activeTurnPlayerId} is starting.`);
                            } else {
                                logToGame(gameId, `Game started. No active players found to select start?`);
                            }
                        }
                        broadcastState(gameId, gameState);
                    }
                    break;
                }
                case 'TRIGGER_HIGHLIGHT': {
                    const { highlightData } = data;
                    if (gameState) {
                        resetInactivityTimer(gameId); // Activity: Highlight triggered
                        // Broadcast the highlight event to all clients in the game (including sender)
                        const highlightMessage = JSON.stringify({ type: 'HIGHLIGHT_TRIGGERED', highlightData });
                        wss.clients.forEach(client => {
                            if (client.readyState === WebSocket.OPEN && clientGameMap.get(client) === gameId) {
                                client.send(highlightMessage);
                            }
                        });
                    }
                    break;
                }
                case 'TRIGGER_FLOATING_TEXT': {
                    const { floatingTextData } = data;
                    if (gameState) {
                        const message = JSON.stringify({ type: 'FLOATING_TEXT_TRIGGERED', floatingTextData });
                        wss.clients.forEach(client => {
                            if (client.readyState === WebSocket.OPEN && clientGameMap.get(client) === gameId) {
                                client.send(message);
                            }
                        });
                    }
                    break;
                }
                case 'TRIGGER_FLOATING_TEXT_BATCH': {
                    const { batch } = data;
                    if (gameState) {
                        const message = JSON.stringify({ type: 'FLOATING_TEXT_BATCH_TRIGGERED', batch });
                        wss.clients.forEach(client => {
                            if (client.readyState === WebSocket.OPEN && clientGameMap.get(client) === gameId) {
                                client.send(message);
                            }
                        });
                    }
                    break;
                }
                default:
                    console.warn(`Received unknown message type: ${data.type}`);
            }
        } catch (error) {
            console.error('Failed to process WebSocket message:', error);
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        const gameId = ws.gameId;
        const playerId = ws.playerId;
        if (gameId && playerId !== undefined) {
            // Unexpected close: pass false for isManualExit
            handlePlayerLeave(gameId, playerId, false);
        }
        clientGameMap.delete(ws);
    });

    ws.on('error', (error) => {
        console.error('WebSocket client error:', error);
    });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`Server started on http://localhost:${PORT}`);
    console.log('WebSocket is available on the same port (ws://).');
});

// --- Server Admin CLI ---
console.log('Server admin CLI is active. Type "clear" and press Enter to reset all games.');

process.stdin.on('data', (data) => {
    const command = data.toString().trim().toLowerCase();

    if (command === 'clear') {
        console.log('Received "clear" command. Resetting all game sessions...');

        // 1. Notify and disconnect all clients
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: 'ERROR', message: 'The server administrator has reset all active games. Please create or join a new game.' }));
                client.terminate(); // Forcefully close the connection
            }
        });

        // 2. Clear all in-memory game data
        gameStates.clear();
        clientGameMap.clear();
        gameLogs.clear();

        // 3. Clear any pending termination timers
        gameTerminationTimers.forEach(timerId => clearTimeout(timerId));
        gameTerminationTimers.clear();
        gameInactivityTimers.forEach(timerId => clearTimeout(timerId));
        gameInactivityTimers.clear();
        
        playerDisconnectTimers.forEach(timerId => clearTimeout(timerId));
        playerDisconnectTimers.clear();

        console.log('All game sessions cleared. The server is ready for new games.');
    }
});