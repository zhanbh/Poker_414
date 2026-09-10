import { HandKind } from '../../../shared/src/hand-types';
import { PlayDeclaration } from '../../../shared/src/rules';

export function ActionBar({
  selectedCount,
  canPlay,
  canDifference,
  hasPlayableSelection,
  canPass,
  onPlay,
  declarations,
  onPass,
  onBurst,
  burstKinds,
}: {
  readonly selectedCount: number;
  readonly canPlay: boolean;
  readonly canDifference: boolean;
  readonly hasPlayableSelection: boolean;
  readonly canPass: boolean;
  readonly onPlay: (declaration?: PlayDeclaration) => void;
  readonly declarations: readonly PlayDeclaration[];
  readonly onPass: () => void;
  readonly onBurst: (kind: HandKind) => void;
  readonly burstKinds: readonly HandKind[];
}) {
  const priorityDeclaration = declarations.includes('difference') ? 'difference' : null;
  return (
    <div className="action-bar">
      <button type="button" onClick={() => onPlay()} disabled={!canPlay || !hasPlayableSelection || selectedCount === 0}>出牌</button>
      {priorityDeclaration ? <button className="difference-action" type="button" onClick={() => onPlay(priorityDeclaration)} disabled={!canDifference || selectedCount === 0}>差牌</button> : null}
      <button type="button" onClick={onPass} disabled={!canPass}>过牌</button>
      {burstKinds.map((kind) => <button type="button" key={kind} onClick={() => onBurst(kind)}>爆：{kind}</button>)}
    </div>
  );
}
