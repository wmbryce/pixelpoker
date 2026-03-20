import type { Poker, GameAction, CardType } from './types';

// pokersolver has no type definitions
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Hand = require('pokersolver').Hand;

// ──────────────────────────────────────────────────────────────────────────────
// Personas
// ──────────────────────────────────────────────────────────────────────────────

export interface AIPersona {
  name: string;
  // Play style knobs (0–1 scale)
  tightness: number;      // higher = plays fewer hands (fold threshold)
  aggression: number;     // higher = raises more vs calling
  bluffFreq: number;      // chance to bluff with weak hands
  skillJitter: number;    // noise added to hand eval (higher = worse)
  allInThreshold: number; // strength needed to consider shoving
  chatFrequency: number;  // 0–1 how often they talk
  // Chat lines by trigger
  chat: {
    onFold: string[];
    onCall: string[];
    onRaise: string[];
    onAllIn: string[];
    onWin: string[];
    onLose: string[];
    onBluff: string[];
    onBigPot: string[];
    taunt: string[];
  };
}

const PERSONAS: AIPersona[] = [
  {
    name: 'VINNY',
    tightness: 0.15, aggression: 0.8, bluffFreq: 0.20,
    skillJitter: 0.12, allInThreshold: 0.70, chatFrequency: 0.7,
    chat: {
      onFold: ["I'll let you have that one", "Fine, take it", "Not worth my time"],
      onCall: ["Let's see what you got", "I'm in baby", "Money talks"],
      onRaise: ["PUMP IT UP", "Let's make this interesting", "Pay to play sweetheart"],
      onAllIn: ["ALL IN BABY LET'S GOOO", "YOU FEEL LUCKY??", "SEND IT"],
      onWin: ["TOO EASY", "Thanks for the donation", "That's how we do it in Jersey"],
      onLose: ["Rigged", "You got lucky this time", "I'll get it back don't worry"],
      onBluff: ["Had the nuts obviously", "You didn't want to see those cards trust me"],
      onBigPot: ["NOW we're playing poker", "This is what I came for"],
      taunt: ["You playing poker or checkers?", "Wake me up when you make a real bet", "My grandma plays harder than this"],
    },
  },
  {
    name: 'ALICE',
    tightness: 0.55, aggression: 0.7, bluffFreq: 0.08,
    skillJitter: 0.04, allInThreshold: 0.82, chatFrequency: 0.3,
    chat: {
      onFold: ["Smart fold.", "Not my hand."],
      onCall: ["Interesting.", "Let's see the next card."],
      onRaise: ["Raise.", "I think you're bluffing."],
      onAllIn: ["All in. Do what you have to.", "Calculate your odds carefully."],
      onWin: ["As expected.", "Should've folded pre."],
      onLose: ["Well played.", "You earned that one."],
      onBluff: ["Information is expensive.", "You'll never know."],
      onBigPot: ["The math checks out.", "High variance spot."],
      taunt: ["Your bet sizing tells me everything.", "Interesting line you're taking there."],
    },
  },
  {
    name: 'CHAD',
    tightness: 0.10, aggression: 0.3, bluffFreq: 0.05,
    skillJitter: 0.18, allInThreshold: 0.90, chatFrequency: 0.6,
    chat: {
      onFold: ["Eh whatever", "I'll fold I guess", "This hand was boring anyway"],
      onCall: ["Sure why not", "YOLO", "I call everything lol"],
      onRaise: ["Wait I meant to call", "Oops raise I guess", "Go big or go home right?"],
      onAllIn: ["Wait what did I just do", "ALL IN oh no", "Is it too late to take that back"],
      onWin: ["Wait I won?? LET'S GO", "I knew that 7-2 was gold", "Skill game btw"],
      onLose: ["I had a feeling about that hand", "Almost had it", "That's poker baby"],
      onBluff: ["I totally had the flush", "I always have it"],
      onBigPot: ["Whoa that's a lot of chips", "Can someone explain what just happened"],
      taunt: ["Is this Texas Hold'em or Go Fish", "I don't even know the rules tbh", "Vibes > strategy"],
    },
  },
  {
    name: 'NIKO',
    tightness: 0.60, aggression: 0.4, bluffFreq: 0.03,
    skillJitter: 0.06, allInThreshold: 0.88, chatFrequency: 0.25,
    chat: {
      onFold: ["I fold. Patience.", "Not this time, my friend."],
      onCall: ["I will see.", "Hmm... okay."],
      onRaise: ["I raise. Carefully.", "A small investment."],
      onAllIn: ["Everything. I am certain.", "All in. No regrets."],
      onWin: ["Patience pays, my friend.", "Slow and steady.", "The patient hunter catches the prey."],
      onLose: ["A lesson. I will remember.", "You played it well."],
      onBluff: ["Perhaps I had it. Perhaps not.", "A mystery."],
      onBigPot: ["Big risk, big reward.", "This is a meaningful pot."],
      taunt: ["Rushing leads to mistakes.", "Take your time. Think.", "The cards reward discipline."],
    },
  },
  {
    name: 'SUKI',
    tightness: 0.35, aggression: 0.9, bluffFreq: 0.25,
    skillJitter: 0.10, allInThreshold: 0.65, chatFrequency: 0.5,
    chat: {
      onFold: ["Fine. But I'll be back.", "Retreating... for now."],
      onCall: ["I see you.", "Matched."],
      onRaise: ["More.", "That's not enough. RAISE.", "Let's turn up the heat."],
      onAllIn: ["ALL IN. No fear.", "You won't call. Coward.", "Let's end this."],
      onWin: ["Get rekt", "Another one.", "Too slow."],
      onLose: ["Lucky. Very lucky.", "That won't happen again.", "Enjoy it while it lasts."],
      onBluff: ["Maybe I had it. Maybe I didn't. You'll never know.", "Air. Pure air. And you folded."],
      onBigPot: ["This is MY pot.", "Now it gets real."],
      taunt: ["You're scared. I can tell.", "Fold already, we both know you will.", "Tick tock. Make a decision."],
    },
  },
  {
    name: 'BUBBA',
    tightness: 0.25, aggression: 0.5, bluffFreq: 0.12,
    skillJitter: 0.14, allInThreshold: 0.75, chatFrequency: 0.55,
    chat: {
      onFold: ["I'll sit this one out", "Nah", "Not feelin it"],
      onCall: ["Alright alright", "I'll tag along", "Deal me in partner"],
      onRaise: ["Let me sweeten the pot", "Bump it up a little", "How bout a little more"],
      onAllIn: ["ALL THE MARBLES", "Yeehaw let's ride", "Putting it all on the table"],
      onWin: ["Well butter my biscuit", "That's what I'm talkin about", "Easy money honey"],
      onLose: ["Dang it", "Well shoot", "You win some you lose some"],
      onBluff: ["Had ya goin didn't I", "Heh heh heh"],
      onBigPot: ["Now THAT'S a pot worth playin for", "Woo doggy look at that pile"],
      taunt: ["You gonna bet or just sit there", "C'mon make it interestin", "Play some cards already"],
    },
  },
];

/** Map from AI player ID to their assigned persona */
const personaMap = new Map<string, AIPersona>();

/** Assign a persona to an AI player, ensuring no duplicates in the same game */
export function assignPersona(playerId: string, usedNames: Set<string>): AIPersona {
  const available = PERSONAS.filter((p) => !usedNames.has(p.name));
  const persona = available.length > 0
    ? available[Math.floor(Math.random() * available.length)]
    : PERSONAS[Math.floor(Math.random() * PERSONAS.length)];

  personaMap.set(playerId, persona);
  return persona;
}

export function getPersona(playerId: string): AIPersona | undefined {
  return personaMap.get(playerId);
}

// ──────────────────────────────────────────────────────────────────────────────
// Trash talk
// ──────────────────────────────────────────────────────────────────────────────

type ChatTrigger = keyof AIPersona['chat'];

function pickLine(lines: string[]): string {
  return lines[Math.floor(Math.random() * lines.length)];
}

export interface AIChat {
  playerId: string;
  playerName: string;
  text: string;
}

/**
 * Decide whether the AI wants to say something based on game context.
 * Returns null if the AI stays quiet.
 */
export function getAIChat(
  game: Poker,
  playerIndex: number,
  trigger: ChatTrigger,
): AIChat | null {
  const player = game.players[playerIndex];
  const persona = personaMap.get(player.id);
  if (!persona) return null;

  // Roll against chat frequency
  if (Math.random() > persona.chatFrequency) return null;

  const lines = persona.chat[trigger];
  if (!lines || lines.length === 0) return null;

  return {
    playerId: player.id,
    playerName: player.name,
    text: pickLine(lines),
  };
}

/**
 * Get a random taunt (used between hands or when idle).
 */
export function getAITaunt(game: Poker, playerIndex: number): AIChat | null {
  return getAIChat(game, playerIndex, 'taunt');
}

// ──────────────────────────────────────────────────────────────────────────────
// Hand strength evaluation
// ──────────────────────────────────────────────────────────────────────────────

const RANK_VALUES: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};

/** Pre-flop hand strength (0–1) based on hole cards only */
export function preFlopStrength(cards: CardType[]): number {
  if (cards.length < 2) return 0.3;

  const [a, b] = cards;
  const rA = RANK_VALUES[a.value[0]] ?? 7;
  const rB = RANK_VALUES[b.value[0]] ?? 7;
  const high = Math.max(rA, rB);
  const low = Math.min(rA, rB);
  const paired = rA === rB;
  const suited = a.suite === b.suite;
  const gap = high - low;

  let score = (high + low) / 28;

  if (paired) {
    score = 0.5 + (high / 14) * 0.45;
  } else {
    if (suited) score += 0.06;
    if (gap === 1) score += 0.04;
    else if (gap === 2) score += 0.02;
    if (low >= 10) score += 0.08;
    if (gap >= 5) score -= 0.05;
  }

  return Math.max(0, Math.min(1, score));
}

/** Post-flop hand strength using pokersolver rank (1–9) normalized to 0–1 */
export function postFlopStrength(holeCards: CardType[], tableCards: CardType[]): number {
  const all = [...holeCards, ...tableCards].map((c) => c.value);
  const solved = Hand.solve(all);
  const rank: number = solved.rank;

  const BASE: Record<number, number> = {
    1: 0.10, 2: 0.30, 3: 0.50, 4: 0.65, 5: 0.72,
    6: 0.78, 7: 0.85, 8: 0.92, 9: 0.97,
  };

  let strength = BASE[rank] ?? 0.1;

  if (rank >= 2) {
    const holeValues = holeCards.map((c) => c.value);
    const handCards: string[] = solved.cards.map(
      (c: { value: string; suit: string }) => c.value + c.suit,
    );
    const usesHole = holeValues.some((v) => handCards.includes(v));
    if (usesHole) strength += 0.05;
  }

  if (rank === 2) {
    const pairCard = solved.cards[0];
    const pairRank = RANK_VALUES[pairCard.value] ?? 7;
    strength += (pairRank - 7) * 0.015;
  }

  return Math.max(0, Math.min(1, strength));
}

// ──────────────────────────────────────────────────────────────────────────────
// Decision logic (persona-aware)
// ──────────────────────────────────────────────────────────────────────────────

function jitter(value: number, amount: number): number {
  return value + (Math.random() - 0.5) * 2 * amount;
}

export interface AIDecisionResult {
  action: GameAction;
  chatTrigger: ChatTrigger;
  isBluff: boolean;
}

export const makeAIDecision = (game: Poker, playerIndex: number, overridePersona?: AIPersona): AIDecisionResult => {
  const player = game.players[playerIndex];
  const persona = overridePersona ?? personaMap.get(player.id);

  // Persona-specific knobs (fallback to defaults if no persona)
  const tightness = persona?.tightness ?? 0.35;
  const aggression = persona?.aggression ?? 0.5;
  const bluffFreq = persona?.bluffFreq ?? 0.05;
  const noiseAmount = persona?.skillJitter ?? 0.08;
  const allInThreshold = persona?.allInThreshold ?? 0.85;

  const amountToCall = game.currentBet - player.lastBet;
  const potOdds = amountToCall > 0 ? amountToCall / (game.pot + amountToCall) : 0;

  // Evaluate hand strength with persona-specific noise
  const isPreFlop = game.tableCards.length === 0;
  const rawStrength = isPreFlop
    ? preFlopStrength(player.cards)
    : postFlopStrength(player.cards, game.tableCards);
  const strength = jitter(rawStrength, noiseAmount);

  const activeOpponents = game.players.filter(
    (p, i) => i !== playerIndex && p.isActive && !p.isAllIn,
  ).length;
  const positionBonus = activeOpponents <= 1 ? 0.05 : 0;
  const effectiveStrength = strength + positionBonus;

  // Fold threshold scales with tightness
  const foldThreshold = 0.15 + tightness * 0.25; // 0.15 (loose) to 0.40 (tight)
  const strongThreshold = 0.55 + (1 - aggression) * 0.2; // aggressive bots raise more

  // Big pot detection
  const isBigPot = game.pot > game.bigBlind * 10;

  // ── Nothing to call (check or bet) ──
  if (amountToCall === 0) {
    // Aggressive bots bet more often
    const betThreshold = 0.5 + (1 - aggression) * 0.3;
    if (effectiveStrength > betThreshold && player.stack >= game.bigBlind * 2) {
      const sizeFactor = effectiveStrength > 0.85 ? 3 : aggression > 0.6 ? 2.5 : 2;
      const bet = Math.floor(Math.min(
        game.currentBet + game.bigBlind * sizeFactor,
        player.lastBet + player.stack,
      ));
      if (bet > game.currentBet) {
        return { action: { type: 'raise', playerIndex, bet }, chatTrigger: 'onRaise', isBluff: false };
      }
    }
    // Bluff bet with nothing
    if (effectiveStrength < foldThreshold && Math.random() < bluffFreq && player.stack >= game.bigBlind * 2) {
      const bet = Math.min(
        game.currentBet + game.bigBlind * 2,
        player.lastBet + player.stack,
      );
      if (bet > game.currentBet) {
        return { action: { type: 'raise', playerIndex, bet }, chatTrigger: 'onBluff', isBluff: true };
      }
    }
    return { action: { type: 'call', playerIndex }, chatTrigger: 'onCall', isBluff: false };
  }

  // ── Facing a bet ──
  const callFraction = amountToCall / player.stack;

  // Fold weak hands
  if (effectiveStrength < foldThreshold || (effectiveStrength < foldThreshold + 0.15 && potOdds > 0.35)) {
    // Bluff raise with weak hand
    if (Math.random() < bluffFreq && player.stack >= amountToCall * 2) {
      const bluffBet = Math.floor(Math.min(game.currentBet * 2.5, player.lastBet + player.stack));
      const minRaise = game.currentBet + game.lastRaiseSize;
      if (bluffBet >= minRaise) {
        return { action: { type: 'raise', playerIndex, bet: bluffBet }, chatTrigger: 'onBluff', isBluff: true };
      }
    }
    // Occasional stubborn call (looser players do this more)
    if (Math.random() < (1 - tightness) * 0.1) {
      return { action: { type: 'call', playerIndex }, chatTrigger: 'onCall', isBluff: false };
    }
    return { action: { type: 'fold', playerIndex }, chatTrigger: 'onFold', isBluff: false };
  }

  // Strong hand: raise
  if (effectiveStrength > strongThreshold && callFraction < 0.5) {
    const raiseSize = Math.floor(effectiveStrength > 0.8
      ? Math.min(game.currentBet * 3, player.lastBet + player.stack)
      : Math.min(game.currentBet * (1.5 + aggression), player.lastBet + player.stack));

    const minRaise = game.currentBet + game.lastRaiseSize;
    if (raiseSize >= minRaise && raiseSize > game.currentBet) {
      // All-in with very strong hands
      if (effectiveStrength > allInThreshold && Math.random() < aggression * 0.4) {
        return {
          action: { type: 'raise', playerIndex, bet: player.lastBet + player.stack },
          chatTrigger: 'onAllIn',
          isBluff: false,
        };
      }
      return { action: { type: 'raise', playerIndex, bet: raiseSize }, chatTrigger: 'onRaise', isBluff: false };
    }
  }

  // Medium hand: call if pot odds work
  if (effectiveStrength > potOdds || callFraction < 0.15) {
    return {
      action: { type: 'call', playerIndex },
      chatTrigger: isBigPot ? 'onBigPot' : 'onCall',
      isBluff: false,
    };
  }

  return { action: { type: 'fold', playerIndex }, chatTrigger: 'onFold', isBluff: false };
};
