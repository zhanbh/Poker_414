export function AccessView({ onSubmit, error, busy, testMode }: {
  readonly onSubmit: (inviteCode: string, nickname: string) => void;
  readonly error: string;
  readonly busy: boolean;
  readonly testMode: boolean;
}) {
  return (
    <main className="access-view">
      <h1>414 内测</h1>
      <p>私房邀请制 · 4 人桌</p>
      <form onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); onSubmit(String(form.get('inviteCode') ?? ''), String(form.get('nickname') ?? '')); }}>
        <label>邀请码<input name="inviteCode" aria-label="邀请码" autoComplete="off" required /></label>
        <label>昵称<input name="nickname" aria-label="昵称" maxLength={12} required /></label>
        <p className="join-mode-hint">有空位自动成为玩家，满员后自动观战</p>
        <button type="submit" disabled={busy}>进入房间</button>
      </form>
      {testMode
        ? <p className="test-mode-hint" role="status">单机四人测试模式：本标签页使用独立玩家会话</p>
        : <a className="test-mode-link" href="?test=1">开启单机四人测试模式</a>}
      {error ? <p role="alert">{error}</p> : null}
    </main>
  );
}
