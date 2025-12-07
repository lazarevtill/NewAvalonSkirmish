/**
 * @file Renders a comprehensive Rules & Tutorial modal acting as an interactive encyclopedia.
 */
import React, { useState, useMemo } from 'react';
import { Card } from './Card';
import { CardTooltipContent } from './Tooltip';
import type { Card as CardType, PlayerColor } from '../types';
import { DeckType } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { PLAYER_COLORS, STATUS_ICONS } from '../constants';

interface RulesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// --- Constants for Demo ---
const GAWAIN_IMG = "https://res.cloudinary.com/dxxh6meej/image/upload/v1764622845/Reclaimed_Gawain_sg6257.png";
const GAWAIN_FALLBACK = "/images/cards/NEU_RECLAIMED_GAWAIN.png";

const DEMO_CARDS: Record<string, CardType> = {
    gawain: {
        id: 'demo_gawain',
        name: "Reclaimed \"Gawain\"",
        deck: DeckType.Neutral,
        power: 5,
        imageUrl: GAWAIN_IMG,
        fallbackImage: GAWAIN_FALLBACK,
        ability: "Deploy: Shield 1. Push an adjacent card 1 cell. May take its place.\nSetup: Destroy an adjacent card with threat or stun.",
        types: ["Unit", "Device", "Rarity"],
        faction: "Neutral",
        ownerId: 1
    },
    riot: {
        id: 'demo_riot',
        name: "Riot Agent",
        deck: DeckType.SynchroTech,
        power: 3,
        imageUrl: "https://res.cloudinary.com/dxxh6meej/image/upload/v1763253337/SYN_RIOT_AGENT_jurf4t.png",
        fallbackImage: "/images/cards/SYN_RIOT_AGENT.png",
        ability: "Deploy: Push.",
        types: ["Unit", "SynchroTech"],
        faction: "SynchroTech",
        ownerId: 1
    },
    princeps: {
        id: 'demo_princeps',
        name: "Princeps",
        deck: DeckType.Optimates,
        power: 3,
        imageUrl: "https://res.cloudinary.com/dxxh6meej/image/upload/v1763253332/OPT_PRINCEPS_w3o5lq.png",
        fallbackImage: "/images/cards/OPT_PRINCEPS.png",
        ability: "",
        types: ["Unit", "Optimates"],
        faction: "Optimates",
        ownerId: 2
    }
};

const DUMMY_COLOR_MAP = new Map<number, PlayerColor>([
    [1, 'blue'],
    [2, 'red'],
]);

// --- Text Formatter ---
const formatRuleText = (text: string) => {
    return text.split(/(\*\*.*?\*\*)/g).map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={i} className="text-indigo-300">{part.slice(2, -2)}</strong>;
        }
        return part;
    });
};

// --- Visual Sub-Components ---

const VisualWrapper = ({ children }: { children: React.ReactNode }) => (
    <div className="w-full h-full bg-board-bg/50 rounded-xl shadow-inner border-2 border-gray-600/50 flex items-center justify-center overflow-hidden relative p-4">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-900/20 via-transparent to-transparent pointer-events-none"></div>
        {children}
    </div>
);

// I. General Concept Visual
const AnatomyVisual = () => {
    return (
        <VisualWrapper>
            <div className="flex gap-16 items-center justify-center relative pl-4 scale-90 md:scale-100">
                 {/* The Card */}
                 <div className="relative w-48 h-48 flex-shrink-0">
                     <Card 
                        card={DEMO_CARDS.gawain} 
                        isFaceUp={true} 
                        playerColorMap={DUMMY_COLOR_MAP} 
                        localPlayerId={1} 
                        disableTooltip 
                     />
                     
                     {/* Power Label Pointer */}
                     <div className="absolute -bottom-2 -right-2 w-full h-full pointer-events-none">
                         <div className="absolute bottom-[-45px] right-[5px] flex flex-col items-center">
                             <div className="w-px h-8 bg-white mb-1"></div>
                             <div className="bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg border border-white whitespace-nowrap">
                                 Power
                             </div>
                         </div>
                     </div>
                 </div>

                 {/* The Tooltip (Static Render) */}
                 <div className="relative w-80 flex-shrink-0">
                     <div className="bg-gray-900 border border-gray-700 rounded-md shadow-2xl p-3 text-white relative">
                         <CardTooltipContent card={DEMO_CARDS.gawain} />
                         
                         {/* Name Label */}
                         <div className="absolute top-4 -left-[90px] flex items-center">
                             <div className="bg-indigo-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg border border-white">
                                 Name
                             </div>
                             <div className="w-[60px] h-px bg-white ml-2"></div>
                             <div className="w-1.5 h-1.5 bg-white rounded-full -ml-1"></div>
                         </div>

                         {/* Types Label */}
                         <div className="absolute top-10 -left-[90px] flex items-center">
                             <div className="bg-purple-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg border border-white">
                                 Types
                             </div>
                             <div className="w-[60px] h-px bg-white ml-2"></div>
                             <div className="w-1.5 h-1.5 bg-white rounded-full -ml-1"></div>
                         </div>

                         {/* Ability Label */}
                         <div className="absolute bottom-12 -left-[90px] flex items-center">
                             <div className="bg-green-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg border border-white">
                                 Abilities
                             </div>
                             <div className="w-[60px] h-px bg-white ml-2"></div>
                             <div className="w-1.5 h-1.5 bg-white rounded-full -ml-1"></div>
                         </div>
                     </div>
                 </div>
            </div>
        </VisualWrapper>
    );
};

// V. Dynamic Statuses Visual (4x3 Grid)
const StatusMechanicsVisual = () => {
    // 4 cols x 3 rows grid
    const gridCells = Array(12).fill(null);

    // Scenario 1: Support (Row 0, Cols 0-1) - Two Blue cards
    const supportCard1 = { ...DEMO_CARDS.riot, id: 's1', statuses: [{ type: 'Support', addedByPlayerId: 1 }] };
    const supportCard2 = { ...DEMO_CARDS.riot, id: 's2', statuses: [{ type: 'Support', addedByPlayerId: 1 }] };

    // Scenario 2: Threat (Row 1, Cols 1-3) - Red, Blue, Red (Pinned horizontally)
    const enemy1 = { ...DEMO_CARDS.princeps, id: 'e1' };
    const victim = { ...DEMO_CARDS.riot, id: 'v1', statuses: [{ type: 'Threat', addedByPlayerId: 2 }] };
    const enemy2 = { ...DEMO_CARDS.princeps, id: 'e2' };

    return (
        <VisualWrapper>
            <div className="relative scale-[0.8] md:scale-100 origin-center">
                {/* Scaled to match ~112px cards (w-28) + gaps */}
                <div className="grid grid-cols-4 grid-rows-3 gap-1 w-[460px] h-[340px]">
                    {gridCells.map((_, i) => {
                        const r = Math.floor(i / 4);
                        const c = i % 4;
                        let cardToRender: CardType | null = null;
                        
                        // Support Placement (Top Left)
                        if (r === 0 && c === 0) cardToRender = supportCard1;
                        if (r === 0 && c === 1) cardToRender = supportCard2;

                        // Threat Placement (Middle Row, Pinned)
                        if (r === 1 && c === 1) cardToRender = enemy1; // Red
                        if (r === 1 && c === 2) cardToRender = victim; // Blue (Victim)
                        if (r === 1 && c === 3) cardToRender = enemy2; // Red

                        return (
                            <div key={i} className="relative w-full h-full bg-board-cell/30 rounded border border-white/5 flex items-center justify-center">
                                {cardToRender && (
                                    <div className="w-28 h-28 p-0">
                                        <Card 
                                            card={cardToRender} 
                                            isFaceUp={true} 
                                            playerColorMap={DUMMY_COLOR_MAP} 
                                            localPlayerId={1} 
                                            disableTooltip
                                            smallStatusIcons
                                        />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
                
                {/* Labels */}
                <div className="absolute -top-3 left-4 text-green-400 font-bold text-[10px] uppercase tracking-widest bg-gray-900 px-2 py-0.5 rounded border border-green-500/50 shadow-md z-10">
                    Support
                </div>
                <div className="absolute top-[40%] right-0 text-red-400 font-bold text-[10px] uppercase tracking-widest bg-gray-900 px-2 py-0.5 rounded border border-red-500/50 shadow-md z-10 translate-x-1/2">
                    Threat
                </div>
            </div>
        </VisualWrapper>
    );
};

const GridLinesVisual = () => {
    return (
        <VisualWrapper>
             <div className="grid grid-cols-4 gap-1 w-64 aspect-square relative scale-[1.3] origin-center">
                 {/* Background Cells */}
                 {Array.from({length: 16}).map((_, i) => (
                     <div key={i} className="bg-board-cell/40 rounded border border-white/5"></div>
                 ))}
                 
                 {/* Highlight Row */}
                 <div className="absolute top-[25%] left-0 right-0 h-[25%] bg-yellow-500/30 border-y-2 border-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.4)] pointer-events-none flex items-center justify-end px-2 z-10">
                     <span className="text-[8px] font-black text-yellow-200 uppercase tracking-wider drop-shadow-md">Row</span>
                 </div>

                 {/* Highlight Col */}
                 <div className="absolute top-0 bottom-0 left-[50%] w-[25%] bg-indigo-500/30 border-x-2 border-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.4)] pointer-events-none flex items-end justify-center py-2 z-10">
                      <span className="text-[8px] font-black text-indigo-200 uppercase tracking-wider whitespace-nowrap drop-shadow-md mb-1">Column</span>
                 </div>
             </div>
        </VisualWrapper>
    );
};

// IV. Setup Visual (Hand - Matches Game Session Appearance)
const HandVisual = () => {
    const handCards = [DEMO_CARDS.gawain, DEMO_CARDS.riot, DEMO_CARDS.gawain];
    return (
         <VisualWrapper>
             <div className="flex flex-col items-center gap-6 w-full">
                 {/* Hand Container resembling PlayerPanel */}
                 <div className="bg-gray-800 rounded-lg p-3 shadow-xl border border-gray-700 w-auto">
                     <div className="text-[10px] text-gray-400 mb-2 font-bold uppercase tracking-wider pl-1">Hand (6 Cards)</div>
                     <div className="flex gap-2 justify-center bg-gray-900/50 rounded p-2">
                         {handCards.map((card, i) => (
                             <div key={i} className="w-28 h-28 flex-shrink-0 relative shadow-lg">
                                 <Card 
                                    card={{...card, id: `hand_demo_${i}`}} 
                                    isFaceUp={true} 
                                    playerColorMap={DUMMY_COLOR_MAP} 
                                    localPlayerId={1} 
                                    disableTooltip
                                    imageRefreshVersion={Date.now()}
                                 />
                             </div>
                         ))}
                     </div>
                 </div>
                 
                 {/* Interaction Hint */}
                 <div className="flex items-center gap-2 opacity-70">
                     <div className="w-8 h-8 rounded-full border-2 border-dashed border-white/30 flex items-center justify-center animate-pulse">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-indigo-400">
                             <path d="M12 5v14M19 12l-7 7-7-7" />
                        </svg>
                     </div>
                     <span className="text-xs text-gray-400">Drag to Board</span>
                 </div>
             </div>
         </VisualWrapper>
    );
};

// VI. Counters Visual
const CountersVisual = () => {
    const countersToShow = ['Stun', 'Shield', 'Revealed', 'Aim', 'Exploit', 'Support', 'Threat'];
    const COUNTER_BG_URL = 'https://res.cloudinary.com/dxxh6meej/image/upload/v1763653192/background_counter_socvss.png';

    return (
        <VisualWrapper>
            <div className="grid grid-cols-4 gap-4 p-4 w-full">
                {countersToShow.map(type => {
                    const iconUrl = STATUS_ICONS[type];
                    return (
                        <div key={type} className="flex flex-col items-center gap-2 p-2 bg-gray-800/50 rounded border border-white/5 hover:bg-gray-800 transition-colors">
                            <div 
                                className="w-10 h-10 rounded-full border-2 border-white/30 flex items-center justify-center shadow-lg relative"
                                style={{ 
                                    backgroundImage: `url(${COUNTER_BG_URL})`, 
                                    backgroundSize: 'contain', 
                                    backgroundPosition: 'center',
                                    backgroundRepeat: 'no-repeat'
                                }}
                            >
                                {iconUrl ? (
                                    <img src={iconUrl} alt={type} className="w-6 h-6 object-contain drop-shadow-md" />
                                ) : (
                                    <span className="font-bold text-white text-base">{type[0]}</span>
                                )}
                            </div>
                            <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wider text-center leading-tight">{type}</span>
                        </div>
                    );
                })}
            </div>
        </VisualWrapper>
    );
};


export const RulesModal: React.FC<RulesModalProps> = ({ isOpen, onClose }) => {
    const { resources, t } = useLanguage();
    const r = resources.rules;

    const SECTIONS = [
        { id: 'concept', title: r.conceptTitle, text: r.conceptText, visual: <AnatomyVisual /> },
        { id: 'winCondition', title: r.winConditionTitle, text: r.winConditionText, visual: <VisualWrapper><div className="text-center text-yellow-400 font-black text-8xl font-mono bg-gray-900 p-10 rounded-3xl border-8 border-yellow-500 shadow-[0_0_50px_#eab308] scale-[1.2]">30 <div className="text-lg font-bold text-gray-400 font-sans mt-2 uppercase tracking-widest">Points</div></div></VisualWrapper> },
        { id: 'field', title: r.fieldTitle, text: r.fieldText, visual: <GridLinesVisual /> },
        { id: 'setup', title: r.setupTitle, text: r.setupText, visual: <HandVisual /> },
        { id: 'statuses', title: r.statusesTitle, text: r.statusesText, visual: <StatusMechanicsVisual /> },
        { id: 'counters', title: r.countersTitle, text: r.countersText, visual: <CountersVisual /> },
        { id: 'turn', title: r.turnTitle, text: r.turnText, visual: null },
        { id: 'mechanics', title: r.mechanicsTitle, text: r.mechanicsText, visual: null },
        { id: 'credits', title: r.creditsTitle, text: r.creditsText, visual: null },
    ];

    const [activeSectionId, setActiveSectionId] = useState<string>(SECTIONS[0].id);
    const activeSection = useMemo(() => SECTIONS.find(s => s.id === activeSectionId) || SECTIONS[0], [activeSectionId, SECTIONS]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-[100]" onClick={onClose}>
            <div className="bg-gray-900 w-[95vw] h-[90vh] rounded-xl shadow-2xl flex overflow-hidden border border-gray-700" onClick={e => e.stopPropagation()}>
                
                {/* Navigation Sidebar */}
                <div className="w-64 bg-gray-800 border-r border-gray-700 flex flex-col flex-shrink-0">
                    <div className="p-4 border-b border-gray-700 bg-gray-850">
                        <h2 className="text-xl font-bold text-indigo-400 tracking-wide">{r.title}</h2>
                    </div>
                    <div className="flex-grow overflow-y-auto p-2 space-y-1">
                        {SECTIONS.map(section => (
                            <button
                                key={section.id}
                                onClick={() => setActiveSectionId(section.id)}
                                className={`w-full text-left px-4 py-3 rounded-md transition-all duration-200 text-sm font-medium flex items-center justify-between ${
                                    activeSectionId === section.id 
                                    ? 'bg-indigo-600 text-white shadow-lg translate-x-1' 
                                    : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                                }`}
                            >
                                <span className="truncate">{section.title}</span>
                                {activeSectionId === section.id && <span className="text-indigo-300">▶</span>}
                            </button>
                        ))}
                    </div>
                    <div className="p-4 border-t border-gray-700">
                        <button onClick={onClose} className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 rounded transition-colors uppercase text-sm tracking-wider">
                            {t('close')}
                        </button>
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-grow flex flex-col md:flex-row overflow-hidden bg-gray-900">
                    
                    {/* Text Pane */}
                    <div className="flex-1 p-8 overflow-y-auto custom-scrollbar">
                        <div className="max-w-2xl mx-auto">
                            <h1 className="text-3xl font-black text-white mb-8 pb-4 border-b-2 border-indigo-500/50">
                                {activeSection.title}
                            </h1>
                            <div className="prose prose-invert prose-lg text-gray-300 leading-relaxed whitespace-pre-wrap">
                                {formatRuleText(activeSection.text)}
                            </div>
                        </div>
                    </div>

                    {/* Visual Pane (Desktop Only) */}
                    <div className="hidden md:flex w-[45%] bg-gray-850 border-l border-gray-700 flex-col items-center justify-start p-6 relative overflow-hidden">
                        <h3 className="text-center text-gray-500 text-xs uppercase tracking-[0.3em] font-bold z-20 opacity-70 mb-2 absolute top-6">
                            Visual Example
                        </h3>
                        
                        {/* Demo Screen: Reduced height by 20% (h-[65%]) and pushed down (mt-20) */}
                        <div className="relative z-10 w-full h-[65%] mt-20 flex items-center justify-center">
                            {activeSection.visual ? (
                                activeSection.visual
                            ) : (
                                <div className="text-gray-600 italic flex flex-col items-center opacity-40">
                                    <svg className="w-16 h-16 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                    No visual available
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};