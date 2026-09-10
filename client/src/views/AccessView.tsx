export function AccessView({ onSubmit, error, busy }: {
  readonly onSubmit: (inviteCode: string, nickname: string) => void;
  readonly error: string;
  readonly busy: boolean;
}) {
  return (
    <main className="access-view">
      <h1>414 内测</h1>
      <p>私房邀请制 · 4 人桌</p>
      <form onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); onSubmit(String(form.get('inviteCode') ?? ''), String(form.get('nickname') ?? '')); }}>
        <label>邀请码<input name="inviteCode" aria-label="邀请码" autoComplete="off" required /></label>
        <label>昵称<input name="nickname" aria-label="昵称" maxLength={12} required /></label>
        <button type="submit" disabled={busy}>进入房间</button>
      </form>
      {error ? <p role="alert">{error}</p> : null}
    </main>
  );
}
