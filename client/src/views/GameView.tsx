import { type MouseEvent, useEffect, useMemo, useState } from 'react';
import { findBurstCandidates } from '../../../shared/src/rule-engine';
import { Card } from '../../../shared/src/cards';
import { CommandPayload, CommandType, RoomChatInteraction, RoomSnapshot } from '../../../shared/src/protocol';
import { analyzeHand, getHandOptions } from '../../../shared/src/hand-types';
import { PlayDeclaration, validatePlay } from '../../../shared/src/rules';
import { Seat, teamLabel, teamOf } from '../../../shared/src/scoring';
import { ActionBar } from '../components/ActionBar';
import { BurstPrompt } from '../components/BurstPrompt';
import { CardHand, cardColorClass, cardLabel } from '../components/CardHand';
import { MainStatus } from '../components/MainStatus';
import { PlayerSeat } from '../components/PlayerSeat';
import { RoomInteractionEffect, RoomInteractionTarget } from '../components/InteractionMenu';
import { RoomPurposeNotice } from '../components/RoomPurposeNotice';
import { SettlementDialog } from '../components/SettlementDialog';
import { SpectatorHands } from '../components/SpectatorHands';
import { StandDialog } from '../components/StandDialog';

export type GameCommand = (type: CommandType, payload: CommandPayload) => void;

const SEATS: readonly Seat[] = ['A', 'B', 'C', 'D'];
const TABLE_POSITIONS = ['bottom', 'left', 'top', 'right'] as const;

function tableSeatsFor(ownSeat: Seat | null) {
  const ownIndex = ownSeat ? SEATS.indexOf(ownSeat) : 0;
  return SEATS.map((seat) => {
    const offset = (SEATS.indexOf(seat) - ownIndex + SEATS.length) % SEATS.length;
    return { seat, position: TABLE_POSITIONS[offset] };
  });
}

export function GameView({ snapshot, onCommand, onActivity, onReady, onLeave, testMode, onInteract, interactionEffect = null }: {
  readonly snapshot: RoomSnapshot;
  readonly onCommand: GameCommand;
  readonly onActivity: () => void;
  readonly onReady?: () => void;
  readonly onLeave: () => void;
  readonly testMode: boolean;
  readonly onInteract?: (target: RoomInteractionTarget, interaction: RoomChatInteraction) => Promise<void> | void;
  readonly interactionEffect?: RoomInteractionEffect | null;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showSettlement, setShowSettlement] = useState(snapshot.public.phase === 'settled');
  useEffect(() => {
    setSelectedIds([]);
  }, [snapshot.public.handNumber]);
  const isSpectator = Boolean(snapshot.private.spectator);
  const ownHand = snapshot.private.hand;
  const tableSeats = useMemo(() => tableSeatsFor(snapshot.private.seat), [snapshot.private.seat]);
  const ownPlayer = snapshot.public.players.find((player) => player.seat === snapshot.private.seat);
  const ownHandIsDiscarded = Boolean(ownPlayer && snapshot.public.openingMode !== 'normal' && !ownPlayer.activeInHand && ownPlayer.finishedRank === null);
  const burstPendingForMe = snapshot.public.burstPendingSeat === snapshot.private.seat;
  const isMyTurn = snapshot.public.phase === 'playing'
    && snapshot.public.currentTurn === snapshot.private.seat
    && !snapshot.public.burstPendingSeat
    && Boolean(ownPlayer?.activeInHand);
  const burstKinds = useMemo(() => !burstPendingForMe || !snapshot.public.effectiveMain ? [] : Array.from(new Set(
    findBurstCandidates(ownHand, snapshot.public.effectiveMain).map((candidate) => candidate.kind),
  )), [burstPendingForMe, ownHand, snapshot.private.burstLocked, snapshot.public.effectiveMain]);
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
  let hasPlayableSelection = false;
  let hasDifferenceSelection = false;
  if (snapshot.public.effectiveMain) {
    for (const option of getHandOptions(selectedCards, snapshot.public.effectiveMain)) {
      const declaration: PlayDeclaration = lead?.kind === 'single' && option.kind === 'pair' && option.rank === lead.rank
        ? 'difference'
        : option.kind;
      if (validatePlay(selectedCards, lead, snapshot.public.effectiveMain, declaration).legal) {
        if (declaration === 'difference') hasDifferenceSelection = true;
        else {
          declarations.push(declaration);
          hasPlayableSelection = true;
        }
      }
    }
  }
  const uniqueDeclarations = Array.from(new Set(declarations));
  const plainPlayIsLegal = Boolean(snapshot.public.effectiveMain && validatePlay(selectedCards, lead, snapshot.public.effectiveMain).legal);
  const canClickBlankToPlay = isMyTurn && selected.length > 0 && plainPlayIsLegal;
  const canDifference = snapshot.public.phase === 'playing'
    && !snapshot.public.burstPendingSeat
    && Boolean(ownPlayer?.activeInHand)
    && hasDifferenceSelection;
  const handSortMain = snapshot.public.effectiveMain
    ?? (snapshot.public.candidateLeader ? snapshot.public.levels[teamOf(snapshot.public.candidateLeader)] : null);

  useEffect(() => {
    if (snapshot.public.phase === 'settled') setShowSettlement(true);
  }, [snapshot.public.phase, snapshot.public.handNumber]);

  const closeSettlement = () => {
    setShowSettlement(false);
    if (!ownPlayer?.ready) onReady?.();
  };

  const handleBoardClick = (event: MouseEvent<HTMLElement>) => {
    if (!canClickBlankToPlay) return;
    const target = event.target;
    if (!(target instanceof Element) || target.closest('button, a, input, select, textarea, .hand-panel, .action-bar, .burst-prompt, .stand-dialog, .settlement-dialog, .player-seat, .public-play, .main-status, .team-scoreboard')) return;
    onCommand('play', { cardIds: selected });
  };

  return (
    <main className="game-view" onClick={handleBoardClick}>
      {testMode ? <div className="test-mode-banner" role="status">单机四人测试模式 · 每个标签页都是独立玩家</div> : null}
      {isSpectator ? <div className="spectator-banner" role="status">观战模式 · 上帝视角 · 不参与出牌</div> : null}
      <button type="button" className="leave-room-button" onClick={onLeave}>退出房间</button>
      <RoomPurposeNotice />
      {snapshot.public.phase === 'opening' && !isSpectator ? <><div className="opening-draw">{snapshot.public.openingMode === 'normal' ? '随机首牌权候选' : '当前立棍首牌权'}：{snapshot.public.candidateLeader ?? '抽取中'}</div><StandDialog mode={snapshot.public.openingMode} ownSeat={snapshot.private.seat} modeTeam={snapshot.public.modeTeam} openingTurn={snapshot.public.openingTurn} onChoose={(choice) => onCommand('opening', choice)} /></> : null}
      <div className="table-layout">
        <MainStatus snapshot={snapshot.public} />
        <div className="team-scoreboard" aria-label="队伍主牌计分">
          <div className="team-main-tag team-main-ac" aria-label={`${teamLabel('AC')}主：${snapshot.public.levels.AC}`}><span>{teamLabel('AC')}主</span><strong>{snapshot.public.levels.AC}</strong></div>
          <div className="team-main-tag team-main-bd" aria-label={`${teamLabel('BD')}主：${snapshot.public.levels.BD}`}><span>{teamLabel('BD')}主</span><strong>{snapshot.public.levels.BD}</strong></div>
        </div>
        <div className="table-center">
          <section className="public-play" aria-label="公开出牌">
            {snapshot.public.publicLastPlay ? <>
              <p>{snapshot.public.publicLastPlay.seat}出牌</p>
              <div className="played-cards" aria-label="公开出牌">
                {snapshot.public.publicLastPlay.cards.map((card) => <span className={`played-card ${cardColorClass(card)}`} key={card.id}>{cardLabel(card)}</span>)}
              </div>
            </> : <p>尚未出牌</p>}
          </section>
        </div>
        {tableSeats.map(({ seat, position }) => <div className={`table-seat seat-${position}`} key={seat}>
          {(() => {
            const player = playersBySeat.get(seat) ?? null;
            const playerIsDiscarded = Boolean(player && snapshot.public.openingMode !== 'normal' && !player.activeInHand && player.finishedRank === null);
            return <PlayerSeat
              seat={seat}
              player={player}
              isCurrentTurn={snapshot.public.currentTurn === seat && !snapshot.public.differenceAvailable}
              showRemainingHand={snapshot.public.phase === 'settled'}
              main={snapshot.public.effectiveMain}
              isDiscarded={playerIsDiscarded}
              canInteract={seat !== snapshot.private.seat}
              onInteract={onInteract}
              interactionEffect={interactionEffect}
            />;
          })()}
          {seat === snapshot.private.seat && snapshot.public.phase === 'playing' ? <div className="seat-actions">
            <ActionBar
              selectedCount={selected.length}
              canPlay={isMyTurn}
              canDifference={canDifference}
              hasPlayableSelection={plainPlayIsLegal || hasPlayableSelection}
              canPass={Boolean(snapshot.public.trick) && isMyTurn}
              declarations={[...uniqueDeclarations, ...(hasDifferenceSelection ? ['difference' as const] : [])]}
              onPlay={(declaration) => onCommand('play', { cardIds: selected, ...(declaration ? { declaration } : {}) })}
              onPass={() => onCommand('pass', {})}
              onBurst={(kind) => onCommand('burst', { kind })}
              burstKinds={[]}
            />
          </div> : null}
        </div>)}
      </div>
      {isSpectator
        ? <SpectatorHands hands={snapshot.private.spectatorHands ?? []} main={handSortMain} />
        : <CardHand cards={ownHand} main={handSortMain} selectedIds={selected} onToggle={onToggle} dimmed={ownHandIsDiscarded} resetKey={snapshot.public.handNumber} />}
      {canClickBlankToPlay ? <p className="play-hint">已选牌合法，点击桌面空白处即可出牌</p> : null}
      {snapshot.public.burstPendingSeat && !burstPendingForMe && !isSpectator ? <p className="burst-waiting">等待{playersBySeat.get(snapshot.public.burstPendingSeat)?.nickname ?? snapshot.public.burstPendingSeat}选择是否报爆</p> : null}
      {!isSpectator ? <BurstPrompt kinds={burstKinds} onChoose={(kind) => onCommand('burst', { kind })} onSkip={() => onCommand('burst', { kind: 'skip' })} /> : null}
      {showSettlement && !isSpectator && snapshot.public.phase === 'settled' && snapshot.public.settlement ? <SettlementDialog
        settlement={snapshot.public.settlement}
        mode={snapshot.public.openingMode}
        modeTeam={snapshot.public.modeTeam}
        onClose={closeSettlement}
      /> : null}
      {snapshot.public.phase === 'settled' && !isSpectator && ownPlayer?.ready ? <p className="ready-waiting">已准备，等待其他玩家</p> : null}
    </main>
  );
}
