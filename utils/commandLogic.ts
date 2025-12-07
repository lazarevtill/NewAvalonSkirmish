import { AbilityAction, Card, GameState } from '../types';

/**
 * Maps specific Command Card IDs and Option Indices to a SEQUENCE of Game Actions.
 * 
 * @returns AbilityAction[] - An array of actions to be executed in order.
 */
export const getCommandAction = (
    cardId: string,
    optionIndex: number,
    card: Card,
    gameState: GameState,
    localPlayerId: number
): AbilityAction[] => {
    const baseId = (card.baseId || cardId.split('_')[1] || cardId).toLowerCase(); 
    const isMain = optionIndex === -1;
    const actions: AbilityAction[] = [];

    // --- OVERWATCH ---
    if (baseId.includes('overwatch')) {
        // 1. Common Step: Place 1 Aim on any card.
        if (isMain) {
            actions.push({
                type: 'CREATE_STACK',
                tokenType: 'Aim',
                count: 1,
                sourceCard: card
            });
        }
        // Option 0: Reveal X from opponent hand (X = Total Aim).
        else if (optionIndex === 0) {
            actions.push({ 
                type: 'CREATE_STACK', 
                tokenType: 'Revealed', 
                dynamicCount: { factor: 'Aim', ownerId: localPlayerId },
                targetOwnerId: -1, // -1 means Opponents Only
                onlyOpponents: true,
                sourceCard: card
            });
        }
        // Option 1: Draw X cards (X = Total Aim).
        else if (optionIndex === 1) {
             actions.push({
                 type: 'GLOBAL_AUTO_APPLY', 
                 payload: { dynamicResource: { type: 'draw', factor: 'Aim', ownerId: localPlayerId } },
                 sourceCard: card
             });
        }
    }

    // --- TACTICAL MANEUVER ---
    else if (baseId.includes('tacticalmaneuver')) {
        // Option 0: Move Own Unit -> Draw = Power.
        if (optionIndex === 0) {
             actions.push({
                type: 'ENTER_MODE',
                mode: 'SELECT_UNIT_FOR_MOVE',
                recordContext: true,
                sourceCard: card,
                payload: {
                    range: 'line', 
                    filter: (target: Card) => target.ownerId === localPlayerId,
                    chainedAction: { type: 'GLOBAL_AUTO_APPLY', payload: { contextReward: 'DRAW_MOVED_POWER' }, sourceCard: card }
                }
            });
        }
        // Option 1: Move Own Unit -> Score = Power.
        else if (optionIndex === 1) {
             actions.push({
                type: 'ENTER_MODE',
                mode: 'SELECT_UNIT_FOR_MOVE',
                recordContext: true,
                sourceCard: card,
                payload: {
                    range: 'line', 
                    filter: (target: Card) => target.ownerId === localPlayerId,
                    chainedAction: { type: 'GLOBAL_AUTO_APPLY', payload: { contextReward: 'SCORE_MOVED_POWER' }, sourceCard: card }
                }
            });
        }
    }

    // --- INSPIRATION ---
    else if (baseId.includes('inspiration')) {
        // 3. Common Step: Select Own Unit -> Open Modal.
        if (isMain) {
            actions.push({
                type: 'ENTER_MODE',
                mode: 'SELECT_TARGET',
                sourceCard: card,
                payload: {
                    actionType: 'OPEN_COUNTER_MODAL',
                    filter: (target: Card) => target.ownerId === localPlayerId
                }
            });
        }
        // Rewards are handled by the payload injection in handleCommandConfirm
    }

    // --- DATA INTERCEPTION ---
    else if (baseId.includes('datainterception')) {
        // 1. Common Step: Place 1 Exploit on any card.
        if (isMain) {
            actions.push({ 
                type: 'CREATE_STACK', 
                tokenType: 'Exploit', 
                count: 1,
                sourceCard: card
            });
        }

        // Option 0: Count Total Exploits (X) -> Place X Reveal tokens.
        // Valid targets: Opponents, Face-down/Hand. Exclude cards with existing Reveal from self.
        else if (optionIndex === 0) {
            actions.push({ 
                type: 'CREATE_STACK', 
                tokenType: 'Revealed', 
                dynamicCount: { factor: 'Exploit', ownerId: localPlayerId },
                onlyFaceDown: true, // Also covers unrevealed hand cards due to validation logic
                onlyOpponents: true,
                targetOwnerId: -1,
                sourceCard: card
            });
        }
        // Option 1: Select Unit with Own Exploit -> Move Range 2.
        else if (optionIndex === 1) {
             actions.push({
                type: 'ENTER_MODE',
                mode: 'SELECT_UNIT_FOR_MOVE',
                sourceCard: card,
                payload: {
                    range: 2, 
                    filter: (target: Card) => target.statuses?.some(s => s.type === 'Exploit' && s.addedByPlayerId === localPlayerId) || false
                }
            });
        }
    }

    // --- FALSE ORDERS ---
    else if (baseId.includes('falseorders')) {
        // 1. Common Step: CREATE STACK Exploit (1) on Opponent Unit -> Record Context
        if (isMain) {
            actions.push({
                type: 'CREATE_STACK',
                tokenType: 'Exploit',
                count: 1,
                sourceCard: card,
                onlyOpponents: true,
                targetType: 'Unit', // Enforce Unit targeting
                recordContext: true // Record target to CommandContext
            });
        }

        // Option 0: Move Selected (Range 2) -> Reveal x2 (Owner's hand/FaceDown).
        else if (optionIndex === 0) {
             actions.push({
                type: 'ENTER_MODE',
                mode: 'SELECT_CELL',
                sourceCard: card, // Will be overridden by context in App.tsx
                recordContext: true, 
                payload: { 
                    range: 2,
                    chainedAction: { 
                        type: 'CREATE_STACK', 
                        tokenType: 'Revealed', 
                        count: 2, 
                        targetOwnerId: -2, // Owner of moved card
                        onlyFaceDown: true, 
                        excludeOwnerId: localPlayerId 
                    }
                }
            });
        }
        // Option 1: Move Selected (Range 2) -> Stun x2 (Owner = Command Player).
        else if (optionIndex === 1) {
             actions.push({
                type: 'ENTER_MODE',
                mode: 'SELECT_CELL',
                sourceCard: card,
                recordContext: true, 
                payload: { 
                    range: 2,
                    chainedAction: { 
                        type: 'GLOBAL_AUTO_APPLY', 
                        payload: { 
                            tokenType: 'Stun', 
                            count: 2,
                            ownerId: localPlayerId // Stun belongs to Command Player
                        } 
                    }
                }
            });
        }
    }

    // --- EXPERIMENTAL STIMULANTS ---
    else if (baseId.includes('experimentalstimulants')) {
        // Option 0: Reactivate Deploy (Reset flag)
        if (optionIndex === 0) {
            actions.push({
                type: 'ENTER_MODE',
                mode: 'SELECT_TARGET',
                sourceCard: card,
                payload: {
                    actionType: 'RESET_DEPLOY',
                    filter: (target: Card) => target.ownerId === localPlayerId && target.types?.includes('Unit')
                }
            });
        }
        // Option 1: Move Own Unit (Line)
        else if (optionIndex === 1) {
            actions.push({
                type: 'ENTER_MODE',
                mode: 'SELECT_UNIT_FOR_MOVE',
                sourceCard: card,
                payload: {
                    range: 'line',
                    filter: (target: Card) => target.ownerId === localPlayerId
                }
            });
        }
    }

    // --- LOGISTICS CHAIN ---
    else if (baseId.includes('logisticschain')) {
        // Option 0: Score Diagonal + 1 per Support
        if (optionIndex === 0) {
            actions.push({
                type: 'ENTER_MODE',
                mode: 'SELECT_DIAGONAL',
                sourceCard: card,
                payload: { actionType: 'SCORE_DIAGONAL', bonusType: 'point_per_support' }
            });
        }
        // Option 1: Score Diagonal + Draw 1 per Support
        else if (optionIndex === 1) {
            actions.push({
                type: 'ENTER_MODE',
                mode: 'SELECT_DIAGONAL',
                sourceCard: card,
                payload: { actionType: 'SCORE_DIAGONAL', bonusType: 'draw_per_support' }
            });
        }
    }

    // --- QUICK RESPONSE TEAM ---
    else if (baseId.includes('quickresponseteam')) {
        // Option 0: Deploy Unit from Hand
        if (optionIndex === 0) {
            actions.push({
                type: 'ENTER_MODE',
                mode: 'SELECT_TARGET', 
                sourceCard: card,
                payload: {
                    actionType: 'SELECT_HAND_FOR_DEPLOY',
                    filter: (target: Card) => target.ownerId === localPlayerId && target.types?.includes('Unit')
                }
            });
        }
        // Option 1: Search Deck for Unit -> Hand
        else if (optionIndex === 1) {
            actions.push({
                type: 'OPEN_MODAL',
                mode: 'SEARCH_DECK',
                sourceCard: card,
                payload: { filterType: 'Unit' }
            });
        }
    }

    // --- TEMPORARY SHELTER ---
    else if (baseId.includes('temporaryshelter')) {
        // Option 0: Shield (Stack) -> Remove All Aim (Context)
        if (optionIndex === 0) {
            actions.push({
                type: 'CREATE_STACK',
                tokenType: 'Shield',
                count: 1,
                targetOwnerId: localPlayerId, // Only own cards
                recordContext: true, // Mark this card
                sourceCard: card,
                chainedAction: {
                    type: 'GLOBAL_AUTO_APPLY',
                    payload: { customAction: 'REMOVE_ALL_AIM_FROM_CONTEXT' }
                }
            });
        }
        // Option 1: Shield (Stack) -> Move (Range 2)
        else if (optionIndex === 1) {
            actions.push({
                type: 'CREATE_STACK',
                tokenType: 'Shield',
                count: 1,
                targetOwnerId: localPlayerId, // Only own cards
                recordContext: true, // Mark this card
                sourceCard: card,
                chainedAction: {
                    type: 'ENTER_MODE',
                    mode: 'SELECT_CELL',
                    payload: { range: 2 } // App.tsx will inject sourceCard from commandContext
                }
            });
        }
    }

    // --- ENHANCED INTERROGATION ---
    else if (baseId.includes('enhancedinterrogation')) {
        // Common Logic: Place 1 Aim token first
        if (isMain) {
            actions.push({
                type: 'CREATE_STACK',
                tokenType: 'Aim',
                count: 1,
                sourceCard: card
            });
        }

        // Option 0: Count Total Aim (X) -> Place X Reveal tokens.
        // Valid targets: Opponents, Face-down/Hand. Exclude cards with existing Reveal from self.
        else if (optionIndex === 0) {
            actions.push({
                type: 'CREATE_STACK',
                tokenType: 'Revealed',
                dynamicCount: { factor: 'Aim', ownerId: localPlayerId },
                onlyFaceDown: true,
                onlyOpponents: true,
                targetOwnerId: -1,
                sourceCard: card
            });
        }
        // Option 1: Select Unit with Own Aim -> Move Range 2.
        else if (optionIndex === 1) {
            actions.push({
                type: 'ENTER_MODE',
                mode: 'SELECT_UNIT_FOR_MOVE',
                sourceCard: card,
                payload: {
                    range: 2,
                    filter: (target: Card) => target.statuses?.some(s => s.type === 'Aim' && s.addedByPlayerId === localPlayerId) || false
                }
            });
        }
    }
    // --- LINE BREACH (Mobilization 1) ---
    else if (baseId.includes('mobilization1') || baseId.includes('linebreach') || baseId.includes('mobilization')) {
        if (isMain) {
            actions.push({
                type: 'ENTER_MODE',
                mode: 'SELECT_LINE_START',
                sourceCard: card,
                payload: { actionType: 'SCORE_LINE' }
            });
        }
    }

    return actions;
};