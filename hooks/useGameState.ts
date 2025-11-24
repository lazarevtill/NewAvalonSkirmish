/**
 * @file This hook manages the entire game state, including player data, the board,
 * and communication with the WebSocket server.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { GameState, Player, Board, GridSize, Card, DragItem, DropTarget, PlayerColor, GameMode, RevealRequest, CardIdentifier, CustomDeckFile, HighlightData } from '../types';
import { DeckType, GameMode as GameModeEnum } from '../types';
import { shuffleDeck, PLAYER_COLOR_NAMES, TURN_PHASES } from '../constants';
import { decksData, getCardDefinition, commandCardIds, deckFiles, countersDatabase, rawJsonData, getCardDefinitionByName } from '../decks';

const MAX_PLAYERS = 4;
const GRID_MAX_SIZE = 7;

/**
 * Constructs the WebSocket URL based on the window's current location,
 * prioritizing a custom URL saved in localStorage.
 * @returns {string} The WebSocket server URL.
 */
const getWebSocketURL = () => {
  // 1. Check for a user-defined custom URL.
  const customUrl = localStorage.getItem('custom_ws_url');
  if (customUrl && customUrl.trim() !== '') {
    console.log(`Using custom WebSocket URL: ${customUrl}`);
    return customUrl.trim();
  }

  // 2. Fallback to default logic.
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const hostname = window.location.hostname || 'localhost';
  // When deployed, the WebSocket server runs on the same host and default port (443 for wss, 80 for ws).
  // For local dev, you can point to a local server or a remote one like ngrok.
  if (window.location.port && window.location.port !== '80' && window.location.port !== '443' && window.location.hostname === 'localhost') {
    // Point to ngrok for remote testing from a local client
    return 'wss://platinocyanic-unsceptically-belia.ngrok-free.dev';
    // return `${protocol}://${hostname}:8080`; // Or point to your local server
  }
  // For production (including when hosted on ngrok), it connects to the same host it's served from.
  return `${protocol}://${hostname}`;
};


/**
 * Represents the current status of the WebSocket connection.
 */
export type ConnectionStatus = 'Connecting' | 'Connected' | 'Disconnected';

/**
 * Generates a random, URL-friendly string to be used as a unique game ID.
 * @returns {string} A new game ID.
 */
const generateGameId = () => Math.random().toString(36).substring(2, 18).toUpperCase();

/**
 * Creates an empty game board of the maximum possible size.
 * @returns {Board} An empty board.
 */
const createInitialBoard = (): Board =>
  Array(GRID_MAX_SIZE).fill(null).map(() => Array(GRID_MAX_SIZE).fill({ card: null }));

/**
 * Recalculates "Support" and "Threat" statuses for all cards on the board.
 * This function is computationally intensive and should be called only when the board changes.
 * @param {GameState} gameState The entire current game state.
 * @returns {Board} A new board object with updated statuses.
 */
const recalculateBoardStatuses = (gameState: GameState): Board => {
    const { board, activeGridSize, players } = gameState;
    const newBoard = JSON.parse(JSON.stringify(board));
    const GRID_SIZE = newBoard.length;
    const offset = Math.floor((GRID_SIZE - activeGridSize) / 2);

    const playerTeamMap = new Map<number, number | undefined>();
    players.forEach(p => playerTeamMap.set(p.id, p.teamId));

    // First, clear all automatic statuses from every card.
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            const card = newBoard[r][c].card;
            if (card && card.statuses) {
                card.statuses = card.statuses.filter((s: {type: string}) => s.type !== 'Support' && s.type !== 'Threat');
            }
        }
    }

    // Then, re-apply statuses based on current positions.
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            const card = newBoard[r][c].card;
            if (!card || card.ownerId === undefined || card.isFaceDown) continue;

            const ownerId = card.ownerId;
            const ownerTeamId = playerTeamMap.get(ownerId);
            
            const neighborsPos = [
                { r: r - 1, c: c }, { r: r + 1, c: c },
                { r: r, c: c - 1 }, { r: r, c: c + 1 },
            ];

            const enemyNeighborsByPlayer: { [key: number]: { r: number, c: number }[] } = {};
            let hasFriendlyNeighbor = false;

            // Check all adjacent cells.
            for (const pos of neighborsPos) {
                const { r: nr, c: nc } = pos;
                if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE) {
                    const neighborCard = newBoard[nr][nc].card;
                    if (neighborCard && neighborCard.ownerId !== undefined && !neighborCard.isFaceDown) {
                        const neighborOwnerId = neighborCard.ownerId;
                        const neighborTeamId = playerTeamMap.get(neighborOwnerId);

                        // A neighbor is friendly if they are the same player, or if they are on the same team (and teams exist).
                        // If teams are undefined, ownerTeamId !== undefined checks ensure we fall back to simple ID comparison.
                        const isFriendly = ownerId === neighborOwnerId || (ownerTeamId !== undefined && ownerTeamId === neighborTeamId);

                        if (isFriendly) {
                            hasFriendlyNeighbor = true;
                        } else {
                            if (!enemyNeighborsByPlayer[neighborOwnerId]) {
                                enemyNeighborsByPlayer[neighborOwnerId] = [];
                            }
                            enemyNeighborsByPlayer[neighborOwnerId].push({ r: nr, c: nc });
                        }
                    }
                }
            }

            // Apply "Support" Status if a friendly neighbor exists.
            if (hasFriendlyNeighbor) {
                if (!card.statuses) card.statuses = [];
                if (!card.statuses.some((s: {type: string}) => s.type === 'Support')) {
                    card.statuses.push({ type: 'Support', addedByPlayerId: ownerId });
                }
            }
            
            let threateningPlayerId: number | null = null;

            // Apply "Threat" Status Condition A: Pinned by two cards of the same enemy.
            for (const enemyPlayerId in enemyNeighborsByPlayer) {
                if (enemyNeighborsByPlayer[enemyPlayerId].length >= 2) {
                    threateningPlayerId = parseInt(enemyPlayerId, 10);
                    break;
                }
            }

            // Apply "Threat" Status Condition B: On the active border with an enemy neighbor.
            if (threateningPlayerId === null) {
                 const isActiveCell = r >= offset && r < offset + activeGridSize &&
                                    c >= offset && c < offset + activeGridSize;
                
                 if (isActiveCell) {
                    const isCardOnEdge = r === offset || r === offset + activeGridSize - 1 ||
                                         c === offset || c === offset + activeGridSize - 1;

                    const hasEnemyNeighbor = Object.keys(enemyNeighborsByPlayer).length > 0;
                    
                    if (isCardOnEdge && hasEnemyNeighbor) {
                        threateningPlayerId = parseInt(Object.keys(enemyNeighborsByPlayer)[0], 10);
                    }
                 }
            }
            
            if (threateningPlayerId !== null) {
                 if (!card.statuses) card.statuses = [];
                 if (!card.statuses.some((s: {type: string}) => s.type === 'Threat')) {
                    card.statuses.push({ type: 'Threat', addedByPlayerId: threateningPlayerId });
                }
            }
        }
    }
    return newBoard;
};


/**
 * Custom hook to manage all game state logic and server communication.
 * @returns An object containing the game state and functions to modify it.
 */
export const useGameState = () => {
  /**
   * Creates a shuffled deck for a specific player based on a deck type.
   * @param {DeckType} deckType - The type of deck to create.
   * @param {number} playerId - The ID of the player who will own the cards.
   * @param {string} playerName - The name of the player who will own the cards.
   * @returns {Card[]} A new, shuffled array of cards.
   */
  const createDeck = useCallback((deckType: DeckType, playerId: number, playerName: string): Card[] => {
    const deck = decksData[deckType];
    if (!deck) {
        console.error(`Deck data for ${deckType} not loaded! Returning empty deck.`);
        return [];
    }
    const deckWithOwner = [...deck].map(card => ({ ...card, ownerId: playerId, ownerName: playerName }));
    return shuffleDeck(deckWithOwner);
  }, []);

  /**
   * Creates a new player object with a default deck.
   * @param {number} id - The ID for the new player.
   * @param {boolean} [isDummy=false] - Whether the player is a dummy player.
   * @returns {Player} The new player object.
   */
  const createNewPlayer = useCallback((id: number, isDummy = false): Player => {
      const initialDeckType = Object.keys(decksData)[0] as DeckType;
      const player = {
          id,
          name: isDummy ? `Dummy ${id - 1}` : `Player ${id}`,
          score: 0,
          hand: [],
          deck: [] as Card[],
          discard: [],
          announcedCard: null,
          selectedDeck: initialDeckType,
          color: PLAYER_COLOR_NAMES[id - 1] || 'blue',
          isDummy,
          isReady: false,
      };
      player.deck = createDeck(initialDeckType, id, player.name);
      return player;
  }, [createDeck]);

  /**
   * Creates the initial, empty state for a new game.
   * @returns {GameState} The initial game state.
   */
  const createInitialState = useCallback((): GameState => ({
    players: [],
    board: createInitialBoard(),
    activeGridSize: 7,
    gameId: null,
    dummyPlayerCount: 0,
    isGameStarted: false,
    gameMode: GameModeEnum.FreeForAll,
    isPrivate: true,
    isReadyCheckActive: false,
    revealRequests: [],
    activeTurnPlayerId: undefined,
    currentPhase: 0,
  }), []);

  const [gameState, setGameState] = useState<GameState>(createInitialState);
  const [localPlayerId, setLocalPlayerId] = useState<number | null>(null);
  const [draggedItem, setDraggedItem] = useState<DragItem | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('Connecting');
  const [gamesList, setGamesList] = useState<{gameId: string, playerCount: number}[]>([]);
  const [latestHighlight, setLatestHighlight] = useState<HighlightData | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const joiningGameIdRef = useRef<string | null>(null);
  const preloadedImageUrls = useRef(new Set<string>());
  
  const gameStateRef = useRef(gameState);
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  const localPlayerIdRef = useRef(localPlayerId);
  useEffect(() => {
    localPlayerIdRef.current = localPlayerId;
  }, [localPlayerId]);


  /**
   * Updates the game state and broadcast it to other players.
   * This is the primary function for all state mutations.
   * @param {GameState | ((prevState: GameState) => GameState)} newStateOrFn - The new state or a function that returns the new state.
   */
  const updateState = useCallback((newStateOrFn: GameState | ((prevState: GameState) => GameState)) => {
    setGameState(prevState => {
      const newState = typeof newStateOrFn === 'function' ? newStateOrFn(prevState) : newStateOrFn;
      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ type: 'UPDATE_STATE', gameState: newState }));
      }
      return newState;
    });
  }, []);
  
  /**
   * Pushes local deck definitions to the server to ensure all players use the Host's version.
   */
  const updateServerDecks = useCallback(() => {
      if (ws.current?.readyState === WebSocket.OPEN && localPlayerIdRef.current === 1) {
          console.log("Sending UPDATE_DECK_DATA to server...");
          ws.current.send(JSON.stringify({
              type: 'UPDATE_DECK_DATA',
              deckData: rawJsonData
          }));
      }
  }, []);

  /**
   * Establishes and manages the WebSocket connection, including event handlers and reconnection logic.
   */
  const connectWebSocket = useCallback(() => {
    if (ws.current && ws.current.readyState !== WebSocket.CLOSED) return;

    const WS_URL = getWebSocketURL(); // Get the latest URL each time we connect.

    try {
      ws.current = new WebSocket(WS_URL);
    } catch (error) {
      console.error("Failed to create WebSocket:", error);
      setConnectionStatus('Disconnected');
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = window.setTimeout(connectWebSocket, 3000);
      return;
    }

    setConnectionStatus('Connecting');

    ws.current.onopen = () => {
      console.log('WebSocket connection established');
      setConnectionStatus('Connected');
      
      const currentGameState = gameStateRef.current;
      if (currentGameState && currentGameState.gameId) {
        if (ws.current?.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({ type: 'SUBSCRIBE', gameId: currentGameState.gameId }));
            
            // If we are Host, push definitions on reconnect too
            if (localPlayerIdRef.current === 1) {
                 ws.current.send(JSON.stringify({ type: 'UPDATE_DECK_DATA', deckData: rawJsonData }));
            }
        }
      }
    };

    ws.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'GAMES_LIST') {
            setGamesList(data.games);
        } else if (data.type === 'JOIN_SUCCESS') {
            setLocalPlayerId(data.playerId);
            const gameId = joiningGameIdRef.current;
            if (gameId && data.playerId !== null && data.playerToken) {
              localStorage.setItem('reconnection_data', JSON.stringify({
                gameId,
                playerId: data.playerId,
                playerToken: data.playerToken,
                timestamp: Date.now(),
              }));
            } else if (data.playerId === null) {
                // If joining as spectator, clear any old token.
                localStorage.removeItem('reconnection_data');
            }
            joiningGameIdRef.current = null;
            
            // If we joined as Host, update server definitions immediately
            if (data.playerId === 1) {
                setTimeout(() => {
                     if (ws.current?.readyState === WebSocket.OPEN) {
                        ws.current.send(JSON.stringify({ type: 'UPDATE_DECK_DATA', deckData: rawJsonData }));
                     }
                }, 500);
            }
        } else if (data.type === 'ERROR') {
            alert(data.message);
            // If an error occurs (e.g., game not found during rejoin), reset the state to show the main menu.
            localStorage.removeItem('reconnection_data');
            setGameState(createInitialState());
            setLocalPlayerId(null);
        } else if (data.type === 'HIGHLIGHT_TRIGGERED') {
            // Received a highlight event from the server
            setLatestHighlight(data.highlightData);
        } else {
            const receivedState: GameState = data;
            setGameState(receivedState);
        }
      } catch (error) {
        console.error("Failed to parse message from server:", event.data, error);
      }
    };

    ws.current.onclose = () => {
      console.log('WebSocket connection closed. Attempting to reconnect...');
      setConnectionStatus('Disconnected');
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = window.setTimeout(connectWebSocket, 3000);
    };

    ws.current.onerror = (event) => console.error('WebSocket error event:', event);
  }, [setGameState, createInitialState]);

  const forceReconnect = useCallback(() => {
    if (ws.current) {
        console.log('Forcing WebSocket reconnection...');
        // The onclose handler will automatically trigger the reconnect logic.
        ws.current.close();
    }
  }, []);

  /**
   * Sends a request to the server to join an existing game, including a reconnection token if available.
   * @param {string} gameId - The ID of the game to join.
   */
  const joinGame = useCallback((gameId: string): void => {
    if (ws.current?.readyState === WebSocket.OPEN) {
        joiningGameIdRef.current = gameId;
        let reconnectionData = null;
        try {
            const storedData = localStorage.getItem('reconnection_data');
            if (storedData) {
                reconnectionData = JSON.parse(storedData);
            }
        } catch (e) {
            console.error("Could not parse reconnection data:", e);
            localStorage.removeItem('reconnection_data');
        }

        const payload: { type: string; gameId: string; playerToken?: string } = { type: 'JOIN_GAME', gameId };

        if (reconnectionData && reconnectionData.gameId === gameId && reconnectionData.playerToken) {
            payload.playerToken = reconnectionData.playerToken;
        }

        ws.current.send(JSON.stringify(payload));
    } else {
        alert("Could not connect to the server. Please try refreshing the page.");
    }
  }, []);

  // Effect to establish WebSocket connection on mount and ensure a clean start.
  useEffect(() => {
    // Clear any previous session data to always show the main menu on load.
    localStorage.removeItem('reconnection_data');
    connectWebSocket();
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (ws.current) {
        ws.current.onclose = null; 
        ws.current.close();
      }
    };
  }, [connectWebSocket]);

  /**
   * Creates a new game, initializes state, and subscribes to the new game ID.
   */
  const createGame = useCallback(() => {
    localStorage.removeItem('reconnection_data');
    const newGameId = generateGameId();
    const initialState = { 
        ...createInitialState(), 
        gameId: newGameId,
        players: [createNewPlayer(1)],
    };
    updateState(initialState);
    if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ type: 'SUBSCRIBE', gameId: newGameId }));
        // Also push decks
        ws.current.send(JSON.stringify({ type: 'UPDATE_DECK_DATA', deckData: rawJsonData }));
    }
  }, [updateState, createInitialState, createNewPlayer]);

  /**
   * Requests the list of currently active games from the server.
   */
  const requestGamesList = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ type: 'GET_GAMES_LIST' }));
    }
  }, []);
  
  /**
   * Resets the local state and notifies the server that the player is leaving the game.
   */
  const exitGame = useCallback(() => {
    const gameIdToLeave = gameStateRef.current.gameId;
    const playerIdToLeave = localPlayerIdRef.current;

    setGameState(createInitialState());
    setLocalPlayerId(null);
    localStorage.removeItem('reconnection_data');

    if (ws.current?.readyState === WebSocket.OPEN && gameIdToLeave && playerIdToLeave !== null) {
      ws.current.send(JSON.stringify({ type: 'LEAVE_GAME', gameId: gameIdToLeave, playerId: playerIdToLeave }));
    }
  }, [createInitialState]);

  const startGame = useCallback(() => {
    updateState(currentState => ({
      ...currentState,
      isGameStarted: true,
    }));
  }, [updateState]);

  const startReadyCheck = useCallback(() => {
      if (ws.current?.readyState === WebSocket.OPEN && gameStateRef.current.gameId) {
        ws.current.send(JSON.stringify({ type: 'START_READY_CHECK', gameId: gameStateRef.current.gameId }));
      }
  }, []);
  
  const playerReady = useCallback(() => {
      if (ws.current?.readyState === WebSocket.OPEN && gameStateRef.current.gameId && localPlayerIdRef.current !== null) {
          ws.current.send(JSON.stringify({ type: 'PLAYER_READY', gameId: gameStateRef.current.gameId, playerId: localPlayerIdRef.current }));
      }
  }, []);

  const assignTeams = useCallback((teamAssignments: Record<number, number[]>) => {
       if (ws.current?.readyState === WebSocket.OPEN && gameStateRef.current.gameId) {
          ws.current.send(JSON.stringify({ type: 'ASSIGN_TEAMS', gameId: gameStateRef.current.gameId, assignments: teamAssignments }));
      }
  }, []);

  const setGameMode = useCallback((mode: GameMode) => {
      if (ws.current?.readyState === WebSocket.OPEN && gameStateRef.current.gameId) {
          ws.current.send(JSON.stringify({ type: 'SET_GAME_MODE', gameId: gameStateRef.current.gameId, mode }));
      }
  }, []);
  
  const setGamePrivacy = useCallback((isPrivate: boolean) => {
       if (ws.current?.readyState === WebSocket.OPEN && gameStateRef.current.gameId) {
          ws.current.send(JSON.stringify({ type: 'SET_GAME_PRIVACY', gameId: gameStateRef.current.gameId, isPrivate }));
      }
  }, []);

  const syncGame = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN && gameStateRef.current.gameId && localPlayerIdRef.current === 1) {
        // 1. Sync Definitions
        ws.current.send(JSON.stringify({
              type: 'UPDATE_DECK_DATA',
              deckData: rawJsonData
        }));

        // 2. Refresh local state cards with latest definitions
        // This ensures the Host's state is fully up-to-date before sending
        const currentState = gameStateRef.current;
        const refreshedState = JSON.parse(JSON.stringify(currentState));
        
        // Refresh cards in hand/deck/board with latest logic/text
        refreshedState.players.forEach((p: Player) => {
             ['hand', 'deck', 'discard'].forEach(pile => {
                 // @ts-ignore
                 if (p[pile]) {
                    // @ts-ignore
                    p[pile] = p[pile].map(c => {
                        const def = getCardDefinitionByName(c.name);
                        return def ? { ...c, ...def } : c;
                    });
                 }
             });
             if (p.announcedCard) {
                 const def = getCardDefinitionByName(p.announcedCard.name);
                 if (def) p.announcedCard = { ...p.announcedCard, ...def };
             }
        });
        
        refreshedState.board.forEach((row: any[]) => {
            row.forEach(cell => {
                if (cell.card) {
                     const def = getCardDefinitionByName(cell.card.name);
                     if (def) cell.card = { ...cell.card, ...def };
                }
            });
        });

        // 3. Send Force Sync
        ws.current.send(JSON.stringify({
            type: 'FORCE_SYNC',
            gameState: refreshedState
        }));
        
        // Also update local
        setGameState(refreshedState);
    }
  }, []);

    const resetGame = useCallback(() => {
        updateState(currentState => {
            if (localPlayerIdRef.current !== 1) return currentState;

            const newPlayers = currentState.players.map(player => {
                const newDeck = createDeck(player.selectedDeck, player.id, player.name);
                return {
                    ...player,
                    hand: [],
                    deck: newDeck,
                    discard: [],
                    announcedCard: null,
                    score: 0,
                    isReady: false,
                };
            });

            return {
                ...currentState,
                players: newPlayers,
                board: createInitialBoard(),
                isGameStarted: false,
                isReadyCheckActive: false,
                revealRequests: [],
                activeTurnPlayerId: undefined,
                currentPhase: 0,
            };
        });
    }, [updateState, createDeck]);


  /**
   * Sets the active grid size and recalculates board statuses.
   * @param {GridSize} size - The new grid size.
   */
  const setActiveGridSize = useCallback((size: GridSize) => {
    updateState(currentState => {
      if (currentState.isGameStarted) return currentState;
      const newState = { ...currentState, activeGridSize: size };
      newState.board = recalculateBoardStatuses(newState);
      return newState;
    });
  }, [updateState]);
  
  /**
   * Adds or removes dummy players from the game.
   * @param {number} count - The desired number of dummy players.
   */
  const setDummyPlayerCount = useCallback((count: number) => {
    updateState(currentState => {
      if (currentState.isGameStarted) return currentState;
      const realPlayers = currentState.players.filter(p => !p.isDummy);
      if (realPlayers.length + count > MAX_PLAYERS) return currentState;

      const newPlayers = [...realPlayers];
      for (let i = 0; i < count; i++) {
          const dummyId = newPlayers.length + 1;
          const dummyPlayer = createNewPlayer(dummyId, true);
          dummyPlayer.name = `Dummy ${i + 1}`;
          newPlayers.push(dummyPlayer);
      }
      return { ...currentState, players: newPlayers, dummyPlayerCount: count };
    });
  }, [updateState, createNewPlayer]);

  /**
   * Adds a stackable status to a board card.
   * @param {{ row: number; col: number }} boardCoords - The card's position.
   * @param {string} status - The status to add.
   */
  const addBoardCardStatus = useCallback((boardCoords: { row: number; col: number }, status: string, addedByPlayerId: number) => {
    updateState(currentState => {
        if (!currentState.isGameStarted) return currentState;
        const newState: GameState = JSON.parse(JSON.stringify(currentState));
        const card = newState.board[boardCoords.row][boardCoords.col].card;
        if (card) {
            if (['Support', 'Threat', 'Revealed'].includes(status)) {
                const alreadyHasStatusFromPlayer = card.statuses?.some(s => s.type === status && s.addedByPlayerId === addedByPlayerId);
                if (alreadyHasStatusFromPlayer) {
                    return currentState; // Abort if status of this type from this player already exists
                }
            }
            if (!card.statuses) card.statuses = [];
            card.statuses.push({ type: status, addedByPlayerId });
        }
        return newState;
    });
  }, [updateState]);

  /**
   * Removes the most recently added instance of a stackable status from a board card.
   * @param {{ row: number; col: number }} boardCoords - The card's position.
   * @param {string} status - The status to remove.
   */
  const removeBoardCardStatus = useCallback((boardCoords: { row: number; col: number }, status: string) => {
    updateState(currentState => {
        if (!currentState.isGameStarted) return currentState;
        const newState: GameState = JSON.parse(JSON.stringify(currentState));
        const card = newState.board[boardCoords.row][boardCoords.col].card;
        if (card?.statuses) {
            const lastIndex = card.statuses.map(s => s.type).lastIndexOf(status);
            if (lastIndex > -1) {
                card.statuses.splice(lastIndex, 1);
            }
        }
        return newState;
    });
  }, [updateState]);

    const modifyBoardCardPower = useCallback((boardCoords: { row: number; col: number }, delta: number) => {
    updateState(currentState => {
        if (!currentState.isGameStarted) return currentState;
        const newState: GameState = JSON.parse(JSON.stringify(currentState));
        const card = newState.board[boardCoords.row][boardCoords.col].card;
        if (card) {
            if (card.powerModifier === undefined) card.powerModifier = 0;
            card.powerModifier += delta;
        }
        return newState;
    });
  }, [updateState]);

  const addAnnouncedCardStatus = useCallback((playerId: number, status: string, addedByPlayerId: number) => {
    updateState(currentState => {
        if (!currentState.isGameStarted) return currentState;
        const newState: GameState = JSON.parse(JSON.stringify(currentState));
        const player = newState.players.find(p => p.id === playerId);
        if (player && player.announcedCard) {
            if (['Support', 'Threat', 'Revealed'].includes(status)) {
                const alreadyHasStatusFromPlayer = player.announcedCard.statuses?.some(s => s.type === status && s.addedByPlayerId === addedByPlayerId);
                if (alreadyHasStatusFromPlayer) {
                    return currentState; // Abort if status of this type from this player already exists
                }
            }
            if (!player.announcedCard.statuses) player.announcedCard.statuses = [];
            player.announcedCard.statuses.push({ type: status, addedByPlayerId });
        }
        return newState;
    });
  }, [updateState]);

  const removeAnnouncedCardStatus = useCallback((playerId: number, status: string) => {
    updateState(currentState => {
        if (!currentState.isGameStarted) return currentState;
        const newState: GameState = JSON.parse(JSON.stringify(currentState));
        const player = newState.players.find(p => p.id === playerId);
        if (player && player.announcedCard?.statuses) {
            const lastIndex = player.announcedCard.statuses.map(s => s.type).lastIndexOf(status);
            if (lastIndex > -1) {
                player.announcedCard.statuses.splice(lastIndex, 1);
            }
        }
        return newState;
    });
  }, [updateState]);

    const modifyAnnouncedCardPower = useCallback((playerId: number, delta: number) => {
    updateState(currentState => {
        if (!currentState.isGameStarted) return currentState;
        const newState: GameState = JSON.parse(JSON.stringify(currentState));
        const player = newState.players.find(p => p.id === playerId);
        if (player && player.announcedCard) {
             if (player.announcedCard.powerModifier === undefined) player.announcedCard.powerModifier = 0;
            player.announcedCard.powerModifier += delta;
        }
        return newState;
    });
  }, [updateState]);

    const addHandCardStatus = useCallback((playerId: number, cardIndex: number, status: string, addedByPlayerId: number) => {
    updateState(currentState => {
        if (!currentState.isGameStarted) return currentState;
        const newState: GameState = JSON.parse(JSON.stringify(currentState));
        const player = newState.players.find(p => p.id === playerId);
        if (player && player.hand[cardIndex]) {
            const card = player.hand[cardIndex];
             // Prevent duplicate unique statuses from same player
             if (['Support', 'Threat', 'Revealed'].includes(status)) {
                const alreadyHasStatusFromPlayer = card.statuses?.some(s => s.type === status && s.addedByPlayerId === addedByPlayerId);
                if (alreadyHasStatusFromPlayer) {
                    return currentState;
                }
            }
            if (!card.statuses) card.statuses = [];
            card.statuses.push({ type: status, addedByPlayerId });
        }
        return newState;
    });
  }, [updateState]);

  const removeHandCardStatus = useCallback((playerId: number, cardIndex: number, status: string) => {
    updateState(currentState => {
        if (!currentState.isGameStarted) return currentState;
        const newState: GameState = JSON.parse(JSON.stringify(currentState));
        const player = newState.players.find(p => p.id === playerId);
        const card = player?.hand[cardIndex];
        if (card?.statuses) {
            const lastIndex = card.statuses.map(s => s.type).lastIndexOf(status);
            if (lastIndex > -1) {
                card.statuses.splice(lastIndex, 1);
            }
            // Sync revealedTo property
             if (status === 'Revealed') {
                const hasRevealed = card.statuses.some(s => s.type === 'Revealed');
                if (!hasRevealed) {
                    delete card.revealedTo;
                }
            }
        }
        return newState;
    });
  }, [updateState]);


  /**
   * Flips a face-down card on the board to be face-up.
   * @param {{ row: number; col: number }} boardCoords - The card's position.
   */
  const flipBoardCard = useCallback((boardCoords: { row: number; col: number }) => {
    updateState(currentState => {
        if (!currentState.isGameStarted) return currentState;
        const newState: GameState = JSON.parse(JSON.stringify(currentState));
        const card = newState.board[boardCoords.row][boardCoords.col].card;
        if (card) {
            card.isFaceDown = false;
        }
        newState.board = recalculateBoardStatuses(newState);
        return newState;
    });
  }, [updateState]);
  
  /**
   * Flips a face-up card on the board to be face-down.
   * @param {{ row: number; col: number }} boardCoords - The card's position.
   */
  const flipBoardCardFaceDown = useCallback((boardCoords: { row: number; col: number }) => {
    updateState(currentState => {
        if (!currentState.isGameStarted) return currentState;
        const newState: GameState = JSON.parse(JSON.stringify(currentState));
        const card = newState.board[boardCoords.row][boardCoords.col].card;
        if (card) {
            card.isFaceDown = true;
        }
        newState.board = recalculateBoardStatuses(newState);
        return newState;
    });
  }, [updateState]);
  
  /**
   * Sets the reveal status of a card in a player's hand.
   * @param {number} playerId - The ID of the player owning the card.
   * @param {number} cardIndex - The index of the card in the hand.
   * @param {'all' | number[]} revealTarget - Who to reveal the card to.
   */
  const revealHandCard = useCallback((playerId: number, cardIndex: number, revealTarget: 'all' | number[]) => {
    updateState(currentState => {
        const player = currentState.players.find(p => p.id === playerId);
        if (!player || !player.hand[cardIndex]) return currentState;

        const newState: GameState = JSON.parse(JSON.stringify(currentState));
        const cardToReveal = newState.players.find(p => p.id === playerId)!.hand[cardIndex];

        if (revealTarget === 'all') {
            cardToReveal.revealedTo = 'all';
            // Add the "Revealed" status
            if (!cardToReveal.statuses) cardToReveal.statuses = [];
            // Check if status from this player already exists to avoid duplicates
            if (!cardToReveal.statuses.some(s => s.type === 'Revealed' && s.addedByPlayerId === playerId)) {
                cardToReveal.statuses.push({ type: 'Revealed', addedByPlayerId: playerId });
            }
        } else {
            if (!cardToReveal.revealedTo || cardToReveal.revealedTo === 'all' || !Array.isArray(cardToReveal.revealedTo)) {
                cardToReveal.revealedTo = [];
            }
            const newRevealedIds = revealTarget.filter(id => !(cardToReveal.revealedTo as number[]).includes(id));
            (cardToReveal.revealedTo as number[]).push(...newRevealedIds);
        }
        
        return newState;
    });
  }, [updateState]);

  /**
   * Sets the reveal status of a face-down card on the board.
   * @param {{ row: number, col: number }} boardCoords - The card's position.
   * @param {'all' | number[]} revealTarget - Who to reveal the card to.
   */
  const revealBoardCard = useCallback((boardCoords: { row: number, col: number }, revealTarget: 'all' | number[]) => {
    updateState(currentState => {
        const cardToReveal = currentState.board[boardCoords.row][boardCoords.col].card;
        if (!cardToReveal) return currentState;

        const newState: GameState = JSON.parse(JSON.stringify(currentState));
        const cardInNewState = newState.board[boardCoords.row][boardCoords.col].card!;
        const ownerId = cardInNewState.ownerId;

        if (revealTarget === 'all') {
            cardInNewState.revealedTo = 'all';
            // Add the "Revealed" status
            if(ownerId !== undefined) {
                if (!cardInNewState.statuses) cardInNewState.statuses = [];
                if (!cardInNewState.statuses.some(s => s.type === 'Revealed' && s.addedByPlayerId === ownerId)) {
                    cardInNewState.statuses.push({ type: 'Revealed', addedByPlayerId: ownerId });
                }
            }
        } else {
            if (!cardInNewState.revealedTo || cardInNewState.revealedTo === 'all' || !Array.isArray(cardInNewState.revealedTo)) {
                cardInNewState.revealedTo = [];
            }
            const newRevealedIds = revealTarget.filter(id => !(cardInNewState.revealedTo as number[]).includes(id));
            (cardInNewState.revealedTo as number[]).push(...newRevealedIds);
        }
        
        return newState;
    });
  }, [updateState]);

    const requestCardReveal = useCallback((cardIdentifier: CardIdentifier, requestingPlayerId: number) => {
        updateState(currentState => {
            const ownerId = cardIdentifier.boardCoords
                ? currentState.board[cardIdentifier.boardCoords.row][cardIdentifier.boardCoords.col].card?.ownerId
                : cardIdentifier.ownerId;

            if (!ownerId) return currentState;
            
            const newState: GameState = JSON.parse(JSON.stringify(currentState));
            const existingRequest = newState.revealRequests.find(
                (req: RevealRequest) => req.fromPlayerId === requestingPlayerId && req.toPlayerId === ownerId
            );

            if (existingRequest) {
                // Avoid adding duplicate card requests
                const cardAlreadyRequested = existingRequest.cardIdentifiers.some(ci => 
                    JSON.stringify(ci) === JSON.stringify(cardIdentifier)
                );
                if (!cardAlreadyRequested) {
                    existingRequest.cardIdentifiers.push(cardIdentifier);
                }
            } else {
                newState.revealRequests.push({
                    fromPlayerId: requestingPlayerId,
                    toPlayerId: ownerId,
                    cardIdentifiers: [cardIdentifier],
                });
            }
            return newState;
        });
    }, [updateState]);

    const respondToRevealRequest = useCallback((fromPlayerId: number, accepted: boolean) => {
        updateState(currentState => {
            const requestIndex = currentState.revealRequests.findIndex(
                (req: RevealRequest) => req.toPlayerId === localPlayerIdRef.current && req.fromPlayerId === fromPlayerId
            );
            if (requestIndex === -1) return currentState;

            const newState: GameState = JSON.parse(JSON.stringify(currentState));
            const request = newState.revealRequests[requestIndex];
            
            if (accepted) {
                const { toPlayerId, cardIdentifiers } = request;
                for (const cardIdentifier of cardIdentifiers) {
                    let cardToUpdate: Card | null = null;
                    if (cardIdentifier.source === 'board' && cardIdentifier.boardCoords) {
                        cardToUpdate = newState.board[cardIdentifier.boardCoords.row][cardIdentifier.boardCoords.col].card;
                    } else if (cardIdentifier.source === 'hand' && cardIdentifier.ownerId && cardIdentifier.cardIndex !== undefined) {
                        const owner = newState.players.find(p => p.id === cardIdentifier.ownerId);
                        if (owner) {
                            cardToUpdate = owner.hand[cardIdentifier.cardIndex];
                        }
                    }

                    if (cardToUpdate) {
                        if (!cardToUpdate.statuses) cardToUpdate.statuses = [];
                        // For the requester - ONLY add this token for the specific request
                        if (!cardToUpdate.statuses.some(s => s.type === 'Revealed' && s.addedByPlayerId === fromPlayerId)) {
                            cardToUpdate.statuses.push({ type: 'Revealed', addedByPlayerId: fromPlayerId });
                        }
                    }
                }
            }

            newState.revealRequests.splice(requestIndex, 1);
            return newState;
        });
    }, [updateState]);
    
    const removeRevealedStatus = useCallback((cardIdentifier: { source: 'hand' | 'board'; playerId?: number; cardIndex?: number; boardCoords?: { row: number, col: number }}) => {
        updateState(currentState => {
            const newState: GameState = JSON.parse(JSON.stringify(currentState));
            let cardToUpdate: Card | null = null;

            if (cardIdentifier.source === 'board' && cardIdentifier.boardCoords) {
                cardToUpdate = newState.board[cardIdentifier.boardCoords.row][cardIdentifier.boardCoords.col].card;
            } else if (cardIdentifier.source === 'hand' && cardIdentifier.playerId && cardIdentifier.cardIndex !== undefined) {
                const owner = newState.players.find(p => p.id === cardIdentifier.playerId);
                if (owner) {
                    cardToUpdate = owner.hand[cardIdentifier.cardIndex];
                }
            }
            
            if (cardToUpdate) {
                if (cardToUpdate.statuses) {
                    cardToUpdate.statuses = cardToUpdate.statuses.filter(s => s.type !== 'Revealed');
                }
                // Reset 'revealedTo' property to ensure the card is hidden again for non-owners
                delete cardToUpdate.revealedTo;
            }

            return newState;
        });
    }, [updateState]);


  /**
   * Updates a player's name.
   * @param {number} playerId - The ID of the player to update.
   * @param {string} name - The new name.
   */
  const updatePlayerName = useCallback((playerId: number, name:string) => {
    updateState(currentState => {
      if (currentState.isGameStarted) return currentState;
      return {
      ...currentState,
      players: currentState.players.map(p => p.id === playerId ? { ...p, name } : p)
    }});
  }, [updateState]);
  
  const changePlayerColor = useCallback((playerId: number, color: PlayerColor) => {
      updateState(currentState => {
        if (currentState.isGameStarted) return currentState;
        
        const isColorTaken = currentState.players.some(p => p.id !== playerId && !p.isDummy && p.color === color);
        if (isColorTaken) return currentState;

        return {
            ...currentState,
            players: currentState.players.map(p => p.id === playerId ? { ...p, color } : p),
        };
      });
  }, [updateState]);

  /**
   * Updates a player's score by a given delta.
   * @param {number} playerId - The ID of the player to update.
   * @param {number} delta - The amount to add to the score (can be negative).
   */
  const updatePlayerScore = useCallback((playerId: number, delta: number) => {
    updateState(currentState => {
      if (!currentState.isGameStarted) return currentState;
      return {
      ...currentState,
      players: currentState.players.map(p => p.id === playerId ? { ...p, score: p.score + delta } : p)
    }});
  }, [updateState]);
  
  /**
   * Changes a player's deck, resetting their hand and discard pile.
   * @param {number} playerId - The ID of the player.
   * @param {DeckType} deckType - The new deck type.
   */
  const changePlayerDeck = useCallback((playerId: number, deckType: DeckType) => {
    updateState(currentState => {
      if (currentState.isGameStarted) return currentState;
      return {
      ...currentState,
      players: currentState.players.map(p => 
        p.id === playerId 
          ? { ...p, deck: createDeck(deckType, playerId, p.name), selectedDeck: deckType, hand: [], discard: [], announcedCard: null }
          : p
      )
    }});
  }, [updateState, createDeck]);
  
  /**
   * Loads a custom deck file for a player.
   * @param {number} playerId The ID of the player.
   * @param {CustomDeckFile} deckFile The parsed custom deck file.
   */
  const loadCustomDeck = useCallback((playerId: number, deckFile: CustomDeckFile) => {
    updateState(currentState => {
        if (currentState.isGameStarted) return currentState;
        
        const player = currentState.players.find(p => p.id === playerId);
        if (!player) return currentState;

        const newDeck: Card[] = [];
        let cardInstanceCounter = new Map<string, number>();

        for (const { cardId, quantity } of deckFile.cards) {
            const cardDef = getCardDefinition(cardId);
            if (!cardDef) continue;

            const isCommandCard = commandCardIds.has(cardId);
            const deckType = isCommandCard ? DeckType.Command : DeckType.Custom;
            const prefix = isCommandCard ? 'CMD' : 'CUS';

            for (let i = 0; i < quantity; i++) {
                const instanceNum = (cardInstanceCounter.get(cardId) || 0) + 1;
                cardInstanceCounter.set(cardId, instanceNum);

                newDeck.push({
                    ...cardDef,
                    id: `${prefix}_${cardId.toUpperCase()}_${instanceNum}`,
                    deck: deckType,
                    ownerId: playerId,
                    ownerName: player.name,
                });
            }
        }
        
        return {
            ...currentState,
            players: currentState.players.map(p =>
                p.id === playerId
                    ? { ...p, deck: shuffleDeck(newDeck), selectedDeck: DeckType.Custom, hand: [], discard: [], announcedCard: null }
                    : p
            )
        };
    });
  }, [updateState]);

  /**
   * Draws a card from a player's deck and adds it to their hand.
   * @param {number} playerId - The ID of the player drawing a card.
   */
  const drawCard = useCallback((playerId: number) => {
    updateState(currentState => {
      if (!currentState.isGameStarted) return currentState;
      const player = currentState.players.find(p => p.id === playerId);
      if (!player || player.deck.length === 0) return currentState;
      
      const newState = JSON.parse(JSON.stringify(currentState));
      const playerToUpdate = newState.players.find((p: Player) => p.id === playerId)!;
      const cardDrawn = playerToUpdate.deck.shift();
      if (cardDrawn) {
        playerToUpdate.hand.push(cardDrawn);
      }
      return newState;
    });
  }, [updateState]);

  /**
   * Shuffles a player's deck.
   * @param {number} playerId - The ID of the player whose deck to shuffle.
   */
  const shufflePlayerDeck = useCallback((playerId: number) => {
    updateState(currentState => {
      if (!currentState.isGameStarted) return currentState;
      const player = currentState.players.find(p => p.id === playerId);
      if (!player) return currentState;
      
      const newState = JSON.parse(JSON.stringify(currentState));
      const playerToUpdate = newState.players.find((p: Player) => p.id === playerId)!;
      playerToUpdate.deck = shuffleDeck(playerToUpdate.deck);
      return newState;
    });
  }, [updateState]);
  
    const toggleActiveTurnPlayer = useCallback((playerId: number) => {
        updateState(currentState => {
            const newActiveId = currentState.activeTurnPlayerId === playerId ? undefined : playerId;
            return {
                ...currentState,
                activeTurnPlayerId: newActiveId,
            };
        });
    }, [updateState]);

    const setPhase = useCallback((phaseIndex: number) => {
        updateState(currentState => {
            if (!currentState.isGameStarted) return currentState;
            return {
                ...currentState,
                currentPhase: Math.max(0, Math.min(phaseIndex, TURN_PHASES.length - 1))
            };
        });
    }, [updateState]);

    const nextPhase = useCallback(() => {
        updateState(currentState => {
            if (!currentState.isGameStarted) return currentState;
            const nextPhaseIndex = currentState.currentPhase + 1;

            if (nextPhaseIndex >= TURN_PHASES.length) {
                // Determine who is finishing their turn
                const finishingPlayerId = currentState.activeTurnPlayerId;

                // --- 1. Stun Decay Logic ---
                // Before switching players, iterate through the board and reduce 'Stun' status 
                // for the player who just finished their turn (Commit phase).
                const newState: GameState = JSON.parse(JSON.stringify(currentState));
                
                if (finishingPlayerId !== undefined) {
                    newState.board.forEach(row => {
                        row.forEach(cell => {
                            if (cell.card && cell.card.ownerId === finishingPlayerId && cell.card.statuses) {
                                // Find index of a Stun status
                                const stunIndex = cell.card.statuses.findIndex(s => s.type === 'Stun');
                                if (stunIndex !== -1) {
                                    // Remove exactly one Stun token
                                    cell.card.statuses.splice(stunIndex, 1);
                                }
                            }
                        });
                    });
                }

                // If we hit the end of phases, reset to Setup (0) and switch active player
                let nextPlayerId = finishingPlayerId;
                
                if (nextPlayerId !== undefined) {
                    const sortedPlayers = [...newState.players].sort((a, b) => a.id - b.id);
                    const currentIndex = sortedPlayers.findIndex(p => p.id === nextPlayerId);
                    
                    if (currentIndex !== -1) {
                         // Find next player ID, cycling back to start
                        let nextIndex = (currentIndex + 1) % sortedPlayers.length;
                        // Skip disconnected players? Maybe not, allow turn passing.
                        nextPlayerId = sortedPlayers[nextIndex].id;
                    }
                }
                
                // --- Reset enteredThisTurn for all cards when the turn (and phases) reset for next player ---
                newState.currentPhase = 0;
                newState.activeTurnPlayerId = nextPlayerId;

                newState.board.forEach(row => {
                    row.forEach(cell => {
                        if (cell.card) {
                            delete cell.card.enteredThisTurn;
                            // Reset ability usage tracking for the new turn
                            delete cell.card.abilityUsedInPhase;
                        }
                    });
                });

                return newState;
            } else {
                return {
                    ...currentState,
                    currentPhase: nextPhaseIndex
                };
            }
        });
    }, [updateState]);

    const prevPhase = useCallback(() => {
        updateState(currentState => {
            if (!currentState.isGameStarted) return currentState;
             // Simple decrement, clamping at 0. Doesn't reverse turn logic for now.
            return {
                ...currentState,
                currentPhase: Math.max(0, currentState.currentPhase - 1)
            };
        });
    }, [updateState]);

  /**
   * Moves a card from one location to another (e.g., hand to board).
   * @param {DragItem} item - The item being dragged.
   * @param {DropTarget} target - The location to drop the item.
   */
  const moveItem = useCallback((item: DragItem, target: DropTarget) => {
    updateState(currentState => {
        if (!currentState.isGameStarted) return currentState;

        // Strict Occupancy Check: Prevent placing cards/tokens on occupied cells.
        // Only 'counter_panel' items (status counters) are allowed on occupied cells.
        if (target.target === 'board' && target.boardCoords) {
             const targetCell = currentState.board[target.boardCoords.row][target.boardCoords.col];
             // If cell is occupied and we are NOT applying a counter (which adds status), abort.
             if (targetCell.card !== null && item.source !== 'counter_panel') {
                 return currentState;
             }
        }

        // Create a deep copy to avoid direct state mutation.
        const newState: GameState = JSON.parse(JSON.stringify(currentState));
        
        // Ownership check: Prevent non-owners from moving cards from board to hand/deck/discard
        // UNLESS the item has bypassOwnershipCheck set to true (e.g. Destroy effects)
        if (item.source === 'board' && ['hand', 'deck', 'discard'].includes(target.target) && !item.bypassOwnershipCheck) {
            const cardOwnerId = item.card.ownerId;
            const cardOwner = newState.players.find(p => p.id === cardOwnerId);
            const isOwner = cardOwnerId === localPlayerIdRef.current;
            const isDummyCard = !!cardOwner?.isDummy;

            if (!isOwner && !isDummyCard) {
                // Abort the move if the current player is not the owner and it's not a dummy card.
                return currentState;
            }
        }

        // --- Stun Movement Restriction Logic ---
        // If moving a card ON the board (Board to Board), check Stun status.
        // Rule: Owners cannot move stunned cards. Opponents (non-allies) can.
        if (item.source === 'board' && target.target === 'board') {
            const card = item.card;
            // Need to check STATUSES on the card. item.card might be stale if drag started long ago, 
            // but usually safe. Best to check the board state if possible, but item.card is what we have.
            // Actually, item.card comes from the DragItem state set onDragStart. 
            // If statuses changed mid-drag (unlikely via sync), it might be stale.
            // Let's check `currentState` board to be safe.
            let currentCardState = card;
            if (item.boardCoords) {
                 const cell = currentState.board[item.boardCoords.row][item.boardCoords.col];
                 if (cell.card) currentCardState = cell.card;
            }

            const isStunned = currentCardState.statuses?.some(s => s.type === 'Stun');

            if (isStunned) {
                const moverId = localPlayerIdRef.current;
                const ownerId = currentCardState.ownerId;
                
                // Identify if Mover is Owner or Teammate
                const moverPlayer = currentState.players.find(p => p.id === moverId);
                const ownerPlayer = currentState.players.find(p => p.id === ownerId);

                const isOwner = moverId === ownerId;
                const isTeammate = moverPlayer?.teamId !== undefined && ownerPlayer?.teamId !== undefined && moverPlayer.teamId === ownerPlayer.teamId;
                
                if (isOwner || isTeammate) {
                     // Block the move
                     return currentState;
                }
            }
        }
        
        // --- Handle Counter Application (Logic for modifying existing cards) ---
        if (item.source === 'counter_panel' && item.statusType) {
            // Check allowed targets for this counter type
            const counterDef = countersDatabase[item.statusType];
            const allowedTargets = counterDef?.allowedTargets || ['board', 'hand'];
            
            if (!allowedTargets.includes(target.target)) {
                return currentState;
            }

            let targetCard: Card | null = null;

            // Find the target card based on drop location
            if (target.target === 'board' && target.boardCoords) {
                targetCard = newState.board[target.boardCoords.row][target.boardCoords.col].card;
            } else if (target.playerId !== undefined) {
                const targetPlayer = newState.players.find(p => p.id === target.playerId);
                if (targetPlayer) {
                    if (target.target === 'hand' && target.cardIndex !== undefined) {
                        targetCard = targetPlayer.hand[target.cardIndex];
                    }
                    if (target.target === 'announced') {
                        targetCard = targetPlayer.announcedCard || null;
                    }

                     // If dropping onto deck/discard piles (no specific index usually), apply to top card?
                     if (target.target === 'deck' && targetPlayer.deck.length > 0) {
                         if (target.deckPosition === 'top' || !target.deckPosition) {
                             targetCard = targetPlayer.deck[0];
                         } else {
                             targetCard = targetPlayer.deck[targetPlayer.deck.length - 1];
                         }
                     } else if (target.target === 'discard' && targetPlayer.discard.length > 0) {
                         // Apply to top card of discard
                         targetCard = targetPlayer.discard[targetPlayer.discard.length - 1];
                     }
                }
            }

            // Note: App.tsx `handleGlobalMouseUp` handles specific card drops (like hand cards) 
            // by calling specific logic or passing specific coords. 
            // If we are here with `target='board'`, `targetCard` is found above.
            
            // If we found a valid card to modify
            if (targetCard) {
                const count = item.count || 1;
                
                if (item.statusType === 'Power+') {
                    if (targetCard.powerModifier === undefined) targetCard.powerModifier = 0;
                    targetCard.powerModifier += (1 * count);
                } else if (item.statusType === 'Power-') {
                    if (targetCard.powerModifier === undefined) targetCard.powerModifier = 0;
                    targetCard.powerModifier -= (1 * count);
                } else {
                    // Regular statuses
                    if (!targetCard.statuses) targetCard.statuses = [];
                    
                    // Add 'count' instances of the status
                    for(let i=0; i<count; i++) {
                        if (['Support', 'Threat', 'Revealed'].includes(item.statusType!)) {
                            // These statuses are unique per player, don't stack duplicates from same player
                            const exists = targetCard.statuses.some(s => s.type === item.statusType && s.addedByPlayerId === localPlayerIdRef.current);
                            if (!exists && localPlayerIdRef.current !== null) {
                                targetCard.statuses.push({ type: item.statusType!, addedByPlayerId: localPlayerIdRef.current });
                            }
                        } else {
                            if (localPlayerIdRef.current !== null) {
                                targetCard.statuses.push({ type: item.statusType!, addedByPlayerId: localPlayerIdRef.current });
                            }
                        }
                    }
                }
                
                // Recalculate board statuses if we modified a board card
                if (target.target === 'board') {
                     newState.board = recalculateBoardStatuses(newState);
                }
                
                return newState;
            }
            
            // If source is counter but we didn't find a target card (or it wasn't allowed), abort.
            return currentState;
        }

        // --- Standard Card Move Logic ---

        let cardToMove: Card = { ...item.card };

        // --- Remove the card from its source location ---
        if (item.source === 'hand' && item.playerId !== undefined && item.cardIndex !== undefined) {
            const player = newState.players.find(p => p.id === item.playerId);
            if (player) player.hand.splice(item.cardIndex, 1);
        } else if (item.source === 'board' && item.boardCoords) {
            newState.board[item.boardCoords.row][item.boardCoords.col].card = null;
        } else if (item.source === 'discard' && item.playerId !== undefined && item.cardIndex !== undefined) {
            const player = newState.players.find(p => p.id === item.playerId);
            if (player) player.discard.splice(item.cardIndex, 1);
        } else if (item.source === 'deck' && item.playerId !== undefined && item.cardIndex !== undefined) {
             const player = newState.players.find(p => p.id === item.playerId);
            if (player) player.deck.splice(item.cardIndex, 1);
        } else if (item.source === 'announced' && item.playerId !== undefined) {
            const player = newState.players.find(p => p.id === item.playerId);
            if (player) player.announcedCard = null;
        }
        // For 'token_panel', there's no source to remove from.

        // --- Pre-process card before adding to target ---
        const isReturningToStorage = ['hand', 'deck', 'discard'].includes(target.target);

        // When a card returns to a 'storage' location (hand, deck, discard),
        // clear all temporary statuses except 'Revealed', and reset its face-down state.
        if (isReturningToStorage) {
            if (cardToMove.statuses) {
                cardToMove.statuses = cardToMove.statuses.filter(status => status.type === 'Revealed');
            }
            // Reset face-down status. When played again, user chooses mode.
            cardToMove.isFaceDown = false;
            // Reset power modifier
            delete cardToMove.powerModifier;
            // Reset enteredThisTurn
            delete cardToMove.enteredThisTurn;
            // Reset ability usage tracking
            delete cardToMove.abilityUsedInPhase;
        } else if (target.target === 'board') {
            // When moving to board, ensure we initialize an empty status array if needed.
            if (!cardToMove.statuses) cardToMove.statuses = [];
            
            // If it's coming from hand or other sources (except board-to-board moves),
            // we might want to set default face-down state.
             if (item.source !== 'board' && cardToMove.isFaceDown === undefined) {
                 cardToMove.isFaceDown = false; // Default to Face Up for drag and drop
             }

             // Mark card as entering this turn if not already on board
             if (item.source !== 'board') {
                 cardToMove.enteredThisTurn = true;
             }
        }


        // --- Add the card to its target location ---
        if (target.target === 'hand' && target.playerId !== undefined) {
            // Remove Tokens or Counters if they hit the hand (effectively deleting them)
            if (cardToMove.deck === DeckType.Tokens || cardToMove.deck === 'counter') {
                return newState;
            }
            const player = newState.players.find(p => p.id === target.playerId);
            if (player) player.hand.push(cardToMove);
        } else if (target.target === 'board' && target.boardCoords) {
            // Only place if cell is empty. 
            // Note: We already checked occupancy at start of function, so this check is technically redundant but keeps logic safe.
            if (newState.board[target.boardCoords.row][target.boardCoords.col].card === null) {
                 // Assign owner if not set (e.g. generic tokens)
                if (cardToMove.ownerId === undefined && localPlayerIdRef.current !== null) {
                     const currentPlayer = newState.players.find(p => p.id === localPlayerIdRef.current);
                     if (currentPlayer) {
                         cardToMove.ownerId = currentPlayer.id;
                         cardToMove.ownerName = currentPlayer.name;
                     }
                }
                
                newState.board[target.boardCoords.row][target.boardCoords.col].card = cardToMove;
            }
        } else if (target.target === 'discard' && target.playerId !== undefined) {
            // If it's a Token (DeckType.Tokens) or Counter, do not add to discard pile. Effectively remove from game.
            if (cardToMove.deck === DeckType.Tokens || cardToMove.deck === 'counter') {
                // Do nothing. Card is removed from the game.
            } else {
                const player = newState.players.find(p => p.id === target.playerId);
                if (player) player.discard.push(cardToMove);
            }
        } else if (target.target === 'deck' && target.playerId !== undefined) {
             // Remove Tokens or Counters if they hit the deck (effectively deleting them)
            if (cardToMove.deck === DeckType.Tokens || cardToMove.deck === 'counter') {
                return newState;
            }
            const player = newState.players.find(p => p.id === target.playerId);
            if (player) {
                 if (target.deckPosition === 'top') {
                    player.deck.unshift(cardToMove);
                } else {
                    player.deck.push(cardToMove);
                }
            }
        } else if (target.target === 'announced' && target.playerId !== undefined) {
            const player = newState.players.find(p => p.id === target.playerId);
            if (player) {
                // If there was already a card, move it to discard? Or swap?
                // Simple implementation: Push old to discard if exists.
                if (player.announcedCard) {
                    player.discard.push(player.announcedCard);
                }
                player.announcedCard = cardToMove;
            }
        }

        // Recalculate board statuses if the board changed.
        if (item.source === 'board' || target.target === 'board') {
            newState.board = recalculateBoardStatuses(newState);
        }

        return newState;
    });
  }, [updateState]);

  const triggerHighlight = useCallback((highlightData: Omit<HighlightData, 'timestamp'>) => {
      if (ws.current?.readyState === WebSocket.OPEN && gameStateRef.current.gameId) {
          const fullHighlightData: HighlightData = {
              ...highlightData,
              timestamp: Date.now()
          };
          ws.current.send(JSON.stringify({
              type: 'TRIGGER_HIGHLIGHT',
              gameId: gameStateRef.current.gameId,
              highlightData: fullHighlightData
          }));
      }
  }, []);

  /**
   * Marks a card at the given coordinates as having used its ability for the current phase.
   * @param boardCoords Coordinates of the card on the board.
   */
  const markAbilityUsed = useCallback((boardCoords: { row: number, col: number }) => {
      updateState(currentState => {
          if (!currentState.isGameStarted) return currentState;
          const newState: GameState = JSON.parse(JSON.stringify(currentState));
          const card = newState.board[boardCoords.row][boardCoords.col].card;
          if (card) {
              card.abilityUsedInPhase = newState.currentPhase;
          }
          return newState;
      });
  }, [updateState]);

  return {
    gameState,
    localPlayerId,
    setLocalPlayerId,
    draggedItem,
    setDraggedItem,
    connectionStatus,
    gamesList,
    latestHighlight, // Expose the latest highlight from server
    createGame,
    joinGame,
    requestGamesList,
    exitGame,
    startGame,
    startReadyCheck,
    playerReady,
    assignTeams,
    setGameMode,
    setGamePrivacy,
    setActiveGridSize,
    setDummyPlayerCount,
    updatePlayerName,
    changePlayerColor,
    updatePlayerScore,
    changePlayerDeck,
    loadCustomDeck,
    drawCard,
    shufflePlayerDeck,
    moveItem,
    handleDrop: moveItem,
    addBoardCardStatus,
    removeBoardCardStatus,
    modifyBoardCardPower,
    addAnnouncedCardStatus,
    removeAnnouncedCardStatus,
    modifyAnnouncedCardPower,
    addHandCardStatus,
    removeHandCardStatus,
    flipBoardCard,
    flipBoardCardFaceDown,
    revealHandCard,
    revealBoardCard,
    requestCardReveal,
    respondToRevealRequest,
    syncGame,
    removeRevealedStatus,
    resetGame,
    toggleActiveTurnPlayer,
    forceReconnect,
    triggerHighlight, // Expose the trigger function
    nextPhase,
    prevPhase,
    setPhase,
    markAbilityUsed, // Expose function
  };
};