/**
 * @file This is the root component of the application, orchestrating the entire UI and game state.
 */

import React, { useState, useMemo, useEffect } from 'react';
import { GameBoard } from './components/GameBoard';
import { PlayerPanel } from './components/PlayerPanel';
import { Header } from './components/Header';
import { JoinGameModal } from './components/JoinGameModal';
import { DiscardModal } from './components/DiscardModal';
import { TokensModal } from './components/TokensModal';
import { TeamAssignmentModal } from './components/TeamAssignmentModal';
import { ReadyCheckModal } from './components/ReadyCheckModal';
import { CardDetailModal } from './components/CardDetailModal';
import { RevealRequestModal } from './components/RevealRequestModal';
import { DeckBuilderModal } from './components/DeckBuilderModal';
import { useGameState } from './hooks/useGameState';
import type { Player, Card, DragItem, DropTarget, PlayerColor, CardStatus, CustomDeckFile } from './types';
import { DeckType, GameMode } from './types';

/**
 * Defines the different types of items that can appear in a context menu.
 */
type ContextMenuItem =
  // A standard clickable button item.
  | { label: string; onClick: () => void; disabled?: boolean; isBold?: boolean }
  // A visual separator line.
  | { isDivider: true }
  // A special control for incrementing/decrementing a status.
  | {
      type: 'statusControl';
      label: string;
      onAdd: () => void;
      onRemove: () => void;
      removeDisabled?: boolean;
    };

/**
 * Props for the ContextMenu component.
 */
interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

const STATUS_DESCRIPTIONS: Record<string, string> = {
    'Support': 'Provides support to adjacent friendly cards, often enabling bonus effects.',
    'Threat': 'Is threatened by adjacent enemy cards, which can also enable bonus effects for the opponent.',
    'Aim': 'Marks a card as a target for abilities. Often used for destruction or high-impact effects.',
    'Exploit': 'Represents a data breach or vulnerability. Can be used to score points or trigger negative effects.',
    'Stun': 'The card cannot perform actions (like moving or using abilities) on its next turn.',
    'Shield': 'Absorbs a certain amount of damage or one negative effect before being removed.',
    'Revealed': 'This card has been revealed to one or more specific players upon request.',
    'LastPlayed': 'Indicates the last card played by a player.',
};

/**
 * A generic context menu component that displays a list of actions at a specific screen position.
 * It automatically adjusts its position to stay within the viewport.
 * @param {ContextMenuProps} props The properties for the context menu.
 * @returns {React.ReactElement} The rendered context menu.
 */
const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, onClose }) => {
    // Corrects the menu's position to prevent it from rendering off-screen.
    const correctedX = x + 200 > window.innerWidth ? window.innerWidth - 210 : x;
    const menuHeight = items.reduce((acc, item) => acc + ('isDivider' in item ? 9 : 32), 0);
    const correctedY = y + menuHeight > window.innerHeight ? window.innerHeight - menuHeight - 10 : y;


    return (
        <div 
            className="fixed bg-gray-900 border border-gray-700 rounded-md shadow-lg z-[100] py-1"
            style={{ top: correctedY, left: correctedX }}
            onClick={(e) => e.stopPropagation()} // Prevents the window click listener from closing the menu immediately.
        >
            {/* FIX: Used `if/else if/else` with unique property checks to ensure TypeScript correctly narrows the `item` union type in each branch. This resolves errors where properties were accessed on the wrong member of the union. */}
            {items.map((item, index) => {
                if ('isDivider' in item) {
                    return <hr key={`divider-${index}`} className="border-gray-700 my-1" />;
                } else if ('onClick' in item) { // This item is a standard button.
                    return (
                        <button
                            key={index}
                            onClick={() => {
                                if (!item.disabled) {
                                    item.onClick();
                                    onClose();
                                }
                            }}
                            disabled={item.disabled}
                            className="block w-full text-left px-4 py-1 text-sm text-white hover:bg-indigo-600 disabled:text-gray-500 disabled:cursor-not-allowed disabled:bg-gray-800"
                            style={{ fontWeight: item.isBold ? 'bold' : 'normal' }}
                        >
                            {item.label}
                        </button>
                    );
                } else { // This item must be a statusControl.
                    return (
                        <div key={index} className="flex items-center justify-between px-4 py-1 text-sm text-white w-full space-x-2">
                            <button
                                onClick={(e) => { e.stopPropagation(); item.onRemove(); }}
                                disabled={item.removeDisabled}
                                className="w-7 h-6 flex items-center justify-center bg-gray-700 hover:bg-red-600 rounded disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed font-mono text-lg"
                            >
                                -
                            </button>
                            <span className="flex-grow text-center">{item.label}</span>
                             <button
                                onClick={(e) => { e.stopPropagation(); item.onAdd(); }}
                                className="w-7 h-6 flex items-center justify-center bg-gray-700 hover:bg-green-600 rounded font-mono text-lg"
                            >
                                +
                            </button>
                        </div>
                    );
                }
            })}
        </div>
    );
};

/**
 * Defines the parameters required to open a context menu.
 */
type ContextMenuParams = {
  x: number;
  y: number;
  type: 'boardItem' | 'handCard' | 'discardCard' | 'deckPile' | 'discardPile' | 'token_panel_item' | 'deckCard' | 'announcedCard';
  data: any; // Context-specific data (e.g., card, player, coordinates).
}

/**
 * The main application component. It manages the overall layout, modals,
 * and interactions between different parts of the game interface.
 * @returns {React.ReactElement} The rendered application.
 */
export default function App() {
  const {
    gameState,
    localPlayerId,
    setLocalPlayerId,
    createGame,
    joinGame,
    startReadyCheck,
    playerReady,
    assignTeams,
    setGameMode,
    setGamePrivacy,
    setActiveGridSize,
    setDummyPlayerCount,
    updatePlayerName,
    changePlayerColor,
    updatePlayerScore,
    changePlayerDeck,
    loadCustomDeck,
    drawCard,
    handleDrop,
    draggedItem,
    setDraggedItem,
    connectionStatus,
    gamesList,
    requestGamesList,
    exitGame,
    moveItem,
    shufflePlayerDeck,
    addBoardCardStatus,
    removeBoardCardStatus,
    addAnnouncedCardStatus,
    removeAnnouncedCardStatus,
    flipBoardCard,
    flipBoardCardFaceDown,
    revealHandCard,
    revealBoardCard,
    requestCardReveal,
    respondToRevealRequest,
    syncGame,
    removeRevealedStatus,
    resetGame,
  } = useGameState();

  // State for managing UI modals.
  const [isJoinModalOpen, setJoinModalOpen] = useState(false);
  const [isDeckBuilderOpen, setDeckBuilderOpen] = useState(false);
  const [isTokensModalOpen, setTokensModalOpen] = useState(false);
  const [tokensModalAnchor, setTokensModalAnchor] = useState<{ top: number; left: number } | null>(null);
  const [isTeamAssignOpen, setTeamAssignOpen] = useState(false);
  const [viewingDiscard, setViewingDiscard] = useState<{ player: Player } | null>(null);
  const [viewingDeck, setViewingDeck] = useState<Player | null>(null);
  const [viewingCard, setViewingCard] = useState<{ card: Card; player?: Player } | null>(null);

  // State for the context menu.
  const [contextMenuProps, setContextMenuProps] = useState<ContextMenuParams | null>(null);
  
  // State for "Play Mode", where clicking a board cell plays the selected card.
  const [playMode, setPlayMode] = useState<{ card: Card; sourceItem: DragItem; faceDown?: boolean } | null>(null);
  
  // State for highlighting a row or column on the board.
  const [highlight, setHighlight] = useState<{ type: 'row' | 'col' | 'cell', row?: number, col?: number} | null>(null);

  const activePlayerCount = useMemo(() => gameState.players.filter(p => !p.isDummy && !p.isDisconnected).length, [gameState.players]);
  const isSpectator = localPlayerId === null && gameState.gameId !== null;
  const realPlayerCount = useMemo(() => gameState.players.filter(p => !p.isDummy).length, [gameState.players]);
  const isHost = localPlayerId === 1;

  // Determine if the game interface should be shown. This is true if the client
  // is aware of a game (has a gameId) and is a participant, either as a player
  // whose ID is in the player list, or as a spectator. This is more robust
  // than just checking if players exist, as it's tied to this client's identity.
  const localPlayer = useMemo(() => gameState.players.find(p => p.id === localPlayerId), [gameState.players, localPlayerId]);
  const isGameActive = gameState.gameId && (localPlayer || isSpectator);

  const playerColorMap = useMemo(() => {
    const map = new Map<number, PlayerColor>();
    gameState.players.forEach(p => map.set(p.id, p.color));
    return map;
  }, [gameState.players]);

  /**
   * Closes all currently open modals.
   */
  const closeAllModals = () => {
      setTokensModalOpen(false);
      setViewingDiscard(null);
      setViewingDeck(null);
      setViewingCard(null);
  };
  
  const handleStartGameSequence = () => {
      if (!isHost) return;
      if (gameState.gameMode === GameMode.FreeForAll) {
          startReadyCheck();
      } else {
          setTeamAssignOpen(true);
      }
  };
  
  const handleTeamAssignment = (teamAssignments: Record<number, number[]>) => {
      assignTeams(teamAssignments);
      setTeamAssignOpen(false);
      startReadyCheck();
  };

  /**
   * Handles the action of joining a game.
   * @param {string} gameId - The ID of the game to join.
   */
  const handleJoinGame = (gameId: string) => {
    joinGame(gameId);
    setJoinModalOpen(false);
  };

  /**
   * Handles the action of creating a new game.
   */
  const handleCreateGame = () => {
    createGame();
    setLocalPlayerId(1);
  };
  
  /**
   * Opens the "Join Game" modal and requests the latest list of active games.
   */
  const handleOpenJoinModal = () => {
    requestGamesList();
    setJoinModalOpen(true);
  };

  /**
   * Triggers a temporary highlight effect on a board row or column.
   * @param {{ type: 'row' | 'col' | 'cell', row?: number, col?: number}} coords The coordinates to highlight.
   */
  const triggerHighlight = (coords: { type: 'row' | 'col' | 'cell', row?: number, col?: number}) => {
      setHighlight(coords);
      setTimeout(() => setHighlight(null), 1000);
  };

  const closeContextMenu = () => {
    setContextMenuProps(null);
  };
  
  /**
   * Opens the context menu with specific items based on the context.
   * @param {React.MouseEvent} e - The mouse event.
   * @param {ContextMenuParams['type']} type - The type of item being right-clicked.
   * @param {any} data - The data associated with the item.
   */
  const openContextMenu = (
    e: React.MouseEvent,
    type: ContextMenuParams['type'],
    data: any
  ) => {
    e.preventDefault();
    e.stopPropagation();

    // Context menu is only for active players, and only after the game has started.
    if (localPlayerId === null || !gameState.isGameStarted) return;
    setContextMenuProps({ x: e.clientX, y: e.clientY, type, data });
  };
  
    /**
     * Double-click handler for cards on the board.
     * - Opens the detail view if the card is visible to the player.
     * - Sends a reveal request if the card is face-down and belongs to an opponent.
     */
    const handleDoubleClickBoardCard = (card: Card, boardCoords: { row: number, col: number }) => {
        const owner = card.ownerId ? gameState.players.find(p => p.id === card.ownerId) : undefined;
        const isOwner = card.ownerId === localPlayerId;
        const isRevealedByRequest = card.statuses?.some(s => s.type === 'Revealed' && s.addedByPlayerId === localPlayerId);
        const isVisibleForMe = !card.isFaceDown || card.revealedTo === 'all' || (Array.isArray(card.revealedTo) && card.revealedTo.includes(localPlayerId!)) || isRevealedByRequest;

        if (isVisibleForMe || isOwner) {
            setViewingCard({ card, player: owner });
        } else if (localPlayerId !== null) { // Not owner, not visible
            requestCardReveal({ source: 'board', ownerId: card.ownerId!, boardCoords }, localPlayerId);
        }
    };

    /**
     * Double-click handler for cards in a player's hand.
     * - For local player: Enters "play face down" mode.
     * - For opponent: Opens detail view if visible, otherwise sends a reveal request.
     */
    const handleDoubleClickHandCard = (player: Player, card: Card, cardIndex: number) => {
        if (player.id === localPlayerId) {
            closeAllModals();
            const sourceItem: DragItem = { card, source: 'hand', playerId: player.id, cardIndex };
            setPlayMode({ card, sourceItem, faceDown: true });
        } else if (localPlayerId !== null) {
            const isRevealedToAll = card.revealedTo === 'all';
            const isRevealedToMe = Array.isArray(card.revealedTo) && card.revealedTo.includes(localPlayerId);
            const isRevealedByRequest = card.statuses?.some(s => s.type === 'Revealed' && s.addedByPlayerId === localPlayerId);
            const isVisible = isRevealedToAll || isRevealedToMe || isRevealedByRequest || !!player.isDummy || !!player.isDisconnected;

            if (isVisible) {
                setViewingCard({ card, player });
            } else {
                requestCardReveal({ source: 'hand', ownerId: player.id, cardIndex }, localPlayerId);
            }
        }
    };


    /**
     * Double-click handler for cards in the discard or deck view. Moves the card to the owner's hand.
     */
    const handleDoubleClickPileCard = (player: Player, card: Card, cardIndex: number, source: 'deck' | 'discard') => {
        const sourceItem: DragItem = { card, source, playerId: player.id, cardIndex };
        moveItem(sourceItem, { target: 'hand', playerId: player.id });
    };


  /**
   * Handlers to open deck/discard modals, ensuring only one is open at a time.
   */
  const handleViewDeck = (player: Player) => {
    setViewingDiscard(null);
    setViewingDeck(player);
  };
  const handleViewDiscard = (player: Player) => {
    setViewingDeck(null);
    setViewingDiscard({ player });
  };
  
  /**
   * Memoized rendering of the context menu.
   * This builds the menu items dynamically based on the context provided
   * when `openContextMenu` was called.
   */
  const renderedContextMenu = useMemo(() => {
    if (!contextMenuProps || localPlayerId === null) return null;

    const { type, data, x, y } = contextMenuProps;
    let items: ContextMenuItem[] = [];
    
    // Logic to build menu for a card on the board.
    if (type === 'boardItem' || type === 'announcedCard') {
        const isBoardItem = type === 'boardItem';
        const card = isBoardItem ? gameState.board[data.boardCoords.row][data.boardCoords.col].card : data.card;
        const player = isBoardItem ? null : data.player; // Player whose panel this is on
        
        if (!card) {
            setContextMenuProps(null);
            return null;
        }
        
        const owner = card.ownerId ? gameState.players.find(p => p.id === card.ownerId) : undefined;
        const isOwner = card.ownerId === localPlayerId;
        const isDummyCard = !!owner?.isDummy;
        const canControl = isOwner || isDummyCard;

        const isRevealedByRequest = card.statuses?.some(s => s.type === 'Revealed' && (s.addedByPlayerId === localPlayerId));
        const isVisible = !card.isFaceDown || card.revealedTo === 'all' || (Array.isArray(card.revealedTo) && card.revealedTo.includes(localPlayerId)) || isRevealedByRequest;

        // --- Core Actions ---
        if (isVisible || (isOwner && card.isFaceDown)) {
            items.push({ label: 'View', isBold: true, onClick: () => setViewingCard({ card, player: owner }) });
        }
        if (isBoardItem && canControl) {
             if (card.isFaceDown) {
                items.push({ label: 'Flip Face Up', isBold: true, onClick: () => flipBoardCard(data.boardCoords) });
            } else {
                items.push({ label: 'Flip Face Down', onClick: () => flipBoardCardFaceDown(data.boardCoords) });
            }
        }

        const sourceItem: DragItem = isBoardItem
          ? { card, source: 'board', boardCoords: data.boardCoords }
          : { card, source: 'announced', playerId: player!.id };
        
        const ownerId = card.ownerId;
        const isSpecialItem = card?.deck === DeckType.Tokens || card?.deck === 'counter';
        
        // --- Reveal Actions (Board only) ---
        if (isBoardItem) {
            if (canControl && card.isFaceDown) {
                items.push({ label: 'Reveal to All', onClick: () => revealBoardCard(data.boardCoords, 'all') });
            }
            if (!isOwner && !isVisible) {
                items.push({ label: 'Request Reveal', onClick: () => requestCardReveal({ source: 'board', ownerId: card.ownerId!, boardCoords: data.boardCoords }, localPlayerId) });
            }
            if (card.statuses?.some(s => s.type === 'Revealed')) {
                items.push({ label: 'Remove Revealed', onClick: () => removeRevealedStatus({ source: 'board', boardCoords: data.boardCoords }) });
            }
        }
        
        if (items.length > 0) items.push({ isDivider: true });

        // --- Movement actions (Owner or Dummy card only) ---
        if (canControl && isVisible) {
            items.push({ label: 'To Hand', disabled: isSpecialItem, onClick: () => moveItem(sourceItem, { target: 'hand', playerId: ownerId }) });
            if (ownerId) {
                const discardLabel = isSpecialItem ? 'Remove' : 'To Discard';
                items.push({ label: discardLabel, onClick: () => moveItem(sourceItem, { target: 'discard', playerId: ownerId }) });
                items.push({ label: 'To Deck Top', disabled: isSpecialItem, onClick: () => moveItem(sourceItem, { target: 'deck', playerId: ownerId, deckPosition: 'top'}) });
                items.push({ label: 'To Deck Bottom', disabled: isSpecialItem, onClick: () => moveItem(sourceItem, { target: 'deck', playerId: ownerId, deckPosition: 'bottom'}) });
            }
        }
        
        // --- Board actions ---
        if (isBoardItem) {
            items.push({ isDivider: true });
            items.push({ label: 'Highlight Cell', onClick: () => triggerHighlight({ type: 'cell', row: data.boardCoords.row, col: data.boardCoords.col }) });
            items.push({ label: 'Highlight Column', onClick: () => triggerHighlight({ type: 'col', col: data.boardCoords.col }) });
            items.push({ label: 'Highlight Row', onClick: () => triggerHighlight({ type: 'row', row: data.boardCoords.row }) });
        }

        // --- Status controls (Visible cards only) ---
        if (isVisible) {
            const normalStatusItems: ContextMenuItem[] = [];
            const specialStatusItems: ContextMenuItem[] = [];
            const normalStatuses = ['Aim', 'Exploit', 'Stun', 'Shield'];
            const specialStatuses = ['Support', 'Threat'];

            normalStatuses.forEach(status => {
                const currentCount = card.statuses?.filter((s: CardStatus) => s.type === status).length || 0;
                normalStatusItems.push({
                    type: 'statusControl',
                    label: status,
                    onAdd: () => isBoardItem ? addBoardCardStatus(data.boardCoords, status, localPlayerId) : addAnnouncedCardStatus(player.id, status, localPlayerId),
                    onRemove: () => isBoardItem ? removeBoardCardStatus(data.boardCoords, status) : removeAnnouncedCardStatus(player.id, status),
                    removeDisabled: currentCount === 0
                });
            });

            specialStatuses.forEach(status => {
                const hasStatusFromMe = card.statuses?.some(s => s.type === status && s.addedByPlayerId === localPlayerId);
                const hasAnyStatus = card.statuses?.some(s => s.type === status);
                specialStatusItems.push({
                    type: 'statusControl',
                    label: status,
                    onAdd: () => {
                        if (hasStatusFromMe) return; // Prevent adding if one from this player already exists
                        isBoardItem ? addBoardCardStatus(data.boardCoords, status, localPlayerId) : addAnnouncedCardStatus(player.id, status, localPlayerId);
                    },
                    onRemove: () => isBoardItem ? removeBoardCardStatus(data.boardCoords, status) : removeAnnouncedCardStatus(player.id, status),
                    removeDisabled: !hasAnyStatus
                });
            });

            if (normalStatusItems.length > 0 || specialStatusItems.length > 0) {
                 if (items.length > 0 && !('isDivider' in items[items.length - 1])) items.push({ isDivider: true });
                items.push(...normalStatusItems, ...specialStatusItems);
            }
        }
        
    // Logic for token panel items (fixed crash and added new options)
    } else if (type === 'token_panel_item') {
        const { card } = data;
        const sourceItem: DragItem = { card, source: 'token_panel' };

        items.push({ label: 'View', isBold: true, onClick: () => setViewingCard({ card }) });
        items.push({ isDivider: true });
        items.push({ label: 'Play Face Up', onClick: () => {
            closeAllModals();
            setPlayMode({ card, sourceItem, faceDown: false });
        }});
        items.push({ label: 'Play Face Down', onClick: () => {
            closeAllModals();
            setPlayMode({ card, sourceItem, faceDown: true });
        }});

    // Logic to build menu for cards in hand, discard, deck.
    } else if (['handCard', 'discardCard', 'deckCard'].includes(type)) {
        const { card, boardCoords, player, cardIndex } = data;
        const canControl = player.id === localPlayerId || !!player.isDummy;
        const localP = gameState.players.find(p => p.id === localPlayerId);
        const isTeammate = localP?.teamId !== undefined && player.teamId === localP.teamId;
        const isRevealedToMe = card.revealedTo === 'all' || (Array.isArray(card.revealedTo) && card.revealedTo.includes(localPlayerId));
        const isRevealedByRequest = card.statuses?.some(s => s.type === 'Revealed' && s.addedByPlayerId === localPlayerId);
        
        const isVisible = (() => {
            if (type !== 'handCard') return true; // discard, deck always visible in their modals
            return player.id === localPlayerId || isTeammate || !!player.isDummy || !!player.isDisconnected || isRevealedToMe || isRevealedByRequest;
        })();
        
        let source: DragItem['source'];
        if (type === 'handCard') source = 'hand';
        else if (type === 'discardCard') source = 'discard';
        else source = 'deck';

        const sourceItem: DragItem = { card, source, playerId: player?.id, cardIndex, boardCoords };
        const ownerId = card.ownerId;
        const isSpecialItem = card?.deck === DeckType.Tokens || card?.deck === 'counter';

        if (isVisible) {
            const owner = card.ownerId ? gameState.players.find(p => p.id === card.ownerId) : undefined;
            items.push({ label: 'View', isBold: true, onClick: () => setViewingCard({ card, player: owner }) });
        }

        // --- Control Actions (Local Player or Dummy) ---
        if (canControl) {
            // Play Actions
            if (type === 'handCard') {
                items.push({ label: 'Play', isBold: true, onClick: () => {
                    closeAllModals();
                    setPlayMode({ card, sourceItem, faceDown: true });
                }});
                 items.push({ label: 'Play Face Up', onClick: () => {
                    closeAllModals();
                    setPlayMode({ card, sourceItem, faceDown: false });
                }});
            } else if (isVisible && ['discardCard', 'deckCard'].includes(type)) {
                items.push({ label: 'Play Face Down', isBold: true, onClick: () => {
                    closeAllModals();
                    setPlayMode({ card, sourceItem, faceDown: true });
                }});
                 items.push({ label: 'Play Face Up', onClick: () => {
                    closeAllModals();
                    setPlayMode({ card, sourceItem });
                }});
            }
            
            if (items.length > 0) items.push({ isDivider: true });
            
            // Reveal Actions (for hand cards)
            if (type === 'handCard') {
                 if (card.statuses?.some(s => s.type === 'Revealed')) {
                    items.push({ label: 'Remove Revealed', onClick: () => removeRevealedStatus({ source: 'hand', playerId: player.id, cardIndex }) });
                }
                items.push({ label: 'Reveal to All', onClick: () => revealHandCard(player.id, cardIndex, 'all') });
            }

            if (items.length > 0 && !('isDivider' in items[items.length - 1])) items.push({ isDivider: true });

            // Movement Actions
            if (type === 'discardCard') {
                items.push({ label: 'To Hand', disabled: isSpecialItem, onClick: () => moveItem(sourceItem, { target: 'hand', playerId: ownerId }) });
            } else if (type === 'handCard') {
                items.push({ label: 'To Discard', onClick: () => moveItem(sourceItem, { target: 'discard', playerId: ownerId }) });
            }
            
            if (['handCard', 'discardCard'].includes(type) && ownerId) {
                 items.push({ label: 'To Deck Top', disabled: isSpecialItem, onClick: () => moveItem(sourceItem, { target: 'deck', playerId: ownerId, deckPosition: 'top'}) });
                 items.push({ label: 'To Deck Bottom', disabled: isSpecialItem, onClick: () => moveItem(sourceItem, { target: 'deck', playerId: ownerId, deckPosition: 'bottom'}) });
            }
             if (type === 'deckCard') {
                 items.push({ label: 'To Hand', disabled: isSpecialItem, onClick: () => moveItem(sourceItem, { target: 'hand', playerId: player.id }) });
                 items.push({ label: 'To Discard', onClick: () => moveItem(sourceItem, { target: 'discard', playerId: player.id }) });
             }
        } 
        // --- Non-Owner Actions ---
        else if (type === 'handCard' && !isVisible) {
             items.push({ label: 'Request Reveal', onClick: () => requestCardReveal({ source: 'hand', ownerId: player.id, cardIndex }, localPlayerId) });
        }

    // Logic to build menu for deck/discard piles.
    } else if (type === 'deckPile') {
        const { player } = data;
        const canControl = player.id === localPlayerId || !!player.isDummy;
        if (canControl) {
            items.push({ label: 'Draw Card', onClick: () => drawCard(player.id) });
            items.push({ label: 'Shuffle', onClick: () => shufflePlayerDeck(player.id) });
        }
        items.push({ label: 'View', onClick: () => handleViewDeck(player) });
    } else if (type === 'discardPile') {
        const { player } = data;
        items.push({ label: 'View', onClick: () => handleViewDiscard(player) });
    }
    
    // Clean up trailing/leading/multiple dividers.
    items = items.filter((item, index) => {
        if (!('isDivider' in item)) return true;
        if (index === 0 || index === items.length - 1) return false; // No leading/trailing
        if ('isDivider' in items[index-1]) return false; // No multiple dividers
        return true;
    });
    
    return <ContextMenu x={x} y={y} items={items} onClose={closeContextMenu} />;
  }, [gameState, localPlayerId, moveItem, triggerHighlight, addBoardCardStatus, removeBoardCardStatus, addAnnouncedCardStatus, removeAnnouncedCardStatus, drawCard, shufflePlayerDeck, flipBoardCard, flipBoardCardFaceDown, revealHandCard, revealBoardCard, requestCardReveal, removeRevealedStatus]);

  // Effect to handle global clicks for closing the context menu.
  useEffect(() => {
    window.addEventListener('click', closeContextMenu);
    
    // Prevents the context menu from closing when right-clicking on an interactive element.
    const handleContextMenu = (e: MouseEvent) => {
        if (!(e.target as HTMLElement).closest('[data-interactive]')) {
             closeContextMenu();
        }
    };
    window.addEventListener('contextmenu', handleContextMenu);

    return () => {
        window.removeEventListener('click', closeContextMenu);
        window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);

  // Effect to close context menu when a drag starts.
  useEffect(() => {
    if (draggedItem) {
      closeContextMenu();
    }
  }, [draggedItem]);

  const handleOpenTokensModal = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (isTokensModalOpen) {
      setTokensModalOpen(false);
      setTokensModalAnchor(null);
    } else {
      const rect = event.currentTarget.getBoundingClientRect();
      setTokensModalAnchor({ top: rect.bottom, left: rect.left });
      setTokensModalOpen(true);
    }
  };

  // Render the initial landing page if not in a game.
  if (!isGameActive) {
    const buttonClass = "bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-lg text-lg w-full transition-colors disabled:bg-gray-600 disabled:text-gray-400 disabled:cursor-not-allowed";
    const socialLinkClass = "text-gray-400 hover:text-white transition-colors";
    
    return (
      <div className="flex items-center justify-center h-screen bg-gray-800">
        <div className="text-center p-4 flex flex-col items-center">
          <h1 className="text-5xl font-bold mb-12">New Avalon: Skirmish</h1>
          <div className="flex flex-col space-y-4 w-64">
            <button onClick={handleCreateGame} className={buttonClass}>
              Start Game
            </button>
            <button onClick={handleOpenJoinModal} className={buttonClass}>
              Join Game
            </button>
             <button onClick={() => setDeckBuilderOpen(true)} className={buttonClass}>
              Deck Building
            </button>
             <button disabled className={buttonClass}>
              Story Mode
            </button>
             <button disabled className={buttonClass}>
              Puzzles
            </button>
             <button disabled className={buttonClass}>
              Rules
            </button>
          </div>
           <div className="mt-16 flex items-center space-x-8">
            <a href="https://t.me/NikitaAnahoretTriakin" target="_blank" rel="noopener noreferrer" className={socialLinkClass} title="Telegram">
               <img src="https://upload.wikimedia.org/wikipedia/commons/5/5c/Telegram_Messenger.png" alt="Telegram" className="h-8 w-8 object-contain" />
            </a>
            <a href="https://discord.gg/U5zKADsZZY" target="_blank" rel="noopener noreferrer" className={socialLinkClass} title="Discord">
               <img src="https://cdn-icons-png.flaticon.com/512/2111/2111370.png" alt="Discord" className="h-8 w-8 object-contain" />
            </a>
             <a href="https://www.patreon.com/c/AnchoriteComics" target="_blank" rel="noopener noreferrer" className={socialLinkClass} title="Patreon">
                <img src="https://cdn-icons-png.flaticon.com/512/5968/5968722.png" alt="Patreon" className="h-8 w-8 object-contain" />
            </a>
          </div>
          <JoinGameModal
            isOpen={isJoinModalOpen}
            onClose={() => setJoinModalOpen(false)}
            onJoin={handleJoinGame}
            games={gamesList}
          />
          <DeckBuilderModal 
            isOpen={isDeckBuilderOpen}
            onClose={() => setDeckBuilderOpen(false)}
            setViewingCard={setViewingCard}
          />
          {viewingCard && (
            <CardDetailModal
              card={viewingCard.card}
              ownerPlayer={viewingCard.player}
              onClose={() => setViewingCard(null)}
              statusDescriptions={STATUS_DESCRIPTIONS}
              allPlayers={gameState.players}
            />
          )}
        </div>
      </div>
    );
  }

  // Render the main game interface.
  return (
    <div className="relative w-screen h-screen overflow-hidden">
      <Header
        gameId={gameState.gameId}
        isGameStarted={gameState.isGameStarted}
        onStartGame={handleStartGameSequence}
        onResetGame={resetGame}
        activeGridSize={gameState.activeGridSize}
        onGridSizeChange={setActiveGridSize}
        dummyPlayerCount={gameState.dummyPlayerCount}
        onDummyPlayerCountChange={setDummyPlayerCount}
        realPlayerCount={realPlayerCount}
        connectionStatus={connectionStatus}
        onExitGame={exitGame}
        onOpenTokensModal={handleOpenTokensModal}
        gameMode={gameState.gameMode}
        onGameModeChange={setGameMode}
        isPrivate={gameState.isPrivate}
        onPrivacyChange={setGamePrivacy}
        isHost={isHost}
        onSyncGame={syncGame}
      />
      <main className="pt-14 h-screen w-full flex items-center justify-center p-4">
        <GameBoard
          board={gameState.board}
          isGameStarted={gameState.isGameStarted}
          activeGridSize={gameState.activeGridSize}
          handleDrop={handleDrop}
          draggedItem={draggedItem}
          setDraggedItem={setDraggedItem}
          openContextMenu={openContextMenu}
          playMode={playMode}
          setPlayMode={setPlayMode}
          highlight={highlight}
          playerColorMap={playerColorMap}
          localPlayerId={localPlayerId}
          onCardDoubleClick={handleDoubleClickBoardCard}
        />
      </main>
      
      {/* Spectator Mode overlay */}
      {isSpectator && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black bg-opacity-70 p-4 rounded-lg z-50">
          <p className="text-xl font-bold text-center">Spectator Mode</p>
          <p className="text-center text-gray-300">You are watching the game.</p>
        </div>
      )}

      {/* Player panels */}
      {gameState.players.map((player) => (
        <PlayerPanel
          key={player.id}
          player={player}
          isLocalPlayer={player.id === localPlayerId}
          localPlayerId={localPlayerId}
          isSpectator={isSpectator}
          isGameStarted={gameState.isGameStarted}
          position={player.id}
          onNameChange={(name) => updatePlayerName(player.id, name)}
          onColorChange={(color) => changePlayerColor(player.id, color)}
          onScoreChange={(delta) => updatePlayerScore(player.id, delta)}
          onDeckChange={(deckType) => changePlayerDeck(player.id, deckType)}
          onLoadCustomDeck={(deckFile) => loadCustomDeck(player.id, deckFile)}
          onDrawCard={() => drawCard(player.id)}
          handleDrop={handleDrop}
          draggedItem={draggedItem}
          setDraggedItem={setDraggedItem}
          openContextMenu={openContextMenu}
          onHandCardDoubleClick={handleDoubleClickHandCard}
          playerColorMap={playerColorMap}
          allPlayers={gameState.players}
          localPlayerTeamId={localPlayer?.teamId}
        />
      ))}

      {/* Reveal Request Modal */}
      {(() => {
          const request = gameState.revealRequests.find(r => r.toPlayerId === localPlayerId);
          if (!request) return null;
          const fromPlayer = gameState.players.find(p => p.id === request.fromPlayerId);
          return fromPlayer ? (
            <RevealRequestModal
              fromPlayer={fromPlayer}
              cardCount={request.cardIdentifiers.length}
              onAccept={() => respondToRevealRequest(request.fromPlayerId, true)}
              onDecline={() => respondToRevealRequest(request.fromPlayerId, false)}
            />
          ) : null;
      })()}
      
      {/* Team Assignment Modal */}
      {isTeamAssignOpen && isHost && (
        <TeamAssignmentModal
          players={gameState.players.filter(p => !p.isDisconnected)}
          gameMode={gameState.gameMode}
          onCancel={() => setTeamAssignOpen(false)}
          onConfirm={handleTeamAssignment}
        />
      )}
      
      {/* Ready Check Modal */}
      {gameState.isReadyCheckActive && !isSpectator && localPlayer && (
        <ReadyCheckModal
            players={gameState.players.filter(p => !p.isDummy && !p.isDisconnected)}
            localPlayer={localPlayer}
            onReady={playerReady}
        />
      )}

      {/* Discard Pile Modal */}
      {viewingDiscard && (() => {
          const playerInState = gameState.players.find(p => p.id === viewingDiscard.player.id);
          const currentCards = playerInState ? playerInState.discard : [];
          return (
            <DiscardModal
              isOpen={!!viewingDiscard}
              onClose={() => setViewingDiscard(null)}
              title={`${viewingDiscard.player.name}'s Discard Pile`}
              player={viewingDiscard.player}
              cards={currentCards}
              setDraggedItem={setDraggedItem}
              onCardContextMenu={(e, cardIndex) => openContextMenu(e, 'discardCard', { card: currentCards[cardIndex], player: viewingDiscard.player, cardIndex })}
              onCardDoubleClick={(cardIndex) => handleDoubleClickPileCard(viewingDiscard.player, currentCards[cardIndex], cardIndex, 'discard')}
              canInteract={(localPlayerId !== null && gameState.isGameStarted && (viewingDiscard.player.id === localPlayerId || !!viewingDiscard.player.isDummy))}
              playerColorMap={playerColorMap}
              localPlayerId={localPlayerId}
            />
          );
      })()}

      {/* Deck View Modal */}
       {viewingDeck && (() => {
          const playerInState = gameState.players.find(p => p.id === viewingDeck.id);
          const currentCards = playerInState ? playerInState.deck : [];
          return (
            <DiscardModal
              isOpen={!!viewingDeck}
              onClose={() => setViewingDeck(null)}
              title={`${viewingDeck.name}'s Deck`}
              player={viewingDeck}
              cards={currentCards}
              setDraggedItem={setDraggedItem}
              onCardContextMenu={(e, cardIndex) => openContextMenu(e, 'deckCard', { card: currentCards[cardIndex], player: viewingDeck, cardIndex })}
              onCardDoubleClick={(cardIndex) => handleDoubleClickPileCard(viewingDeck, currentCards[cardIndex], cardIndex, 'deck')}
              canInteract={localPlayerId !== null && gameState.isGameStarted && (viewingDeck.id === localPlayerId || !!viewingDeck.isDummy)}
              isDeckView={true}
              playerColorMap={playerColorMap}
              localPlayerId={localPlayerId}
            />
          );
      })()}

      {/* Tokens and Counters Modals */}
       <TokensModal
        isOpen={isTokensModalOpen}
        onClose={() => setTokensModalOpen(false)}
        setDraggedItem={setDraggedItem}
        openContextMenu={openContextMenu}
        canInteract={localPlayerId !== null && gameState.isGameStarted}
        anchorEl={tokensModalAnchor}
      />

      {viewingCard && (
        <CardDetailModal
          card={viewingCard.card}
          ownerPlayer={viewingCard.player}
          onClose={() => setViewingCard(null)}
          statusDescriptions={STATUS_DESCRIPTIONS}
          allPlayers={gameState.players}
        />
      )}

      {/* Render the context menu if active */}
      {renderedContextMenu}
    </div>
  );
}
