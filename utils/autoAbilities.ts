import type { Card, GameState, AbilityAction } from '../types';

// Helper functions locally if targeting.ts is not imported for these specific checks to avoid circular deps
// But ideally we use the ones from targeting or define simple ones here.
const checkLine = (r1: number, c1: number, r2: number, c2: number): boolean => {
    return r1 === r2 || c1 === c2;
};

const checkAdj = (r1: number, c1: number, r2: number, c2: number): boolean => {
    return Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1;
};

const hasStatus = (card: Card, type: string, playerId?: number): boolean => {
    if (!card.statuses) return false;
    return card.statuses.some(s => s.type === type && (playerId === undefined || s.addedByPlayerId === playerId));
};

const hasAbilityKeyword = (ability: string, keyword: string): boolean => {
    if (!ability) return false;
    return ability.toLowerCase().includes(keyword.toLowerCase());
};

/**
 * Determines if a specific card can be activated in the current state.
 */
export const canActivateAbility = (card: Card, phaseIndex: number, activeTurnPlayerId: number | undefined): boolean => {
    if (activeTurnPlayerId !== card.ownerId) return false;
    if (card.statuses?.some(s => s.type === 'Stun')) return false;

    const abilityText = card.ability || '';

    // Helper to check Support prerequisite
    const checkSupport = (text: string): boolean => {
        if (text.toLowerCase().includes('support ⇒')) {
            return hasStatus(card, 'Support', activeTurnPlayerId);
        }
        return true; 
    };

    // === 1. CHECK DEPLOY ABILITY ===
    if (!card.deployAbilityConsumed) {
        if (hasAbilityKeyword(abilityText, 'deploy:')) {
            if (hasAbilityKeyword(abilityText, 'support ⇒ deploy:')) {
                return hasStatus(card, 'Support', activeTurnPlayerId);
            }
            return true;
        }
    }

    // === 2. CHECK PHASE ABILITY ===
    if (card.abilityUsedInPhase !== phaseIndex) {
        let phaseKeyword = '';
        if (phaseIndex === 0) phaseKeyword = 'setup:';
        if (phaseIndex === 1) phaseKeyword = 'act:'; // Act usually implies Command phase, but some units might have Act:
        if (phaseIndex === 2) phaseKeyword = 'commit:';

        if (phaseKeyword && hasAbilityKeyword(abilityText, phaseKeyword)) {
             if (hasAbilityKeyword(abilityText, `support ⇒ ${phaseKeyword}`)) {
                 return hasStatus(card, 'Support', activeTurnPlayerId);
             }
             return true;
        }
    }

    // Commands are handled separately in useAppCommand via Main Phase logic
    return false;
};

export const getCardAbilityAction = (
    card: Card,
    gameState: GameState,
    localPlayerId: number | null,
    coords: { row: number, col: number }
): AbilityAction | null => {
    if (localPlayerId !== card.ownerId) return null;

    // Priority 1: Deploy (if available and not consumed)
    if (!card.deployAbilityConsumed) {
        const deployAction = getDeployAction(card, gameState, localPlayerId as number, coords);
        if (deployAction) {
            // Check support for Deploy
            const abilityText = card.ability || '';
            if (hasAbilityKeyword(abilityText, 'support ⇒ deploy:') && !hasStatus(card, 'Support', localPlayerId as number)) {
                return null;
            }
            return { ...deployAction, isDeployAbility: true };
        }
    }

    // Priority 2: Phase Ability
    if (card.abilityUsedInPhase !== gameState.currentPhase) {
        const phaseAction = getPhaseAction(card, gameState, localPlayerId as number, coords);
        if (phaseAction) {
            return phaseAction;
        }
    }

    return null;
};

// --- Internal Helper: Get Deploy Action ---
const getDeployAction = (
    card: Card,
    gameState: GameState,
    ownerId: number,
    coords: { row: number, col: number }
): AbilityAction | null => {
    const name = card.name.toLowerCase();
    
    // NOTE: Command card logic has been moved to utils/commandLogic.ts
    // Only Units remain here.

    // SYNCHROTECH
    if (name.includes('ip dept agent')) {
        return {
            type: 'CREATE_STACK',
            tokenType: 'Stun',
            count: 2,
            requiredTargetStatus: 'Exploit',
            placeAllAtOnce: true
        };
    }
    if (name.includes('tactical agent')) {
        return {
            type: 'CREATE_STACK',
            tokenType: 'Aim',
            count: 1,
            requiredTargetStatus: 'Threat'
        };
    }
    if (name.includes('riot agent')) {
        return { type: 'ENTER_MODE', mode: 'RIOT_PUSH', sourceCard: card, sourceCoords: coords, payload: {} };
    }
    if (name.includes('threat analyst')) {
        return { type: 'CREATE_STACK', tokenType: 'Exploit', count: 1 };
    }
    if (name.includes('mr. pearl')) {
        return { 
            type: 'OPEN_MODAL', 
            mode: 'SEARCH_DECK',
            sourceCard: card,
            payload: { filterType: 'Unit', actionType: 'RETRIEVE_FROM_DISCARD' }
        };
    }

    // HOODS
    if (name.includes('reckless provocateur')) {
        return {
            type: 'ENTER_MODE',
            mode: 'SWAP_POSITIONS',
            sourceCard: card,
            sourceCoords: coords,
            payload: { filter: (target: Card, r: number, c: number) => checkAdj(r, c, coords.row, coords.col) }
        };
    }
    if (name.includes('data liberator')) {
        return { type: 'CREATE_STACK', tokenType: 'Exploit', count: 1 };
    }
    if (name.includes('cautious avenger')) {
        return {
            type: 'CREATE_STACK',
            tokenType: 'Aim',
            count: 1,
            sourceCoords: coords,
            mustBeInLineWithSource: true
        };
    }
    if (name.includes('inventive maker')) {
        return { type: 'ENTER_MODE', mode: 'SPAWN_TOKEN', sourceCard: card, sourceCoords: coords, payload: { tokenName: 'Recon Drone' } };
    }

    // OPTIMATES
    if (name.includes('faber')) {
        return { type: 'ENTER_MODE', mode: 'SPAWN_TOKEN', sourceCard: card, sourceCoords: coords, payload: { tokenName: 'Walking Turret' } };
    }
    if (name.includes('censor')) {
        return { type: 'CREATE_STACK', tokenType: 'Exploit', count: 1 };
    }
    if (name.includes('princeps')) {
        return { type: 'ENTER_MODE', mode: 'PRINCEPS_SHIELD_THEN_AIM', sourceCard: card, sourceCoords: coords, payload: {} };
    }
    if (name.includes('immunis')) {
        if (hasStatus(card, 'Support', ownerId)) {
            return {
                type: 'OPEN_MODAL',
                mode: 'IMMUNIS_RETRIEVE',
                sourceCard: card,
                sourceCoords: coords,
                payload: { filter: (r: number, c: number) => checkAdj(r, c, coords.row, coords.col) }
            };
        }
    }
    if (name.includes('lucius')) {
        return { type: 'CREATE_STACK', tokenType: 'Aim', count: 1 };
    }

    // FUSION
    if (name.includes('code keeper')) {
        return {
            type: 'GLOBAL_AUTO_APPLY',
            payload: {
                tokenType: 'Exploit',
                filter: (target: Card) => target.ownerId !== ownerId && hasStatus(target, 'Threat', ownerId)
            }
        };
    }
    if (name.includes('devout synthetic')) {
        return { type: 'ENTER_MODE', mode: 'RIOT_PUSH', sourceCard: card, sourceCoords: coords, payload: {} };
    }
    if (name.includes('unwavering integrator')) {
        return { type: 'CREATE_STACK', tokenType: 'Exploit', count: 1 };
    }
    if (name.includes('signal prophet')) {
        return {
            type: 'GLOBAL_AUTO_APPLY',
            payload: {
                tokenType: 'Exploit',
                filter: (target: Card) => target.ownerId === ownerId && hasStatus(target, 'Support', ownerId)
            }
        };
    }
    if (name.includes('zealous missionary')) {
        return { type: 'CREATE_STACK', tokenType: 'Exploit', count: 1 };
    }

    // NEUTRAL / HEROES
    if (name.includes('abr "gawain"') || name.includes('autonomous battle robot')) {
         return {
            type: 'ENTER_MODE',
            mode: 'ABR_DEPLOY_SHIELD_AIM',
            sourceCard: card,
            sourceCoords: coords,
            payload: {} // Logic moved to Hook
         };
    }
    if (name.includes('reclaimed "gawain"')) {
        return { type: 'ENTER_MODE', mode: 'SHIELD_SELF_THEN_RIOT_PUSH', sourceCard: card, sourceCoords: coords, payload: {} };
    }
    if (name.includes('michael falk')) {
        return {
            type: 'OPEN_MODAL',
            mode: 'SEARCH_DECK',
            sourceCard: card,
            payload: { filterType: 'Any' }
        };
    }
    if (name.includes('edith byron')) {
        return {
            type: 'ENTER_MODE',
            mode: 'SHIELD_SELF_THEN_SPAWN',
            sourceCard: card,
            sourceCoords: coords,
            payload: { tokenName: 'Recon Drone' }
        };
    }
    if (name.includes('pinkunoneko')) {
        return {
            type: 'CREATE_STACK',
            tokenType: 'Stun',
            count: 1,
            onlyOpponents: true,
            mustBeAdjacentToSource: true,
            sourceCoords: coords
        };
    }
    if (name.includes('maria "eleftheria"')) {
        return { type: 'CREATE_STACK', tokenType: 'Aim', count: 1 };
    }
    if (name.includes('zius')) {
        return { type: 'CREATE_STACK', tokenType: 'Exploit', count: 1 };
    }
    if (name.includes('secret informant')) {
        return {
            type: 'ENTER_MODE',
            mode: 'SELECT_DECK',
            sourceCard: card,
            sourceCoords: coords,
            payload: {}
        };
    }

    // Generic fallback for any unit
    if (card.ability.toLowerCase().includes('deploy:')) {
         if (card.ability.toLowerCase().includes('shield 1')) {
             return { 
                 type: 'GLOBAL_AUTO_APPLY', 
                 payload: { 
                     tokenType: 'Shield',
                     filter: (target: Card) => target.id === card.id 
                 }
             };
         }
         if (card.ability.toLowerCase().includes('stun 1')) return { type: 'CREATE_STACK', tokenType: 'Stun', count: 1 };
         if (card.ability.toLowerCase().includes('aim 1')) return { type: 'CREATE_STACK', tokenType: 'Aim', count: 1 };
    }

    return null;
};

// --- Internal Helper: Get Phase Action ---
const getPhaseAction = (
    card: Card,
    gameState: GameState,
    ownerId: number,
    coords: { row: number, col: number }
): AbilityAction | null => {
    const name = card.name.toLowerCase();
    const phaseIndex = gameState.currentPhase;
    const hasSup = hasStatus(card, 'Support', ownerId);

    // PHASE 0: SETUP
    if (phaseIndex === 0) {
        if (name.includes('tactical agent')) {
            return {
                type: 'ENTER_MODE',
                mode: 'SELECT_TARGET',
                sourceCard: card,
                sourceCoords: coords,
                payload: { actionType: 'DESTROY', filter: (target: Card) => hasStatus(target, 'Aim') }
            };
        }
        if (name.includes('patrol agent')) {
            return { type: 'ENTER_MODE', mode: 'PATROL_MOVE', sourceCard: card, sourceCoords: coords, payload: {} };
        }
        if (name.includes('cautious avenger')) {
            if (!hasSup) return null;
            return {
                type: 'ENTER_MODE',
                mode: 'SELECT_TARGET',
                sourceCard: card,
                sourceCoords: coords,
                payload: { actionType: 'DESTROY', filter: (target: Card) => hasStatus(target, 'Aim') }
            };
        }
        if (name.includes('inventive maker')) {
            if (!hasSup) return null;
            return { type: 'OPEN_MODAL', mode: 'RETRIEVE_DEVICE', sourceCard: card, sourceCoords: coords, payload: {} };
        }
        if (name.includes('abr "gawain"') || name.includes('autonomous battle robot')) {
            return {
                type: 'ENTER_MODE',
                mode: 'SELECT_TARGET',
                sourceCard: card,
                sourceCoords: coords,
                payload: {
                    actionType: 'DESTROY',
                    filter: (target: Card, r: number, c: number) => checkLine(r, c, coords.row, coords.col) && hasStatus(target, 'Aim')
                }
            };
        }
        if (name.includes('princeps')) {
            return {
                type: 'ENTER_MODE',
                mode: 'SELECT_TARGET',
                sourceCard: card,
                sourceCoords: coords,
                payload: {
                    actionType: 'DESTROY',
                    filter: (target: Card, r: number, c: number) => checkLine(r, c, coords.row, coords.col) && hasStatus(target, 'Aim', ownerId)
                }
            };
        }
        if (name.includes('centurion')) {
            if (!hasSup) return null;
            return {
                type: 'ENTER_MODE',
                mode: 'SELECT_LINE_END',
                sourceCard: card,
                sourceCoords: coords,
                payload: { actionType: 'CENTURION_BUFF', firstCoords: coords }
            };
        }
        if (name.includes('devout synthetic')) {
            return {
                type: 'ENTER_MODE',
                mode: 'SELECT_TARGET',
                sourceCard: card,
                sourceCoords: coords,
                payload: {
                    actionType: 'DESTROY',
                    filter: (target: Card, r: number, c: number) => 
                        checkAdj(r, c, coords.row, coords.col) && 
                        target.ownerId !== ownerId && 
                        (hasStatus(target, 'Threat', ownerId) || hasStatus(target, 'Stun', ownerId))
                }
            };
        }
        if (name.includes('unwavering integrator')) {
            if (!hasSup) return null;
            return { type: 'ENTER_MODE', mode: 'INTEGRATOR_LINE_SELECT', sourceCard: card, sourceCoords: coords, payload: {} };
        }
        if (name.includes('recon drone')) {
            return { type: 'ENTER_MODE', mode: 'SELECT_CELL', sourceCard: card, sourceCoords: coords, payload: { allowSelf: false, range: 'global' } };
        }

        // Neutral Setup Abilities
        if (name.includes('reclaimed "gawain"')) {
            return {
                type: 'ENTER_MODE',
                mode: 'SELECT_TARGET',
                sourceCard: card,
                sourceCoords: coords,
                payload: {
                    actionType: 'DESTROY',
                    filter: (target: Card, r: number, c: number) => 
                        checkAdj(r, c, coords.row, coords.col) && 
                        target.ownerId !== ownerId && 
                        (hasStatus(target, 'Threat', ownerId) || hasStatus(target, 'Stun', ownerId))
                }
            };
        }
        if (name.includes('edith byron')) {
            return { type: 'ENTER_MODE', mode: 'PATROL_MOVE', sourceCard: card, sourceCoords: coords, payload: {} };
        }
        if (name.includes('pinkunoneko')) {
            return {
                type: 'ENTER_MODE',
                mode: 'SELECT_TARGET',
                sourceCard: card,
                sourceCoords: coords,
                payload: {
                    actionType: 'DESTROY',
                    filter: (target: Card, r: number, c: number) => 
                        checkAdj(r, c, coords.row, coords.col) && 
                        (hasStatus(target, 'Threat', ownerId) || hasStatus(target, 'Stun', ownerId)),
                    chainedAction: {
                        type: 'ENTER_MODE',
                        mode: 'SELECT_CELL',
                        payload: { range: 1, allowSelf: true }
                    }
                }
            };
        }
        if (name.includes('maria "eleftheria"')) {
            return {
                type: 'ENTER_MODE',
                mode: 'SELECT_TARGET',
                sourceCard: card,
                sourceCoords: coords,
                payload: { actionType: 'DESTROY', filter: (target: Card) => hasStatus(target, 'Aim') }
            };
        }
        if (name.includes('zius')) {
            if (!hasSup) return null;
            return {
                type: 'CREATE_STACK',
                tokenType: 'Exploit',
                count: 1,
                sourceCard: card,
                sourceCoords: coords,
                chainedAction: {
                    type: 'ENTER_MODE',
                    mode: 'SELECT_LINE_END',
                    sourceCard: card,
                    sourceCoords: coords,
                    payload: {
                        actionType: 'ZIUS_SCORING',
                        firstCoords: coords 
                    }
                }
            };
        }
        if (name.includes('reverend')) {
            return { type: 'CREATE_STACK', tokenType: 'Exploit', count: 1, sourceCard: card, sourceCoords: coords };
        }
        if (name.includes('finn')) {
            return {
                type: 'ENTER_MODE',
                mode: 'SELECT_UNIT_FOR_MOVE',
                sourceCard: card,
                sourceCoords: coords,
                payload: {
                    range: 2,
                    filter: (target: Card) => target.ownerId === ownerId
                }
            };
        }
        if (name.includes('lucius')) {
            return {
                type: 'ENTER_MODE',
                mode: 'SELECT_TARGET',
                sourceCard: card,
                sourceCoords: coords,
                payload: {
                    actionType: 'DESTROY',
                    filter: (target: Card, r: number, c: number) => checkLine(r, c, coords.row, coords.col) && hasStatus(target, 'Aim')
                }
            };
        }
    }

    // PHASE 2: COMMIT
    if (phaseIndex === 2) {
        if (name.includes('ip dept agent')) {
            if (!hasSup) return null;
            return {
                type: 'ENTER_MODE',
                mode: 'SELECT_TARGET',
                sourceCard: card,
                sourceCoords: coords,
                payload: { actionType: 'DESTROY', filter: (target: Card) => target.ownerId !== ownerId && hasStatus(target, 'Revealed', ownerId) }
            };
        }
        if (name.includes('patrol agent') || name.includes('riot agent')) {
            return {
                type: 'CREATE_STACK',
                tokenType: 'Stun',
                count: 1,
                requiredTargetStatus: 'Threat',
                onlyOpponents: true,
                mustBeAdjacentToSource: true,
                sourceCoords: coords
            };
        }
        if (name.includes('threat analyst')) {
            if (!hasSup) return null;
            let totalExploits = 0;
            gameState.board.forEach(row => {
                row.forEach(cell => {
                    if (cell.card && cell.card.statuses) {
                        totalExploits += cell.card.statuses.filter(s => s.type === 'Exploit' && s.addedByPlayerId === ownerId).length;
                    }
                });
            });
            if (totalExploits === 0) return null; 
            return { type: 'CREATE_STACK', tokenType: 'Revealed', count: totalExploits }; 
        }
        if (name.includes('reckless provocateur')) {
            return {
                type: 'ENTER_MODE',
                mode: 'TRANSFER_ALL_STATUSES',
                sourceCard: card,
                sourceCoords: coords,
                payload: {
                    filter: (target: Card) => {
                        if (target.id === card.id) return false;
                        return target.ownerId === ownerId; 
                    }
                }
            };
        }
        if (name.includes('vigilant spotter')) {
            return { type: 'CREATE_STACK', tokenType: 'Revealed', count: 1, onlyFaceDown: true, excludeOwnerId: ownerId };
        }
        if (name.includes('recon drone')) {
            return {
                type: 'ENTER_MODE',
                mode: 'REVEAL_ENEMY',
                sourceCard: card,
                sourceCoords: coords,
                payload: { filter: (target: Card, r: number, c: number) => checkAdj(r, c, coords.row, coords.col) && target.ownerId !== ownerId }
            };
        }
        if (name.includes('censor')) {
            if (!hasSup) return null;
            return { type: 'ENTER_MODE', mode: 'CENSOR_SWAP', sourceCard: card, sourceCoords: coords, payload: { filter: (target: Card) => hasStatus(target, 'Exploit', ownerId) } };
        }
        if (name.includes('walking turret')) {
            if (!hasSup) return null;
            if (hasStatus(card, 'Shield')) return null;
            return { 
                type: 'GLOBAL_AUTO_APPLY', 
                payload: { 
                    tokenType: 'Shield',
                    filter: (target: Card) => target.id === card.id
                }
            };
        }
        if (name.includes('code keeper')) {
            if (!hasSup) return null;
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
        if (name.includes('signal prophet')) {
            if (!hasSup) return null;
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
        if (name.includes('zealous missionary')) {
            if (!hasSup) return null;
            return { type: 'ENTER_MODE', mode: 'ZEALOUS_WEAKEN', sourceCard: card, sourceCoords: coords, payload: { filter: (target: Card) => hasStatus(target, 'Exploit', ownerId) } };
        }
        
        if (name.includes('michael falk')) {
            return { type: 'CREATE_STACK', tokenType: 'Revealed', count: 1, onlyFaceDown: true, excludeOwnerId: ownerId };
        }
        if (name.includes('finn')) {
            // Commit: Gain 1 point for each revealed card in opponents' hands.
            return { type: 'GLOBAL_AUTO_APPLY', payload: { customAction: 'FINN_SCORING' }, sourceCard: card, sourceCoords: coords };
        }
    }

    return null;
};