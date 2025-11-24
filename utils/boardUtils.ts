
import { Board, GameState } from '../types';

const GRID_MAX_SIZE = 7;

/**
 * Creates an empty game board of the maximum possible size.
 * @returns {Board} An empty board.
 */
export const createInitialBoard = (): Board =>
  Array(GRID_MAX_SIZE).fill(null).map(() => Array(GRID_MAX_SIZE).fill({ card: null }));

/**
 * Recalculates "Support" and "Threat" statuses for all cards on the board.
 * This function is computationally intensive and should be called only when the board changes.
 * @param {GameState} gameState The entire current game state.
 * @returns {Board} A new board object with updated statuses.
 */
export const recalculateBoardStatuses = (gameState: GameState): Board => {
    const { board, activeGridSize, players } = gameState;
    const newBoard = JSON.parse(JSON.stringify(board));
    const GRID_SIZE = newBoard.length;
    const offset = Math.floor((GRID_SIZE - activeGridSize) / 2);

    const playerTeamMap = new Map<number, number | undefined>();
    players.forEach(p => playerTeamMap.set(p.id, p.teamId));

    // First, clear all automatic statuses from every card.
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            const card = newBoard[r][c].card;
            if (card && card.statuses) {
                card.statuses = card.statuses.filter((s: {type: string}) => s.type !== 'Support' && s.type !== 'Threat');
            }
        }
    }

    // Then, re-apply statuses based on current positions.
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            const card = newBoard[r][c].card;
            if (!card || card.ownerId === undefined || card.isFaceDown) continue;

            const ownerId = card.ownerId;
            const ownerTeamId = playerTeamMap.get(ownerId);
            
            const neighborsPos = [
                { r: r - 1, c: c }, { r: r + 1, c: c },
                { r: r, c: c - 1 }, { r: r, c: c + 1 },
            ];

            const enemyNeighborsByPlayer: { [key: number]: { r: number, c: number }[] } = {};
            let hasFriendlyNeighbor = false;

            // Check all adjacent cells.
            for (const pos of neighborsPos) {
                const { r: nr, c: nc } = pos;
                if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE) {
                    const neighborCard = newBoard[nr][nc].card;
                    if (neighborCard && neighborCard.ownerId !== undefined && !neighborCard.isFaceDown) {
                        const neighborOwnerId = neighborCard.ownerId;
                        const neighborTeamId = playerTeamMap.get(neighborOwnerId);

                        // A neighbor is friendly if they are the same player, or if they are on the same team (and teams exist).
                        // If teams are undefined, ownerTeamId !== undefined checks ensure we fall back to simple ID comparison.
                        const isFriendly = ownerId === neighborOwnerId || (ownerTeamId !== undefined && ownerTeamId === neighborTeamId);

                        if (isFriendly) {
                            hasFriendlyNeighbor = true;
                        } else {
                            if (!enemyNeighborsByPlayer[neighborOwnerId]) {
                                enemyNeighborsByPlayer[neighborOwnerId] = [];
                            }
                            enemyNeighborsByPlayer[neighborOwnerId].push({ r: nr, c: nc });
                        }
                    }
                }
            }

            // Apply "Support" Status if a friendly neighbor exists.
            if (hasFriendlyNeighbor) {
                if (!card.statuses) card.statuses = [];
                if (!card.statuses.some((s: {type: string}) => s.type === 'Support')) {
                    card.statuses.push({ type: 'Support', addedByPlayerId: ownerId });
                }
            }
            
            let threateningPlayerId: number | null = null;

            // Apply "Threat" Status Condition A: Pinned by two cards of the same enemy.
            for (const enemyPlayerId in enemyNeighborsByPlayer) {
                if (enemyNeighborsByPlayer[enemyPlayerId].length >= 2) {
                    threateningPlayerId = parseInt(enemyPlayerId, 10);
                    break;
                }
            }

            // Apply "Threat" Status Condition B: On the active border with an enemy neighbor.
            if (threateningPlayerId === null) {
                 const isActiveCell = r >= offset && r < offset + activeGridSize &&
                                    c >= offset && c < offset + activeGridSize;
                
                 if (isActiveCell) {
                    const isCardOnEdge = r === offset || r === offset + activeGridSize - 1 ||
                                         c === offset || c === offset + activeGridSize - 1;

                    const hasEnemyNeighbor = Object.keys(enemyNeighborsByPlayer).length > 0;
                    
                    if (isCardOnEdge && hasEnemyNeighbor) {
                        threateningPlayerId = parseInt(Object.keys(enemyNeighborsByPlayer)[0], 10);
                    }
                 }
            }
            
            if (threateningPlayerId !== null) {
                 if (!card.statuses) card.statuses = [];
                 if (!card.statuses.some((s: {type: string}) => s.type === 'Threat')) {
                    card.statuses.push({ type: 'Threat', addedByPlayerId: threateningPlayerId });
                }
            }
        }
    }
    return newBoard;
};
