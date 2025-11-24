/**
 * @file Defines the core data structures and types used throughout the application.
 */

/**
 * Enum representing the different playable deck factions.
 */
export enum DeckType {
  SynchroTech = 'SynchroTech',
  Hoods = 'Hoods',
  Optimates = 'Optimates',
  Fusion = 'Fusion',
  Command = 'Command',
  Tokens = 'Tokens',
  Custom = 'Custom',
}

/**
 * Enum for game modes.
 */
export enum GameMode {
  FreeForAll = 'FFA',
  TwoVTwo = '2v2',
  ThreeVOne = '3v1',
}

/**
 * Represents special, non-deck items like tokens or counters.
 */
export type SpecialItemType = 'counter';

/**
 * Defines the available player colors.
 */
export type PlayerColor = 'blue' | 'purple' | 'red' | 'green' | 'yellow' | 'orange' | 'pink' | 'brown';

/**
 * Represents a single status effect applied to a card.
 */
export interface CardStatus {
  type: string;
  addedByPlayerId: number;
}

/**
 * Represents the definition of a counter/status in the database.
 */
export interface CounterDefinition {
    id: string;
    name: string; // Display name
    imageUrl: string;
    description: string;
    sortOrder: number;
    allowedPanels?: string[]; // Controls visibility in UI panels (e.g. 'COUNTER_PANEL')
    allowedTargets?: ('board' | 'hand' | 'deck' | 'discard' | 'announced')[]; // Controls where this counter can be placed
}


/**
 * Represents a single card, token, or counter in the game.
 */
export interface Card {
  id: string;
  deck: DeckType | SpecialItemType;
  name: string;
  imageUrl: string; // The primary Cloudinary URL.
  fallbackImage: string; // The local fallback image path.
  power: number;
  powerModifier?: number; // Adjustment to the base power.
  ability: string;
  flavorText?: string;
  color?: string; // Used for counters or simple tokens to define their display color.
  ownerId?: number; // Player ID of the card's original owner.
  ownerName?: string; // Display name of the card's original owner.
  statuses?: CardStatus[]; // Status effects applied to the card on the board.
  isFaceDown?: boolean; // True if the card is played face-down on the board.
  revealedTo?: 'all' | number[]; // Defines who can see this card when it's in hand or face-down.
  types?: string[]; // The types associated with the card (e.g. ["Unit", "SynchroTech"], ["Command"]).
  faction?: string; // The faction this card belongs to (for deck building colors).
  allowedPanels?: string[]; // Controls visibility in UI panels (e.g. 'DECK_BUILDER', 'TOKEN_PANEL')
  enteredThisTurn?: boolean; // True if the card entered the battlefield during the current turn
  abilityUsedInPhase?: number; // Stores the phase index where the ability was last used
}

/**
 * Represents a player in the game.
 */
export interface Player {
  id: number;
  name: string;
  score: number;
  hand: Card[];
  deck: Card[];
  discard: Card[];
  announcedCard?: Card | null;
  selectedDeck: DeckType;
  color: PlayerColor;
  isDummy?: boolean; // True if this is a dummy player.
  isDisconnected?: boolean; // True if the player has disconnected but can rejoin.
  playerToken?: string; // A secret token for reconnecting to this player slot.
  isReady?: boolean; // For the pre-game ready check.
  teamId?: number; // The team this player belongs to.
}

/**
 * Represents a single cell on the game board.
 */
export interface Cell {
  card: Card | null;
}

/**
 * Represents the entire game board as a 2D array of cells.
 */
export type Board = Cell[][];

/**
 * Defines the possible sizes for the active grid on the game board.
 */
export type GridSize = 4 | 5 | 6 | 7;

/**
 * Represents a unique identifier for a card's location, whether on the board or in a hand.
 */
export type CardIdentifier = {
    source: 'hand' | 'board';
    ownerId: number;
    cardIndex?: number;
    boardCoords?: { row: number, col: number };
};

/**
 * Represents a request from one player to another to reveal one or more hidden cards.
 */
export interface RevealRequest {
    fromPlayerId: number;
    toPlayerId: number;
    cardIdentifiers: CardIdentifier[];
}

/**
 * Data structure for sharing board highlights between players.
 */
export interface HighlightData {
    type: 'row' | 'col' | 'cell';
    row?: number;
    col?: number;
    playerId: number;
    timestamp: number; // Ensures unique events for consecutive clicks
}

/**
 * Represents the complete state of the game at any given moment.
 */
export interface GameState {
  players: Player[];
  board: Board;
  activeGridSize: GridSize;
  gameId: string | null;
  dummyPlayerCount: number;
  isGameStarted: boolean;
  gameMode: GameMode;
  isPrivate: boolean;
  isReadyCheckActive: boolean;
  revealRequests: RevealRequest[];
  activeTurnPlayerId?: number;
  currentPhase: number; // 0 to 4 representing the index in TURN_PHASES
}

/**
 * Defines the data structure for an item being dragged.
 */
export interface DragItem {
  card: Card;
  source: 'hand' | 'board' | 'discard' | 'token_panel' | 'counter_panel' | 'deck' | 'announced';
  playerId?: number; // The ID of the player who owns the source location (hand, deck, etc.).
  boardCoords?: { row: number; col: number }; // Original coordinates if dragged from the board.
  cardIndex?: number; // Original index if dragged from an array (hand, discard, deck).
  statusType?: string; // For counters: the type of status (e.g., 'Aim', 'Power+')
  count?: number; // For counters: how many are being dragged/applied
  bypassOwnershipCheck?: boolean; // If true, allows moving cards owned by others (e.g. Destroy effects)
  isManual?: boolean; // True if the drag was initiated manually by the user (vs an ability effect)
}

/**
 * Defines the data structure for a potential drop location.
 */
export interface DropTarget {
    target: 'hand' | 'board' | 'deck' | 'discard' | 'announced';
    playerId?: number; // The ID of the player who owns the target location.
    boardCoords?: { row: number; col: number }; // Target coordinates if dropping on the board.
    deckPosition?: 'top' | 'bottom'; // Target position if dropping on a deck.
    cardIndex?: number; // Target index if dropping on a specific card in a list (e.g. hand).
}

/**
 * Represents a card entry in a custom deck file.
 */
export interface CustomDeckCard {
  cardId: string;
  quantity: number;
}

/**
 * Represents the structure of a saved custom deck file.
 */
export interface CustomDeckFile {
  deckName: string;
  cards: CustomDeckCard[];
}

/**
 * Defines the types of items that can appear in a context menu.
 */
export type ContextMenuItem =
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
 * Defines the parameters required to open a context menu.
 */
export type ContextMenuParams = {
  x: number;
  y: number;
  type: 'boardItem' | 'handCard' | 'discardCard' | 'deckPile' | 'discardPile' | 'token_panel_item' | 'deckCard' | 'announcedCard' | 'emptyBoardCell';
  data: any; // Context-specific data (e.g. card, player, coordinates).
}

/**
 * Represents the state of a cursor dragging or placing a stack of counters.
 */
export interface CursorStackState {
    type: string; 
    count: number; 
    isDragging: boolean;
    sourceCoords?: {row: number, col: number}; // Origin for ability tracking
    targetOwnerId?: number; // Optional restriction for 'Revealed' token usage (Recon Drone) - Inclusive
    excludeOwnerId?: number; // Optional restriction - Exclusive (e.g. Vigilant Spotter: Don't reveal self)
    onlyOpponents?: boolean; // Optional restriction - Exclusive (Don't reveal self OR teammates)
    onlyFaceDown?: boolean;  // Optional restriction - Only cards that are currently hidden (Face down or unrevealed hand)
}