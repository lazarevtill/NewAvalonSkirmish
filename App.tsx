/**
 * @file This is the root component of the application, orchestrating the entire UI and game state.
 */

import React, { useState, useMemo, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import { GameBoard } from './components/GameBoard';
import { PlayerPanel } from './components/PlayerPanel';
import { Header } from './components/Header';
import { JoinGameModal } from './components/JoinGameModal';
import { DiscardModal } from './components/DiscardModal';
import { TokensModal } from './components/TokensModal';
import { CountersModal } from './components/CountersModal';
import { TeamAssignmentModal } from './components/TeamAssignmentModal';
import { ReadyCheckModal } from './components/ReadyCheckModal';
import { CardDetailModal } from './components/CardDetailModal';
import { RevealRequestModal } from './components/RevealRequestModal';
import { DeckBuilderModal } from './components/DeckBuilderModal';
import { SettingsModal } from './components/SettingsModal';
import { RulesModal } from './components/RulesModal';
import { ContextMenu } from './components/ContextMenu';
import { useGameState } from './hooks/useGameState';
import type { Player, Card, DragItem, ContextMenuItem, ContextMenuParams, CursorStackState, CardStatus, HighlightData, PlayerColor } from './types';
import { DeckType, GameMode } from './types';
import { STATUS_ICONS, STATUS_DESCRIPTIONS } from './constants';
import { getCardAbilityAction, canActivateAbility } from './utils/autoAbilities';
import type { AbilityAction } from './utils/autoAbilities';
import { decksData, countersDatabase } from './decks';
import { validateTarget, calculateValidTargets, checkActionHasTargets } from './utils/targeting';

/**
 * The main application component. It manages the overall layout, modals,
 * and interactions between different parts of the game interface.
 * @returns {React.ReactElement} The rendered application.
 */
export default function App() {
  const {
    gameState,
    localPlayerId,
    setLocalPlayerId,
    createGame,
    joinGame,
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
    latestHighlight,
    nextPhase,
    prevPhase,
    setPhase,
    markAbilityUsed,
    swapCards,
    transferStatus,
    transferAllCounters,
    recoverDiscardedCard,
    spawnToken,
    scoreLine
  } = useGameState();

  // State for managing UI modals.
  const [isJoinModalOpen, setJoinModalOpen] = useState(false);
  const [isDeckBuilderOpen, setDeckBuilderOpen] = useState(false);
  const [isSettingsModalOpen, setSettingsModalOpen] = useState(false);
  const [isTokensModalOpen, setTokensModalOpen] = useState(false);
  const [isCountersModalOpen, setCountersModalOpen] = useState(false);
  const [isRulesModalOpen, setRulesModalOpen] = useState(false);
  const [tokensModalAnchor, setTokensModalAnchor] = useState<{ top: number; left: number } | null>(null);
  const [countersModalAnchor, setCountersModalAnchor] = useState<{ top: number; left: number } | null>(null);
  const [isTeamAssignOpen, setTeamAssignOpen] = useState(false);
  const [viewingDiscard, setViewingDiscard] = useState<{ player: Player; pickMode?: boolean } | null>(null);
  const [viewingDeck, setViewingDeck] = useState<Player | null>(null);
  const [viewingCard, setViewingCard] = useState<{ card: Card; player?: Player } | null>(null);
  const [isListMode, setIsListMode] = useState(true);
  
  const [imageRefreshVersion, setImageRefreshVersion] = useState<number>(() => {
      try {
          const stored = localStorage.getItem('image_refresh_data');
          if (stored) {
              const { version, timestamp } = JSON.parse(stored);
              const twelveHours = 12 * 60 * 60 * 1000;
              if (Date.now() - timestamp < twelveHours) {
                  return version;
              }
          }
      } catch (e) {
          console.error("Error parsing image refresh data", e);
      }
      const newVersion = Date.now();
      localStorage.setItem('image_refresh_data', JSON.stringify({ version: newVersion, timestamp: newVersion }));
      return newVersion;
  });

  const [contextMenuProps, setContextMenuProps] = useState<ContextMenuParams | null>(null);
  const [playMode, setPlayMode] = useState<{ card: Card; sourceItem: DragItem; faceDown?: boolean } | null>(null);
  const [cursorStack, setCursorStack] = useState<CursorStackState | null>(null);
  const cursorFollowerRef = useRef<HTMLDivElement>(null);
  const lastClickPos = useRef<{x: number, y: number} | null>(null);
  const [highlight, setHighlight] = useState<HighlightData | null>(null);
  const [isAutoAbilitiesEnabled, setIsAutoAbilitiesEnabled] = useState(false);
  const [abilityMode, setAbilityMode] = useState<AbilityAction | null>(null);
  const [validTargets, setValidTargets] = useState<{row: number, col: number}[]>([]);
  const [validHandTargets, setValidHandTargets] = useState<{playerId: number, cardIndex: number}[]>([]);
  const [noTargetOverlay, setNoTargetOverlay] = useState<{row: number, col: number} | null>(null);
  const mousePos = useRef({ x: 0, y: 0 });
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const boardContainerRef = useRef<HTMLDivElement>(null);
  const [leftPanelWidth, setLeftPanelWidth] = useState<number | undefined>(undefined);
  
  // Used to prevent click events from firing immediately after a token drop (mouseup)
  const interactionLock = useRef(false);

  const activePlayerCount = useMemo(() => gameState.players.filter(p => !p.isDummy && !p.isDisconnected).length, [gameState.players]);
  const isSpectator = localPlayerId === null && gameState.gameId !== null;
  const realPlayerCount = useMemo(() => gameState.players.filter(p => !p.isDummy).length, [gameState.players]);
  const isHost = localPlayerId === 1;

  const localPlayer = useMemo(() => gameState.players.find(p => p.id === localPlayerId), [gameState.players, localPlayerId]);
  const isGameActive = gameState.gameId && (localPlayer || isSpectator);

  const playerColorMap = useMemo(() => {
    const map = new Map<number, PlayerColor>();
    gameState.players.forEach(p => map.set(p.id, p.color));
    return map;
  }, [gameState.players]);

  const isTargetingMode = !!abilityMode || !!cursorStack;

  useEffect(() => {
      const checkListMode = () => {
          const savedMode = localStorage.getItem('ui_list_mode');
          setIsListMode(savedMode === null ? true : savedMode === 'true');
      };
      checkListMode();
      
      window.addEventListener('storage', checkListMode);
      return () => window.removeEventListener('storage', checkListMode);
  }, []);

  useLayoutEffect(() => {
      if (!isListMode) {
          setLeftPanelWidth(undefined);
          return;
      }

      const calculateWidth = () => {
          if (boardContainerRef.current) {
              const windowWidth = window.innerWidth;
              const boardRect = boardContainerRef.current.getBoundingClientRect();
              if (boardRect.width === 0) return;
              const centeredLeftSpace = (windowWidth - boardRect.width) / 2;
              const gap = 10;
              const targetWidth = centeredLeftSpace - gap;
              
              setLeftPanelWidth(Math.max(0, targetWidth));
          }
      };

      const observer = new ResizeObserver(calculateWidth);
      if (boardContainerRef.current) observer.observe(boardContainerRef.current);
      window.addEventListener('resize', calculateWidth);
      calculateWidth();
      const timer = setTimeout(calculateWidth, 100);

      return () => {
          observer.disconnect();
          window.removeEventListener('resize', calculateWidth);
          clearTimeout(timer);
      };
  }, [isListMode, localPlayerId, gameState.activeGridSize]);


  useLayoutEffect(() => {
      if (cursorStack && cursorFollowerRef.current && lastClickPos.current) {
          cursorFollowerRef.current.style.left = `${lastClickPos.current.x - 2}px`;
          cursorFollowerRef.current.style.top = `${lastClickPos.current.y - 2}px`;
      }
  }, [cursorStack]);

  useEffect(() => {
      const handleMouseMove = (e: MouseEvent) => {
          mousePos.current = { x: e.clientX, y: e.clientY };

          if (cursorFollowerRef.current && (cursorStack || abilityMode)) {
              cursorFollowerRef.current.style.left = `${e.clientX - 2}px`;
              cursorFollowerRef.current.style.top = `${e.clientY - 2}px`;
          }
      };
      window.addEventListener('mousemove', handleMouseMove);
      if ((cursorStack || abilityMode) && cursorFollowerRef.current) {
           cursorFollowerRef.current.style.left = `${mousePos.current.x - 2}px`;
           cursorFollowerRef.current.style.top = `${mousePos.current.y - 2}px`;
      }
      return () => {
          window.removeEventListener('mousemove', handleMouseMove);
      };
  }, [cursorStack, abilityMode]);

  // Handle Global MouseUp for applying tokens or cancelling interactions
  useEffect(() => {
      const handleGlobalMouseUp = (e: MouseEvent) => {
          if (!cursorStack) return;

          const target = document.elementFromPoint(e.clientX, e.clientY);
          
          const handCard = target?.closest('[data-hand-card]');
          if (handCard) {
              const attr = handCard.getAttribute('data-hand-card');
              if (attr) {
                  const [playerIdStr, cardIndexStr] = attr.split(',');
                  const playerId = parseInt(playerIdStr, 10);
                  const cardIndex = parseInt(cardIndexStr, 10);
                  
                  const targetPlayer = gameState.players.find(p => p.id === playerId);
                  const targetCard = targetPlayer?.hand[cardIndex];

                  if (targetPlayer && targetCard) {
                      const isValid = validateTarget(
                          { card: targetCard, ownerId: playerId, location: 'hand' },
                          cursorStack,
                          localPlayerId,
                          gameState.players
                      );

                      if (!isValid) return;
                      
                      if (cursorStack.type === 'Revealed' && playerId !== localPlayerId && !targetPlayer.isDummy) {
                           if (localPlayerId !== null) {
                               requestCardReveal({ 
                                   source: 'hand', 
                                   ownerId: playerId, 
                                   cardIndex 
                               }, localPlayerId);
                               
                               if (cursorStack.sourceCoords) markAbilityUsed(cursorStack.sourceCoords);
                               if (cursorStack.count > 1) {
                                   setCursorStack(prev => prev ? ({ ...prev, count: prev.count - 1 }) : null);
                               } else {
                                   setCursorStack(null);
                               }
                               // Set lock
                               interactionLock.current = true;
                               setTimeout(() => { interactionLock.current = false; }, 300);
                           }
                           return; 
                      }

                       handleDrop({
                          card: { id: `stack`, deck: 'counter', name: '', imageUrl: '', fallbackImage: '', power: 0, ability: '', types: [] },
                          source: 'counter_panel',
                          statusType: cursorStack.type,
                          count: 1 
                       }, { target: 'hand', playerId, cardIndex, boardCoords: undefined }); 
                       
                       if (cursorStack.sourceCoords) markAbilityUsed(cursorStack.sourceCoords);

                       if (cursorStack.count > 1) {
                           setCursorStack(prev => prev ? ({ ...prev, count: prev.count - 1 }) : null);
                       } else {
                           setCursorStack(null);
                       }
                       
                       // Set lock
                       interactionLock.current = true;
                       setTimeout(() => { interactionLock.current = false; }, 300);
                      return;
                  }
              }
          }

          const boardCell = target?.closest('[data-board-coords]');
          if (boardCell) {
              const coords = boardCell.getAttribute('data-board-coords');
              if (coords) {
                  const [rowStr, colStr] = coords.split(',');
                  const row = parseInt(rowStr, 10);
                  const col = parseInt(colStr, 10);
                  
                  const targetCard = gameState.board[row][col].card;
                  
                  if (targetCard && targetCard.ownerId !== undefined) {
                      const isValid = validateTarget(
                          { card: targetCard, ownerId: targetCard.ownerId, location: 'board' },
                          cursorStack,
                          localPlayerId,
                          gameState.players
                      );

                      if (!isValid) return;

                      const targetPlayer = gameState.players.find(p => p.id === targetCard.ownerId);
                      if (cursorStack.type === 'Revealed' && targetCard.ownerId !== localPlayerId && !targetPlayer?.isDummy) {
                           if (localPlayerId !== null) {
                               requestCardReveal({ 
                                   source: 'board', 
                                   ownerId: targetCard.ownerId, 
                                   boardCoords: { row, col } 
                               }, localPlayerId);

                               if (cursorStack.sourceCoords) markAbilityUsed(cursorStack.sourceCoords);
                               if (cursorStack.count > 1) {
                                   setCursorStack(prev => prev ? ({ ...prev, count: prev.count - 1 }) : null);
                               } else {
                                   setCursorStack(null);
                               }
                               // Set lock
                               interactionLock.current = true;
                               setTimeout(() => { interactionLock.current = false; }, 300);
                           }
                           return;
                      }
                  }

                  if (targetCard) {
                      handleDrop({
                          card: { id: `stack`, deck: 'counter', name: '', imageUrl: '', fallbackImage: '', power: 0, ability: '', types: [] },
                          source: 'counter_panel',
                          statusType: cursorStack.type,
                          count: 1
                      }, { target: 'board', boardCoords: { row, col }});
                      
                       if (cursorStack.sourceCoords) markAbilityUsed(cursorStack.sourceCoords);

                      if (cursorStack.count > 1) {
                          setCursorStack(prev => prev ? ({ ...prev, count: prev.count - 1 }) : null);
                      } else {
                          setCursorStack(null);
                      }
                      
                      // Set lock to prevent click event from firing on the card underneath
                      interactionLock.current = true;
                      setTimeout(() => { interactionLock.current = false; }, 300);
                  }
              }
          } else {
              const isOverModal = target?.closest('.counter-modal-content');
              if (cursorStack.isDragging) {
                  if (isOverModal) {
                      setCursorStack(prev => prev ? { ...prev, isDragging: false } : null);
                  } else {
                      setCursorStack(null);
                  }
              } else {
                   if (!isOverModal) {
                       setCursorStack(null);
                   }
              }
          }
      };

      window.addEventListener('mouseup', handleGlobalMouseUp);
      return () => {
          window.removeEventListener('mouseup', handleGlobalMouseUp);
      };
  }, [cursorStack, handleDrop, gameState, localPlayerId, revealHandCard, requestCardReveal, markAbilityUsed]);

  // New effect: Swallow clicks when interaction lock is active (Capture Phase)
  useEffect(() => {
      const handleGlobalClickCapture = (e: MouseEvent) => {
          if (interactionLock.current) {
              e.stopPropagation();
              e.preventDefault();
          }
      };
      window.addEventListener('click', handleGlobalClickCapture, true);
      return () => window.removeEventListener('click', handleGlobalClickCapture, true);
  }, []);

  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
              return;
          }
          if (e.code === 'Space') {
              e.preventDefault(); 
              if (gameState.isGameStarted) {
                  nextPhase();
              }
          }
          if (e.key === 'Escape') {
              if (abilityMode && abilityMode.sourceCoords && abilityMode.sourceCoords.row >= 0) {
                  markAbilityUsed(abilityMode.sourceCoords);
              }
              if (cursorStack && cursorStack.sourceCoords) {
                  markAbilityUsed(cursorStack.sourceCoords);
              }

              setCursorStack(null);
              setPlayMode(null);
              setAbilityMode(null);
              setViewingDiscard(null); 
          }
      };
      
      const handleRightClick = (e: MouseEvent) => {
          if (cursorStack || playMode || abilityMode) {
              e.preventDefault();
              if (abilityMode && abilityMode.sourceCoords && abilityMode.sourceCoords.row >= 0) {
                  markAbilityUsed(abilityMode.sourceCoords);
              }
              if (cursorStack && cursorStack.sourceCoords) {
                  markAbilityUsed(cursorStack.sourceCoords);
              }

              setCursorStack(null);
              setPlayMode(null);
              setAbilityMode(null);
              setViewingDiscard(null);
          }
      };

      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('contextmenu', handleRightClick); 
      
      return () => {
          window.removeEventListener('keydown', handleKeyDown);
          window.removeEventListener('contextmenu', handleRightClick);
      }
  }, [cursorStack, playMode, abilityMode, markAbilityUsed, gameState.isGameStarted, nextPhase]);

  // Calculate valid targets (Board AND Hand) when abilityMode changes or cursor stack changes
  useEffect(() => {
      let effectiveAction: AbilityAction | null = abilityMode;
      if (cursorStack && !abilityMode) {
          effectiveAction = {
              type: 'CREATE_STACK',
              tokenType: cursorStack.type,
              count: cursorStack.count,
              onlyFaceDown: cursorStack.onlyFaceDown,
              onlyOpponents: cursorStack.onlyOpponents,
              targetOwnerId: cursorStack.targetOwnerId,
              excludeOwnerId: cursorStack.excludeOwnerId
          };
      }

      const boardTargets = calculateValidTargets(effectiveAction, gameState, localPlayerId);
      
      const handTargets: {playerId: number, cardIndex: number}[] = [];
      
      if (abilityMode && abilityMode.type === 'ENTER_MODE' && abilityMode.mode === 'SELECT_TARGET') {
          if (abilityMode.payload.filter) {
              gameState.players.forEach(p => {
                  p.hand.forEach((card, index) => {
                      if (abilityMode.payload.filter!(card)) {
                          handTargets.push({ playerId: p.id, cardIndex: index });
                      }
                  });
              });
          }
      } 
      else if (cursorStack) {
          const counterDef = countersDatabase[cursorStack.type];
          if (counterDef && counterDef.allowedTargets && counterDef.allowedTargets.includes('hand')) {
               gameState.players.forEach(p => {
                   p.hand.forEach((card, index) => {
                       const isValid = validateTarget(
                           { card, ownerId: p.id, location: 'hand' },
                           cursorStack,
                           localPlayerId,
                           gameState.players
                       );
                       if (isValid) {
                           handTargets.push({ playerId: p.id, cardIndex: index });
                       }
                   });
               });
          }
      }

      setValidTargets(boardTargets);
      setValidHandTargets(handTargets);
  }, [abilityMode, cursorStack, gameState.board, gameState.players, localPlayerId]);

  useEffect(() => {
      if (latestHighlight) {
          setHighlight(latestHighlight);
          const timer = setTimeout(() => setHighlight(null), 1000);
          return () => clearTimeout(timer);
      }
  }, [latestHighlight]);


  const closeAllModals = () => {
      setTokensModalOpen(false);
      setCountersModalOpen(false);
      setViewingDiscard(null);
      setViewingDeck(null);
      setViewingCard(null);
      setRulesModalOpen(false);
  };
  
  const handleStartGameSequence = () => {
      if (!isHost) return;
      if (gameState.gameMode === GameMode.FreeForAll) {
          startReadyCheck();
      } else {
          setTeamAssignOpen(true);
      }
  };
  
  const handleTeamAssignment = (teamAssignments: Record<number, number[]>) => {
      assignTeams(teamAssignments);
      setTeamAssignOpen(false);
      startReadyCheck();
  };

  const handleJoinGame = (gameId: string) => {
    joinGame(gameId);
    setJoinModalOpen(false);
  };

  const handleCreateGame = () => {
    createGame();
    setLocalPlayerId(1);
  };
  
  const handleOpenJoinModal = () => {
    requestGamesList();
    setJoinModalOpen(true);
  };

  const handleSaveSettings = (url: string) => {
    localStorage.setItem('custom_ws_url', url.trim());
    const savedMode = localStorage.getItem('ui_list_mode');
    setIsListMode(savedMode === null ? true : savedMode === 'true');
    setSettingsModalOpen(false);
    forceReconnect();
  };
  
  const handleSyncAndRefresh = () => {
      const newVersion = Date.now();
      setImageRefreshVersion(newVersion);
      localStorage.setItem('image_refresh_data', JSON.stringify({ version: newVersion, timestamp: newVersion }));
      syncGame();
  };

  const handleTriggerHighlight = (coords: { type: 'row' | 'col' | 'cell', row?: number, col?: number}) => {
      if (localPlayerId === null) return;
      triggerHighlight({
          ...coords,
          playerId: localPlayerId
      });
  };

  const activateAbility = (card: Card, boardCoords: { row: number, col: number }) => {
      // Guard: Prevent triggering if already in a mode
      if (abilityMode || cursorStack) return;

      if (!isAutoAbilitiesEnabled || !gameState.isGameStarted || localPlayerId === null) return;
      
      if (localPlayerId !== gameState.activeTurnPlayerId || card.ownerId !== localPlayerId) return;

      if (!canActivateAbility(card, gameState.currentPhase, gameState.activeTurnPlayerId!)) {
          return;
      }
      
      const action = getCardAbilityAction(card, gameState, localPlayerId, boardCoords);
      if (action) {
          if (action.type === 'CREATE_STACK' && action.tokenType && action.count) {
              setCursorStack({ 
                  type: action.tokenType, 
                  count: action.count, 
                  isDragging: false, 
                  sourceCoords: boardCoords,
                  excludeOwnerId: action.excludeOwnerId,
                  onlyOpponents: action.onlyOpponents,
                  onlyFaceDown: action.onlyFaceDown
              });
          } else if (action.type === 'ENTER_MODE') {
              const hasTargets = checkActionHasTargets(action, gameState, localPlayerId);
              
              if (!hasTargets) {
                  if (boardCoords.row >= 0) {
                      setNoTargetOverlay(boardCoords);
                      markAbilityUsed(boardCoords); 
                      setTimeout(() => setNoTargetOverlay(null), 750);
                  }
                  return;
              }
              setAbilityMode(action);
          } else if (action.type === 'OPEN_MODAL') {
              if (action.mode === 'RETRIEVE_DEVICE') {
                   const player = gameState.players.find(p => p.id === localPlayerId);
                   if (player) {
                       setViewingDiscard({ player, pickMode: true });
                       if (boardCoords.row >= 0) markAbilityUsed(boardCoords);
                   }
              }
          }
      }
  };

  const handleBoardCardClick = (card: Card, boardCoords: { row: number, col: number }) => {
      if (playMode) return;
      if (cursorStack) return; 
      if (interactionLock.current) return;

      // If we are already in an ability mode (targeting), handle the interaction here
      // and DO NOT proceed to activateAbility.
      if (abilityMode && abilityMode.type === 'ENTER_MODE') {
          // Explicitly block interaction with the source card if clicked to prevent re-activation
          if (abilityMode.sourceCard && abilityMode.sourceCard.id === card.id) {
               return;
          }

          const { mode, payload, sourceCard, sourceCoords } = abilityMode;

          if (mode === 'SELECT_TARGET' && payload.actionType === 'DESTROY') {
              if (payload.filter && !payload.filter(card, boardCoords.row, boardCoords.col)) {
                  return;
              }
              moveItem({ 
                  card, 
                  source: 'board', 
                  boardCoords,
                  bypassOwnershipCheck: true 
              }, { target: 'discard', playerId: card.ownerId });
              
              if (sourceCoords && sourceCoords.row >= 0) markAbilityUsed(sourceCoords);
              setTimeout(() => setAbilityMode(null), 100);
              return;
          }

          if (mode === 'SELECT_TARGET' && payload.tokenType) {
              if (payload.filter && !payload.filter(card, boardCoords.row, boardCoords.col)) {
                  return; 
              }
              handleDrop({
                  card: { id: 'dummy', deck: 'counter', name: '', imageUrl: '', fallbackImage: '', power: 0, ability: '', types: [] },
                  source: 'counter_panel',
                  statusType: payload.tokenType,
                  count: payload.count || 1 
              }, { target: 'board', boardCoords });
              
              if (sourceCoords && sourceCoords.row >= 0) markAbilityUsed(sourceCoords);
              setTimeout(() => setAbilityMode(null), 100);
              return;
          }

          if (mode === 'RIOT_PUSH' && sourceCoords && sourceCoords.row >= 0) {
              const isAdj = Math.abs(boardCoords.row - sourceCoords.row) + Math.abs(boardCoords.col - sourceCoords.col) === 1;
              if (!isAdj || card.ownerId === localPlayerId) return;

              const dRow = boardCoords.row - sourceCoords.row;
              const dCol = boardCoords.col - sourceCoords.col;
              const targetRow = boardCoords.row + dRow;
              const targetCol = boardCoords.col + dCol;

              const gridSize = gameState.board.length;
              if (targetRow < 0 || targetRow >= gridSize || targetCol < 0 || targetCol >= gridSize) return;
              if (gameState.board[targetRow][targetCol].card !== null) return;

              moveItem({ 
                  card, 
                  source: 'board', 
                  boardCoords,
                  bypassOwnershipCheck: true 
              }, { target: 'board', boardCoords: { row: targetRow, col: targetCol } });

              setAbilityMode({
                  type: 'ENTER_MODE',
                  mode: 'RIOT_MOVE',
                  sourceCard: abilityMode.sourceCard,
                  sourceCoords: abilityMode.sourceCoords,
                  payload: {
                       vacatedCoords: boardCoords 
                  }
              });
              return;
          }

           if (mode === 'RIOT_MOVE' && sourceCoords && sourceCoords.row >= 0) {
               if (boardCoords.row === sourceCoords.row && boardCoords.col === sourceCoords.col) {
                   markAbilityUsed(sourceCoords);
                   setTimeout(() => setAbilityMode(null), 100); 
               }
               return;
           }

           if (mode === 'SWAP_POSITIONS' && sourceCoords && sourceCoords.row >= 0) {
               // Check if sourceCard is clicked to avoid self-swap / re-activation
               if (sourceCard && sourceCard.id === card.id) return;

               if (payload.filter && !payload.filter(card, boardCoords.row, boardCoords.col)) return;
               
               swapCards(sourceCoords, boardCoords);
               markAbilityUsed(boardCoords);
               setTimeout(() => setAbilityMode(null), 100);
               return;
           }

           if (mode === 'TRANSFER_STATUS_SELECT' && sourceCoords && sourceCoords.row >= 0) {
               if (sourceCard && sourceCard.id === card.id) return;
               if (payload.filter && !payload.filter(card, boardCoords.row, boardCoords.col)) return;

               if (card.statuses && card.statuses.length > 0) {
                   transferStatus(boardCoords, sourceCoords, card.statuses[0].type);
                   markAbilityUsed(sourceCoords);
                   setTimeout(() => setAbilityMode(null), 100);
               }
               return;
           }

           if (mode === 'TRANSFER_ALL_STATUSES' && sourceCoords && sourceCoords.row >= 0) {
               if (sourceCard && sourceCard.id === card.id) return;
               if (payload.filter && !payload.filter(card, boardCoords.row, boardCoords.col)) return;

               transferAllCounters(boardCoords, sourceCoords);
               markAbilityUsed(sourceCoords);
               setTimeout(() => setAbilityMode(null), 100);
               return;
           }
           
           if (mode === 'REVEAL_ENEMY') {
               if (sourceCard && sourceCard.id === card.id) return;
               if (payload.filter && !payload.filter(card, boardCoords.row, boardCoords.col)) return;
               
               setCursorStack({ 
                   type: 'Revealed', 
                   count: 1, 
                   isDragging: false, 
                   sourceCoords: sourceCoords, 
                   targetOwnerId: card.ownerId, 
                   onlyFaceDown: true, 
                   onlyOpponents: true 
               });
               setTimeout(() => setAbilityMode(null), 100);
               return;
           }
           
           // Catch-all: If in ability mode but clicked something else, simply do nothing (don't trigger new ability)
           return;
      }

      // Only if NO ability mode is active, proceed to activate ability
      if (!abilityMode && !cursorStack) {
          activateAbility(card, boardCoords);
      }
  };
  
  const handleHandCardClick = (player: Player, card: Card, cardIndex: number) => {
      if (interactionLock.current) return;

      if (abilityMode && abilityMode.type === 'ENTER_MODE' && abilityMode.mode === 'SELECT_TARGET') {
          const { payload, sourceCoords } = abilityMode;
          
          if (payload.actionType === 'DESTROY') {
             if (payload.filter && !payload.filter(card)) {
                  return;
             }
             
             moveItem({
                 card,
                 source: 'hand',
                 playerId: player.id,
                 cardIndex,
                 bypassOwnershipCheck: true
             }, { target: 'discard', playerId: player.id });
             
             if (sourceCoords && sourceCoords.row >= 0) markAbilityUsed(sourceCoords);
             setTimeout(() => setAbilityMode(null), 100);
          }
      }
  };
  
  const handleAnnouncedCardDoubleClick = (player: Player, card: Card) => {
      if (abilityMode || cursorStack) return;
      if (interactionLock.current) return;

      if (player.id !== localPlayerId) return;
      
      if (!isAutoAbilitiesEnabled || !gameState.isGameStarted) return;
      if (gameState.activeTurnPlayerId !== localPlayerId) return;

      if (!canActivateAbility(card, gameState.currentPhase, gameState.activeTurnPlayerId)) return;

      activateAbility(card, { row: -1, col: -1 });
  };


  const handleEmptyCellClick = (boardCoords: { row: number, col: number }) => {
      if (interactionLock.current) return;
      if (!abilityMode || abilityMode.type !== 'ENTER_MODE') return;

      const { mode, sourceCoords, sourceCard, payload } = abilityMode;

      if (mode === 'PATROL_MOVE' && sourceCoords && sourceCard && sourceCoords.row >= 0) {
          const isRow = boardCoords.row === sourceCoords.row;
          const isCol = boardCoords.col === sourceCoords.col;
          
          if (boardCoords.row === sourceCoords.row && boardCoords.col === sourceCoords.col) {
              setTimeout(() => setAbilityMode(null), 100);
              return;
          }

          if (isRow || isCol) {
               moveItem({ card: sourceCard, source: 'board', boardCoords: sourceCoords }, { target: 'board', boardCoords });
               markAbilityUsed(boardCoords); 
               setTimeout(() => setAbilityMode(null), 100);
          }
          return;
      }

      if (mode === 'RIOT_MOVE' && sourceCoords && sourceCard && payload.vacatedCoords) {
          if (boardCoords.row === payload.vacatedCoords.row && boardCoords.col === payload.vacatedCoords.col) {
              moveItem({ card: sourceCard, source: 'board', boardCoords: sourceCoords }, { target: 'board', boardCoords });
              markAbilityUsed(boardCoords); 
              setTimeout(() => setAbilityMode(null), 100);
          }
          return;
      }
      
      if (mode === 'SPAWN_TOKEN' && sourceCoords && payload.tokenName && sourceCoords.row >= 0) {
           const isAdj = Math.abs(boardCoords.row - sourceCoords.row) + Math.abs(boardCoords.col - sourceCoords.col) === 1;
           if (isAdj) {
               spawnToken(boardCoords, payload.tokenName, localPlayerId!);
               markAbilityUsed(sourceCoords);
               setTimeout(() => setAbilityMode(null), 100);
           }
           return;
      }

      if (mode === 'SELECT_CELL' && sourceCoords && sourceCard && sourceCoords.row >= 0) {
           if (payload.allowSelf && boardCoords.row === sourceCoords.row && boardCoords.col === sourceCoords.col) {
                markAbilityUsed(sourceCoords);
                setTimeout(() => setAbilityMode(null), 100);
                return;
           }
           moveItem({ card: sourceCard, source: 'board', boardCoords: sourceCoords }, { target: 'board', boardCoords });
           markAbilityUsed(boardCoords);
           setTimeout(() => setAbilityMode(null), 100);
           return;
      }
      
      if (mode === 'SELECT_LINE_START' && sourceCard) {
          setAbilityMode({
              type: 'ENTER_MODE',
              mode: 'SELECT_LINE_END',
              sourceCard,
              payload: {
                  firstCoords: boardCoords
              }
          });
          return;
      }

      if (mode === 'SELECT_LINE_END' && sourceCard && payload.firstCoords) {
          const { row: r1, col: c1 } = payload.firstCoords;
          const { row: r2, col: c2 } = boardCoords;
          
          if (r1 === r2 || c1 === c2) {
              scoreLine(r1, c1, r2, c2, localPlayerId!);
              moveItem({ card: sourceCard, source: 'announced', playerId: localPlayerId! }, { target: 'discard', playerId: localPlayerId! });
              setTimeout(() => setAbilityMode(null), 100);
          }
          return;
      }
  };


  const closeContextMenu = () => {
    setContextMenuProps(null);
  };
  
  const openContextMenu = (
    e: React.MouseEvent,
    type: ContextMenuParams['type'],
    data: any
  ) => {
    e.preventDefault();
    
    if (abilityMode || cursorStack || playMode) {
        // Allow the event to bubble up so the global right-click handler can catch it
        // and cancel the current mode.
        return;
    }

    e.stopPropagation();

    if (localPlayerId === null || !gameState.isGameStarted) return;
    setContextMenuProps({ x: e.clientX, y: e.clientY, type, data });
  };
  
    const handleDoubleClickBoardCard = (card: Card, boardCoords: { row: number, col: number }) => {
        if (abilityMode || cursorStack) return;
        if (interactionLock.current) return;

        const isOwner = card.ownerId === localPlayerId;

        if (isOwner && card.isFaceDown) {
            flipBoardCard(boardCoords);
            return;
        }

        const owner = card.ownerId ? gameState.players.find(p => p.id === card.ownerId) : undefined;
        const isRevealedByRequest = card.statuses?.some(s => s.type === 'Revealed' && s.addedByPlayerId === localPlayerId);
        const isVisibleForMe = !card.isFaceDown || card.revealedTo === 'all' || (Array.isArray(card.revealedTo) && card.revealedTo.includes(localPlayerId!)) || isRevealedByRequest;

        if (isVisibleForMe || isOwner) {
            setViewingCard({ card, player: owner });
        } else if (localPlayerId !== null) {
            requestCardReveal({ source: 'board', ownerId: card.ownerId!, boardCoords }, localPlayerId);
        }
    };
    
    const handleDoubleClickEmptyCell = (boardCoords: { row: number, col: number }) => {
        if (abilityMode || cursorStack) return;
        if (interactionLock.current) return;
        handleTriggerHighlight({ type: 'cell', row: boardCoords.row, col: boardCoords.col });
    };

    const handleDoubleClickHandCard = (player: Player, card: Card, cardIndex: number) => {
        if (abilityMode || cursorStack) return;
        if (interactionLock.current) return;

        if (player.id === localPlayerId) {
            closeAllModals();
            const sourceItem: DragItem = { card, source: 'hand', playerId: player.id, cardIndex };
            setPlayMode({ card, sourceItem, faceDown: false });
        } else if (localPlayerId !== null) {
            const isRevealedToAll = card.revealedTo === 'all';
            const isRevealedToMe = Array.isArray(card.revealedTo) && card.revealedTo.includes(localPlayerId);
            const isRevealedByRequest = card.statuses?.some(s => s.type === 'Revealed' && s.addedByPlayerId === localPlayerId);
            const isVisible = isRevealedToAll || isRevealedToMe || isRevealedByRequest || !!player.isDummy || !!player.isDisconnected;

            if (isVisible) {
                setViewingCard({ card, player });
            } else {
                requestCardReveal({ source: 'hand', ownerId: player.id, cardIndex }, localPlayerId);
            }
        }
    };

    const handleDoubleClickPileCard = (player: Player, card: Card, cardIndex: number, source: 'deck' | 'discard') => {
        if (abilityMode || cursorStack) return;
        if (interactionLock.current) return;
        const sourceItem: DragItem = { card, source, playerId: player.id, cardIndex };
        moveItem(sourceItem, { target: 'hand', playerId: player.id });
    };

  const handleViewDeck = (player: Player) => {
    setViewingDiscard(null);
    setViewingDeck(player);
  };
  const handleViewDiscard = (player: Player) => {
    setViewingDeck(null);
    setViewingDiscard({ player });
  };
  
  const renderedContextMenu = useMemo(() => {
    if (!contextMenuProps || localPlayerId === null) return null;

    const { type, data, x, y } = contextMenuProps;
    let items: ContextMenuItem[] = [];
    
    if (type === 'emptyBoardCell') {
        items.push({ label: 'Highlight Cell', onClick: () => handleTriggerHighlight({ type: 'cell', row: data.boardCoords.row, col: data.boardCoords.col }) });
        items.push({ label: 'Highlight Column', onClick: () => handleTriggerHighlight({ type: 'col', col: data.boardCoords.col }) });
        items.push({ label: 'Highlight Row', onClick: () => handleTriggerHighlight({ type: 'row', row: data.boardCoords.row }) });

    } else if (type === 'boardItem' || type === 'announcedCard') {
        const isBoardItem = type === 'boardItem';
        let card = isBoardItem ? gameState.board[data.boardCoords.row][data.boardCoords.col].card : data.card;
        let player = isBoardItem ? null : data.player;

        if (!isBoardItem && player) {
            const currentPlayer = gameState.players.find(p => p.id === player.id);
            if (currentPlayer) {
                player = currentPlayer;
                card = currentPlayer.announcedCard || card;
            }
        }
        
        if (!card) {
            setContextMenuProps(null);
            return null;
        }
        
        const owner = card.ownerId ? gameState.players.find(p => p.id === card.ownerId) : undefined;
        const isOwner = card.ownerId === localPlayerId;
        const isDummyCard = !!owner?.isDummy;
        const canControl = isOwner || isDummyCard;

        const isRevealedByRequest = card.statuses?.some(s => s.type === 'Revealed' && (s.addedByPlayerId === localPlayerId));
        const isVisible = !card.isFaceDown || card.revealedTo === 'all' || (Array.isArray(card.revealedTo) && card.revealedTo.includes(localPlayerId)) || isRevealedByRequest;

        if (isVisible || (isOwner && card.isFaceDown)) {
            items.push({ label: 'View', isBold: true, onClick: () => setViewingCard({ card, player: owner }) });
        }
        
        if (!isBoardItem && canControl && card.deck === DeckType.Command) {
             if (gameState.currentPhase === 1 || gameState.currentPhase === 3) {
                 items.push({ 
                     label: 'Play', 
                     isBold: true, 
                     onClick: () => {
                         activateAbility(card, { row: -1, col: -1 }); 
                     }
                 });
             }
        }

        if (isBoardItem && canControl) {
             if (card.isFaceDown) {
                items.push({ label: 'Flip Face Up', isBold: true, onClick: () => flipBoardCard(data.boardCoords) });
            } else {
                items.push({ label: 'Flip Face Down', onClick: () => flipBoardCardFaceDown(data.boardCoords) });
            }
        }

        const sourceItem: DragItem = isBoardItem
          ? { card, source: 'board', boardCoords: data.boardCoords }
          : { card, source: 'announced', playerId: player!.id };
        
        const ownerId = card.ownerId;
        const isSpecialItem = card?.deck === DeckType.Tokens || card?.deck === 'counter';
        
        if (isBoardItem) {
            if (canControl && card.isFaceDown) {
                items.push({ label: 'Reveal to All', onClick: () => revealBoardCard(data.boardCoords, 'all') });
            }
            if (!isOwner && !isVisible) {
                items.push({ label: 'Request Reveal', onClick: () => requestCardReveal({ source: 'board', ownerId: card.ownerId!, boardCoords: data.boardCoords }, localPlayerId) });
            }
        }
        
        if (items.length > 0) items.push({ isDivider: true });

        if (canControl && isVisible) {
            items.push({ label: 'To Hand', disabled: isSpecialItem, onClick: () => moveItem(sourceItem, { target: 'hand', playerId: ownerId }) });
            if (ownerId) {
                const discardLabel = isSpecialItem ? 'Remove' : 'To Discard';
                items.push({ label: discardLabel, onClick: () => moveItem(sourceItem, { target: 'discard', playerId: ownerId }) });
                items.push({ label: 'To Deck Top', disabled: isSpecialItem, onClick: () => moveItem(sourceItem, { target: 'deck', playerId: ownerId, deckPosition: 'top'}) });
                items.push({ label: 'To Deck Bottom', disabled: isSpecialItem, onClick: () => moveItem(sourceItem, { target: 'deck', playerId: ownerId, deckPosition: 'bottom'}) });
            }
        }
        
        if (isBoardItem) {
            items.push({ isDivider: true });
            items.push({ label: 'Highlight Cell', onClick: () => handleTriggerHighlight({ type: 'cell', row: data.boardCoords.row, col: data.boardCoords.col }) });
            items.push({ label: 'Highlight Column', onClick: () => handleTriggerHighlight({ type: 'col', col: data.boardCoords.col }) });
            items.push({ label: 'Highlight Row', onClick: () => handleTriggerHighlight({ type: 'row', row: data.boardCoords.row }) });
        }

        if (isVisible) {
            const allStatusTypes = ['Aim', 'Exploit', 'Stun', 'Shield', 'Support', 'Threat', 'Revealed'];
            const visibleStatusItems: ContextMenuItem[] = [];

            allStatusTypes.forEach(status => {
                const currentCount = card.statuses?.filter((s: CardStatus) => s.type === status).length || 0;
                
                if (currentCount > 0) {
                    visibleStatusItems.push({
                        type: 'statusControl',
                        label: status,
                        onAdd: () => isBoardItem ? addBoardCardStatus(data.boardCoords, status, localPlayerId) : addAnnouncedCardStatus(player.id, status, localPlayerId),
                        onRemove: () => isBoardItem ? removeBoardCardStatus(data.boardCoords, status) : removeAnnouncedCardStatus(player.id, status),
                        removeDisabled: false
                    });
                }
            });

            if (visibleStatusItems.length > 0) {
                 if (items.length > 0 && !('isDivider' in items[items.length - 1])) items.push({ isDivider: true });
                items.push(...visibleStatusItems);
            }

             if (items.length > 0 && !('isDivider' in items[items.length - 1])) items.push({ isDivider: true });
             items.push({
                type: 'statusControl',
                label: 'Power',
                onAdd: () => isBoardItem ? modifyBoardCardPower(data.boardCoords, 1) : modifyAnnouncedCardPower(player.id, 1),
                onRemove: () => isBoardItem ? modifyBoardCardPower(data.boardCoords, -1) : modifyAnnouncedCardPower(player.id, -1),
                removeDisabled: false
             });
        }
        
    } else if (type === 'token_panel_item') {
        const { card } = data;
        const sourceItem: DragItem = { card, source: 'token_panel' };

        items.push({ label: 'View', isBold: true, onClick: () => setViewingCard({ card }) });
        items.push({ isDivider: true });
        items.push({ label: 'Play Face Up', isBold: true, onClick: () => {
            closeAllModals();
            setPlayMode({ card, sourceItem, faceDown: false });
        }});
        items.push({ label: 'Play Face Down', onClick: () => {
            closeAllModals();
            setPlayMode({ card, sourceItem, faceDown: true });
        }});

    } else if (['handCard', 'discardCard', 'deckCard'].includes(type)) {
        let { card, boardCoords, player, cardIndex } = data;
        
        const currentPlayer = gameState.players.find(p => p.id === player.id);
        if (currentPlayer) {
            player = currentPlayer;
            if (type === 'handCard') {
                card = currentPlayer.hand[cardIndex] || card;
            } else if (type === 'discardCard') {
                card = currentPlayer.discard[cardIndex] || card;
            } else if (type === 'deckCard') {
                card = currentPlayer.deck[cardIndex] || card;
            }
        }

        const canControl = player.id === localPlayerId || !!player.isDummy;
        const localP = gameState.players.find(p => p.id === localPlayerId);
        const isTeammate = localP?.teamId !== undefined && player.teamId === localP.teamId;
        const isRevealedToMe = card.revealedTo === 'all' || (Array.isArray(card.revealedTo) && card.revealedTo.includes(localPlayerId));
        const isRevealedByRequest = card.statuses?.some(s => s.type === 'Revealed' && s.addedByPlayerId === localPlayerId);
        
        const isVisible = (() => {
            if (type !== 'handCard') return true;
            return player.id === localPlayerId || isTeammate || !!player.isDummy || !!player.isDisconnected || isRevealedToMe || isRevealedByRequest;
        })();
        
        let source: DragItem['source'];
        if (type === 'handCard') source = 'hand';
        else if (type === 'discardCard') source = 'discard';
        else source = 'deck';

        const sourceItem: DragItem = { card, source, playerId: player?.id, cardIndex, boardCoords };
        const ownerId = card.ownerId;
        const isSpecialItem = card?.deck === DeckType.Tokens || card?.deck === 'counter';

        if (isVisible) {
            const owner = card.ownerId ? gameState.players.find(p => p.id === card.ownerId) : undefined;
            items.push({ label: 'View', isBold: true, onClick: () => setViewingCard({ card, player: owner }) });
        }

        if (canControl) {
            if (type === 'handCard') {
                items.push({ label: 'Play', isBold: true, onClick: () => {
                    closeAllModals();
                    setPlayMode({ card, sourceItem, faceDown: false });
                }});
                 items.push({ label: 'Play Face Down', onClick: () => {
                    closeAllModals();
                    setPlayMode({ card, sourceItem, faceDown: true });
                }});
            } else if (isVisible && ['discardCard', 'deckCard'].includes(type)) {
                 items.push({ label: 'Play Face Up', isBold: true, onClick: () => {
                    closeAllModals();
                    setPlayMode({ card, sourceItem, faceDown: false });
                }});
                items.push({ label: 'Play Face Down', onClick: () => {
                    closeAllModals();
                    setPlayMode({ card, sourceItem, faceDown: true });
                }});
            }
            
            if (items.length > 0) items.push({ isDivider: true });
            
            if (type === 'handCard') {
                items.push({ label: 'Reveal to All', onClick: () => revealHandCard(player.id, cardIndex, 'all') });
            }

            if (items.length > 0 && !('isDivider' in items[items.length - 1])) items.push({ isDivider: true });

            if (type === 'discardCard') {
                items.push({ label: 'To Hand', disabled: isSpecialItem, onClick: () => moveItem(sourceItem, { target: 'hand', playerId: ownerId }) });
            } else if (type === 'handCard') {
                items.push({ label: 'To Discard', onClick: () => moveItem(sourceItem, { target: 'discard', playerId: ownerId }) });
            }
            
            if (['handCard', 'discardCard'].includes(type) && ownerId) {
                 items.push({ label: 'To Deck Top', disabled: isSpecialItem, onClick: () => moveItem(sourceItem, { target: 'deck', playerId: ownerId, deckPosition: 'top'}) });
                 items.push({ label: 'To Deck Bottom', disabled: isSpecialItem, onClick: () => moveItem(sourceItem, { target: 'deck', playerId: ownerId, deckPosition: 'bottom'}) });
            }
             if (type === 'deckCard') {
                 items.push({ label: 'To Hand', disabled: isSpecialItem, onClick: () => moveItem(sourceItem, { target: 'hand', playerId: player.id }) });
                 items.push({ label: 'To Discard', onClick: () => moveItem(sourceItem, { target: 'discard', playerId: player.id }) });
             }

             if (type === 'handCard') {
                const revealedCount = card.statuses?.filter((s: CardStatus) => s.type === 'Revealed').length || 0;
                if (revealedCount > 0) {
                    if (items.length > 0 && !('isDivider' in items[items.length - 1])) items.push({ isDivider: true });
                    items.push({
                        type: 'statusControl',
                        label: 'Revealed',
                        onAdd: () => addHandCardStatus(player.id, cardIndex, 'Revealed', localPlayerId),
                        onRemove: () => removeHandCardStatus(player.id, cardIndex, 'Revealed'),
                        removeDisabled: false
                    });
                }
             }
        } 
        else if (type === 'handCard' && !isVisible) {
             items.push({ label: 'Request Reveal', onClick: () => requestCardReveal({ source: 'hand', ownerId: player.id, cardIndex }, localPlayerId) });
        }

    } else if (type === 'deckPile') {
        const { player } = data;
        const canControl = player.id === localPlayerId || !!player.isDummy;
        if (canControl) {
            items.push({ label: 'Draw Card', onClick: () => drawCard(player.id) });
            items.push({ label: 'Shuffle', onClick: () => shufflePlayerDeck(player.id) });
        }
        items.push({ label: 'View', onClick: () => handleViewDeck(player) });
    } else if (type === 'discardPile') {
        const { player } = data;
        items.push({ label: 'View', onClick: () => handleViewDiscard(player) });
    }
    
    items = items.filter((item, index) => {
        if (!('isDivider' in item)) return true;
        if (index === 0 || index === items.length - 1) return false;
        if ('isDivider' in items[index-1]) return false;
        return true;
    });
    
    return <ContextMenu x={x} y={y} items={items} onClose={closeContextMenu} />;
  }, [gameState, localPlayerId, moveItem, handleTriggerHighlight, addBoardCardStatus, removeBoardCardStatus, modifyBoardCardPower, addAnnouncedCardStatus, removeAnnouncedCardStatus, modifyAnnouncedCardPower, addHandCardStatus, removeHandCardStatus, drawCard, shufflePlayerDeck, flipBoardCard, flipBoardCardFaceDown, revealHandCard, revealBoardCard, requestCardReveal, removeRevealedStatus, activateAbility]);

  useEffect(() => {
    window.addEventListener('click', closeContextMenu);
    
    const handleContextMenu = (e: MouseEvent) => {
        if (!(e.target as HTMLElement).closest('[data-interactive]')) {
             closeContextMenu();
        }
    };
    window.addEventListener('contextmenu', handleContextMenu);

    return () => {
        window.removeEventListener('click', closeContextMenu);
        window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);

  useEffect(() => {
    if (draggedItem) {
      closeContextMenu();
    }
  }, [draggedItem]);

  const handleOpenTokensModal = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (isTokensModalOpen) {
      setTokensModalOpen(false);
      setTokensModalAnchor(null);
    } else {
        setCountersModalOpen(false);
        setCountersModalAnchor(null);
      const rect = event.currentTarget.getBoundingClientRect();
      setTokensModalAnchor({ top: rect.top, left: rect.left });
      setTokensModalOpen(true);
    }
  };

  const handleOpenCountersModal = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (isCountersModalOpen) {
        setCountersModalOpen(false);
        setCountersModalAnchor(null);
    } else {
        setTokensModalOpen(false);
        setTokensModalAnchor(null);
        const rect = event.currentTarget.getBoundingClientRect();
        setCountersModalAnchor({ top: rect.top, left: rect.left });
        setCountersModalOpen(true);
    }
  };

  const handleCounterMouseDown = (type: string, e: React.MouseEvent) => {
      lastClickPos.current = { x: e.clientX, y: e.clientY };
      
      setCursorStack(prev => {
          if (prev && prev.type === type) {
              return { type, count: prev.count + 1, isDragging: true, sourceCoords: prev.sourceCoords };
          }
          return { type, count: 1, isDragging: true };
      });
  };

  if (!isGameActive) {
    const buttonClass = "bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-lg text-lg w-full transition-colors disabled:bg-gray-600 disabled:text-gray-400 disabled:cursor-not-allowed";
    const socialLinkClass = "text-gray-400 hover:text-white transition-colors";
    
    return (
      <div className="flex items-center justify-center h-screen bg-gray-800">
        <div className="text-center p-4 flex flex-col items-center">
          <h1 className="text-5xl font-bold mb-12">New Avalon: Skirmish</h1>
          <div className="flex flex-col space-y-4 w-64">
            <div className="flex items-center space-x-2">
                <button onClick={handleCreateGame} className={`${buttonClass} flex-grow`}>
                  Start Game
                </button>
                <button 
                  onClick={() => setSettingsModalOpen(true)} 
                  className="bg-gray-600 hover:bg-gray-700 text-white font-bold p-3 rounded-lg transition-colors aspect-square"
                  title="Settings"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
            </div>
            <button onClick={handleOpenJoinModal} className={buttonClass}>
              Join Game
            </button>
             <button onClick={() => setDeckBuilderOpen(true)} className={buttonClass}>
              Deck Building
            </button>
             <button disabled className={buttonClass}>
              Story Mode
            </button>
             <button disabled className={buttonClass}>
              Puzzles
            </button>
             <button onClick={() => setRulesModalOpen(true)} className={buttonClass}>
              Rules & Tutorial
            </button>
          </div>
           <div className="mt-16 flex items-center space-x-8">
            <a href="https://t.me/NikitaAnahoretTriakin" target="_blank" rel="noopener noreferrer" className={socialLinkClass} title="Telegram">
               <img src="https://upload.wikimedia.org/wikipedia/commons/5/5c/Telegram_Messenger.png" alt="Telegram" className="h-8 w-8 object-contain" />
            </a>
            <a href="https://discord.gg/U5zKADsZZY" target="_blank" rel="noopener noreferrer" className={socialLinkClass} title="Discord">
               <img src="https://cdn-icons-png.flaticon.com/512/2111/2111370.png" alt="Discord" className="h-8 w-8 object-contain" />
            </a>
             <a href="https://www.patreon.com/c/AnchoriteComics" target="_blank" rel="noopener noreferrer" className={socialLinkClass} title="Patreon">
                <img src="https://cdn-icons-png.flaticon.com/512/5968/5968722.png" alt="Patreon" className="h-8 w-8 object-contain" />
            </a>
          </div>
          <JoinGameModal
            isOpen={isJoinModalOpen}
            onClose={() => setJoinModalOpen(false)}
            onJoin={handleJoinGame}
            games={gamesList}
          />
          <DeckBuilderModal 
            isOpen={isDeckBuilderOpen}
            onClose={() => setDeckBuilderOpen(false)}
            setViewingCard={setViewingCard}
          />
           <SettingsModal
            isOpen={isSettingsModalOpen}
            onClose={() => setSettingsModalOpen(false)}
            onSave={handleSaveSettings}
          />
          <RulesModal 
            isOpen={isRulesModalOpen}
            onClose={() => setRulesModalOpen(false)}
          />
          {viewingCard && (
            <CardDetailModal
              card={viewingCard.card}
              ownerPlayer={viewingCard.player}
              onClose={() => setViewingCard(null)}
              statusDescriptions={STATUS_DESCRIPTIONS}
              allPlayers={gameState.players}
              imageRefreshVersion={imageRefreshVersion}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`relative w-screen h-screen overflow-hidden ${cursorStack ? 'cursor-none' : ''}`}>
      <Header
        gameId={gameState.gameId}
        isGameStarted={gameState.isGameStarted}
        onStartGame={handleStartGameSequence}
        onResetGame={resetGame}
        activeGridSize={gameState.activeGridSize}
        onGridSizeChange={setActiveGridSize}
        dummyPlayerCount={gameState.dummyPlayerCount}
        onDummyPlayerCountChange={setDummyPlayerCount}
        realPlayerCount={realPlayerCount}
        connectionStatus={connectionStatus}
        onExitGame={exitGame}
        onOpenTokensModal={handleOpenTokensModal}
        onOpenCountersModal={handleOpenCountersModal}
        gameMode={gameState.gameMode}
        onGameModeChange={setGameMode}
        isPrivate={gameState.isPrivate}
        onPrivacyChange={setGamePrivacy}
        isHost={isHost}
        onSyncGame={handleSyncAndRefresh}
        currentPhase={gameState.currentPhase}
        onNextPhase={nextPhase}
        onPrevPhase={prevPhase}
        onSetPhase={setPhase}
        isAutoAbilitiesEnabled={isAutoAbilitiesEnabled}
        onToggleAutoAbilities={setIsAutoAbilitiesEnabled}
      />
      
      {isListMode ? (
        <div className="relative h-full w-full pt-14 overflow-hidden bg-gray-900">
            {localPlayer && (
                <div 
                    ref={leftPanelRef}
                    className="absolute left-0 top-14 bottom-[2px] z-30 bg-panel-bg shadow-xl flex flex-col border-r border-gray-700 w-fit min-w-0 pl-[2px] py-[2px] pr-0 transition-all duration-100 overflow-hidden"
                    style={{ width: leftPanelWidth }}
                >
                     <PlayerPanel
                        key={localPlayer.id}
                        player={localPlayer}
                        isLocalPlayer={true}
                        localPlayerId={localPlayerId}
                        isSpectator={isSpectator}
                        isGameStarted={gameState.isGameStarted}
                        position={localPlayer.id}
                        onNameChange={(name) => updatePlayerName(localPlayer.id, name)}
                        onColorChange={(color) => changePlayerColor(localPlayer.id, color)}
                        onScoreChange={(delta) => updatePlayerScore(localPlayer.id, delta)}
                        onDeckChange={(deckType) => changePlayerDeck(localPlayer.id, deckType)}
                        onLoadCustomDeck={(deckFile) => loadCustomDeck(localPlayer.id, deckFile)}
                        onDrawCard={() => drawCard(localPlayer.id)}
                        handleDrop={handleDrop}
                        draggedItem={draggedItem}
                        setDraggedItem={setDraggedItem}
                        openContextMenu={openContextMenu}
                        onHandCardDoubleClick={handleDoubleClickHandCard}
                        playerColorMap={playerColorMap}
                        allPlayers={gameState.players}
                        localPlayerTeamId={localPlayer?.teamId}
                        activeTurnPlayerId={gameState.activeTurnPlayerId}
                        onToggleActiveTurn={toggleActiveTurnPlayer}
                        imageRefreshVersion={imageRefreshVersion}
                        layoutMode="list-local"
                        onCardClick={handleHandCardClick}
                        validHandTargets={validHandTargets}
                        onAnnouncedCardDoubleClick={handleAnnouncedCardDoubleClick}
                        currentPhase={gameState.currentPhase}
                        disableActiveHighlights={isTargetingMode}
                     />
                </div>
            )}

            <div 
                className="absolute top-14 bottom-0 z-10 flex items-center justify-center pointer-events-none w-full left-0"
            >
                 <div 
                    ref={boardContainerRef}
                    className="pointer-events-auto h-full aspect-square flex items-center justify-center py-[2px]"
                 >
                     <GameBoard
                        board={gameState.board}
                        isGameStarted={gameState.isGameStarted}
                        activeGridSize={gameState.activeGridSize}
                        handleDrop={handleDrop}
                        draggedItem={draggedItem}
                        setDraggedItem={setDraggedItem}
                        openContextMenu={openContextMenu}
                        playMode={playMode}
                        setPlayMode={setPlayMode}
                        highlight={highlight}
                        playerColorMap={playerColorMap}
                        localPlayerId={localPlayerId}
                        onCardDoubleClick={handleDoubleClickBoardCard}
                        onEmptyCellDoubleClick={handleDoubleClickEmptyCell}
                        imageRefreshVersion={imageRefreshVersion}
                        cursorStack={cursorStack}
                        setCursorStack={setCursorStack}
                        currentPhase={gameState.currentPhase}
                        activeTurnPlayerId={gameState.activeTurnPlayerId}
                        onCardClick={handleBoardCardClick}
                        onEmptyCellClick={handleEmptyCellClick}
                        validTargets={validTargets}
                        noTargetOverlay={noTargetOverlay}
                        disableActiveHighlights={isTargetingMode}
                     />
                 </div>
            </div>

            <div className="absolute right-0 top-14 bottom-0 z-30 w-[34.2rem] bg-panel-bg shadow-xl flex flex-col pt-[3px] pb-[3px] border-l border-gray-700 gap-[3px]">
                 {gameState.players
                    .filter(p => p.id !== localPlayerId)
                    .map(player => (
                        <div key={player.id} className="w-full flex-1 min-h-0">
                            <PlayerPanel
                                player={player}
                                isLocalPlayer={false}
                                localPlayerId={localPlayerId}
                                isSpectator={isSpectator}
                                isGameStarted={gameState.isGameStarted}
                                position={player.id}
                                onNameChange={(name) => updatePlayerName(player.id, name)}
                                onColorChange={(color) => changePlayerColor(player.id, color)}
                                onScoreChange={(delta) => updatePlayerScore(player.id, delta)}
                                onDeckChange={(deckType) => changePlayerDeck(player.id, deckType)}
                                onLoadCustomDeck={(deckFile) => loadCustomDeck(player.id, deckFile)}
                                onDrawCard={() => drawCard(player.id)}
                                handleDrop={handleDrop}
                                draggedItem={draggedItem}
                                setDraggedItem={setDraggedItem}
                                openContextMenu={openContextMenu}
                                onHandCardDoubleClick={handleDoubleClickHandCard}
                                playerColorMap={playerColorMap}
                                allPlayers={gameState.players}
                                localPlayerTeamId={localPlayer?.teamId}
                                activeTurnPlayerId={gameState.activeTurnPlayerId}
                                onToggleActiveTurn={toggleActiveTurnPlayer}
                                imageRefreshVersion={imageRefreshVersion}
                                layoutMode="list-remote"
                                onCardClick={handleHandCardClick}
                                validHandTargets={validHandTargets}
                                onAnnouncedCardDoubleClick={handleAnnouncedCardDoubleClick}
                                currentPhase={gameState.currentPhase}
                                disableActiveHighlights={isTargetingMode}
                            />
                        </div>
                    ))
                 }
            </div>
        </div>
      ) : (
        <main className="pt-14 h-screen w-full flex items-center justify-center py-[2px] px-[2px]">
            <GameBoard
            board={gameState.board}
            isGameStarted={gameState.isGameStarted}
            activeGridSize={gameState.activeGridSize}
            handleDrop={handleDrop}
            draggedItem={draggedItem}
            setDraggedItem={setDraggedItem}
            openContextMenu={openContextMenu}
            playMode={playMode}
            setPlayMode={setPlayMode}
            highlight={highlight}
            playerColorMap={playerColorMap}
            localPlayerId={localPlayerId}
            onCardDoubleClick={handleDoubleClickBoardCard}
            onEmptyCellDoubleClick={handleDoubleClickEmptyCell}
            imageRefreshVersion={imageRefreshVersion}
            cursorStack={cursorStack}
            setCursorStack={setCursorStack}
            currentPhase={gameState.currentPhase}
            activeTurnPlayerId={gameState.activeTurnPlayerId}
            onCardClick={handleBoardCardClick}
            onEmptyCellClick={handleEmptyCellClick}
            validTargets={validTargets}
            noTargetOverlay={noTargetOverlay}
            disableActiveHighlights={isTargetingMode}
            />
            
            {gameState.players.map((player) => (
                <PlayerPanel
                key={player.id}
                player={player}
                isLocalPlayer={player.id === localPlayerId}
                localPlayerId={localPlayerId}
                isSpectator={isSpectator}
                isGameStarted={gameState.isGameStarted}
                position={player.id}
                onNameChange={(name) => updatePlayerName(player.id, name)}
                onColorChange={(color) => changePlayerColor(player.id, color)}
                onScoreChange={(delta) => updatePlayerScore(player.id, delta)}
                onDeckChange={(deckType) => changePlayerDeck(player.id, deckType)}
                onLoadCustomDeck={(deckFile) => loadCustomDeck(player.id, deckFile)}
                onDrawCard={() => drawCard(player.id)}
                handleDrop={handleDrop}
                draggedItem={draggedItem}
                setDraggedItem={setDraggedItem}
                openContextMenu={openContextMenu}
                onHandCardDoubleClick={handleDoubleClickHandCard}
                playerColorMap={playerColorMap}
                allPlayers={gameState.players}
                localPlayerTeamId={localPlayer?.teamId}
                activeTurnPlayerId={gameState.activeTurnPlayerId}
                onToggleActiveTurn={toggleActiveTurnPlayer}
                imageRefreshVersion={imageRefreshVersion}
                layoutMode="standard"
                onCardClick={handleHandCardClick}
                validHandTargets={validHandTargets}
                onAnnouncedCardDoubleClick={handleAnnouncedCardDoubleClick}
                currentPhase={gameState.currentPhase}
                disableActiveHighlights={isTargetingMode}
                />
            ))}
        </main>
      )}

      {(cursorStack || (abilityMode && abilityMode.payload?.tokenType)) && (
          <div 
            ref={cursorFollowerRef}
            className="fixed pointer-events-none select-none z-[100000] flex items-center justify-center"
            style={{ left: mousePos.current.x - 2, top: mousePos.current.y - 2 }}
          >
              {(cursorStack || abilityMode?.payload?.tokenType) && (
                  <div className="relative w-12 h-12 rounded-full bg-gray-500 border-[3px] border-white flex items-center justify-center shadow-xl">
                       {(() => {
                           const type = cursorStack ? cursorStack.type : abilityMode!.payload.tokenType;
                           const count = cursorStack ? cursorStack.count : (abilityMode?.payload?.count || 1);
                           
                           let iconUrl = STATUS_ICONS[type];
                           if (iconUrl && imageRefreshVersion) iconUrl = `${iconUrl}?v=${imageRefreshVersion}`;
                           const isPower = type.startsWith('Power');
                           
                           return iconUrl ? (
                               <img src={iconUrl} alt={type} className="w-full h-full object-contain p-1" draggable="false" />
                           ) : (
                               <span className={`font-bold text-white ${isPower ? 'text-sm' : 'text-lg'}`} style={{ textShadow: '0 0 2px black' }}>
                                    {isPower ? (type === 'Power+' ? '+P' : '-P') : type.charAt(0)}
                               </span>
                           );
                       })()}
                       <div className="absolute -top-2 -right-2 bg-red-600 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center border border-white">
                           {cursorStack ? cursorStack.count : (abilityMode?.payload?.count || 1)}
                       </div>
                  </div>
              )}
          </div>
      )}

      {isSpectator && !isListMode && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black bg-opacity-70 p-4 rounded-lg z-50">
          <p className="text-xl font-bold text-center">Spectator Mode</p>
          <p className="text-center text-gray-300">You are watching the game.</p>
        </div>
      )}

      {(() => {
          const request = gameState.revealRequests.find(r => r.toPlayerId === localPlayerId);
          if (!request) return null;
          const fromPlayer = gameState.players.find(p => p.id === request.fromPlayerId);
          return fromPlayer ? (
            <RevealRequestModal
              fromPlayer={fromPlayer}
              cardCount={request.cardIdentifiers.length}
              onAccept={() => respondToRevealRequest(request.fromPlayerId, true)}
              onDecline={() => respondToRevealRequest(request.fromPlayerId, false)}
            />
          ) : null;
      })()}
      
      {isTeamAssignOpen && isHost && (
        <TeamAssignmentModal
          players={gameState.players.filter(p => !p.isDisconnected)}
          gameMode={gameState.gameMode}
          onCancel={() => setTeamAssignOpen(false)}
          onConfirm={handleTeamAssignment}
        />
      )}
      
      {gameState.isReadyCheckActive && !isSpectator && localPlayer && (
        <ReadyCheckModal
            players={gameState.players.filter(p => !p.isDummy && !p.isDisconnected)}
            localPlayer={localPlayer}
            onReady={playerReady}
            onCancel={cancelReadyCheck}
        />
      )}

      {viewingDiscard && (() => {
          const playerInState = gameState.players.find(p => p.id === viewingDiscard.player.id);
          const currentCards = playerInState ? playerInState.discard : [];
          const displayedCards = viewingDiscard.pickMode 
            ? currentCards.filter(c => c.types?.includes('Device')) 
            : currentCards;

          return (
            <DiscardModal
              isOpen={!!viewingDiscard}
              onClose={() => setViewingDiscard(null)}
              title={`${viewingDiscard.player.name}'s Discard Pile ${viewingDiscard.pickMode ? '(Pick a Device)' : ''}`}
              player={viewingDiscard.player}
              cards={displayedCards}
              setDraggedItem={setDraggedItem}
              onCardContextMenu={(e, cardIndex) => openContextMenu(e, 'discardCard', { card: displayedCards[cardIndex], player: viewingDiscard.player, cardIndex })}
              onCardDoubleClick={(cardIndex) => {
                  if (viewingDiscard.pickMode) {
                      const realIndex = currentCards.indexOf(displayedCards[cardIndex]);
                      if (realIndex > -1) {
                           recoverDiscardedCard(viewingDiscard.player.id, realIndex);
                           setViewingDiscard(null); 
                      }
                  } else {
                      handleDoubleClickPileCard(viewingDiscard.player, displayedCards[cardIndex], cardIndex, 'discard');
                  }
              }}
              canInteract={(localPlayerId !== null && gameState.isGameStarted && (viewingDiscard.player.id === localPlayerId || !!viewingDiscard.player.isDummy))}
              playerColorMap={playerColorMap}
              localPlayerId={localPlayerId}
              imageRefreshVersion={imageRefreshVersion}
            />
          );
      })()}

       {viewingDeck && (() => {
          const playerInState = gameState.players.find(p => p.id === viewingDeck.id);
          const currentCards = playerInState ? playerInState.deck : [];
          return (
            <DiscardModal
              isOpen={!!viewingDeck}
              onClose={() => setViewingDeck(null)}
              title={`${viewingDeck.name}'s Deck`}
              player={viewingDeck}
              cards={currentCards}
              setDraggedItem={setDraggedItem}
              onCardContextMenu={(e, cardIndex) => openContextMenu(e, 'deckCard', { card: currentCards[cardIndex], player: viewingDeck, cardIndex })}
              onCardDoubleClick={(cardIndex) => handleDoubleClickPileCard(viewingDeck, currentCards[cardIndex], cardIndex, 'deck')}
              canInteract={localPlayerId !== null && gameState.isGameStarted && (viewingDeck.id === localPlayerId || !!viewingDeck.isDummy)}
              isDeckView={true}
              playerColorMap={playerColorMap}
              localPlayerId={localPlayerId}
              imageRefreshVersion={imageRefreshVersion}
            />
          );
      })()}

       <TokensModal
        isOpen={isTokensModalOpen}
        onClose={() => setTokensModalOpen(false)}
        setDraggedItem={setDraggedItem}
        openContextMenu={openContextMenu}
        canInteract={localPlayerId !== null && gameState.isGameStarted}
        anchorEl={tokensModalAnchor}
        imageRefreshVersion={imageRefreshVersion}
        draggedItem={draggedItem}
      />

      <CountersModal
        isOpen={isCountersModalOpen}
        onClose={() => setCountersModalOpen(false)}
        setDraggedItem={setDraggedItem}
        canInteract={localPlayerId !== null && gameState.isGameStarted}
        anchorEl={countersModalAnchor}
        imageRefreshVersion={imageRefreshVersion}
        onCounterMouseDown={handleCounterMouseDown}
        cursorStack={cursorStack}
      />

      {viewingCard && (
        <CardDetailModal
          card={viewingCard.card}
          ownerPlayer={viewingCard.player}
          onClose={() => setViewingCard(null)}
          statusDescriptions={STATUS_DESCRIPTIONS}
          allPlayers={gameState.players}
          imageRefreshVersion={imageRefreshVersion}
        />
      )}

      {renderedContextMenu}
    </div>
  );
}