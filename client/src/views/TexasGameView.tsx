import { useEffect, useMemo, useRef, useState } from 'react';
import { TexasCommandPayload, TexasCommandType, TexasSnapshot } from '../../../shared/src/protocol';
import { formatTexasChips, TEXAS_BET_STEP, TEXAS_BIG_BLIND, TEXAS_HAND_CATEGORY_LABELS, TEXAS_SEATS, TEXAS_STARTING_STACK, TEXAS_SMALL_BLIND, TexasSeat, texasCardLabel, TexasCard } from '../../../shared/src/texas';
import { RoomPurposeNotice } from '../components/RoomPurposeNotice';

function cardClass(card: TexasCard): string {
  return card.suit === 'diamonds' || card.suit === 'hearts' ? 'texas-card red' : 'texas-card black';
}

function Card({ card }: { readonly card: TexasCard }) {
  return <span className={cardClass(card)}>{texasCardLabel(card)}</span>;
}

function handLabel(category: string | undefined): string {
  return category ? TEXAS_HAND_CATEGORY_LABELS[category as keyof typeof TEXAS_HAND_CATEGORY_LABELS] ?? category : '未知牌型';
}

const CHIP_COLORS = ['red', 'blue', 'green', 'black', 'purple'] as const;
const CHIP_ORIGINS: Readonly<Record<TexasSeat, { readonly left: string; readonly top: string }>> = {
  A: { left: '50%', top: '7%' },
  B: { left: '84%', top: '17%' },
  C: { left: '96%', top: '50%' },
  D: { left: '84%', top: '83%' },
  E: { left: '50%', top: '96%' },
  F: { left: '16%', top: '83%' },
  G: { left: '4%', top: '50%' },
  H: { left: '16%', top: '17%' },
};

function chipCount(amount: number): number {
  return amount > 0 ? Math.min(12, Math.max(1, Math.ceil(amount / 100_000))) : 0;
}

function ChipStack({ amount }: { readonly amount: number }) {
  return <div className="texas-chip-stack" aria-label={`${formatTexasChips(amount)} 筹码`} title={`${amount} 筹码`}>
    {Array.from({ length: chipCount(amount) }, (_, index) => <span
      className={'texas-chip texas-chip-' + CHIP_COLORS[index % CHIP_COLORS.length]}
      key={index}
      style={{ bottom: `${index * 2}px`, zIndex: index }}
      aria-hidden="true"
    />)}
  </div>;
}

interface ChipFlight {
  readonly id: string;
  readonly seat: TexasSeat;
  readonly amount: number;
}

function ChipFlightView({ flight, onEnd }: { readonly flight: ChipFlight; readonly onEnd: (id: string) => void }) {
  const origin = CHIP_ORIGINS[flight.seat];
  return <div className="texas-chip-flight" style={{ left: origin.left, top: origin.top }} onAnimationEnd={() => onEnd(flight.id)} aria-label={`投入 ${formatTexasChips(flight.amount)} 筹码`}>
    <span className="texas-chip texas-chip-gold" aria-hidden="true" />
    <b>+{formatTexasChips(flight.amount)}</b>
  </div>;
}

function phaseNotice(phase: TexasSnapshot['public']['phase']): string {
  switch (phase) {
    case 'preflop': return '翻牌前 · 等待玩家行动';
    case 'flop': return '翻牌 · 已发出 3 张公共牌';
    case 'turn': return '转牌 · 第 4 张公共牌';
    case 'river': return '河牌 · 第 5 张公共牌';
    case 'showdown': return '摊牌 · 正在比较牌型';
    case 'settled': return '结算完成 · 可查看本局结果';
    default: return '等待开局';
  }
}

export function TexasGameView({ snapshot, onCommand, onLeave, testMode }: {
  readonly snapshot: TexasSnapshot;
  readonly onCommand: (type: TexasCommandType, payload: TexasCommandPayload) => void;
  readonly onLeave: () => void;
  readonly testMode: boolean;
}) {
  const [amount, setAmount] = useState(TEXAS_BIG_BLIND);
  const [settlementClosedHand, setSettlementClosedHand] = useState<number | null>(null);
  const [chipFlights, setChipFlights] = useState<ChipFlight[]>([]);
  const previousBets = useRef<Map<TexasSeat, number> | null>(null);
  const isSpectator = Boolean(snapshot.private.spectator);
  const ownPlayer = snapshot.public.players.find((player) => player.seat === snapshot.private.seat);
  const isMyTurn = !isSpectator && snapshot.public.currentTurn === snapshot.private.seat;
  const callAmount = Math.max(snapshot.public.currentBet - (ownPlayer?.roundBet ?? 0), 0);
  const minAmount = snapshot.public.currentBet === 0 ? TEXAS_BIG_BLIND : snapshot.public.currentBet + snapshot.public.minRaise;
  const maxAmount = (ownPlayer?.roundBet ?? 0) + (ownPlayer?.stack ?? 0);
  const sliderMin = Math.min(minAmount, maxAmount);
  const selectedAllIn = maxAmount > 0 && amount >= maxAmount;

  useEffect(() => {
    setAmount(sliderMin);
  }, [sliderMin]);

  useEffect(() => {
    const currentBets = new Map(snapshot.public.players.map((player) => [player.seat, player.totalBet] as const));
    const previous = previousBets.current;
    if (previous) {
      const newFlights = snapshot.public.players.flatMap((player) => {
        const increase = player.totalBet - (previous.get(player.seat) ?? 0);
        return increase > 0 ? [{ id: `${snapshot.public.handNumber}-${snapshot.public.version}-${player.seat}`, seat: player.seat, amount: increase }] : [];
      });
      if (newFlights.length > 0) setChipFlights((flights) => [...flights, ...newFlights].slice(-12));
    }
    previousBets.current = currentBets;
  }, [snapshot.public.handNumber, snapshot.public.players, snapshot.public.version]);

  const latestChipFlightId = chipFlights[chipFlights.length - 1]?.id;
  useEffect(() => {
    if (!latestChipFlightId) return undefined;
    const timer = window.setTimeout(() => setChipFlights([]), 900);
    return () => window.clearTimeout(timer);
  }, [latestChipFlightId]);

  const playerBySeat = useMemo(() => new Map(snapshot.public.players.map((player) => [player.seat, player])), [snapshot.public.players]);
  const currentPlayer = snapshot.public.currentTurn ? playerBySeat.get(snapshot.public.currentTurn) : undefined;
  const currentTurnLabel = currentPlayer
    ? `${currentPlayer.nickname} · ${currentPlayer.positionLabel ?? '当前行动位'}`
    : '—';
  const settlement = snapshot.public.settlement;
  const settlementVisible = Boolean(settlement && settlementClosedHand !== snapshot.public.handNumber);
  const winnerDetails = settlement?.winners.map((seat) => ({
    seat,
    nickname: playerBySeat.get(seat)?.nickname ?? seat,
    positionLabel: playerBySeat.get(seat)?.positionLabel ?? seat,
    category: handLabel(settlement.hands[seat]),
    payout: settlement.payouts[seat] ?? 0,
  })) ?? [];
  const action = (type: TexasCommandType, payload: TexasCommandPayload = {}) => onCommand(type, payload);
  const closeSettlement = () => setSettlementClosedHand(snapshot.public.handNumber);

  return (
    <main className="texas-game">
      {testMode ? <div className="test-mode-banner" role="status">单机多标签测试模式 · 每个标签页都是独立玩家</div> : null}
      {isSpectator ? <div className="spectator-banner" role="status">{snapshot.private.waiting ? '等待本局结束 · 下一局自动入座' : '观战模式 · 上帝视角 · 可查看所有手牌'}</div> : null}
      <header className="texas-header"><div><h1>德州扑克 · 房间 {snapshot.public.roomId}</h1><p>{snapshot.public.phase === 'settled' ? '本局已结算' : snapshot.public.currentTurn ? '轮到 ' + currentTurnLabel : '牌局进行中'} · 初始筹码 {formatTexasChips(TEXAS_STARTING_STACK)} · 盲注 {formatTexasChips(TEXAS_SMALL_BLIND)}/{formatTexasChips(TEXAS_BIG_BLIND)}</p></div><button type="button" className="leave-room-button" onClick={onLeave}>退出房间并重选玩法</button></header>
      <RoomPurposeNotice />
      <section className="texas-table texas-game-table" aria-label="德州扑克牌桌">
        <div className="texas-table-center">
          <div className="texas-table-meta"><span>底池 <strong>{formatTexasChips(snapshot.public.pot)}</strong></span><span>当前下注 <strong>{formatTexasChips(snapshot.public.currentBet)}</strong></span><span>轮到 <strong>{currentTurnLabel}</strong></span></div>
          <div className="texas-phase-notice" key={snapshot.public.phase + '-' + snapshot.public.community.length} role="status">{phaseNotice(snapshot.public.phase)}</div>
          <div className="texas-community"><span className="texas-section-label">公共牌</span>{snapshot.public.community.length > 0 ? snapshot.public.community.map((card) => <Card card={card} key={card.id} />) : <span className="texas-card-back">等待发牌</span>}</div>
        </div>
        {chipFlights.map((flight) => <ChipFlightView key={flight.id} flight={flight} onEnd={(id) => setChipFlights((flights) => flights.filter((item) => item.id !== id))} />)}
        {TEXAS_SEATS.map((seat: TexasSeat) => {
          const player = playerBySeat.get(seat);
          if (!player) return null;
          return <article className={'texas-player texas-seat-position texas-seat-' + seat + (player.seat === snapshot.public.currentTurn ? ' current' : '') + (player.seat === snapshot.private.seat ? ' own' : '')} key={seat}>
            <div><strong>{player.positionLabel ?? '等待入座'}</strong><span>{player.nickname}</span></div>
            <div className="texas-player-chip-area"><ChipStack amount={player.stack} /><small>{formatTexasChips(player.stack)} 筹码 · 已下注 {formatTexasChips(player.totalBet)}{player.waiting ? ' · 等待下一局' : ''}{player.folded ? ' · 已弃牌' : ''}{player.allIn ? ' · All-in' : ''}</small></div>
          </article>;
        })}
      </section>
      <section className="texas-hand"><h2>{isSpectator ? '玩家手牌（上帝视角）' : '我的手牌'}</h2>{!isSpectator && snapshot.private.bestHand ? <p className="texas-best-hand">当前最佳牌型：<strong>{snapshot.private.bestHand.label}</strong></p> : !isSpectator && snapshot.public.community.length < 3 ? <p className="texas-best-hand muted">翻牌后显示当前最佳牌型</p> : null}{isSpectator || snapshot.public.phase === 'showdown' || snapshot.public.phase === 'settled'
        ? <div className="texas-all-hands">{(snapshot.private.spectatorHands ?? []).map((hand) => <div key={hand.seat}><strong>{hand.positionLabel ?? hand.seat} · {hand.nickname}</strong><p className="texas-best-hand">{hand.bestHand ? '当前最佳：' + hand.bestHand.label : '等待公共牌'}</p><div>{hand.hand.map((card) => <Card card={card} key={card.id} />)}</div></div>)}</div>
        : <div className="texas-cards">{snapshot.private.holeCards.map((card) => <Card card={card} key={card.id} />)}</div>}</section>
      {settlement && settlementVisible ? <div className="texas-settlement-backdrop" role="presentation"><section className="texas-settlement-modal" role="dialog" aria-modal="true" aria-label="本局结算"><button type="button" className="texas-settlement-close" aria-label="关闭结算" onClick={closeSettlement}>×</button><p className="texas-settlement-kicker">第 {snapshot.public.handNumber} 局结束</p><h2>赢家：{winnerDetails.map((winner) => winner.nickname).join('、')}</h2><div className="texas-settlement-winners">{winnerDetails.map((winner) => <div className="texas-settlement-winner" key={winner.seat}><strong>{winner.positionLabel} · {winner.nickname}</strong><span>以 <b>{winner.category}</b> 获胜 · +{formatTexasChips(winner.payout)} 筹码</span></div>)}</div><button type="button" className="texas-settlement-continue" onClick={closeSettlement}>继续查看牌桌</button>{ownPlayer?.isHost ? <button type="button" className="texas-settlement-next" onClick={() => action('next-hand')}>回到大厅并开始下一局</button> : null}</section></div> : null}
      {settlement && !settlementVisible ? <button type="button" className="texas-settlement-summary" onClick={() => setSettlementClosedHand(null)}>查看本局结算：{winnerDetails.map((winner) => winner.nickname).join('、')}</button> : null}
      {!isSpectator && snapshot.public.phase !== 'settled' ? <section className="texas-actions" aria-label="下注操作">
        <button type="button" onClick={() => action('fold')} disabled={!isMyTurn}>弃牌</button>
        <button type="button" onClick={() => action('check')} disabled={!isMyTurn || callAmount !== 0}>过牌</button>
        <button type="button" onClick={() => action('call')} disabled={!isMyTurn || callAmount === 0}>跟注 {formatTexasChips(callAmount)}</button>
        <label className="texas-bet-slider"><span>{selectedAllIn ? 'All-in' : snapshot.public.currentBet === 0 ? '下注' : '加注到'}：{formatTexasChips(amount)}</span><input type="range" min={sliderMin} max={maxAmount} step={TEXAS_BET_STEP} value={Math.min(amount, maxAmount)} onChange={(event) => setAmount(Number(event.target.value))} disabled={!isMyTurn || maxAmount === 0} /></label>
        <button type="button" onClick={() => action(selectedAllIn ? 'all-in' : snapshot.public.currentBet === 0 ? 'bet' : 'raise', selectedAllIn ? {} : { amount })} disabled={!isMyTurn || maxAmount === 0 || (!selectedAllIn && maxAmount < minAmount)}>{selectedAllIn ? 'All-in' : snapshot.public.currentBet === 0 ? '下注 ' + formatTexasChips(amount) : '加注到 ' + formatTexasChips(amount)}</button>
      </section> : null}
    </main>
  );
}
