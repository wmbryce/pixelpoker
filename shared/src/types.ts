// ──────────────────────────────────────────────────────────────────────────────
// Core game types
// ──────────────────────────────────────────────────────────────────────────────

export interface CardType {
  suite: string;
  /** pokersolver-format string, e.g. "Ac", "2h" */
  value: string;
  label: string;
}

export interface PlayerType {
  id: string;
  name: string;
  stack: number;
  cards: CardType[];
  lastBet: number;
  checked: boolean;
  isActive: boolean;
  isAI?: boolean;
  lastAction: string | null;
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
}

export const SMALL_BLIND = 10;
export const BIG_BLIND = 20;

export const GAME_STAGES = [
  'pre-flop',
  'flop',
  'turn',
  'river',
  'Finish',
  'Reset',
] as const;

export type GameStage = (typeof GAME_STAGES)[number];

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
}
