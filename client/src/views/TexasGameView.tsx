import { useEffect, useMemo, useState } from 'react';
import { TexasCommandPayload, TexasCommandType, TexasSnapshot } from '../../../shared/src/protocol';
import { TEXAS_SEATS, TexasSeat } from '../../../shared/src/texas';
import { texasCardLabel, TexasCard } from '../../../shared/src/texas';
import { RoomPurposeNotice } from '../components/RoomPurposeNotice';

function cardClass(card: TexasCard): string {
  return card.suit === 'diamonds' || card.suit === 'hearts' ? 'texas-card red' : 'texas-card black';
}

function Card({ card }: { readonly card: TexasCard }) {
  return <span className={cardClass(card)}>{texasCardLabel(card)}</span>;
}

export function TexasGameView({ snapshot, onCommand, onLeave, testMode }: {
  readonly snapshot: TexasSnapshot;
  readonly onCommand: (type: TexasCommandType, payload: TexasCommandPayload) => void;
  readonly onLeave: () => void;
  readonly testMode: boolean;
}) {
  const [amount, setAmount] = useState(40);
  const isSpectator = Boolean(snapshot.private.spectator);
  const ownPlayer = snapshot.public.players.find((player) => player.seat === snapshot.private.seat);
  const isMyTurn = !isSpectator && snapshot.public.currentTurn === snapshot.private.seat;
  const callAmount = Math.max(snapshot.public.currentBet - (ownPlayer?.roundBet ?? 0), 0);
  const minAmount = snapshot.public.currentBet === 0 ? 20 : snapshot.public.currentBet + snapshot.public.minRaise;
  const maxAmount = (ownPlayer?.roundBet ?? 0) + (ownPlayer?.stack ?? 0);
  const sliderMin = Math.min(minAmount, maxAmount);
  const selectedAllIn = maxAmount > 0 && amount >= maxAmount;
  useEffect(() => {
    setAmount(sliderMin);
  }, [sliderMin]);

  const playerBySeat = useMemo(() => new Map(snapshot.public.players.map((player) => [player.seat, player])), [snapshot.public.players]);
  const currentPlayer = snapshot.public.currentTurn ? playerBySeat.get(snapshot.public.currentTurn) : undefined;
  const currentTurnLabel = currentPlayer
    ? `${currentPlayer.nickname} · ${currentPlayer.positionLabel ?? '当前行动位'}`
    : '—';
  const payoutText = Object.entries(snapshot.public.settlement?.payouts ?? {})
    .map(([seat, payout]) => `${playerBySeat.get(seat as TexasSeat)?.positionLabel ?? '玩家'} +${payout}`)
    .join('，');
  const action = (type: TexasCommandType, payload: TexasCommandPayload = {}) => onCommand(type, payload);

  return (
    <main className="texas-game">
      {testMode ? <div className="test-mode-banner" role="status">单机多标签测试模式 · 每个标签页都是独立玩家</div> : null}
      <RoomPurposeNotice />
      {isSpectator ? <div className="spectator-banner" role="status">{snapshot.private.waiting ? '等待本局结束 · 下一局自动入座' : '观战模式 · 上帝视角 · 可查看所有手牌'}</div> : null}
      <header className="texas-header"><div><h1>德州扑克 · 房间 {snapshot.public.roomId}</h1><p>{snapshot.public.phase === 'settled' ? '本局已结算' : snapshot.public.currentTurn ? '轮到 ' + currentTurnLabel : '牌局进行中'}</p></div><button type="button" className="leave-room-button" onClick={onLeave}>退出房间并重选玩法</button></header>
      <section className="texas-table texas-game-table" aria-label="德州扑克牌桌">
        <div className="texas-table-center">
          <div className="texas-table-meta"><span>底池 <strong>{snapshot.public.pot}</strong></span><span>当前下注 <strong>{snapshot.public.currentBet}</strong></span><span>轮到 <strong>{currentTurnLabel}</strong></span></div>
          <div className="texas-community"><span className="texas-section-label">公共牌</span>{snapshot.public.community.length > 0 ? snapshot.public.community.map((card) => <Card card={card} key={card.id} />) : <span className="texas-card-back">等待发牌</span>}</div>
        </div>
        {TEXAS_SEATS.map((seat: TexasSeat) => {
          const player = playerBySeat.get(seat);
          if (!player) return null;
          return <article className={'texas-player texas-seat-position texas-seat-' + seat + (player.seat === snapshot.public.currentTurn ? ' current' : '')} key={seat}>
            <div><strong>{player.positionLabel ?? '等待入座'}</strong><span>{player.nickname}</span></div>
            <small>{player.stack} 筹码 · 已下注 {player.totalBet}{player.waiting ? ' · 等待下一局' : ''}{player.folded ? ' · 已弃牌' : ''}{player.allIn ? ' · All-in' : ''}</small>
          </article>;
        })}
      </section>
      <section className="texas-hand"><h2>{isSpectator ? '玩家手牌（上帝视角）' : '我的手牌'}</h2>{isSpectator || snapshot.public.phase === 'showdown' || snapshot.public.phase === 'settled'
        ? <div className="texas-all-hands">{(snapshot.private.spectatorHands ?? []).map((hand) => <div key={hand.seat}><strong>{hand.positionLabel ?? '玩家'} · {hand.nickname}</strong><div>{hand.hand.map((card) => <Card card={card} key={card.id} />)}</div></div>)}</div>
        : <div className="texas-cards">{snapshot.private.holeCards.map((card) => <Card card={card} key={card.id} />)}</div>}</section>
      {snapshot.public.settlement ? <section className="texas-settlement"><h2>本局结果</h2><p>赢家：{snapshot.public.settlement.winners.map((seat) => playerBySeat.get(seat)?.positionLabel ?? '玩家').join('、')}</p><p>{payoutText}</p>{ownPlayer?.isHost && <button type="button" onClick={() => action('next-hand')}>回到大厅</button>}</section> : null}
      {!isSpectator && snapshot.public.phase !== 'settled' ? <section className="texas-actions" aria-label="下注操作">
        <button type="button" onClick={() => action('fold')} disabled={!isMyTurn}>弃牌</button>
        <button type="button" onClick={() => action('check')} disabled={!isMyTurn || callAmount !== 0}>过牌</button>
        <button type="button" onClick={() => action('call')} disabled={!isMyTurn || callAmount === 0}>跟注 {callAmount}</button>
        <label className="texas-bet-slider"><span>{selectedAllIn ? 'All-in' : snapshot.public.currentBet === 0 ? '下注' : '加注到'}：{amount}</span><input type="range" min={sliderMin} max={maxAmount} step={10} value={Math.min(amount, maxAmount)} onChange={(event) => setAmount(Number(event.target.value))} disabled={!isMyTurn || maxAmount === 0} /></label>
        <button type="button" onClick={() => action(selectedAllIn ? 'all-in' : snapshot.public.currentBet === 0 ? 'bet' : 'raise', selectedAllIn ? {} : { amount })} disabled={!isMyTurn || maxAmount === 0 || (!selectedAllIn && maxAmount < minAmount)}>{selectedAllIn ? 'All-in' : snapshot.public.currentBet === 0 ? '下注 ' + amount : '加注到 ' + amount}</button>
      </section> : null}
    </main>
  );
}
