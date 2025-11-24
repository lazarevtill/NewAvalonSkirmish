/**
 * @file Renders a single game card, including its art, text, and status effects.
 */

import React, { useState, useRef, useEffect } from 'react';
import type { Card as CardType, PlayerColor, CardStatus } from '../types';
import { DeckType } from '../types';
import { DECK_THEMES, PLAYER_COLORS, STATUS_ICONS } from '../constants';
import { Tooltip, CardTooltipContent } from './Tooltip';
import { canActivateAbility } from '../utils/autoAbilities';

/**
 * Props for the Card component.
 */
interface CardProps {
  card: CardType;
  isFaceUp: boolean;
  playerColorMap: Map<number, PlayerColor>;
  localPlayerId?: number | null;
  imageRefreshVersion?: number;
  disableTooltip?: boolean;
  smallStatusIcons?: boolean;
  activePhaseIndex?: number;
  activeTurnPlayerId?: number; // Added to check turn ownership
}

/**
 * A component that displays a single card. It can render in different states:
 * face up, face down, as a counter, or with status effect overlays.
 * @param {CardProps} props The properties for the component.
 * @returns {React.ReactElement} The rendered card.
 */
export const Card: React.FC<CardProps> = ({ card, isFaceUp, playerColorMap, localPlayerId, imageRefreshVersion, disableTooltip, smallStatusIcons, activePhaseIndex, activeTurnPlayerId }) => {
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const tooltipTimeoutRef = useRef<number | null>(null);

  // Local state to track if the highlight for the current phase has been dismissed by clicking
  const [highlightDismissed, setHighlightDismissed] = useState(false);

  // Reset dismissed state when the phase changes
  useEffect(() => {
    setHighlightDismissed(false);
  }, [activePhaseIndex]);

  const [currentImageSrc, setCurrentImageSrc] = useState(card.imageUrl);

  useEffect(() => {
    // Reset image source when the card prop itself changes or refresh version updates
    let src = card.imageUrl;
    if (imageRefreshVersion && src) {
        const separator = src.includes('?') ? '&' : '?';
        src = `${src}${separator}v=${imageRefreshVersion}`;
    }
    setCurrentImageSrc(src);
  }, [card.imageUrl, imageRefreshVersion]);

  const handleImageError = () => {
    // If the primary image fails, switch to the fallback.
    // Prevent an infinite loop if the fallback also fails.
    let fallback = card.fallbackImage;
    if (imageRefreshVersion && fallback) {
        const separator = fallback.includes('?') ? '&' : '?';
        fallback = `${fallback}${separator}v=${imageRefreshVersion}`;
    }

    if (currentImageSrc !== fallback) {
      setCurrentImageSrc(fallback);
    }
  };


  const handleMouseMove = (e: React.MouseEvent) => {
    if (disableTooltip) return;
    setTooltipPos({ x: e.clientX, y: e.clientY });
    // Ensure tooltip shows if mouseEnter was missed (e.g. after drop)
    if (!tooltipVisible && !tooltipTimeoutRef.current) {
        tooltipTimeoutRef.current = window.setTimeout(() => {
            setTooltipVisible(true);
        }, 250);
    }
  };
  
  const handleMouseEnter = () => {
    if (disableTooltip) return;
    if (tooltipTimeoutRef.current) {
        clearTimeout(tooltipTimeoutRef.current);
    }
    tooltipTimeoutRef.current = window.setTimeout(() => {
        setTooltipVisible(true);
    }, 250);
  };

  const handleMouseLeave = () => {
    if (tooltipTimeoutRef.current) {
        clearTimeout(tooltipTimeoutRef.current);
        tooltipTimeoutRef.current = null;
    }
    setTooltipVisible(false);
  };
  
  const handleMouseDown = () => {
      if (tooltipTimeoutRef.current) {
          clearTimeout(tooltipTimeoutRef.current);
          tooltipTimeoutRef.current = null;
      }
      setTooltipVisible(false);
  }

  // --- Phase Highlighting Logic ---
  // Use shared utility to determine if the card conditions are met for highlighting
  const canActivate = (activePhaseIndex !== undefined && activeTurnPlayerId !== undefined) 
      ? canActivateAbility(card, activePhaseIndex, activeTurnPlayerId) 
      : false;

  const shouldHighlight = !highlightDismissed && canActivate;

  const handleCardClick = (e: React.MouseEvent) => {
      // If the card is currently highlighted, a click dismisses the highlight
      // FIX: Only the owner can dismiss the highlight
      if (shouldHighlight && localPlayerId === card.ownerId) {
          setHighlightDismissed(true);
      }
  };
  
  // Aggregate statuses by TYPE and PLAYER ID to allow separate icons for different players.
  const statusGroups = (card.statuses ?? []).reduce((acc, status) => {
    const key = `${status.type}_${status.addedByPlayerId}`;
    if (!acc[key]) {
        acc[key] = { type: status.type, playerId: status.addedByPlayerId, count: 0 };
    }
    acc[key].count++;
    return acc;
  }, {} as Record<string, { type: string, playerId: number, count: number }>);

  // Status icon sub-component for reusability
  const StatusIcon = ({ type, playerId, count }: { type: string, playerId: number, count: number }) => {
    const statusColorName = playerColorMap.get(playerId); 
    const statusBg = (statusColorName && PLAYER_COLORS[statusColorName]) ? PLAYER_COLORS[statusColorName].bg : 'bg-gray-500';
    
    let iconUrl = STATUS_ICONS[type];
    if (iconUrl && imageRefreshVersion) {
        const separator = iconUrl.includes('?') ? '&' : '?';
        iconUrl = `${iconUrl}${separator}v=${imageRefreshVersion}`;
    }

    const isSingleInstance = ['Support', 'Threat', 'Revealed', 'LastPlayed'].includes(type);
    const showCount = !isSingleInstance && count > 1;

    // When count is shown, icon padding is larger to make the icon smaller.
    const iconPaddingClass = showCount ? 'p-1.5' : 'p-1';
    
    // Size logic: w-8 (32px) is default. w-6 (24px) is 75%, which is 25% smaller.
    const sizeClass = smallStatusIcons ? 'w-6 h-6' : 'w-8 h-8';
    const fontSizeClass = smallStatusIcons 
        ? (showCount ? 'text-xs' : 'text-base') 
        : (showCount ? 'text-base' : 'text-lg');
    
    const countBadgeSize = smallStatusIcons ? 'text-[10px]' : 'text-xs';

    return (
        <div
            className={`relative ${sizeClass} flex items-center justify-center ${statusBg} bg-opacity-80 rounded-sm shadow-md flex-shrink-0`}
            title={`${type} (Player ${playerId}) ${!isSingleInstance && count > 0 ? `x${count}` : ''}`}
        >
            {iconUrl ? (
                <img 
                    src={iconUrl} 
                    alt={type} 
                    className={`object-contain w-full h-full transition-all duration-150 ${iconPaddingClass}`}
                />
            ) : (
                <span className={`text-white font-black transition-all duration-150 ${fontSizeClass}`} style={{ textShadow: '0 0 2px black' }}>
                    {type.charAt(0)}
                </span>
            )}

            {showCount && (
                <span
                    className={`absolute top-0 right-0.5 text-white font-bold ${countBadgeSize} leading-none`}
                    style={{ textShadow: '1px 1px 2px black' }}
                >
                    {count}
                </span>
            )}
        </div>
    );
  };

  // Special rendering for 'counter' type cards.
  if (card.deck === 'counter') {
    return (
      <div
        title={card.name}
        className={`w-full h-full ${card.color} shadow-md`}
        style={{ clipPath: 'polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)' }}
      ></div>
    );
  }

  const ownerColorName = card.ownerId ? playerColorMap.get(card.ownerId) : null;
  const ownerColorData = (ownerColorName && PLAYER_COLORS[ownerColorName]) ? PLAYER_COLORS[ownerColorName] : null;

  const uniqueStatusGroups = Object.values(statusGroups).sort((a, b) => {
      // Sort by type first, then by playerId to ensure consistent order
      if (a.type !== b.type) return a.type.localeCompare(b.type);
      return a.playerId - b.playerId;
  });

  // Calculate modified power
  const modifier = card.powerModifier || 0;
  const currentPower = Math.max(0, card.power + modifier);
  let powerTextColor = "text-white";
  if (modifier > 0) powerTextColor = "text-green-400";
  else if (modifier < 0) powerTextColor = "text-red-500";
  
  return (
    <>
      {!isFaceUp ? (
        // --- CARD BACK ---
        (() => {
            const backColorClass = ownerColorData ? ownerColorData.bg : 'bg-card-back';
            const borderColorClass = ownerColorData ? ownerColorData.border : 'border-blue-300';
            const lastPlayedGroup = uniqueStatusGroups.find(g => g.type === 'LastPlayed');

            return (
              <div 
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                onMouseMove={handleMouseMove}
                onMouseDown={handleMouseDown}
                className={`relative w-full h-full ${backColorClass} rounded-md shadow-md border-2 ${borderColorClass} flex-shrink-0 transition-transform duration-300 ${shouldHighlight ? 'scale-[1.15] z-10' : ''}`}
              >
                {lastPlayedGroup && (
                    <div className="absolute bottom-[3px] left-[3px] pointer-events-none">
                        <StatusIcon type={lastPlayedGroup.type} playerId={lastPlayedGroup.playerId} count={lastPlayedGroup.count} />
                    </div>
                )}
              </div>
            );
        })()
      ) : (
        // --- CARD FACE ---
        (() => {
            const themeColor = ownerColorData 
                ? ownerColorData.border
                : DECK_THEMES[card.deck as keyof typeof DECK_THEMES]?.color || 'border-gray-300';
            const cardBg = card.deck === DeckType.Tokens ? card.color : 'bg-card-face';
            const textColor = card.deck === DeckType.Tokens ? 'text-black' : 'text-black';
            
            const positiveStatusTypesList = ['Support', 'Shield'];
            const positiveGroups = uniqueStatusGroups.filter(g => positiveStatusTypesList.includes(g.type));
            const negativeGroups = uniqueStatusGroups.filter(g => !positiveStatusTypesList.includes(g.type) && g.type !== 'LastPlayed');
            const lastPlayedGroup = uniqueStatusGroups.find(g => g.type === 'LastPlayed');

            // Combine positive statuses for rendering. LastPlayed goes first to appear at bottom-left.
            const combinedPositiveGroups = lastPlayedGroup
              ? [lastPlayedGroup, ...positiveGroups]
              : positiveGroups;
            
            // Highlight Style: Thicker border + Owner Color Glow
            const ownerGlowClass = ownerColorData ? ownerColorData.glow : 'shadow-[0_0_15px_#ffffff]';
            const borderClass = shouldHighlight 
                ? `border-[6px] shadow-2xl ${ownerGlowClass}` 
                : 'border-4';

            return (
              <div
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                onMouseMove={handleMouseMove}
                onMouseDown={handleMouseDown}
                onClick={handleCardClick}
                className={`relative w-full h-full ${cardBg} rounded-md shadow-md ${borderClass} ${themeColor} ${textColor} flex-shrink-0 select-none overflow-hidden transition-all duration-300 ${shouldHighlight ? 'scale-[1.15] z-10' : ''}`}
              >
                {currentImageSrc ? (
                  <img src={currentImageSrc} onError={handleImageError} alt={card.name} className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full p-1 flex items-center justify-center">
                      <span className="text-center text-sm font-bold">
                        {card.name}
                      </span>
                  </div>
                )}
                
                {/* Status effect overlay */}
                {uniqueStatusGroups.length > 0 && (
                   <>
                    {/* Negative Statuses: Top-right, flowing left then down */}
                    <div className="absolute top-[3px] left-[3px] right-[3px] flex flex-row-reverse flex-wrap justify-start items-start z-10 pointer-events-none">
                      {negativeGroups.map((group) => (
                        <StatusIcon key={`${group.type}_${group.playerId}`} type={group.type} playerId={group.playerId} count={group.count} />
                      ))}
                    </div>

                    {/* Positive Statuses Area: Bottom-left, flowing right then up */}
                    <div className="absolute bottom-[3px] left-[3px] right-[30px] flex flex-wrap-reverse content-start items-end z-10 pointer-events-none">
                        {combinedPositiveGroups.map((group) => (
                            <StatusIcon key={`${group.type}_${group.playerId}`} type={group.type} playerId={group.playerId} count={group.count} />
                        ))}
                    </div>
                  </>
                )}
                
                {/* Power Display */}
                {card.power > 0 && (
                    <div 
                        className={`absolute bottom-[5px] right-[5px] w-8 h-8 rounded-full ${ownerColorData ? ownerColorData.bg : 'bg-gray-600'} border-[3px] border-white flex items-center justify-center z-20 shadow-md`}
                    >
                        <span className={`${powerTextColor} font-bold text-lg leading-none`} style={{ textShadow: '0 0 2px black' }}>{currentPower}</span>
                    </div>
                )}
              </div>
            );
        })()
      )}

      {tooltipVisible && isFaceUp && !disableTooltip && (
          <Tooltip x={tooltipPos.x} y={tooltipPos.y}>
             <CardTooltipContent card={card} />
          </Tooltip>
      )}
    </>
  );
};