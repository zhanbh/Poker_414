export function PresenceBadge({ away, connected }: { readonly away: boolean; readonly connected: boolean }) {
  if (!connected) return <span className="presence-badge disconnected">已断开</span>;
  return away ? <span className="presence-badge away">暂离</span> : null;
}
