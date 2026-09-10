import { HandKind } from '../../../shared/src/hand-types';

export function BurstPrompt({ kinds, onChoose, onSkip }: {
  readonly kinds: readonly HandKind[];
  readonly onChoose: (kind: HandKind) => void;
  readonly onSkip: () => void;
}) {
  if (kinds.length === 0) return null;
  const kindLabels: Partial<Record<HandKind, string>> = {
    pair: '对子',
    sequence: '顺子',
    'consecutive-pairs': '连对',
    'ordinary-bomb': '普通炸',
    'main-bomb': '主炸',
    '414': '414',
    single: '单牌',
  };
  return (
    <aside className="burst-prompt">
      <span>剩余手牌可以一次出完，请选择是否爆牌</span>
      {kinds.map((kind) => <button type="button" key={kind} onClick={() => onChoose(kind)}>爆：{kindLabels[kind] ?? kind}</button>)}
      <button type="button" onClick={onSkip}>不爆，继续出牌</button>
    </aside>
  );
}
