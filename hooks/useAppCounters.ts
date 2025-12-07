import { useRef, useEffect, useLayoutEffect } from 'react';
import type { CursorStackState, GameState, AbilityAction, DragItem, DropTarget, CommandContext } from '../types';
import { validateTarget } from '../utils/targeting';
import { countersDatabase } from '../contentDatabase';

interface UseAppCountersProps {
    gameState: GameState;
    localPlayerId: number | null;
    handleDrop: (item: DragItem, target: DropTarget) => void;
    markAbilityUsed: (coords: { row: number, col: number }, isDeployAbility?: boolean) => void;
    setAbilityMode: (mode: AbilityAction | null) => void;
    requestCardReveal: (data: any, playerId: number) => void;
    interactionLock: React.MutableRefObject<boolean>;
    abilityMode: AbilityAction | null;
    setCommandContext: React.Dispatch<React.SetStateAction<CommandContext>>;
    onAction: (action: AbilityAction, sourceCoords: { row: number, col: number }) => void;
    cursorStack: CursorStackState | null;
    setCursorStack: React.Dispatch<React.SetStateAction<CursorStackState | null>>;
}

export const useAppCounters = ({
    gameState,
    localPlayerId,
    handleDrop,
    markAbilityUsed,
    setAbilityMode,
    requestCardReveal,
    interactionLock,
    abilityMode,
    setCommandContext,
    onAction,
    cursorStack,
    setCursorStack
}: UseAppCountersProps) => {
    const cursorFollowerRef = useRef<HTMLDivElement>(null);
    const mousePos = useRef({ x: 0, y: 0 });
    const lastClickPos = useRef<{x: number, y: number} | null>(null);

    // Initial positioning layout effect
    useLayoutEffect(() => {
        if (cursorStack && cursorFollowerRef.current) {
            const { x, y } = mousePos.current;
            cursorFollowerRef.current.style.transform = `translate(${x + 2}px, ${y + 2}px)`;
        }
    }, [cursorStack]);

    // Mouse movement tracking for custom cursor
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            mousePos.current = { x: e.clientX, y: e.clientY };
            if (cursorFollowerRef.current) {
                cursorFollowerRef.current.style.transform = `translate(${e.clientX + 2}px, ${e.clientY + 2}px)`;
            }
        };
        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, []);

    // Handle dropping counters (global mouse up)
    useEffect(() => {
        const handleGlobalMouseUp = (e: MouseEvent) => {
            if (e.button !== 0) return; // Prevent action on right-click
            if (!cursorStack) return;
            const target = document.elementFromPoint(e.clientX, e.clientY);
            
            // Determine who is performing the action (Effective Actor)
            let effectiveActorId = localPlayerId;
            if (cursorStack.sourceCoords && cursorStack.sourceCoords.row >= 0) {
                const sourceCard = gameState.board[cursorStack.sourceCoords.row][cursorStack.sourceCoords.col].card;
                if (sourceCard) effectiveActorId = sourceCard.ownerId || localPlayerId;
            } else if (gameState.activeTurnPlayerId) {
                const activePlayer = gameState.players.find(p => p.id === gameState.activeTurnPlayerId);
                if (activePlayer?.isDummy) effectiveActorId = activePlayer.id;
            }

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
                            { card: targetCard, ownerId: playerId, location: 'hand' },
                            constraints,
                            effectiveActorId,
                            gameState.players
                        );
                        
                        if (!isValid) return;
                        
                        if (cursorStack.type === 'Revealed' && playerId !== effectiveActorId && !targetPlayer.isDummy) {
                             if (localPlayerId !== null) {
                                 requestCardReveal({ source: 'hand', ownerId: playerId, cardIndex }, localPlayerId);
                                 if (cursorStack.sourceCoords && cursorStack.sourceCoords.row >= 0) markAbilityUsed(cursorStack.sourceCoords, cursorStack.isDeployAbility);
                                 if (cursorStack.count > 1) {
                                     setCursorStack(prev => prev ? ({ ...prev, count: prev.count - 1 }) : null);
                                 } else {
                                     if (cursorStack.chainedAction) onAction(cursorStack.chainedAction, cursorStack.sourceCoords || {row: -1, col: -1});
                                     setCursorStack(null);
                                 }
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
                         if (cursorStack.sourceCoords && cursorStack.sourceCoords.row >= 0) markAbilityUsed(cursorStack.sourceCoords, cursorStack.isDeployAbility);
                         if (cursorStack.count > 1) {
                             setCursorStack(prev => prev ? ({ ...prev, count: prev.count - 1 }) : null);
                         } else {
                             if (cursorStack.chainedAction) onAction(cursorStack.chainedAction, cursorStack.sourceCoords || {row: -1, col: -1});
                             setCursorStack(null);
                         }
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
                        const constraints = {
                            targetOwnerId: cursorStack.targetOwnerId,
                            excludeOwnerId: cursorStack.excludeOwnerId,
                            onlyOpponents: cursorStack.onlyOpponents || (cursorStack.targetOwnerId === -1),
                            onlyFaceDown: cursorStack.onlyFaceDown,
                            targetType: cursorStack.targetType,
                            requiredTargetStatus: cursorStack.requiredTargetStatus,
                            mustBeAdjacentToSource: cursorStack.mustBeAdjacentToSource,
                            mustBeInLineWithSource: cursorStack.mustBeInLineWithSource,
                            sourceCoords: cursorStack.sourceCoords,
                            tokenType: cursorStack.type
                        };

                        const isValid = validateTarget(
                            { card: targetCard, ownerId: targetCard.ownerId, location: 'board', boardCoords: { row, col } },
                            constraints,
                            effectiveActorId,
                            gameState.players
                        );
                        if (!isValid) return;
                        
                        const targetPlayer = gameState.players.find(p => p.id === targetCard.ownerId);
                        
                        if (cursorStack.type === 'Revealed' && targetCard.ownerId !== effectiveActorId && !targetPlayer?.isDummy) {
                             if (targetCard.isFaceDown) {
                                 if (localPlayerId !== null) {
                                     requestCardReveal({ source: 'board', ownerId: targetCard.ownerId, boardCoords: { row, col } }, localPlayerId);
                                 }
                             } else {
                                 handleDrop({
                                    card: { id: `stack`, deck: 'counter', name: '', imageUrl: '', fallbackImage: '', power: 0, ability: '', types: [] },
                                    source: 'counter_panel',
                                    statusType: cursorStack.type,
                                    count: 1
                                 }, { target: 'board', boardCoords: { row, col }});
                             }
                             
                             if (cursorStack.sourceCoords && cursorStack.sourceCoords.row >= 0) markAbilityUsed(cursorStack.sourceCoords, cursorStack.isDeployAbility);
                             if (cursorStack.count > 1) {
                                 setCursorStack(prev => prev ? ({ ...prev, count: prev.count - 1 }) : null);
                             } else {
                                 if (cursorStack.chainedAction) onAction(cursorStack.chainedAction, cursorStack.sourceCoords || {row: -1, col: -1});
                                 setCursorStack(null);
                             }
                             interactionLock.current = true;
                             setTimeout(() => { interactionLock.current = false; }, 300);
                             return;
                        }
                    }
                    if (targetCard) {
                        const amountToDrop = cursorStack.placeAllAtOnce ? cursorStack.count : 1;
                        
                        handleDrop({
                            card: { id: `stack`, deck: 'counter', name: '', imageUrl: '', fallbackImage: '', power: 0, ability: '', types: [] },
                            source: 'counter_panel',
                            statusType: cursorStack.type,
                            count: amountToDrop
                        }, { target: 'board', boardCoords: { row, col }});
                        
                        // NEW: Record context for commands like False Orders / Temporary Shelter
                        if (cursorStack.recordContext) {
                            setCommandContext(prev => ({
                                ...prev,
                                lastMovedCardCoords: { row, col },
                                lastMovedCardId: targetCard.id
                            }));
                        }

                         if (cursorStack.sourceCoords && cursorStack.sourceCoords.row >= 0) markAbilityUsed(cursorStack.sourceCoords, cursorStack.isDeployAbility);
                        if (cursorStack.count > amountToDrop) {
                            setCursorStack(prev => prev ? ({ ...prev, count: prev.count - amountToDrop }) : null);
                        } else {
                            if (cursorStack.chainedAction) {
                                // Manual Context Injection:
                                // If we just recorded context, inject it into the chained action immediately.
                                // This bypasses the async state update delay of `commandContext`.
                                const chained = { ...cursorStack.chainedAction };
                                
                                if (cursorStack.recordContext) {
                                    // If we are chaining into a SELECT_CELL mode (like Temporary Shelter),
                                    // we usually want to move the card we just targeted.
                                    if (chained.mode === 'SELECT_CELL') {
                                        chained.sourceCard = targetCard;
                                        chained.sourceCoords = { row, col };
                                        chained.recordContext = true; // Continue passing context if needed
                                    }
                                    
                                    // NEW: Also inject for GLOBAL_AUTO_APPLY (Temporary Shelter Module 1 - Remove Aim)
                                    if (chained.type === 'GLOBAL_AUTO_APPLY') {
                                        chained.sourceCoords = { row, col };
                                    }
                                }

                                onAction(chained, cursorStack.sourceCoords || {row: -1, col: -1});
                            }
                            setCursorStack(null);
                        }
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
    }, [cursorStack, handleDrop, gameState, localPlayerId, requestCardReveal, markAbilityUsed, setAbilityMode, interactionLock, setCommandContext, onAction, setCursorStack]);

    const handleCounterMouseDown = (type: string, e: React.MouseEvent) => {
        lastClickPos.current = { x: e.clientX, y: e.clientY };
        mousePos.current = { x: e.clientX, y: e.clientY };
        setCursorStack(prev => {
            if (prev && prev.type === type) { return { type, count: prev.count + 1, isDragging: true, sourceCoords: prev.sourceCoords }; }
            return { type, count: 1, isDragging: true };
        });
    };

    return {
        cursorFollowerRef,
        handleCounterMouseDown
    };
};