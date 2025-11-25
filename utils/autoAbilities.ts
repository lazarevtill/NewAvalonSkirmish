import { Card, GameState, CardStatus } from '../types';

export type AbilityAction = {
    type: 'CREATE_STACK' | 'ENTER_MODE' | 'OPEN_MODAL';
    mode?: string;
    tokenType?: string;
    count?: number;
    onlyFaceDown?: boolean;
    onlyOpponents?: boolean;
    targetOwnerId?: number;
    excludeOwnerId?: number;
    sourceCard?: Card;
    sourceCoords?: { row: number, col: number };
    payload?: any;
    isDeployAbility?: boolean;
};

export const isLine = (r1: number, c1: number, r2: number, c2: number): boolean => {
    return r1 === r2 || c1 === c2;
};

export const isAdjacent = (r1: number, c1: number, r2: number, c2: number): boolean => {
    return Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1;
};

const hasStatus = (card: Card, type: string, playerId?: number): boolean => {
    if (!card.statuses) return false;
    return card.statuses.some(s => s.type === type && (playerId === undefined || s.addedByPlayerId === playerId));
};

export const canActivateAbility = (card: Card, phaseIndex: number, activeTurnPlayerId: number | undefined): boolean => {
    if (activeTurnPlayerId !== card.ownerId) return false;
    if (card.abilityUsedInPhase === phaseIndex) return false;
    if (card.statuses?.some(s => s.type === 'Stun')) return false;

    const name = card.name.toLowerCase();
    const abilityText = card.ability ? card.ability.toLowerCase() : '';
    const isResurrected = hasStatus(card, 'Resurrected');

    // Special Rule: Resurrected units (e.g. via Immunis) or entered units can use Deploy abilities immediately (usually in Setup phase)
    if ((isResurrected || card.enteredThisTurn) && abilityText.includes('deploy:')) {
        // Strictly check if consumed
        return !card.deployAbilityConsumed;
    }

    // Phase 1 (Command 1) & 3 (Command 2) -> "Act:" abilities
    if (phaseIndex === 1 || phaseIndex === 3) {
        if (abilityText.includes('act:')) return true;
    }

    // Phase 2 (Deploy) -> "Deploy:" abilities
    if (phaseIndex === 2) {
        // Strictly check if consumed
        if (card.deployAbilityConsumed) return false;

        if (abilityText.includes('deploy:')) return true;
        // Immunis Support => Deploy
        if (name.includes('immunis')) {
            return hasStatus(card, 'Support', activeTurnPlayerId);
        }
    }
    
    // Phase 4 (Commit) -> "Commit:" abilities
    if (phaseIndex === 4) {
        if (abilityText.includes('commit:')) return true;
        // Explicit checks for cards that might rely on keywords like "Support => Commit"
        if (name.includes('censor')) return true;
        if (name.includes('walking turret')) return true;
        if (name.includes('reckless provocateur')) return true;
        if (name.includes('vigilant spotter')) return true;
        if (name.includes('threat analyst')) return true;
        if (name.includes('patrol agent')) return true;
        if (name.includes('zealous missionary')) return true;
        if (name.includes('code keeper')) return true;
        if (name.includes('signal prophet')) return true;
        if (name.includes('riot agent')) return true;
        if (name.includes('ip dept agent')) return true;
        if (name.includes('recon drone')) return true;
    }
    
    // Phase 0 (Setup) -> "Setup:" abilities
    if (phaseIndex === 0) {
        // Conditional Setup Abilities (Require Support)
        if (name.includes('centurion')) {
             return hasStatus(card, 'Support', activeTurnPlayerId);
        }
        if (name.includes('cautious avenger')) {
             return hasStatus(card, 'Support', activeTurnPlayerId);
        }
        if (name.includes('inventive maker')) {
             return hasStatus(card, 'Support', activeTurnPlayerId);
        }
        if (name.includes('devout synthetic')) {
             return hasStatus(card, 'Support', activeTurnPlayerId);
        }
        if (name.includes('unwavering integrator')) {
             return hasStatus(card, 'Support', activeTurnPlayerId);
        }

        if (abilityText.includes('setup:')) return true;
        if (name.includes('princeps')) return true;
        if (name.includes('tactical agent')) return true;
        if (name.includes('patrol agent')) return true;
        if (name.includes('recon drone')) return true;
    }

    return false;
};

export const getCardAbilityAction = (
    card: Card,
    gameState: GameState,
    localPlayerId: number | null,
    coords: { row: number, col: number }
): AbilityAction | null => {
    const name = card.name.toLowerCase();
    const phaseIndex = gameState.currentPhase;
    const ownerId = card.ownerId;
    const isResurrected = hasStatus(card, 'Resurrected');
    // Deploy abilities take precedence if card just entered play or is resurrected, OR if it's strictly Deploy phase.
    const isDeployTrigger = phaseIndex === 2 || isResurrected || card.enteredThisTurn;

    if (localPlayerId !== ownerId) return null;

    // Check strict consumption for deploy abilities
    if (isDeployTrigger && card.deployAbilityConsumed) return null;

    // --- SYNCHROTECH ---

    // IP DEPT AGENT
    if (name.includes('ip dept agent')) {
        if (isDeployTrigger) {
            return {
                type: 'ENTER_MODE',
                mode: 'SELECT_TARGET',
                sourceCard: card,
                sourceCoords: coords,
                isDeployAbility: true,
                payload: {
                    tokenType: 'Stun',
                    count: 2,
                    filter: (target: Card) => hasStatus(target, 'Exploit')
                }
            };
        }
        if (phaseIndex === 4) { // Commit
             if (!hasStatus(card, 'Support', ownerId)) return null;
             return {
                 type: 'ENTER_MODE',
                 mode: 'SELECT_TARGET',
                 sourceCard: card,
                 sourceCoords: coords,
                 payload: {
                     actionType: 'DESTROY',
                     filter: (target: Card) => target.ownerId !== ownerId && hasStatus(target, 'Revealed', localPlayerId!)
                 }
             };
        }
    }

    // TACTICAL AGENT
    if (name.includes('tactical agent')) {
        if (isDeployTrigger) {
            return {
                type: 'ENTER_MODE',
                mode: 'SELECT_TARGET',
                sourceCard: card,
                sourceCoords: coords,
                isDeployAbility: true,
                payload: {
                    tokenType: 'Aim',
                    // Target must have Threat token from THIS player (localPlayerId!)
                    filter: (target: Card) => hasStatus(target, 'Threat', localPlayerId!)
                }
            };
        }
        if (phaseIndex === 0) { // Setup
             return {
                 type: 'ENTER_MODE',
                 mode: 'SELECT_TARGET',
                 sourceCard: card,
                 sourceCoords: coords,
                 payload: {
                     actionType: 'DESTROY',
                     filter: (target: Card) => hasStatus(target, 'Aim')
                 }
             };
        }
    }

    // PATROL AGENT
    if (name.includes('patrol agent')) {
        if (phaseIndex === 0) { // Setup
            return {
                type: 'ENTER_MODE',
                mode: 'PATROL_MOVE',
                sourceCard: card,
                sourceCoords: coords,
                payload: {}
            };
        }
        if (phaseIndex === 4) { // Commit
             if (!hasStatus(card, 'Support', ownerId)) return null;
             return {
                type: 'ENTER_MODE',
                mode: 'SELECT_TARGET',
                sourceCard: card,
                sourceCoords: coords,
                payload: {
                    tokenType: 'Stun',
                    filter: (target: Card, r: number, c: number) => 
                        target.ownerId !== ownerId && 
                        isAdjacent(r, c, coords.row, coords.col) && 
                        hasStatus(target, 'Threat')
                }
            };
        }
    }

    // RIOT AGENT
    if (name.includes('riot agent')) {
        // Deploy: Push adjacent
        if (isDeployTrigger) {
             return {
                 type: 'ENTER_MODE',
                 mode: 'RIOT_PUSH',
                 sourceCard: card,
                 sourceCoords: coords,
                 isDeployAbility: true,
                 payload: {}
             };
        }
        // Support => Commit: Stun adjacent opponent with threat
        if (phaseIndex === 4) {
             if (!hasStatus(card, 'Support', ownerId)) return null;
             return {
                type: 'ENTER_MODE',
                mode: 'SELECT_TARGET',
                sourceCard: card,
                sourceCoords: coords,
                payload: {
                    tokenType: 'Stun',
                    filter: (target: Card, r: number, c: number) => 
                        target.ownerId !== ownerId && 
                        isAdjacent(r, c, coords.row, coords.col) && 
                        hasStatus(target, 'Threat')
                }
            };
        }
    }

    // THREAT ANALYST
    if (name.includes('threat analyst')) {
        if (isDeployTrigger) {
            return { type: 'CREATE_STACK', tokenType: 'Exploit', count: 1, isDeployAbility: true };
        }
        if (phaseIndex === 4) { // Commit
             if (!hasStatus(card, 'Support', ownerId)) return null;
             
             // Count total exploits owned by player
             let exploitCount = 0;
             gameState.board.forEach(row => {
                 row.forEach(cell => {
                     if (cell.card && hasStatus(cell.card, 'Exploit', localPlayerId!)) {
                         exploitCount++;
                     }
                 });
             });
             
             if (exploitCount > 0) {
                 return { type: 'CREATE_STACK', tokenType: 'Revealed', count: exploitCount };
             }
        }
    }

    // --- HOODS ---

    // RECKLESS PROVOCATEUR
    if (name.includes('reckless provocateur')) {
        if (isDeployTrigger) {
             return {
                 type: 'ENTER_MODE',
                 mode: 'SWAP_POSITIONS',
                 sourceCard: card,
                 sourceCoords: coords,
                 isDeployAbility: true,
                 payload: {
                     filter: (target: Card, r: number, c: number) => isAdjacent(r, c, coords.row, coords.col)
                 }
             };
        }
        if (phaseIndex === 4) { // Commit
             // Move all counters from an allied card to this card
             return {
                 type: 'ENTER_MODE',
                 mode: 'TRANSFER_ALL_STATUSES',
                 sourceCard: card,
                 sourceCoords: coords,
                 payload: {
                     // Ally only (Owner or Teammate), but NOT self
                     filter: (target: Card) => {
                         if (target.id === card.id) return false;
                         const targetPlayer = gameState.players.find(p => p.id === target.ownerId);
                         const localPlayer = gameState.players.find(p => p.id === ownerId);
                         const isAlly = target.ownerId === ownerId || (targetPlayer?.teamId !== undefined && localPlayer?.teamId !== undefined && targetPlayer.teamId === localPlayer.teamId);
                         return isAlly;
                     }
                 }
             };
        }
    }

    // DATA LIBERATOR
    if (name.includes('data liberator')) {
        if (isDeployTrigger) {
            return { type: 'CREATE_STACK', tokenType: 'Exploit', count: 1, isDeployAbility: true };
        }
    }

    // CAUTIOUS AVENGER
    if (name.includes('cautious avenger')) {
        if (isDeployTrigger) {
             return {
                type: 'ENTER_MODE',
                mode: 'SELECT_TARGET',
                sourceCard: card,
                sourceCoords: coords,
                isDeployAbility: true,
                payload: {
                    tokenType: 'Aim',
                    filter: (target: Card, r: number, c: number) => isLine(r, c, coords.row, coords.col)
                }
            };
        }
        if (phaseIndex === 0) { // Setup
             if (!hasStatus(card, 'Support', ownerId)) return null;
             return {
                 type: 'ENTER_MODE',
                 mode: 'SELECT_TARGET',
                 sourceCard: card,
                 sourceCoords: coords,
                 payload: {
                     actionType: 'DESTROY',
                     filter: (target: Card) => hasStatus(target, 'Aim')
                 }
             };
        }
    }

    // VIGILANT SPOTTER
    if (name.includes('vigilant spotter')) {
        if (phaseIndex === 4) { // Commit
            return {
                type: 'CREATE_STACK',
                tokenType: 'Revealed',
                count: 1,
                onlyFaceDown: true,
                targetOwnerId: undefined, // Any player
                excludeOwnerId: ownerId // Not self
            };
        }
    }

    // INVENTIVE MAKER
    if (name.includes('inventive maker')) {
        if (isDeployTrigger) {
             return {
                 type: 'ENTER_MODE',
                 mode: 'SPAWN_TOKEN',
                 sourceCard: card,
                 sourceCoords: coords,
                 isDeployAbility: true,
                 payload: { tokenName: 'Recon Drone' }
             };
        }
        if (phaseIndex === 0) { // Setup
             if (!hasStatus(card, 'Support', ownerId)) return null;
             
             return {
                 type: 'OPEN_MODAL',
                 mode: 'RETRIEVE_DEVICE',
                 sourceCard: card,
                 sourceCoords: coords,
                 payload: {}
             };
        }
    }

    // RECON DRONE
    if (name.includes('recon drone')) {
        if (phaseIndex === 0) { // Setup
            // Move to ANY empty cell
            return {
                type: 'ENTER_MODE',
                mode: 'SELECT_CELL',
                sourceCard: card,
                sourceCoords: coords,
                payload: { allowSelf: false, range: 'global' } 
            };
        }
        if (phaseIndex === 4) { // Commit
            // Reveal card in hand of adjacent OPPONENT card's owner
            return {
                type: 'ENTER_MODE',
                mode: 'REVEAL_ENEMY',
                sourceCard: card,
                sourceCoords: coords,
                payload: {
                    // Select the adjacent unit whose owner we want to reveal. Must be opponent.
                    filter: (target: Card, r: number, c: number) => 
                        isAdjacent(r, c, coords.row, coords.col) &&
                        target.ownerId !== ownerId
                }
            }
        }
    }

    // --- OPTIMATES ---

    // CENSOR
    if (name.includes('censor')) {
        // Deploy: Exploit any card
        if (isDeployTrigger) {
            return { type: 'CREATE_STACK', tokenType: 'Exploit', count: 1, isDeployAbility: true };
        }
        // Commit (Support): Swap 1 exploit for 1 stun
        if (phaseIndex === 4) {
             if (!hasStatus(card, 'Support', ownerId)) return null;

             return {
                type: 'ENTER_MODE',
                mode: 'CENSOR_SWAP',
                sourceCard: card,
                sourceCoords: coords,
                payload: {
                    filter: (target: Card) => hasStatus(target, 'Exploit', ownerId)
                }
            };
        }
    }
    
    // CENTURION (Optimates)
    if (name.includes('centurion')) {
        // Support => Setup (Phase 0)
        if (phaseIndex === 0) {
             if (hasStatus(card, 'Support', ownerId)) {
                 return {
                     type: 'ENTER_MODE',
                     mode: 'SELECT_LINE_END',
                     sourceCard: card,
                     sourceCoords: coords,
                     payload: { 
                         actionType: 'CENTURION_BUFF',
                         firstCoords: coords
                     }
                 };
             }
        }
    }
    
    // FABER (Optimates)
    if (name.includes('faber')) {
        // Deploy: Spawn Walking Turret
        if (isDeployTrigger) {
             return {
                 type: 'ENTER_MODE',
                 mode: 'SPAWN_TOKEN',
                 sourceCard: card,
                 sourceCoords: coords,
                 isDeployAbility: true,
                 payload: { tokenName: 'Walking Turret' }
             };
        }
    }
    
    // PRINCEPS (Optimates)
    if (name.includes('princeps')) {
        // Deploy: Shield self, then Aim
        if (isDeployTrigger) {
             return { 
                 type: 'ENTER_MODE', 
                 mode: 'PRINCEPS_SHIELD_THEN_AIM', 
                 sourceCard: card, 
                 sourceCoords: coords, 
                 isDeployAbility: true,
                 payload: {} 
             };
        }
        // Setup: Destroy a card with aim in a line.
        if (phaseIndex === 0) {
             return {
                 type: 'ENTER_MODE',
                 mode: 'SELECT_TARGET',
                 sourceCard: card,
                 sourceCoords: coords,
                 payload: {
                     actionType: 'DESTROY',
                     filter: (target: Card, r: number, c: number) => {
                         // Must be in same line (row or col)
                         if (!isLine(r, c, coords.row, coords.col)) return false;
                         // Must have Aim owned by this player
                         return hasStatus(target, 'Aim', ownerId);
                     }
                 }
             }
        }
    }
    
    // IMMUNIS
    if (name.includes('immunis')) {
        if (isDeployTrigger) {
            if (!hasStatus(card, 'Support', ownerId)) return null;
            
            // Check Discard Pile for Optimates Units
            const player = gameState.players.find(p => p.id === ownerId);
            const hasOptimates = player?.discard.some(c => 
                (c.types?.includes('Optimates') || c.faction === 'Optimates' || c.deck === 'Optimates') &&
                c.types?.includes('Unit')
            );
            
            return {
                type: 'OPEN_MODAL',
                mode: 'IMMUNIS_RETRIEVE',
                sourceCard: card,
                sourceCoords: coords,
                isDeployAbility: true,
                payload: {
                    filter: (r: number, c: number) => isAdjacent(r, c, coords.row, coords.col)
                }
            };
        }
    }
    
    // WALKING TURRET (Token)
    if (name.includes('walking turret')) {
        if (phaseIndex === 4) { // Commit
             if (!hasStatus(card, 'Support', ownerId)) return null;
             if (hasStatus(card, 'Shield')) return null;
             return { type: 'ENTER_MODE', mode: 'WALKING_TURRET_SHIELD', sourceCard: card, sourceCoords: coords, payload: {} };
        }
    }

    // --- FUSION ---
    
    // CODE KEEPER (Fusion)
    if (name.includes('code keeper')) {
        // Deploy: Exploit opponents with Threat (Owner's threat)
        if (isDeployTrigger) {
            return {
                type: 'ENTER_MODE',
                mode: 'SELECT_TARGET',
                sourceCard: card,
                sourceCoords: coords,
                isDeployAbility: true,
                payload: {
                    tokenType: 'Exploit',
                    filter: (target: Card) => target.ownerId !== ownerId && hasStatus(target, 'Threat', ownerId)
                }
            };
        }
        // Support => Commit: Move opponent with Exploit (Owner's exploit)
        if (phaseIndex === 4) {
             if (!hasStatus(card, 'Support', ownerId)) return null;
             return {
                 type: 'ENTER_MODE',
                 mode: 'SELECT_UNIT_FOR_MOVE',
                 sourceCard: card,
                 sourceCoords: coords,
                 payload: {
                     filter: (target: Card) => target.ownerId !== ownerId && hasStatus(target, 'Exploit', ownerId)
                 }
             };
        }
    }
    
    // DEVOUT SYNTHETIC (Fusion)
    if (name.includes('devout synthetic')) {
        // Deploy: Push adjacent (Same as Riot Agent)
        if (isDeployTrigger) {
             return {
                 type: 'ENTER_MODE',
                 mode: 'RIOT_PUSH', 
                 sourceCard: card,
                 sourceCoords: coords,
                 isDeployAbility: true,
                 payload: {}
             };
        }
        // Support => Setup: Destroy adjacent opponent with Threat OR Stun (Owner's)
        if (phaseIndex === 0) { 
             if (!hasStatus(card, 'Support', ownerId)) return null;
             return {
                 type: 'ENTER_MODE',
                 mode: 'SELECT_TARGET',
                 sourceCard: card,
                 sourceCoords: coords,
                 payload: {
                     actionType: 'DESTROY',
                     filter: (target: Card, r: number, c: number) => {
                         if (!isAdjacent(r, c, coords.row, coords.col)) return false;
                         if (target.ownerId === ownerId) return false; // Opponent only
                         return hasStatus(target, 'Threat', ownerId) || hasStatus(target, 'Stun', ownerId);
                     }
                 }
             };
        }
    }
    
    // UNWAVERING INTEGRATOR (Fusion)
    if (name.includes('unwavering integrator')) {
        if (isDeployTrigger) { // Deploy
            return { type: 'CREATE_STACK', tokenType: 'Exploit', count: 1, isDeployAbility: true };
        }
        if (phaseIndex === 0) { // Setup
             if (!hasStatus(card, 'Support', ownerId)) return null;
             return {
                 type: 'ENTER_MODE',
                 mode: 'INTEGRATOR_SCORE', // Instant effect
                 sourceCard: card,
                 sourceCoords: coords,
                 payload: {}
             };
        }
    }
    
    // SIGNAL PROPHET (Fusion)
    if (name.includes('signal prophet')) {
        // Deploy: Exploit owner's cards with Support (Owner's support)
        if (isDeployTrigger) {
             return {
                type: 'ENTER_MODE',
                mode: 'SELECT_TARGET',
                sourceCard: card,
                sourceCoords: coords,
                isDeployAbility: true,
                payload: {
                    tokenType: 'Exploit',
                    filter: (target: Card) => target.ownerId === ownerId && hasStatus(target, 'Support', ownerId)
                }
            };
        }
        // Support => Commit: Move owner's card with Exploit (Owner's exploit)
        if (phaseIndex === 4) {
             if (!hasStatus(card, 'Support', ownerId)) return null;
             return {
                 type: 'ENTER_MODE',
                 mode: 'SELECT_UNIT_FOR_MOVE',
                 sourceCard: card,
                 sourceCoords: coords,
                 payload: {
                     filter: (target: Card) => target.ownerId === ownerId && hasStatus(target, 'Exploit', ownerId)
                 }
             };
        }
    }
    
    // ZEALOUS MISSIONARY (Fusion)
    if (name.includes('zealous missionary')) {
        if (phaseIndex === 4) { // Commit
             if (!hasStatus(card, 'Support', ownerId)) return null;
             return {
                 type: 'ENTER_MODE',
                 mode: 'ZEALOUS_WEAKEN',
                 sourceCard: card,
                 sourceCoords: coords,
                 payload: {
                     filter: (target: Card) => hasStatus(target, 'Exploit', ownerId)
                 }
             };
        }
    }

    // GENERIC ABILITY PARSING
    // Check Phase 2 OR Resurrected for Deploy abilities
    if (isDeployTrigger && card.ability.toLowerCase().includes('shield 1')) {
        return { type: 'CREATE_STACK', tokenType: 'Shield', count: 1, isDeployAbility: true };
    }
    
    if ((phaseIndex === 1 || phaseIndex === 3) && card.ability.toLowerCase().includes('stun 1')) {
         return { type: 'CREATE_STACK', tokenType: 'Stun', count: 1 };
    }

    if ((phaseIndex === 1 || phaseIndex === 3) && card.ability.toLowerCase().includes('aim 1')) {
        return { type: 'CREATE_STACK', tokenType: 'Aim', count: 1 };
    }

    return null;
};