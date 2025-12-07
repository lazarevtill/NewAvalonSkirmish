# Project Structure

## Root Files

- `App.tsx`: Main application component, orchestrates all game logic and UI
- `index.tsx`: React entry point, renders App with providers
- `index.html`: HTML entry point
- `types.ts`: Comprehensive type definitions for the entire application
- `constants.ts`: Game constants, player colors, status icons, utility functions
- `contentDatabase.ts` / `contentDatabase.json`: Card definitions, deck lists, counters database
- `server.js`: WebSocket server for multiplayer, game state management, logging
- `metadata.json`: Application metadata

## Folder Organization

### `/components`

React components for UI elements. Each component is self-contained in a single `.tsx` file.

**Key components:**

- `GameBoard.tsx`: Main game board grid
- `PlayerPanel.tsx`: Player hand, deck, discard pile display
- `Header.tsx`: Top navigation and game controls
- `MainMenu.tsx`: Initial menu for creating/joining games
- Modal components: `*Modal.tsx` files for various game interactions
- `Card.tsx`: Reusable card display component
- `ContextMenu.tsx`: Right-click context menu system
- `Tooltip.tsx`: Hover tooltips for cards and statuses

### `/hooks`

Custom React hooks for game logic separation:

- `useGameState.ts`: Core game state management and WebSocket communication
- `useAppAbilities.ts`: Ability activation and execution logic
- `useAppCommand.ts`: Command card logic (multi-step actions)
- `useAppCounters.ts`: Counter/status placement logic

### `/contexts`

React context providers:

- `DecksContext.tsx`: Manages custom deck loading and storage
- `LanguageContext.tsx`: Internationalization and translation management

### `/locales`

Internationalization files:

- `index.ts`: Exports all translations
- `types.ts`: Translation key type definitions
- `ru.ts`: Russian translations (English is default/inline)

### `/utils`

Utility functions and game logic:

- `autoAbilities.ts`: Ability parsing and automatic execution
- `boardUtils.ts`: Board state calculations and validations
- `commandLogic.ts`: Command card execution logic
- `targeting.ts`: Target validation and calculation for abilities
- `textFormatters.ts`: Text formatting utilities

### `/docs`

Production build output for GitHub Pages deployment. Contains compiled assets.

### `/.kiro`

Kiro IDE configuration and steering files.

## Architecture Patterns

### State Management

- Single source of truth in `useGameState` hook
- WebSocket synchronization for multiplayer
- Local state in components for UI-only concerns
- Context for cross-cutting concerns (decks, language)

### Component Patterns

- Functional components with hooks (no class components)
- Props drilling minimized via hooks and contexts
- Modal components controlled by parent state
- Drag-and-drop using native HTML5 APIs

### Type Safety

- All game entities defined in `types.ts`
- Strict null checks and index access validation
- Enums for fixed sets (DeckType, GameMode, etc.)
- Interface-based contracts for complex objects

### Code Organization

- Logic extracted to custom hooks for reusability
- Utility functions in `/utils` for pure logic
- Components focus on rendering and user interaction
- Server logic completely separate in `server.js`

## File Naming Conventions

- Components: PascalCase (e.g., `GameBoard.tsx`)
- Hooks: camelCase with `use` prefix (e.g., `useGameState.ts`)
- Utilities: camelCase (e.g., `boardUtils.ts`)
- Types: PascalCase for interfaces/types, camelCase for files
- Constants: UPPER_SNAKE_CASE for values, camelCase for files

## Import Patterns

- Relative imports for local files (e.g., `./components/Card`)
- Type imports use `import type` syntax
- Barrel exports avoided (direct imports preferred)
- No path aliases configured (use relative paths)
