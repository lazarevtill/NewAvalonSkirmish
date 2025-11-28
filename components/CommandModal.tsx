import React from 'react';
import { Card } from '../types';
import { Card as CardComponent } from './Card';
import { useLanguage } from '../contexts/LanguageContext';

interface CommandModalProps {
    isOpen: boolean;
    card: Card;
    playerColorMap: Map<number, string>;
    onConfirm: (optionIndex: number) => void;
    onCancel: () => void;
}

export const CommandModal: React.FC<CommandModalProps> = ({ isOpen, card, playerColorMap, onConfirm, onCancel }) => {
    const { getCardTranslation, t } = useLanguage();

    const localized = card.baseId ? getCardTranslation(card.baseId) : undefined;
    const displayCard = localized ? { ...card, ...localized } : card;
    const abilityText = displayCard.ability || "";

    // Parse Ability Text for 2 Options
    // Expected format: "Main description.\n‣ Option 1\n‣ Option 2"
    // Supports both '‣' and '■' as delimiters.
    const parsedOptions = React.useMemo(() => {
        // Normalize delimiters to '‣' for splitting
        const normalizedText = abilityText.replace(/■/g, '‣');
        const parts = normalizedText.split('‣');
        
        if (parts.length >= 3) {
            return {
                main: parts[0].trim(),
                opt1: parts[1].trim(),
                opt2: parts[2].trim()
            };
        }
        return {
            main: abilityText,
            opt1: "Option 1",
            opt2: "Option 2"
        };
    }, [abilityText]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-[200] backdrop-blur-sm">
            <div className="bg-gray-900 rounded-xl border-2 border-yellow-500 shadow-2xl p-6 w-full max-w-4xl flex gap-6">
                
                {/* Left: Card View */}
                <div className="w-1/3 flex flex-col items-center justify-center border-r border-gray-700 pr-6">
                    <div className="w-72 h-72 relative transform hover:scale-105 transition-transform duration-300">
                         <CardComponent card={displayCard} isFaceUp={true} playerColorMap={playerColorMap as any} disableTooltip={true} />
                    </div>
                    <h2 className="text-2xl font-bold text-yellow-500 mt-6 text-center leading-tight">{displayCard.name}</h2>
                </div>

                {/* Right: Selection Interface */}
                <div className="w-2/3 flex flex-col">
                    <h3 className="text-xl font-bold text-white mb-4 border-b border-gray-700 pb-2">Select an Option</h3>
                    
                    <div className="flex flex-col gap-3 flex-grow justify-center">
                        <button 
                            onClick={() => onConfirm(0)}
                            className="group relative bg-gray-800 hover:bg-indigo-900 border-2 border-gray-600 hover:border-indigo-400 rounded-lg p-4 transition-all duration-200 text-left shadow-lg hover:shadow-indigo-500/20 flex items-start gap-4"
                        >
                            <div className="bg-gray-700 text-gray-400 w-6 h-6 flex-shrink-0 flex items-center justify-center rounded-full font-bold text-xs group-hover:bg-indigo-500 group-hover:text-white transition-colors mt-1">1</div>
                            <p className="text-gray-200 group-hover:text-white text-base font-medium leading-snug">{parsedOptions.opt1}</p>
                        </button>

                        <button 
                            onClick={() => onConfirm(1)}
                            className="group relative bg-gray-800 hover:bg-indigo-900 border-2 border-gray-600 hover:border-indigo-400 rounded-lg p-4 transition-all duration-200 text-left shadow-lg hover:shadow-indigo-500/20 flex items-start gap-4"
                        >
                            <div className="bg-gray-700 text-gray-400 w-6 h-6 flex-shrink-0 flex items-center justify-center rounded-full font-bold text-xs group-hover:bg-indigo-500 group-hover:text-white transition-colors mt-1">2</div>
                            <p className="text-gray-200 group-hover:text-white text-base font-medium leading-snug">{parsedOptions.opt2}</p>
                        </button>
                    </div>

                    <div className="mt-6 flex justify-end">
                        <button 
                            onClick={onCancel}
                            className="px-6 py-2 rounded bg-gray-700 hover:bg-gray-600 text-white font-bold transition-colors text-sm"
                        >
                            {t('cancel')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};