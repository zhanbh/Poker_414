import { PublicSnapshot } from '../../../shared/src/protocol';

export function MainStatus({ snapshot }: { readonly snapshot: PublicSnapshot }) {
  return (
    <section className="main-status" aria-label="本手主">
      <span className="main-level">本手主：{snapshot.effectiveMain ?? '待定'}</span>
    </section>
  );
}
