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
import { CommandModal } from './components/CommandModal';
import { MainMenu } from './components/MainMenu';
import { RoundEndModal } from './components/RoundEndModal'; 
import { CounterSelectionModal } from './components/CounterSelectionModal';
import { SecretInformantModal } from './components/SecretInformantModal'; 
import { useGameState } from './hooks/useGameState';
import { useAppAbilities } from './hooks/useAppAbilities';
import { useAppCommand } from './hooks/useAppCommand';
import { useAppCounters } from './hooks/useAppCounters';
import type { Player, Card, DragItem, ContextMenuItem, ContextMenuParams, CursorStackState, CardStatus, HighlightData, PlayerColor, FloatingTextData, CommandContext, CounterSelectionData } from './types';
import { AbilityAction } from './types';
import { DeckType, GameMode } from './types';
import { STATUS_ICONS, STATUS_DESCRIPTIONS } from './constants';
import { canActivateAbility } from './utils/autoAbilities';
import { countersDatabase } from './contentDatabase';
import { validateTarget, calculateValidTargets, checkActionHasTargets } from './utils/targeting';
import { useLanguage } from './contexts/LanguageContext';

const COUNTER_BG_URL = 'https://res.cloudinary.com/dxxh6meej/image/upload/v1763653192/background_counter_socvss.png';

export default function App() {
  const { t } = useLanguage();
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
    latestHighlight,
    latestFloatingTexts, 
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
  } = useGameState();

  const [isJoinModalOpen, setJoinModalOpen] = useState(false);
  const [isDeckBuilderOpen, setDeckBuilderOpen] = useState(false);
  const [isSettingsModalOpen, setSettingsModalOpen] = useState(false);
  const [isTokensModalOpen, setTokensModalOpen] = useState(false);
  const [isCountersModalOpen, setCountersModalOpen] = useState(false);
  const [isRulesModalOpen, setRulesModalOpen] = useState(false);
  
  // Command & Ability State
  const [commandModalCard, setCommandModalCard] = useState<Card | null>(null);
  const [counterSelectionData, setCounterSelectionData] = useState<CounterSelectionData | null>(null);
  const [secretInformantData, setSecretInformantData] = useState<{ targetPlayerId: number, sourceCard: Card | undefined, isDeployAbility?: boolean, sourceCoords?: {row: number, col: number}, snapshot?: Card[] } | null>(null); 
  
  const [tokensModalAnchor, setTokensModalAnchor] = useState<{ top: number; left: number } | null>(null);
  const [countersModalAnchor, setCountersModalAnchor] = useState<{ top: number; left: number } | null>(null);
  const [isTeamAssignOpen, setTeamAssignOpen] = useState(false);
  
  // Unified viewing state for Deck and Discard
  const [viewingDiscard, setViewingDiscard] = useState<{ 
      player: Player; 
      isDeckView?: boolean; 
      pickConfig?: { 
          filterType: string; 
          action: 'recover' | 'resurrect'; 
          targetCoords?: {row: number, col: number}; 
          isDeck?: boolean 
      } 
  } | null>(null);
  
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
  
  const [highlight, setHighlight] = useState<HighlightData | null>(null);
  const [activeFloatingTexts, setActiveFloatingTexts] = useState<FloatingTextData[]>([]); 
  const [isAutoAbilitiesEnabled, setIsAutoAbilitiesEnabled] = useState(true);
  const [abilityMode, setAbilityMode] = useState<AbilityAction | null>(null);
  const [actionQueue, setActionQueue] = useState<AbilityAction[]>([]); 
  const [validTargets, setValidTargets] = useState<{row: number, col: number}[]>([]);
  const [validHandTargets, setValidHandTargets] = useState<{playerId: number, cardIndex: number}[]>([]);
  const [noTargetOverlay, setNoTargetOverlay] = useState<{row: number, col: number} | null>(null);
  const [commandContext, setCommandContext] = useState<CommandContext>({}); 
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const boardContainerRef = useRef<HTMLDivElement>(null);
  const [sidePanelWidth, setSidePanelWidth] = useState<number | undefined>(undefined);
  
  const interactionLock = useRef(false);

  // Lifted state for cursor stack to resolve circular dependency
  const [cursorStack, setCursorStack] = useState<CursorStackState | null>(null);

  // Hook for Command Logic
  const {
      playCommandCard,
      handleCommandConfirm,
      handleCounterSelectionConfirm
  } = useAppCommand({
      gameState,
      localPlayerId,
      setActionQueue,
      setCommandContext,
      setCommandModalCard,
      setCounterSelectionData,
      moveItem,
      drawCard,
      updatePlayerScore,
      removeBoardCardStatus,
      setCursorStack,
      setAbilityMode,
      setNoTargetOverlay
  });

  // Hook for General Abilities
  const { 
      activateAbility,
      executeAction,
      handleLineSelection,
      handleBoardCardClick,
      handleEmptyCellClick,
      handleHandCardClick,
      handleAnnouncedCardDoubleClick
  } = useAppAbilities({
      gameState,
      localPlayerId,
      abilityMode,
      setAbilityMode,
      cursorStack,
      setCursorStack,
      commandContext,
      setCommandContext,
      setViewingDiscard,
      setNoTargetOverlay,
      setPlayMode,
      setCounterSelectionData,
      interactionLock,
      moveItem,
      drawCard,
      updatePlayerScore,
      markAbilityUsed,
      applyGlobalEffect,
      swapCards,
      transferStatus,
      transferAllCounters,
      resurrectDiscardedCard,
      spawnToken,
      scoreLine,
      nextPhase,
      modifyBoardCardPower,
      addBoardCardStatus,
      removeBoardCardStatus,
      removeBoardCardStatusByOwner,
      resetDeployStatus,
      scoreDiagonal,
      removeStatusByType
  });

  // Hook for Counters Logic
  const {
      cursorFollowerRef,
      handleCounterMouseDown
  } = useAppCounters({
      gameState,
      localPlayerId,
      handleDrop,
      markAbilityUsed,
      setAbilityMode,
      requestCardReveal,
      interactionLock,
      abilityMode,
      setCommandContext, // Passed down for False Orders Step 1 recording
      onAction: executeAction, // Pass the executor here
      cursorStack,
      setCursorStack
  });

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

  // New handler for deck clicks (Secret Informant)
  const handleDeckClick = (targetPlayerId: number) => {
      if (abilityMode?.mode === 'SELECT_DECK') {
          const targetPlayer = gameState.players.find(p => p.id === targetPlayerId);
          // Snapshot top 3 cards from current deck state
          const snapshot = targetPlayer ? targetPlayer.deck.slice(0, 3) : [];
          
          setSecretInformantData({
              targetPlayerId,
              sourceCard: abilityMode.sourceCard,
              isDeployAbility: abilityMode.isDeployAbility,
              sourceCoords: abilityMode.sourceCoords,
              snapshot
          });
          setAbilityMode(null);
      }
  };

  const handleInformantMoveToBottom = (cardIndex: number) => {
      if (!secretInformantData || !secretInformantData.snapshot) return;
      
      const targetPlayer = gameState.players.find(p => p.id === secretInformantData.targetPlayerId);
      if (!targetPlayer) return;

      // Re-calculate the currently visible cards based on the snapshot
      const visibleCards = secretInformantData.snapshot.filter(snapCard => {
          const currentIdx = targetPlayer.deck.findIndex(c => c.id === snapCard.id);
          return currentIdx !== -1 && currentIdx < 3;
      });

      const cardToMove = visibleCards[cardIndex];
      
      if (cardToMove) {
          // Find real index in current deck
          const realIndex = targetPlayer.deck.findIndex(c => c.id === cardToMove.id);
          if (realIndex !== -1) {
              moveItem({
                  // Using DeckType.Custom as a dummy type for the action object
                  card: { id: 'dummy', deck: DeckType.Custom, name: '', imageUrl: '', fallbackImage: '', power: 0, ability: '', types: [] }, 
                  source: 'deck',
                  playerId: secretInformantData.targetPlayerId,
                  cardIndex: realIndex
              }, {
                  target: 'deck',
                  playerId: secretInformantData.targetPlayerId,
                  deckPosition: 'bottom'
              });
          }
      }
  };

  const handleInformantClose = () => {
      if (secretInformantData) {
          // Draw card for the owner of the Informant
          if (secretInformantData.sourceCard?.ownerId !== undefined) {
              drawCard(secretInformantData.sourceCard.ownerId);
          }
          // Mark ability used
          if (secretInformantData.sourceCoords) {
              markAbilityUsed(secretInformantData.sourceCoords, secretInformantData.isDeployAbility);
          }
      }
      setSecretInformantData(null);
  };

  const secretInformantCards = useMemo(() => {
      if (!secretInformantData || !secretInformantData.snapshot) return [];
      const targetPlayer = gameState.players.find(p => p.id === secretInformantData.targetPlayerId);
      if (!targetPlayer) return [];
      
      // Filter snapshot to show only cards that are still in the top 3 of the real deck
      return secretInformantData.snapshot.filter(snapCard => {
          const currentIdx = targetPlayer.deck.findIndex(c => c.id === snapCard.id);
          return currentIdx !== -1 && currentIdx < 3;
      });
  }, [secretInformantData, gameState.players]);


  useLayoutEffect(() => {
      const handleResize = () => {
          if (!isListMode) return;
          const headerHeight = 56;
          // Board height in container is roughly viewport height - header height.
          const availableHeight = window.innerHeight - headerHeight;
          // Board is aspect-square, so width ~= height
          const boardWidth = availableHeight; 
          
          // Calculate free space to the left/right of the centered board
          const availableWidth = window.innerWidth;
          const remainingX = (availableWidth - boardWidth) / 2;
          
          // Set panel width to fill that space (clamped to 0)
          setSidePanelWidth(Math.max(0, remainingX));
      };

      window.addEventListener('resize', handleResize);
      handleResize(); // Initial calculation
      return () => window.removeEventListener('resize', handleResize);
  }, [isListMode]);

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
      const handleCancelInteraction = () => {
          if (abilityMode && abilityMode.sourceCoords && abilityMode.sourceCoords.row >= 0) {
              markAbilityUsed(abilityMode.sourceCoords, abilityMode.isDeployAbility);
          }
          if (cursorStack && cursorStack.sourceCoords && cursorStack.sourceCoords.row >= 0) {
              markAbilityUsed(cursorStack.sourceCoords, cursorStack.isDeployAbility);
          }

          // Robust cleanup for ALL controlled players (Local + Dummies)
          gameState.players.forEach(p => {
              // Check if we have permission to control this player (Local or Dummy if we are Host/involved)
              if ((p.id === localPlayerId || p.isDummy) && p.announcedCard) {
                  moveItem({
                      card: p.announcedCard,
                      source: 'announced',
                      playerId: p.id
                  }, {
                      target: 'discard',
                      playerId: p.id
                  });
              }
          });

          setCursorStack(null);
          setPlayMode(null);
          setAbilityMode(null);
          setViewingDiscard(null);
          setCommandModalCard(null);
          setActionQueue([]); 
          setCommandContext({});
          setCounterSelectionData(null);
          setSecretInformantData(null);
      };

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
              handleCancelInteraction();
          }
      };
      
      const handleRightClick = (e: MouseEvent) => {
          if (cursorStack || playMode || abilityMode) {
              e.preventDefault();
              handleCancelInteraction();
          }
      };
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('contextmenu', handleRightClick); 
      return () => {
          window.removeEventListener('keydown', handleKeyDown);
          window.removeEventListener('contextmenu', handleRightClick);
      }
  }, [cursorStack, playMode, abilityMode, markAbilityUsed, gameState.isGameStarted, nextPhase, localPlayer, moveItem, gameState.players, localPlayerId]);

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
              excludeOwnerId: cursorStack.excludeOwnerId,
              targetType: cursorStack.targetType,
              requiredTargetStatus: cursorStack.requiredTargetStatus,
              mustBeAdjacentToSource: cursorStack.mustBeAdjacentToSource,
              mustBeInLineWithSource: cursorStack.mustBeInLineWithSource,
              sourceCoords: cursorStack.sourceCoords
          };
      }
      
      // Effective actor logic for highlighting valid targets
      let actorId = localPlayerId || gameState.activeTurnPlayerId;
      if (effectiveAction?.sourceCard?.ownerId) {
          actorId = effectiveAction.sourceCard.ownerId;
      } else if (effectiveAction?.sourceCoords && effectiveAction.sourceCoords.row >= 0) {
          const sourceCard = gameState.board[effectiveAction.sourceCoords.row][effectiveAction.sourceCoords.col].card;
          if (sourceCard?.ownerId) actorId = sourceCard.ownerId;
      } else if (gameState.activeTurnPlayerId) {
          const activePlayer = gameState.players.find(p => p.id === gameState.activeTurnPlayerId);
          if (activePlayer?.isDummy) actorId = activePlayer.id;
      }

      const boardTargets = calculateValidTargets(effectiveAction, gameState, actorId, commandContext);
      const handTargets: {playerId: number, cardIndex: number}[] = [];
      
      if (abilityMode && abilityMode.type === 'ENTER_MODE' && abilityMode.mode === 'SELECT_TARGET') {
          // Special logic for Quick Response Team Hand Selection highlight
          if (abilityMode.payload.actionType === 'SELECT_HAND_FOR_DEPLOY' || abilityMode.payload.filter) {
              gameState.players.forEach(p => {
                  p.hand.forEach((card, index) => {
                      // Ensure payload filter is used for hand targets too
                      if (abilityMode.payload.filter && abilityMode.payload.filter(card)) {
                          // For Deploy from Hand, only check owner
                          if (abilityMode.payload.actionType === 'SELECT_HAND_FOR_DEPLOY') {
                              if (p.id === actorId) handTargets.push({ playerId: p.id, cardIndex: index });
                          } else {
                              // Generic destroy/select logic
                              handTargets.push({ playerId: p.id, cardIndex: index });
                          }
                      }
                  });
              });
          }
      } 
      else if (cursorStack) {
          const counterDef = countersDatabase[cursorStack.type];
          const allowsHand = cursorStack.type === 'Revealed' || (counterDef && counterDef.allowedTargets && counterDef.allowedTargets.includes('hand'));
          
          if (allowsHand) {
               gameState.players.forEach(p => {
                   p.hand.forEach((card, index) => {
                       const constraints = {
                          targetOwnerId: cursorStack.targetOwnerId,
                          excludeOwnerId: cursorStack.excludeOwnerId,
                          onlyOpponents: cursorStack.onlyOpponents || (cursorStack.targetOwnerId === -1),
                          onlyFaceDown: cursorStack.onlyFaceDown,
                          targetType: cursorStack.targetType,
                          requiredTargetStatus: cursorStack.requiredTargetStatus,
                          tokenType: cursorStack.type
                       };
                       const isValid = validateTarget(
                           { card, ownerId: p.id, location: 'hand' },
                           constraints,
                           actorId,
                           gameState.players
                       );
                       if (isValid) {
                           handTargets.push({ playerId: p.id, cardIndex: index });
                       }
                   });
               });
          }
      }
      if (abilityMode && (abilityMode.mode === 'SCORE_LAST_PLAYED_LINE' || abilityMode.mode === 'SELECT_LINE_END')) {
          const gridSize = gameState.board.length;
          if (abilityMode.sourceCoords) {
              for(let r=0; r<gridSize; r++) boardTargets.push({row: r, col: abilityMode.sourceCoords.col});
              for(let c=0; c<gridSize; c++) boardTargets.push({row: abilityMode.sourceCoords.row, col: c});
          } else {
              for(let r=0; r<gridSize; r++) {
                  for(let c=0; c<gridSize; c++) boardTargets.push({row: r, col: c});
              }
          }
      }

      setValidTargets(boardTargets);
      setValidHandTargets(handTargets);
  }, [abilityMode, cursorStack, gameState.board, gameState.players, localPlayerId, commandContext, gameState.activeTurnPlayerId]);

  useEffect(() => {
      if (latestHighlight) {
          setHighlight(latestHighlight);
          const timer = setTimeout(() => setHighlight(null), 1000);
          return () => clearTimeout(timer);
      }
  }, [latestHighlight]);

  useEffect(() => {
      if (latestFloatingTexts && latestFloatingTexts.length > 0) {
          const newTexts = latestFloatingTexts.map(ft => ({ ...ft, id: `float_${Date.now()}_${Math.random()}` }));
          setActiveFloatingTexts(prev => [...prev, ...newTexts]);
          
          const timer = setTimeout(() => {
              setActiveFloatingTexts(prev => prev.filter(item => !newTexts.find(nt => nt.id === item.id)));
          }, 1500);
          
          return () => clearTimeout(timer);
      }
  }, [latestFloatingTexts]);

  // Scoring Phase Logic
  useEffect(() => {
      // If we left scoring step (e.g. someone else scored), clear the mode
      if (!gameState.isScoringStep && abilityMode?.mode === 'SCORE_LAST_PLAYED_LINE') {
          setAbilityMode(null);
          return;
      }

      if (gameState.isScoringStep && !abilityMode) {
          const activePlayerId = gameState.activeTurnPlayerId;
          const activePlayer = gameState.players.find(p => p.id === activePlayerId);
          // Allow control if it's local player's turn OR if it's a dummy turn (anyone helps dummy)
          const canControl = activePlayer && (activePlayer.id === localPlayerId || activePlayer.isDummy);

          if (canControl) {
              let found = false;
              let lastPlayedCoords = null;
              
              // Find the card with LastPlayed status owned by ACTIVE PLAYER
              for(let r=0; r<gameState.board.length; r++) {
                  for(let c=0; c<gameState.board.length; c++) {
                      const card = gameState.board[r][c].card;
                      if (card && card.statuses?.some(s => s.type === 'LastPlayed' && s.addedByPlayerId === activePlayerId)) {
                          lastPlayedCoords = { row: r, col: c };
                          found = true;
                          break;
                      }
                  }
                  if (found) break;
              }
              
              if (found && lastPlayedCoords) {
                  setAbilityMode({
                      type: 'ENTER_MODE',
                      mode: 'SCORE_LAST_PLAYED_LINE',
                      sourceCoords: lastPlayedCoords
                  });
              } else {
                  // No LastPlayed card found (e.g. destroyed), skip scoring.
                  // Prevent race condition: Only Active Player (or Host for Dummy) triggers the phase change.
                  if (activePlayerId === localPlayerId || (activePlayer?.isDummy && localPlayerId === 1)) {
                      nextPhase();
                  }
              }
          }
      }
  }, [gameState.isScoringStep, gameState.activeTurnPlayerId, localPlayerId, gameState.board, abilityMode, nextPhase, gameState.players]);

  useEffect(() => {
      if (actionQueue.length > 0 && !abilityMode && !cursorStack) {
          const nextAction = actionQueue[0];
          setActionQueue(prev => prev.slice(1));

          // Context Injection Logic for Multi-Step Commands (False Orders / Tactical Maneuver)
          let actionToProcess = { ...nextAction };
          
          if (actionToProcess.mode === 'SELECT_CELL' && commandContext.lastMovedCardCoords) {
              const { row, col } = commandContext.lastMovedCardCoords;
              const contextCard = gameState.board[row][col].card;
              // If we have a context card on the board, inject it as the source for the move.
              // This is crucial for commands where Step 1 selects a unit and Step 2 moves it.
              if (contextCard) {
                  actionToProcess.sourceCard = contextCard;
                  actionToProcess.sourceCoords = commandContext.lastMovedCardCoords;
                  // Force recordContext to true so the subsequent step (e.g. Stun in False Orders Mode 2) 
                  // knows where the card ended up.
                  actionToProcess.recordContext = true; 
              }
          }

          const calculateDynamicCount = (factor: string, ownerId: number) => {
              let count = 0;
              if (factor === 'Aim') {
                  gameState.board.forEach(row => row.forEach(cell => {
                      if (cell.card?.statuses?.some(s => s.type === 'Aim' && s.addedByPlayerId === ownerId)) {
                          count++;
                      }
                  }));
              } else if (factor === 'Exploit') {
                  gameState.board.forEach(row => row.forEach(cell => {
                      if (cell.card?.statuses?.some(s => s.type === 'Exploit' && s.addedByPlayerId === ownerId)) {
                          count++;
                      }
                  }));
              }
              return count;
          };

          if (actionToProcess.type === 'GLOBAL_AUTO_APPLY') {
              if (actionToProcess.payload?.cleanupCommand) {
                   // Robust cleanup: determine target player and use current announced card
                   const targetPlayerId = actionToProcess.payload.ownerId !== undefined 
                       ? actionToProcess.payload.ownerId 
                       : actionToProcess.sourceCard?.ownerId;

                   if (targetPlayerId !== undefined) {
                       const playerState = gameState.players.find(p => p.id === targetPlayerId);
                       // Prefer the card actually sitting in the announced slot
                       const cardToDiscard = playerState?.announcedCard || actionToProcess.sourceCard;
                       
                       if (cardToDiscard && cardToDiscard.id !== 'dummy') {
                           moveItem({ 
                               card: cardToDiscard, 
                               source: 'announced', 
                               playerId: targetPlayerId 
                           }, { 
                               target: 'discard', 
                               playerId: targetPlayerId 
                           });
                       }
                   }
              }
              else if (actionToProcess.payload?.dynamicResource) {
                  const { type, factor, ownerId } = actionToProcess.payload.dynamicResource;
                  const count = calculateDynamicCount(factor, ownerId);
                  if (type === 'draw' && count > 0) {
                      for(let i=0; i<count; i++) drawCard(ownerId);
                  }
              }
              else if (actionToProcess.payload?.resourceChange) {
                  const { draw, score } = actionToProcess.payload.resourceChange;
                  const activePlayerId = actionToProcess.sourceCard?.ownerId || gameState.activeTurnPlayerId; 
                  if (activePlayerId !== undefined) {
                      if (draw) {
                          const count = typeof draw === 'number' ? draw : 1;
                          for(let i=0; i<count; i++) drawCard(activePlayerId);
                      }
                      if (score) {
                          updatePlayerScore(activePlayerId, score);
                      }
                  }
              }
              else if (actionToProcess.payload?.contextReward && actionToProcess.sourceCard) {
                  // This is handled inside useAppAbilities now for better access to board state
                  // but we call executeAction to trigger it
                  executeAction(actionToProcess, actionToProcess.sourceCoords || {row: -1, col: -1});
              }
          } else if (actionToProcess.type === 'CREATE_STACK' || actionToProcess.type === 'OPEN_MODAL') {
              // DIRECTLY EXECUTE the action from the queue.
              executeAction(actionToProcess, actionToProcess.sourceCoords || {row: -1, col: -1});
          } else {
              // Ensure we check targets before blindly setting mode from queue
              const actorId = actionToProcess.sourceCard?.ownerId || localPlayerId;
              const hasTargets = checkActionHasTargets(actionToProcess, gameState, actorId, commandContext);
              
              if (hasTargets) {
                  setAbilityMode(actionToProcess);
              } else {
                  if (actionToProcess.sourceCoords && actionToProcess.sourceCoords.row >= 0) {
                      setNoTargetOverlay(actionToProcess.sourceCoords);
                      setTimeout(() => setNoTargetOverlay(null), 750);
                  }
              }
          }
      }
  }, [actionQueue, abilityMode, cursorStack, localPlayerId, drawCard, updatePlayerScore, gameState.activeTurnPlayerId, gameState.board, moveItem, commandContext, addBoardCardStatus, gameState.players, executeAction]);

  const closeAllModals = () => {
      setTokensModalOpen(false);
      setCountersModalOpen(false);
      setViewingDiscard(null);
      setViewingCard(null);
      setRulesModalOpen(false);
      setCommandModalCard(null);
      setCounterSelectionData(null);
      setSecretInformantData(null);
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

  const closeContextMenu = () => setContextMenuProps(null);
  
  const openContextMenu = (e: React.MouseEvent, type: ContextMenuParams['type'], data: any) => {
    e.preventDefault();
    if (abilityMode || cursorStack || playMode) return;
    e.stopPropagation();
    if (localPlayerId === null) return;
    setContextMenuProps({ x: e.clientX, y: e.clientY, type, data });
  };
  
    const handleDoubleClickBoardCard = (card: Card, boardCoords: { row: number, col: number }) => {
        if (abilityMode || cursorStack) return;
        if (interactionLock.current) return;
        const isOwner = card.ownerId === localPlayerId;
        if (isOwner && card.isFaceDown) { flipBoardCard(boardCoords); return; }
        const owner = card.ownerId ? gameState.players.find(p => p.id === card.ownerId) : undefined;
        const isRevealedByRequest = card.statuses?.some(s => s.type === 'Revealed' && s.addedByPlayerId === localPlayerId);
        const isVisibleForMe = !card.isFaceDown || card.revealedTo === 'all' || (Array.isArray(card.revealedTo) && card.revealedTo.includes(localPlayerId!)) || isRevealedByRequest;
        if (isVisibleForMe || isOwner) { setViewingCard({ card, player: owner }); } else if (localPlayerId !== null) { requestCardReveal({ source: 'board', ownerId: card.ownerId!, boardCoords }, localPlayerId); }
    };
    
    const handleDoubleClickEmptyCell = (boardCoords: { row: number, col: number }) => {
        if (abilityMode || cursorStack) return;
        if (interactionLock.current) return;
        handleTriggerHighlight({ type: 'cell', row: boardCoords.row, col: boardCoords.col });
    };

    const handleDoubleClickHandCard = (player: Player, card: Card, cardIndex: number) => {
        if (abilityMode || cursorStack) return;
        if (interactionLock.current) return;
        
        if (player.id === localPlayerId || player.isDummy) {
            if (card.deck === DeckType.Command) {
                closeAllModals();
                playCommandCard(card, { card, source: 'hand', playerId: player.id, cardIndex });
                return;
            }

            closeAllModals();
            const sourceItem: DragItem = { card, source: 'hand', playerId: player.id, cardIndex };
            setPlayMode({ card, sourceItem, faceDown: false });
        } else if (localPlayerId !== null) {
            const isRevealedToAll = card.revealedTo === 'all';
            const isRevealedToMe = Array.isArray(card.revealedTo) && card.revealedTo.includes(localPlayerId);
            const isRevealedByRequest = card.statuses?.some(s => s.type === 'Revealed' && s.addedByPlayerId === localPlayerId);
            const isVisible = isRevealedToAll || isRevealedToMe || isRevealedByRequest || !!player.isDummy || !!player.isDisconnected;
            if (isVisible) { setViewingCard({ card, player }); } else { requestCardReveal({ source: 'hand', ownerId: player.id, cardIndex }, localPlayerId); }
        }
    };

    const handleDoubleClickPileCard = (player: Player, card: Card, cardIndex: number, source: 'deck' | 'discard') => {
        if (abilityMode || cursorStack) return;
        if (interactionLock.current) return;
        const sourceItem: DragItem = { card, source, playerId: player.id, cardIndex };
        moveItem(sourceItem, { target: 'hand', playerId: player.id });
    };

  const handleViewDeck = (player: Player) => { setViewingDiscard({ player, isDeckView: true }); };
  const handleViewDiscard = (player: Player) => { setViewingDiscard({ player, isDeckView: false }); };
  
  const viewingDiscardPlayer = useMemo(() => {
      if (!viewingDiscard) return null;
      return gameState.players.find(p => p.id === viewingDiscard.player.id) || viewingDiscard.player;
  }, [viewingDiscard, gameState.players]);

  // Derived highlighting filter for DiscardModal (Deck Search)
  const highlightFilter = useMemo(() => {
      if (viewingDiscard?.pickConfig?.filterType === 'Unit') {
          return (card: Card) => !!card.types?.includes('Unit');
      }
      return undefined;
  }, [viewingDiscard?.pickConfig?.filterType]);

  const renderedContextMenu = useMemo(() => {
    // ... (Context menu logic same as original)
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
            if (currentPlayer) { player = currentPlayer; card = currentPlayer.announcedCard || card; }
        }
        if (!card) { setContextMenuProps(null); return null; }
        const owner = card.ownerId ? gameState.players.find(p => p.id === card.ownerId) : undefined;
        const isOwner = card.ownerId === localPlayerId;
        const isDummyCard = !!owner?.isDummy;
        const canControl = isOwner || isDummyCard;
        const isRevealedByRequest = card.statuses?.some(s => s.type === 'Revealed' && (s.addedByPlayerId === localPlayerId));
        const isVisible = !card.isFaceDown || card.revealedTo === 'all' || (Array.isArray(card.revealedTo) && card.revealedTo.includes(localPlayerId!)) || isRevealedByRequest;
        if (isVisible || (isOwner && card.isFaceDown)) { items.push({ label: t('view'), isBold: true, onClick: () => setViewingCard({ card, player: owner }) }); }
        if (!isBoardItem && canControl && card.deck === DeckType.Command) {
             items.push({ label: t('play'), isBold: true, onClick: () => { playCommandCard(card, { card, source: 'announced', playerId: player!.id }); } });
        }
        if (isBoardItem && canControl) {
             if (card.isFaceDown) { items.push({ label: t('flipUp'), isBold: true, onClick: () => flipBoardCard(data.boardCoords) }); } 
             else { items.push({ label: t('flipDown'), onClick: () => flipBoardCardFaceDown(data.boardCoords) }); }
        }
        const sourceItem: DragItem = isBoardItem ? { card, source: 'board', boardCoords: data.boardCoords } : { card, source: 'announced', playerId: player!.id };
        const ownerId = card.ownerId;
        const isSpecialItem = card?.deck === DeckType.Tokens || card?.deck === 'counter';
        if (isBoardItem) {
            if (canControl && card.isFaceDown) { items.push({ label: t('revealToAll'), onClick: () => revealBoardCard(data.boardCoords, 'all') }); }
            if (!isOwner && !isVisible) { items.push({ label: t('requestReveal'), onClick: () => requestCardReveal({ source: 'board', ownerId: card.ownerId!, boardCoords: data.boardCoords }, localPlayerId) }); }
        }
        if (items.length > 0) items.push({ isDivider: true });
        if (canControl && isVisible) {
            items.push({ label: t('toHand'), disabled: isSpecialItem, onClick: () => moveItem(sourceItem, { target: 'hand', playerId: ownerId }) });
            if (ownerId) {
                const discardLabel = isSpecialItem ? 'Remove' : t('toDiscard');
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
        items.push({ label: t('view'), isBold: true, onClick: () => setViewingCard({ card }) });
        items.push({ isDivider: true });
        items.push({ label: t('play'), isBold: true, onClick: () => { closeAllModals(); setPlayMode({ card, sourceItem, faceDown: false }); }});
        items.push({ label: t('playFaceDown'), onClick: () => { closeAllModals(); setPlayMode({ card, sourceItem, faceDown: true }); }});
    } else if (['handCard', 'discardCard', 'deckCard'].includes(type)) {
        let { card, boardCoords, player, cardIndex } = data;
        const currentPlayer = gameState.players.find(p => p.id === player.id);
        if (currentPlayer) {
            player = currentPlayer;
            if (type === 'handCard') { card = currentPlayer.hand[cardIndex] || card; } 
            else if (type === 'discardCard') { card = currentPlayer.discard[cardIndex] || card; } 
            else if (type === 'deckCard') { card = currentPlayer.deck[cardIndex] || card; }
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
            items.push({ label: t('view'), isBold: true, onClick: () => setViewingCard({ card, player: owner }) });
        }
        if (canControl) {
            if (card.deck === DeckType.Command) {
                 items.push({ label: t('play'), isBold: true, onClick: () => { closeAllModals(); playCommandCard(card, sourceItem); }});
            } else if (type === 'handCard') {
                items.push({ label: t('play'), isBold: true, onClick: () => { closeAllModals(); setPlayMode({ card, sourceItem, faceDown: false }); }});
                 items.push({ label: t('playFaceDown'), onClick: () => { closeAllModals(); setPlayMode({ card, sourceItem, faceDown: true }); }});
            } else if (isVisible && ['discardCard', 'deckCard'].includes(type)) {
                 items.push({ label: t('play'), isBold: true, onClick: () => { closeAllModals(); setPlayMode({ card, sourceItem, faceDown: false }); }});
                items.push({ label: t('playFaceDown'), onClick: () => { closeAllModals(); setPlayMode({ card, sourceItem, faceDown: true }); }});
            }
            if (items.length > 0) items.push({ isDivider: true });
            if (type === 'handCard') { items.push({ label: t('revealToAll'), onClick: () => revealHandCard(player.id, cardIndex, 'all') }); }
            if (items.length > 0 && !('isDivider' in items[items.length - 1])) items.push({ isDivider: true });
            if (type === 'discardCard') { items.push({ label: t('toHand'), disabled: isSpecialItem, onClick: () => moveItem(sourceItem, { target: 'hand', playerId: ownerId }) }); } 
            else if (type === 'handCard') { items.push({ label: t('toDiscard'), onClick: () => moveItem(sourceItem, { target: 'discard', playerId: ownerId }) }); }
            if (['handCard', 'discardCard'].includes(type) && ownerId) {
                 items.push({ label: 'To Deck Top', disabled: isSpecialItem, onClick: () => moveItem(sourceItem, { target: 'deck', playerId: ownerId, deckPosition: 'top'}) });
                 items.push({ label: 'To Deck Bottom', disabled: isSpecialItem, onClick: () => moveItem(sourceItem, { target: 'deck', playerId: ownerId, deckPosition: 'bottom'}) });
            }
             if (type === 'deckCard') {
                 items.push({ label: t('toHand'), disabled: isSpecialItem, onClick: () => moveItem(sourceItem, { target: 'hand', playerId: player.id }) });
                 items.push({ label: t('toDiscard'), onClick: () => moveItem(sourceItem, { target: 'discard', playerId: player.id }) });
             }
             if (type === 'handCard') {
                const revealedCount = card.statuses?.filter((s: CardStatus) => s.type === 'Revealed').length || 0;
                if (revealedCount > 0) {
                    if (items.length > 0 && !('isDivider' in items[items.length - 1])) items.push({ isDivider: true });
                    items.push({ type: 'statusControl', label: 'Revealed', onAdd: () => addHandCardStatus(player.id, cardIndex, 'Revealed', localPlayerId), onRemove: () => removeHandCardStatus(player.id, cardIndex, 'Revealed'), removeDisabled: false });
                }
             }
        } 
        else if (type === 'handCard' && !isVisible) { items.push({ label: t('requestReveal'), onClick: () => requestCardReveal({ source: 'hand', ownerId: player.id, cardIndex }, localPlayerId) }); }
    } else if (type === 'deckPile') {
        const { player } = data;
        const canControl = player.id === localPlayerId || !!player.isDummy;
        if (canControl) {
            items.push({ label: 'Draw Card', onClick: () => drawCard(player.id) });
            items.push({ label: 'Draw Starting Hand (6)', onClick: () => { for(let i=0; i<6; i++) drawCard(player.id); } });
            items.push({ label: 'Shuffle', onClick: () => shufflePlayerDeck(player.id) });
        }
        items.push({ label: t('view'), onClick: () => handleViewDeck(player) });
    } else if (type === 'discardPile') {
        const { player } = data;
        items.push({ label: t('view'), onClick: () => handleViewDiscard(player) });
    }
    items = items.filter((item, index) => {
        if (!('isDivider' in item)) return true;
        if (index === 0 || index === items.length - 1) return false;
        if ('isDivider' in items[index-1]) return false;
        return true;
    });
    return <ContextMenu x={x} y={y} items={items} onClose={closeContextMenu} />;
  }, [gameState, localPlayerId, moveItem, handleTriggerHighlight, addBoardCardStatus, removeBoardCardStatus, modifyBoardCardPower, addAnnouncedCardStatus, removeAnnouncedCardStatus, modifyAnnouncedCardPower, addHandCardStatus, removeHandCardStatus, drawCard, shufflePlayerDeck, flipBoardCard, flipBoardCardFaceDown, revealHandCard, revealBoardCard, requestCardReveal, removeRevealedStatus, activateAbility, t, viewingDiscardPlayer, playCommandCard, contextMenuProps]);

  useEffect(() => {
    window.addEventListener('click', closeContextMenu);
    const handleContextMenu = (e: MouseEvent) => {
        if (!(e.target as HTMLElement).closest('[data-interactive]')) { closeContextMenu(); }
    };
    window.addEventListener('contextmenu', handleContextMenu);
    return () => {
        window.removeEventListener('click', closeContextMenu);
        window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);

  useEffect(() => { if (draggedItem) { closeContextMenu(); } }, [draggedItem]);

  const handleOpenTokensModal = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (isTokensModalOpen) { setTokensModalOpen(false); setTokensModalAnchor(null); } 
    else { setCountersModalOpen(false); setCountersModalAnchor(null); const rect = event.currentTarget.getBoundingClientRect(); setTokensModalAnchor({ top: rect.top, left: rect.left }); setTokensModalOpen(true); }
  };

  const handleOpenCountersModal = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (isCountersModalOpen) { setCountersModalOpen(false); setCountersModalAnchor(null); } 
    else { setTokensModalOpen(false); setTokensModalAnchor(null); const rect = event.currentTarget.getBoundingClientRect(); setCountersModalAnchor({ top: rect.top, left: rect.left }); setCountersModalOpen(true); }
  };

  if (!isGameActive) {
    return (
      <MainMenu 
        handleCreateGame={handleCreateGame}
        setSettingsModalOpen={setSettingsModalOpen}
        handleOpenJoinModal={handleOpenJoinModal}
        setDeckBuilderOpen={setDeckBuilderOpen}
        setRulesModalOpen={setRulesModalOpen}
        isJoinModalOpen={isJoinModalOpen}
        setJoinModalOpen={setJoinModalOpen}
        handleJoinGame={handleJoinGame}
        gamesList={gamesList}
        isDeckBuilderOpen={isDeckBuilderOpen}
        setViewingCard={setViewingCard}
        isSettingsModalOpen={isSettingsModalOpen}
        handleSaveSettings={handleSaveSettings}
        isRulesModalOpen={isRulesModalOpen}
        viewingCard={viewingCard}
        gameState={gameState}
        imageRefreshVersion={imageRefreshVersion}
        t={t}
      />
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
        isScoringStep={gameState.isScoringStep} 
        currentRound={gameState.currentRound}
        turnNumber={gameState.turnNumber}
      />
      
      {gameState.isRoundEndModalOpen && (
          <RoundEndModal
              gameState={gameState}
              onConfirm={confirmRoundEnd}
              localPlayerId={localPlayerId}
              onExit={exitGame}
          />
      )}
      
      {commandModalCard && (
          <CommandModal
              isOpen={!!commandModalCard}
              card={commandModalCard}
              playerColorMap={new Map(gameState.players.map(p => [p.id, p.color])) as any}
              onConfirm={(index) => handleCommandConfirm(index, commandModalCard)}
              onCancel={() => { setCommandModalCard(null); setActionQueue([]); setCommandContext({}); }}
          />
      )}

      {counterSelectionData && (
          <CounterSelectionModal
              isOpen={!!counterSelectionData}
              data={counterSelectionData}
              onConfirm={(count) => handleCounterSelectionConfirm(count, counterSelectionData)}
              onCancel={() => { setCounterSelectionData(null); setAbilityMode(null); }}
          />
      )}

      {secretInformantData && (
          <SecretInformantModal
              isOpen={!!secretInformantData}
              cards={secretInformantCards}
              onClose={handleInformantClose}
              onMoveToBottom={handleInformantMoveToBottom}
              onViewCard={(card) => setViewingCard({ card })}
              playerColorMap={playerColorMap}
              localPlayerId={localPlayerId}
              imageRefreshVersion={imageRefreshVersion}
          />
      )}

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

      {isListMode ? (
        <div className="relative h-full w-full pt-14 overflow-hidden bg-gray-900">
            {localPlayer && (
                <div 
                    ref={leftPanelRef}
                    className="absolute left-0 top-14 bottom-[2px] z-30 bg-panel-bg shadow-xl flex flex-col border-r border-gray-700 w-fit min-w-0 pl-[2px] py-[2px] pr-0 transition-all duration-100 overflow-hidden"
                    style={{ width: sidePanelWidth }}
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
                        roundWinners={gameState.roundWinners}
                        startingPlayerId={gameState.startingPlayerId}
                        onDeckClick={handleDeckClick}
                        isDeckSelectable={abilityMode?.mode === 'SELECT_DECK'}
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
                        activeFloatingTexts={activeFloatingTexts} 
                     />
                 </div>
            </div>

            <div 
                className="absolute right-0 top-14 bottom-[2px] z-30 bg-panel-bg shadow-xl flex flex-col border-l border-gray-700 min-w-0 pr-[2px] py-[2px] pl-0 transition-all duration-100 overflow-hidden"
                style={{ width: sidePanelWidth }}
            >
                 <div className="flex flex-col h-full w-full gap-[2px]">
                     {gameState.players
                        .filter(p => p.id !== localPlayerId)
                        .map(player => (
                            <div key={player.id} className="w-full flex-1 min-h-0 flex flex-col">
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
                                    roundWinners={gameState.roundWinners}
                                    startingPlayerId={gameState.startingPlayerId}
                                    onDeckClick={handleDeckClick}
                                    isDeckSelectable={abilityMode?.mode === 'SELECT_DECK'}
                                />
                            </div>
                        ))}
                 </div>
            </div>
        </div>
      ) : (
        <>
            {gameState.players.map(player => (
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
                    roundWinners={gameState.roundWinners}
                    startingPlayerId={gameState.startingPlayerId}
                    onDeckClick={handleDeckClick}
                    isDeckSelectable={abilityMode?.mode === 'SELECT_DECK'}
                />
            ))}
            
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
                 <div 
                    ref={boardContainerRef}
                    className="pointer-events-auto h-[80%] aspect-square flex items-center justify-center"
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
                        activeFloatingTexts={activeFloatingTexts}
                     />
                 </div>
            </div>
        </>
      )}

      <JoinGameModal 
        isOpen={isJoinModalOpen}
        onClose={() => setJoinModalOpen(false)}
        onJoin={handleJoinGame}
        games={gamesList}
      />

      {viewingDiscard && viewingDiscardPlayer && (
        <DiscardModal
            key={`${viewingDiscardPlayer.id}-${viewingDiscard.isDeckView ? 'deck' : 'discard'}`} // Unique key forces remount on view change
            isOpen={true}
            onClose={() => setViewingDiscard(null)}
            title={viewingDiscard.pickConfig ? (viewingDiscard.pickConfig.isDeck ? 'Search Deck' : (viewingDiscard.pickConfig.action === 'recover' ? `Recover ${viewingDiscard.pickConfig.filterType || 'Card'}` : 'Resurrect Unit')) : (viewingDiscard.isDeckView ? "Deck" : "Discard Pile")}
            player={viewingDiscardPlayer}
            cards={viewingDiscard.pickConfig?.isDeck || viewingDiscard.isDeckView ? viewingDiscardPlayer.deck || [] : viewingDiscardPlayer.discard || []}
            setDraggedItem={setDraggedItem}
            canInteract={!!viewingDiscard.pickConfig || (!!viewingDiscardPlayer && (viewingDiscardPlayer.id === localPlayerId || !!viewingDiscardPlayer.isDummy))}
            isDeckView={viewingDiscard.pickConfig?.isDeck || viewingDiscard.isDeckView}
            highlightFilter={highlightFilter}
            onCardContextMenu={(e, index) => {
                if (!viewingDiscard.pickConfig && viewingDiscardPlayer) {
                    const type = viewingDiscard.isDeckView ? 'deckCard' : 'discardCard';
                    const list = viewingDiscard.isDeckView ? viewingDiscardPlayer.deck : viewingDiscardPlayer.discard;
                    openContextMenu(e, type, { card: list[index], player: viewingDiscardPlayer, cardIndex: index });
                }
            }}
            onCardClick={(index) => {
                if (viewingDiscard.pickConfig && viewingDiscardPlayer) {
                    const sourceList = (viewingDiscard.pickConfig.isDeck || viewingDiscard.isDeckView) ? viewingDiscardPlayer.deck : viewingDiscardPlayer.discard;
                    const card = sourceList[index];
                    
                    const filterType = viewingDiscard.pickConfig.filterType;
                    let isValid = false;
                    if (filterType === 'Any') isValid = true;
                    else if (filterType === 'Unit') isValid = card.types?.includes('Unit') || false;
                    else if (filterType === 'Device') isValid = card.types?.includes('Device') || false;
                    else if (filterType === 'Optimates') isValid = (card.types?.includes('Optimates') || card.faction === 'Optimates') && card.types?.includes('Unit');

                    if (isValid) {
                        if (viewingDiscard.pickConfig.action === 'recover') {
                            if (viewingDiscard.pickConfig.isDeck) {
                                moveItem({ card, source: 'deck', playerId: viewingDiscardPlayer.id, cardIndex: index }, { target: 'hand', playerId: viewingDiscardPlayer.id });
                            } else {
                                recoverDiscardedCard(viewingDiscardPlayer.id, index);
                            }
                            setViewingDiscard(null);
                        } else if (viewingDiscard.pickConfig.action === 'resurrect') {
                            if (abilityMode?.mode === 'IMMUNIS_RETRIEVE') {
                                setAbilityMode(prev => prev ? ({
                                    ...prev,
                                    payload: { ...prev.payload, selectedCardIndex: index }
                                }) : null);
                                setViewingDiscard(null);
                            }
                        }
                    }
                }
            }}
            playerColorMap={playerColorMap}
            localPlayerId={localPlayerId}
            imageRefreshVersion={imageRefreshVersion}
        />
      )}

      <TokensModal 
        isOpen={isTokensModalOpen}
        onClose={() => { setTokensModalOpen(false); setTokensModalAnchor(null); }}
        setDraggedItem={setDraggedItem}
        openContextMenu={openContextMenu}
        canInteract={!!localPlayer}
        anchorEl={tokensModalAnchor}
        imageRefreshVersion={imageRefreshVersion}
        draggedItem={draggedItem}
      />

      <CountersModal
        isOpen={isCountersModalOpen}
        onClose={() => { setCountersModalOpen(false); setCountersModalAnchor(null); }}
        setDraggedItem={setDraggedItem}
        canInteract={!!localPlayer}
        anchorEl={countersModalAnchor}
        imageRefreshVersion={imageRefreshVersion}
        onCounterMouseDown={handleCounterMouseDown}
        cursorStack={cursorStack}
      />
      
      {/* Follower for Cursor Stack Only - ABSOLUTELY NO TEXT LABELS HERE */}
      <div 
          ref={cursorFollowerRef}
          className={`fixed pointer-events-none z-[1000] flex items-center justify-center transition-opacity duration-200 ${cursorStack ? 'opacity-100' : 'opacity-0 hidden'}`}
          style={{ top: 0, left: 0 }}
      >
          {cursorStack && (
              <div className="relative">
                  <div 
                      className={`w-12 h-12 rounded-full shadow-lg flex items-center justify-center ${cursorStack.type.startsWith('Power') ? 'bg-gray-800 border-2 border-white' : ''}`}
                      style={!cursorStack.type.startsWith('Power') ? {
                          backgroundImage: `url(${COUNTER_BG_URL})`,
                          backgroundSize: 'contain',
                          backgroundRepeat: 'no-repeat'
                      } : {}}
                  >
                      {STATUS_ICONS[cursorStack.type] ? (
                          <img src={STATUS_ICONS[cursorStack.type]} className="w-full h-full object-contain p-2" />
                      ) : (
                          <div className="w-full h-full flex items-center justify-center font-bold text-white text-lg drop-shadow-md">
                              {cursorStack.type[0]}
                          </div>
                      )}
                  </div>
                  <span className="absolute -top-1 -right-1 bg-red-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center border border-white z-10">
                      {cursorStack.count}
                  </span>
              </div>
          )}
      </div>

      {isTeamAssignOpen && (
          <TeamAssignmentModal
              players={gameState.players}
              gameMode={gameState.gameMode}
              onCancel={() => setTeamAssignOpen(false)}
              onConfirm={handleTeamAssignment}
          />
      )}

      {gameState.isReadyCheckActive && (
          <ReadyCheckModal
              players={gameState.players}
              localPlayer={localPlayer!}
              onReady={playerReady}
              onCancel={cancelReadyCheck}
          />
      )}

      {/* Reveal Requests */}
      {gameState.revealRequests
          .filter(req => req.toPlayerId === localPlayerId)
          .map((req, index) => {
              const fromPlayer = gameState.players.find(p => p.id === req.fromPlayerId);
              if (!fromPlayer) return null;
              return (
                  <RevealRequestModal
                      key={index}
                      fromPlayer={fromPlayer}
                      cardCount={req.cardIdentifiers.length}
                      onAccept={() => respondToRevealRequest(req.fromPlayerId, true)}
                      onDecline={() => respondToRevealRequest(req.fromPlayerId, false)}
                  />
              );
          })}
    </div>
  );
}