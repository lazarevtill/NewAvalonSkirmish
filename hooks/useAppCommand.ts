import { useState, useCallback } from 'react';
import { Card, GameState, AbilityAction, CommandContext, DragItem, Player, CounterSelectionData } from '../types';
import { getCommandAction } from '../utils/commandLogic';
import { commandCardIds } from '../contentDatabase';

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
    removeBoardCardStatus
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
        const complexCommands = ['overwatch', 'tacticalmaneuver', 'repositioning', 'inspiration', 'datainterception', 'falseorders'];

        // 2. Check type
        // If it's one of the 5 complex commands, ALWAYS open the modal.
        // Using lowercase matching to be safe
        if (complexCommands.some(id => baseId.includes(id))) {
            setCommandModalCard(card);
        } else {
            // Simple Command (e.g. Mobilization)
            // Just execute Main Logic
            const mainAction = getCommandAction(card.id, -1, card, gameState, source.playerId!);
            if (mainAction) {
                setActionQueue([
                    mainAction,
                    { type: 'GLOBAL_AUTO_APPLY', payload: { cleanupCommand: true, card: card }, sourceCard: card }
                ]);
            }
        }
    }, [gameState, localPlayerId, moveItem, setActionQueue, setCommandContext, setCommandModalCard]);

    const handleCommandConfirm = useCallback((optionIndex: number, commandModalCard: Card) => {
        if (!commandModalCard || localPlayerId === null) return;

        const ownerId = commandModalCard.ownerId || localPlayerId;
        const queue: AbilityAction[] = [];

        // 1. Main Action (Place Token / Initial Select)
        const mainAction = getCommandAction(commandModalCard.id, -1, commandModalCard, gameState, ownerId);
        
        // Special Case: Inspiration (Main Action opens Counter Modal)
        if (commandModalCard.baseId?.toLowerCase().includes('inspiration')) {
            const rewardType = optionIndex === 0 ? 'DRAW_REMOVED' : 'SCORE_REMOVED';
            if (mainAction?.type === 'ENTER_MODE') {
                // Pass the reward type to the next step (CounterSelectionModal logic will use this)
                mainAction.payload = { ...mainAction.payload, rewardType };
            }
            queue.push(mainAction!);
        } else {
            if (mainAction) queue.push(mainAction);
            // 2. Option Action (The consequence)
            const optAction = getCommandAction(commandModalCard.id, optionIndex, commandModalCard, gameState, ownerId);
            if (optAction) queue.push(optAction);
        }

        // 3. Cleanup (Discard Card) - Inspiration handles this after modal
        if (!commandModalCard.baseId?.toLowerCase().includes('inspiration')) {
            queue.push({
                type: 'GLOBAL_AUTO_APPLY',
                payload: { cleanupCommand: true, card: commandModalCard },
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
        // Find the announced command card
        const player = gameState.players.find(p => p.id === ownerId);
        if (player && player.announcedCard) {
             setActionQueue([{
                 type: 'GLOBAL_AUTO_APPLY',
                 payload: { cleanupCommand: true, card: player.announcedCard },
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