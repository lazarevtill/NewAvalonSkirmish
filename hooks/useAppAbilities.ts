import { useState, useCallback, useEffect } from 'react';
import { Card, GameState, AbilityAction, CommandContext, DragItem, Player, CounterSelectionData, CursorStackState } from '../types';
import { getCardAbilityAction, canActivateAbility } from '../utils/autoAbilities';
import { checkActionHasTargets } from '../utils/targeting';

interface UseAppAbilitiesProps {
    gameState: GameState;
    localPlayerId: number | null;
    abilityMode: AbilityAction | null;
    setAbilityMode: React.Dispatch<React.SetStateAction<AbilityAction | null>>;
    cursorStack: CursorStackState | null;
    setCursorStack: React.Dispatch<React.SetStateAction<CursorStackState | null>>;
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
    resetDeployStatus: (coords: { row: number, col: number }) => void;
    scoreDiagonal: (r1: number, c1: number, r2: number, c2: number, pid: number, bonusType?: 'point_per_support' | 'draw_per_support') => void;
    removeStatusByType: (coords: { row: number, col: number }, type: string) => void;
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
    resetDeployStatus,
    scoreDiagonal,
    removeStatusByType
}: UseAppAbilitiesProps) => {

    const handleActionExecution = useCallback((action: AbilityAction, sourceCoords: { row: number, col: number }) => {
        // 1. Global Auto Apply
        if (action.type === 'GLOBAL_AUTO_APPLY') {
            if (action.payload?.customAction === 'FINN_SCORING') {
                let revealedCount = 0;
                gameState.players.forEach(p => {
                    if (p.id !== action.sourceCard?.ownerId) {
                        p.hand.forEach(c => {
                            if (c.statuses?.some(s => s.type === 'Revealed')) revealedCount++;
                        });
                    }
                });
                if (revealedCount > 0) {
                    updatePlayerScore(action.sourceCard?.ownerId!, revealedCount);
                }
                markAbilityUsed(sourceCoords, !!action.isDeployAbility);
                return;
            }

            // Handle Removing Aim from Context (Temporary Shelter)
            if (action.payload?.customAction === 'REMOVE_ALL_AIM_FROM_CONTEXT') {
                // Priority: Injected sourceCoords (Immediate) > Context (Stored) > Argument sourceCoords (Fallback)
                if (action.sourceCoords && action.sourceCoords.row >= 0) {
                     removeStatusByType(action.sourceCoords, 'Aim');
                } else if (commandContext.lastMovedCardCoords) {
                    removeStatusByType(commandContext.lastMovedCardCoords, 'Aim');
                } else if (sourceCoords && sourceCoords.row >= 0) {
                    // Fallback to sourceCoords if context is stale (immediate chain)
                    removeStatusByType(sourceCoords, 'Aim');
                }
                return;
            }

            if (action.payload && !action.payload.cleanupCommand) {
                const { tokenType, filter } = action.payload;
                const targets: { row: number, col: number }[] = [];
                const gridSize = gameState.board.length;

                // Handle Context Rewards (Tactical Maneuver)
                if (action.payload.contextReward && action.sourceCard) {
                    let amount = 0;
                    
                    // Priority: Passed sourceCoords (immediate from chain) > Context (async/stored)
                    // Note: sourceCoords arg is the destination of the move in chained calls.
                    const coords = (sourceCoords && sourceCoords.row >= 0) ? sourceCoords : commandContext.lastMovedCardCoords;

                    if (coords) {
                        const { row, col } = coords;
                        
                        // Try getting card at new location (might fail if state is stale)
                        let card = gameState.board[row][col].card;
                        
                        // FIX: STALE STATE HANDLING
                        // If board is stale (card not moved yet in this render cycle), looking at destination might yield null.
                        // We use the ID to find where the card *currently* is (which is the OLD position in stale state) 
                        // so we can at least read its Power correctly.
                        
                        // Priority: _tempContextId (injected) > lastMovedCardId (context)
                        const searchId = action.payload._tempContextId || commandContext.lastMovedCardId;

                        if ((!card || (searchId && card.id !== searchId)) && searchId) {
                            for (let r = 0; r < gridSize; r++) {
                                for (let c = 0; c < gridSize; c++) {
                                    if (gameState.board[r][c].card?.id === searchId) {
                                        card = gameState.board[r][c].card;
                                        break;
                                    }
                                }
                                if (card) break;
                            }
                        }

                        if (card) {
                            amount = Math.max(0, card.power + (card.powerModifier || 0) + (card.bonusPower || 0));
                        }
                    }

                    if (amount > 0) {
                        const playerId = action.sourceCard.ownerId!;
                        const rewardType = action.payload.contextReward;
                        if (rewardType === 'DRAW_MOVED_POWER' || rewardType === 'DRAW_EQUAL_POWER') {
                            for(let i=0; i<amount; i++) drawCard(playerId);
                        } else if (rewardType === 'SCORE_MOVED_POWER') {
                            updatePlayerScore(playerId, amount);
                        }
                    }
                    
                    if (action.payload.contextReward === 'STUN_MOVED_UNIT' && coords) {
                        addBoardCardStatus(coords, 'Stun', action.sourceCard.ownerId!);
                    }
                    return;
                }

                if (filter) {
                     // Standard filtering
                    for (let r = 0; r < gridSize; r++) {
                        for (let c = 0; c < gridSize; c++) {
                            const targetCard = gameState.board[r][c].card;
                            if (targetCard && filter(targetCard)) {
                                targets.push({ row: r, col: c });
                            }
                        }
                    }
                } else {
                    // Context / Single Target (No Filter)
                    // Prefer immediate action.sourceCoords if available (chain injected)
                    if (action.sourceCoords && action.sourceCoords.row >= 0) {
                        targets.push(action.sourceCoords);
                    } else if (sourceCoords && sourceCoords.row >= 0) {
                        targets.push(sourceCoords);
                    } else if (commandContext.lastMovedCardCoords) {
                        targets.push(commandContext.lastMovedCardCoords);
                    }
                }

                if (targets.length > 0) {
                    // For Global Apply of Stun/etc., standard applyGlobalEffect uses 1 token
                    if (tokenType) {
                        // Special handling for multiple tokens in Global Apply (e.g. False Orders Stun x2)
                        // applyGlobalEffect is singular. We loop if needed or just call it. 
                        const count = action.payload.count || 1;
                        // Allow payload to override ownerId (for False Orders Mode 2)
                        const addedBy = action.payload.ownerId !== undefined ? action.payload.ownerId : action.sourceCard?.ownerId!;
                        
                        for(let i=0; i<count; i++) {
                             applyGlobalEffect(sourceCoords, targets, tokenType, addedBy, !!action.isDeployAbility);
                        }
                    }
                } else {
                    setNoTargetOverlay(sourceCoords);
                    markAbilityUsed(sourceCoords, !!action.isDeployAbility);
                    setTimeout(() => setNoTargetOverlay(null), 750);
                }
                return;
            }
        }

        // 2. Check Valid Targets (Perform this BEFORE Dynamic calculation to fail fast if needed, but for stacks we check inside)
        const hasTargets = checkActionHasTargets(action, gameState, action.sourceCard?.ownerId || localPlayerId, commandContext);

        if (!hasTargets) { 
            // Rule 4: Show "No Target"
            setNoTargetOverlay(sourceCoords);
            
            // Rule 5: If part of a chain has no targets, execute the rest (chainedAction).
            if (action.chainedAction) {
                setTimeout(() => {
                    setNoTargetOverlay(null);
                    handleActionExecution(action.chainedAction!, sourceCoords);
                }, 500); 
            } else {
                markAbilityUsed(sourceCoords, !!action.isDeployAbility);
                setTimeout(() => setNoTargetOverlay(null), 750);
            }
            return;
        }

        // 3. Execution (Targets Exist)
        if (action.type === 'CREATE_STACK' && action.tokenType) {
            let count = action.count || 0;

            // Handle Dynamic Count (e.g. Count Exploits on board to determine Reveals)
            if (action.dynamicCount) {
                const { factor, ownerId } = action.dynamicCount;
                let dynamic = 0;
                gameState.board.forEach(r => r.forEach(c => {
                     // Count matching tokens, not just cards.
                     if (c.card?.statuses) {
                         const matchingTokens = c.card.statuses.filter(s => s.type === factor && s.addedByPlayerId === ownerId);
                         dynamic += matchingTokens.length;
                     }
                }));
                count = dynamic;
            }

            if (count > 0) {
                setCursorStack({
                    type: action.tokenType,
                    count: count,
                    isDragging: false,
                    sourceCoords: sourceCoords,
                    excludeOwnerId: action.excludeOwnerId,
                    onlyOpponents: action.onlyOpponents,
                    onlyFaceDown: action.onlyFaceDown,
                    targetType: action.targetType, // New prop
                    isDeployAbility: action.isDeployAbility,
                    requiredTargetStatus: action.requiredTargetStatus,
                    requireStatusFromSourceOwner: action.requireStatusFromSourceOwner, // New prop
                    mustBeAdjacentToSource: action.mustBeAdjacentToSource,
                    mustBeInLineWithSource: action.mustBeInLineWithSource,
                    placeAllAtOnce: action.placeAllAtOnce,
                    chainedAction: action.chainedAction,
                    targetOwnerId: action.targetOwnerId,
                    recordContext: action.recordContext // New prop
                });
            } else {
                // If dynamic count resulted in 0, we treat it as "No Targets/No Action"
                setNoTargetOverlay(sourceCoords);
                setTimeout(() => setNoTargetOverlay(null), 750);
                // If there's a chain, we might want to continue, but usually 0 tokens means stop.
                markAbilityUsed(sourceCoords, !!action.isDeployAbility);
            }

        } else if (action.type === 'ENTER_MODE') {
            // Special Immediate Modes (Compound atomic actions)
            if (action.mode === 'SHIELD_SELF_THEN_SPAWN') {
                addBoardCardStatus(sourceCoords, 'Shield', action.sourceCard!.ownerId!);
                setAbilityMode({
                    type: 'ENTER_MODE',
                    mode: 'SPAWN_TOKEN',
                    sourceCard: action.sourceCard,
                    sourceCoords: sourceCoords,
                    isDeployAbility: action.isDeployAbility,
                    payload: action.payload
                });
                return;
            }
            if (action.mode === 'SHIELD_SELF_THEN_RIOT_PUSH') {
                addBoardCardStatus(sourceCoords, 'Shield', action.sourceCard!.ownerId!);
                setAbilityMode({
                    type: 'ENTER_MODE',
                    mode: 'RIOT_PUSH',
                    sourceCard: action.sourceCard,
                    sourceCoords: sourceCoords,
                    isDeployAbility: action.isDeployAbility,
                    payload: action.payload
                });
                return;
            }
            if (action.mode === 'PRINCEPS_SHIELD_THEN_AIM') {
                addBoardCardStatus(sourceCoords, 'Shield', action.sourceCard!.ownerId!);
                setCursorStack({
                    type: 'Aim',
                    count: 1,
                    isDragging: false,
                    sourceCoords: sourceCoords,
                    requiredTargetStatus: 'Threat',
                    isDeployAbility: action.isDeployAbility
                });
                return;
            }
            if (action.mode === 'ABR_DEPLOY_SHIELD_AIM') {
                // 1. Shield Self automatically
                const actorId = action.sourceCard!.ownerId!;
                addBoardCardStatus(sourceCoords, 'Shield', actorId);

                // 2. Define the Aim Stack action
                const aimStackAction: AbilityAction = {
                    type: 'CREATE_STACK',
                    tokenType: 'Aim',
                    count: 1,
                    requiredTargetStatus: 'Threat',
                    requireStatusFromSourceOwner: true, // Only own threat
                    sourceCard: action.sourceCard,
                    sourceCoords: sourceCoords,
                    isDeployAbility: action.isDeployAbility
                };

                // 3. Check Valid Targets -> Stack Mode or No Target
                if (checkActionHasTargets(aimStackAction, gameState, actorId, commandContext)) {
                     setCursorStack({
                         type: 'Aim',
                         count: 1,
                         isDragging: false,
                         sourceCoords: sourceCoords,
                         requiredTargetStatus: 'Threat',
                         requireStatusFromSourceOwner: true, // Pass to cursor state
                         isDeployAbility: action.isDeployAbility
                     });
                } else {
                     setNoTargetOverlay(sourceCoords);
                     markAbilityUsed(sourceCoords, !!action.isDeployAbility);
                     setTimeout(() => setNoTargetOverlay(null), 750);
                }
                return;
            }

            // Standard Mode Entry
            
            let effectiveSourceCard = action.sourceCard;
            let effectiveSourceCoords = sourceCoords;

            // Prioritize action.sourceCoords if explicitly set (e.g. from chained injections in useAppCounters)
            if (action.sourceCoords && action.sourceCoords.row >= 0) {
                effectiveSourceCoords = action.sourceCoords;
            }

            // If this is a SELECT_CELL mode (Move), check if we should use the card from context (False Orders case)
            if (action.mode === 'SELECT_CELL' && commandContext.lastMovedCardCoords && commandContext.lastMovedCardId) {
                 const { row, col } = commandContext.lastMovedCardCoords;
                 const contextCard = gameState.board[row][col].card;
                 if (contextCard) {
                     effectiveSourceCard = contextCard;
                     effectiveSourceCoords = commandContext.lastMovedCardCoords;
                 }
            }

            setAbilityMode({
                ...action,
                sourceCard: effectiveSourceCard,
                sourceCoords: effectiveSourceCoords
            });

        } else if (action.type === 'OPEN_MODAL') {
            // Modal logic (unchanged essentially, but wrapped)
            if (action.mode === 'RETRIEVE_DEVICE') {
                const player = gameState.players.find(p => p.id === action.sourceCard?.ownerId);
                if (player) {
                    setViewingDiscard({
                        player,
                        pickConfig: { filterType: 'Device', action: 'recover' }
                    });
                    if (sourceCoords.row >= 0) markAbilityUsed(sourceCoords, !!action.isDeployAbility);
                }
            } else if (action.mode === 'IMMUNIS_RETRIEVE') {
                const player = gameState.players.find(p => p.id === action.sourceCard?.ownerId);
                if (player) {
                    setViewingDiscard({
                        player,
                        pickConfig: { filterType: 'Optimates', action: 'resurrect' }
                    });
                    setAbilityMode({
                        type: 'ENTER_MODE',
                        mode: 'IMMUNIS_RETRIEVE',
                        sourceCard: action.sourceCard,
                        sourceCoords: sourceCoords,
                        isDeployAbility: action.isDeployAbility,
                        payload: action.payload
                    });
                }
            } else if (action.mode === 'SEARCH_DECK') {
                const player = gameState.players.find(p => p.id === action.sourceCard?.ownerId);
                if (player) {
                    setViewingDiscard({
                        player,
                        pickConfig: { 
                            filterType: action.payload.filterType || 'Unit', 
                            action: 'recover', 
                            isDeck: true 
                        }
                    });
                    if (sourceCoords.row >= 0) markAbilityUsed(sourceCoords, !!action.isDeployAbility);
                }
            }
        }
    }, [gameState, localPlayerId, commandContext, markAbilityUsed, setAbilityMode, setCursorStack, setNoTargetOverlay, applyGlobalEffect, setViewingDiscard, addBoardCardStatus, updatePlayerScore, drawCard, removeBoardCardStatus, removeStatusByType]);

    // Auto-Execute GLOBAL_AUTO_APPLY actions when they appear in abilityMode
    useEffect(() => {
        if (abilityMode && abilityMode.type === 'GLOBAL_AUTO_APPLY') {
            handleActionExecution(abilityMode, abilityMode.sourceCoords || { row: -1, col: -1 });
            setAbilityMode(null);
        }
    }, [abilityMode, handleActionExecution, setAbilityMode]);

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
            handleActionExecution(action, boardCoords);
        }
    }, [abilityMode, cursorStack, gameState, localPlayerId, handleActionExecution]);

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
            
            const actorId = sourceCard?.ownerId ?? (gameState.players.find(p => p.id === gameState.activeTurnPlayerId)?.isDummy ? gameState.activeTurnPlayerId : (localPlayerId || gameState.activeTurnPlayerId));

            if (actionType === 'ZIUS_SCORING') {
                const gridSize = gameState.board.length;
                let startR = 0, endR = gridSize - 1;
                let startC = 0, endC = gridSize - 1;
                
                if (r1 === r2) { startR = endR = r1; } 
                else if (c1 === c2) { startC = endC = c1; }
                else return;

                let exploitCount = 0;
                for (let r = startR; r <= endR; r++) {
                    for (let c = startC; c <= endC; c++) {
                        const cell = gameState.board[r][c];
                        if (cell.card) {
                            exploitCount += cell.card.statuses?.filter(s => s.type === 'Exploit' && s.addedByPlayerId === actorId).length || 0;
                        }
                    }
                }
                
                if (exploitCount > 0) updatePlayerScore(actorId!, exploitCount);
                if (sourceCoords && sourceCoords.row >= 0) markAbilityUsed(sourceCoords, isDeployAbility);
            }
            else if (actionType === 'CENTURION_BUFF' && sourceCard && sourceCoords && actorId) {
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
                if (gameState.isScoringStep) {
                    nextPhase();
                }
            }
            setTimeout(() => setAbilityMode(null), 100);
        }
        if (mode === 'SELECT_DIAGONAL' && payload.actionType === 'SCORE_DIAGONAL') {
            const actorId = sourceCard?.ownerId ?? (gameState.players.find(p => p.id === gameState.activeTurnPlayerId)?.isDummy ? gameState.activeTurnPlayerId : (localPlayerId || gameState.activeTurnPlayerId));
            if (!payload.firstCoords) {
                 setAbilityMode({ ...abilityMode, payload: { ...payload, firstCoords: coords } });
                 return;
            } else {
                const { row: r1, col: c1 } = payload.firstCoords;
                const { row: r2, col: c2 } = coords;
                
                if (Math.abs(r1 - r2) !== Math.abs(c1 - c2)) {
                    setAbilityMode(null);
                    return;
                }
                
                scoreDiagonal(r1, c1, r2, c2, actorId!, payload.bonusType);
                setTimeout(() => setAbilityMode(null), 100);
            }
        }
    }, [abilityMode, gameState, localPlayerId, scoreLine, nextPhase, setAbilityMode, modifyBoardCardPower, markAbilityUsed, moveItem, scoreDiagonal, updatePlayerScore]);

    const handleBoardCardClick = useCallback((card: Card, boardCoords: { row: number, col: number }) => {
        if (setPlayMode && cursorStack) return; 
        if (interactionLock.current) return;

        if (abilityMode && (abilityMode.mode === 'SCORE_LAST_PLAYED_LINE' || abilityMode.mode === 'SELECT_LINE_END' || abilityMode.mode === 'SELECT_DIAGONAL')) {
            handleLineSelection(boardCoords);
            return;
        }

        if (abilityMode && abilityMode.type === 'ENTER_MODE') {
            // Prevent clicking self unless specific modes allow it
            if (abilityMode.sourceCard && abilityMode.sourceCard.id === card.id && abilityMode.mode !== 'SELECT_LINE_START' && abilityMode.mode !== 'INTEGRATOR_LINE_SELECT' && abilityMode.mode !== 'SELECT_UNIT_FOR_MOVE' && abilityMode.mode !== 'SELECT_TARGET') return;
            
            const { mode, payload, sourceCard, sourceCoords, isDeployAbility } = abilityMode;
            if (mode === 'SELECT_LINE_START' || mode === 'SELECT_LINE_END') { handleLineSelection(boardCoords); return; }

            const actorId = sourceCard?.ownerId ?? (gameState.players.find(p => p.id === gameState.activeTurnPlayerId)?.isDummy ? gameState.activeTurnPlayerId : (localPlayerId || gameState.activeTurnPlayerId));

            if (mode === 'SELECT_TARGET' && payload.tokenType) {
                if (payload.filter && !payload.filter(card, boardCoords.row, boardCoords.col)) return;
                
                moveItem({
                    card: { id: 'dummy', deck: 'counter', name: '', imageUrl: '', fallbackImage: '', power: 0, ability: '', types: [] },
                    source: 'counter_panel',
                    statusType: payload.tokenType,
                    count: payload.count || 1
                }, { target: 'board', boardCoords });
                
                if (abilityMode.recordContext) {
                    setCommandContext({ lastMovedCardCoords: boardCoords, lastMovedCardId: card.id });
                }

                if (payload.chainedAction) {
                    const nextAction: AbilityAction = { 
                        ...payload.chainedAction,
                        sourceCard: card,
                        sourceCoords: boardCoords,
                        isDeployAbility: isDeployAbility,
                        recordContext: true 
                    };
                    handleActionExecution(nextAction, boardCoords);
                    if (nextAction.type !== 'ENTER_MODE') setAbilityMode(null);
                } else {
                    if (sourceCoords && sourceCoords.row >= 0) markAbilityUsed(sourceCoords, isDeployAbility);
                    setTimeout(() => setAbilityMode(null), 100);
                }
                return;
            }

            if (mode === 'SELECT_TARGET' && payload.actionType === 'OPEN_COUNTER_MODAL') {
                if (payload.filter && !payload.filter(card)) return;
                setCounterSelectionData({
                    card: card,
                    callbackAction: payload.rewardType
                });
                setAbilityMode(null);
                return;
            }

            if (mode === 'SELECT_TARGET' && payload.actionType === 'DESTROY') {
                if (payload.filter && !payload.filter(card, boardCoords.row, boardCoords.col)) return;
                const hasShield = card.statuses?.some(s => s.type === 'Shield');
                if (hasShield) { removeBoardCardStatus(boardCoords, 'Shield'); }
                else { moveItem({ card, source: 'board', boardCoords, bypassOwnershipCheck: true }, { target: 'discard', playerId: card.ownerId }); }
                
                if (payload.chainedAction) {
                    const nextAction = { ...payload.chainedAction, sourceCard, sourceCoords, isDeployAbility };
                    handleActionExecution(nextAction, sourceCoords!);
                    if (nextAction.type !== 'ENTER_MODE') setAbilityMode(null);
                } else {
                    if (sourceCoords && sourceCoords.row >= 0) markAbilityUsed(sourceCoords, isDeployAbility);
                    setTimeout(() => setAbilityMode(null), 100);
                }
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
            
            if (mode === 'SELECT_TARGET' && payload.actionType === 'RESET_DEPLOY') {
                if (payload.filter && !payload.filter(card)) return;
                resetDeployStatus(boardCoords);
                setTimeout(() => setAbilityMode(null), 100);
                return;
            }

            if (mode === 'SELECT_TARGET' && payload.actionType === 'SHIELD_AND_REMOVE_AIM') {
                if (payload.filter && !payload.filter(card)) return;
                addBoardCardStatus(boardCoords, 'Shield', actorId!);
                removeStatusByType(boardCoords, 'Aim');
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
                    payload: { 
                        allowSelf: false, 
                        abilitySourceCoords: sourceCoords, 
                        range: payload.range, 
                        chainedAction: payload.chainedAction,
                        originalActorId: actorId 
                    }
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
                    payload: { 
                        allowSelf: false, 
                        range: payload.range, 
                        chainedAction: payload.chainedAction,
                        originalActorId: actorId
                    }
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
    }, [abilityMode, cursorStack, gameState, localPlayerId, interactionLock, handleLineSelection, moveItem, markAbilityUsed, setAbilityMode, setCursorStack, removeBoardCardStatus, removeBoardCardStatusByOwner, addBoardCardStatus, modifyBoardCardPower, swapCards, transferStatus, transferAllCounters, updatePlayerScore, drawCard, activateAbility, setCounterSelectionData, resetDeployStatus, removeStatusByType, handleActionExecution, setCommandContext, commandContext]);

    const handleEmptyCellClick = useCallback((boardCoords: { row: number, col: number }) => {
        if (interactionLock.current) return;
        if (!abilityMode || abilityMode.type !== 'ENTER_MODE') return;
        const { mode, sourceCoords, sourceCard, payload, isDeployAbility } = abilityMode;

        if (mode === 'SCORE_LAST_PLAYED_LINE' || mode === 'SELECT_LINE_END' || mode === 'SELECT_DIAGONAL') {
            handleLineSelection(boardCoords);
            return;
        }

        if (mode === 'SELECT_LINE_START') { handleLineSelection(boardCoords); return; }

        const actorId = sourceCard?.ownerId ?? (gameState.players.find(p => p.id === gameState.activeTurnPlayerId)?.isDummy ? gameState.activeTurnPlayerId : (localPlayerId || gameState.activeTurnPlayerId));

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
                if (payload.moveFromHand) return null;
                // If sourceCoords is provided via ENTER_MODE, trust it first
                if (sourceCoords && sourceCoords.row >= 0) {
                    return sourceCoords;
                }
                
                // Fallback: search board
                for (let r = 0; r < gameState.board.length; r++) {
                    for (let c = 0; c < gameState.board.length; c++) {
                        if (gameState.board[r][c].card?.id === sourceCard.id) return { row: r, col: c };
                    }
                }
                return null;
            })();

            if (payload.moveFromHand && commandContext.selectedHandCard) {
                const { playerId, cardIndex } = commandContext.selectedHandCard;
                const player = gameState.players.find(p => p.id === playerId);
                const handCard = player?.hand[cardIndex];
                
                if (handCard) {
                    moveItem({ card: handCard, source: 'hand', playerId, cardIndex, isManual: true }, { target: 'board', boardCoords });
                    setTimeout(() => setAbilityMode(null), 100);
                }
                return;
            }

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

            if (isValidMove && currentCardCoords) {
                if (payload.allowSelf && boardCoords.row === currentCardCoords.row && boardCoords.col === currentCardCoords.col) { }
                else {
                    const liveCard = gameState.board[currentCardCoords.row][currentCardCoords.col].card;
                    if (liveCard) {
                        moveItem({ card: liveCard, source: 'board', boardCoords: currentCardCoords, bypassOwnershipCheck: true }, { target: 'board', boardCoords });
                    }
                }

                if (abilityMode.recordContext) {
                    setCommandContext({ lastMovedCardCoords: boardCoords, lastMovedCardId: sourceCard.id });
                }

                if (payload.chainedAction) {
                    // Execute Chained Action properly
                    const nextAction = { ...payload.chainedAction };
                    // Resolve special dynamic target IDs
                    if (nextAction.targetOwnerId === -2) {
                        nextAction.targetOwnerId = sourceCard.ownerId;
                    }
                    
                    // CRITICAL FIX for Tactical Maneuver: 
                    // Inject the moved card's ID into the payload of the next action.
                    // This allows handleActionExecution to find the card even if the React state hasn't updated the board yet.
                    if (abilityMode.recordContext) {
                         if (!nextAction.payload) nextAction.payload = {};
                         nextAction.payload._tempContextId = sourceCard.id;
                    }

                    handleActionExecution(nextAction, boardCoords);
                    if (nextAction.type !== 'ENTER_MODE') setAbilityMode(null);
                } else {
                    if (payload.abilitySourceCoords) {
                        markAbilityUsed(payload.abilitySourceCoords, isDeployAbility);
                    } else if (sourceCoords && sourceCoords.row >= 0) {
                        if (payload.originalActorId === undefined || sourceCard.ownerId === payload.originalActorId) {
                             markAbilityUsed(sourceCoords, isDeployAbility);
                        }
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
    }, [interactionLock, abilityMode, gameState, localPlayerId, handleLineSelection, moveItem, markAbilityUsed, setAbilityMode, spawnToken, setCommandContext, resurrectDiscardedCard, updatePlayerScore, addBoardCardStatus, setCursorStack, drawCard, commandContext, handleActionExecution]);

    const handleHandCardClick = useCallback((player: Player, card: Card, cardIndex: number) => {
        if (interactionLock.current) return;
        
        if (abilityMode && abilityMode.type === 'ENTER_MODE' && abilityMode.mode === 'SELECT_TARGET' && abilityMode.payload.actionType === 'SELECT_HAND_FOR_DEPLOY') {
            if (abilityMode.payload.filter && !abilityMode.payload.filter(card)) return;
            
            setCommandContext(prev => ({ ...prev, selectedHandCard: { playerId: player.id, cardIndex } }));
            
            setAbilityMode({
                type: 'ENTER_MODE',
                mode: 'SELECT_CELL',
                sourceCard: card,
                payload: { range: 'global', moveFromHand: true }
            });
            return;
        }

        if (abilityMode && abilityMode.type === 'ENTER_MODE' && abilityMode.mode === 'SELECT_TARGET') {
            const { payload, sourceCoords, isDeployAbility, sourceCard } = abilityMode;
            if (payload.actionType === 'DESTROY') {
                if (payload.filter && !payload.filter(card)) return;
                moveItem({ card, source: 'hand', playerId: player.id, cardIndex, bypassOwnershipCheck: true }, { target: 'discard', playerId: player.id });
                if (sourceCoords && sourceCoords.row >= 0) markAbilityUsed(sourceCoords, isDeployAbility);
                setTimeout(() => setAbilityMode(null), 100);
            }
        }
    }, [interactionLock, abilityMode, moveItem, markAbilityUsed, setAbilityMode, setCommandContext]);

    const handleAnnouncedCardDoubleClick = useCallback((player: Player, card: Card) => {
        if (abilityMode || cursorStack) return;
        if (interactionLock.current) return;

        if (!gameState.isGameStarted) return;
        if (gameState.activeTurnPlayerId !== player.id) return;
        if (!canActivateAbility(card, gameState.currentPhase, gameState.activeTurnPlayerId)) return;
        activateAbility(card, { row: -1, col: -1 });
    }, [abilityMode, cursorStack, interactionLock, gameState, activateAbility]);

    return {
        activateAbility,
        executeAction: handleActionExecution,
        handleLineSelection,
        handleBoardCardClick,
        handleEmptyCellClick,
        handleHandCardClick,
        handleAnnouncedCardDoubleClick
    };
};