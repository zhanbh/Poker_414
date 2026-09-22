import { GAME_SELECTIONS, GameId } from '../../../shared/src/protocol';

export function AccessView({ onSubmit, error, busy, testMode, gameId = '414', onGameChange }: {
  readonly onSubmit: (inviteCode: string, nickname: string) => void;
  readonly error: string;
  readonly busy: boolean;
  readonly testMode: boolean;
  readonly gameId?: GameId;
  readonly onGameChange?: (gameId: GameId) => void;
}) {
  const selected = GAME_SELECTIONS.find((game) => game.id === gameId) ?? GAME_SELECTIONS[0];
  return (
    <main className="access-view">
      <h1>选择玩法</h1>
      <p>先选择游戏，再进入对应的私房房间</p>
      <div className="game-picker" aria-label="选择游戏">
        {GAME_SELECTIONS.map((game) => (
          <button
            type="button"
            key={game.id}
            className={game.id === gameId ? 'game-card selected' : 'game-card'}
            aria-pressed={game.id === gameId}
            onClick={() => onGameChange?.(game.id)}
          >
            <strong>{game.name}</strong>
            <span>{game.description}</span>
            <small>{game.id === 'texas' ? '最多 4 人入座 · 牌局中后加入下一局' : game.maxPlayers + ' 人桌 · 满员后自动观战'}</small>
          </button>
        ))}
      </div>
      <h2>{selected.name} 内测</h2>
      <p>{selected.description} · 邀请制</p>
      <form onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); onSubmit(String(form.get('inviteCode') ?? ''), String(form.get('nickname') ?? '')); }}>
        <label>邀请码<input name="inviteCode" aria-label="邀请码" autoComplete="off" required /></label>
        <label>昵称<input name="nickname" aria-label="昵称" maxLength={12} required /></label>
        <p className="join-mode-hint">有空位自动成为玩家；牌局中加入将等待下一局</p>
        <button type="submit" disabled={busy}>进入房间</button>
      </form>
      {testMode
        ? <p className="test-mode-hint" role="status">单机多标签测试模式：本标签页使用独立玩家会话</p>
        : <a className="test-mode-link" href="?test=1">开启单机多标签测试模式</a>}
      {error ? <p role="alert">{error}</p> : null}
    </main>
  );
}
