# Technology Stack

## Frontend

- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite 6
- **Styling**: Tailwind CSS 3 with PostCSS
- **State Management**: React hooks and context (no external state library)
- **Type Safety**: Strict TypeScript configuration with comprehensive linting rules

## Backend

- **Runtime**: Node.js 18+
- **WebSocket Server**: `ws` library for real-time multiplayer
- **HTTP Server**: Native Node.js `http` module for serving static files
- **Data Storage**: In-memory game state (no database)

## Key Libraries

- `react` and `react-dom`: UI framework
- `ws`: WebSocket server for multiplayer
- `@vitejs/plugin-react`: Vite React plugin
- `tailwindcss`: Utility-first CSS framework

## TypeScript Configuration

- Strict mode enabled with comprehensive type checking
- `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch` enforced
- `noImplicitReturns` and `noUncheckedIndexedAccess` for safety
- Module resolution: `bundler` mode for Vite compatibility

## Common Commands

### Development

```bash
npm run dev          # Start Vite dev server (port 5173)
npm run server       # Start WebSocket server (production mode)
start-dev.bat        # Windows: Start dev server
start-server.bat     # Windows: Start WebSocket server
```

### Build & Deploy

```bash
npm run build        # Build for production (outputs to /docs for GitHub Pages)
npm run preview      # Preview production build locally
start-build.bat      # Windows: Build and preview
```

### Installation

```bash
npm install          # Install all dependencies
```

## Build Configuration

- **Development**: Base path `/`, runs on `localhost:5173`
- **Production**: Base path `/NewAvalonSkirmish/`, outputs to `docs/` folder for GitHub Pages
- **Code splitting**: React vendor bundle separated for better caching
- **Minification**: esbuild for fast builds
- **Target**: ES2020 for modern browser support

## Environment

- Node.js version: >=18.0.0 (specified in package.json engines)
- Shell: Windows CMD/PowerShell (batch files provided)
- No environment variables required for basic operation
