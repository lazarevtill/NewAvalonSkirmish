/**
 * @file Renders a modal for joining an existing game.
 */

import React, { useState } from 'react';

/**
 * Props for the JoinGameModal component.
 */
interface JoinGameModalProps {
  isOpen: boolean;
  onClose: () => void;
  onJoin: (gameId: string) => void;
  games: { gameId: string; playerCount: number }[];
}

/**
 * A modal that allows users to join a game either by selecting from a list of
 * active games or by entering a game ID manually.
 * @param {JoinGameModalProps} props The properties for the component.
 * @returns {React.ReactElement | null} The rendered modal or null if not open.
 */
export const JoinGameModal: React.FC<JoinGameModalProps> = ({ isOpen, onClose, onJoin, games }) => {
  const [gameIdInput, setGameIdInput] = useState('');

  if (!isOpen) return null;
  
  /**
   * Handles the join action when the user provides a game ID manually.
   */
  const handleJoinWithCode = () => {
    if (gameIdInput.trim()) {
      onJoin(gameIdInput.trim().toUpperCase());
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-[5px]">
      <div className="bg-gray-800 rounded-lg p-6 shadow-xl w-full max-w-6xl flex flex-col max-h-[calc(100vh-10px)]">
        <h2 className="text-2xl font-bold mb-4 flex-shrink-0">Join an Existing Game</h2>
        
        {/* List of active games */}
        <h3 className="text-lg font-semibold text-gray-300 mb-2 flex-shrink-0">Active Games</h3>
        <div className="flex-grow overflow-y-auto pr-2 border-b border-gray-700 pb-4 mb-4 custom-scrollbar min-h-[100px]">
            {games.length > 0 ? (
                <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {games.map(game => (
                        <li key={game.gameId}>
                            <button
                                onClick={() => onJoin(game.gameId)}
                                className="w-full text-left p-4 bg-gray-700 hover:bg-indigo-600 hover:border-indigo-400 border border-gray-600 rounded-lg transition-all shadow-md group flex flex-col gap-2"
                            >
                                <div className="flex justify-between items-center w-full">
                                    <span className="text-xs font-bold text-gray-400 group-hover:text-indigo-200 uppercase tracking-wider">Game ID</span>
                                    <span className="bg-gray-800 px-2 py-1 rounded-full text-xs font-bold border border-gray-600 group-hover:border-indigo-300">
                                        {game.playerCount} / 4
                                    </span>
                                </div>
                                <span className="block font-mono text-xl text-indigo-300 group-hover:text-white font-bold truncate">
                                    {game.gameId}
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            ) : (
                <div className="flex items-center justify-center h-full min-h-[150px]">
                    <p className="text-gray-400 text-center opacity-70">
                        No active games found. <br/> 
                        <span className="text-sm">Why not create one?</span>
                    </p>
                </div>
            )}
        </div>

        {/* Manual join input */}
        <div className="flex-shrink-0">
            <h3 className="text-lg font-semibold text-gray-300 mb-2">Or Join with Code</h3>
            <div className="flex space-x-2">
                <input
                    type="text"
                    value={gameIdInput}
                    onChange={(e) => setGameIdInput(e.target.value)}
                    placeholder="Enter Game ID"
                    className="flex-grow bg-gray-700 border border-gray-600 text-white font-mono rounded-lg p-2 focus:ring-indigo-500 focus:border-indigo-500"
                    onKeyUp={(e) => e.key === 'Enter' && handleJoinWithCode()}
                />
                <button
                    onClick={handleJoinWithCode}
                    disabled={!gameIdInput.trim()}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
                >
                    Join
                </button>
            </div>

            <div className="flex justify-end mt-6">
              <button type="button" onClick={onClose} className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-6 rounded transition-colors">
                Cancel
              </button>
            </div>
        </div>
      </div>
    </div>
  );
};