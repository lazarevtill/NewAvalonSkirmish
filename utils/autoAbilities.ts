/**
 * @file Logic for specific card abilities in New Avalon: Skirmish.
 * Handles highlighting (canActivate) and action generation (getAction).
 */

import type { Card, GameState, Board, Player } from '../types';

export type AbilityModeType = 
    | 'SELECT_TARGET'      // Generic: Pick a card satisfying criteria
    | 'SELECT_CELL'        // Generic: Pick an empty cell satisfying criteria
    | 'RIOT_PUSH'          // Specific: Riot Agent push logic
    | 'RIOT_MOVE'          // Specific: Riot Agent follow-up move
    | 'PATROL_MOVE'        // Specific: Patrol Agent line move
    | 'SWAP_POSITIONS'     // Specific: Reckless Provocateur swap
    | 'TRANSFER_STATUS_SELECT' // Specific: Select card to steal status from (Single)
    | 'TRANSFER_ALL_STATUSES'  // Specific: Select card to steal ALL valid statuses from
    | 'SPAWN_TOKEN'        // Specific: Spawn a token
    | 'RETRIEVE_DEVICE'    // Specific: Open discard to retrieve device
    | 'REVEAL_ENEMY'       // Specific: Recon drone reveal
    | 'SELECT_LINE_START'  // Specific: Mobilization line select step 1
    | 'SELECT_LINE_END';   // Specific: Mobilization line select step 2

export interface AbilityAction {
    type: 'CREATE_STACK' | 'ENTER_MODE' | 'OPEN_MODAL';
    tokenType?: string;     // For CREATE_STACK or ENTER_MODE visuals
    count?: number;         // For CREATE_STACK
    mode?: AbilityModeType; // For ENTER_MODE
    sourceCard?: Card;      // Context
    sourceCoords?: { row: number, col: number }; // Context
    payload?: any;          // Extra data (e.g. allowed target IDs)
    targetReq?: string;     // Short description of the required target for UI tooltips
    
    // --- TARGETING CONSTRAINTS ---
    excludeOwnerId?: number; // Illegal: Target owner matches this ID
    targetOwnerId?: number;  // Legal: Target owner MUST match this ID
    onlyOpponents?: boolean; // Legal: Must be opponent (not self, not teammate)
    onlyFaceDown?: boolean;  // Legal: Must be Face Down / Unrevealed AND have no 'Revealed' token
}

export const PHASE_KEYWORDS: Record<number, string> = {
    0: 'Setup',
    1: 'Command Phase #1',
    2: 'Deploy',
    3: 'Command Phase #2',
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

const isTeammate = (p1: Player | undefined, p2: Player | undefined) => {
    if (!p1 || !p2) return false;
    return p1.teamId !== undefined && p2.teamId !== undefined && p1.teamId === p2.teamId;
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
    
    // Command Cards in Showcase (Announced) are usable in Command Phases
    if (card.deck === 'Command') {
        return phaseIndex === 1 || phaseIndex === 3;
    }
    
    const phaseName = PHASE_KEYWORDS[phaseIndex];
    if (!phaseName) return false;
    
    // Must strictly mention the phase name
    // Special handling for "Support => X"
    const requiresSupport = card.ability.includes(`Support ⇒ ${phaseName}`) || card.ability.includes(`Support => ${phaseName}`);
    
    // If exact phase match "Deploy:", "Setup:", "Commit:" etc.
    // Or if Support requirement is met.
    const hasPhaseKeyword = card.ability.includes(`${phaseName}:`);
    
    if (!hasPhaseKeyword && !requiresSupport) return false;
    
    // 2. Phase Specific Rules
    
    // Deploy Phase: Card must have entered battlefield THIS turn (unless it's a Command)
    if (phaseIndex === 2 && card.types?.includes('Unit')) {
        if (!card.enteredThisTurn) return false;
    }

    // Support Requirement Check
    if (requiresSupport) {
         if (!hasSupport(card)) return false;
    }

    // 3. Card Specific Logic (Prerequisites)
    const name = card.name.toLowerCase();

    if (name.includes('tactical agent') && phaseIndex === 0) {
        // Setup: Destroy card with aim.
        return true; 
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
    const ownerPlayer = gameState.players.find(p => p.id === ownerId);

    // --- MOBILIZATION (Line Breach) ---
    // The card ID is mobilization (from decks.json), often referred to as Line Breach ability.
    // Usable in Command Phase #1 (1) and Command Phase #2 (3).
    if (card.id.includes('MOBILIZATION') && (phaseIndex === 1 || phaseIndex === 3)) {
        return {
            type: 'ENTER_MODE',
            mode: 'SELECT_LINE_START',
            sourceCard: card,
            sourceCoords: coords,
            payload: {}
        };
    }

    // --- RECKLESS PROVOCATEUR ---
    if (name.includes('reckless provocateur')) {
        // Deploy: Swap positions with a card in an adjacent cell.
        // Note: `canActivateAbility` ensures `enteredThisTurn` is true for Phase 2.
        if (phaseIndex === 2) {
             return {
                type: 'ENTER_MODE',
                mode: 'SWAP_POSITIONS',
                sourceCard: card,
                sourceCoords: coords,
                payload: {
                    // Explicitly exclude self, even though isAdjacent implies it
                    filter: (target: Card, tRow: number, tCol: number) => isAdjacent(coords.row, coords.col, tRow, tCol) && target.id !== card.id
                }
            };
        }
        // Commit: Move all counters from another allied card to this card (except Threat/Support/Power).
        if (phaseIndex === 4) {
             return {
                type: 'ENTER_MODE',
                mode: 'TRANSFER_ALL_STATUSES',
                sourceCard: card,
                sourceCoords: coords,
                payload: {
                    filter: (target: Card) => {
                        // Allied: Same owner OR teammate
                        const targetOwner = gameState.players.find(p => p.id === target.ownerId);
                        const isAlly = target.ownerId === ownerId || isTeammate(ownerPlayer, targetOwner);
                        // Must not be self
                        if (target.id === card.id) return false;
                        // Must be an ally
                        if (!isAlly) return false;
                        
                        // Must have at least one transferable counter (status)
                        // Transferable = NOT 'Support', 'Threat'.
                        // Power is ignored as it's a property, so if only power exists, return false effectively.
                        return target.statuses && target.statuses.some(s => !['Support', 'Threat'].includes(s.type));
                    }
                }
            };
        }
    }

    // --- DATA LIBERATOR ---
    if (name.includes('data liberator')) {
        // Deploy: Exploit any card.
        if (phaseIndex === 2) {
            return { type: 'CREATE_STACK', tokenType: 'Exploit', count: 1 };
        }
    }

    // --- CAUTIOUS AVENGER ---
    if (name.includes('cautious avenger')) {
        // Deploy: Aim card in line
        if (phaseIndex === 2) {
             return {
                type: 'ENTER_MODE',
                mode: 'SELECT_TARGET',
                sourceCard: card,
                sourceCoords: coords,
                payload: {
                    tokenType: 'Aim',
                    filter: (target: Card, tRow: number, tCol: number) => {
                        // EXCLUDE SELF to avoid accidental self-targeting
                        return (tRow === coords.row || tCol === coords.col) && target.id !== card.id;
                    }
                }
            };
        }
        // Support => Setup: Destroy card with Aim
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

    // --- VIGILANT SPOTTER ---
    if (name.includes('vigilant spotter')) {
        // Commit: Each opponent reveals 1 cards to you.
        // Legal targets: Opponents only, and only Face Down/Unrevealed cards.
        if (phaseIndex === 4) {
             return {
                type: 'CREATE_STACK',
                tokenType: 'Revealed',
                count: 1,
                onlyOpponents: true, 
                onlyFaceDown: true 
            };
        }
    }

    // --- INVENTIVE MAKER ---
    if (name.includes('inventive maker')) {
        // Deploy: Place Recon Drone in free adjacent cell
        if (phaseIndex === 2) {
             return {
                type: 'ENTER_MODE',
                mode: 'SPAWN_TOKEN',
                sourceCard: card,
                sourceCoords: coords,
                payload: {
                    tokenName: 'Recon Drone'
                }
            };
        }
        // Support => Setup: Return Device from discard
        if (phaseIndex === 0) {
             return {
                type: 'OPEN_MODAL',
                mode: 'RETRIEVE_DEVICE',
                sourceCard: card,
                sourceCoords: coords,
                payload: {}
            };
        }
    }

    // --- RECON DRONE (Token) ---
    if (name.includes('recon drone')) {
        // Setup: Move to any cell
        if (phaseIndex === 0) {
             return {
                type: 'ENTER_MODE',
                mode: 'SELECT_CELL', // Generic move
                sourceCard: card,
                sourceCoords: coords,
                payload: {
                    allowSelf: true // Can choose self to stay
                }
            };
        }
        // Commit: Reveal card of adjacent owner.
        if (phaseIndex === 4) {
             return {
                type: 'ENTER_MODE',
                mode: 'REVEAL_ENEMY',
                sourceCard: card,
                sourceCoords: coords,
                payload: {
                     // This filter is for SELECTING the target to reveal (Step 1).
                     // It must be an adjacent card belonging to an OPPONENT.
                     filter: (target: Card, tRow: number, tCol: number) => {
                        // Must be adjacent
                        if (!isAdjacent(coords.row, coords.col, tRow, tCol)) return false;
                        
                        // Opponent Check
                        const targetOwner = gameState.players.find(p => p.id === target.ownerId);
                        if (target.ownerId === ownerId || isTeammate(ownerPlayer, targetOwner)) return false;

                        // Note: We do NOT check isFaceDown here because Step 1 is "Select Neighbor",
                        // not "Select Card to Reveal". Step 2 applies the strict reveal constraints on that owner's cards.
                        return true;
                     }
                }
            };
        }
    }


    // --- IP DEPT AGENT ---
    if (name.includes('ip dept agent')) {
        // Deploy: Stun ANY card with exploit
        if (phaseIndex === 2) {
            return {
                type: 'ENTER_MODE',
                mode: 'SELECT_TARGET',
                sourceCard: card,
                sourceCoords: coords,
                payload: {
                    tokenType: 'Stun',
                    count: 2,
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
                    filter: (target: Card, row?: number, col?: number) => {
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