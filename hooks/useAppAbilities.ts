import { useState, useCallback } from 'react';
import { Card, GameState, AbilityAction, CommandContext, DragItem, Player, CounterSelectionData } from '../types';
import { DeckType } from '../types';
import { getCardAbilityAction, canActivateAbility, isLine, isAdjacent } from '../utils/autoAbilities';
import { checkActionHasTargets } from '../utils/targeting';

interface UseAppAbilitiesProps {
    gameState: GameState;
    localPlayerId: number | null;
    abilityMode: AbilityAction | null;
    setAbilityMode: React.Dispatch<React.SetStateAction<AbilityAction | null>>;
    cursorStack: any;
    setCursorStack: React.Dispatch<React.SetStateAction<any>>;
    commandContext: CommandContext;
    setCommandContext: React.Dispatch<React.SetStateAction<CommandContext>>;
    setViewingDiscard: React.Dispatch<React.SetStateAction<any>>;
    setNoTargetOverlay: React.Dispatch<React.SetStateAction<{ row: number, col: number } | null>>;
    setPlayMode: React.Dispatch<React.SetStateAction<any>>;
    setCounterSelectionData: React.Dispatch<React.SetStateAction<CounterSelectionData | null>>;
    interactionLock: React.MutableRefObject<boolean>;
    
    // Actions from useGameState
    moveItem: (item: DragItem, target: any) => void;
    drawCard: (playerId: number) => void;
    updatePlayerScore: (playerId: number, delta: number) => void;
    markAbilityUsed: (coords: { row: number, col: number }, isDeploy?: boolean) => void;
    applyGlobalEffect: (source: any, targets: any[], type: string, pid: number, isDeploy: boolean) => void;
    swapCards: (c1: any, c2: any) => void;
    transferStatus: (from: any, to: any, type: string) => void;
    transferAllCounters: (from: any, to: any) => void;
    resurrectDiscardedCard: (pid: number, idx: number, coords: any) => void;
    spawnToken: (coords: any, name: string, ownerId: number) => void;
    scoreLine: (r1: number, c1: number, r2: number, c2: number, pid: number) => void;
    nextPhase: () => void;
    modifyBoardCardPower: (coords: any, delta: number) => void;
    addBoardCardStatus: (coords: any, status: string, pid: number) => void;
    removeBoardCardStatus: (coords: any, status: string) => void;
    removeBoardCardStatusByOwner: (coords: any, status: string, pid: number) => void;
}

export const useAppAbilities = ({
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
}: UseAppAbilitiesProps) => {

    const activateAbility = useCallback((card: Card, boardCoords: { row: number, col: number }) => {
        if (abilityMode || cursorStack) return;
        if (!gameState.isGameStarted || localPlayerId === null) return;

        const owner = gameState.players.find(p => p.id === card.ownerId);
        const canControl = localPlayerId === card.ownerId || (owner?.isDummy);

        if (gameState.activeTurnPlayerId !== card.ownerId) return;
        if (!canControl) return;

        if (!canActivateAbility(card, gameState.currentPhase, gameState.activeTurnPlayerId!)) return;

        const action = getCardAbilityAction(card, gameState, card.ownerId!, boardCoords);
        if (action) {
            if (action.type === 'GLOBAL_AUTO_APPLY' && action.payload && !action.payload.cleanupCommand) {
                const { tokenType, filter } = action.payload;
                const targets: { row: number, col: number }[] = [];
                const gridSize = gameState.board.length;

                for (let r = 0; r < gridSize; r++) {
                    for (let c = 0; c < gridSize; c++) {
                        const targetCard = gameState.board[r][c].card;
                        if (targetCard && filter(targetCard)) {
                            targets.push({ row: r, col: c });
                        }
                    }
                }

                if (targets.length > 0) {
                    applyGlobalEffect(boardCoords, targets, tokenType, card.ownerId!, !!action.isDeployAbility);
                } else {
                    setNoTargetOverlay(boardCoords);
                    markAbilityUsed(boardCoords, !!action.isDeployAbility);
                    setTimeout(() => setNoTargetOverlay(null), 750);
                }
                return;
            }

            if (action.type === 'CREATE_STACK' && action.tokenType && action.count) {
                const hasTargets = checkActionHasTargets(action, gameState, card.ownerId!, commandContext);
                
                if (!hasTargets) {
                    setNoTargetOverlay(boardCoords);
                    markAbilityUsed(boardCoords, !!action.isDeployAbility);
                    setTimeout(() => setNoTargetOverlay(null), 750);
                    return;
                }

                setCursorStack({
                    type: action.tokenType,
                    count: action.count,
                    isDragging: false,
                    sourceCoords: boardCoords,
                    excludeOwnerId: action.excludeOwnerId,
                    onlyOpponents: action.onlyOpponents,
                    onlyFaceDown: action.onlyFaceDown,
                    isDeployAbility: action.isDeployAbility,
                    requiredTargetStatus: action.requiredTargetStatus,
                    mustBeAdjacentToSource: action.mustBeAdjacentToSource,
                    mustBeInLineWithSource: action.mustBeInLineWithSource,
                    placeAllAtOnce: action.placeAllAtOnce
                });
            } else if (action.type === 'ENTER_MODE') {
                const hasTargets = checkActionHasTargets(action, gameState, card.ownerId!, commandContext);
                if (!hasTargets) {
                    if (boardCoords.row >= 0) {
                        setNoTargetOverlay(boardCoords);
                        markAbilityUsed(boardCoords, action.isDeployAbility);
                        setTimeout(() => setNoTargetOverlay(null), 750);
                    }
                    return;
                }
                setAbilityMode(action);
            } else if (action.type === 'OPEN_MODAL') {
                if (action.mode === 'RETRIEVE_DEVICE') {
                    const player = gameState.players.find(p => p.id === card.ownerId);
                    if (player) {
                        const hasDevices = player.discard.some(c => c.types?.includes('Device'));
                        if (hasDevices) {
                            setViewingDiscard({
                                player,
                                pickConfig: { filterType: 'Device', action: 'recover' }
                            });
                            if (boardCoords.row >= 0) markAbilityUsed(boardCoords, action.isDeployAbility);
                        } else {
                            if (boardCoords.row >= 0) {
                                setNoTargetOverlay(boardCoords);
                                markAbilityUsed(boardCoords, action.isDeployAbility);
                                setTimeout(() => setNoTargetOverlay(null), 750);
                            }
                        }
                    }
                }
                if (action.mode === 'IMMUNIS_RETRIEVE') {
                    const player = gameState.players.find(p => p.id === card.ownerId);
                    if (player) {
                        const hasOptimates = player.discard.some(c =>
                            (c.types?.includes('Optimates') || c.faction === 'Optimates') &&
                            c.types?.includes('Unit')
                        );
                        if (hasOptimates) {
                            setViewingDiscard({
                                player,
                                pickConfig: { filterType: 'Optimates', action: 'resurrect' }
                            });
                            setAbilityMode({
                                type: 'ENTER_MODE',
                                mode: 'IMMUNIS_RETRIEVE',
                                sourceCard: card,
                                sourceCoords: boardCoords,
                                isDeployAbility: action.isDeployAbility,
                                payload: action.payload
                            });
                        } else {
                            if (boardCoords.row >= 0) {
                                setNoTargetOverlay(boardCoords);
                                markAbilityUsed(boardCoords, action.isDeployAbility);
                                setTimeout(() => setNoTargetOverlay(null), 750);
                            }
                        }
                    }
                }
            }
        }
    }, [abilityMode, cursorStack, gameState, localPlayerId, commandContext, markAbilityUsed, setAbilityMode, setCursorStack, setNoTargetOverlay, applyGlobalEffect, setViewingDiscard]);

    const handleLineSelection = useCallback((coords: { row: number, col: number }) => {
        if (!abilityMode) return;
        const { mode, sourceCard, sourceCoords, payload, isDeployAbility } = abilityMode;

        if (mode === 'SCORE_LAST_PLAYED_LINE' && abilityMode.sourceCoords) {
            const { row: r1, col: c1 } = abilityMode.sourceCoords;
            const { row: r2, col: c2 } = coords;
            if (r1 !== r2 && c1 !== c2) return;

            scoreLine(r1, c1, r2, c2, gameState.activeTurnPlayerId!);
            nextPhase();
            setAbilityMode(null);
            return;
        }

        if (mode === 'SELECT_LINE_START') {
            setAbilityMode({
                type: 'ENTER_MODE',
                mode: 'SELECT_LINE_END',
                sourceCard,
                sourceCoords,
                isDeployAbility,
                payload: { ...payload, firstCoords: coords }
            });
            return;
        }
        if (mode === 'SELECT_LINE_END' && payload?.firstCoords) {
            const { row: r1, col: c1 } = payload.firstCoords;
            const { row: r2, col: c2 } = coords;
            if (r1 !== r2 && c1 !== c2) return;
            const actionType = payload.actionType;
            const actorId = sourceCard ? sourceCard.ownerId : (localPlayerId || gameState.activeTurnPlayerId);

            if (actionType === 'CENTURION_BUFF' && sourceCard && sourceCoords && actorId) {
                const gridSize = gameState.board.length;
                let startR = 0, endR = gridSize - 1;
                let startC = 0, endC = gridSize - 1;
                if (r1 === r2) { startR = endR = r1; } else { startC = endC = c1; }
                for (let r = startR; r <= endR; r++) {
                    for (let c = startC; c <= endC; c++) {
                        const targetCard = gameState.board[r][c].card;
                        if (targetCard) {
                            const isSelf = targetCard.id === sourceCard.id;
                            const isOwner = targetCard.ownerId === actorId;
                            const activePlayer = gameState.players.find(p => p.id === actorId);
                            const targetPlayer = gameState.players.find(p => p.id === targetCard.ownerId);
                            const isTeammate = activePlayer?.teamId !== undefined && targetPlayer?.teamId !== undefined && activePlayer.teamId === targetPlayer.teamId;
                            if (!isSelf && (isOwner || isTeammate)) {
                                modifyBoardCardPower({ row: r, col: c }, 1);
                            }
                        }
                    }
                }
                markAbilityUsed(sourceCoords, isDeployAbility);
            }
            else if (actionType === 'SCORE_LINE' || !actionType) {
                scoreLine(r1, c1, r2, c2, actorId!);
                if (sourceCard) {
                    moveItem({ card: sourceCard, source: 'announced', playerId: actorId! }, { target: 'discard', playerId: actorId! });
                }
                if (gameState.isScoringStep) {
                    nextPhase();
                }
            }
            setTimeout(() => setAbilityMode(null), 100);
        }
    }, [abilityMode, gameState, localPlayerId, scoreLine, nextPhase, setAbilityMode, modifyBoardCardPower, markAbilityUsed, moveItem]);

    const handleBoardCardClick = useCallback((card: Card, boardCoords: { row: number, col: number }) => {
        if (setPlayMode && cursorStack) return; 
        if (interactionLock.current) return;

        if (abilityMode && (abilityMode.mode === 'SCORE_LAST_PLAYED_LINE' || abilityMode.mode === 'SELECT_LINE_END')) {
            handleLineSelection(boardCoords);
            return;
        }

        if (abilityMode && abilityMode.type === 'ENTER_MODE') {
            if (abilityMode.sourceCard && abilityMode.sourceCard.id === card.id && abilityMode.mode !== 'SELECT_LINE_START' && abilityMode.mode !== 'INTEGRATOR_LINE_SELECT' && abilityMode.mode !== 'SELECT_UNIT_FOR_MOVE' && abilityMode.mode !== 'SELECT_TARGET') return;
            const { mode, payload, sourceCard, sourceCoords, isDeployAbility } = abilityMode;
            if (mode === 'SELECT_LINE_START' || mode === 'SELECT_LINE_END') { handleLineSelection(boardCoords); return; }

            const actorId = sourceCard ? sourceCard.ownerId : (localPlayerId || gameState.activeTurnPlayerId);

            if (mode === 'SELECT_TARGET' && payload.actionType === 'OPEN_COUNTER_MODAL') {
                if (payload.filter && !payload.filter(card)) return;
                
                // Inspiration Logic: Open Modal
                setCounterSelectionData({
                    card: card,
                    callbackAction: payload.rewardType // 'DRAW_REMOVED' or 'SCORE_REMOVED'
                });
                
                setAbilityMode(null); // Exit target mode
                return;
            }

            if (mode === 'SELECT_TARGET' && payload.actionType === 'DESTROY') {
                if (payload.filter && !payload.filter(card, boardCoords.row, boardCoords.col)) return;
                const hasShield = card.statuses?.some(s => s.type === 'Shield');
                if (hasShield) { removeBoardCardStatus(boardCoords, 'Shield'); }
                else { moveItem({ card, source: 'board', boardCoords, bypassOwnershipCheck: true }, { target: 'discard', playerId: card.ownerId }); }
                if (sourceCoords && sourceCoords.row >= 0) markAbilityUsed(sourceCoords, isDeployAbility);
                setTimeout(() => setAbilityMode(null), 100);
                return;
            }
            
            if (mode === 'SELECT_TARGET' && payload.actionType === 'DRAW_EQUAL_POWER') {
                if (payload.filter && !payload.filter(card)) return;
                const count = Math.max(0, card.power + (card.powerModifier || 0));
                for (let i = 0; i < count; i++) drawCard(actorId!);
                setTimeout(() => setAbilityMode(null), 100);
                return;
            }
            if (mode === 'SELECT_TARGET' && payload.actionType === 'SCORE_EQUAL_POWER') {
                if (payload.filter && !payload.filter(card)) return;
                const points = Math.max(0, card.power + (card.powerModifier || 0));
                updatePlayerScore(actorId!, points);
                setTimeout(() => setAbilityMode(null), 100);
                return;
            }
            
            if (mode === 'SELECT_TARGET' && payload.tokenType) {
                if (payload.filter && !payload.filter(card, boardCoords.row, boardCoords.col)) return;
                moveItem({
                    card: { id: 'dummy', deck: 'counter', name: '', imageUrl: '', fallbackImage: '', power: 0, ability: '', types: [] },
                    source: 'counter_panel',
                    statusType: payload.tokenType,
                    count: payload.count || 1
                }, { target: 'board', boardCoords });
                
                if (sourceCoords && sourceCoords.row >= 0) markAbilityUsed(sourceCoords, isDeployAbility);
                setTimeout(() => setAbilityMode(null), 100);
                return;
            }

            if (mode === 'RIOT_PUSH' && sourceCoords && sourceCoords.row >= 0) {
                const isAdj = Math.abs(boardCoords.row - sourceCoords.row) + Math.abs(boardCoords.col - sourceCoords.col) === 1;
                const targetPlayer = gameState.players.find(p => p.id === card.ownerId);
                const actorPlayer = gameState.players.find(p => p.id === actorId);
                const isTeammate = targetPlayer?.teamId !== undefined && actorPlayer?.teamId !== undefined && targetPlayer.teamId === actorPlayer.teamId;

                if (!isAdj || card.ownerId === actorId || isTeammate) return;

                const dRow = boardCoords.row - sourceCoords.row;
                const dCol = boardCoords.col - sourceCoords.col;
                const targetRow = boardCoords.row + dRow;
                const targetCol = boardCoords.col + dCol;
                const gridSize = gameState.board.length;
                if (targetRow < 0 || targetRow >= gridSize || targetCol < 0 || targetCol >= gridSize) return;
                if (gameState.board[targetRow][targetCol].card !== null) return;
                moveItem({ card, source: 'board', boardCoords, bypassOwnershipCheck: true }, { target: 'board', boardCoords: { row: targetRow, col: targetCol } });
                setAbilityMode({ type: 'ENTER_MODE', mode: 'RIOT_MOVE', sourceCard: abilityMode.sourceCard, sourceCoords: abilityMode.sourceCoords, isDeployAbility: isDeployAbility, payload: { vacatedCoords: boardCoords } });
                return;
            }
            if (mode === 'RIOT_MOVE' && sourceCoords && sourceCoords.row >= 0) {
                if (boardCoords.row === sourceCoords.row && boardCoords.col === sourceCoords.col) {
                    markAbilityUsed(sourceCoords, isDeployAbility);
                    setTimeout(() => setAbilityMode(null), 100);
                }
                return;
            }
            if (mode === 'SWAP_POSITIONS' && sourceCoords && sourceCoords.row >= 0) {
                if (sourceCard && sourceCard.id === card.id) return;
                if (payload.filter && !payload.filter(card, boardCoords.row, boardCoords.col)) return;
                swapCards(sourceCoords, boardCoords);
                markAbilityUsed(boardCoords, isDeployAbility);
                setTimeout(() => setAbilityMode(null), 100);
                return;
            }
            if (mode === 'TRANSFER_STATUS_SELECT' && sourceCoords && sourceCoords.row >= 0) {
                if (sourceCard && sourceCard.id === card.id) return;
                if (payload.filter && !payload.filter(card, boardCoords.row, boardCoords.col)) return;
                if (card.statuses && card.statuses.length > 0) {
                    transferStatus(boardCoords, sourceCoords, card.statuses[0].type);
                    markAbilityUsed(sourceCoords, isDeployAbility);
                    setTimeout(() => setAbilityMode(null), 100);
                }
                return;
            }
            if (mode === 'TRANSFER_ALL_STATUSES' && sourceCoords && sourceCoords.row >= 0) {
                if (sourceCard && sourceCard.id === card.id) return;
                if (payload.filter && !payload.filter(card, boardCoords.row, boardCoords.col)) return;
                transferAllCounters(boardCoords, sourceCoords);
                markAbilityUsed(sourceCoords, isDeployAbility);
                setTimeout(() => setAbilityMode(null), 100);
                return;
            }
            if (mode === 'REVEAL_ENEMY') {
                if (sourceCard && sourceCard.id === card.id) return;
                if (payload.filter && !payload.filter(card, boardCoords.row, boardCoords.col)) return;
                setCursorStack({ type: 'Revealed', count: 1, isDragging: false, sourceCoords: sourceCoords, targetOwnerId: card.ownerId, onlyFaceDown: true, onlyOpponents: true, isDeployAbility: isDeployAbility });
                setTimeout(() => setAbilityMode(null), 100);
                return;
            }
            if (mode === 'CENSOR_SWAP' && sourceCoords && sourceCoords.row >= 0) {
                if (payload.filter && !payload.filter(card)) return;
                removeBoardCardStatusByOwner(boardCoords, 'Exploit', actorId!);
                addBoardCardStatus(boardCoords, 'Stun', actorId!);
                markAbilityUsed(sourceCoords, isDeployAbility);
                setTimeout(() => setAbilityMode(null), 100);
                return;
            }
            if (mode === 'ZEALOUS_WEAKEN' && sourceCoords && sourceCoords.row >= 0) {
                if (payload.filter && !payload.filter(card)) return;
                modifyBoardCardPower(boardCoords, -1);
                markAbilityUsed(sourceCoords, isDeployAbility);
                setTimeout(() => setAbilityMode(null), 100);
                return;
            }
            if (mode === 'CENTURION_BUFF' && sourceCoords && sourceCoords.row >= 0) {
                markAbilityUsed(sourceCoords, isDeployAbility);
                setTimeout(() => setAbilityMode(null), 100);
                return;
            }
            if (mode === 'SELECT_UNIT_FOR_MOVE' && sourceCoords && sourceCoords.row >= 0) {
                if (payload.filter && !payload.filter(card)) return;
                setAbilityMode({
                    type: 'ENTER_MODE',
                    mode: 'SELECT_CELL',
                    sourceCard: card,
                    sourceCoords: boardCoords,
                    isDeployAbility: isDeployAbility,
                    recordContext: abilityMode.recordContext,
                    payload: { allowSelf: false, abilitySourceCoords: sourceCoords, range: payload.range, chainedAction: payload.chainedAction }
                });
                return;
            }
            if (mode === 'SELECT_UNIT_FOR_MOVE' && !sourceCoords) {
                if (payload.filter && !payload.filter(card)) return;
                setAbilityMode({
                    type: 'ENTER_MODE',
                    mode: 'SELECT_CELL',
                    sourceCard: card,
                    sourceCoords: boardCoords,
                    recordContext: abilityMode.recordContext,
                    payload: { allowSelf: false, range: payload.range, chainedAction: payload.chainedAction }
                });
                return;
            }
            if (mode === 'INTEGRATOR_LINE_SELECT' && sourceCoords && sourceCoords.row >= 0) {
                if (boardCoords.row !== sourceCoords.row && boardCoords.col !== sourceCoords.col) return;

                const gridSize = gameState.board.length;
                let exploits = 0;
                if (boardCoords.row === sourceCoords.row) {
                    for (let c = 0; c < gridSize; c++) {
                        const cell = gameState.board[boardCoords.row][c];
                        if (cell.card) {
                            exploits += cell.card.statuses?.filter(s => s.type === 'Exploit' && s.addedByPlayerId === actorId).length || 0;
                        }
                    }
                } else {
                    for (let r = 0; r < gridSize; r++) {
                        const cell = gameState.board[r][boardCoords.col];
                        if (cell.card) {
                            exploits += cell.card.statuses?.filter(s => s.type === 'Exploit' && s.addedByPlayerId === actorId).length || 0;
                        }
                    }
                }

                if (exploits > 0) updatePlayerScore(actorId!, exploits);
                markAbilityUsed(sourceCoords, isDeployAbility);
                setTimeout(() => setAbilityMode(null), 100);
                return;
            }
            return;
        }
        if (!abilityMode && !cursorStack) {
            activateAbility(card, boardCoords);
        }
    }, [abilityMode, cursorStack, gameState, localPlayerId, interactionLock, handleLineSelection, moveItem, markAbilityUsed, setAbilityMode, setCursorStack, removeBoardCardStatus, removeBoardCardStatusByOwner, addBoardCardStatus, modifyBoardCardPower, swapCards, transferStatus, transferAllCounters, updatePlayerScore, drawCard, activateAbility, setCounterSelectionData]);

    const handleEmptyCellClick = useCallback((boardCoords: { row: number, col: number }) => {
        if (interactionLock.current) return;
        if (!abilityMode || abilityMode.type !== 'ENTER_MODE') return;
        const { mode, sourceCoords, sourceCard, payload, isDeployAbility } = abilityMode;

        if (mode === 'SCORE_LAST_PLAYED_LINE' || mode === 'SELECT_LINE_END') {
            handleLineSelection(boardCoords);
            return;
        }

        if (mode === 'SELECT_LINE_START') { handleLineSelection(boardCoords); return; }

        const actorId = sourceCard ? sourceCard.ownerId : (localPlayerId || gameState.activeTurnPlayerId);

        if (mode === 'PATROL_MOVE' && sourceCoords && sourceCard && sourceCoords.row >= 0) {
            const isRow = boardCoords.row === sourceCoords.row;
            const isCol = boardCoords.col === sourceCoords.col;
            if (boardCoords.row === sourceCoords.row && boardCoords.col === sourceCoords.col) { setTimeout(() => setAbilityMode(null), 100); return; }
            if (isRow || isCol) {
                moveItem({ card: sourceCard, source: 'board', boardCoords: sourceCoords }, { target: 'board', boardCoords });
                markAbilityUsed(boardCoords, isDeployAbility);
                setTimeout(() => setAbilityMode(null), 100);
            }
            return;
        }
        if (mode === 'RIOT_MOVE' && sourceCoords && sourceCard && payload.vacatedCoords) {
            if (boardCoords.row === payload.vacatedCoords.row && boardCoords.col === payload.vacatedCoords.col) {
                moveItem({ card: sourceCard, source: 'board', boardCoords: sourceCoords }, { target: 'board', boardCoords });
                markAbilityUsed(boardCoords, isDeployAbility);
                setTimeout(() => setAbilityMode(null), 100);
            }
            return;
        }
        if (mode === 'SPAWN_TOKEN' && sourceCoords && payload.tokenName && sourceCoords.row >= 0) {
            const isAdj = Math.abs(boardCoords.row - sourceCoords.row) + Math.abs(boardCoords.col - sourceCoords.col) === 1;
            if (isAdj) {
                spawnToken(boardCoords, payload.tokenName, actorId!);
                markAbilityUsed(sourceCoords, isDeployAbility);
                setTimeout(() => setAbilityMode(null), 100);
            }
            return;
        }
        if (mode === 'SELECT_CELL' && sourceCard) {
            const currentCardCoords = (() => {
                for (let r = 0; r < gameState.board.length; r++) {
                    for (let c = 0; c < gameState.board.length; c++) {
                        if (gameState.board[r][c].card?.id === sourceCard.id) return { row: r, col: c };
                    }
                }
                return null;
            })();

            let isValidMove = false;
            if (currentCardCoords) {
                if (payload.range === 'line') {
                    isValidMove = (boardCoords.row === currentCardCoords.row || boardCoords.col === currentCardCoords.col);
                } else if (payload.range === 'global') {
                    isValidMove = true;
                } else if (payload.range === 2) {
                    const dist = Math.abs(boardCoords.row - currentCardCoords.row) + Math.abs(boardCoords.col - currentCardCoords.col);
                    if (dist === 1) isValidMove = true;
                    else if (dist === 2) {
                        const r1 = currentCardCoords.row, c1 = currentCardCoords.col;
                        const r2 = boardCoords.row, c2 = boardCoords.col;
                        const inters = [
                            { r: r2, c: c1 },
                            { r: r1, c: c2 },
                            { r: (r1 + r2) / 2, c: (c1 + c2) / 2 }
                        ];
                        isValidMove = inters.some(i => {
                            if (!Number.isInteger(i.r) || !Number.isInteger(i.c)) return false;
                            if (Math.abs(i.r - r1) + Math.abs(i.c - c1) !== 1) return false;
                            return !gameState.board[i.r][i.c].card;
                        });
                    }
                } else {
                    isValidMove = Math.abs(boardCoords.row - currentCardCoords.row) + Math.abs(boardCoords.col - currentCardCoords.col) === 1;
                }
            }

            if (isValidMove) {
                // Capture power BEFORE move for rewards (since moveItem updates state)
                const cardPower = Math.max(0, sourceCard.power + (sourceCard.powerModifier || 0));

                if (payload.allowSelf && currentCardCoords && boardCoords.row === currentCardCoords.row && boardCoords.col === currentCardCoords.col) { }
                else if (currentCardCoords) {
                    moveItem({ card: sourceCard, source: 'board', boardCoords: currentCardCoords, bypassOwnershipCheck: true }, { target: 'board', boardCoords });
                }

                if (abilityMode.recordContext) {
                    setCommandContext({ lastMovedCardCoords: boardCoords, lastMovedCardId: sourceCard.id });
                }

                if (payload.chainedAction) {
                    // Execute chained action (e.g. False Orders Reveal/Stun or Tactical Maneuver Reward)
                    const nextAction = { ...payload.chainedAction };
                    // If targetOwnerId is -2 (Target Moved Card Owner), resolve it now
                    if (nextAction.targetOwnerId === -2) {
                        nextAction.targetOwnerId = sourceCard.ownerId; // The moved card's owner
                    }
                    
                    if (nextAction.type === 'CREATE_STACK') {
                        setCursorStack({
                            ...nextAction,
                            isDragging: false,
                            sourceCoords: boardCoords
                        });
                        setAbilityMode(null);
                    } else if (nextAction.type === 'GLOBAL_AUTO_APPLY') {
                        const reward = nextAction.payload.contextReward;
                        if (reward === 'STUN_MOVED_UNIT') {
                            addBoardCardStatus(boardCoords, 'Stun', actorId!);
                        } else if (reward === 'DRAW_MOVED_POWER') {
                            for(let i=0; i<cardPower; i++) drawCard(actorId!);
                        } else if (reward === 'SCORE_MOVED_POWER') {
                            updatePlayerScore(actorId!, cardPower);
                        }
                        setAbilityMode(null);
                    }
                } else {
                    if (payload.abilitySourceCoords) {
                        markAbilityUsed(payload.abilitySourceCoords, isDeployAbility);
                    } else if (sourceCoords && sourceCoords.row >= 0) {
                        markAbilityUsed(boardCoords, isDeployAbility);
                    }
                    setTimeout(() => setAbilityMode(null), 100);
                }
                return;
            }
            return;
        }
        if (mode === 'IMMUNIS_RETRIEVE' && sourceCoords && sourceCoords.row >= 0) {
            if (payload.selectedCardIndex !== undefined && payload.filter && payload.filter(boardCoords.row, boardCoords.col)) {
                resurrectDiscardedCard(actorId!, payload.selectedCardIndex, boardCoords);
                markAbilityUsed(sourceCoords, isDeployAbility);
                setTimeout(() => setAbilityMode(null), 100);
                return;
            }
            if (payload.selectedCardIndex === undefined) { return; }
        }
        if (mode === 'INTEGRATOR_LINE_SELECT' && sourceCoords && sourceCoords.row >= 0) {
            if (boardCoords.row !== sourceCoords.row && boardCoords.col !== sourceCoords.col) return;

            const gridSize = gameState.board.length;
            let exploits = 0;
            if (boardCoords.row === sourceCoords.row) {
                for (let c = 0; c < gridSize; c++) {
                    const cell = gameState.board[boardCoords.row][c];
                    if (cell.card) {
                        exploits += cell.card.statuses?.filter(s => s.type === 'Exploit' && s.addedByPlayerId === actorId).length || 0;
                    }
                }
            } else {
                for (let r = 0; r < gridSize; r++) {
                    const cell = gameState.board[r][boardCoords.col];
                    if (cell.card) {
                        exploits += cell.card.statuses?.filter(s => s.type === 'Exploit' && s.addedByPlayerId === actorId).length || 0;
                    }
                }
            }

            if (exploits > 0) updatePlayerScore(actorId!, exploits);
            markAbilityUsed(sourceCoords, isDeployAbility);
            setTimeout(() => setAbilityMode(null), 100);
            return;
        }
    }, [interactionLock, abilityMode, gameState, localPlayerId, handleLineSelection, moveItem, markAbilityUsed, setAbilityMode, spawnToken, setCommandContext, resurrectDiscardedCard, updatePlayerScore, addBoardCardStatus, setCursorStack, drawCard]);

    const handleHandCardClick = useCallback((player: Player, card: Card, cardIndex: number) => {
        if (interactionLock.current) return;
        if (abilityMode && abilityMode.type === 'ENTER_MODE' && abilityMode.mode === 'SELECT_TARGET') {
            const { payload, sourceCoords, isDeployAbility, sourceCard } = abilityMode;
            if (payload.actionType === 'DESTROY') {
                if (payload.filter && !payload.filter(card)) return;
                moveItem({ card, source: 'hand', playerId: player.id, cardIndex, bypassOwnershipCheck: true }, { target: 'discard', playerId: player.id });
                if (sourceCoords && sourceCoords.row >= 0) markAbilityUsed(sourceCoords, isDeployAbility);
                setTimeout(() => setAbilityMode(null), 100);
            }
        }
    }, [interactionLock, abilityMode, moveItem, markAbilityUsed, setAbilityMode]);

    const handleAnnouncedCardDoubleClick = useCallback((player: Player, card: Card) => {
        // Double-click on announced card now handled by useAppCommand's playCommandCard logic invoked from App.tsx
        if (abilityMode || cursorStack) return;
        if (interactionLock.current) return;

        if (!gameState.isGameStarted) return;
        if (gameState.activeTurnPlayerId !== player.id) return;
        if (!canActivateAbility(card, gameState.currentPhase, gameState.activeTurnPlayerId)) return;
        activateAbility(card, { row: -1, col: -1 });
    }, [abilityMode, cursorStack, interactionLock, gameState, activateAbility]);

    return {
        activateAbility,
        handleLineSelection,
        handleBoardCardClick,
        handleEmptyCellClick,
        handleHandCardClick,
        handleAnnouncedCardDoubleClick
    };
};