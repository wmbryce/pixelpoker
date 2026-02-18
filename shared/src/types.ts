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
}

export interface Poker {
  stage: number;
  pot: number;
  tableCards: CardType[];
  deck: CardType[];
  players: PlayerType[];
  winner: number[];
  actionOn: number;
  currentBet: number;
  dealer: number;
}

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
  joinRoom: (data: { username: string; room: string }) => void;
  chat: (text: string) => void;
  gameAction: (data: GameAction) => void;
}
