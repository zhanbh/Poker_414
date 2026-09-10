import { PublicSnapshot } from '../../../shared/src/protocol';

export function MainStatus({ snapshot }: { readonly snapshot: PublicSnapshot }) {
  const current = snapshot.players.find((player) => player.seat === snapshot.currentTurn);
  return (
    <section className="main-status">
      <span>本手主：{snapshot.effectiveMain ?? '待定'}</span>
      <span>当前牌权：{current?.nickname ?? '待定'}</span>
      <span>AC：{snapshot.levels.AC}</span>
      <span>BD：{snapshot.levels.BD}</span>
    </section>
  );
}
