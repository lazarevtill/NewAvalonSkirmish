
/**
 * @file Renders a modal for creating and editing custom decks.
 */
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import type { CustomDeckFile, CustomDeckCard, Player, Card, ContextMenuItem } from '../types';
import { DeckType } from '../types';
import { getAllCards, getSelectableDecks, getCardDefinition, commandCardIds } from '../decks';
import type { CardDefinition } from '../decks';
import { Card as CardComponent } from './Card';
import { Tooltip, CardTooltipContent } from './Tooltip';
import { ContextMenu } from './ContextMenu';

interface DeckBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  setViewingCard: React.Dispatch<React.SetStateAction<{ card: Card; player?: Player; } | null>>;
}

const allCards = getAllCards();
const selectableFactions = getSelectableDecks();
const MAX_DECK_SIZE = 100;

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

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
  const [deckCards, setDeckCards] = useState<Map<string, number>>(new Map());
  
  // Filters for the card library
  const [searchText, setSearchText] = useState('');
  const [factionFilter, setFactionFilter] = useState<string>('all');
  const [powerFilter, setPowerFilter] = useState<string>('');
  
  // State for tooltips
  const [tooltip, setTooltip] = useState<{ x: number, y: number, cardDef: CardDefinition } | null>(null);
  const tooltipTimeoutRef = useRef<number | null>(null);

  // State for context menu
  const [contextMenu, setContextMenu] = useState<ContextMenuProps | null>(null);
  
  const totalCardCount = useMemo(() => {
    return Array.from(deckCards.values()).reduce((sum, count) => sum + count, 0);
  }, [deckCards]);

  const findFactionForCard = useCallback((cardId: string): DeckType => {
      const cardDef = getCardDefinition(cardId);
      if (cardDef && cardDef.faction && Object.values(DeckType).includes(cardDef.faction as DeckType)) {
          return cardDef.faction as DeckType;
      }
      if (commandCardIds.has(cardId)) {
          return DeckType.Command;
      }
      return DeckType.Custom;
  }, []);

  const filteredLibraryCards = useMemo(() => {
    return allCards.filter(({ id, card }) => {
      if (card.allowedPanels && !card.allowedPanels.includes('DECK_BUILDER')) {
          return false;
      }

      // Faction filter
      if (factionFilter === 'command') {
          if (!commandCardIds.has(id)) return false;
      }
      else if (factionFilter !== 'all') {
         if (card.faction) {
             if (card.faction !== factionFilter) return false;
         } else {
            const cardDeckFile = selectableFactions.find(f => f.cards.some(c => c.cardId === id));
            if (!cardDeckFile || cardDeckFile.id !== factionFilter) {
              return false;
            }
         }
      }
      // Power filter
      if (powerFilter.trim()) {
        const power = parseInt(powerFilter.trim(), 10);
        if (!isNaN(power) && card.power !== power) {
          return false;
        }
      }
      // Text search
      if (searchText.trim()) {
        const lowerSearch = searchText.toLowerCase();
        const inName = card.name.toLowerCase().includes(lowerSearch);
        const inAbility = card.ability.toLowerCase().includes(lowerSearch);
        if (!inName && !inAbility) {
          return false;
        }
      }
      return true;
    });
  }, [searchText, factionFilter, powerFilter]);

  const addCardToDeck = useCallback((cardId: string) => {
    if (totalCardCount >= MAX_DECK_SIZE) return;
    setDeckCards(prev => {
      const newDeck = new Map(prev);
      const currentQty = newDeck.get(cardId) || 0;
      newDeck.set(cardId, currentQty + 1);
      return newDeck;
    });
  }, [totalCardCount]);

  const removeCardFromDeck = useCallback((cardId: string) => {
    setDeckCards(prev => {
      const newDeck = new Map(prev);
      newDeck.delete(cardId);
      return newDeck;
    });
  }, []);

  const changeCardQuantity = useCallback((cardId: string, delta: number) => {
    setDeckCards(prev => {
      const newDeck = new Map(prev);
      const currentQty = newDeck.get(cardId) || 0;
      let newQty = currentQty + delta;
      
      const currentTotal = Array.from(newDeck.values()).reduce((sum, count) => sum + count, 0);
      const projectedTotal = currentTotal + delta;

      if (delta > 0 && projectedTotal > MAX_DECK_SIZE) {
        newQty = currentQty + (MAX_DECK_SIZE - currentTotal);
      }

      if (newQty <= 0) {
        newDeck.delete(cardId);
      } else {
        newDeck.set(cardId, newQty);
      }
      return newDeck;
    });
  }, []);
  
  const handleSaveDeck = () => {
    const cardsArray: CustomDeckCard[] = Array.from(deckCards.entries()).map(([cardId, quantity]) => ({ cardId, quantity }));
    const deckFile: CustomDeckFile = { deckName, cards: cardsArray };
    
    const blob = new Blob([JSON.stringify(deckFile, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${deckName.replace(/ /g, '_')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleLoadDeck = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const text = e.target?.result as string;
            const data = JSON.parse(text);
            const validationResult = validateDeckData(data);
            
            if ('error' in validationResult) {
                alert(`Error loading deck: ${validationResult.error}`);
            } else {
                const { deckFile } = validationResult;
                setDeckName(deckFile.deckName);
                const newDeckMap = new Map<string, number>();
                deckFile.cards.forEach(c => newDeckMap.set(c.cardId, c.quantity));
                setDeckCards(newDeckMap);
            }

        } catch (error) {
            alert(`Error reading file: ${error instanceof Error ? error.message : 'Invalid file format.'}`);
        } finally {
            if(event.target) event.target.value = '';
        }
    };
    reader.readAsText(file);
  };

  const handleViewCard = (cardId: string, cardDef: CardDefinition) => {
    const cardDeck = findFactionForCard(cardId);
    const cardForDetailView: Card = {
        ...cardDef,
        id: `detail-${cardId}`,
        deck: cardDeck,
    };
    setViewingCard({ card: cardForDetailView });
  };
  
  const handleMouseEnter = useCallback((e: React.MouseEvent, cardDef: CardDefinition) => {
    if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
    tooltipTimeoutRef.current = window.setTimeout(() => {
        setTooltip({ x: e.clientX, y: e.clientY, cardDef });
    }, 250);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setTooltip(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
    tooltipTimeoutRef.current = null;
    setTooltip(null);
  }, []);
  
  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    window.addEventListener('click', closeMenu);
    
    const handleContextMenu = (e: MouseEvent) => {
        if (!(e.target as HTMLElement).closest('[data-interactive]')) {
             closeMenu();
        }
    };
    window.addEventListener('contextmenu', handleContextMenu);

    return () => {
        window.removeEventListener('click', closeMenu);
        window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);


  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[101]" onClick={onClose}>
        <div className="bg-gray-800 rounded-lg p-6 shadow-xl w-[95vw] h-[90vh] max-w-7xl flex flex-col gap-4" onClick={e => e.stopPropagation()}>
          <div className="flex justify-between items-center flex-shrink-0">
              <h2 className="text-3xl font-bold">Deck Builder</h2>
              <button onClick={onClose} className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded">Close</button>
          </div>

          <div className="flex-grow flex gap-6 min-h-0">
              {/* Left Side: Current Deck */}
              <div className="w-1/3 bg-gray-900 rounded-lg p-4 flex flex-col">
                  <div className="flex-shrink-0 mb-4 space-y-3">
                      <input 
                          type="text"
                          value={deckName}
                          onChange={e => setDeckName(e.target.value)}
                          placeholder="Deck Name"
                          className="w-full bg-gray-700 border border-gray-600 text-white font-bold text-lg rounded-lg p-2 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                      <div className="flex space-x-2">
                          <button onClick={handleSaveDeck} className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-3 rounded">Save</button>
                          <label className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-3 rounded cursor-pointer text-center">
                              Load
                              <input type="file" className="hidden" accept=".json" onChange={handleLoadDeck} />
                          </label>
                      </div>
                      <div className={`text-center font-bold text-lg ${totalCardCount > MAX_DECK_SIZE ? 'text-red-500' : 'text-gray-300'}`}>
                          Total Cards: {totalCardCount} / {MAX_DECK_SIZE}
                      </div>
                  </div>
                  <div className="flex-grow overflow-y-auto pr-2 space-y-2">
                      {Array.from(deckCards.entries()).map(([cardId, quantity]) => {
                          const cardDef = getCardDefinition(cardId);
                          if (!cardDef) return null;
                          return (
                              <div
                                key={cardId}
                                className="bg-gray-800 p-2 rounded flex items-center justify-between"
                                onContextMenu={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  const items: ContextMenuItem[] = [
                                      { label: 'View', onClick: () => handleViewCard(cardId, cardDef) },
                                      { isDivider: true },
                                      { label: 'Add to Deck', onClick: () => changeCardQuantity(cardId, 1), disabled: totalCardCount >= MAX_DECK_SIZE },
                                      { label: 'Remove from Deck', onClick: () => changeCardQuantity(cardId, -1) },
                                      { label: 'Remove all copies', onClick: () => removeCardFromDeck(cardId) },
                                  ];
                                  setContextMenu({ x: e.clientX, y: e.clientY, items, onClose: () => setContextMenu(null) });
                                }}
                                data-interactive="true"
                              >
                                  <span
                                    className="flex-grow truncate"
                                    title={cardDef.name}
                                    onMouseEnter={(e) => handleMouseEnter(e, cardDef)}
                                    onMouseMove={handleMouseMove}
                                    onMouseLeave={handleMouseLeave}
                                  >
                                    {cardDef.name}
                                  </span>
                                  <div className="flex items-center space-x-2 flex-shrink-0">
                                      <button onClick={() => changeCardQuantity(cardId, -1)} className="w-6 h-6 bg-gray-700 rounded">-</button>
                                      <span className="font-mono w-6 text-center">{quantity}</span>
                                      <button onClick={() => changeCardQuantity(cardId, 1)} className="w-6 h-6 bg-gray-700 rounded">+</button>
                                      <button onClick={() => removeCardFromDeck(cardId)} className="w-6 h-6 bg-red-600 text-white rounded text-sm">X</button>
                                  </div>
                              </div>
                          );
                      })}
                  </div>
              </div>

              {/* Right Side: Card Library */}
              <div className="w-2/3 bg-gray-900 rounded-lg p-4 flex flex-col">
                  <div className="flex-shrink-0 mb-4 flex gap-2 items-center">
                      <select value={factionFilter} onChange={e => setFactionFilter(e.target.value)} className="bg-gray-700 border border-gray-600 rounded p-2">
                          <option value="all">All Factions</option>
                          {selectableFactions.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                          <option value="command">Command</option>
                      </select>
                      <input type="text" value={powerFilter} onChange={e => setPowerFilter(e.target.value)} placeholder="Power" className="bg-gray-700 border border-gray-600 rounded p-2 w-24" />
                      <input type="text" value={searchText} onChange={e => setSearchText(e.target.value)} placeholder="Search name or ability..." className="bg-gray-700 border border-gray-600 rounded p-2 flex-grow" />
                  </div>
                  <div className="flex-grow overflow-y-auto pr-2">
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                          {filteredLibraryCards.map(({ id, card }) => (
                              <div
                                  key={id}
                                  className="relative group w-32 h-32"
                                  data-interactive="true"
                              >
                                  <div className="w-full h-full">
                                       <CardComponent card={{ ...card, id: `lib_${id}`, deck: findFactionForCard(id) }} isFaceUp={true} playerColorMap={new Map()} />
                                  </div>
                                  <div 
                                      onClick={() => addCardToDeck(id)}
                                      onContextMenu={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          const items: ContextMenuItem[] = [
                                              { label: 'View', onClick: () => handleViewCard(id, card) },
                                              { isDivider: true },
                                              { label: 'Add to Deck', onClick: () => addCardToDeck(id), disabled: totalCardCount >= MAX_DECK_SIZE },
                                          ];
                                          setContextMenu({ x: e.clientX, y: e.clientY, items, onClose: () => setContextMenu(null) });
                                      }}
                                      onMouseEnter={(e) => handleMouseEnter(e, card)}
                                      onMouseMove={handleMouseMove}
                                      onMouseLeave={handleMouseLeave}
                                      className="absolute inset-0 bg-black bg-opacity-60 opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity"
                                  >
                                      <span className="text-white font-bold text-lg">Add to Deck</span>
                                  </div>
                              </div>
                          ))}
                      </div>
                  </div>
              </div>
          </div>
        </div>
      </div>
      {tooltip && (
        <Tooltip x={tooltip.x} y={tooltip.y}>
            <CardTooltipContent card={{...tooltip.cardDef, id: 'tooltip', deck: DeckType.Command}} />
        </Tooltip>
      )}
      {contextMenu && <ContextMenu {...contextMenu} />}
    </>
  );
};
