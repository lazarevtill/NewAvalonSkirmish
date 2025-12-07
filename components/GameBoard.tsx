/**
 * @file Renders the main game board and its cells.
 */

import React from 'react';
import type { Board, GridSize, DragItem, DropTarget, Card as CardType, PlayerColor, HighlightData, FloatingTextData } from '../types';
import { Card } from './Card';
import { PLAYER_COLORS, FLOATING_TEXT_COLORS } from '../constants';

/**
 * Props for the GameBoard component.
 */
interface GameBoardProps {
  board: Board;
  isGameStarted: boolean;
  activeGridSize: GridSize;
  handleDrop: (item: DragItem, target: DropTarget) => void;
  draggedItem: DragItem | null;
  setDraggedItem: (item: DragItem | null) => void;
  openContextMenu: (e: React.MouseEvent, type: 'boardItem' | 'emptyBoardCell', data: any) => void;
  playMode: { card: CardType; sourceItem: DragItem; faceDown?: boolean } | null;
  setPlayMode: (mode: null) => void;
  highlight: HighlightData | null;
  playerColorMap: Map<number, PlayerColor>;
  localPlayerId: number | null;
  onCardDoubleClick: (card: CardType, boardCoords: { row: number; col: number }) => void;
  onEmptyCellDoubleClick: (boardCoords: { row: number, col: number }) => void;
  imageRefreshVersion?: number;
  cursorStack: { type: string; count: number } | null;
  setCursorStack: (stack: null) => void;
  currentPhase?: number;
  activeTurnPlayerId?: number;
  onCardClick?: (card: CardType, boardCoords: { row: number; col: number }) => void;
  onEmptyCellClick?: (boardCoords: { row: number, col: number }) => void;
  validTargets?: {row: number, col: number}[];
  noTargetOverlay?: {row: number, col: number} | null;
  disableActiveHighlights?: boolean; // New prop to suppress active highlighting
  activeFloatingTexts?: FloatingTextData[]; // New prop for floating text events
}

/**
 * Represents a single cell on the game board. It handles dropping cards,
 * click-to-play actions, and displaying cards.
 * @param {object} props The properties for the component.
 * @returns {React.ReactElement} A single grid cell.
 */
const GridCell: React.FC<{
  row: number;
  col: number;
  cell: { card: CardType | null };
  isGameStarted: boolean;
  handleDrop: (item: DragItem, target: DropTarget) => void;
  draggedItem: DragItem | null;
  setDraggedItem: (item: DragItem | null) => void;
  openContextMenu: GameBoardProps['openContextMenu'];
  playMode: GameBoardProps['playMode'];
  setPlayMode: GameBoardProps['setPlayMode'];
  playerColorMap: Map<number, PlayerColor>;
  localPlayerId: number | null;
  onCardDoubleClick: (card: CardType, boardCoords: { row: number; col: number }) => void;
  onEmptyCellDoubleClick: (boardCoords: { row: number, col: number }) => void;
  imageRefreshVersion?: number;
  cursorStack: GameBoardProps['cursorStack'];
  setCursorStack: GameBoardProps['setCursorStack'];
  currentPhase?: number;
  activeTurnPlayerId?: number;
  onCardClick?: (card: CardType, boardCoords: { row: number; col: number }) => void;
  onEmptyCellClick?: (boardCoords: { row: number, col: number }) => void;
  isValidTarget?: boolean;
  showNoTarget?: boolean;
  disableActiveHighlights?: boolean;
}> = ({ row, col, cell, isGameStarted, handleDrop, draggedItem, setDraggedItem, openContextMenu, playMode, setPlayMode, playerColorMap, localPlayerId, onCardDoubleClick, onEmptyCellDoubleClick, imageRefreshVersion, cursorStack, setCursorStack, currentPhase, activeTurnPlayerId, onCardClick, onEmptyCellClick, isValidTarget, showNoTarget, disableActiveHighlights }) => {
  const [isOver, setIsOver] = React.useState(false);

  /**
   * Handles the drop event on the cell.
   * @param {React.DragEvent<HTMLDivElement>} e The drag event.
   */
  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (draggedItem) {
      handleDrop(draggedItem, { target: 'board', boardCoords: { row, col } });
    }
    setIsOver(false);
  };
  
  /**
   * Handles click events on the cell, specifically for "Play Mode" or "Cursor Stack Mode".
   */
  const handleClick = () => {
    if (playMode) {
      const itemToDrop: DragItem = {
        ...playMode.sourceItem,
        card: { ...playMode.sourceItem.card }, // Create a copy to avoid mutating state
      };
      // Explicitly set face down status. `!!playMode.faceDown` handles `true` and `undefined` cases correctly.
      itemToDrop.card.isFaceDown = !!playMode.faceDown;
      handleDrop(itemToDrop, { target: 'board', boardCoords: { row, col } });
      setPlayMode(null);
    } 
    // NOTE: Removed cursorStack handling here. We rely on the global mouseup handler in App.tsx
    // to apply tokens. This ensures centralized validation logic (validateTarget) is respected.
    else if (cell.card && onCardClick) {
        // Propagate general click for Auto-Abilities
        onCardClick(cell.card, { row, col });
    } else if (!cell.card && onEmptyCellClick) {
        // Handle clicks on empty cells (e.g. for Move Self abilities)
        onEmptyCellClick({ row, col });
    }
  };

  /**
   * Handles the drag-over event to provide visual feedback.
   * @param {React.DragEvent<HTMLDivElement>} e The drag event.
   */
  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    // Can drop if empty OR if we are dragging a counter onto a card
    const isCounter = draggedItem?.source === 'counter_panel';
    if (!cell.card || (cell.card && isCounter)) {
        setIsOver(true);
    }
  };

  /**
   * Resets the visual feedback when a dragged item leaves the cell.
   */
  const onDragLeave = () => {
    setIsOver(false);
  };

  const isInPlayMode = !!playMode;
  const isStackMode = !!cursorStack;
  const isOccupied = !!cell.card;
  const baseClasses = "w-full h-full rounded-lg transition-colors duration-200 flex items-center justify-center relative";
  
  const canDrop = !!draggedItem && (!isOccupied || (isOccupied && draggedItem.source === 'counter_panel'));
  const canPlay = isInPlayMode && !isOccupied;
  // Changed canStack to strictly use isValidTarget during stack mode to prevent illegal highlights
  const canStack = isStackMode && isValidTarget;

  // Unified Interaction Highlight (Saturated Cyan)
  // This applies to:
  // 1. Ability Targets (isValidTarget)
  // 2. Play Mode Targets (canPlay - empty cells)
  // 3. Counter Stack Targets (canStack - occupied cards)
  const isInteractive = isValidTarget || canPlay || canStack;

  // Target outline: z-10
  const targetClasses = isInteractive ? 'ring-4 ring-cyan-400 shadow-[0_0_15px_#22d3ee] cursor-pointer z-10' : '';

  const cellClasses = `bg-board-cell-active ${isOver && canDrop ? 'bg-indigo-400 opacity-80' : ''} ${isInPlayMode && isOccupied ? 'cursor-not-allowed' : ''} ${targetClasses}`;

  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onClick={handleClick}
      onContextMenu={(e) => {
          if (!cell.card) {
              openContextMenu(e, 'emptyBoardCell', { boardCoords: { row, col }});
          }
      }}
      onDoubleClick={() => {
        if (!cell.card) {
            onEmptyCellDoubleClick({ row, col });
        }
      }}
      className={`${baseClasses} ${cellClasses}`}
      data-interactive={!cell.card}
      data-board-coords={`${row},${col}`}
    >
      {/* Visual pulsing overlay for interactive targets - SATURATED CYAN - z-10 */}
      {isInteractive && (
           <div className="absolute inset-0 rounded-lg bg-cyan-400 bg-opacity-30 animate-pulse pointer-events-none z-10"></div>
      )}

      {/* Visual "No Target" indicator */}
      {showNoTarget && (
        <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
            <img 
                src="https://res.cloudinary.com/dxxh6meej/image/upload/v1763978163/no_tarket_mic5sm.png" 
                alt="No Target" 
                className="w-16 h-16 object-contain animate-fade-out drop-shadow-[0_0_5px_rgba(255,0,0,0.8)]"
            />
        </div>
      )}

      {cell.card && (
        <div
          key={cell.card.id}
          draggable={isGameStarted}
          onDragStart={() => setDraggedItem({
              card: cell.card!,
              source: 'board',
              boardCoords: { row, col },
              isManual: true, // Set manual flag for user interaction
          })}
          onDragEnd={() => setDraggedItem(null)}
          onContextMenu={(e) => openContextMenu(e, 'boardItem', { card: cell.card, boardCoords: { row, col }})}
          onDoubleClick={(e) => {
              e.stopPropagation();
              // Prevent double click view if we are in stack mode
              if (!cursorStack) {
                  onCardDoubleClick(cell.card!, { row, col });
              } else {
                  handleClick(); // Trigger the stack application (via global handler)
              }
          }}
          // Higher z-index to float above highlights
          className={`w-full h-full ${isGameStarted ? 'cursor-grab' : 'cursor-default'} relative z-30`}
          data-interactive="true"
        >
            <Card
              card={cell.card}
              isFaceUp={(() => {
                const card = cell.card;
                if (!card) return false;
                
                const isRevealedToAll = card.revealedTo === 'all';
                const isRevealedToMeExplicitly = localPlayerId !== null && Array.isArray(card.revealedTo) && card.revealedTo.includes(localPlayerId);
                const isRevealedByRequest = localPlayerId !== null && card.statuses?.some(s => s.type === 'Revealed' && s.addedByPlayerId === localPlayerId);

                return !card.isFaceDown || isRevealedToAll || isRevealedToMeExplicitly || isRevealedByRequest;
              })()}
              playerColorMap={playerColorMap}
              localPlayerId={localPlayerId}
              imageRefreshVersion={imageRefreshVersion}
              activePhaseIndex={currentPhase}
              activeTurnPlayerId={activeTurnPlayerId}
              disableActiveHighlights={disableActiveHighlights}
            />
        </div>
      )}
    </div>
  );
};

/**
 * A mapping of grid sizes to their corresponding Tailwind CSS classes.
 */
const gridSizeClasses: { [key in GridSize]: string } = {
    4: 'grid-cols-4 grid-rows-4',
    5: 'grid-cols-5 grid-rows-5',
    6: 'grid-cols-6 grid-rows-6',
    7: 'grid-cols-7 grid-rows-7',
};

const FloatingTextOverlay: React.FC<{ textData: FloatingTextData; playerColorMap: Map<number, PlayerColor>; }> = ({ textData, playerColorMap }) => {
    const playerColor = playerColorMap.get(textData.playerId);
    
    const colorClass = (playerColor && FLOATING_TEXT_COLORS[playerColor]) ? FLOATING_TEXT_COLORS[playerColor] : 'text-white';

    return (
        <div className={`absolute inset-0 flex items-center justify-center pointer-events-none z-[60] animate-float-up`}>
            <span className={`text-4xl font-black ${colorClass}`} style={{ textShadow: '2px 2px 0 #000' }}>
                {textData.text}
            </span>
        </div>
    );
};

/**
 * The main GameBoard component, which displays the grid of cells and handles board-level interactions.
 * It dynamically renders a subsection of the total board based on `activeGridSize`.
 * @param {GameBoardProps} props The properties for the component.
 * @returns {React.ReactElement} The rendered game board.
 */
export const GameBoard: React.FC<GameBoardProps> = ({ board, isGameStarted, activeGridSize, handleDrop, draggedItem, setDraggedItem, openContextMenu, playMode, setPlayMode, highlight, playerColorMap, localPlayerId, onCardDoubleClick, onEmptyCellDoubleClick, imageRefreshVersion, cursorStack, setCursorStack, currentPhase, activeTurnPlayerId, onCardClick, onEmptyCellClick, validTargets, noTargetOverlay, disableActiveHighlights, activeFloatingTexts }) => {
  const totalSize = board.length;
  // Calculate the offset to center the active grid within the total board area.
  const offset = Math.floor((totalSize - activeGridSize) / 2);
  
  const activeBoard = board
    .slice(offset, offset + activeGridSize)
    .map(row => row.slice(offset, offset + activeGridSize));

  /**
   * A sub-component responsible for rendering the highlight effect over a row or column.
   * @returns {React.ReactElement | null} The highlight element or null.
   */
  const HighlightContent = () => {
    if (!highlight) return null;

    const { type, row, col, playerId } = highlight;
    
    // Determine the outline color based on the initiating player ID
    const playerColor = playerColorMap.get(playerId);
    // Safe access for outline class
    const outlineClass = (playerColor && PLAYER_COLORS[playerColor]) ? PLAYER_COLORS[playerColor].outline : 'outline-yellow-400';

    const baseClasses = `outline outline-[8px] ${outlineClass} rounded-lg`;

    // Highlight a row
    if (type === 'row' && row !== undefined && row >= offset && row < offset + activeGridSize) {
      const gridRow = row - offset + 1; // CSS grid lines are 1-based
      return (
        <div 
          className={baseClasses}
          style={{
            gridArea: `${gridRow} / 1 / ${gridRow + 1} / ${activeGridSize + 1}`,
          }}
        ></div>
      );
    }

    // Highlight a column
    if (type === 'col' && col !== undefined && col >= offset && col < offset + activeGridSize) {
      const gridCol = col - offset + 1;
      return (
        <div 
          className={baseClasses}
          style={{
            gridArea: `1 / ${gridCol} / ${activeGridSize + 1} / ${gridCol + 1}`,
          }}
        ></div>
      );
    }

    // Highlight a cell
    if (type === 'cell' && row !== undefined && col !== undefined && row >= offset && row < offset + activeGridSize && col >= offset && col < offset + activeGridSize) {
      const gridRow = row - offset + 1;
      const gridCol = col - offset + 1;
      return (
        <div 
          className={baseClasses}
          style={{
            gridArea: `${gridRow} / ${gridCol} / ${gridRow + 1} / ${gridCol + 1}`,
          }}
        ></div>
      );
    }
    
    return null;
  };

  return (
    <div className={`relative p-2 bg-board-bg rounded-xl shadow-2xl h-full aspect-square transition-all duration-300`}>
      {/* Main content grid */}
      <div className={`grid ${gridSizeClasses[activeGridSize]} gap-0.5 h-full w-full`}>
        {activeBoard.map((rowItems, rowIndex) =>
          rowItems.map((cell, colIndex) => {
            const originalRowIndex = rowIndex + offset;
            const originalColIndex = colIndex + offset;
            
            // Check if this cell is a valid target
            const isValidTarget = validTargets?.some(t => t.row === originalRowIndex && t.col === originalColIndex);

            const isNoTarget = noTargetOverlay && noTargetOverlay.row === originalRowIndex && noTargetOverlay.col === originalColIndex;

            // Check for active floating texts on this cell
            const cellFloatingTexts = activeFloatingTexts?.filter(t => t.row === originalRowIndex && t.col === originalColIndex);

            return (
              <div key={`${originalRowIndex}-${originalColIndex}`} className="relative w-full h-full">
                  <GridCell
                    row={originalRowIndex}
                    col={originalColIndex}
                    cell={cell}
                    isGameStarted={isGameStarted}
                    handleDrop={handleDrop}
                    draggedItem={draggedItem}
                    setDraggedItem={setDraggedItem}
                    openContextMenu={openContextMenu}
                    playMode={playMode}
                    setPlayMode={setPlayMode}
                    playerColorMap={playerColorMap}
                    localPlayerId={localPlayerId}
                    onCardDoubleClick={onCardDoubleClick}
                    onEmptyCellDoubleClick={onEmptyCellDoubleClick}
                    imageRefreshVersion={imageRefreshVersion}
                    cursorStack={cursorStack}
                    setCursorStack={setCursorStack}
                    currentPhase={currentPhase}
                    activeTurnPlayerId={activeTurnPlayerId}
                    onCardClick={onCardClick}
                    onEmptyCellClick={onEmptyCellClick}
                    isValidTarget={isValidTarget}
                    showNoTarget={isNoTarget}
                    disableActiveHighlights={disableActiveHighlights}
                  />
                  {/* Render floating texts overlaying the cell */}
                  {cellFloatingTexts?.map(ft => (
                      <FloatingTextOverlay key={ft.id || `${ft.row}-${ft.col}-${ft.timestamp}`} textData={ft} playerColorMap={playerColorMap} />
                  ))}
              </div>
            )
          })
        )}
      </div>
      
      {/* Overlay grid for highlight effect */}
      {highlight && (
        <div className={`absolute top-2 right-2 bottom-2 left-2 grid ${gridSizeClasses[activeGridSize]} gap-0.5 pointer-events-none z-20`}>
          <HighlightContent />
        </div>
      )}
    </div>
  );
};