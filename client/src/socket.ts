import { io, Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@pixelpoker/shared';
import { SERVER_URL } from './config';

const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
  SERVER_URL,
  { autoConnect: false }
);

export default socket;
