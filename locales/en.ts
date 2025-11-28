import { TranslationResource } from './types';

export const en: TranslationResource = {
  ui: {
    startGame: "Start Game",
    joinGame: "Join Game",
    deckBuilding: "Deck Building",
    rules: "Rules & Tutorial",
    settings: "Settings",
    language: "Language",
    serverAddress: "Server Address",
    saveApply: "Save & Apply",
    cancel: "Cancel",
    close: "Close",
    tokens: "Tokens",
    counters: "Counters",
    phase: "Phase",
    autoAbility: "Auto-Ability",
    newGame: "New Game",
    exit: "Exit",
    surrender: "Surrender",
    mode: "Mode",
    size: "Size",
    dummies: "Dummies",
    spectatorMode: "Spectator Mode",
    spectatorMsg: "You are watching the game.",
    readyCheck: "Ready to Start?",
    imReady: "I'm Ready",
    waiting: "Waiting...",
    cancelStart: "Cancel Start",
    assignTeams: "Assign Teams",
    confirmTeams: "Confirm Teams & Start",
    unassigned: "Unassigned Players",
    team: "Team",
    deck: "DECK",
    discard: "DISCARD",
    showcase: "Showcase",
    customDeck: "Custom Deck",
    loadDeck: "Load",
    clear: "Clear",
    save: "Save",
    filter: "Filter",
    currentDeck: "Current Deck",
    emptyDeck: "Your deck is empty.",
    clickToAdd: "Click cards on the left to add them.",
    view: "View",
    play: "Play",
    playFaceDown: "Play Face Down",
    toHand: "To Hand",
    toDiscard: "To Discard",
    revealToAll: "Reveal to All",
    requestReveal: "Request Reveal",
    flipUp: "Flip Face Up",
    flipDown: "Flip Face Down"
  },
  rules: {
    title: "Game Rules",
    introTitle: "1. Introduction",
    introText: "**New Avalon: Skirmish** is a tactical card game where opponents control units on a grid battlefield. The goal is to outmaneuver your opponent using placement strategies and card abilities to score 30 points.",
    componentsTitle: "2. Components",
    componentsText: "- **Deck:** A collection of Unit and Command cards (standard size ~15-40).\n- **Battlefield:** A square grid (typically 5x5 to 7x7).\n- **Hand:** Players hold cards hidden from opponents.\n- **Discard Pile:** Used cards go here.",
    turnTitle: "3. Turn Structure",
    turnText: "A turn is divided into phases. Players act in turn order within each phase:\n1. **Setup Phase:** 'Setup' abilities trigger.\n2. **Main Phase:** Players deploy units and use 'Act' abilities.\n3. **Commit Phase:** 'Commit' abilities trigger.\n4. **Scoring Phase:** Players choose a row/column to score.\n5. **Draw Phase:** Draw up to 6 cards.\n6. **End Phase:** Pass priority token.",
    priorityTitle: "4. Priority System",
    priorityText: "Whenever a player performs an action, opponents get a chance to respond (Priority). You can play Command cards or activate abilities when you have priority. If all players pass, the top action on the Stack resolves.",
    stackTitle: "5. The Stack",
    stackText: "Actions use a Last-In, First-Out (LIFO) stack. If Player A plays a card, and Player B responds with a Command, Player B's command resolves first.",
    supportTitle: "6. Status: Support",
    supportText: "A unit has **Support** if it is orthogonally adjacent (Up, Down, Left, Right) to an allied unit. Many powerful abilities require Support to activate.",
    threatTitle: "7. Status: Threat",
    threatText: "A unit is **Threatened** if:\n1. It is sandwiched between two enemies.\n2. It is pinned against the grid edge by an enemy.\nThreatened units are vulnerable to destruction.",
    deployTitle: "8. Deployment",
    deployText: "During the Main Phase, the active player can deploy a unit from their hand to any empty cell (unless restricted by card text).",
    scoringTitle: "9. Scoring",
    scoringText: "In the Scoring phase, you select a row or column. You gain points equal to the total Power of your un-stunned units in that line. Status effects like 'Exploit' may boost this score.",
    endgameTitle: "10. Winning",
    endgameText: "The game enters the final round when a player reaches 30 points. The player with the highest score at the end of that round wins."
  },
  counters: {
    Aim: { name: "Aim", description: "This counter has no effect on its own, but it can modify the abilities of cards.\nThis card is easier to destroy." },
    Exploit: { name: "Exploit", description: "This counter has no effect on its own, but it can modify the abilities of cards.\nHacker and programmer cards will have a greater effect on this card." },
    LastPlayed: { name: "LastPlayed", description: "This card was last played by its owner." },
    Revealed: { name: "Revealed", description: "This card's face is visible to the owner of the counter revealed. Can be placed on cards in hand." },
    Stun: { name: "Stun", description: "A stunned card cannot activate abilities or gain points. Its owner's effects cannot move it, but opponent effects can.\nRemove 1 stun counter from the card at the end of the Commit Phase." },
    Shield: { name: "Shield", description: "If an effect attempts to destroy this card, remove 1 shield counter from it instead." },
    Support: { name: "Support", description: "This counter has no effect on its own, but it can modify the abilities of cards.\nThis card is adjacent to its ally." },
    Threat: { name: "Threat", description: "This counter has no effect on its own, but it can modify the abilities of cards.\nThis card is surrounded and pinned to the edge of the battlefield by an opponent's cards." },
    "Power+": { name: "Power+", description: "Increases the power of the card by 1." },
    "Power-": { name: "Power-", description: "Decreases the power of the card by 1." }
  },
  cards: {
    ipDeptAgent: {
      name: "IP Dept Agent",
      ability: "Deploy: 2 stuns a card with exploit.\nSupport ⇒ Commit: A player discards a revealed card of your choice.",
      flavorText: "- \"You've violated copyright. Open the door. We have a search warrant.\""
    },
    tacticalAgent: {
      name: "Tactical Agent",
      ability: "Deploy: Aim a card with threat.\nSetup: Destroy the card with aim.",
      flavorText: "- \"Nobody move! SynchroTech Security Service!\""
    },
    patrolAgent: {
      name: "Patrol Agent",
      ability: "Setup: Move this card to any cell in a line.\nCommit: Stun an adjacent opponent card with threat.",
      flavorText: "They say the city never sleeps. We make sure it doesn't even blink."
    },
    riotAgent: {
      name: "Riot Agent",
      ability: "Deploy: Push an opponent card 1 cell. Мay take its place.\nCommit: Stun an adjacent opponent card with threat.",
      flavorText: "- \"Citizens, disperse! This meeting is unauthorized by SynchroTech.\""
    },
    threatAnalyst: {
      name: "Threat Analyst",
      ability: "Deploy: Exploit any card.\nSupport ⇒ Commit: Reveal 1 card for each of your exploits on the battlefield.",
      flavorText: ""
    },
    recklessProvocateur: {
      name: "Reckless Provocateur",
      ability: "Deploy: Swap positions with a card in an adjacent cell.\nCommit: Move all counters from an allied card on the battlefield to this card.",
      flavorText: "- \"Patience is a weapon. Vengeance is an art.\""
    },
    dataLiberator: {
      name: "Data Liberator",
      ability: "Deploy: Exploit any card.\nSupport ⇒ Pas: Cards with your exploit counters give you points.",
      flavorText: "- \"Information doesn't want to be free. It needs to be.\""
    },
    cautiousAvenger: {
      name: "Cautious Avenger",
      ability: "Deploy: Aim a card in a line.\nSupport ⇒ Setup: Destroy the card with aim.",
      flavorText: "- \"Patience is a weapon. Vengeance is an art.\""
    },
    vigilantSpotter: {
      name: "Vigilant Spotter",
      ability: "Support ⇒ Pas: When an opponent's revealed card enters the battlefield, gain 2 points.\nCommit: Each opponent reveals 1 cards to you.",
      flavorText: "- \"Patience is a weapon. Vengeance is an art.\""
    },
    inventiveMaker: {
      name: "Inventive Maker",
      ability: "Deploy: Place the Recon Drone token in a free adjacent cell.\nSupport ⇒ Setup: Return a device card from the discard pile to your hand.",
      flavorText: "- \"Patience is a weapon. Vengeance is an art.\""
    },
    faber: {
      name: "Faber",
      ability: "Deploy: Place the Walking Turret card in a free adjacent cell.",
      flavorText: "In the gilded halls of the Optimates, even the tools of war are works of art."
    },
    censor: {
      name: "Censor",
      ability: "Deploy: Exploit any card.\nSupport ⇒ Commit: Swap 1 of your exploits for 1 stun.",
      flavorText: "In the gilded halls of the Optimates, even the tools of war are works of art."
    },
    princeps: {
      name: "Princeps",
      ability: "Deploy: Shield 1. Aim a card with threat.\nSetup: Destroy a card with aim in a line.",
      flavorText: "Order is not requested. It is imposed."
    },
    immunis: {
      name: "Immunis",
      ability: "Support ⇒ Deploy: Return your Optimate from the discard pile to an adjacent cell. At the end of the phase, return the Optimate for 2 stuns.",
      flavorText: "In the gilded halls of the Optimates, even the tools of war are works of art."
    },
    centurion: {
      name: "Centurion",
      ability: "Support ⇒ Setup: The power of other allied cards in the line increases by 1.",
      flavorText: "In the gilded halls of the Optimates, even the tools of war are works of art."
    },
    codeKeeper: {
      name: "Code Keeper",
      ability: "Deploy: Exploit opponent cards with threat.\nSupport ⇒ Commit: Move opponent card with exploit 1 cell.",
      flavorText: "The Signal is truth. All else is noise."
    },
    devoutSynthetic: {
      name: "Devout Synthetic",
      ability: "Deploy: Push an adjacent card 1 cell. May take its place.\nSupport ⇒ Setup: Destroy an adjacent card with threat or stun.",
      flavorText: "Flesh is a bug. The Signal is the patch."
    },
    unwaveringIntegrator: {
      name: "Unwavering Integrator",
      ability: "Deploy: Exploit any card.\nSupport ⇒ Setup: Gain 1 point for each of your exploits in the line.",
      flavorText: "The Signal is truth. All else is noise."
    },
    signalProphet: {
      name: "Signal Prophet",
      ability: "Deploy: Exploit each of your cards with support.\nSupport ⇒ Commit: Move your card with your exploit 1 cell.",
      flavorText: "The Signal is truth. All else is noise."
    },
    zealousMissionary: {
      name: "Zealous Missionary",
      ability: "Deploy: Exploit any card.\nSupport ⇒ Commit: Reduce the power of any card with your exploit by 1.",
      flavorText: "The Signal is truth. All else is noise."
    },
    overwatch: {
      name: "Overwatch",
      ability: "Aim any card. Choose: \n‣ Reveal opponent cards equal to total Aim. \n‣ Draw cards equal to total Aim."
    },
    tacticalManeuver: {
      name: "Tactical Maneuver",
      ability: "Move your unit to any cell in a line. Choose: \n‣ Draw cards equal to unit's power. \n‣ Gain points equal to unit's power."
    },
    inspiration: {
      name: "Inspiration",
      ability: "Remove counters from your unit. Choose: \n‣ Draw 1 card for each counter removed. \n‣ Gain 1 point for each counter removed."
    },
    dataInterception: {
      name: "Data Interception",
      ability: "Exploit any card. Choose: \n‣ Reveal opponent cards equal to total Exploit. \n‣ Move a unit with your Exploit to any cell in a line."
    },
    falseOrders: {
      name: "False Orders",
      ability: "Exploit an opponent unit. Choose: \n‣ Move Opponent (Range 2) then Reveal 2 cards. \n‣ Move Opponent (Range 2) then Stun unit."
    },
    mobilization1: {
      name: "Line Breach",
      ability: "Gain points in a chosen line of the battlefield."
    },
    mobilization2: {
      name: "Logistics Chain",
      ability: "Gain points in a chosen diagonal of the battlefield."
    },
    mobilization3: {
      name: "Sector Capture",
      ability: "Gain points from 4 adjacent allied cards."
    },
    reconDrone: {
      name: "Recon Drone",
      ability: "Setup: Move to any cell.\nCommit: You may reveal a card from the hand of your opponent who owns an adjacent card.",
      flavorText: "SynchroTech has created lightweight drones to patrol the streets, but the Hoods have other plans for them."
    },
    walkingTurret: {
      name: "Walking Turret",
      ability: "Support ⇒ Commit: If without shield, gain shield 1.",
      flavorText: "This military monster clearly has no place on the city streets."
    }
  }
};