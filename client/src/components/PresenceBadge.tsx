export function PresenceBadge({ away }: { readonly away: boolean }) {
  return away ? <span className="presence-badge away">暂离</span> : null;
}
