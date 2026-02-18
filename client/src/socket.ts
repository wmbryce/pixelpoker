import { io, Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@pixelpoker/shared';

const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
  'http://localhost:8000',
  { autoConnect: false }
);

export default socket;
