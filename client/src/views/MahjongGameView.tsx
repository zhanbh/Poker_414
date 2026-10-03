import { useState } from 'react';
import { MahjongCommandPayload, MahjongCommandType, MahjongSnapshot } from '../../../shared/src/protocol';
import { MAHJONG_SEATS, MahjongSeat, MahjongTile } from '../../../shared/src/mahjong';
import { RoomPurposeNotice } from '../components/RoomPurposeNotice';

function tileClass(tile: MahjongTile): string {
  return tile.suit === 'characters' ? 'mahjong-tile wan' : tile.suit === 'bamboo' ? 'mahjong-tile suo' : tile.suit === 'dots' ? 'mahjong-tile tong' : 'mahjong-tile honor';
}

function Tile({ tile, selected = false, listenOption = false, onClick }: { readonly tile: MahjongTile; readonly selected?: boolean; readonly listenOption?: boolean; readonly onClick?: () => void }) {
  return <button type="button" className={tileClass(tile) + (selected ? ' selected' : '') + (listenOption ? ' listen-option' : '')} onClick={onClick} disabled={!onClick} aria-label={tile.label}>{tile.label}</button>;
}

export function MahjongGameView({ snapshot, onCommand, onLeave, testMode }: {
  readonly snapshot: MahjongSnapshot;
  readonly onCommand: (type: MahjongCommandType, payload?: MahjongCommandPayload) => void;
  readonly onLeave: () => void;
  readonly testMode: boolean;
}) {
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
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

  return (
    <main className="mahjong-game">
      {testMode ? <div className="test-mode-banner" role="status">单机四人测试模式 · 每个标签页都是独立玩家</div> : null}
      {isSpectator ? <div className="spectator-banner">观战模式 · 可查看牌桌状态</div> : null}
      <header className="mahjong-header"><div><h1>麻将 · 房间 {snapshot.public.roomId}</h1><p>{snapshot.public.phase === 'settled' ? '本局已结算' : isResponsePhase ? '响应阶段 · 暂无玩家拥有出牌权' : snapshot.public.currentTurn ? `轮到${players.get(snapshot.public.currentTurn)?.nickname ?? snapshot.public.currentTurn}出牌` : '牌局进行中'} · 剩余牌 {snapshot.public.wallCount}</p></div><button type="button" className="leave-room-button" onClick={onLeave}>退出房间</button></header>
      <RoomPurposeNotice />
      <section className="mahjong-table" aria-label="麻将牌桌">
        <div className="mahjong-table-center"><strong>麻将</strong><span>{snapshot.public.lastDiscard ? `上一张：${snapshot.public.lastDiscard.tile.label}` : '等待出牌'}</span>{snapshot.public.pendingDiscard ? <small>等待其他玩家响应</small> : null}</div>
        {MAHJONG_SEATS.map((seat) => {
          const player = players.get(seat);
          if (!player) return <article className={'mahjong-seat mahjong-seat-' + seat} key={seat}><strong>{seat}</strong><span>空位</span></article>;
          const isCurrentTurn = !isResponsePhase && snapshot.public.currentTurn === seat;
          const canRespond = isResponsePhase && seat === ownSeat && responseActions.length > 0;
          return <article className={'mahjong-seat mahjong-seat-' + seat + (isCurrentTurn ? ' current' : '') + (canRespond ? ' responding' : '')} key={seat}><strong>{player.seatLabel}{isCurrentTurn ? ' · 出牌' : canRespond ? ' · 可响应' : ''}</strong><span>{player.nickname}{player.isDealer ? ' · 庄' : ''}{player.isListening ? ' · 听牌' : ''}</span><small>{player.score} 分 · 手牌 {player.handCount} 张 · 弃牌 {player.discards.length} 张</small><div className="mahjong-discard-row">{player.discards.slice(-8).map((tile) => <span className={tileClass(tile)} key={tile.id}>{tile.label}</span>)}</div></article>;
        })}
      </section>
      <section className="mahjong-hand-panel"><h2>{isSpectator ? '牌局信息' : '我的手牌'}</h2>{!isSpectator ? <div className="mahjong-hand">{snapshot.private.hand.map((tile) => <Tile key={tile.id} tile={tile} selected={tile.id === selectedTileId} listenOption={listenTileIds.has(tile.id)} onClick={isMyTurn && !snapshot.private.isListening ? () => setSelectedTileId(tile.id) : undefined} />)}</div> : null}<p className="mahjong-status">{isResponsePhase ? responseActions.length ? '轮到你选择响应；此阶段无人拥有普通出牌权。' : '等待有操作权的玩家响应。' : isMyTurn ? '轮到你出牌；可点击手牌，或选择下方提示的操作。' : '等待牌局推进'}</p></section>
      {!isSpectator && snapshot.public.phase === 'playing' && isResponsePhase && (responseActions.length > 0 || availableActions.includes('pass')) ? <section className="mahjong-actions mahjong-action-prompt" role="status" aria-label="选择响应操作"><strong>{responseActions.length > 0 ? '你可以选择以下操作' : '等待优先玩家响应'}</strong>{responseActions.includes('hu') ? <button type="button" onClick={() => action('hu')}>胡</button> : null}{responseActions.includes('peng') ? <button type="button" onClick={() => action('peng')}>碰</button> : null}{responseActions.includes('chi') ? chiOptions.map((tileIds, index) => {
        const labels = tileIds.slice(0, 2).map((id) => snapshot.private.hand.find((tile) => tile.id === id)?.label ?? '?');
        const discardTile = tileIds.length > 2 ? snapshot.private.hand.find((tile) => tile.id === tileIds[2]) : undefined;
        return <button type="button" key={tileIds.join('-')} onClick={() => action('chi', { tileIds })}>{discardTile ? `吃 ${labels.join('、')}，听并打 ${discardTile.label}` : `吃 ${labels.join('、')}（方案 ${index + 1}）`}</button>;
      }) : null}{responseActions.includes('exposed-kong') ? <button type="button" onClick={() => action('exposed-kong')}>杠</button> : null}{availableActions.includes('pass') ? <button type="button" onClick={() => action('pass')}>过</button> : null}</section> : null}
      {settlement ? <section className="mahjong-settlement" role="dialog" aria-label="本局结算"><h2>本局结束</h2><p>{settlement.type === 'draw' ? '流局' : `${settlement.winnerNickname ?? settlement.winnerSeat ?? ''} 获胜`}</p>{snapshot.public.hostSeat === ownSeat ? <button type="button" onClick={() => action('next-hand')}>开始下一局</button> : <small>等待房主开始下一局</small>}</section> : null}
      {!isSpectator && snapshot.public.phase === 'playing' && isMyTurn ? <section className="mahjong-actions mahjong-action-prompt" aria-label="当前回合操作"><strong>轮到你出牌</strong><button type="button" onClick={discard} disabled={!availableActions.includes('discard') || !selectedTile}>出牌{selectedTile ? ` ${selectedTile.label}` : ''}</button>{availableActions.includes('listen') ? <button type="button" onClick={() => effectiveSelectedTileId && action('listen', { tileId: effectiveSelectedTileId })} disabled={!effectiveSelectedTileId || !listenTileIds.has(effectiveSelectedTileId)}>选择高亮手牌后听牌并出牌</button> : null}{availableActions.includes('hu') ? <button type="button" onClick={() => action('hu')}>自摸胡</button> : null}{availableActions.includes('concealed-kong') ? <button type="button" onClick={() => action('concealed-kong')}>暗杠</button> : null}{availableActions.includes('added-kong') ? <button type="button" onClick={() => selectedTile && action('added-kong', { tileId: selectedTile.id })} disabled={!selectedTile}>选择补杠牌</button> : null}</section> : null}
      {snapshot.private.isListening ? <section className="mahjong-listen-info"><strong>已听牌</strong><span>可胡：{snapshot.private.listenWaits?.map((tile) => tile.label).join('、') || '—'}</span><span>宝：{snapshot.private.baoTile?.label ?? '—'}</span></section> : null}
      {snapshot.private.opponentHands ? <section className="mahjong-opponent-hands"><h2>听牌后查看其他玩家手牌</h2>{snapshot.private.opponentHands.map((opponent) => <div key={opponent.seat}><strong>{opponent.nickname} · {opponent.seat}</strong><div className="mahjong-hand">{opponent.hand.map((tile) => <span className={tileClass(tile)} key={tile.id}>{tile.label}</span>)}</div></div>)}</section> : null}
      {settlement?.payments ? <section className="mahjong-score-changes">{Object.entries(settlement.payments).map(([seat, amount]) => <span key={seat}>{players.get(seat as MahjongSeat)?.nickname ?? seat}：{amount > 0 ? '+' : ''}{amount} 分</span>)}</section> : null}
    </main>
  );
}
