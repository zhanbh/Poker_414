import { HandKind } from '../../../shared/src/hand-types';

export function BurstPrompt({ kinds, onChoose, onSkip }: {
  readonly kinds: readonly HandKind[];
  readonly onChoose: (kind: HandKind) => void;
  readonly onSkip: () => void;
}) {
  if (kinds.length === 0) return null;
  const selectedKind = kinds[0];
  return (
    <aside className="burst-prompt">
      <span>剩余手牌可以一次出完</span>
      <button type="button" onClick={() => onChoose(selectedKind)}>爆</button>
      <button type="button" onClick={onSkip}>不爆</button>
    </aside>
  );
}
