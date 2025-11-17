/**
 * @file This hook manages the entire game state, including player data, the board,
 * and communication with the WebSocket server.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { GameState, Player, Board, GridSize, Card, DragItem, DropTarget, PlayerColor, GameMode, RevealRequest, CardIdentifier, CustomDeckFile } from '../types';
import { DeckType, GameMode as GameModeEnum } from '../types';
import { shuffleDeck, PLAYER_COLOR_NAMES } from '../constants';
import { decksData, getCardDefinition, commandCardIds, deckFiles } from '../decks'; // Import static deck data

const MAX_PLAYERS = 4;
const GRID_MAX_SIZE = 7;

/**
 * Constructs the WebSocket URL based on the window's current location.
 * @returns {string} The WebSocket server URL.
 */
const getWebSocketURL = () => {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const hostname = window.location.hostname || 'localhost';
  // When deployed, the WebSocket server runs on the same host and default port (443 for wss, 80 for ws).
  // For local dev, Vite's proxy will handle forwarding, but the server is on 8080.
  // A robust solution is to use the host and let the browser/proxy figure out the port.
  // In production (like on Render), the port must be omitted.
  if (window.location.port && window.location.port !== '80' && window.location.port !== '443' && window.location.hostname === 'localhost') {
    return `${protocol}://${hostname}:8080`;
  }
  return `${protocol}://${hostname}`;
};

const WS_URL = getWebSocketURL();

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
  }), []);

  const [gameState, setGameState] = useState<GameState>(createInitialState);
  const [localPlayerId, setLocalPlayerId] = useState<number | null>(null);
  const [draggedItem, setDraggedItem] = useState<DragItem | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('Connecting');
  const [gamesList, setGamesList] = useState<{gameId: string, playerCount: number}[]>([]);
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
   * Updates the game state and broadcasts it to other players.
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
   * Establishes and manages the WebSocket connection, including event handlers and reconnection logic.
   */
  const connectWebSocket = useCallback(() => {
    if (ws.current && ws.current.readyState !== WebSocket.CLOSED) return;

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
        } else if (data.type === 'ERROR') {
            alert(data.message);
            // If an error occurs (e.g., game not found during rejoin), reset the state to show the main menu.
            localStorage.removeItem('reconnection_data');
            setGameState(createInitialState());
            setLocalPlayerId(null);
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
        ws.current.send(JSON.stringify({
            type: 'FORCE_SYNC',
            gameState: gameStateRef.current
        }));
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
                        // For the requester
                        if (!cardToUpdate.statuses.some(s => s.type === 'Revealed' && s.addedByPlayerId === fromPlayerId)) {
                            cardToUpdate.statuses.push({ type: 'Revealed', addedByPlayerId: fromPlayerId });
                        }
                        // For the owner, so they also see the 'R' status
                        if (!cardToUpdate.statuses.some(s => s.type === 'Revealed' && s.addedByPlayerId === toPlayerId)) {
                            cardToUpdate.statuses.push({ type: 'Revealed', addedByPlayerId: toPlayerId });
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
            
            if (cardToUpdate?.statuses) {
                cardToUpdate.statuses = cardToUpdate.statuses.filter(s => s.type !== 'Revealed');
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

            const isCommand = commandCardIds.has(cardId);
            const deckType = isCommand ? DeckType.Command : DeckType.Custom;
            const prefix = isCommand ? 'CMD' : 'CUS';

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
  
  /**
   * Moves a card from one location to another (e.g., hand to board).
   * @param {DragItem} item - The item being dragged.
   * @param {DropTarget} target - The location to drop the item.
   */
  const moveItem = useCallback((item: DragItem, target: DropTarget) => {
    updateState(currentState => {
        if (!currentState.isGameStarted) return currentState;
        // Create a deep copy to avoid direct state mutation.
        const newState: GameState = JSON.parse(JSON.stringify(currentState));
        
        // Ownership check: Prevent non-owners from moving cards from board to hand/deck/discard
        if (item.source === 'board' && ['hand', 'deck', 'discard'].includes(target.target)) {
            const cardOwnerId = item.card.ownerId;
            const cardOwner = newState.players.find(p => p.id === cardOwnerId);
            const isOwner = cardOwnerId === localPlayerIdRef.current;
            const isDummyCard = !!cardOwner?.isDummy;

            if (!isOwner && !isDummyCard) {
                // Abort the move if the current player is not the owner and it's not a dummy card.
                return currentState;
            }
        }
        
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
        // For 'token_panel' or 'counter_panel', there's no source to remove from.

        // --- Pre-process card before adding to target ---
        const isReturningToStorage = ['hand', 'deck', 'discard'].includes(target.target);

        // When a card returns to a 'storage' location (hand, deck, discard),
        // clear all temporary statuses except 'Revealed'.
        if (isReturningToStorage && cardToMove.statuses) {
            cardToMove.statuses = cardToMove.statuses.filter(status => status.type === 'Revealed');
        }

        // --- Add the card to the target location ---
        if (target.target === 'hand' && target.playerId !== undefined) {
            const player = newState.players.find(p => p.id === target.playerId);
            // Tokens and counters cannot go to hand.
            if (player && cardToMove.deck !== 'counter' && cardToMove.deck !== DeckType.Tokens) {
                player.hand.push(cardToMove);
            }
        } else if (target.target === 'board' && target.boardCoords) {
            const cell = newState.board[target.boardCoords.row][target.boardCoords.col];
            if (!cell.card) { // Only place if the cell is empty
                // Respect explicit faceDown status from playMode, otherwise apply defaults.
                if (typeof item.card.isFaceDown === 'boolean') {
                    cardToMove.isFaceDown = item.card.isFaceDown;
                } else {
                    // Defaults for drag-and-drop
                    if (item.source === 'hand') {
                        cardToMove.isFaceDown = true; // from hand -> face down
                    } else if (item.source === 'token_panel') {
                        cardToMove.isFaceDown = false; // from token panel -> face up
                    }
                }

                // Assign owner to new tokens when they are first played
                if (item.source === 'token_panel') {
                    const player = newState.players.find(p => p.id === localPlayerIdRef.current);
                    if (player) {
                        cardToMove.ownerId = player.id;
                        cardToMove.ownerName = player.name;
                    }
                }
                
                cell.card = cardToMove;
                
                // If a card is played from an external source (not just moved on the board),
                // it becomes the "last played" card for its owner.
                const isPlayedFromOffBoard = item.source !== 'board' && item.source !== 'announced';
                if (isPlayedFromOffBoard && cardToMove.ownerId) {
                    const currentPlayerId = cardToMove.ownerId;
                    
                    // Clear LastPlayed from any other card owned by this player
                    newState.board.forEach(row => row.forEach(c => {
                        if (c.card?.ownerId === currentPlayerId && c.card?.statuses) {
                            c.card.statuses = c.card.statuses.filter(s => s.type !== 'LastPlayed');
                        }
                    }));
                    newState.players.forEach(p => {
                        if (p.id === currentPlayerId && p.announcedCard?.statuses) {
                            p.announcedCard.statuses = p.announcedCard.statuses.filter(s => s.type !== 'LastPlayed');
                        }
                    });
                    
                    if (!cardToMove.statuses) cardToMove.statuses = [];
                    cardToMove.statuses.push({ type: 'LastPlayed', addedByPlayerId: cardToMove.ownerId });
                }
            }
        } else if (target.target === 'discard' && target.playerId !== undefined) {
             // If a token is moved to discard, it's permanently removed from the game.
            if (cardToMove.deck === DeckType.Tokens) {
                // Do nothing, effectively deleting it as it was already removed from source.
            } else {
                const player = newState.players.find(p => p.id === target.playerId);
                if (player) player.discard.unshift(cardToMove);
            }
        } else if (target.target === 'deck' && target.playerId !== undefined) {
            const player = newState.players.find(p => p.id === target.playerId);
            // Tokens and counters cannot go to deck.
            if (player && cardToMove.deck !== 'counter' && cardToMove.deck !== DeckType.Tokens) {
                if (target.deckPosition === 'bottom') {
                    player.deck.push(cardToMove);
                } else { // Default to top
                    player.deck.unshift(cardToMove);
                }
            }
        } else if (target.target === 'announced' && target.playerId !== undefined) {
            const player = newState.players.find(p => p.id === target.playerId);
            if (player && !player.announcedCard) {
                player.announcedCard = cardToMove;
            }
        }

        // After any move that affects the board, recalculate statuses like Support and Threat.
        newState.board = recalculateBoardStatuses(newState);

        return newState;
    });
  }, [updateState]);

  const handleDrop = useCallback((item: DragItem, target: DropTarget) => {
    moveItem(item, target);
  }, [moveItem]);

  return {
    gameState,
    localPlayerId,
    setLocalPlayerId,
    createGame,
    joinGame,
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
    handleDrop,
    draggedItem,
    setDraggedItem,
    connectionStatus,
    gamesList,
    requestGamesList,
    exitGame,
    moveItem,
    shufflePlayerDeck,
    addBoardCardStatus,
    removeBoardCardStatus,
    addAnnouncedCardStatus,
    removeAnnouncedCardStatus,
    flipBoardCard,
    flipBoardCardFaceDown,
    revealHandCard,
    revealBoardCard,
    requestCardReveal,
    respondToRevealRequest,
    syncGame,
    removeRevealedStatus,
    resetGame,
  };
};
