import { useState, useCallback } from 'react';
import { Card, GameState, AbilityAction, CommandContext, DragItem, Player, CounterSelectionData, CursorStackState } from '../types';
import { getCommandAction } from '../utils/commandLogic';
import { commandCardIds } from '../contentDatabase';
import { checkActionHasTargets } from '../utils/targeting';

interface UseAppCommandProps {
    gameState: GameState;
    localPlayerId: number | null;
    setActionQueue: React.Dispatch<React.SetStateAction<AbilityAction[]>>;
    setCommandContext: React.Dispatch<React.SetStateAction<CommandContext>>;
    setCommandModalCard: React.Dispatch<React.SetStateAction<Card | null>>;
    setCounterSelectionData: React.Dispatch<React.SetStateAction<CounterSelectionData | null>>;
    moveItem: (item: DragItem, target: any) => void;
    drawCard: (playerId: number) => void;
    updatePlayerScore: (playerId: number, delta: number) => void;
    removeBoardCardStatus: (coords: any, status: string) => void;
    setCursorStack: React.Dispatch<React.SetStateAction<CursorStackState | null>>;
    setAbilityMode: React.Dispatch<React.SetStateAction<AbilityAction | null>>;
    setNoTargetOverlay: React.Dispatch<React.SetStateAction<{ row: number, col: number } | null>>;
}

export const useAppCommand = ({
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
}: UseAppCommandProps) => {

    const playCommandCard = useCallback((card: Card, source: DragItem) => {
        if (localPlayerId === null) return;
        const owner = gameState.players.find(p => p.id === source.playerId);
        const canControl = source.playerId === localPlayerId || (owner?.isDummy);

        if (!canControl) return;

        // 1. Move to Showcase (Announced)
        moveItem(source, { target: 'announced', playerId: source.playerId! });

        // Reset context
        setCommandContext({});

        const baseId = (card.baseId || card.id.split('_')[1] || card.id).toLowerCase();
        const complexCommands = [
            'overwatch', 
            'tacticalmaneuver', 
            'repositioning', 
            'inspiration', 
            'datainterception', 
            'falseorders',
            'experimentalstimulants',
            'logisticschain',
            'quickresponseteam',
            'temporaryshelter',
            'enhancedinterrogation'
        ];

        // 2. Check type
        // If it's one of the complex commands, ALWAYS open the modal.
        if (complexCommands.some(id => baseId.includes(id))) {
            setCommandModalCard(card);
        } else {
            // Simple Command (e.g. Mobilization)
            // Just execute Main Logic
            const actions = getCommandAction(card.id, -1, card, gameState, source.playerId!);
            
            // Queue actions + Cleanup
            if (actions.length > 0) {
                // If the first action has targets, queue it. If not, maybe skip?
                // For safety, we queue it and let the processor handle "No Target".
                setActionQueue([
                    ...actions,
                    { type: 'GLOBAL_AUTO_APPLY', payload: { cleanupCommand: true, card: card, ownerId: source.playerId! }, sourceCard: card }
                ]);
            } else {
                // No actions defined (unlikely if in DB), just cleanup
                setActionQueue([
                    { type: 'GLOBAL_AUTO_APPLY', payload: { cleanupCommand: true, card: card, ownerId: source.playerId! }, sourceCard: card }
                ]);
            }
        }
    }, [gameState, localPlayerId, moveItem, setActionQueue, setCommandContext, setCommandModalCard]);

    const handleCommandConfirm = useCallback((optionIndex: number, commandModalCard: Card) => {
        if (!commandModalCard || localPlayerId === null) return;

        const ownerId = commandModalCard.ownerId || localPlayerId;
        const queue: AbilityAction[] = [];

        // 1. Get ALL actions for this choice (actions may include main parts and selected option parts)
        // We call -1 (main) and then the option index.
        const mainActions = getCommandAction(commandModalCard.id, -1, commandModalCard, gameState, ownerId);
        
        let rewardType: 'DRAW_REMOVED' | 'SCORE_REMOVED' | undefined;

        // Special Case: Inspiration (Main Action opens Counter Modal)
        if (commandModalCard.baseId?.toLowerCase().includes('inspiration')) {
            rewardType = optionIndex === 0 ? 'DRAW_REMOVED' : 'SCORE_REMOVED';
            if (mainActions.length > 0 && mainActions[0].type === 'ENTER_MODE') {
                // Pass the reward type to the next step
                mainActions[0].payload = { ...mainActions[0].payload, rewardType };
            }
        } 

        // Add main actions to queue if they have targets
        mainActions.forEach(action => {
             // Basic target check validation could happen here, but queue processor handles it.
             // Special case: self-buffs or global applies always valid.
             queue.push(action);
        });

        // 2. Option Actions
        const optActions = getCommandAction(commandModalCard.id, optionIndex, commandModalCard, gameState, ownerId);
        optActions.forEach(action => {
            queue.push(action);
        });

        // 3. Cleanup (Discard Card) - Inspiration handles this after modal
        if (!commandModalCard.baseId?.toLowerCase().includes('inspiration')) {
            queue.push({
                type: 'GLOBAL_AUTO_APPLY',
                payload: { cleanupCommand: true, card: commandModalCard, ownerId },
                sourceCard: commandModalCard
            });
        }

        setActionQueue(queue);
        setCommandModalCard(null);
    }, [gameState, localPlayerId, setActionQueue, setCommandModalCard]);

    const handleCounterSelectionConfirm = useCallback((countsToRemove: Record<string, number>, data: CounterSelectionData) => {
        if (localPlayerId === null) return;
        const ownerId = data.card.ownerId || localPlayerId;
        
        // 1. Identify Board Coords of the card
        let boardCoords: { row: number, col: number } | null = null;
        for(let r=0; r<gameState.board.length; r++){
            for(let c=0; c<gameState.board.length; c++){
                if (gameState.board[r][c].card?.id === data.card.id) {
                    boardCoords = { row: r, col: c };
                    break;
                }
            }
        }

        if (boardCoords) {
            // 2. Remove Counters
            let totalRemoved = 0;
            Object.entries(countsToRemove).forEach(([type, count]) => {
                for(let i=0; i<count; i++) {
                    removeBoardCardStatus(boardCoords!, type);
                    totalRemoved++;
                }
            });

            // 3. Apply Reward
            if (totalRemoved > 0) {
                if (data.callbackAction === 'DRAW_REMOVED') {
                    for (let i = 0; i < totalRemoved; i++) drawCard(ownerId);
                } else if (data.callbackAction === 'SCORE_REMOVED') {
                    updatePlayerScore(ownerId, totalRemoved);
                }
            }
        }

        // Cleanup Command (Inspiration)
        const player = gameState.players.find(p => p.id === ownerId);
        if (player && player.announcedCard) {
             setActionQueue([{
                 type: 'GLOBAL_AUTO_APPLY',
                 payload: { cleanupCommand: true, card: player.announcedCard, ownerId },
                 sourceCard: player.announcedCard
            }]);
        }
        
        setCounterSelectionData(null);
    }, [localPlayerId, drawCard, updatePlayerScore, setActionQueue, setCounterSelectionData, gameState, removeBoardCardStatus]);

    return {
        playCommandCard,
        handleCommandConfirm,
        handleCounterSelectionConfirm
    };
};