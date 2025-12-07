// ... existing imports
import { useState, useEffect, useCallback, useRef } from 'react';
import type { GameState, Player, Board, GridSize, Card, DragItem, DropTarget, PlayerColor, GameMode, RevealRequest, CardIdentifier, CustomDeckFile, HighlightData, FloatingTextData } from '../types';
import { DeckType, GameMode as GameModeEnum } from '../types';
import { shuffleDeck, PLAYER_COLOR_NAMES, TURN_PHASES, MAX_PLAYERS } from '../constants';
import { decksData, countersDatabase, rawJsonData, getCardDefinitionByName, getCardDefinition, commandCardIds } from '../contentDatabase';
import { createInitialBoard, recalculateBoardStatuses } from '../utils/boardUtils';

// ... getWebSocketURL, ConnectionStatus, generateGameId, syncLastPlayed kept as is ...
const getWebSocketURL = () => {
  const customUrl = localStorage.getItem('custom_ws_url');
  if (customUrl && customUrl.trim() !== '') {
    console.log(`Using custom WebSocket URL: ${customUrl}`);
    return customUrl.trim();
  }
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const hostname = window.location.hostname || 'localhost';
  if (window.location.port && window.location.port !== '80' && window.location.port !== '443' && window.location.hostname === 'localhost') {
    return 'wss://platinocyanic-unsceptically-belia.ngrok-free.dev';
  }
  return `${protocol}://${hostname}`;
};

export type ConnectionStatus = 'Connecting' | 'Connected' | 'Disconnected';
const generateGameId = () => Math.random().toString(36).substring(2, 18).toUpperCase();

const syncLastPlayed = (board: Board, player: Player) => {
    board.forEach(row => row.forEach(cell => {
        if (cell.card?.statuses) {
            cell.card.statuses = cell.card.statuses.filter(s => !(s.type === 'LastPlayed' && s.addedByPlayerId === player.id));
        }
    }));
    let found = false;
    while (player.boardHistory.length > 0 && !found) {
        const lastId = player.boardHistory[player.boardHistory.length - 1];
        for(let r=0; r<board.length; r++) {
            for(let c=0; c<board.length; c++) {
                if (board[r][c].card?.id === lastId) {
                    if (!board[r][c].card!.statuses) board[r][c].card!.statuses = [];
                    board[r][c].card!.statuses!.push({ type: 'LastPlayed', addedByPlayerId: player.id });
                    found = true;
                    break;
                }
            }
            if (found) break;
        }
        if (!found) {
            player.boardHistory.pop();
        }
    }
};

export const useGameState = () => {
  // ... state initialization logic kept as is ...
  const createDeck = useCallback((deckType: DeckType, playerId: number, playerName: string): Card[] => {
    const deck = decksData[deckType];
    if (!deck) {
        console.error(`Deck data for ${deckType} not loaded! Returning empty deck.`);
        return [];
    }
    const deckWithOwner = [...deck].map(card => ({ ...card, ownerId: playerId, ownerName: playerName }));
    return shuffleDeck(deckWithOwner);
  }, []);

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
          boardHistory: [] 
      };
      player.deck = createDeck(initialDeckType, id, player.name);
      return player;
  }, [createDeck]);

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
    startingPlayerId: undefined,
    currentPhase: 0,
    isScoringStep: false,
    currentRound: 1,
    turnNumber: 1,
    roundEndTriggered: false,
    roundWinners: {},
    gameWinner: null,
    isRoundEndModalOpen: false
  }), []);

  const [gameState, setGameState] = useState<GameState>(createInitialState);
  const [localPlayerId, setLocalPlayerId] = useState<number | null>(null);
  const [draggedItem, setDraggedItem] = useState<DragItem | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('Connecting');
  const [gamesList, setGamesList] = useState<{gameId: string, playerCount: number}[]>([]);
  const [latestHighlight, setLatestHighlight] = useState<HighlightData | null>(null);
  const [latestFloatingTexts, setLatestFloatingTexts] = useState<FloatingTextData[] | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const joiningGameIdRef = useRef<string | null>(null);
  const isManualExitRef = useRef<boolean>(false);
  
  const gameStateRef = useRef(gameState);
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  const localPlayerIdRef = useRef(localPlayerId);
  useEffect(() => {
    localPlayerIdRef.current = localPlayerId;
  }, [localPlayerId]);

  const updateState = useCallback((newStateOrFn: GameState | ((prevState: GameState) => GameState)) => {
    setGameState(prevState => {
      const newState = typeof newStateOrFn === 'function' ? newStateOrFn(prevState) : newStateOrFn;
      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ type: 'UPDATE_STATE', gameState: newState }));
      }
      return newState;
    });
  }, []);
  
  // ... WebSocket logic (connectWebSocket, forceReconnect, joinGame, etc.) kept as is ...
  const connectWebSocket = useCallback(() => {
    if (isManualExitRef.current) return;
    if (ws.current && (ws.current.readyState === WebSocket.OPEN || ws.current.readyState === WebSocket.CONNECTING)) return;
    
    const WS_URL = getWebSocketURL(); 
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
      if (currentGameState && currentGameState.gameId && ws.current?.readyState === WebSocket.OPEN) {
            let playerToken = undefined;
            try {
                const stored = localStorage.getItem('reconnection_data');
                if (stored) {
                    const data = JSON.parse(stored);
                    if (data.gameId === currentGameState.gameId) {
                        playerToken = data.playerToken;
                    }
                }
            } catch(e) {}

            ws.current.send(JSON.stringify({ 
                type: 'JOIN_GAME', 
                gameId: currentGameState.gameId,
                playerToken: playerToken 
            }));
            
            if (localPlayerIdRef.current === 1) {
                 ws.current.send(JSON.stringify({ type: 'UPDATE_DECK_DATA', deckData: rawJsonData }));
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
            const gameId = joiningGameIdRef.current || gameStateRef.current.gameId;
            if (gameId && data.playerId !== null && data.playerToken) {
              localStorage.setItem('reconnection_data', JSON.stringify({
                gameId,
                playerId: data.playerId,
                playerToken: data.playerToken,
                timestamp: Date.now(),
              }));
            } else if (data.playerId === null) {
                localStorage.removeItem('reconnection_data');
            }
            joiningGameIdRef.current = null;
            if (data.playerId === 1) {
                setTimeout(() => {
                     if (ws.current?.readyState === WebSocket.OPEN) {
                        ws.current.send(JSON.stringify({ type: 'UPDATE_DECK_DATA', deckData: rawJsonData }));
                     }
                }, 500);
            }
        } else if (data.type === 'ERROR') {
            if (data.message.includes('not found') || data.message.includes('Dummy')) {
                setGameState(createInitialState());
                setLocalPlayerId(null);
                localStorage.removeItem('reconnection_data');
            } else {
                console.warn("Server Error:", data.message);
            }
        } else if (data.type === 'HIGHLIGHT_TRIGGERED') {
            setLatestHighlight(data.highlightData);
        } else if (data.type === 'FLOATING_TEXT_TRIGGERED') {
            setLatestFloatingTexts([data.floatingTextData]);
        } else if (data.type === 'FLOATING_TEXT_BATCH_TRIGGERED') {
            setLatestFloatingTexts(data.batch);
        } else {
            setGameState(data);
        }
      } catch (error) {
        console.error("Failed to parse message from server:", event.data, error);
      }
    };
    ws.current.onclose = () => {
      console.log('WebSocket connection closed. Attempting to reconnect in 3s...');
      setConnectionStatus('Disconnected');
      if (!isManualExitRef.current) {
          if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = window.setTimeout(connectWebSocket, 3000);
      }
    };
    ws.current.onerror = (event) => console.error('WebSocket error event:', event);
  }, [setGameState, createInitialState]);

  const forceReconnect = useCallback(() => {
    if (ws.current) {
        ws.current.close();
    }
  }, []);

  const joinGame = useCallback((gameId: string): void => {
    isManualExitRef.current = false;
    if (ws.current?.readyState === WebSocket.OPEN) {
        joiningGameIdRef.current = gameId;
        let reconnectionData = null;
        try {
            const storedData = localStorage.getItem('reconnection_data');
            if (storedData) reconnectionData = JSON.parse(storedData);
        } catch (e) { localStorage.removeItem('reconnection_data'); }
        const payload: { type: string; gameId: string; playerToken?: string } = { type: 'JOIN_GAME', gameId };
        if (reconnectionData && reconnectionData.gameId === gameId && reconnectionData.playerToken) {
            payload.playerToken = reconnectionData.playerToken;
        }
        ws.current.send(JSON.stringify(payload));
    } else { 
        connectWebSocket();
        joiningGameIdRef.current = gameId;
    }
  }, [connectWebSocket]);

  useEffect(() => {
    isManualExitRef.current = false;
    localStorage.removeItem('reconnection_data');
    connectWebSocket();
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (ws.current) { ws.current.onclose = null; ws.current.close(); }
    };
  }, [connectWebSocket]);

  const createGame = useCallback(() => {
    isManualExitRef.current = false;
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
        ws.current.send(JSON.stringify({ type: 'UPDATE_DECK_DATA', deckData: rawJsonData }));
    }
  }, [updateState, createInitialState, createNewPlayer]);

  const requestGamesList = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify({ type: 'GET_GAMES_LIST' }));
  }, []);
  
  const exitGame = useCallback(() => {
    isManualExitRef.current = true;
    const gameIdToLeave = gameStateRef.current.gameId;
    const playerIdToLeave = localPlayerIdRef.current;
    
    setGameState(createInitialState());
    setLocalPlayerId(null);
    localStorage.removeItem('reconnection_data');
    
    if (ws.current) {
        ws.current.onclose = null; 
    }

    if (ws.current?.readyState === WebSocket.OPEN && gameIdToLeave && playerIdToLeave !== null) {
      ws.current.send(JSON.stringify({ type: 'LEAVE_GAME', gameId: gameIdToLeave, playerId: playerIdToLeave }));
    }
    
    if (ws.current) ws.current.close();
    
    setTimeout(() => {
        isManualExitRef.current = false;
        connectWebSocket();
    }, 100);

  }, [createInitialState, connectWebSocket]);

  // ... (startReadyCheck, cancelReadyCheck, playerReady, assignTeams, setGameMode, setGamePrivacy, syncGame, resetGame, setActiveGridSize, setDummyPlayerCount methods kept as is) ...
  const startReadyCheck = useCallback(() => {
      if (ws.current?.readyState === WebSocket.OPEN && gameStateRef.current.gameId) ws.current.send(JSON.stringify({ type: 'START_READY_CHECK', gameId: gameStateRef.current.gameId }));
  }, []);
  
  const cancelReadyCheck = useCallback(() => {
      if (ws.current?.readyState === WebSocket.OPEN && gameStateRef.current.gameId) ws.current.send(JSON.stringify({ type: 'CANCEL_READY_CHECK', gameId: gameStateRef.current.gameId }));
  }, []);
  
  const playerReady = useCallback(() => {
      if (ws.current?.readyState === WebSocket.OPEN && gameStateRef.current.gameId && localPlayerIdRef.current !== null) {
          ws.current.send(JSON.stringify({ type: 'PLAYER_READY', gameId: gameStateRef.current.gameId, playerId: localPlayerIdRef.current }));
      }
  }, []);

  const assignTeams = useCallback((teamAssignments: Record<number, number[]>) => {
       if (ws.current?.readyState === WebSocket.OPEN && gameStateRef.current.gameId) ws.current.send(JSON.stringify({ type: 'ASSIGN_TEAMS', gameId: gameStateRef.current.gameId, assignments: teamAssignments }));
  }, []);

  const setGameMode = useCallback((mode: GameMode) => {
      if (ws.current?.readyState === WebSocket.OPEN && gameStateRef.current.gameId) ws.current.send(JSON.stringify({ type: 'SET_GAME_MODE', gameId: gameStateRef.current.gameId, mode }));
  }, []);
  
  const setGamePrivacy = useCallback((isPrivate: boolean) => {
       if (ws.current?.readyState === WebSocket.OPEN && gameStateRef.current.gameId) ws.current.send(JSON.stringify({ type: 'SET_GAME_PRIVACY', gameId: gameStateRef.current.gameId, isPrivate }));
  }, []);

  const syncGame = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN && gameStateRef.current.gameId && localPlayerIdRef.current === 1) {
        ws.current.send(JSON.stringify({ type: 'UPDATE_DECK_DATA', deckData: rawJsonData }));
        const currentState = gameStateRef.current;
        const refreshedState = JSON.parse(JSON.stringify(currentState));
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
        ws.current.send(JSON.stringify({ type: 'FORCE_SYNC', gameState: refreshedState }));
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
                    boardHistory: [] // Reset history
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
                startingPlayerId: undefined,
                currentPhase: 0,
                isScoringStep: false,
                currentRound: 1,
                turnNumber: 1,
                roundEndTriggered: false,
                roundWinners: {},
                gameWinner: null,
                isRoundEndModalOpen: false
            };
        });
    }, [updateState, createDeck]);


  const setActiveGridSize = useCallback((size: GridSize) => {
    updateState(currentState => {
      if (currentState.isGameStarted) return currentState;
      const newState = { ...currentState, activeGridSize: size };
      newState.board = recalculateBoardStatuses(newState);
      return newState;
    });
  }, [updateState]);
  
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

  const addBoardCardStatus = useCallback((boardCoords: { row: number; col: number }, status: string, addedByPlayerId: number) => {
    updateState(currentState => {
        if (!currentState.isGameStarted) return currentState;
        const newState: GameState = JSON.parse(JSON.stringify(currentState));
        const card = newState.board[boardCoords.row][boardCoords.col].card;
        if (card) {
            // Lucius, The Immortal Immunity: Cannot be stunned
            // Uses strict baseId check OR Name+Hero check as a fallback
            if (status === 'Stun') {
                if (card.baseId === 'luciusTheImmortal') return currentState;
                // Robust Fallback: Name + Hero Type
                if (card.name.includes('Lucius') && card.types?.includes('Hero')) return currentState;
            }

            if (['Support', 'Threat', 'Revealed'].includes(status)) {
                const alreadyHasStatusFromPlayer = card.statuses?.some(s => s.type === status && s.addedByPlayerId === addedByPlayerId);
                if (alreadyHasStatusFromPlayer) return currentState; 
            }
            if (!card.statuses) card.statuses = [];
            card.statuses.push({ type: status, addedByPlayerId });
        }
        return newState;
    });
  }, [updateState]);

  const removeBoardCardStatus = useCallback((boardCoords: { row: number; col: number }, status: string) => {
    updateState(currentState => {
        if (!currentState.isGameStarted) return currentState;
        const newState: GameState = JSON.parse(JSON.stringify(currentState));
        const card = newState.board[boardCoords.row][boardCoords.col].card;
        if (card?.statuses) {
            const lastIndex = card.statuses.map(s => s.type).lastIndexOf(status);
            if (lastIndex > -1) card.statuses.splice(lastIndex, 1);
        }
        newState.board = recalculateBoardStatuses(newState);
        return newState;
    });
  }, [updateState]);

  const removeBoardCardStatusByOwner = useCallback((boardCoords: { row: number; col: number }, status: string, ownerId: number) => {
      updateState(currentState => {
          if (!currentState.isGameStarted) return currentState;
          const newState: GameState = JSON.parse(JSON.stringify(currentState));
          const card = newState.board[boardCoords.row][boardCoords.col].card;
          if (card?.statuses) {
              const index = card.statuses.findIndex(s => s.type === status && s.addedByPlayerId === ownerId);
              if (index > -1) card.statuses.splice(index, 1);
          }
          newState.board = recalculateBoardStatuses(newState);
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

  // ... (Other status/card modification methods kept as is: addAnnouncedCardStatus, removeAnnouncedCardStatus, modifyAnnouncedCardPower, addHandCardStatus, removeHandCardStatus, flipBoardCard, flipBoardCardFaceDown, revealHandCard, revealBoardCard, requestCardReveal, respondToRevealRequest, removeRevealedStatus) ...
  const addAnnouncedCardStatus = useCallback((playerId: number, status: string, addedByPlayerId: number) => {
    updateState(currentState => {
        if (!currentState.isGameStarted) return currentState;
        const newState: GameState = JSON.parse(JSON.stringify(currentState));
        const player = newState.players.find(p => p.id === playerId);
        if (player && player.announcedCard) {
            if (['Support', 'Threat', 'Revealed'].includes(status)) {
                const alreadyHasStatusFromPlayer = player.announcedCard.statuses?.some(s => s.type === status && s.addedByPlayerId === addedByPlayerId);
                if (alreadyHasStatusFromPlayer) return currentState; 
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
            if (lastIndex > -1) player.announcedCard.statuses.splice(lastIndex, 1);
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
             if (['Support', 'Threat', 'Revealed'].includes(status)) {
                const alreadyHasStatusFromPlayer = card.statuses?.some(s => s.type === status && s.addedByPlayerId === addedByPlayerId);
                if (alreadyHasStatusFromPlayer) return currentState;
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
            if (lastIndex > -1) card.statuses.splice(lastIndex, 1);
             if (status === 'Revealed') {
                const hasRevealed = card.statuses.some(s => s.type === 'Revealed');
                if (!hasRevealed) delete card.revealedTo;
            }
        }
        return newState;
    });
  }, [updateState]);

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
  
  const revealHandCard = useCallback((playerId: number, cardIndex: number, revealTarget: 'all' | number[]) => {
    updateState(currentState => {
        const player = currentState.players.find(p => p.id === playerId);
        if (!player || !player.hand[cardIndex]) return currentState;
        const newState: GameState = JSON.parse(JSON.stringify(currentState));
        const cardToReveal = newState.players.find(p => p.id === playerId)!.hand[cardIndex];
        if (revealTarget === 'all') {
            cardToReveal.revealedTo = 'all';
            if (!cardToReveal.statuses) cardToReveal.statuses = [];
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

  const revealBoardCard = useCallback((boardCoords: { row: number, col: number }, revealTarget: 'all' | number[]) => {
    updateState(currentState => {
        const cardToReveal = currentState.board[boardCoords.row][boardCoords.col].card;
        if (!cardToReveal) return currentState;
        const newState: GameState = JSON.parse(JSON.stringify(currentState));
        const cardInNewState = newState.board[boardCoords.row][boardCoords.col].card!;
        const ownerId = cardInNewState.ownerId;
        if (revealTarget === 'all') {
            cardInNewState.revealedTo = 'all';
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
                        if (owner) cardToUpdate = owner.hand[cardIdentifier.cardIndex];
                    }
                    if (cardToUpdate) {
                        if (!cardToUpdate.statuses) cardToUpdate.statuses = [];
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
                if (owner) cardToUpdate = owner.hand[cardIdentifier.cardIndex];
            }
            if (cardToUpdate) {
                if (cardToUpdate.statuses) {
                    cardToUpdate.statuses = cardToUpdate.statuses.filter(s => s.type !== 'Revealed');
                }
                delete cardToUpdate.revealedTo;
            }
            return newState;
        });
    }, [updateState]);


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

  const updatePlayerScore = useCallback((playerId: number, delta: number) => {
    updateState(currentState => {
      if (!currentState.isGameStarted) return currentState;
      
      const newState: GameState = JSON.parse(JSON.stringify(currentState));
      const player = newState.players.find(p => p.id === playerId);
      
      if (player) {
          player.score += delta;
      }
      return newState;
    });
  }, [updateState]);
  
  const changePlayerDeck = useCallback((playerId: number, deckType: DeckType) => {
    updateState(currentState => {
      if (currentState.isGameStarted) return currentState;
      return {
      ...currentState,
      players: currentState.players.map(p => 
        p.id === playerId 
          ? { ...p, deck: createDeck(deckType, playerId, p.name), selectedDeck: deckType, hand: [], discard: [], announcedCard: null, boardHistory: [] }
          : p
      )
    }});
  }, [updateState, createDeck]);
  
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
                    ? { ...p, deck: shuffleDeck(newDeck), selectedDeck: DeckType.Custom, hand: [], discard: [], announcedCard: null, boardHistory: [] }
                    : p
            )
        };
    });
  }, [updateState]);

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
            const newState: GameState = JSON.parse(JSON.stringify(currentState));

            if (newState.isScoringStep) {
                newState.isScoringStep = false;
                const finishingPlayerId = currentState.activeTurnPlayerId;
                if (finishingPlayerId !== undefined) {
                    newState.board.forEach(row => {
                        row.forEach(cell => {
                            if (cell.card && cell.card.ownerId === finishingPlayerId && cell.card.statuses) {
                                const stunIndex = cell.card.statuses.findIndex(s => s.type === 'Stun');
                                if (stunIndex !== -1) {
                                    cell.card.statuses.splice(stunIndex, 1);
                                }
                            }
                        });
                    });
                    // Recalculate statuses after Stun removal to ensure Support/Threat are updated
                    newState.board = recalculateBoardStatuses(newState);
                }

                let nextPlayerId = finishingPlayerId;
                if (nextPlayerId !== undefined) {
                    const sortedPlayers = [...newState.players].sort((a, b) => a.id - b.id);
                    const currentIndex = sortedPlayers.findIndex(p => p.id === nextPlayerId);
                    if (currentIndex !== -1) {
                        let nextIndex = (currentIndex + 1) % sortedPlayers.length;
                        nextPlayerId = sortedPlayers[nextIndex].id;
                    }
                }
                
                newState.currentPhase = 0;
                newState.activeTurnPlayerId = nextPlayerId;

                if (newState.startingPlayerId !== undefined && nextPlayerId === newState.startingPlayerId) {
                    const currentThreshold = (newState.currentRound * 10) + 10;
                    const isFinalRoundLimit = newState.currentRound === 5 && newState.turnNumber >= 10;
                    let maxScore = -Infinity;
                    newState.players.forEach(p => { if (p.score > maxScore) maxScore = p.score; });
                    const thresholdMet = maxScore >= currentThreshold;

                    if (thresholdMet || isFinalRoundLimit) {
                        const winners = newState.players.filter(p => p.score === maxScore).map(p => p.id);
                        newState.roundWinners[newState.currentRound] = winners;
                        const allWins = Object.values(newState.roundWinners).flat();
                        const winCounts = allWins.reduce((acc, id) => { acc[id] = (acc[id] || 0) + 1; return acc; }, {} as Record<number, number>);
                        const gameWinners = Object.keys(winCounts).filter(id => winCounts[Number(id)] >= 2).map(id => Number(id));
                        if (gameWinners.length > 0) { newState.gameWinner = gameWinners[0]; }
                        newState.isRoundEndModalOpen = true;
                    } else {
                        newState.turnNumber += 1;
                    }
                }

                newState.board.forEach(row => {
                    row.forEach(cell => {
                        if (cell.card) {
                            delete cell.card.enteredThisTurn;
                            delete cell.card.abilityUsedInPhase;
                        }
                    });
                });

                newState.board.forEach(row => {
                    row.forEach(cell => {
                        if (cell.card && cell.card.statuses) {
                            const resurrectedIdx = cell.card.statuses.findIndex(s => s.type === 'Resurrected');
                            if (resurrectedIdx !== -1) {
                                const addedBy = cell.card.statuses[resurrectedIdx].addedByPlayerId;
                                cell.card.statuses.splice(resurrectedIdx, 1);
                                if (cell.card.baseId !== 'luciusTheImmortal') {
                                    cell.card.statuses.push({ type: 'Stun', addedByPlayerId: addedBy });
                                    cell.card.statuses.push({ type: 'Stun', addedByPlayerId: addedBy });
                                }
                            }
                        }
                    });
                });
                
                // Recalculate again as Resurrected removal/Stun addition changes auras
                newState.board = recalculateBoardStatuses(newState);

                return newState;
            }

            const nextPhaseIndex = currentState.currentPhase + 1;
            newState.board.forEach(row => { row.forEach(cell => { if (cell.card) { cell.card.deployAbilityConsumed = true; } }); });

            if (nextPhaseIndex >= TURN_PHASES.length) {
                newState.isScoringStep = true;
                return newState; 
            } else {
                newState.board.forEach(row => {
                    row.forEach(cell => {
                        if (cell.card && cell.card.statuses) {
                            const resurrectedIdx = cell.card.statuses.findIndex(s => s.type === 'Resurrected');
                            if (resurrectedIdx !== -1) {
                                const addedBy = cell.card.statuses[resurrectedIdx].addedByPlayerId;
                                cell.card.statuses.splice(resurrectedIdx, 1);
                                if (cell.card.baseId !== 'luciusTheImmortal') {
                                    cell.card.statuses.push({ type: 'Stun', addedByPlayerId: addedBy });
                                    cell.card.statuses.push({ type: 'Stun', addedByPlayerId: addedBy });
                                }
                            }
                        }
                    });
                });
                // Recalculate for phase transitions where Resurrected might expire
                newState.board = recalculateBoardStatuses(newState);
                
                newState.currentPhase = nextPhaseIndex;
                return newState;
            }
        });
    }, [updateState]);

    const prevPhase = useCallback(() => {
        updateState(currentState => {
            if (!currentState.isGameStarted) return currentState;
            if (currentState.isScoringStep) {
                return { ...currentState, isScoringStep: false };
            }
            return {
                ...currentState,
                currentPhase: Math.max(0, currentState.currentPhase - 1)
            };
        });
    }, [updateState]);

    const confirmRoundEnd = useCallback(() => {
        updateState(currentState => {
            const newState: GameState = JSON.parse(JSON.stringify(currentState));
            newState.isRoundEndModalOpen = false;
            newState.players.forEach(p => p.score = 0);
            newState.currentRound += 1;
            newState.roundEndTriggered = false; 
            newState.turnNumber = 1;
            newState.gameWinner = null;
            return newState;
        });
    }, [updateState]);

  const moveItem = useCallback((item: DragItem, target: DropTarget) => {
    updateState(currentState => {
        if (!currentState.isGameStarted) return currentState;

        if (target.target === 'board' && target.boardCoords) {
             const targetCell = currentState.board[target.boardCoords.row][target.boardCoords.col];
             if (targetCell.card !== null && item.source !== 'counter_panel') {
                 return currentState;
             }
        }

        const newState: GameState = JSON.parse(JSON.stringify(currentState));
        
        if (item.source === 'board' && ['hand', 'deck', 'discard'].includes(target.target) && !item.bypassOwnershipCheck) {
            const cardOwnerId = item.card.ownerId;
            const cardOwner = newState.players.find(p => p.id === cardOwnerId);
            const isOwner = cardOwnerId === localPlayerIdRef.current;
            const isDummyCard = !!cardOwner?.isDummy;

            if (!isOwner && !isDummyCard) {
                return currentState;
            }
        }

        if (newState.startingPlayerId === undefined && target.target === 'board' && item.source !== 'board') {
             const dropperId = item.playerId || localPlayerIdRef.current;
             if (dropperId !== null) {
                 newState.startingPlayerId = dropperId;
             }
        }

        if (item.source === 'board' && target.target === 'board') {
            const card = item.card;
            let currentCardState = card;
            if (item.boardCoords) {
                 const cell = currentState.board[item.boardCoords.row][item.boardCoords.col];
                 if (cell.card) currentCardState = cell.card;
            }

            const isStunned = currentCardState.statuses?.some(s => s.type === 'Stun');

            if (isStunned) {
                const moverId = localPlayerIdRef.current;
                const ownerId = currentCardState.ownerId;
                const moverPlayer = currentState.players.find(p => p.id === moverId);
                const ownerPlayer = currentState.players.find(p => p.id === ownerId);
                const isOwner = moverId === ownerId;
                const isTeammate = moverPlayer?.teamId !== undefined && ownerPlayer?.teamId !== undefined && moverPlayer.teamId === ownerPlayer.teamId;
                
                if ((isOwner || isTeammate) && !item.isManual) {
                     return currentState;
                }
            }
        }
        
        if (item.source === 'counter_panel' && item.statusType) {
            const counterDef = countersDatabase[item.statusType];
            const allowedTargets = counterDef?.allowedTargets || ['board', 'hand'];
            if (!allowedTargets.includes(target.target)) return currentState;
            let targetCard: Card | null = null;
            if (target.target === 'board' && target.boardCoords) {
                targetCard = newState.board[target.boardCoords.row][target.boardCoords.col].card;
            } else if (target.playerId !== undefined) {
                const targetPlayer = newState.players.find(p => p.id === target.playerId);
                if (targetPlayer) {
                    if (target.target === 'hand' && target.cardIndex !== undefined) targetCard = targetPlayer.hand[target.cardIndex];
                    if (target.target === 'announced') targetCard = targetPlayer.announcedCard || null;
                     if (target.target === 'deck' && targetPlayer.deck.length > 0) {
                         if (target.deckPosition === 'top' || !target.deckPosition) targetCard = targetPlayer.deck[0];
                         else targetCard = targetPlayer.deck[targetPlayer.deck.length - 1];
                     } else if (target.target === 'discard' && targetPlayer.discard.length > 0) targetCard = targetPlayer.discard[targetPlayer.discard.length - 1];
                }
            }
            if (targetCard) {
                // Lucius Immunity Logic
                if (item.statusType === 'Stun') {
                    if (targetCard.baseId === 'luciusTheImmortal') return newState;
                    if (targetCard.name.includes('Lucius') && targetCard.types?.includes('Hero')) return newState;
                }

                const count = item.count || 1;
                const activePlayer = newState.players.find(p => p.id === newState.activeTurnPlayerId);
                const effectiveActorId = (activePlayer && activePlayer.isDummy) ? activePlayer.id : (localPlayerIdRef.current !== null ? localPlayerIdRef.current : 0); 
                if (item.statusType === 'Power+') {
                    if (targetCard.powerModifier === undefined) targetCard.powerModifier = 0;
                    targetCard.powerModifier += (1 * count);
                } else if (item.statusType === 'Power-') {
                    if (targetCard.powerModifier === undefined) targetCard.powerModifier = 0;
                    targetCard.powerModifier -= (1 * count);
                } else {
                    if (!targetCard.statuses) targetCard.statuses = [];
                    for(let i=0; i<count; i++) {
                        if (['Support', 'Threat', 'Revealed'].includes(item.statusType!)) {
                            const exists = targetCard.statuses.some(s => s.type === item.statusType && s.addedByPlayerId === effectiveActorId);
                            if (!exists) targetCard.statuses.push({ type: item.statusType!, addedByPlayerId: effectiveActorId });
                        } else {
                            targetCard.statuses.push({ type: item.statusType!, addedByPlayerId: effectiveActorId });
                        }
                    }
                }
                if (target.target === 'board') newState.board = recalculateBoardStatuses(newState);
                return newState;
            }
            return currentState;
        }

        let cardToMove: Card = { ...item.card };

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

        const isReturningToStorage = ['hand', 'deck', 'discard'].includes(target.target);

        if (isReturningToStorage) {
            if (cardToMove.statuses) {
                cardToMove.statuses = cardToMove.statuses.filter(status => status.type === 'Revealed');
            }
            cardToMove.isFaceDown = false;
            delete cardToMove.powerModifier;
            delete cardToMove.bonusPower; // Clear passive buffs
            delete cardToMove.enteredThisTurn;
            delete cardToMove.abilityUsedInPhase;
            delete cardToMove.deployAbilityConsumed;
        } else if (target.target === 'board') {
            if (!cardToMove.statuses) cardToMove.statuses = [];
             if (item.source !== 'board' && cardToMove.isFaceDown === undefined) {
                 cardToMove.isFaceDown = false; 
             }
             if (item.source !== 'board') {
                 cardToMove.enteredThisTurn = true;
                 delete cardToMove.deployAbilityConsumed;
                 delete cardToMove.abilityUsedInPhase;
                 
                 // Lucius, The Immortal: Bonus if entered from discard
                 if (item.source === 'discard' && cardToMove.name.includes('Lucius')) {
                     if (cardToMove.powerModifier === undefined) cardToMove.powerModifier = 0;
                     cardToMove.powerModifier += 3;
                 }
             }
        }

        if (target.target === 'hand' && target.playerId !== undefined) {
            if (cardToMove.deck === DeckType.Tokens || cardToMove.deck === 'counter') return newState;
            const player = newState.players.find(p => p.id === target.playerId);
            if (player) {
                player.hand.push(cardToMove);
                // Automatic Shuffle if moving from Deck to Hand
                if (item.source === 'deck') {
                    player.deck = shuffleDeck(player.deck);
                }
            }
        } else if (target.target === 'board' && target.boardCoords) {
            if (newState.board[target.boardCoords.row][target.boardCoords.col].card === null) {
                if (cardToMove.ownerId === undefined && localPlayerIdRef.current !== null) {
                     const currentPlayer = newState.players.find(p => p.id === localPlayerIdRef.current);
                     if (currentPlayer) {
                         cardToMove.ownerId = currentPlayer.id;
                         cardToMove.ownerName = currentPlayer.name;
                     }
                }
                
                // --- HISTORY TRACKING: Entering Board ---
                // Manually played cards get tracked in history for fallback 'LastPlayed' status
                if (item.source !== 'board' && item.isManual && cardToMove.ownerId !== undefined) {
                    const player = newState.players.find(p => p.id === cardToMove.ownerId);
                    if (player) {
                        player.boardHistory.push(cardToMove.id);
                    }
                }

                newState.board[target.boardCoords.row][target.boardCoords.col].card = cardToMove;
            }
        } 
        else if (target.target === 'discard' && target.playerId !== undefined) {
            if (cardToMove.deck === DeckType.Tokens || cardToMove.deck === 'counter') {} else {
                const player = newState.players.find(p => p.id === target.playerId);
                if (player) {
                    if (cardToMove.ownerId === undefined) {
                        cardToMove.ownerId = target.playerId;
                        cardToMove.ownerName = player.name;
                    }
                    player.discard.push(cardToMove);
                }
            }
        } else if (target.target === 'deck' && target.playerId !== undefined) {
            if (cardToMove.deck === DeckType.Tokens || cardToMove.deck === 'counter') return newState;
            const player = newState.players.find(p => p.id === target.playerId);
            if (player) {
                 if (cardToMove.ownerId === undefined) {
                        cardToMove.ownerId = target.playerId;
                        cardToMove.ownerName = player.name;
                 }
                 if (target.deckPosition === 'top' || !target.deckPosition) player.deck.unshift(cardToMove);
                 else player.deck.push(cardToMove);
            }
        } else if (target.target === 'announced' && target.playerId !== undefined) {
            const player = newState.players.find(p => p.id === target.playerId);
            if (player) {
                if (player.announcedCard) {
                    if (player.announcedCard.statuses) player.announcedCard.statuses = player.announcedCard.statuses.filter(s => s.type === 'Revealed');
                    delete player.announcedCard.enteredThisTurn;
                    delete player.announcedCard.abilityUsedInPhase;
                    delete player.announcedCard.powerModifier;
                    delete player.announcedCard.bonusPower;
                    delete player.announcedCard.deployAbilityConsumed;
                    player.hand.push(player.announcedCard);
                }
                player.announcedCard = cardToMove;
            }
        }

        // --- HISTORY TRACKING: Leaving Board ---
        if (item.source === 'board' && target.target !== 'board' && cardToMove.ownerId !== undefined) {
            const player = newState.players.find(p => p.id === cardToMove.ownerId);
            if (player) {
                player.boardHistory = player.boardHistory.filter(id => id !== cardToMove.id);
            }
        }

        // --- Post-Move: Sync LastPlayed Status ---
        if ((item.source === 'board' || target.target === 'board') && cardToMove.ownerId !== undefined) {
            const player = newState.players.find(p => p.id === cardToMove.ownerId);
            if (player) {
                syncLastPlayed(newState.board, player);
            }
        }

        if (item.source === 'hand' && target.target === 'board') {
            const movingCard = cardToMove;
            const isRevealed = movingCard.revealedTo === 'all' || movingCard.statuses?.some(s => s.type === 'Revealed');
            if (isRevealed) {
                const gridSize = newState.board.length;
                for (let r = 0; r < gridSize; r++) {
                    for (let c = 0; c < gridSize; c++) {
                        const spotter = newState.board[r][c].card;
                        if (spotter && spotter.name.toLowerCase().includes('vigilant spotter')) {
                            if (spotter.ownerId !== movingCard.ownerId) {
                                newState.board = recalculateBoardStatuses(newState);
                                const updatedSpotter = newState.board[r][c].card!;
                                if (updatedSpotter.statuses?.some(s => s.type === 'Support')) {
                                     const spotterOwner = newState.players.find(p => p.id === spotter.ownerId);
                                     if (spotterOwner) {
                                         spotterOwner.score += 2;
                                     }
                                }
                            }
                        }
                    }
                }
            }
        }

        if (item.source === 'board' || target.target === 'board') {
            newState.board = recalculateBoardStatuses(newState);
        }

        return newState;
    });
  }, [updateState]);

  const resurrectDiscardedCard = useCallback((playerId: number, cardIndex: number, boardCoords: {row: number, col: number}, statuses?: {type: string}[]) => {
      updateState(currentState => {
          if (!currentState.isGameStarted) return currentState;
          if (currentState.board[boardCoords.row][boardCoords.col].card !== null) return currentState;
          const newState: GameState = JSON.parse(JSON.stringify(currentState));
          const player = newState.players.find(p => p.id === playerId);
          if (player && player.discard.length > cardIndex) {
              const [card] = player.discard.splice(cardIndex, 1);
              card.enteredThisTurn = true;
              delete card.deployAbilityConsumed;
              delete card.abilityUsedInPhase;
              
              // Lucius Bonus if resurrected
              if (card.name.includes('Lucius')) {
                  if (card.powerModifier === undefined) card.powerModifier = 0;
                  card.powerModifier += 3;
              }

              if (!card.statuses) card.statuses = [];
              card.statuses.push({ type: 'Resurrected', addedByPlayerId: playerId });
              if (statuses) {
                  statuses.forEach(s => {
                      if (s.type !== 'Resurrected') card.statuses?.push({ type: s.type, addedByPlayerId: playerId });
                  });
              }
              
              // Add to history
              player.boardHistory.push(card.id);
              
              newState.board[boardCoords.row][boardCoords.col].card = card;
              
              syncLastPlayed(newState.board, player);
              
              newState.board = recalculateBoardStatuses(newState);
          }
          return newState;
      });
  }, [updateState]);

  const triggerHighlight = useCallback((highlightData: Omit<HighlightData, 'timestamp'>) => {
      if (ws.current?.readyState === WebSocket.OPEN && gameStateRef.current.gameId) {
          const fullHighlightData: HighlightData = { ...highlightData, timestamp: Date.now() };
          ws.current.send(JSON.stringify({ type: 'TRIGGER_HIGHLIGHT', gameId: gameStateRef.current.gameId, highlightData: fullHighlightData }));
      }
  }, []);

  const triggerFloatingText = useCallback((data: Omit<FloatingTextData, 'timestamp'> | Omit<FloatingTextData, 'timestamp'>[]) => {
      if (ws.current?.readyState === WebSocket.OPEN && gameStateRef.current.gameId) {
          const items = Array.isArray(data) ? data : [data];
          const timestamp = Date.now();
          const batch = items.map((item, i) => ({ ...item, timestamp: timestamp + i })); 
          ws.current.send(JSON.stringify({ 
              type: 'TRIGGER_FLOATING_TEXT_BATCH', 
              gameId: gameStateRef.current.gameId, 
              batch 
          }));
      }
  }, []);

  const markAbilityUsed = useCallback((boardCoords: { row: number, col: number }, isDeployAbility?: boolean) => {
      updateState(currentState => {
          if (!currentState.isGameStarted) return currentState;
          const newState: GameState = JSON.parse(JSON.stringify(currentState));
          const card = newState.board[boardCoords.row][boardCoords.col].card;
          if (card) {
              if (isDeployAbility) card.deployAbilityConsumed = true;
              else card.abilityUsedInPhase = newState.currentPhase;
          }
          return newState;
      });
  }, [updateState]);

  const resetDeployStatus = useCallback((boardCoords: { row: number, col: number }) => {
      updateState(currentState => {
          if (!currentState.isGameStarted) return currentState;
          const newState: GameState = JSON.parse(JSON.stringify(currentState));
          const card = newState.board[boardCoords.row][boardCoords.col].card;
          if (card) {
              delete card.deployAbilityConsumed;
          }
          return newState;
      });
  }, [updateState]);

  const removeStatusByType = useCallback((boardCoords: { row: number, col: number }, type: string) => {
      updateState(currentState => {
          if (!currentState.isGameStarted) return currentState;
          const newState: GameState = JSON.parse(JSON.stringify(currentState));
          const card = newState.board[boardCoords.row][boardCoords.col].card;
          if (card && card.statuses) {
              card.statuses = card.statuses.filter(s => s.type !== type);
          }
          newState.board = recalculateBoardStatuses(newState);
          return newState;
      });
  }, [updateState]);

  const applyGlobalEffect = useCallback((
      sourceCoords: { row: number, col: number },
      targetCoords: { row: number, col: number }[],
      tokenType: string,
      addedByPlayerId: number,
      isDeployAbility: boolean
  ) => {
      updateState(currentState => {
          if (!currentState.isGameStarted) return currentState;
          const newState: GameState = JSON.parse(JSON.stringify(currentState));
          targetCoords.forEach(({row, col}) => {
              const card = newState.board[row][col].card;
              if (card) {
                  // Lucius Immunity
                  if (tokenType === 'Stun') {
                      if (card.baseId === 'luciusTheImmortal') return;
                      if (card.name.includes('Lucius') && card.types?.includes('Hero')) return;
                  }

                  if (!card.statuses) card.statuses = [];
                  if (['Support', 'Threat', 'Revealed'].includes(tokenType)) {
                      const exists = card.statuses.some(s => s.type === tokenType && s.addedByPlayerId === addedByPlayerId);
                      if (!exists) card.statuses.push({ type: tokenType, addedByPlayerId });
                  } else {
                      card.statuses.push({ type: tokenType, addedByPlayerId });
                  }
              }
          });
          const sourceCard = newState.board[sourceCoords.row][sourceCoords.col].card;
          if (sourceCard) {
              if (isDeployAbility) sourceCard.deployAbilityConsumed = true;
              else sourceCard.abilityUsedInPhase = newState.currentPhase;
          }
          return newState;
      });
  }, [updateState]);

  // ... (swapCards, transferStatus, transferAllCounters, recoverDiscardedCard, spawnToken, scoreLine, scoreDiagonal kept as is) ...
  const swapCards = useCallback((coords1: {row: number, col: number}, coords2: {row: number, col: number}) => {
      updateState(currentState => {
          if (!currentState.isGameStarted) return currentState;
          const newState: GameState = JSON.parse(JSON.stringify(currentState));
          const card1 = newState.board[coords1.row][coords1.col].card;
          const card2 = newState.board[coords2.row][coords2.col].card;
          newState.board[coords1.row][coords1.col].card = card2;
          newState.board[coords2.row][coords2.col].card = card1;
          newState.board = recalculateBoardStatuses(newState);
          return newState;
      });
  }, [updateState]);

  const transferStatus = useCallback((fromCoords: {row: number, col: number}, toCoords: {row: number, col: number}, statusType: string) => {
      updateState(currentState => {
          if (!currentState.isGameStarted) return currentState;
          const newState: GameState = JSON.parse(JSON.stringify(currentState));
          const fromCard = newState.board[fromCoords.row][fromCoords.col].card;
          const toCard = newState.board[toCoords.row][toCoords.col].card;
          if (fromCard && toCard && fromCard.statuses) {
              const statusIndex = fromCard.statuses.findIndex(s => s.type === statusType);
              if (statusIndex > -1) {
                  const [status] = fromCard.statuses.splice(statusIndex, 1);
                  if (!toCard.statuses) toCard.statuses = [];
                  toCard.statuses.push(status);
              }
          }
          newState.board = recalculateBoardStatuses(newState);
          return newState;
      });
  }, [updateState]);

  const transferAllCounters = useCallback((fromCoords: {row: number, col: number}, toCoords: {row: number, col: number}) => {
      updateState(currentState => {
          if (!currentState.isGameStarted) return currentState;
          const newState: GameState = JSON.parse(JSON.stringify(currentState));
          const fromCard = newState.board[fromCoords.row][fromCoords.col].card;
          const toCard = newState.board[toCoords.row][toCoords.col].card;
          const excludedTypes = ['Support', 'Threat'];
          if (fromCard && toCard && fromCard.statuses) {
              const statusesToMove = fromCard.statuses.filter(s => !excludedTypes.includes(s.type));
              const statusesToKeep = fromCard.statuses.filter(s => excludedTypes.includes(s.type));
              if (statusesToMove.length > 0) {
                  if (!toCard.statuses) toCard.statuses = [];
                  toCard.statuses.push(...statusesToMove);
                  fromCard.statuses = statusesToKeep;
              }
          }
          newState.board = recalculateBoardStatuses(newState);
          return newState;
      });
  }, [updateState]);

  const recoverDiscardedCard = useCallback((playerId: number, cardIndex: number) => {
      updateState(currentState => {
          if (!currentState.isGameStarted) return currentState;
          const newState: GameState = JSON.parse(JSON.stringify(currentState));
          const player = newState.players.find(p => p.id === playerId);
          if (player && player.discard.length > cardIndex) {
              const [card] = player.discard.splice(cardIndex, 1);
              player.hand.push(card);
          }
          return newState;
      });
  }, [updateState]);

  const spawnToken = useCallback((coords: {row: number, col: number}, tokenName: string, ownerId: number) => {
      updateState(currentState => {
         if (!currentState.isGameStarted) return currentState;
         const newState: GameState = JSON.parse(JSON.stringify(currentState));
         const tokenDefKey = Object.keys(rawJsonData.tokenDatabase).find(key => rawJsonData.tokenDatabase[key].name === tokenName);
         if (!tokenDefKey) return currentState;
         const tokenDef = rawJsonData.tokenDatabase[tokenDefKey];
         const owner = newState.players.find(p => p.id === ownerId);
         if (tokenDef && newState.board[coords.row][coords.col].card === null) {
              const tokenCard: Card = {
                  id: `TKN_${tokenName.toUpperCase().replace(/\s/g, '_')}_${Date.now()}`,
                  deck: DeckType.Tokens,
                  name: tokenName,
                  imageUrl: tokenDef.imageUrl,
                  fallbackImage: tokenDef.fallbackImage,
                  power: tokenDef.power,
                  ability: tokenDef.ability,
                  color: tokenDef.color,
                  types: tokenDef.types || ['Unit'],
                  faction: 'Tokens',
                  ownerId: ownerId,
                  ownerName: owner?.name,
                  enteredThisTurn: true
              };
              newState.board[coords.row][coords.col].card = tokenCard;
         }
         newState.board = recalculateBoardStatuses(newState);
         return newState;
      });
  }, [updateState]);
  
  const scoreLine = useCallback((row1: number, col1: number, row2: number, col2: number, playerId: number) => {
      const currentState = gameStateRef.current;
      if (!currentState.isGameStarted) return;

      const hasActiveLiberator = currentState.board.some(row => 
          row.some(cell => 
              cell.card && 
              cell.card.ownerId === playerId && 
              cell.card.name.toLowerCase().includes('data liberator') && 
              cell.card.statuses?.some(s => s.type === 'Support')
          )
      );

      const gridSize = currentState.board.length;
      let rStart = row1, rEnd = row1, cStart = col1, cEnd = col1;
      if (row1 === row2) {
          rStart = row1; rEnd = row1;
          cStart = 0; cEnd = gridSize - 1;
      } else if (col1 === col2) {
          cStart = col1; cEnd = col1;
          rStart = 0; rEnd = gridSize - 1;
      } else {
          return; 
      }

      let totalScore = 0;
      const scoreEvents: Omit<FloatingTextData, 'timestamp'>[] = [];

      for(let r = rStart; r <= rEnd; r++) {
          for(let c = cStart; c <= cEnd; c++) {
              const cell = currentState.board[r][c];
              const card = cell.card;
              
              if (card && !card.statuses?.some(s => s.type === 'Stun')) {
                  const isOwner = card.ownerId === playerId;
                  const hasExploit = card.statuses?.some(s => s.type === 'Exploit' && s.addedByPlayerId === playerId);
                  
                  if (isOwner || (hasActiveLiberator && hasExploit && card.ownerId !== playerId)) {
                      const points = Math.max(0, card.power + (card.powerModifier || 0) + (card.bonusPower || 0));
                      if (points > 0) {
                          totalScore += points;
                          scoreEvents.push({ 
                              row: r, 
                              col: c, 
                              text: `+${points}`, 
                              playerId: playerId 
                          });
                      }
                  }
              }
          }
      }

      if (scoreEvents.length > 0) {
          triggerFloatingText(scoreEvents);
      }

      updateState(prevState => {
         const newState: GameState = JSON.parse(JSON.stringify(prevState));
         const player = newState.players.find(p => p.id === playerId);
         if (player) {
             player.score += totalScore;
         }
         return newState;
      });
  }, [updateState, triggerFloatingText]);

  const scoreDiagonal = useCallback((r1: number, c1: number, r2: number, c2: number, playerId: number, bonusType?: 'point_per_support' | 'draw_per_support') => {
      const currentState = gameStateRef.current;
      if (!currentState.isGameStarted) return;

      const dRow = r2 > r1 ? 1 : -1;
      const dCol = c2 > c1 ? 1 : -1;
      const steps = Math.abs(r1 - r2); 

      let totalScore = 0;
      let totalBonus = 0;
      const scoreEvents: Omit<FloatingTextData, 'timestamp'>[] = [];

      for (let i = 0; i <= steps; i++) {
          const r = r1 + (i * dRow);
          const c = c1 + (i * dCol);
          
          if (r < 0 || r >= currentState.board.length || c < 0 || c >= currentState.board.length) continue;

          const cell = currentState.board[r][c];
          const card = cell.card;

          if (card && !card.statuses?.some(s => s.type === 'Stun')) {
              const isOwner = card.ownerId === playerId;
              
              if (isOwner) {
                  const points = Math.max(0, card.power + (card.powerModifier || 0) + (card.bonusPower || 0));
                  if (points > 0) {
                      totalScore += points;
                      scoreEvents.push({ 
                          row: r, 
                          col: c, 
                          text: `+${points}`, 
                          playerId: playerId 
                          });
                  }
                  
                  if (bonusType && card.statuses?.some(s => s.type === 'Support' && s.addedByPlayerId === playerId)) {
                      totalBonus += 1;
                  }
              }
          }
      }

      if (bonusType === 'point_per_support' && totalBonus > 0) {
          totalScore += totalBonus;
      }

      if (scoreEvents.length > 0) {
          triggerFloatingText(scoreEvents);
      }

      updateState(prevState => {
         const newState: GameState = JSON.parse(JSON.stringify(prevState));
         const player = newState.players.find(p => p.id === playerId);
         if (player) {
             player.score += totalScore;
             
             if (bonusType === 'draw_per_support' && totalBonus > 0 && player.deck.length > 0) {
                 for(let i=0; i<totalBonus; i++) {
                     if(player.deck.length > 0) player.hand.push(player.deck.shift()!);
                 }
             }
         }
         return newState;
      });
  }, [updateState, triggerFloatingText]);

  return {
    gameState,
    localPlayerId,
    setLocalPlayerId,
    draggedItem,
    setDraggedItem,
    connectionStatus,
    gamesList,
    latestHighlight,
    latestFloatingTexts, 
    createGame,
    joinGame,
    requestGamesList,
    exitGame,
    startReadyCheck,
    cancelReadyCheck, 
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
    removeBoardCardStatusByOwner,
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
    triggerHighlight, 
    triggerFloatingText,
    nextPhase,
    prevPhase,
    setPhase,
    markAbilityUsed, 
    applyGlobalEffect, 
    swapCards,
    transferStatus,
    transferAllCounters, 
    recoverDiscardedCard,
    resurrectDiscardedCard,
    spawnToken,
    scoreLine,
    confirmRoundEnd,
    resetDeployStatus,
    scoreDiagonal,
    removeStatusByType
  };
};