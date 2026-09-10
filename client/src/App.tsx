import { useEffect, useMemo, useState } from 'react';
import { CommandEnvelope, CommandPayload, CommandType, RoomSnapshot } from '../../shared/src/protocol';
import { AccessView } from './views/AccessView';
import { GameView } from './views/GameView';
import { LobbyView } from './views/LobbyView';
import { ClientTransport, createSocketClient } from './transport/socket-client';

const SESSION_KEY = '414.sessionToken';

function isTestModeEnabled(): boolean {
  return new URLSearchParams(window.location.search).get('test') === '1';
}

function requestId(): string {
  return typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export function App({ transport: providedTransport }: { readonly transport?: ClientTransport }) {
  const transport = useMemo(() => providedTransport ?? createSocketClient(), [providedTransport]);
  const testMode = isTestModeEnabled();
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => transport.subscribe((next) => setSnapshot(next)), [transport]);
  useEffect(() => transport.onReplaced(() => setError('该会话已在其他页面接管')), [transport]);

  const runCommand = (type: CommandType, payload: CommandPayload) => {
    if (!snapshot) return;
    const command: CommandEnvelope = {
      type,
      requestId: requestId(),
      handNumber: snapshot.public.handNumber,
      stateVersion: snapshot.public.version,
      payload,
    };
    void transport.command(command).then((result) => setSnapshot(result.snapshot)).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : '操作失败'));
  };

  const enterRoom = async (inviteCode: string, nickname: string) => {
    setBusy(true);
    setError('');
    try {
      const storage = testMode ? sessionStorage : localStorage;
      const savedToken = storage.getItem(SESSION_KEY) ?? undefined;
      const auth = await transport.login(inviteCode, savedToken);
      storage.setItem(SESSION_KEY, auth.sessionToken);
      setSnapshot(await transport.join(nickname, '414'));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : '进入房间失败');
    } finally {
      setBusy(false);
    }
  };

  if (!snapshot) return <AccessView onSubmit={enterRoom} error={error} busy={busy} testMode={testMode} />;
  if (snapshot.public.phase === 'lobby') {
    return <><LobbyView snapshot={snapshot.public} ownSeat={snapshot.private.seat} onStart={() => runCommand('start-hand', {})} onRemove={(seat) => runCommand('remove-player', { seat })} testMode={testMode} />{error ? <p role="alert">{error}</p> : null}</>;
  }
  return <><GameView snapshot={snapshot} onCommand={runCommand} onActivity={() => transport.activity()} onReady={() => runCommand('ready', {})} testMode={testMode} />{error ? <p role="alert">{error}</p> : null}</>;
}
