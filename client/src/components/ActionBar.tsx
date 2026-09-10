import { HandKind } from '../../../shared/src/hand-types';
import { PlayDeclaration } from '../../../shared/src/rules';

export function ActionBar({
  selectedCount,
  canPass,
  onPlay,
  declarations,
  onPass,
  onBurst,
  burstKinds,
}: {
  readonly selectedCount: number;
  readonly canPass: boolean;
  readonly onPlay: (declaration?: PlayDeclaration) => void;
  readonly declarations: readonly PlayDeclaration[];
  readonly onPass: () => void;
  readonly onBurst: (kind: HandKind) => void;
  readonly burstKinds: readonly HandKind[];
}) {
  return (
    <div className="action-bar">
      <button type="button" onClick={() => onPlay()} disabled={selectedCount === 0}>出牌</button>
      {declarations.map((declaration) => <button type="button" key={declaration} onClick={() => onPlay(declaration)} disabled={selectedCount === 0}>出牌（{declaration}）</button>)}
      <button type="button" onClick={onPass} disabled={!canPass}>过牌</button>
      {burstKinds.map((kind) => <button type="button" key={kind} onClick={() => onBurst(kind)}>爆：{kind}</button>)}
    </div>
  );
}
