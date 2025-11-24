/**
 * @file Renders the main header bar for the application.
 */

import React from 'react';
import type { GridSize, GameMode } from '../types';
import { GameMode as GameModeEnum } from '../types';
import type { ConnectionStatus } from '../hooks/useGameState';
import { TURN_PHASES } from '../constants';

const MAX_PLAYERS = 4;

/**
 * Props for the Header component.
 */
interface HeaderProps {
  gameId: string | null;
  isGameStarted: boolean;
  onStartGame: () => void;
  onResetGame: () => void;
  activeGridSize: GridSize;
  onGridSizeChange: (size: GridSize) => void;
  dummyPlayerCount: number;
  onDummyPlayerCountChange: (count: number) => void;
  realPlayerCount: number;
  connectionStatus: ConnectionStatus;
  onExitGame: () => void;
  onOpenTokensModal: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onOpenCountersModal: (event: React.MouseEvent<HTMLButtonElement>) => void;
  gameMode: GameMode;
  onGameModeChange: (mode: GameMode) => void;
  isPrivate: boolean;
  onPrivacyChange: (isPrivate: boolean) => void;
  isHost: boolean;
  onSyncGame: () => void;
  currentPhase: number;
  onNextPhase: () => void;
  onPrevPhase: () => void;
  onSetPhase: (index: number) => void;
  isAutoAbilitiesEnabled: boolean;
  onToggleAutoAbilities: (enabled: boolean) => void;
}

/**
 * The application header, containing the game title, ID, game controls, and status indicators.
 * @param {HeaderProps} props - The properties for the component.
 * @returns {React.ReactElement} The rendered header.
 */
export const Header: React.FC<HeaderProps> = ({ 
  gameId,
  isGameStarted,
  onStartGame,
  onResetGame,
  activeGridSize, 
  onGridSizeChange,
  dummyPlayerCount,
  onDummyPlayerCountChange,
  realPlayerCount,
  connectionStatus,
  onExitGame,
  onOpenTokensModal,
  onOpenCountersModal,
  gameMode,
  onGameModeChange,
  isPrivate,
  onPrivacyChange,
  isHost,
  onSyncGame,
  currentPhase,
  onNextPhase,
  onPrevPhase,
  onSetPhase,
  isAutoAbilitiesEnabled,
  onToggleAutoAbilities,
}) => {
  const dummyOptions = [0, 1, 2, 3];

  /**
   * A small component that displays the current WebSocket connection status.
   * @returns {React.ReactElement} A visual status indicator.
   */
  const StatusIndicator = () => {
    let color = 'bg-gray-500';
    let text = 'Connecting to server...';
    if (connectionStatus === 'Connected') {
      color = 'bg-green-500 animate-pulse';
      text = 'Connected';
    } else if (connectionStatus === 'Disconnected') {
      color = 'bg-red-500';
      text = 'Disconnected. Retrying...';
    }

    return (
      <div className="flex items-center space-x-2" title={text}>
        <div className={`w-3 h-3 rounded-full ${color} transition-colors`}></div>
        <span className="text-sm text-gray-400 hidden sm:block">{connectionStatus}</span>
      </div>
    );
  };

  return (
    <header className="fixed top-0 left-0 right-0 h-14 bg-panel-bg bg-opacity-80 backdrop-blur-sm z-50 flex items-center justify-between px-4 shadow-lg">
      <div className="flex items-center space-x-4">
        <h1 className="text-xl font-bold text-indigo-400 hidden lg:block">New Avalon</h1>
        <StatusIndicator />
        <div className="flex items-center space-x-3">
          {gameId && (
            <div className="flex items-center space-x-2">
               <span className="text-sm text-gray-400 hidden md:inline">ID:</span>
               <span className="font-mono bg-gray-700 px-2 py-1 rounded text-indigo-300 w-24 md:w-44 text-center truncate">{gameId}</span>
            </div>
          )}
          <label className="flex items-center space-x-1.5 cursor-pointer hidden md:flex" title="Hidden games do not appear in the 'Join Game' list.">
              <input 
                  type="checkbox"
                  checked={isPrivate}
                  onChange={(e) => onPrivacyChange(e.target.checked)}
                  disabled={isGameStarted || !isHost}
                  className="w-4 h-4 text-indigo-600 bg-gray-700 border-gray-600 rounded focus:ring-indigo-500 disabled:opacity-70 disabled:cursor-not-allowed"
              />
              <span className="text-sm text-gray-300">Hidden</span>
          </label>
          <span className="text-gray-600 hidden md:inline">|</span>
          <button
            onClick={onOpenTokensModal}
            className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-3 rounded text-sm"
          >
            Tokens
          </button>
          <button
            onClick={onOpenCountersModal}
            className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-3 rounded text-sm"
          >
            Counters
          </button>
        </div>
      </div>

      {/* Phase Tracker (Center) */}
      {isGameStarted && (
        <div className="absolute left-1/2 transform -translate-x-1/2 flex items-center bg-gray-800 rounded-lg p-1 border border-gray-700 shadow-md">
             <button 
                onClick={onPrevPhase} 
                className="w-8 h-8 flex items-center justify-center text-gray-300 hover:text-white hover:bg-gray-700 rounded transition-colors"
                title="Previous Phase"
             >
                 {/* Custom wider left triangle */}
                 <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M15 6 L8 12 L15 18 Z" />
                 </svg>
             </button>
             <select 
                value={currentPhase}
                onChange={(e) => onSetPhase(parseInt(e.target.value))}
                className="bg-gray-800 text-white font-bold text-sm text-center border-none focus:ring-0 cursor-pointer appearance-none px-2 min-w-[120px]"
             >
                 {TURN_PHASES.map((phase, index) => (
                     <option key={index} value={index}>{phase}</option>
                 ))}
             </select>
             <button 
                onClick={onNextPhase} 
                className="w-8 h-8 flex items-center justify-center text-gray-300 hover:text-white hover:bg-gray-700 rounded transition-colors"
                title="Next Phase"
             >
                 {/* Custom wider right triangle */}
                 <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                     <path d="M9 6 L16 12 L9 18 Z" />
                 </svg>
             </button>
        </div>
      )}

      <div className="flex items-center space-x-3">
        {/* Auto-Abilities Toggle */}
        {isGameStarted && (
           <label className="flex items-center space-x-1.5 cursor-pointer bg-gray-800 px-2 py-1 rounded border border-gray-600" title="Automatically attach counters/tokens when clicking your cards.">
              <input 
                  type="checkbox"
                  checked={isAutoAbilitiesEnabled}
                  onChange={(e) => onToggleAutoAbilities(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 bg-gray-700 border-gray-600 rounded focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-300">Auto-Ability</span>
          </label>
        )}

        {isGameStarted ? (
          isHost && (
            <button
              onClick={onResetGame}
              className="bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-2 px-4 rounded text-sm hidden md:block"
            >
              New Game
            </button>
          )
        ) : (
          <button
            onClick={onStartGame}
            disabled={!isHost}
            className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded text-sm animate-pulse disabled:bg-gray-600 disabled:opacity-70 disabled:cursor-not-allowed disabled:animate-none"
          >
            Start Game
          </button>
        )}
         <div className="flex items-center space-x-2 hidden lg:flex">
          <label htmlFor="game-mode" className="text-sm font-medium text-gray-300">
            Mode:
          </label>
          <select
            id="game-mode"
            value={gameMode}
            onChange={(e) => onGameModeChange(e.target.value as GameMode)}
            disabled={isGameStarted || !isHost}
            className="bg-gray-700 border border-gray-600 text-white text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full p-2 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            <option value={GameModeEnum.FreeForAll}>FFA</option>
            <option value={GameModeEnum.TwoVTwo}>2v2</option>
            <option value={GameModeEnum.ThreeVOne}>3v1</option>
          </select>
        </div>
        <div className="flex items-center space-x-2 hidden xl:flex">
          <label htmlFor="grid-size" className="text-sm font-medium text-gray-300">
            Size:
          </label>
          <select
            id="grid-size"
            value={activeGridSize}
            onChange={(e) => onGridSizeChange(parseInt(e.target.value, 10) as GridSize)}
            disabled={isGameStarted || !isHost}
            className="bg-gray-700 border border-gray-600 text-white text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full p-2 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            <option value="4">4x4</option>
            <option value="5">5x5</option>
            <option value="6">6x6</option>
            <option value="7">7x7</option>
          </select>
        </div>
        <div className="flex items-center space-x-2 hidden xl:flex">
          <label htmlFor="dummy-players" className="text-sm font-medium text-gray-300">
            Dummies:
          </label>
          <select
            id="dummy-players"
            value={dummyPlayerCount}
            onChange={(e) => onDummyPlayerCountChange(parseInt(e.target.value, 10))}
            disabled={isGameStarted || !isHost}
            className="bg-gray-700 border border-gray-600 text-white text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full p-2 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {dummyOptions.map(option => (
              <option 
                key={option} 
                value={option}
                disabled={realPlayerCount + option > MAX_PLAYERS}
              >
                {option}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center space-x-2">
            {isHost && isGameStarted && (
            <button
                onClick={onSyncGame}
                className="bg-yellow-600 hover:bg-yellow-700 text-white font-bold p-2 rounded text-sm"
                title="Force sync game state and refresh images."
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 110 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                </svg>
            </button>
            )}
            <button
            onClick={onExitGame}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded text-sm"
            title="Return to Main Menu"
            >
            Exit
            </button>
        </div>
      </div>
    </header>
  );
};