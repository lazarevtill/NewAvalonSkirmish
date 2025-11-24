/**
 * @file Renders a modal for players to confirm they are ready to start the game.
 */
import React from 'react';
import type { Player } from '../types';

interface ReadyCheckModalProps {
  players: Player[];
  localPlayer: Player;
  onReady: () => void;
  onCancel: () => void;
}

/**
 * A modal that displays the ready status of all players and allows the local
 * player to signal their readiness to start the game.
 * @param {ReadyCheckModalProps} props The properties for the component.
 * @returns {React.ReactElement} The rendered modal.
 */
export const ReadyCheckModal: React.FC<ReadyCheckModalProps> = ({ players, localPlayer, onReady, onCancel }) => {
  const handleReadyClick = () => {
    if (!localPlayer.isReady) {
      onReady();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-8 shadow-xl w-full max-w-md">
        <h2 className="text-2xl font-bold mb-4 text-center">Ready to Start?</h2>
        <p className="text-gray-400 text-center mb-6">The game will begin once all players are ready. You can still change your name and deck.</p>

        <ul className="space-y-3 mb-8">
          {players.map(player => (
            <li key={player.id} className="flex items-center justify-between bg-gray-700 p-3 rounded-lg">
              <span className="font-medium">{player.name} {player.id === localPlayer.id && '(You)'}</span>
              {player.isReady ? (
                <span className="flex items-center text-green-400">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Ready
                </span>
              ) : (
                <span className="flex items-center text-yellow-400">
                   <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1 animate-pulse" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 102 0V6zM9 14a1 1 0 112 0 1 1 0 01-2 0z" clipRule="evenodd" />
                  </svg>
                  Waiting...
                </span>
              )}
            </li>
          ))}
        </ul>
        
        <div className="flex flex-col space-y-3">
            <button
              onClick={handleReadyClick}
              disabled={localPlayer.isReady}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded disabled:bg-gray-500 disabled:cursor-not-allowed transition-colors text-lg"
            >
              {localPlayer.isReady ? "Waiting for others..." : "I'm Ready"}
            </button>
            
            <button
              onClick={onCancel}
              className="w-full bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded transition-colors"
            >
              Cancel Start
            </button>
        </div>
      </div>
    </div>
  );
};