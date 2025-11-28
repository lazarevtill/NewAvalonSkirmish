import { AbilityAction, Card, GameState } from '../types';

/**
 * Maps specific Command Card IDs and Option Indices to Game Actions.
 * 
 * @param cardId The ID of the command card.
 * @param optionIndex -1 for Main Ability (First step), 0 or 1 for Sub Options (Second step/Consequence).
 * @param card The card object.
 * @param gameState The current game state.
 * @param localPlayerId The ID of the player executing the command.
 */
export const getCommandAction = (
    cardId: string,
    optionIndex: number,
    card: Card,
    gameState: GameState,
    localPlayerId: number
): AbilityAction | null => {
    const baseId = (card.baseId || cardId.split('_')[1] || cardId).toLowerCase(); 
    const isMain = optionIndex === -1;

    // --- OVERWATCH ---
    if (baseId.includes('overwatch')) {
        // 1. Common Step: Place 1 Aim on any card.
        if (isMain) {
            return {
                type: 'CREATE_STACK',
                tokenType: 'Aim',
                count: 1,
                sourceCard: card
            };
        }
        // Option 0: Reveal X cards from opponent hand (X = Total Aim).
        if (optionIndex === 0) {
            return { 
                type: 'CREATE_STACK', 
                tokenType: 'Revealed', 
                dynamicCount: { factor: 'Aim', ownerId: localPlayerId },
                targetOwnerId: -1, // -1 means Opponents Only
                onlyOpponents: true, // Redundant but explicit
                sourceCard: card
            };
        }
        // Option 1: Draw X cards (X = Total Aim).
        if (optionIndex === 1) {
             return {
                 type: 'GLOBAL_AUTO_APPLY', 
                 payload: { dynamicResource: { type: 'draw', factor: 'Aim', ownerId: localPlayerId } },
                 sourceCard: card
             };
        }
    }

    // --- TACTICAL MANEUVER ---
    if (baseId.includes('tacticalmaneuver')) {
        // Option 0: Move Own Unit -> Draw = Power.
        if (optionIndex === 0) {
             return {
                type: 'ENTER_MODE',
                mode: 'SELECT_UNIT_FOR_MOVE',
                recordContext: true,
                sourceCard: card,
                payload: {
                    range: 'line', 
                    filter: (target: Card) => target.ownerId === localPlayerId,
                    chainedAction: { type: 'GLOBAL_AUTO_APPLY', payload: { contextReward: 'DRAW_MOVED_POWER' }, sourceCard: card }
                }
            };
        }
        // Option 1: Move Own Unit -> Score = Power.
        if (optionIndex === 1) {
             return {
                type: 'ENTER_MODE',
                mode: 'SELECT_UNIT_FOR_MOVE',
                recordContext: true,
                sourceCard: card,
                payload: {
                    range: 'line', 
                    filter: (target: Card) => target.ownerId === localPlayerId,
                    chainedAction: { type: 'GLOBAL_AUTO_APPLY', payload: { contextReward: 'SCORE_MOVED_POWER' }, sourceCard: card }
                }
            };
        }
        // Main action is null because the options define the entire sequence (Select -> Move -> Reward)
        return null; 
    }

    // --- INSPIRATION ---
    if (baseId.includes('inspiration')) {
        // 3. Common Step: Select Own Unit -> Open Modal.
        if (isMain) {
            return {
                type: 'ENTER_MODE',
                mode: 'SELECT_TARGET',
                sourceCard: card,
                payload: {
                    actionType: 'OPEN_COUNTER_MODAL',
                    filter: (target: Card) => target.ownerId === localPlayerId
                }
            };
        }
        // Note: The Reward (Draw vs Score) is passed via the 'rewardType' payload in handleCommandConfirm 
        // effectively injecting it into the Main Action. We return null here because the logic is inside the modal callback.
        return null; 
    }

    // --- DATA INTERCEPTION ---
    if (baseId.includes('datainterception')) {
        // 4. Common Step: Place 1 Exploit.
        if (isMain) {
            return { 
                type: 'CREATE_STACK', 
                tokenType: 'Exploit', 
                count: 1,
                sourceCard: card
            };
        }
        // Option 0: Reveal X from Opponent Hand (X = Total Exploit).
        if (optionIndex === 0) {
            return { 
                type: 'CREATE_STACK', 
                tokenType: 'Revealed', 
                dynamicCount: { factor: 'Exploit', ownerId: localPlayerId },
                onlyOpponents: true,
                targetOwnerId: -1, // -1 means Opponents Only
                sourceCard: card
            };
        }
        // Option 1: Move unit with Own Exploit to Line Empty Cell.
        if (optionIndex === 1) {
             return {
                type: 'ENTER_MODE',
                mode: 'SELECT_UNIT_FOR_MOVE',
                sourceCard: card,
                payload: {
                    range: 'line',
                    filter: (target: Card) => target.statuses?.some(s => s.type === 'Exploit' && s.addedByPlayerId === localPlayerId)
                }
            };
        }
    }

    // --- FALSE ORDERS ---
    if (baseId.includes('falseorders')) {
        // 5. Common Step: Place 1 Exploit on Opponent.
        if (isMain) {
            return { 
                type: 'CREATE_STACK', 
                tokenType: 'Exploit', 
                count: 1,
                onlyOpponents: true,
                sourceCard: card
            };
        }
        // Option 0: Move Opponent w/ Exploit (Range 2) -> Reveal x2 (Owner's hand).
        if (optionIndex === 0) {
             return {
                type: 'ENTER_MODE',
                mode: 'SELECT_UNIT_FOR_MOVE',
                recordContext: true,
                sourceCard: card,
                payload: { 
                    filter: (target: Card) => target.ownerId !== localPlayerId && target.statuses?.some(s => s.type === 'Exploit' && s.addedByPlayerId === localPlayerId),
                    range: 2,
                    chainedAction: { type: 'CREATE_STACK', tokenType: 'Revealed', count: 2, targetOwnerId: -2, onlyFaceDown: true } // -2 targetOwnerId means "Owner of moved card"
                }
            };
        }
        // Option 1: Move Opponent w/ Exploit (Range 2) -> Stun 1.
        if (optionIndex === 1) {
             return {
                type: 'ENTER_MODE',
                mode: 'SELECT_UNIT_FOR_MOVE',
                recordContext: true,
                sourceCard: card,
                payload: { 
                    filter: (target: Card) => target.ownerId !== localPlayerId && target.statuses?.some(s => s.type === 'Exploit' && s.addedByPlayerId === localPlayerId),
                    range: 2,
                    chainedAction: { type: 'GLOBAL_AUTO_APPLY', payload: { contextReward: 'STUN_MOVED_UNIT' } }
                }
            };
        }
    }

    return null;
};