/**
 * @file This file reads the master `decks.json` file and processes it into the data structures
 * used by the application. It serves as the single source of truth for all card and deck data
 * for both the client and the server.
 */

import type { Card, CounterDefinition } from './types';
import { DeckType } from './types';
import rawJsonDataImport from './decks.json';

// --- Type assertion for the imported JSON data ---
interface RawDecksJson {
  cardDatabase: Record<string, Omit<Card, 'id' | 'deck'>>;
  tokenDatabase: Record<string, Omit<Card, 'id' | 'deck'>>;
  countersDatabase: Record<string, Omit<CounterDefinition, 'id'>>;
  deckFiles: {
    id: DeckType;
    name: string;
    isSelectable: boolean;
    cards: { cardId: string; quantity: number }[];
  }[];
}

const { cardDatabase: rawCardDb, tokenDatabase: rawTokenDb, countersDatabase: rawCountersDb, deckFiles: df } = rawJsonDataImport as RawDecksJson;

// Export raw data for server synchronization
export const rawJsonData = rawJsonDataImport;

// Base definition of a card, without instance-specific properties like id or deck.
export type CardDefinition = Omit<Card, 'id' | 'deck'>;

// --- Exported Data Structures ---

// A Map of all base card definitions, keyed by cardId.
export const cardDatabase = new Map<string, CardDefinition>(Object.entries(rawCardDb));

// A Map of all token definitions, keyed by tokenId.
export const tokenDatabase = new Map<string, CardDefinition>(Object.entries(rawTokenDb));

// A Map of all counter definitions.
export const countersDatabase = rawCountersDb;

// An array of deck file definitions, used for deck selection and building.
export const deckFiles = df;

// A Set of card IDs that are considered "Command" cards for special handling.
export const commandCardIds = new Set([
    'overwatch',
    'repositioning',
    'mobilization',
    'inspiration',
    'dataInterception',
]);

type DecksData = Record<string, Card[]>;

/**
 * Processes the raw JSON data into a complete, playable deck data structure.
 * It combines card definitions with deck lists, expands card quantities,
 * and generates unique, dynamic IDs for each card instance.
 * @returns {DecksData} The fully constructed deck data object.
 */
function buildDecksData(): DecksData {
    const builtDecks: DecksData = {};

    for (const deckFile of deckFiles) {
        const deckCardList: Card[] = [];

        // Iterate through the card list in the deck definition file
        for (const deckEntry of deckFile.cards) {
            const cardDef = cardDatabase.get(deckEntry.cardId);
            if (!cardDef) {
                console.warn(`Card definition not found for ID: ${deckEntry.cardId} in deck: ${deckFile.name}`);
                continue;
            }

            const isCommandCard = commandCardIds.has(deckEntry.cardId);

            // Add the specified quantity of each card to the deck
            for (let i = 0; i < deckEntry.quantity; i++) {
                const cardKey = deckEntry.cardId.toUpperCase().replace(/-/g, '_');
                
                if (isCommandCard) {
                    deckCardList.push({
                        ...cardDef,
                        deck: DeckType.Command,
                        id: `CMD_${cardKey}`,
                        faction: cardDef.faction || 'Command',
                    });
                } else {
                    deckCardList.push({
                        ...cardDef,
                        deck: deckFile.id,
                        id: `${deckFile.id.substring(0, 3).toUpperCase()}_${cardKey}_${i + 1}`,
                        faction: cardDef.faction || deckFile.id,
                    });
                }
            }
        }
        
        builtDecks[deckFile.id] = deckCardList;
    }

    // Add the special "Tokens" deck, which is built from the token database.
    // Explicitly ensures that all tokens have the 'Device' type added to their list.
    builtDecks[DeckType.Tokens] = Array.from(tokenDatabase.values()).map(tokenDef => {
         const types = tokenDef.types ? [...tokenDef.types] : ['Unit'];
         if (!types.includes('Device')) {
             types.push('Device');
         }
         
         return {
             id: `TKN_${tokenDef.name.toUpperCase().replace(/\s/g, '_')}`,
             deck: DeckType.Tokens,
             name: tokenDef.name,
             imageUrl: tokenDef.imageUrl,
             fallbackImage: tokenDef.fallbackImage,
             power: tokenDef.power,
             ability: tokenDef.ability,
             color: tokenDef.color,
             types: types,
             flavorText: tokenDef.flavorText,
             faction: 'Tokens',
         };
    });


    return builtDecks;
}

// The primary data structure used by the app to create decks for players.
export const decksData: DecksData = buildDecksData();

// --- Utility Functions ---

/**
 * A utility function to get all selectable deck definitions for the UI.
 * @returns An array of deck file definitions that are marked as selectable.
 */
export const getSelectableDecks = () => {
    return deckFiles.filter(df => df.isSelectable);
};

/**
 * Retrieves a card's base definition by its ID from the master card database.
 * @param {string} cardId The ID of the card (e.g., 'ipDeptAgent').
 * @returns {CardDefinition | undefined} The card definition or undefined if not found.
 */
export function getCardDefinition(cardId: string): CardDefinition | undefined {
    return cardDatabase.get(cardId);
}

/**
 * Helper to find a card definition by its name (fuzzy match).
 * @param {string} name The name of the card.
 * @returns {CardDefinition | undefined}
 */
export function getCardDefinitionByName(name: string): CardDefinition | undefined {
    return Array.from(cardDatabase.values()).find(c => c.name === name);
}

/**
 * Retrieves a list of all non-token cards for use in the deck builder library.
 * @returns An array of objects, each containing the card's ID and its definition.
 */
export function getAllCards(): { id: string, card: CardDefinition }[] {
    return Array.from(cardDatabase.entries()).map(([id, card]) => ({ id, card }));
}