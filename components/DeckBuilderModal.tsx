/**
 * @file Renders a modal for creating and editing custom decks.
 */
import React, { useState, useMemo, useRef } from 'react';
import type { CustomDeckFile, Player, Card } from '../types';
import { DeckType } from '../types';
import { getAllCards, getSelectableDecks, getCardDefinition, commandCardIds } from '../contentDatabase';
import { Card as CardComponent } from './Card';

interface DeckBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  setViewingCard: React.Dispatch<React.SetStateAction<{ card: Card; player?: Player; } | null>>;
}

const allCards = getAllCards();
const selectableFactions = getSelectableDecks();
const MAX_DECK_SIZE = 100;

/**
 * Validates the content of a loaded deck file.
 */
const validateDeckData = (data: any): { isValid: true, deckFile: CustomDeckFile } | { isValid: false, error: string } => {
    if (typeof data.deckName !== 'string' || !Array.isArray(data.cards)) {
        return { isValid: false, error: "Invalid file structure. Must have 'deckName' (string) and 'cards' (array)." };
    }

    let totalCards = 0;
    for (const card of data.cards) {
        if (typeof card.cardId !== 'string' || typeof card.quantity !== 'number' || card.quantity < 1 || !Number.isInteger(card.quantity)) {
            return { isValid: false, error: `Invalid card entry: ${JSON.stringify(card)}` };
        }
        if (!getCardDefinition(card.cardId)) {
            return { isValid: false, error: `Card with ID '${card.cardId}' does not exist.` };
        }
        totalCards += card.quantity;
    }

    if (totalCards > MAX_DECK_SIZE) {
        return { isValid: false, error: `Deck exceeds the ${MAX_DECK_SIZE} card limit (found ${totalCards} cards).` };
    }
     if (totalCards === 0 && data.cards.length > 0) {
        return { isValid: false, error: `Deck contains cards with zero quantity.` };
    }

    return { isValid: true, deckFile: data as CustomDeckFile };
};

/**
 * A modal that provides a full-featured interface for building custom decks.
 */
export const DeckBuilderModal: React.FC<DeckBuilderModalProps> = ({ isOpen, onClose, setViewingCard }) => {
  const [deckName, setDeckName] = useState('My Custom Deck');
  const [currentDeck, setCurrentDeck] = useState<Map<string, number>>(new Map());
  const [selectedFactionFilter, setSelectedFactionFilter] = useState<string>('All');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sortedCards = useMemo(() => {
      let cards = allCards;
      if (selectedFactionFilter !== 'All') {
          cards = cards.filter(c => {
              if (selectedFactionFilter === 'Command') {
                  return commandCardIds.has(c.id) || c.card.types?.includes('Command');
              }
              // For standard factions
              return c.card.faction === selectedFactionFilter;
          });
      }
      return cards.sort((a, b) => a.card.name.localeCompare(b.card.name));
  }, [selectedFactionFilter]);

  const totalCards = useMemo(() => {
      let total = 0;
      currentDeck.forEach(qty => total += qty);
      return total;
  }, [currentDeck]);

  const handleAddCard = (cardId: string) => {
      if (totalCards >= MAX_DECK_SIZE) {
          alert(`Deck cannot exceed ${MAX_DECK_SIZE} cards.`);
          return;
      }
      setCurrentDeck(prev => {
          const newDeck = new Map(prev);
          const currentQty = newDeck.get(cardId) || 0;
          if (currentQty < 3) { // Limit 3 copies per card
               newDeck.set(cardId, currentQty + 1);
          }
          return newDeck;
      });
  };

  const handleRemoveCard = (cardId: string) => {
      setCurrentDeck(prev => {
          const newDeck = new Map(prev);
          const currentQty = newDeck.get(cardId) || 0;
          if (currentQty > 1) {
              newDeck.set(cardId, currentQty - 1);
          } else {
              newDeck.delete(cardId);
          }
          return newDeck;
      });
  };

  const handleClearDeck = () => {
      if (confirm('Are you sure you want to clear the current deck?')) {
          setCurrentDeck(new Map());
          setDeckName('My Custom Deck');
      }
  };

  const handleSaveDeck = () => {
      if (totalCards === 0) {
          alert("Cannot save an empty deck.");
          return;
      }
      
      const deckData: CustomDeckFile = {
          deckName: deckName.trim() || 'Untitled Deck',
          cards: Array.from(currentDeck.entries()).map(([cardId, quantity]) => ({ cardId, quantity }))
      };

      const blob = new Blob([JSON.stringify(deckData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${deckData.deckName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  };

  const handleLoadDeckClick = () => {
      fileInputRef.current?.click();
  };

  const handleFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
          try {
              const text = e.target?.result as string;
              const json = JSON.parse(text);
              const validation = validateDeckData(json);
              
              if (!validation.isValid) {
                  alert((validation as { error: string }).error);
                  return;
              }

              const { deckFile } = validation;
              setDeckName(deckFile.deckName);
              const newDeck = new Map<string, number>();
              deckFile.cards.forEach(c => newDeck.set(c.cardId, c.quantity));
              setCurrentDeck(newDeck);

          } catch (err) {
              alert("Failed to parse deck file.");
          } finally {
              if (event.target) event.target.value = '';
          }
      };
      reader.readAsText(file);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50">
       <div className="bg-gray-900 w-full h-full md:w-[95vw] md:h-[90vh] md:rounded-xl flex flex-col overflow-hidden shadow-2xl border border-gray-700">
           {/* Header */}
           <div className="bg-gray-800 p-4 border-b border-gray-700 flex justify-between items-center flex-shrink-0">
               <div className="flex items-center gap-4">
                   <h2 className="text-2xl font-bold text-white">Deck Builder</h2>
                   <input 
                      type="text" 
                      value={deckName} 
                      onChange={(e) => setDeckName(e.target.value)}
                      className="bg-gray-700 text-white px-3 py-1 rounded border border-gray-600 focus:outline-none focus:border-indigo-500 font-bold"
                      placeholder="Deck Name"
                   />
               </div>
               <div className="flex items-center gap-2">
                   <button onClick={handleClearDeck} className="px-4 py-2 bg-red-900 hover:bg-red-800 text-white rounded text-sm font-bold transition-colors">Clear</button>
                   <button onClick={handleLoadDeckClick} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm font-bold transition-colors">Load</button>
                   <input type="file" ref={fileInputRef} onChange={handleFileSelected} accept=".json" className="hidden" />
                   <button onClick={handleSaveDeck} className="px-4 py-2 bg-green-700 hover:bg-green-600 text-white rounded text-sm font-bold transition-colors">Save</button>
                   <div className="w-px h-8 bg-gray-600 mx-2"></div>
                   <button onClick={onClose} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm font-bold transition-colors">Close</button>
               </div>
           </div>

           {/* Content */}
           <div className="flex flex-grow overflow-hidden">
               {/* Left: Library */}
               <div className="flex-grow flex flex-col p-4 overflow-hidden border-r border-gray-700 bg-gray-900/50">
                   <div className="mb-4 flex items-center gap-2">
                       <label className="text-gray-400 font-bold text-sm">Filter:</label>
                       <select 
                          value={selectedFactionFilter} 
                          onChange={(e) => setSelectedFactionFilter(e.target.value)}
                          className="bg-gray-800 text-white border border-gray-600 rounded px-2 py-1 text-sm focus:outline-none focus:border-indigo-500"
                       >
                           <option value="All">All Factions</option>
                           {selectableFactions.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                           <option value="Command">Command Cards</option>
                       </select>
                       <span className="ml-auto text-gray-500 text-xs">Right-click to view card details</span>
                   </div>
                   
                   <div className="flex-grow overflow-y-auto pr-2">
                       <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                           {sortedCards.map(({id, card}) => {
                               // Convert card definition to a full card object for the component
                               // We need a dummy ID and deck type for rendering
                               const displayCard: Card = {
                                   ...card,
                                   id: id,
                                   deck: card.faction as DeckType || DeckType.Custom, 
                                   ownerId: 0
                               };
                               
                               return (
                                   <div 
                                      key={id} 
                                      className="relative group cursor-pointer"
                                      onClick={() => handleAddCard(id)}
                                      onContextMenu={(e) => {
                                          e.preventDefault();
                                          setViewingCard({ card: displayCard });
                                      }}
                                   >
                                       <div className="w-full aspect-square transition-transform duration-100 hover:scale-105 hover:shadow-lg hover:z-10">
                                            <CardComponent 
                                                card={displayCard} 
                                                isFaceUp={true} 
                                                playerColorMap={new Map()} 
                                                disableTooltip={true} // Use custom tooltip or rely on right-click view
                                            />
                                       </div>
                                       <div className="absolute bottom-0 left-0 right-0 bg-black/80 text-white text-xs text-center py-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                           Add to Deck
                                       </div>
                                   </div>
                               );
                           })}
                       </div>
                   </div>
               </div>

               {/* Right: Current Deck */}
               <div className="w-80 md:w-96 bg-gray-800 flex flex-col border-l border-gray-700 flex-shrink-0">
                   <div className="p-4 bg-gray-800 border-b border-gray-600">
                       <h3 className="text-xl font-bold text-white">Current Deck</h3>
                       <p className={`text-sm font-bold mt-1 ${totalCards > MAX_DECK_SIZE ? 'text-red-500' : 'text-indigo-400'}`}>
                           {totalCards} / {MAX_DECK_SIZE} Cards
                       </p>
                   </div>
                   <div className="flex-grow overflow-y-auto p-2 space-y-2">
                       {currentDeck.size === 0 && (
                           <div className="text-center text-gray-500 mt-10">
                               <p>Your deck is empty.</p>
                               <p className="text-xs mt-2">Click cards on the left to add them.</p>
                           </div>
                       )}
                       {Array.from(currentDeck.entries()).map(([cardId, quantity]) => {
                           const cardDef = getCardDefinition(cardId);
                           if (!cardDef) return null;
                           
                           const displayCard: Card = {
                               ...cardDef,
                               id: cardId,
                               deck: cardDef.faction as DeckType || DeckType.Custom, 
                               ownerId: 0
                           };

                           return (
                               <div key={cardId} className="flex items-center bg-gray-700 rounded p-2 group hover:bg-gray-600 transition-colors select-none">
                                   <div 
                                      className="w-12 h-12 flex-shrink-0 mr-3 cursor-pointer"
                                      onContextMenu={(e) => {
                                          e.preventDefault();
                                          setViewingCard({ card: displayCard });
                                      }}
                                   >
                                       <CardComponent card={displayCard} isFaceUp={true} playerColorMap={new Map()} disableTooltip={true} />
                                   </div>
                                   <div className="flex-grow min-w-0">
                                       <div className="font-bold text-sm text-white truncate">{cardDef.name}</div>
                                       <div className="text-xs text-gray-400 truncate">{cardDef.faction}</div>
                                   </div>
                                   <div className="flex items-center gap-2 ml-2">
                                       <button 
                                          onClick={() => handleRemoveCard(cardId)}
                                          className="w-6 h-6 flex items-center justify-center bg-gray-800 hover:bg-red-900 text-gray-300 rounded text-sm font-bold"
                                          title="Remove one"
                                       >
                                           -
                                       </button>
                                       <span className="font-bold text-white w-4 text-center">{quantity}</span>
                                       <button 
                                          onClick={() => handleAddCard(cardId)}
                                          className="w-6 h-6 flex items-center justify-center bg-gray-800 hover:bg-green-900 text-gray-300 rounded text-sm font-bold"
                                          title="Add one"
                                          disabled={quantity >= 3}
                                       >
                                           +
                                       </button>
                                   </div>
                               </div>
                           );
                       })}
                   </div>
               </div>
           </div>
       </div>
    </div>
  );
};
