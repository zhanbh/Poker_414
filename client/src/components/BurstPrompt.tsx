import { HandKind } from '../../../shared/src/hand-types';

export function BurstPrompt({ kinds, onChoose }: { readonly kinds: readonly HandKind[]; readonly onChoose: (kind: HandKind) => void }) {
  if (kinds.length === 0) return null;
  return (
    <aside className="burst-prompt">
      <span>剩余手牌可以一次出完，是否报爆？</span>
      {kinds.map((kind) => <button type="button" key={kind} onClick={() => onChoose(kind)}>报爆 {kind}</button>)}
    </aside>
  );
}
