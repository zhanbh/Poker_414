import { useMemo, useState } from 'react';
import { findBurstCandidates } from '../../../shared/src/rule-engine';
import { Card } from '../../../shared/src/cards';
import { CommandPayload, CommandType, RoomSnapshot } from '../../../shared/src/protocol';
import { analyzeHand, getHandOptions } from '../../../shared/src/hand-types';
import { PlayDeclaration } from '../../../shared/src/rules';
import { ActionBar } from '../components/ActionBar';
import { BurstPrompt } from '../components/BurstPrompt';
import { CardHand } from '../components/CardHand';
import { MainStatus } from '../components/MainStatus';
import { PlayerSeat } from '../components/PlayerSeat';
import { StandDialog } from '../components/StandDialog';

export type GameCommand = (type: CommandType, payload: CommandPayload) => void;

export function GameView({ snapshot, onCommand, onActivity, testMode }: {
  readonly snapshot: RoomSnapshot;
  readonly onCommand: GameCommand;
  readonly onActivity: () => void;
  readonly testMode: boolean;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const ownHand = snapshot.private.hand;
  const burstKinds = useMemo(() => snapshot.private.burstLocked || !snapshot.public.effectiveMain ? [] : Array.from(new Set(
    findBurstCandidates(ownHand, snapshot.public.effectiveMain).map((candidate) => candidate.kind),
  )), [ownHand, snapshot.private.burstLocked, snapshot.public.effectiveMain]);
  const playersBySeat = new Map(snapshot.public.players.map((player) => [player.seat, player]));
  const onToggle = (card: Card) => {
    onActivity();
    setSelectedIds((ids) => ids.includes(card.id) ? ids.filter((id) => id !== card.id) : [...ids, card.id]);
  };
  const selected = selectedIds.filter((id) => ownHand.some((card) => card.id === id));
  const selectedCards = ownHand.filter((card) => selected.includes(card.id));
  const lead = snapshot.public.trick && snapshot.public.effectiveMain
    ? analyzeHand(snapshot.public.trick.cards, snapshot.public.effectiveMain)
    : null;
  const declarations: PlayDeclaration[] = [];
  if (snapshot.public.effectiveMain) {
    for (const option of getHandOptions(selectedCards, snapshot.public.effectiveMain)) {
      if (lead?.kind === 'single' && option.kind === 'pair' && option.rank === lead.rank) declarations.push('difference');
      else declarations.push(option.kind);
    }
  }

  return (
    <main className="game-view">
      {testMode ? <div className="test-mode-banner" role="status">单机四人测试模式 · 每个标签页都是独立玩家</div> : null}
      <MainStatus snapshot={snapshot.public} />
      {snapshot.public.phase === 'opening' ? <><div className="opening-draw">随机首牌权：{snapshot.public.candidateLeader ?? '抽取中'}</div><StandDialog mode={snapshot.public.openingMode} ownSeat={snapshot.private.seat ?? undefined} onChoose={(choice) => onCommand('opening', choice)} /></> : null}
      <div className="table-grid">
        {(['A', 'B', 'C', 'D'] as const).map((seat) => <PlayerSeat key={seat} seat={seat} player={playersBySeat.get(seat) ?? null} />)}
      </div>
      <section className="public-play">
        <h2>上一手</h2>
        {snapshot.public.publicLastPlay ? <p>{snapshot.public.publicLastPlay.seat}：{snapshot.public.publicLastPlay.kind}</p> : <p>尚未出牌</p>}
      </section>
      {snapshot.public.phase === 'settled' && snapshot.public.settlement ? <section className="settlement"><h2>本手结算</h2><p>{JSON.stringify(snapshot.public.settlement)}</p></section> : null}
      <CardHand cards={ownHand} selectedIds={selected} onToggle={onToggle} />
      <BurstPrompt kinds={burstKinds} onChoose={(kind) => onCommand('burst', { kind })} />
      <ActionBar
        selectedCount={selected.length}
        canPass={Boolean(snapshot.public.trick) && snapshot.public.currentTurn === snapshot.private.seat}
        declarations={Array.from(new Set(declarations))}
        onPlay={(declaration) => onCommand('play', { cardIds: selected, ...(declaration ? { declaration } : {}) })}
        onPass={() => onCommand('pass', {})}
        onBurst={(kind) => onCommand('burst', { kind })}
        burstKinds={[]}
      />
    </main>
  );
}
