/**
 * @file Renders a modal displaying available counters that can be dragged onto cards.
 */

import React, { useState } from 'react';
import type { DragItem, Card as CardType } from '../types';
import { AVAILABLE_COUNTERS, STATUS_ICONS, STATUS_DESCRIPTIONS } from '../constants';
import { Tooltip, CardTooltipContent } from './Tooltip';

const COUNTER_BG_URL = 'https://res.cloudinary.com/dxxh6meej/image/upload/v1763653192/background_counter_socvss.png';

/**
 * Props for the CountersModal component.
 */
interface CountersModalProps {
  isOpen: boolean;
  onClose: () => void;
  setDraggedItem: (item: DragItem | null) => void;
  canInteract: boolean;
  anchorEl: { top: number; left: number } | null;
  imageRefreshVersion?: number;
  onCounterMouseDown: (type: string, e: React.MouseEvent) => void;
  cursorStack: { type: string; count: number } | null;
}

/**
 * A modal that displays a list of predefined counters. Users can drag these
 * counters onto cards on the board.
 * @param {CountersModalProps} props The properties for the component.
 * @returns {React.ReactElement | null} The rendered modal or null if not open.
 */
export const CountersModal: React.FC<CountersModalProps> = ({ isOpen, onClose, setDraggedItem, canInteract, anchorEl, imageRefreshVersion, onCounterMouseDown, cursorStack }) => {
  // State to hold the card object constructed for the tooltip
  const [tooltipCard, setTooltipCard] = useState<CardType | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  if (!isOpen || !anchorEl) return null;

  const modalStyle: React.CSSProperties = {
    position: 'fixed',
    top: `${anchorEl.top}px`,
    left: `${anchorEl.left}px`,
    zIndex: 60,
  };

  const getIcon = (type: string) => {
      let iconUrl = STATUS_ICONS[type];
      if (iconUrl && imageRefreshVersion) {
          const separator = iconUrl.includes('?') ? '&' : '?';
          iconUrl = `${iconUrl}${separator}v=${imageRefreshVersion}`;
      }
      return iconUrl;
  };

  // Handler for holding right click
  const handleMouseDown = (e: React.MouseEvent, type: string, label: string) => {
      if (e.button === 2) { // Right click
          // Construct a temporary card object to reuse the standard tooltip component.
          // We map the description to 'ability' to reuse the font styling.
          // We clear 'types' to avoid showing "Counter".
          const dummyCard: CardType = {
              id: `tooltip_${type}`,
              deck: 'counter',
              name: label,
              imageUrl: '',
              fallbackImage: '',
              power: 0,
              ability: STATUS_DESCRIPTIONS[type] || '',
              types: [], 
              statuses: [] 
          };
          
          setTooltipCard(dummyCard);
          setTooltipPos({ x: e.clientX, y: e.clientY });
      } else if (e.button === 0) { // Left click
          if (canInteract) {
              onCounterMouseDown(type, e);
          }
      }
  };

  const handleMouseUp = () => {
      setTooltipCard(null);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
      if (tooltipCard) {
           setTooltipPos({ x: e.clientX, y: e.clientY });
      }
  };
  
  const handleMouseLeave = () => {
      // If we have a cursor stack (active counter) and leave the modal, close it.
      if (cursorStack) {
          onClose();
      }
      setTooltipCard(null);
  }

  const handleDragLeave = (e: React.DragEvent) => {
      // Check if we are leaving the modal boundaries
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX;
      const y = e.clientY;
      
      // Strict check to see if the mouse pointer has actually left the modal rect
      if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
          onClose();
      }
  };

  return (
    <>
      <div 
        style={modalStyle} 
        className="pointer-events-auto counter-modal-content"
        onMouseLeave={handleMouseLeave}
        onDragLeave={handleDragLeave}
      >
        <div className="bg-gray-800 rounded-lg p-4 shadow-xl w-80 max-w-[90vw] h-auto flex flex-col" onClick={e => e.stopPropagation()}>
           <div className="mb-2">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold">Counters</h2>
                <button onClick={onClose} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-1 px-3 rounded text-sm">
                    Close
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1">Hold right click to view hints</p>
          </div>
          <div className="bg-gray-900 rounded p-4">
            <div className="grid grid-cols-4 gap-1">
              {AVAILABLE_COUNTERS.map((counter) => {
                const iconUrl = getIcon(counter.type);
                const isPower = counter.type.startsWith('Power');

                return (
                  <button
                    key={counter.type}
                    onContextMenu={(e) => e.preventDefault()}
                    onMouseDown={(e) => handleMouseDown(e, counter.type, counter.label)}
                    onMouseUp={handleMouseUp}
                    onMouseMove={handleMouseMove}
                    className={`w-12 h-12 rounded-full border-white flex items-center justify-center shadow-lg mx-auto relative select-none ${canInteract ? 'cursor-pointer hover:ring-2 ring-indigo-400' : 'cursor-not-allowed'}`}
                    style={{ 
                        backgroundImage: `url(${COUNTER_BG_URL})`, 
                        backgroundSize: 'contain', 
                        backgroundPosition: 'center',
                        backgroundRepeat: 'no-repeat'
                    }}
                  >
                     {iconUrl ? (
                         <img src={iconUrl} alt={counter.label} className="w-full h-full object-contain p-1 pointer-events-none" />
                     ) : (
                          <span className={`font-bold text-white pointer-events-none ${isPower ? 'text-sm' : 'text-lg'}`} style={{ textShadow: '0 0 2px black' }}>
                              {isPower ? counter.label : counter.type.charAt(0)}
                          </span>
                     )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      {tooltipCard && (
          <Tooltip x={tooltipPos.x} y={tooltipPos.y}>
              <CardTooltipContent card={tooltipCard} statusDescriptions={STATUS_DESCRIPTIONS} />
          </Tooltip>
      )}
    </>
  );
};