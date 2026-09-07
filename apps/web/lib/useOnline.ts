'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { legalActions, type Action, type GameEvent, type ObservableState } from '@afromoly/engine';
import { PROTOCOL_VERSION, type LobbyPlayer, type ServerMessage } from '@afromoly/protocol';
import { toLines, waitingSeat, type LogLine } from './useGame';
import type { Seat } from './api';

export type Connection = 'connecting' | 'open' | 'closed';

export interface Online {
  connection: Connection;
  code: string;
  players: LobbyPlayer[];
  hostId: string | null;
  state: ObservableState | null;
  version: number;
  log: LogLine[];
  events: GameEvent[];
  batch: number;
  legal: Action[];
  waitingOn: string;
  error: string | null;
  send: (action: Action) => void;
  startGame: () => void;
}

const RETRY_MS = [500, 1_000, 2_000, 4_000, 8_000];

export function useOnline(seat: Seat): Online {
  const [connection, setConnection] = useState<Connection>('connecting');
  const [players, setPlayers] = useState<LobbyPlayer[]>([]);
  const [hostId, setHostId] = useState<string | null>(null);
  const [state, setState] = useState<ObservableState | null>(null);
  const [version, setVersion] = useState(0);
  const [log, setLog] = useState<LogLine[]>([
    { id: 0, text: 'Connecting to the rank.', tone: 'head' },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [batch, setBatch] = useState(0);

  const socket = useRef<WebSocket | null>(null);
  const versionRef = useRef(0);
  // Events can arrive just before the state that explains them, so names are
  // kept here rather than read out of whatever state has landed so far.
  const names = useRef<Record<string, string>>({});
  const nextLogId = useRef(1);
  const attempt = useRef(0);
  const closedByUs = useRef(false);

  const append = useCallback((lines: LogLine[]) => {
    if (lines.length === 0) return;
    setLog((current) => [...current, ...lines].slice(-300));
  }, []);

  useEffect(() => {
    closedByUs.current = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const open = () => {
      const url = `${seat.wsUrl}?gameId=${encodeURIComponent(seat.gameId)}&playerId=${encodeURIComponent(seat.playerId)}`;
      const ws = new WebSocket(url);
      socket.current = ws;
      setConnection('connecting');

      ws.onopen = () => {
        attempt.current = 0;
        setConnection('open');
        setError(null);
        ws.send(
          JSON.stringify({
            v: PROTOCOL_VERSION,
            type: 'subscribe',
            gameId: seat.gameId,
            playerId: seat.playerId,
          }),
        );
      };

      ws.onmessage = (event: MessageEvent<string>) => {
        let message: ServerMessage;
        try {
          message = JSON.parse(event.data) as ServerMessage;
        } catch {
          return;
        }
        switch (message.type) {
          case 'lobby':
            setPlayers(message.players);
            setHostId(message.hostId);
            for (const player of message.players) names.current[player.id] = player.name;
            break;
          case 'state':
            for (const player of message.state.players) names.current[player.id] = player.name;
            setState(message.state);
            setVersion(message.version);
            versionRef.current = message.version;
            break;
          case 'events': {
            const lines = toLines(
              message.events,
              nextLogId.current,
              (id) => names.current[id] ?? id,
            );
            nextLogId.current += lines.length;
            append(lines);
            setEvents(message.events);
            setBatch((n) => n + 1);
            break;
          }
          case 'error':
            setError(message.message);
            append([{ id: nextLogId.current++, text: message.message, tone: 'bad' }]);
            break;
          default:
            break;
        }
      };

      ws.onclose = () => {
        setConnection('closed');
        if (closedByUs.current) return;
        const wait = RETRY_MS[Math.min(attempt.current, RETRY_MS.length - 1)] ?? 8_000;
        attempt.current += 1;
        retryTimer = setTimeout(open, wait);
      };

      ws.onerror = () => setError('The connection to the rank dropped. Reconnecting.');
    };

    open();
    return () => {
      closedByUs.current = true;
      if (retryTimer) clearTimeout(retryTimer);
      socket.current?.close();
      socket.current = null;
    };
  }, [seat.gameId, seat.playerId, seat.wsUrl, append]);

  const post = useCallback((message: unknown) => {
    const ws = socket.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setError('Not connected to the rank yet.');
      return;
    }
    ws.send(JSON.stringify(message));
  }, []);

  const send = useCallback(
    (action: Action) => {
      setError(null);
      post({
        v: PROTOCOL_VERSION,
        type: 'intent',
        gameId: seat.gameId,
        playerId: seat.playerId,
        expectedVersion: versionRef.current,
        nonce: crypto.randomUUID(),
        intent: action,
      });
    },
    [post, seat.gameId, seat.playerId],
  );

  const startGame = useCallback(() => {
    setError(null);
    post({ v: PROTOCOL_VERSION, type: 'startGame', gameId: seat.gameId, playerId: seat.playerId });
  }, [post, seat.gameId, seat.playerId]);

  // Only ever offer moves this player may actually make.
  const legal = useMemo(
    () => (state ? legalActions(state, seat.playerId) : []),
    [state, seat.playerId],
  );
  const waitingOn = state ? waitingSeat(state) : '';

  return {
    connection,
    code: seat.code,
    players,
    hostId,
    state,
    version,
    log,
    events,
    batch,
    legal,
    waitingOn,
    error,
    send,
    startGame,
  };
}
