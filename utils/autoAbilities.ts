/**
 * @file Logic for specific card abilities in New Avalon: Skirmish.
 * Handles highlighting (canActivate) and action generation (getAction).
 */

import type { Card, GameState, Board } from '../types';

export type AbilityModeType = 
    | 'SELECT_TARGET'      // Generic: Pick a card satisfying criteria
    | 'SELECT_CELL'        // Generic: Pick an empty cell satisfying criteria
    | 'RIOT_PUSH'          // Specific: Riot Agent push logic
    | 'RIOT_MOVE'          // Specific: Riot Agent follow-up move
    | 'PATROL_MOVE';       // Specific: Patrol Agent line move

export interface AbilityAction {
    type: 'CREATE_STACK' | 'ENTER_MODE';
    tokenType?: string;     // For CREATE_STACK or ENTER_MODE visuals
    count?: number;         // For CREATE_STACK
    mode?: AbilityModeType; // For ENTER_MODE
    sourceCard?: Card;      // Context
    sourceCoords?: { row: number, col: number }; // Context
    payload?: any;          // Extra data (e.g. allowed target IDs)
    targetReq?: string;     // Short description of the required target for UI tooltips
}

export const PHASE_KEYWORDS: Record<number, string> = {
    0: 'Setup',
    2: 'Deploy',
    4: 'Commit'
};

// --- Helpers ---

export const isAdjacent = (r1: number, c1: number, r2: number, c2: number): boolean => {
    return Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1;
};

export const hasStatus = (card: Card, type: string, playerId: number): boolean => {
    return card.statuses?.some(s => s.type === type && s.addedByPlayerId === playerId) || false;
};

const hasAnyStatus = (card: Card, type: string): boolean => {
    return card.statuses?.some(s => s.type === type) || false;
};

const hasSupport = (card: Card): boolean => {
    return card.statuses?.some(s => s.type === 'Support') || false;
};

const countExploitsOnBoard = (board: Board, playerId: number): number => {
    let count = 0;
    board.forEach(row => {
        row.forEach(cell => {
            if (cell.card) {
                // Count every instance of exploit from this player
                const exploits = cell.card.statuses?.filter(s => s.type === 'Exploit' && s.addedByPlayerId === playerId).length || 0;
                count += exploits;
            }
        });
    });
    return count;
};

/**
 * Determines if a card should be highlighted/clickable in the current phase.
 */
export const canActivateAbility = (card: Card, phaseIndex: number, activeTurnPlayerId: number): boolean => {
    // 1. Basic Checks
    if (card.ownerId !== activeTurnPlayerId) return false;
    
    // Stunned cards cannot activate abilities
    if (hasAnyStatus(card, 'Stun')) return false;

    // Check if ability was already used in this phase
    if (card.abilityUsedInPhase === phaseIndex) return false;
    
    const phaseName = PHASE_KEYWORDS[phaseIndex];
    if (!phaseName) return false;
    
    // Must strictly mention the phase name
    if (!card.ability.includes(phaseName)) return false;

    // 2. Phase Specific Rules
    
    // Deploy Phase: Card must have entered battlefield THIS turn
    if (phaseIndex === 2) {
        if (!card.enteredThisTurn) return false;
    }

    // Commit Phase (usually requires Support): Check for "Support => Commit" pattern
    if (phaseIndex === 4) {
        // Simple text check: does the ability line for Commit start with Support?
        // We check if "Support" appears before "Commit" in the text block or associated line.
        // For strictness based on prompt: "Support => Commit" means Support is required.
        if (card.ability.includes('Support ⇒ Commit') || card.ability.includes('Support => Commit')) {
             if (!hasSupport(card)) return false;
        }
    }

    // 3. Card Specific Logic (Prerequisites)
    const name = card.name.toLowerCase();

    if (name.includes('tactical agent') && phaseIndex === 0) {
        // Setup: Destroy card with aim. User must HAVE a card with Aim on board.
        return true; // Allow activation, UI will show targets or nothing
    }

    return true;
};

/**
 * Generates the action to take when a highlighted card is clicked.
 */
export const getCardAbilityAction = (
    card: Card, 
    gameState: GameState, 
    ownerId: number,
    coords: { row: number, col: number }
): AbilityAction | null => {
    const phaseIndex = gameState.currentPhase;
    const name = card.name.toLowerCase();

    // --- IP DEPT AGENT ---
    if (name.includes('ip dept agent')) {
        // Deploy: Stun ANY card with exploit (not just owned by player, not just adjacent)
        if (phaseIndex === 2) {
            return {
                type: 'ENTER_MODE',
                mode: 'SELECT_TARGET',
                sourceCard: card,
                sourceCoords: coords,
                payload: {
                    tokenType: 'Stun',
                    count: 2,
                    // Check if target has exploit status from OWNER
                    filter: (target: Card) => hasStatus(target, 'Exploit', ownerId)
                }
            };
        }
        // Commit (Support): Destroy a revealed card (IN HAND ONLY)
        if (phaseIndex === 4) {
             return {
                type: 'ENTER_MODE',
                mode: 'SELECT_TARGET',
                sourceCard: card,
                sourceCoords: coords,
                payload: {
                    actionType: 'DESTROY',
                    // Check if target is revealed (either via status or property)
                    // AND ensure it is NOT on the board (row/col undefined)
                    filter: (target: Card, row?: number, col?: number) => {
                        // If row/col are present, it is on the board. Reject.
                        if (row !== undefined || col !== undefined) return false;

                        const isRevealedStatus = hasAnyStatus(target, 'Revealed');
                        const isRevealedProp = target.revealedTo === 'all'; 
                        return isRevealedStatus || isRevealedProp;
                    }
                }
            };
        }
    }

    // --- TACTICAL AGENT ---
    if (name.includes('tactical agent')) {
        // Deploy: Aim card with your Threat
        if (phaseIndex === 2) {
            return {
                type: 'ENTER_MODE',
                mode: 'SELECT_TARGET',
                sourceCard: card,
                sourceCoords: coords,
                payload: {
                    tokenType: 'Aim',
                    filter: (target: Card) => hasStatus(target, 'Threat', ownerId)
                }
            };
        }
        // Setup: Destroy card with your Aim
        if (phaseIndex === 0) {
            return {
                type: 'ENTER_MODE',
                mode: 'SELECT_TARGET',
                sourceCard: card,
                sourceCoords: coords,
                payload: {
                    actionType: 'DESTROY',
                    filter: (target: Card) => hasStatus(target, 'Aim', ownerId)
                }
            };
        }
    }

    // --- PATROL AGENT ---
    if (name.includes('patrol agent')) {
        // Setup: Move self to any cell in line
        if (phaseIndex === 0) {
            return {
                type: 'ENTER_MODE',
                mode: 'PATROL_MOVE',
                sourceCard: card,
                sourceCoords: coords,
                payload: {
                }
            };
        }
        // Commit (Support): Stun adjacent opponent with your Threat
        if (phaseIndex === 4) {
            return {
                type: 'ENTER_MODE',
                mode: 'SELECT_TARGET',
                sourceCard: card,
                sourceCoords: coords,
                payload: {
                    tokenType: 'Stun',
                    filter: (target: Card, tRow: number, tCol: number) => 
                        isAdjacent(coords.row, coords.col, tRow, tCol) && 
                        target.ownerId !== ownerId && 
                        hasStatus(target, 'Threat', ownerId)
                }
            };
        }
    }

    // --- RIOT AGENT ---
    if (name.includes('riot agent')) {
        // Deploy: Push adjacent opponent
        if (phaseIndex === 2) {
            return {
                type: 'ENTER_MODE',
                mode: 'RIOT_PUSH',
                sourceCard: card,
                sourceCoords: coords,
                payload: {
                }
            };
        }
        // Commit (Support): Stun adjacent opponent with your Threat
        if (phaseIndex === 4) {
             return {
                type: 'ENTER_MODE',
                mode: 'SELECT_TARGET',
                sourceCard: card,
                sourceCoords: coords,
                payload: {
                    tokenType: 'Stun',
                    filter: (target: Card, tRow: number, tCol: number) => 
                        isAdjacent(coords.row, coords.col, tRow, tCol) && 
                        target.ownerId !== ownerId && 
                        hasStatus(target, 'Threat', ownerId)
                }
            };
        }
    }

    // --- THREAT ANALYST ---
    if (name.includes('threat analyst')) {
        // Deploy: Cursor gets Exploit
        if (phaseIndex === 2) {
            return { type: 'CREATE_STACK', tokenType: 'Exploit', count: 1 };
        }
        // Commit (Support): Cursor gets Reveals = total exploits
        if (phaseIndex === 4) {
            const count = countExploitsOnBoard(gameState.board, ownerId);
            if (count > 0) {
                return { type: 'CREATE_STACK', tokenType: 'Revealed', count: count };
            }
        }
    }

    return null;
};