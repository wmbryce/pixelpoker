// ──────────────────────────────────────────────────────────────────────────────
// Core game types
// ──────────────────────────────────────────────────────────────────────────────

export interface CardType {
  suite: string;
  /** pokersolver-format string, e.g. "Ac", "2h" */
  value: string;
  label: string;
}

/** Actions that can appear in PlayerType.lastAction */
export type PlayerAction = 'FOLD' | 'CHECK' | 'CALL' | 'ALL IN' | `RAISE $${number}`;

export interface PlayerType {
  id: string;
  name: string;
  /** Current chip stack */
  stack: number;
  cards: CardType[];
  /** Total chips bet in the current street */
  lastBet: number;
  checked: boolean;
  /** Still in the hand (not folded) */
  isActive: boolean;
  isAllIn: boolean;
  /** Cumulative chips invested this hand (for side pot calculation) */
  contributed: number;
  isAI?: boolean;
  hasLeft?: boolean;
  lastAction: PlayerAction | null;
}

/** Side pot breakdown: amount eligible per pot tier */
export function computeSidePots(players: PlayerType[]): number[] {
  const active = players.filter((p) => p.contributed > 0);
  if (active.length === 0) return [];

  const levels = [...new Set(active.map((p) => p.contributed))].sort((a, b) => a - b);
  const amounts: number[] = [];
  let prev = 0;

  for (const level of levels) {
    const eligible = players.filter((p) => p.contributed >= level).length;
    const amount = (level - prev) * eligible;
    if (amount > 0) amounts.push(amount);
    prev = level;
  }

  return amounts;
}

export interface Poker {
  stage: number;
  pot: number;
  tableCards: CardType[];
  deck: CardType[];
  players: PlayerType[];
  winner: number[];
  winnerHandName: string;
  winnerCards: string[];
  actionOn: number;
  currentBet: number;
  dealer: number;
  smallBlind: number;
  bigBlind: number;
  timerDeadline: number | null;
  actionsRemaining: number;
  lastRaiseSize: number; // size of last raise increment — defines minimum re-raise
}

export const SMALL_BLIND = 10;
export const BIG_BLIND = 20;

// ──────────────────────────────────────────────────────────────────────────────
// Socket.IO event types
// ──────────────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  userId: string;
  username: string;
  text: string;
}

export type ActionType = 'raise' | 'call' | 'fold' | 'advance';

export interface GameAction {
  type: ActionType;
  playerIndex: number;
  bet?: number;
}

export interface ServerToClientEvents {
  message: (data: ChatMessage) => void;
  updateGame: (data: Poker) => void;
  roomJoined: (data: { playerIndex: number; game: Poker }) => void;
  error: (data: { message: string }) => void;
}

export interface ClientToServerEvents {
  joinRoom: (data: { username: string; room: string; clientId: string; smallBlind?: number; bigBlind?: number; aiCount?: number }) => void;
  rejoinRoom: (data: { clientId: string; room: string }) => void;
  chat: (text: string) => void;
  gameAction: (data: GameAction) => void;
  changeBlinds: (data: { smallBlind: number; bigBlind: number }) => void;
  rebuy: (data: { amount: number }) => void;
  leaveRoom: () => void;
}
