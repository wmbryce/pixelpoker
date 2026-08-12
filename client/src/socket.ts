import type { ServerToClientEvents, ClientToServerEvents } from '@pixelpoker/shared';
import { WS_GAME_PATH, WS_TRAINING_PATH } from '@pixelpoker/shared/src/protocol';
import { MiniSocket } from './lib/miniSocket';

/** Server events plus the transport-level events MiniSocket synthesises. */
type ListenEvents = ServerToClientEvents & {
  connect: () => void;
  disconnect: () => void;
};

type Args<T> = T extends (...args: infer A) => unknown ? A : never;

/**
 * The typed surface the app codes against. Mirrors the Socket.IO client API we
 * used, so call sites did not have to change when the transport did.
 */
export interface TypedSocket<L, E> {
  readonly connected: boolean;
  connect(query?: Record<string, string>): void;
  disconnect(): void;
  emit<K extends keyof E & string>(event: K, ...args: Args<E[K]>): void;
  on<K extends keyof L & string>(event: K, handler: L[K]): void;
  off<K extends keyof L & string>(event: K, handler?: L[K]): void;
}

type GameSocket = TypedSocket<ListenEvents, ClientToServerEvents>;

// Each socket routes to a different Durable Object, so they are separate
// connections: the game socket is addressed by room code, training by client id.
const gameSocket = new MiniSocket(WS_GAME_PATH) as unknown as GameSocket;
export const trainingSocket = new MiniSocket(WS_TRAINING_PATH) as unknown as GameSocket;

export default gameSocket;
