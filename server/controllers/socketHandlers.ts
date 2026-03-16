import { Server } from 'socket.io';
import chalk from 'chalk';
import type { ServerToClientEvents, ClientToServerEvents } from './types';
import { SMALL_BLIND, BIG_BLIND } from './types';
import { initializeGame, createPlayer, createAIPlayer } from './gameplay';
import { assignPersona } from './ai';
import { fold, nextPlayer } from './actions';
import {
  rooms,
  publicRooms,
  sessions,
  clientRecords,
  broadcastGame,
  clearTurnTimer,
  clearAutoDeal,
  processGameAction,
  handleActionResult,
} from './roomManager';

const MAX_AI_PLAYERS = 5;
const MAX_PLAYERS = 6;
const MAX_BLIND = 10_000;

const actionTimestamps = new Map<string, number>();
const ACTION_COOLDOWN_MS = 300;

export function registerHandlers(io: Server<ClientToServerEvents, ServerToClientEvents>) {
  io.on('connection', (socket) => {
    console.log(chalk.green(`+ connected: ${socket.id}`));

    socket.on('joinRoom', ({ username, room, clientId, smallBlind, bigBlind, aiCount }) => {
      socket.join(room);

      if (!rooms.has(room)) {
        rooms.set(room, initializeGame(smallBlind ?? SMALL_BLIND, bigBlind ?? BIG_BLIND));
      }

      const game = rooms.get(room)!;
      if (game.players.length >= MAX_PLAYERS) {
        socket.emit('error', { message: 'ROOM_FULL' });
        return;
      }
      const playerIndex = game.players.length;
      game.players.push(createPlayer(clientId, username));

      sessions.set(socket.id, { room, playerIndex, name: username, clientId });
      clientRecords.set(clientId, { room, playerIndex, name: username, socketId: socket.id });

      // Add AI players (only when the room is first created, i.e. this is player 0)
      if (playerIndex === 0 && aiCount && aiCount > 0) {
        const count = Math.min(aiCount, MAX_AI_PLAYERS);
        const usedNames = new Set<string>();
        for (let i = 0; i < count; i++) {
          const aiPlayer = createAIPlayer(game.players.length);
          const persona = assignPersona(aiPlayer.id, usedNames);
          usedNames.add(persona.name);
          aiPlayer.name = persona.name;
          game.players.push(aiPlayer);
        }
        console.log(
          chalk.magenta(`  added ${count} AI: ${game.players.filter((p) => p.isAI).map((p) => p.name).join(', ')} to "${room}"`),
        );
      }

      socket.emit('roomJoined', { playerIndex, game });

      socket.broadcast
        .to(room)
        .emit('message', { userId: socket.id, username: 'System', text: `${username} joined` });

      broadcastGame(room);
      console.log(chalk.blue(`  ${username} joined room "${room}" as player ${playerIndex} [cid: ${clientId.slice(0, 8)}]`));
    });

    socket.on('rejoinRoom', ({ clientId, room }) => {
      const record = clientRecords.get(clientId);

      if (!record || record.room !== room) {
        socket.emit('error', { message: 'SESSION_NOT_FOUND' });
        return;
      }

      const game = rooms.get(room);
      if (!game) {
        socket.emit('error', { message: 'ROOM_NOT_FOUND' });
        return;
      }

      socket.join(room);
      sessions.set(socket.id, { room: record.room, playerIndex: record.playerIndex, name: record.name, clientId });
      clientRecords.set(clientId, { ...record, socketId: socket.id });

      socket.emit('roomJoined', { playerIndex: record.playerIndex, game });

      socket.broadcast
        .to(room)
        .emit('message', { userId: socket.id, username: 'System', text: `${record.name} reconnected` });

      broadcastGame(room);
      console.log(chalk.cyan(`  ${record.name} rejoined room "${room}" as player ${record.playerIndex} [cid: ${clientId.slice(0, 8)}]`));
    });

    socket.on('chat', (text) => {
      const session = sessions.get(socket.id);
      if (!session) return;
      io.to(session.room).emit('message', { userId: socket.id, username: session.name, text });
    });

    socket.on('gameAction', (action) => {
      const now = Date.now();
      const lastAction = actionTimestamps.get(socket.id) ?? 0;
      if (now - lastAction < ACTION_COOLDOWN_MS) return;
      actionTimestamps.set(socket.id, now);

      const session = sessions.get(socket.id);
      if (!session) return;

      const game = rooms.get(session.room);
      if (!game) return;

      clearTurnTimer(session.room);
      clearAutoDeal(session.room);

      const updated = processGameAction(game, action);
      if (updated) {
        handleActionResult(session.room, updated);
      }
    });

    socket.on('changeBlinds', ({ smallBlind, bigBlind }) => {
      const session = sessions.get(socket.id);
      if (!session) return;

      const game = rooms.get(session.room);
      if (!game || game.stage !== 0) return;
      const sb = Math.floor(smallBlind);
      const bb = Math.floor(bigBlind);
      if (sb <= 0 || bb <= sb || sb > MAX_BLIND || bb > MAX_BLIND) return;

      game.smallBlind = sb;
      game.bigBlind = bb;
      broadcastGame(session.room);
    });

    socket.on('rebuy', ({ amount }) => {
      const session = sessions.get(socket.id);
      if (!session) return;

      const game = rooms.get(session.room);
      if (!game) return;

      const player = game.players[session.playerIndex];
      if (!player || player.stack > 0) return; // only busted players can rebuy

      const validAmount = Math.max(100, Math.min(10_000, Math.floor(amount)));
      player.stack = validAmount;
      // If between hands, activate them immediately so they're dealt in next hand
      if (game.stage === 0) player.isActive = true;

      broadcastGame(session.room);
      console.log(chalk.green(`  ${session.name} rebuys $${validAmount} in room "${session.room}"`));
    });

    socket.on('leaveRoom', () => {
      const session = sessions.get(socket.id);
      if (!session) return;

      const game = rooms.get(session.room);
      if (!game) return;

      const pi = session.playerIndex;
      const player = game.players[pi];
      if (!player) return;

      sessions.delete(socket.id);
      clientRecords.delete(session.clientId);

      // If it's their turn mid-hand, fold first so the hand can continue
      if (game.stage >= 1 && game.stage <= 4 && game.actionOn === pi && player.isActive) {
        clearTurnTimer(session.room);
        const { result } = fold(game, pi);
        result.actionsRemaining = Math.max(0, result.actionsRemaining - 1);
        result.actionOn = nextPlayer(result, pi);
        result.players[pi].hasLeft = true;
        result.players[pi].stack = 0;
        handleActionResult(session.room, result);
      } else {
        player.isActive = false;
        player.hasLeft = true;
        player.stack = 0;
        broadcastGame(session.room);
      }

      console.log(chalk.yellow(`  ${session.name} left room "${session.room}"`));
    });

    socket.on('disconnect', () => {
      actionTimestamps.delete(socket.id);
      const session = sessions.get(socket.id);
      sessions.delete(socket.id);
      if (session) {
        // Mark the persistent record as having no active socket — do NOT delete it
        const record = clientRecords.get(session.clientId);
        if (record) clientRecords.set(session.clientId, { ...record, socketId: null });

        // Do NOT clear the turn timer — let it fire so the game doesn't freeze
        // if the disconnected player had the action. Auto-fold handles it.
        console.log(chalk.red(`- disconnected: ${session.name} (${socket.id}) [cid: ${session.clientId.slice(0, 8)}]`));
      }
    });
  });
}
