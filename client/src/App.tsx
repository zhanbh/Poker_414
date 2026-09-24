import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AnyCommandEnvelope,
  CommandEnvelope,
  CommandPayload,
  CommandType,
  GameId,
  GameSnapshot,
  isTexasSnapshot,
  TexasCommandEnvelope,
  TexasCommandPayload,
  TexasCommandType,
  RoomChatPayload,
} from '../../shared/src/protocol';
import { AccessView } from './views/AccessView';
import { GameView } from './views/GameView';
import { LobbyView } from './views/LobbyView';
import { TexasGameView } from './views/TexasGameView';
import { TexasLobbyView } from './views/TexasLobbyView';
import { ClientTransport, createSocketClient } from './transport/socket-client';
import { RoomChat, RoomChatMember } from './components/RoomChat';

const GAME_KEY = '414.selectedGame';

function isTestModeEnabled(): boolean {
  return new URLSearchParams(window.location.search).get('test') === '1';
}

function requestId(): string {
  return typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : Date.now() + '-' + Math.random();
}

function storageKey(gameId: GameId, kind: 'sessionToken' | 'nickname'): string {
  return gameId + '.' + kind;
}

function storedGame(storage: Storage): GameId {
  return storage.getItem(GAME_KEY) === 'texas' ? 'texas' : '414';
}

function disconnectedNames(previous: GameSnapshot | null, next: GameSnapshot): string[] {
  if (!previous || isTexasSnapshot(previous) || isTexasSnapshot(next) || previous.public.phase === 'lobby' || next.public.phase === 'lobby') return [];
  return next.public.players
    .filter((player) => {
      const oldPlayer = previous.public.players.find((candidate) => candidate.seat === player.seat);
      return oldPlayer?.connected && !player.connected;
    })
    .map((player) => player.nickname);
}

function hasRoomIdentity(snapshot: GameSnapshot | null): boolean {
  return Boolean(snapshot && (snapshot.private.seat || snapshot.private.spectator));
}


function chatMembersFor(snapshot: GameSnapshot): RoomChatMember[] {
  if (isTexasSnapshot(snapshot)) {
    return [
      ...snapshot.public.players.map((player) => ({ id: player.seat, seat: player.seat, nickname: player.nickname, label: player.positionLabel ?? player.seat + ' 位' })),
      ...snapshot.public.spectators.map((viewer, index) => ({ id: 'spectator-' + index + '-' + viewer.nickname, nickname: viewer.nickname, label: '观战' })),
    ];
  }
  return [
    ...snapshot.public.players.map((player) => ({ id: player.seat, seat: player.seat, nickname: player.nickname, label: player.seat + ' 位' })),
    ...(snapshot.public.spectators ?? []).map((viewer, index) => ({ id: 'spectator-' + index + '-' + viewer.nickname, nickname: viewer.nickname, label: '观战' })),
  ];
}
export function App({ transport: providedTransport }: { readonly transport?: ClientTransport }) {
  const transport = useMemo(() => providedTransport ?? createSocketClient(), [providedTransport]);
  const testMode = isTestModeEnabled();
  const storage = testMode ? sessionStorage : localStorage;
  const [gameId, setGameId] = useState<GameId>(() => storedGame(storage));
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [connectionNotice, setConnectionNotice] = useState('');
  const previousSnapshot = useRef<GameSnapshot | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const consumeSnapshot = useCallback((next: GameSnapshot) => {
    const previous = previousSnapshot.current;
    if (hasRoomIdentity(previous) && !hasRoomIdentity(next)) {
      storage.removeItem(storageKey(gameId, 'sessionToken'));
      storage.removeItem(storageKey(gameId, 'nickname'));
      previousSnapshot.current = null;
      setSnapshot(null);
      setConnectionNotice('房间席位已释放，请重新选择玩法');
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
      noticeTimer.current = setTimeout(() => setConnectionNotice(''), 6_000);
      return;
    }
    const names = disconnectedNames(previousSnapshot.current, next);
    if (names.length > 0) {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
      setConnectionNotice(names.join('、') + ' 已退出房间');
      noticeTimer.current = setTimeout(() => setConnectionNotice(''), 6_000);
    }
    previousSnapshot.current = next;
    setSnapshot(next);
  }, []);

  useEffect(() => transport.subscribe(consumeSnapshot), [transport, consumeSnapshot]);
  useEffect(() => transport.onReplaced(() => setError('该会话已在其他页面接管')), [transport]);
  useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); }, []);

  useEffect(() => {
    transport.selectGame?.(gameId);
    const savedToken = storage.getItem(storageKey(gameId, 'sessionToken'));
    const savedNickname = storage.getItem(storageKey(gameId, 'nickname'));
    if (!savedToken || !savedNickname) return;
    let cancelled = false;
    setBusy(true);
    transport.login('', savedToken)
      .then(() => transport.join(savedNickname, gameId === 'texas' ? 'texas' : '414'))
      .then((snap) => { if (!cancelled) consumeSnapshot(snap); })
      .catch(() => {
        storage.removeItem(storageKey(gameId, 'sessionToken'));
        storage.removeItem(storageKey(gameId, 'nickname'));
      })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [transport, testMode, gameId, consumeSnapshot, storage]);

  const selectGame = (next: GameId) => {
    if (snapshot) return;
    setGameId(next);
    storage.setItem(GAME_KEY, next);
    transport.selectGame?.(next);
    setError('');
  };

  const runCommand = (type: CommandType | TexasCommandType, payload: CommandPayload | TexasCommandPayload) => {
    if (!snapshot) return;
    const command: AnyCommandEnvelope = gameId === 'texas'
      ? {
        type: type as TexasCommandType,
        requestId: requestId(),
        handNumber: snapshot.public.handNumber,
        stateVersion: snapshot.public.version,
        payload: payload as TexasCommandPayload,
      } as TexasCommandEnvelope
      : {
        type: type as CommandType,
        requestId: requestId(),
        handNumber: snapshot.public.handNumber,
        stateVersion: snapshot.public.version,
        payload: payload as CommandPayload,
      } as CommandEnvelope;
    void transport.command(command)
      .then((result) => consumeSnapshot(result.snapshot))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : '操作失败'));
  };

  const enterRoom = async (inviteCode: string, nickname: string) => {
    setBusy(true);
    setError('');
    try {
      const tokenKey = storageKey(gameId, 'sessionToken');
      const nicknameKey = storageKey(gameId, 'nickname');
      transport.selectGame?.(gameId);
      const savedToken = storage.getItem(tokenKey) ?? undefined;
      const auth = await transport.login(inviteCode, savedToken);
      storage.setItem(tokenKey, auth.sessionToken);
      storage.setItem(nicknameKey, nickname);
      storage.setItem(GAME_KEY, gameId);
      consumeSnapshot(await transport.join(nickname, gameId === 'texas' ? 'texas' : '414'));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : '进入房间失败');
    } finally {
      setBusy(false);
    }
  };

  const leaveRoom = async () => {
    const is414HandInProgress = Boolean(
      snapshot
      && !isTexasSnapshot(snapshot)
      && !snapshot.private.spectator
      && (snapshot.public.phase === 'opening' || snapshot.public.phase === 'playing'),
    );
    const message = is414HandInProgress
      ? '退出将立即终止本局且不结算，其他玩家可以退出并重新开始。确定退出吗？'
      : '退出后将释放当前身份，确定退出吗？';
    if (!window.confirm(message)) return;
    try {
      await transport.leave();
      storage.removeItem(storageKey(gameId, 'sessionToken'));
      storage.removeItem(storageKey(gameId, 'nickname'));
      setSnapshot(null);
      previousSnapshot.current = null;
      setError('');
      setGameId('414');
      storage.setItem(GAME_KEY, '414');
      transport.selectGame?.('414');
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : '退出失败');
    }
  };

  const sendChat = async (payload: RoomChatPayload) => {
    try {
      if (!transport.chat) throw new Error('当前连接不支持聊天');
      await transport.chat(payload);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : '发送失败');
      throw reason;
    }
  };
  const roomNotice = connectionNotice ? <p className="room-notice" role="status">{connectionNotice}</p> : null;
  if (!snapshot) {
    return <><AccessView gameId={gameId} onGameChange={selectGame} onSubmit={enterRoom} error={error} busy={busy} testMode={testMode} />{roomNotice}</>;
  }
  const roomChat = <RoomChat messages={snapshot.public.chat ?? []} members={chatMembersFor(snapshot)} ownSeat={snapshot.private.seat} onSend={sendChat} />;
  if (gameId === 'texas' && isTexasSnapshot(snapshot)) {
    if (snapshot.public.phase === 'lobby') {
      return <><TexasLobbyView snapshot={snapshot.public} ownSeat={snapshot.private.seat} spectator={Boolean(snapshot.private.spectator)} onStart={() => runCommand('start-hand', {})} onRemove={(seat) => runCommand('remove-player', { seat })} onLeave={leaveRoom} testMode={testMode} />{roomNotice}{error ? <p role="alert">{error}</p> : null}{roomChat}</>;
    }
    return <><TexasGameView snapshot={snapshot} onCommand={runCommand} onLeave={leaveRoom} testMode={testMode} />{roomNotice}{error ? <p role="alert">{error}</p> : null}{roomChat}</>;
  }
  if (!isTexasSnapshot(snapshot) && snapshot.public.phase === 'lobby') {
    return <><LobbyView snapshot={snapshot.public} ownSeat={snapshot.private.seat} spectator={Boolean(snapshot.private.spectator)} onStart={() => runCommand('start-hand', {})} onRemove={(seat) => runCommand('remove-player', { seat })} onLeave={leaveRoom} testMode={testMode} />{roomNotice}{error ? <p role="alert">{error}</p> : null}{roomChat}</>;
  }
  if (!isTexasSnapshot(snapshot)) {
    return <><GameView snapshot={snapshot} onCommand={runCommand} onActivity={() => transport.activity()} onReady={() => runCommand('ready', {})} onLeave={leaveRoom} testMode={testMode} />{roomNotice}{error ? <p role="alert">{error}</p> : null}{roomChat}</>;
  }
  return null;
}
