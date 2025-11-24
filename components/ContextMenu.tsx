import React, { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ContextMenuItem } from '../types';

/**
 * Props for the ContextMenu component.
 */
interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

/**
 * A generic context menu component that displays a list of actions at a specific screen position.
 * It automatically adjusts its position to stay within the viewport.
 */
export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, onClose }) => {
    const menuRef = useRef<HTMLDivElement>(null);
    // Use state to trigger re-render for positioning after mount
    const [correctedPos, setCorrectedPos] = useState({ top: y, left: x });

    useEffect(() => {
        if (menuRef.current) {
            const { innerWidth, innerHeight } = window;
            const { offsetWidth, offsetHeight } = menuRef.current;
            
            const correctedX = x + offsetWidth > innerWidth ? innerWidth - offsetWidth - 10 : x;
            const correctedY = y + offsetHeight > innerHeight ? innerHeight - offsetHeight - 10 : y;
            
            setCorrectedPos({ top: correctedY, left: correctedX });
        }
    }, [x, y, items]); // Recalculate if items change

    return createPortal(
        <div 
            ref={menuRef}
            className="fixed bg-gray-900 border border-gray-700 rounded-md shadow-lg z-[100] py-1"
            style={{ top: correctedPos.top, left: correctedPos.left }}
            onClick={(e) => e.stopPropagation()} // Prevents the window click listener from closing the menu immediately.
        >
            {items.map((item, index) => {
                if ('isDivider' in item) {
                    return <hr key={`divider-${index}`} className="border-gray-700 my-1" />;
                } else if ('onClick' in item) { // This item is a standard button.
                    return (
                        <button
                            key={index}
                            onClick={() => {
                                if (!item.disabled) {
                                    item.onClick();
                                    onClose();
                                }
                            }}
                            disabled={item.disabled}
                            className="block w-full text-left px-4 py-1 text-sm text-white hover:bg-indigo-600 disabled:text-gray-500 disabled:cursor-not-allowed disabled:bg-gray-800"
                            style={{ fontWeight: item.isBold ? 'bold' : 'normal' }}
                        >
                            {item.label}
                        </button>
                    );
                } else { // This item must be a statusControl.
                    return (
                        <div key={index} className="flex items-center justify-between px-4 py-1 text-sm text-white w-full space-x-2">
                            <button
                                onClick={(e) => { e.stopPropagation(); item.onRemove(); }}
                                disabled={item.removeDisabled}
                                className="w-7 h-6 flex items-center justify-center bg-gray-700 hover:bg-red-600 rounded disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed font-mono text-lg"
                            >
                                -
                            </button>
                            <span className="flex-grow text-center">{item.label}</span>
                             <button
                                onClick={(e) => { e.stopPropagation(); item.onAdd(); }}
                                className="w-7 h-6 flex items-center justify-center bg-gray-700 hover:bg-green-600 rounded font-mono text-lg"
                            >
                                +
                            </button>
                        </div>
                    );
                }
            })}
        </div>,
        document.body
    );
};