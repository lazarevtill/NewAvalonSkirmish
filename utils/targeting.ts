
import { GameState, Card } from '../types';
import { AbilityAction } from './autoAbilities';

/**
 * Validates if a specific target meets the constraints.
 */
export const validateTarget = (
    target: { card: Card; ownerId: number; location: 'hand' | 'board' },
    constraints: { 
        targetOwnerId?: number; 
        excludeOwnerId?: number; 
        onlyOpponents?: boolean; 
        onlyFaceDown?: boolean;
    },
    userPlayerId: number | null,
    players: GameState['players']
): boolean => {
    const { card, ownerId, location } = target;
    
    // 1. Target Owner (Inclusive)
    if (constraints.targetOwnerId !== undefined && constraints.targetOwnerId !== ownerId) return false;

    // 2. Excluded Owner (Exclusive)
    if (constraints.excludeOwnerId !== undefined && constraints.excludeOwnerId === ownerId) return false;

    // 3. Only Opponents
    if (constraints.onlyOpponents) {
        // Cannot be self
        if (ownerId === userPlayerId) return false;
        
        // Cannot be teammate
        const userPlayer = players.find(p => p.id === userPlayerId);
        const targetPlayer = players.find(p => p.id === ownerId);
        if (userPlayer && targetPlayer && userPlayer.teamId !== undefined && userPlayer.teamId === targetPlayer.teamId) {
            return false;
        }
    }

    // 4. Only Face Down (Strict Interpretation of user rules)
    if (constraints.onlyFaceDown) {
        // Rule 1: No 'Revealed' Token allowed (Universal)
        if (card.statuses?.some(s => s.type === 'Revealed')) return false;

        // Rule 2: If on board, must be physically face down
        if (location === 'board') {
            if (!card.isFaceDown) return false;
        }
    }

    return true;
};

/**
 * Helper to calculate valid targets for an ability action on the board.
 */
export const calculateValidTargets = (
    action: AbilityAction | null, 
    currentGameState: GameState, 
    playerId: number | null
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
              onlyFaceDown: action.onlyFaceDown
         };
         
         for(let r=0; r<gridSize; r++) {
             for(let c=0; c<gridSize; c++) {
                 const cell = board[r][c];
                 if (cell.card) { // Tokens generally apply to existing cards
                      const isValid = validateTarget(
                          { card: cell.card, ownerId: cell.card.ownerId || 0, location: 'board' },
                          constraints,
                          playerId,
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
    
    const { mode, payload, sourceCoords } = action;

    // 1. Generic TARGET selection (e.g. Stun, Exploit, Destroy)
    if (mode === 'SELECT_TARGET' && payload.filter) {
         for(let r=0; r<gridSize; r++) {
             for(let c=0; c<gridSize; c++) {
                 const cell = board[r][c];
                 if (cell.card && payload.filter(cell.card, r, c)) {
                     targets.push({row: r, col: c});
                 }
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
                 
                 // Use playerId passed to function
                 // Allow pushing stunned cards (opponents can move them)
                 if (targetCard && targetCard.ownerId !== playerId) {
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
    else if ((mode === 'SPAWN_TOKEN' || mode === 'SELECT_CELL') && sourceCoords) {
         for(let r=0; r<gridSize; r++) {
             for(let c=0; c<gridSize; c++) {
                 const isEmpty = !board[r][c].card;
                 const isAdj = Math.abs(r - sourceCoords.row) + Math.abs(c - sourceCoords.col) === 1;
                 const isSame = r === sourceCoords.row && c === sourceCoords.col;
                 
                 // For Inventive Maker Spawn (Adj)
                 if (mode === 'SPAWN_TOKEN' && isEmpty && isAdj) {
                      targets.push({row: r, col: c});
                 }
                 // For Generic Select Cell (e.g. Recon Drone move)
                 // Payload allowSelf controls "Stay"
                 if (mode === 'SELECT_CELL') {
                     if (isEmpty) targets.push({row: r, col: c});
                     if (payload.allowSelf && isSame) targets.push({row: r, col: c});
                 }
             }
         }
    }
    // 8. Reveal Enemy (Recon Drone) - Now handled by CREATE_STACK usually, but if MODE is used:
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
    // 9. Select Line (Mobilization)
    else if (mode === 'SELECT_LINE_START') {
         // Any cell
         for(let r=0; r<gridSize; r++) {
             for(let c=0; c<gridSize; c++) {
                 targets.push({row: r, col: c});
             }
         }
    }
    else if (mode === 'SELECT_LINE_END' && payload.firstCoords) {
        // Any cell in same row/col as first
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
    
    return targets;
};

/**
 * Checks if an action has ANY valid targets (Board or Hand).
 */
export const checkActionHasTargets = (action: AbilityAction, currentGameState: GameState, playerId: number | null): boolean => {
     // If modal open, valid.
     if (action.type === 'OPEN_MODAL') return true;
     if (action.type === 'CREATE_STACK') return true; // Always valid to create stack, visual feedback comes later

     // 1. Check Board Targets
     const boardTargets = calculateValidTargets(action, currentGameState, playerId);
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
