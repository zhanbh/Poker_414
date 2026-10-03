import { useEffect, useState } from 'react';
import { MahjongCommandPayload, MahjongCommandType, MahjongSnapshot } from '../../../shared/src/protocol';
import { MAHJONG_SEATS, MahjongSeat, MahjongTile } from '../../../shared/src/mahjong';
import { RoomPurposeNotice } from '../components/RoomPurposeNotice';

const PIPS: Record<number, Array<[number, number]>> = {
  1: [[15, 18]], 2: [[8, 8], [22, 28]], 3: [[8, 8], [15, 18], [22, 28]],
  4: [[8, 8], [22, 8], [8, 28], [22, 28]], 5: [[8, 8], [22, 8], [15, 18], [8, 28], [22, 28]],
  6: [[8, 7], [22, 7], [8, 18], [22, 18], [8, 29], [22, 29]],
  7: [[8, 5], [22, 5], [8, 16], [22, 16], [8, 27], [22, 27], [15, 35]],
  8: [[8, 5], [22, 5], [8, 15], [22, 15], [8, 25], [22, 25], [8, 35], [22, 35]],
  9: [[8, 5], [15, 5], [22, 5], [8, 18], [15, 18], [22, 18], [8, 31], [15, 31], [22, 31]],
};

function tileClass(tile: MahjongTile): string {
  return tile.suit === 'characters' ? 'wan' : tile.suit === 'bamboo' ? 'suo' : tile.suit === 'dots' ? 'tong' : 'honor';
}

function TileFace({ tile, selected = false, listenOption = false, onClick }: {
  readonly tile: MahjongTile;
  readonly selected?: boolean;
  readonly listenOption?: boolean;
  readonly onClick?: () => void;
}) {
  const numbered = typeof tile.rank === 'number';
  const face = <>
    <span className="mahjong-face-top">{numbered ? tile.rank : ''}</span>
    {numbered && tile.suit === 'dots' ? <svg className="mahjong-dot-art" viewBox="0 0 30 40" aria-hidden="true">{(PIPS[tile.rank] ?? []).map(([x, y], index) => <circle key={index} cx={x} cy={y} r="3.2" />)}</svg> : null}
    {numbered && tile.suit === 'bamboo' ? <svg className="mahjong-bamboo-art" viewBox="0 0 30 40" aria-hidden="true">{Array.from({ length: Math.min(tile.rank, 5) }, (_, index) => <g key={index} transform={`translate(${5 + (index % 3) * 10} ${3 + Math.floor(index / 3) * 13})`}><path d="M5 1v10" /><path d="M5 4 1 2M5 7l4-3" /></g>)}</svg> : null}
    {numbered && tile.suit === 'characters' ? <span className="mahjong-char-art">萬</span> : null}
    {!numbered ? <span className="mahjong-honor-art">{tile.label}</span> : null}
    <span className="mahjong-face-bottom">{numbered ? (tile.suit === 'characters' ? '萬子' : tile.suit === 'bamboo' ? '索子' : '筒子') : tile.suit === 'winds' ? '風牌' : '箭牌'}</span>
  </>;
  const className = `mahjong-face ${tileClass(tile)}${selected ? ' selected' : ''}${listenOption ? ' listen-option' : ''}`;
  return onClick
    ? <button type="button" className={className} onClick={onClick} aria-label={tile.label}>{face}</button>
    : <span className={className} aria-label={tile.label}>{face}</span>;
}

function TileBack() {
  return <span className="mahjong-tile-back" aria-hidden="true"><span /></span>;
}

function MeldTiles({ meld }: { readonly meld: MahjongSnapshot['public']['players'][number]['melds'][number] }) {
  const label = meld.kind === 'chi' ? '吃' : meld.kind === 'peng' ? '碰' : meld.kind === 'concealed-kong' ? '暗杠' : meld.kind === 'added-kong' ? '補杠' : '杠';
  return <div className="mahjong-meld"><small>{label}</small><div>{meld.tiles.map((tile) => <TileFace tile={tile} key={tile.id} />)}</div></div>;
}

export function MahjongGameView({ snapshot, onCommand, onLeave, testMode }: {
  readonly snapshot: MahjongSnapshot;
  readonly onCommand: (type: MahjongCommandType, payload?: MahjongCommandPayload) => void;
  readonly onLeave: () => void;
  readonly testMode: boolean;
}) {
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [animationStage, setAnimationStage] = useState<'dice' | 'deal' | null>(null);
  const ownSeat = snapshot.private.seat;
  const isSpectator = Boolean(snapshot.private.spectator);
  const isResponsePhase = Boolean(snapshot.public.pendingDiscard);
  const isMyTurn = Boolean(ownSeat && snapshot.public.currentTurn === ownSeat && snapshot.public.awaitingDiscard && !isResponsePhase);
  const effectiveSelectedTileId = snapshot.private.isListening ? snapshot.private.discardableTileId ?? null : selectedTileId;
  const selectedTile = snapshot.private.hand.find((tile) => tile.id === effectiveSelectedTileId);
  const availableActions = snapshot.private.availableActions;
  const responseActions = availableActions.filter((candidate) => ['hu', 'peng', 'chi', 'exposed-kong'].includes(candidate));
  const listenTileIds = new Set(snapshot.private.listenTileIds ?? []);
  const action = (type: MahjongCommandType, payload: MahjongCommandPayload = {}) => onCommand(type, payload);
  const discard = () => {
    if (effectiveSelectedTileId) action('discard', { tileId: effectiveSelectedTileId });
    setSelectedTileId(null);
  };
  const chiOptions = snapshot.private.chiOptions ?? [];
  const settlement = snapshot.public.settlement;
  const players = new Map(snapshot.public.players.map((player) => [player.seat, player]));
  const revealedHands = new Map((snapshot.private.opponentHands ?? []).map((opponent) => [opponent.seat, opponent.hand]));
  const wallCount = snapshot.public.wallCount;
  const wallSides = Array.from({ length: 4 }, (_, side) => Array.from({ length: Math.floor(wallCount / 4) + (side < wallCount % 4 ? 1 : 0) }, (_, index) => `${side}-${index}`));

  useEffect(() => {
    if (snapshot.public.phase !== 'playing') {
      const clearTimer = window.setTimeout(() => setAnimationStage(null), 0);
      return () => window.clearTimeout(clearTimer);
    }
    const startTimer = window.setTimeout(() => setAnimationStage('dice'), 0);
    const dealTimer = window.setTimeout(() => setAnimationStage('deal'), 850);
    const finishTimer = window.setTimeout(() => setAnimationStage(null), 1850);
    return () => {
      window.clearTimeout(startTimer);
      window.clearTimeout(dealTimer);
      window.clearTimeout(finishTimer);
    };
  }, [snapshot.public.handNumber, snapshot.public.phase]);

  return (
    <main className="mahjong-game">
      {testMode ? <div className="test-mode-banner" role="status">单机四人测试模式 · 每个标签页都是独立玩家</div> : null}
      {isSpectator ? <div className="spectator-banner">观战模式 · 可查看牌桌状态</div> : null}
      <header className="mahjong-header"><div><h1>麻将对局</h1><p>{snapshot.public.phase === 'settled' ? '本局已结算' : isResponsePhase ? '响应阶段 · 等待可操作玩家' : snapshot.public.currentTurn ? `轮到${players.get(snapshot.public.currentTurn)?.nickname ?? snapshot.public.currentTurn}出牌` : '牌局进行中'} · 牌墙剩余 {wallCount}</p></div><button type="button" className="leave-room-button" onClick={onLeave}>退出房间</button></header>
      <RoomPurposeNotice />
      <section className="mahjong-table" aria-label="方形麻将桌">
        <div className="mahjong-wall mahjong-wall-north" aria-label={`剩余牌墙 ${wallCount} 张`}>{wallSides[0]!.map((id) => <TileBack key={id} />)}</div>
        <div className="mahjong-wall mahjong-wall-east">{wallSides[1]!.map((id) => <TileBack key={id} />)}</div>
        <div className="mahjong-wall mahjong-wall-south">{wallSides[2]!.map((id) => <TileBack key={id} />)}</div>
        <div className="mahjong-wall mahjong-wall-west">{wallSides[3]!.map((id) => <TileBack key={id} />)}</div>
        {MAHJONG_SEATS.map((seat) => {
          const player = players.get(seat);
          if (!player) return <article className={`mahjong-seat mahjong-seat-${seat}`} key={seat}><strong>{seat}</strong><span>空位</span></article>;
          const isCurrentTurn = !isResponsePhase && snapshot.public.currentTurn === seat;
          const canRespond = isResponsePhase && seat === ownSeat && responseActions.length > 0;
          const visibleHand = seat === ownSeat ? null : revealedHands.get(seat);
          return <article className={`mahjong-seat mahjong-seat-${seat}${isCurrentTurn ? ' current' : ''}${canRespond ? ' responding' : ''}`} key={seat}>
            <div className="mahjong-seat-heading"><strong>{player.seatLabel}</strong><span>{player.nickname}{player.isDealer ? ' · 庄' : ''}{player.isListening ? ' · 听' : ''}{isCurrentTurn ? ' · 出牌' : canRespond ? ' · 可响应' : ''}</span><small>{player.score}分 · {player.handCount}张</small></div>
            {player.melds.length ? <div className="mahjong-melds">{player.melds.map((meld, index) => <MeldTiles meld={meld} key={`${seat}-${index}`} />)}</div> : null}
            {visibleHand ? <div className="mahjong-revealed-hand" aria-label={`${player.nickname}的明牌`}>{visibleHand.map((tile) => <TileFace tile={tile} key={tile.id} />)}</div> : seat !== ownSeat && player.handCount > 0 ? <div className="mahjong-hidden-hand" aria-label={`${player.handCount}张背面手牌`}>{Array.from({ length: Math.min(player.handCount, 14) }, (_, index) => <TileBack key={`${seat}-${index}`} />)}</div> : null}
            {player.discards.length ? <div className="mahjong-river" aria-label={`${player.seatLabel}出牌`}>{player.discards.map((tile) => <TileFace tile={tile} key={tile.id} />)}</div> : <small className="mahjong-river-empty">出牌区</small>}
          </article>;
        })}
        <div className="mahjong-table-center"><strong>麻将</strong><span>{snapshot.public.dealerSeat ? `${players.get(snapshot.public.dealerSeat)?.seatLabel ?? '庄家'}坐庄` : '庄家自动掷骰'}</span>{snapshot.public.diceRoll ? <small>🎲 {snapshot.public.diceRoll[0]} · {snapshot.public.diceRoll[1]}</small> : null}{snapshot.public.pendingDiscard ? <small>响应：{snapshot.public.pendingDiscard.tile.label}</small> : null}</div>
        {animationStage ? <div className={`mahjong-deal-overlay ${animationStage}`} role="status"><div className="mahjong-dice-cube">{snapshot.public.diceRoll?.join(' · ') ?? '掷骰'}</div><strong>{animationStage === 'dice' ? '庄家掷骰' : '正在发牌'}</strong>{animationStage === 'deal' ? <div className="dealing-tiles"><TileBack /><TileBack /><TileBack /><TileBack /></div> : null}</div> : null}
      </section>
      <section className="mahjong-hand-panel"><h2>{isSpectator ? '牌局信息' : '我的手牌'}</h2>{!isSpectator ? <div className="mahjong-hand">{snapshot.private.hand.map((tile) => <TileFace key={tile.id} tile={tile} selected={tile.id === selectedTileId} listenOption={listenTileIds.has(tile.id)} onClick={isMyTurn && !snapshot.private.isListening ? () => setSelectedTileId(tile.id) : undefined} />)}</div> : null}<p className="mahjong-status">{snapshot.private.autoDiscardPending ? '听牌自动摸切中…' : isResponsePhase ? responseActions.length ? '请选择响应；吃牌只选组合，完成后再从手牌中选择出牌。' : '等待有响应资格的玩家操作。' : isMyTurn && snapshot.private.isListening ? availableActions.includes('hu') ? '你已听牌，摸到可胡牌；选择胡或过。' : '你已听牌，约1秒后自动摸切。' : isMyTurn ? '轮到你出牌；可点击手牌后出牌或听牌。' : '等待牌局推进'}</p></section>
      {!isSpectator && snapshot.public.phase === 'playing' && isResponsePhase && (responseActions.length > 0 || availableActions.includes('pass')) ? <section className="mahjong-actions mahjong-action-prompt" role="status" aria-label="选择响应操作"><strong>{responseActions.length > 0 ? '选择响应' : '等待优先玩家响应'}</strong>{responseActions.includes('hu') ? <button type="button" onClick={() => action('hu')}>胡</button> : null}{responseActions.includes('peng') ? <button type="button" onClick={() => action('peng')}>碰</button> : null}{responseActions.includes('chi') ? chiOptions.map((tileIds) => {
        const handTiles = tileIds.map((id) => snapshot.private.hand.find((tile) => tile.id === id)).filter((tile): tile is MahjongTile => Boolean(tile));
        const claimedTile = snapshot.public.pendingDiscard!.tile;
        return <button type="button" className="mahjong-chi-choice" key={tileIds.join('-')} onClick={() => action('chi', { tileIds })}><span>吃</span><span className="mahjong-chi-tiles"><TileFace tile={claimedTile} /><TileFace tile={handTiles[0] ?? claimedTile} /><TileFace tile={handTiles[1] ?? claimedTile} /></span></button>;
      }) : null}{responseActions.includes('exposed-kong') ? <button type="button" onClick={() => action('exposed-kong')}>杠</button> : null}{availableActions.includes('pass') ? <button type="button" onClick={() => action('pass')}>过</button> : null}</section> : null}
      {settlement ? <section className="mahjong-settlement" role="dialog" aria-label="本局结算"><h2>本局结束</h2><p>{settlement.type === 'draw' ? '流局 · 原庄家不变，自动掷骰开下一局' : `${settlement.winnerNickname ?? settlement.winnerSeat ?? ''} 获胜`}</p>{settlement.type !== 'draw' && snapshot.public.hostSeat === ownSeat ? <button type="button" onClick={() => action('next-hand')}>开始下一局</button> : settlement.type !== 'draw' ? <small>等待房主开始下一局</small> : null}</section> : null}
      {!isSpectator && snapshot.public.phase === 'playing' && isMyTurn && !snapshot.private.isListening ? <section className="mahjong-actions mahjong-action-prompt" aria-label="当前回合操作"><strong>轮到你出牌</strong><button type="button" onClick={discard} disabled={!availableActions.includes('discard') || !selectedTile}>出牌{selectedTile ? ` ${selectedTile.label}` : ''}</button>{availableActions.includes('listen') ? <button type="button" onClick={() => effectiveSelectedTileId && action('listen', { tileId: effectiveSelectedTileId })} disabled={!effectiveSelectedTileId || !listenTileIds.has(effectiveSelectedTileId)}>听牌并出牌</button> : null}{availableActions.includes('concealed-kong') ? <button type="button" onClick={() => action('concealed-kong')}>暗杠</button> : null}{availableActions.includes('added-kong') ? <button type="button" onClick={() => selectedTile && action('added-kong', { tileId: selectedTile.id })} disabled={!selectedTile}>补杠</button> : null}</section> : null}
      {!isSpectator && snapshot.public.phase === 'playing' && isMyTurn && snapshot.private.isListening && availableActions.includes('hu') ? <section className="mahjong-actions mahjong-action-prompt" aria-label="自摸选择"><strong>摸到可胡牌</strong><button type="button" onClick={() => action('hu')}>胡</button><button type="button" onClick={() => action('pass')}>过，自动出牌</button></section> : null}
      {snapshot.private.isListening ? <section className="mahjong-listen-info"><strong>已听牌</strong><span>结构听口：{snapshot.private.listenWaits?.map((tile) => tile.label).join('、') || '—'}</span><span>另可胡宝：{snapshot.private.baoTile?.label ?? '—'}</span></section> : null}
      {settlement?.payments ? <section className="mahjong-score-changes">{Object.entries(settlement.payments).map(([seat, amount]) => <span key={seat}>{players.get(seat as MahjongSeat)?.nickname ?? seat}：{amount > 0 ? '+' : ''}{amount} 分</span>)}</section> : null}
    </main>
  );
}
