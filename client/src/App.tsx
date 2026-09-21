import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CommandEnvelope, CommandPayload, CommandType, RoomSnapshot } from '../../shared/src/protocol';
import { AccessView } from './views/AccessView';
import { GameView } from './views/GameView';
import { LobbyView } from './views/LobbyView';
import { ClientTransport, createSocketClient } from './transport/socket-client';

const SESSION_KEY = '414.sessionToken';
const NICKNAME_KEY = '414.nickname';

function isTestModeEnabled(): boolean {
  return new URLSearchParams(window.location.search).get('test') === '1';
}

function requestId(): string {
  return typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function disconnectedNames(previous: RoomSnapshot | null, next: RoomSnapshot): string[] {
  if (!previous || previous.public.phase === 'lobby' || next.public.phase === 'lobby') return [];
  return next.public.players
    .filter((player) => {
      const oldPlayer = previous.public.players.find((candidate) => candidate.seat === player.seat);
      return oldPlayer?.connected && !player.connected;
    })
    .map((player) => player.nickname);
}

export function App({ transport: providedTransport }: { readonly transport?: ClientTransport }) {
  const transport = useMemo(() => providedTransport ?? createSocketClient(), [providedTransport]);
  const testMode = isTestModeEnabled();
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [connectionNotice, setConnectionNotice] = useState('');
  const previousSnapshot = useRef<RoomSnapshot | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const consumeSnapshot = useCallback((next: RoomSnapshot) => {
    const names = disconnectedNames(previousSnapshot.current, next);
    if (names.length > 0) {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
      setConnectionNotice(`${names.join('、')} 已退出房间`);
      noticeTimer.current = setTimeout(() => setConnectionNotice(''), 6_000);
    }
    previousSnapshot.current = next;
    setSnapshot(next);
  }, []);

  useEffect(() => transport.subscribe(consumeSnapshot), [transport, consumeSnapshot]);
  useEffect(() => transport.onReplaced(() => setError('该会话已在其他页面接管')), [transport]);
  useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); }, []);

  // 页面加载时自动恢复会话
  useEffect(() => {
    const storage = testMode ? sessionStorage : localStorage;
    const savedToken = storage.getItem(SESSION_KEY);
    const savedNickname = storage.getItem(NICKNAME_KEY);
    if (!savedToken || !savedNickname) return;
    let cancelled = false;
    setBusy(true);
    transport.login('', savedToken)
      .then(() => transport.join(savedNickname, '414'))
      .then((snap) => { if (!cancelled) consumeSnapshot(snap); })
      .catch(() => {
        // 恢复失败，清除过期凭据，留在登录页
        storage.removeItem(SESSION_KEY);
        storage.removeItem(NICKNAME_KEY);
      })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [transport, testMode, consumeSnapshot]);

  const runCommand = (type: CommandType, payload: CommandPayload) => {
    if (!snapshot) return;
    const command: CommandEnvelope = {
      type,
      requestId: requestId(),
      handNumber: snapshot.public.handNumber,
      stateVersion: snapshot.public.version,
      payload,
    };
    void transport.command(command).then((result) => consumeSnapshot(result.snapshot)).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : '操作失败'));
  };

  const enterRoom = async (inviteCode: string, nickname: string) => {
    setBusy(true);
    setError('');
    try {
      const storage = testMode ? sessionStorage : localStorage;
      const savedToken = storage.getItem(SESSION_KEY) ?? undefined;
      const auth = await transport.login(inviteCode, savedToken);
      storage.setItem(SESSION_KEY, auth.sessionToken);
      storage.setItem(NICKNAME_KEY, nickname);
      consumeSnapshot(await transport.join(nickname, '414'));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : '进入房间失败');
    } finally {
      setBusy(false);
    }
  };

  const leaveRoom = async () => {
    if (!window.confirm('退出后将释放当前身份，确定退出吗？')) return;
    const storage = testMode ? sessionStorage : localStorage;
    try {
      await transport.leave();
      storage.removeItem(SESSION_KEY);
      storage.removeItem(NICKNAME_KEY);
      window.location.assign(testMode ? '/?test=1' : '/');
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : '退出失败');
    }
  };

  const roomNotice = connectionNotice ? <p className="room-notice" role="status">{connectionNotice}</p> : null;
  if (!snapshot) return <><AccessView onSubmit={enterRoom} error={error} busy={busy} testMode={testMode} />{roomNotice}</>;
  if (snapshot.public.phase === 'lobby') {
    return <><LobbyView snapshot={snapshot.public} ownSeat={snapshot.private.seat} spectator={Boolean(snapshot.private.spectator)} onStart={() => runCommand('start-hand', {})} onRemove={(seat) => runCommand('remove-player', { seat })} onLeave={leaveRoom} testMode={testMode} />{roomNotice}{error ? <p role="alert">{error}</p> : null}</>;
  }
  return <><GameView snapshot={snapshot} onCommand={runCommand} onActivity={() => transport.activity()} onReady={() => runCommand('ready', {})} onLeave={leaveRoom} testMode={testMode} />{roomNotice}{error ? <p role="alert">{error}</p> : null}</>;
}
