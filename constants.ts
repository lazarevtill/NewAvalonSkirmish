/**
 * @file Defines constants and utility functions used across the application.
 */

import type { Card, DeckType, PlayerColor } from './types';
import { DeckType as DeckTypeEnum } from './types';
import { countersDatabase } from './decks';

/**
 * A mapping of deck types to their thematic properties, like color and ID prefix.
 */
export const DECK_THEMES: { [key in DeckType]: { prefix: string, color: string } } = {
    [DeckTypeEnum.SynchroTech]: { prefix: 'SYN', color: 'border-cyan-400' },
    [DeckTypeEnum.Hoods]: { prefix: 'HOO', color: 'border-purple-500' },
    [DeckTypeEnum.Optimates]: { prefix: 'OPT', color: 'border-red-500' },
    [DeckTypeEnum.Fusion]: { prefix: 'FUS', color: 'border-green-400' },
    [DeckTypeEnum.Command]: { prefix: 'CMD', color: 'border-yellow-500' },
    [DeckTypeEnum.Tokens]: { prefix: 'TKN', color: 'border-gray-400' },
    [DeckTypeEnum.Custom]: { prefix: 'CUS', color: 'border-purple-400' },
};

/**
 * Defines the available player colors and their corresponding Tailwind CSS classes.
 * 'glow' provides an outer-glow box-shadow effect.
 */
export const PLAYER_COLORS: { [key in PlayerColor]: { bg: string, border: string, outline: string, glow: string } } = {
  blue: { bg: 'bg-blue-600', border: 'border-blue-600', outline: 'outline-blue-600', glow: 'shadow-[0_0_15px_#2563eb]' },
  purple: { bg: 'bg-purple-600', border: 'border-purple-600', outline: 'outline-purple-600', glow: 'shadow-[0_0_15px_#9333ea]' },
  red: { bg: 'bg-red-600', border: 'border-red-600', outline: 'outline-red-600', glow: 'shadow-[0_0_15px_#dc2626]' },
  green: { bg: 'bg-green-600', border: 'border-green-600', outline: 'outline-green-600', glow: 'shadow-[0_0_15px_#16a34a]' },
  yellow: { bg: 'bg-yellow-500', border: 'border-yellow-500', outline: 'outline-yellow-500', glow: 'shadow-[0_0_15px_#eab308]' },
  orange: { bg: 'bg-orange-500', border: 'border-orange-500', outline: 'outline-orange-500', glow: 'shadow-[0_0_15px_#f97316]' },
  pink: { bg: 'bg-pink-500', border: 'border-pink-500', outline: 'outline-pink-500', glow: 'shadow-[0_0_15px_#ec4899]' },
  brown: { bg: 'bg-[#8B4513]', border: 'border-[#8B4513]', outline: 'outline-[#8B4513]', glow: 'shadow-[0_0_15px_#8B4513]' },
};

/**
 * An array of all available player color names in the specific UI order requested.
 */
export const PLAYER_COLOR_NAMES: PlayerColor[] = ['blue', 'purple', 'red', 'green', 'yellow', 'orange', 'pink', 'brown'];

/**
 * The sequence of phases in a player's turn.
 */
export const TURN_PHASES = [
    'Setup',
    'Command Phase #1',
    'Deploy',
    'Command Phase #2',
    'Commit'
];

/**
 * Image URLs for status icons.
 */
export const STATUS_ICONS: Record<string, string> = Object.fromEntries(
    Object.entries(countersDatabase).map(([key, def]) => [key, def.imageUrl])
);

/**
 * Descriptions for various status effects and counters.
 */
export const STATUS_DESCRIPTIONS: Record<string, string> = Object.fromEntries(
    Object.entries(countersDatabase).map(([key, def]) => [key, def.description])
);

/**
 * Available counters for the Counters Modal, sorted by sortOrder.
 * Filters counters to only show those allowed in the COUNTER_PANEL.
 */
export const AVAILABLE_COUNTERS = Object.entries(countersDatabase)
    .filter(([, def]) => !def.allowedPanels || def.allowedPanels.includes('COUNTER_PANEL'))
    .sort(([, a], [, b]) => a.sortOrder - b.sortOrder)
    .map(([key, def]) => ({ type: key, label: def.name }));

/**
 * An array of predefined counter items that can be placed on cards.
 */
export const COUNTERS: Card[] = [
    { id: 'CTR_BLUE', deck: 'counter', name: 'Blue Counter', imageUrl: '', fallbackImage: '', power: 0, ability: '', color: 'bg-blue-500' },
    { id: 'CTR_PURPLE', deck: 'counter', name: 'Purple Counter', imageUrl: '', fallbackImage: '', power: 0, ability: '', color: 'bg-purple-500' },
    { id: 'CTR_RED', deck: 'counter', name: 'Red Counter', imageUrl: '', fallbackImage: '', power: 0, ability: '', color: 'bg-red-500' },
    { id: 'CTR_GREEN', deck: 'counter', name: 'Green Counter', imageUrl: '', fallbackImage: '', power: 0, ability: '', color: 'bg-green-500' },
];

/**
 * Shuffles an array of cards using the Fisher-Yates (aka Knuth) shuffle algorithm.
 * This function is pure; it returns a new shuffled array without modifying the original.
 * @param deck The array of cards to shuffle.
 * @returns A new array containing the same cards in a random order.
 */
export const shuffleDeck = (deck: Card[]): Card[] => {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

/**
 * A mapping of player IDs to their fixed positions on the screen.
 * Top positions are calculated as Header Height (h-14 = 56px) + 3px gap = 59px.
 * Bottom positions are simply 3px from bottom.
 */
export const PLAYER_POSITIONS: { [key: number]: string } = {
  1: 'top-[59px] left-2',
  2: 'top-[59px] right-2',
  3: 'bottom-[3px] left-2',
  4: 'bottom-[3px] right-2',
};