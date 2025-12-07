import { GameState, Card, CommandContext, AbilityAction } from '../types';

/**
 * Validates if a specific target meets the constraints.
 */
export const validateTarget = (
    target: { card: Card; ownerId: number; location: 'hand' | 'board'; boardCoords?: { row: number, col: number } },
    constraints: { 
        targetOwnerId?: number; 
        excludeOwnerId?: number; 
        onlyOpponents?: boolean; 
        onlyFaceDown?: boolean;
        targetType?: string;
        requiredTargetStatus?: string;
        requireStatusFromSourceOwner?: boolean;
        mustBeAdjacentToSource?: boolean;
        mustBeInLineWithSource?: boolean;
        sourceCoords?: { row: number, col: number };
        tokenType?: string; // Passed to check for uniqueness
    },
    userPlayerId: number | null,
    players: GameState['players']
): boolean => {
    const { card, ownerId, location } = target;
    
    // 1. Target Owner (Inclusive)
    if (constraints.targetOwnerId !== undefined && constraints.targetOwnerId !== -1 && constraints.targetOwnerId !== -2 && constraints.targetOwnerId !== ownerId) return false;

    // 2. Excluded Owner (Exclusive)
    if (constraints.excludeOwnerId !== undefined && constraints.excludeOwnerId === ownerId) return false;

    // 3. Only Opponents
    // -1 in targetOwnerId also implies Only Opponents
    if (constraints.onlyOpponents || constraints.targetOwnerId === -1) {
        // Cannot be self
        if (ownerId === userPlayerId) return false;
        
        // Cannot be teammate
        const userPlayer = players.find(p => p.id === userPlayerId);
        const targetPlayer = players.find(p => p.id === ownerId);
        if (userPlayer && targetPlayer && userPlayer.teamId !== undefined && userPlayer.teamId === targetPlayer.teamId) {
            return false;
        }
    }

    // 4. Target Type
    if (constraints.targetType) {
        if (!card.types?.includes(constraints.targetType)) return false;
    }

    // 5. Only Face Down (Strict Interpretation of user rules)
    if (constraints.onlyFaceDown) {
        // Rule 1: No 'Revealed' Token allowed FROM THIS PLAYER (Universal)
        if (card.statuses?.some(s => s.type === 'Revealed' && s.addedByPlayerId === userPlayerId)) return false;

        // Rule 2: If on board, must be physically face down OR revealed only to others
        if (location === 'board') {
            if (!card.isFaceDown) return false;
        }
    }
    
    // 5.1 Unique Token Check (If adding 'Revealed', target must not already have 'Revealed' from this player)
    if (constraints.tokenType === 'Revealed') {
        if (card.statuses?.some(s => s.type === 'Revealed' && s.addedByPlayerId === userPlayerId)) {
            return false;
        }
    }

    // 6. Required Status
    if (constraints.requiredTargetStatus) {
        if (!card.statuses?.some(s => s.type === constraints.requiredTargetStatus)) return false;
        
        // 6.1 Check if specific status was added by source owner (Actor)
        if (constraints.requireStatusFromSourceOwner && userPlayerId !== null) {
            const hasStatusFromActor = card.statuses?.some(s => s.type === constraints.requiredTargetStatus && s.addedByPlayerId === userPlayerId);
            if (!hasStatusFromActor) return false;
        }
    }

    // 7. Adjacency
    if (constraints.mustBeAdjacentToSource && constraints.sourceCoords && target.boardCoords) {
         const { row: r1, col: c1 } = constraints.sourceCoords;
         const { row: r2, col: c2 } = target.boardCoords;
         if (Math.abs(r1 - r2) + Math.abs(c1 - c2) !== 1) return false;
    }

    // 8. Line Check
    if (constraints.mustBeInLineWithSource && constraints.sourceCoords && target.boardCoords) {
         const { row: r1, col: c1 } = constraints.sourceCoords;
         const { row: r2, col: c2 } = target.boardCoords;
         if (r1 !== r2 && c1 !== c2) return false;
    }

    return true;
};

/**
 * Helper to calculate valid targets for an ability action on the board.
 */
export const calculateValidTargets = (
    action: AbilityAction | null, 
    currentGameState: GameState, 
    actorId: number | null, // Renamed from playerId to clarify intent (source card owner)
    commandContext?: CommandContext
): {row: number, col: number}[] => {
    if (!action || (action.type !== 'ENTER_MODE' && action.type !== 'CREATE_STACK')) {
        return [];
    }

    const targets: {row: number, col: number}[] = [];
    const board = currentGameState.board;
    const gridSize = board.length;
    
    // If action is CREATE_STACK, iterate entire board and check validity
    if (action.type === 'CREATE_STACK') {
         const constraints = {
              targetOwnerId: action.targetOwnerId,
              excludeOwnerId: action.excludeOwnerId,
              onlyOpponents: action.onlyOpponents,
              onlyFaceDown: action.onlyFaceDown,
              targetType: action.targetType,
              requiredTargetStatus: action.requiredTargetStatus,
              requireStatusFromSourceOwner: action.requireStatusFromSourceOwner,
              mustBeAdjacentToSource: action.mustBeAdjacentToSource,
              mustBeInLineWithSource: action.mustBeInLineWithSource,
              sourceCoords: action.sourceCoords,
              tokenType: action.tokenType
         };
         
         for(let r=0; r<gridSize; r++) {
             for(let c=0; c<gridSize; c++) {
                 const cell = board[r][c];
                 if (cell.card) { // Tokens generally apply to existing cards
                      const isValid = validateTarget(
                          { card: cell.card, ownerId: cell.card.ownerId || 0, location: 'board', boardCoords: { row: r, col: c } },
                          constraints,
                          actorId,
                          currentGameState.players
                      );
                      if (isValid) {
                          targets.push({row: r, col: c});
                      }
                 }
             }
         }
         return targets;
    }
    
    const { mode, payload, sourceCoords, contextCheck } = action;

    // 1. Generic TARGET selection
    if ((mode === 'SELECT_TARGET' || mode === 'CENSOR_SWAP' || mode === 'ZEALOUS_WEAKEN' || mode === 'CENTURION_BUFF' || mode === 'SELECT_UNIT_FOR_MOVE') && payload.filter) {
         for(let r=0; r<gridSize; r++) {
             for(let c=0; c<gridSize; c++) {
                 const cell = board[r][c];
                 
                 // Check basic filter
                 let isValid = cell.card && payload.filter(cell.card, r, c);
                 
                 // Check context requirements (e.g. Adjacent to last move)
                 if (isValid && contextCheck === 'ADJACENT_TO_LAST_MOVE' && commandContext?.lastMovedCardCoords) {
                     const { row: lr, col: lc } = commandContext.lastMovedCardCoords;
                     const isAdj = Math.abs(r - lr) + Math.abs(c - lc) === 1;
                     if (!isAdj) isValid = false;
                 }

                 if (isValid) {
                     targets.push({row: r, col: c});
                 }
             }
         }
    }
    // 1.1 Enhanced Interrogation Generic Targeting (Any Unit)
    else if (mode === 'SELECT_TARGET' && (payload.actionType === 'ENHANCED_INT_REVEAL' || payload.actionType === 'ENHANCED_INT_MOVE')) {
        for(let r=0; r<gridSize; r++) {
             for(let c=0; c<gridSize; c++) {
                 const cell = board[r][c];
                 if (cell.card) targets.push({row: r, col: c});
             }
        }
    }
    // 2. Patrol Move (Empty cell in same row/col)
    else if (mode === 'PATROL_MOVE' && sourceCoords) {
        for(let r=0; r<gridSize; r++) {
            for(let c=0; c<gridSize; c++) {
                // Must be same row OR same col
                const isLine = (r === sourceCoords.row || c === sourceCoords.col);
                const isSame = (r === sourceCoords.row && c === sourceCoords.col);
                const isEmpty = !board[r][c].card;
                
                // Allow moving to empty cell OR cancelling by clicking same cell
                if (isLine && (isEmpty || isSame)) {
                    targets.push({row: r, col: c});
                }
            }
        }
    }
    // 3. Riot Push (Adjacent opponent who can be pushed into empty space)
    else if (mode === 'RIOT_PUSH' && sourceCoords) {
        const neighbors = [
            {r: sourceCoords.row - 1, c: sourceCoords.col},
            {r: sourceCoords.row + 1, c: sourceCoords.col},
            {r: sourceCoords.row, c: sourceCoords.col - 1},
            {r: sourceCoords.row, c: sourceCoords.col + 1},
        ];
        
        neighbors.forEach(nb => {
            // Check bounds
            if (nb.r >= 0 && nb.r < gridSize && nb.c >= 0 && nb.c < gridSize) {
                 const targetCard = board[nb.r][nb.c].card;
                 
                 // Check if opponent (Not Self AND Not Teammate)
                 if (targetCard && targetCard.ownerId !== actorId) {
                     const actorPlayer = currentGameState.players.find(p => p.id === actorId);
                     const targetPlayer = currentGameState.players.find(p => p.id === targetCard.ownerId);
                     const isTeammate = actorPlayer?.teamId !== undefined && targetPlayer?.teamId !== undefined && actorPlayer.teamId === targetPlayer.teamId;
                     
                     if (!isTeammate) {
                         // Calculate push destination
                         const dRow = nb.r - sourceCoords.row;
                         const dCol = nb.c - sourceCoords.col;
                         const pushRow = nb.r + dRow;
                         const pushCol = nb.c + dCol;
                         
                         // Check dest bounds and emptiness
                         if (pushRow >= 0 && pushRow < gridSize && pushCol >= 0 && pushCol < gridSize) {
                             if (!board[pushRow][pushCol].card) {
                                 targets.push({row: nb.r, col: nb.c});
                             }
                         }
                     }
                 }
            }
        });
    }
    // 4. Riot Move (Specifically the vacated cell)
    else if (mode === 'RIOT_MOVE' && payload.vacatedCoords) {
        targets.push(payload.vacatedCoords);
        // Also highlight self to indicate "stay" option
        if(sourceCoords) targets.push(sourceCoords);
    }
    // 5. Swap Positions (Reckless Provocateur)
    else if (mode === 'SWAP_POSITIONS' && payload.filter) {
        for(let r=0; r<gridSize; r++) {
             for(let c=0; c<gridSize; c++) {
                 const cell = board[r][c];
                 if (cell.card && payload.filter(cell.card, r, c)) {
                     targets.push({row: r, col: c});
                 }
             }
         }
    }
    // 6. Transfer Status (Reckless Provocateur Commit)
    // Update to handle both single and ALL transfers
    else if ((mode === 'TRANSFER_STATUS_SELECT' || mode === 'TRANSFER_ALL_STATUSES') && payload.filter) {
        for(let r=0; r<gridSize; r++) {
             for(let c=0; c<gridSize; c++) {
                 const cell = board[r][c];
                 if (cell.card && payload.filter(cell.card, r, c)) {
                     targets.push({row: r, col: c});
                 }
             }
         }
    }
    // 7. Spawn Token / Select Cell
    else if ((mode === 'SPAWN_TOKEN' || mode === 'SELECT_CELL' || mode === 'IMMUNIS_RETRIEVE')) {
         // Note: IMMUNIS_RETRIEVE behaves like select cell when picking the destination
         for(let r=0; r<gridSize; r++) {
             for(let c=0; c<gridSize; c++) {
                 const isEmpty = !board[r][c].card;
                 
                 // If Immunis logic, we check filter (adjacency)
                 if (mode === 'IMMUNIS_RETRIEVE' && payload.filter) {
                     if (isEmpty && payload.filter(r, c)) {
                         targets.push({row: r, col: c});
                     }
                     continue;
                 }

                 // For Generic Select Cell (e.g. Recon Drone move, Fusion moves)
                 // Payload allowSelf controls "Stay"
                 if (mode === 'SELECT_CELL') {
                     // Check Move From Hand first
                     if (payload.moveFromHand) {
                         if (isEmpty) targets.push({row: r, col: c});
                         continue;
                     }

                     if (!sourceCoords) continue;

                     const isSame = r === sourceCoords.row && c === sourceCoords.col;
                     const isGlobal = payload.range === 'global';
                     
                     let isValidLoc = false;
                     
                     if (isGlobal) isValidLoc = true;
                     else if (payload.range === 'line') isValidLoc = r === sourceCoords.row || c === sourceCoords.col;
                     else if (payload.range === 2) {
                         // Range 2: 1 or 2 cells away.
                         const dRow = Math.abs(r - sourceCoords.row);
                         const dCol = Math.abs(c - sourceCoords.col);
                         const dist = dRow + dCol;

                         if (dist === 1) isValidLoc = true;
                         else if (dist === 2) {
                             // Logic for 2 cells: must be reachable via an empty cell (or straight line 2).
                             // BFS Depth 2 check.
                             // Candidates for intermediate step:
                             const inters = [];
                             if (dRow === 2 && dCol === 0) inters.push({r: (r + sourceCoords.row)/2, c: c}); // Straight vertical
                             else if (dRow === 0 && dCol === 2) inters.push({r: r, c: (c + sourceCoords.col)/2}); // Straight horizontal
                             else if (dRow === 1 && dCol === 1) { // Diagonal (L-shape)
                                 inters.push({r: r, c: sourceCoords.col});
                                 inters.push({r: sourceCoords.row, c: c});
                             }

                             // If ANY intermediate cell is empty, move is valid.
                             // BOUNDS CHECK to prevent crash
                             isValidLoc = inters.some(i => {
                                 if (i.r < 0 || i.r >= gridSize || i.c < 0 || i.c >= gridSize) return false;
                                 return !board[i.r][i.c].card;
                             });
                         }
                     } else {
                         // Default to Adjacent
                         isValidLoc = Math.abs(r - sourceCoords.row) + Math.abs(c - sourceCoords.col) === 1;
                     }

                     if (isEmpty && isValidLoc) targets.push({row: r, col: c});
                     
                     if (payload.allowSelf && isSame) targets.push({row: r, col: c});
                 } else if (mode === 'SPAWN_TOKEN' && sourceCoords) {
                     // For Inventive Maker Spawn (Adj)
                     const isAdj = Math.abs(r - sourceCoords.row) + Math.abs(c - sourceCoords.col) === 1;
                     if (isEmpty && isAdj) {
                          targets.push({row: r, col: c});
                     }
                 }
             }
         }
    }
    // 8. Reveal Enemy (Recon Drone)
    else if (mode === 'REVEAL_ENEMY' && payload.filter) {
        for(let r=0; r<gridSize; r++) {
             for(let c=0; c<gridSize; c++) {
                 const cell = board[r][c];
                 if (cell.card && payload.filter(cell.card, r, c)) {
                     targets.push({row: r, col: c});
                 }
             }
         }
    }
    // 9. Select Line Start (Any cell)
    else if (mode === 'SELECT_LINE_START') {
         for(let r=0; r<gridSize; r++) {
             for(let c=0; c<gridSize; c++) {
                 targets.push({row: r, col: c});
             }
         }
    }
    // 10. Select Line End (Cells in same row/col)
    else if (mode === 'SELECT_LINE_END' && payload.firstCoords) {
         for(let r=0; r<gridSize; r++) {
             for(let c=0; c<gridSize; c++) {
                 const isRow = r === payload.firstCoords.row;
                 const isCol = c === payload.firstCoords.col;
                 if (isRow || isCol) {
                     targets.push({row: r, col: c});
                 }
             }
         }
    }
    // 11. Integrator Line Select (Cells in same row/col as source)
    else if (mode === 'INTEGRATOR_LINE_SELECT' && sourceCoords) {
         for(let r=0; r<gridSize; r++) {
             for(let c=0; c<gridSize; c++) {
                 const isRow = r === sourceCoords.row;
                 const isCol = c === sourceCoords.col;
                 if (isRow || isCol) {
                     targets.push({row: r, col: c});
                 }
             }
         }
    }
    // 12. Select Diagonal
    else if (mode === 'SELECT_DIAGONAL') {
        if (!payload.firstCoords) {
            // Step 1: Can start anywhere
            for(let r=0; r<gridSize; r++) {
                for(let c=0; c<gridSize; c++) {
                    targets.push({row: r, col: c});
                }
            }
        } else {
            // Step 2: Highlight only diagonals from firstCoords
            const { row: r1, col: c1 } = payload.firstCoords;
            for(let r=0; r<gridSize; r++) {
                for(let c=0; c<gridSize; c++) {
                    if (Math.abs(r - r1) === Math.abs(c - c1)) {
                        targets.push({row: r, col: c});
                    }
                }
            }
        }
    }
    
    return targets;
};

/**
 * Checks if an action has ANY valid targets (Board or Hand).
 */
export const checkActionHasTargets = (action: AbilityAction, currentGameState: GameState, playerId: number | null, commandContext?: CommandContext): boolean => {
     // If modal open, valid.
     if (action.type === 'OPEN_MODAL') return true;
     
     // Special Case: Select Deck has global targets (all decks)
     if (action.mode === 'SELECT_DECK') return true;

     // Special Case: Compound abilities that start with an immediate self-effect are always valid.
     // Even if there are no targets for the secondary part (e.g., Aim), the first part (Shield) still happens.
     if (action.mode === 'PRINCEPS_SHIELD_THEN_AIM' || 
         action.mode === 'SHIELD_SELF_THEN_SPAWN' || 
         action.mode === 'SHIELD_SELF_THEN_RIOT_PUSH' || 
         action.mode === 'ABR_DEPLOY_SHIELD_AIM') {
         return true;
     }
     
     // Note: CREATE_STACK is now checked via calculateValidTargets as well
     if (action.type === 'CREATE_STACK') {
         const boardTargets = calculateValidTargets(action, currentGameState, playerId, commandContext);
         
         if (boardTargets.length > 0) return true;
         
         // Check Hand targets if stack type is compatible
         // Check if 'Revealed' or simple buffs/debuffs
         if (action.tokenType === 'Revealed' || action.tokenType?.startsWith('Power')) {
             // We need to check if ANY hand card is valid
             for (const p of currentGameState.players) {
                 for (let i = 0; i < p.hand.length; i++) {
                     const constraints = {
                          targetOwnerId: action.targetOwnerId,
                          excludeOwnerId: action.excludeOwnerId,
                          onlyOpponents: action.onlyOpponents,
                          onlyFaceDown: action.onlyFaceDown,
                          targetType: action.targetType,
                          tokenType: action.tokenType
                     };
                     const isValid = validateTarget(
                         { card: p.hand[i], ownerId: p.id, location: 'hand' },
                         constraints,
                         playerId,
                         currentGameState.players
                     );
                     if (isValid) return true;
                 }
             }
         }
         
         return false; 
     }

     // 1. Check Board Targets
     const boardTargets = calculateValidTargets(action, currentGameState, playerId, commandContext);
     if (boardTargets.length > 0) return true;

     // 2. Check Hand Targets (For 'DESTROY' actions targeting Revealed cards)
     if (action.mode === 'SELECT_TARGET' && action.payload?.filter) {
         // Iterate all players hands
         for (const p of currentGameState.players) {
             if (p.hand.some((card) => action.payload.filter!(card))) {
                 return true;
             }
         }
     }
     
     return false;
};