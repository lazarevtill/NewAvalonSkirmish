/**
 * @file Centralized text formatting utilities for card abilities.
 */

import React from 'react';

/**
 * Parses a single line of ability text for keywords and applies styling.
 * This function is case-insensitive.
 * @param {string} line - A single line of text.
 * @returns {React.ReactNodeArray} An array of React nodes with formatted text.
 */
const formatLine = (line: string): (React.ReactNode | string | null)[] => {
    const keywords = {
        // All keywords are now bold for emphasis, and matching is case-insensitive.
        bold: ['Support', 'support', 'Threat', 'threat', 'threaten', 'Act', 'Pas', 'Trg', 'Int', 'ETB', 'Deploy', 'Setup', 'Commit', 'Exploit', 'exploits', 'Aim', 'Stun', 'Shield', 'Gain points', 'gain points'],
        italic: ['This counter has no effect on its own, but it can modify the abilities of cards.'],
    };

    // Prepare lowercase versions for case-insensitive matching.
    const boldKeywordsLower = keywords.bold.map(k => k.toLowerCase());
    const italicKeywordsLower = keywords.italic.map(k => k.toLowerCase());

    // Split the line by common delimiters while keeping them.
    const parts = line.split(/(\s+|[.,:⇒()])/);

    return parts.map((part, index) => {
        if (!part) return null;

        // Clean the part for keyword matching (remove punctuation, convert to lowercase).
        const cleanedPartLower = part.replace(/[.,:()]/g, '').toLowerCase();

        if (cleanedPartLower && boldKeywordsLower.includes(cleanedPartLower)) {
            // FIX: Replaced JSX syntax (<strong...>) with React.createElement to make it valid in a .ts file.
            return React.createElement('strong', { key: index, className: "text-white" }, part);
        }
        if (cleanedPartLower && italicKeywordsLower.includes(cleanedPartLower)) {
            // FIX: Replaced JSX syntax (<em...>) with React.createElement to make it valid in a .ts file.
            // Changed 'not-italic' to 'italic' to correctly render flavor/descriptive text
            return React.createElement('em', { key: index, className: "text-gray-300 italic font-semibold" }, part);
        }

        return part;
    });
};


/**
 * Parses and formats a card's entire ability text, supporting keywords and newlines.
 * This is the main export to be used by components.
 * @param {string} ability - The raw ability string from card data.
 * @returns {React.ReactNode} A React node with fully formatted text.
 */
export const formatAbilityText = (ability: string): React.ReactNode => {
    if (!ability) return '';

    // FIX: Replaced JSX syntax with React.createElement calls to make the function valid in a .ts file.
    return ability.split('\n').map((line, i) => {
        const children: React.ReactNode[] = [];
        if (i > 0) {
            children.push(React.createElement('br', { key: `br-${i}` }));
        }
        children.push(...formatLine(line));
        
        // Use React.createElement for Fragment, spreading the children array as arguments.
        // filter(Boolean) will remove any nulls returned from formatLine.
        return React.createElement(React.Fragment, { key: i }, ...children.filter(Boolean));
    });
};