import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { MahjongCommandPayload, MahjongCommandType, MahjongSnapshot } from '../../../shared/src/protocol';
import { MAHJONG_SEATS, MahjongSeat, MahjongTile } from '../../../shared/src/mahjong';
import { RoomPurposeNotice } from '../components/RoomPurposeNotice';

const HONOR_SPRITE_COLUMNS: Record<string, number> = { east: 0, south: 1, west: 2, north: 3, red: 4, green: 5, white: 6 };

function tileClass(tile: MahjongTile): string {
  if (tile.suit === 'characters') return 'wan';
  if (tile.suit === 'bamboo') return 'suo';
  if (tile.suit === 'dots') return 'tong';
  return tile.suit === 'winds' ? 'honor wind' : `honor dragon-${tile.rank}`;
}

function TileFace({ tile, selected = false, listenOption = false, pending = false, drawn = false, onClick, onPointerDown, onPointerMove, onPointerUp }: {
  readonly tile: MahjongTile;
  readonly selected?: boolean;
  readonly listenOption?: boolean;
  readonly pending?: boolean;
  readonly drawn?: boolean;
  readonly onClick?: () => void;
  readonly onPointerDown?: (event: PointerEvent<HTMLButtonElement>) => void;
  readonly onPointerMove?: (event: PointerEvent<HTMLButtonElement>) => void;
  readonly onPointerUp?: (event: PointerEvent<HTMLButtonElement>) => void;
}) {
  const row = tile.suit === 'dots' ? 0 : tile.suit === 'bamboo' ? 1 : tile.suit === 'characters' ? 2 : 3;
  const column = typeof tile.rank === 'number' ? tile.rank - 1 : HONOR_SPRITE_COLUMNS[tile.rank];
  const face = <span className="mahjong-face-art" aria-hidden="true"><img src="/assets/mahjong-tiles.png" alt="" draggable={false} style={{ left: `${-column * 100}%`, top: `${-row * 100}%` }} /></span>;
  const className = `mahjong-face ${tileClass(tile)}${selected ? ' selected' : ''}${listenOption ? ' listen-option' : ''}${pending ? ' pending-discard' : ''}${drawn ? ' drawn' : ''}`;
  return onClick
    ? <button type="button" className={className} onClick={onClick} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} aria-label={tile.label}>{face}</button>
    : <span className={className} aria-label={tile.label}>{face}</span>;
}

function TileBack({ replacement = false }: { readonly replacement?: boolean }) {
  return <span className={`mahjong-tile-back${replacement ? ' replacement' : ''}`} aria-hidden="true"><span /></span>;
}

function TileEdge() {
  return <span className="mahjong-tile-edge" aria-hidden="true" />;
}

type SeatPosition = 'bottom' | 'left' | 'top' | 'right';

function seatPosition(viewer: MahjongSeat, seat: MahjongSeat): SeatPosition {
  const offset = (MAHJONG_SEATS.indexOf(seat) - MAHJONG_SEATS.indexOf(viewer) + MAHJONG_SEATS.length) % MAHJONG_SEATS.length;
  return (['bottom', 'left', 'top', 'right'] as const)[offset]!;
}

function MeldTiles({ meld }: { readonly meld: MahjongSnapshot['public']['players'][number]['melds'][number] }) {
  const label = meld.kind === 'chi' ? '吃' : meld.kind === 'peng' ? '碰' : meld.kind === 'concealed-kong' ? '暗杠' : meld.kind === 'added-kong' ? '補杠' : '杠';
  const hidden = meld.kind === 'concealed-kong' && meld.tiles.length === 0;
  return <div className="mahjong-meld"><small>{label}</small><div>{hidden
    ? Array.from({ length: 4 }, (_, index) => <TileBack key={index} />)
    : meld.tiles.map((tile) => <TileFace tile={tile} key={tile.id} />)}</div></div>;
}

export function MahjongGameView({ snapshot, onCommand, onLeave, testMode }: {
  readonly snapshot: MahjongSnapshot;
  readonly onCommand: (type: MahjongCommandType, payload?: MahjongCommandPayload) => void;
  readonly onLeave: () => void;
  readonly testMode: boolean;
}) {
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [animationStage, setAnimationStage] = useState<'dice' | 'deal' | null>(null);
  const [chiPickerOpen, setChiPickerOpen] = useState(false);
  const [draggingTileId, setDraggingTileId] = useState<string | null>(null);
  const tableRef = useRef<HTMLElementTagNameMap['section'] | null>(null);
  const pointerStartRef = useRef<{ tileId: string; x: number; y: number; moved: boolean } | null>(null);
  const suppressTileClickRef = useRef(false);
  const lastTileTapRef = useRef<{ tileId: string; at: number } | null>(null);
  const ownSeat = snapshot.private.seat;
  const isSpectator = Boolean(snapshot.private.spectator);
  const isResponsePhase = Boolean(snapshot.public.pendingDiscard);
  const isMyTurn = Boolean(ownSeat && snapshot.public.currentTurn === ownSeat && snapshot.public.awaitingDiscard && !isResponsePhase);
  const effectiveSelectedTileId = snapshot.private.isListening ? snapshot.private.discardableTileId ?? null : selectedTileId;
  const selectedTile = snapshot.private.hand.find((tile) => tile.id === effectiveSelectedTileId);
  const availableActions = snapshot.private.availableActions;
  const responseActions = availableActions.filter((candidate) => ['hu', 'peng', 'chi', 'exposed-kong'].includes(candidate));
  const listenTileIds = new Set(snapshot.private.listenTileIds ?? []);
  const listenPreview = snapshot.private.isListening
    ? { waits: snapshot.private.listenWaits ?? [] }
    : snapshot.private.listenOptions?.find((option) => option.discardTileId === effectiveSelectedTileId);
  const drawnTileId = snapshot.private.drawnTileId;
  const ownHand = snapshot.private.hand.filter((tile) => tile.id !== drawnTileId);
  const drawnTile = snapshot.private.hand.find((tile) => tile.id === drawnTileId);
  const displayHand = drawnTile ? [...ownHand, drawnTile] : snapshot.private.hand;
  const action = (type: MahjongCommandType, payload: MahjongCommandPayload = {}) => onCommand(type, payload);
  const respond = (type: MahjongCommandType, payload: MahjongCommandPayload = {}) => {
    setChiPickerOpen(false);
    action(type, payload);
  };
  const discardTile = (tileId: string) => {
    if (!isMyTurn || snapshot.private.isListening || !availableActions.includes('discard')) return;
    lastTileTapRef.current = null;
    action('discard', { tileId });
    setSelectedTileId(null);
  };
  const handleTileClick = (tileId: string) => {
    if (suppressTileClickRef.current) { suppressTileClickRef.current = false; return; }
    const now = Date.now();
    if (lastTileTapRef.current?.tileId === tileId && now - lastTileTapRef.current.at <= 300 && availableActions.includes('discard')) {
      discardTile(tileId);
      return;
    }
    lastTileTapRef.current = { tileId, at: now };
    setSelectedTileId(tileId);
  };
  const handleTableClick = (event: MouseEvent<HTMLElement>) => {
    if (!selectedTileId) return;
    const target = event.target;
    if (target instanceof Element && target.closest('button, .mahjong-player-card, .mahjong-seat-melds, .mahjong-revealed-hand, .mahjong-action-dock, .mahjong-table-settlement, .mahjong-tile-back, .mahjong-discard-tiles .mahjong-face')) return;
    discardTile(selectedTileId);
  };
  const handleTilePointerDown = (tileId: string, event: PointerEvent<HTMLButtonElement>) => {
    if (!isMyTurn || snapshot.private.isListening) return;
    pointerStartRef.current = { tileId, x: event.clientX, y: event.clientY, moved: false };
    if (event.currentTarget.setPointerCapture) event.currentTarget.setPointerCapture(event.pointerId);
  };
  const handleTilePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const start = pointerStartRef.current;
    if (!start) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 12) {
      start.moved = true;
      setDraggingTileId(start.tileId);
    }
  };
  const handleTilePointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    setDraggingTileId(null);
    if (!start?.moved) return;
    const bounds = tableRef.current?.getBoundingClientRect();
    if (bounds && event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom) {
      suppressTileClickRef.current = true;
      discardTile(start.tileId);
    }
  };
  const chiOptions = snapshot.private.chiOptions ?? [];
  const settlement = snapshot.public.settlement;
  const settlementDescription = settlement?.type === 'draw'
    ? '流局 · 原庄家不变'
    : settlement
      ? `${settlement.winnerNickname ?? settlement.winnerSeat ?? ''} 获胜 · ${settlement.winPattern === 'big-wind' ? '大风' : settlement.winPattern === 'bao' ? '胡宝' : settlement.type === 'self-draw' ? '自摸' : '点炮'}`
      : '';
  const players = new Map(snapshot.public.players.map((player) => [player.seat, player]));
  const revealedHands = new Map([
    ...(snapshot.private.opponentHands ?? []),
    ...(snapshot.public.revealedHands ?? []),
  ].map((opponent) => [opponent.seat, opponent.hand]));
  const wallCount = snapshot.public.wallCount;
  const viewerSeat = ownSeat ?? 'A';
  const wallSides = snapshot.public.wallLayout.sides.map((side) => {
    const tiles = [
      ...Array.from({ length: side.liveTiles }, (_, index) => ({ id: `${side.seat}-live-${index}`, replacement: false })),
      ...Array.from({ length: side.replacementTiles }, (_, index) => ({ id: `${side.seat}-replacement-${index}`, replacement: true })),
    ];
    return {
      seat: side.seat,
      position: seatPosition(viewerSeat, side.seat),
      stacks: Array.from({ length: Math.ceil(tiles.length / 2) }, (_, index) => ({ id: `${side.seat}-stack-${index}`, tiles: tiles.slice(index * 2, index * 2 + 2) })),
    };
  });
  const showResponseDock = !isSpectator && snapshot.public.phase === 'playing' && isResponsePhase && (responseActions.length > 0 || availableActions.includes('pass'));
  const showTurnDock = !isSpectator && snapshot.public.phase === 'playing' && isMyTurn && !snapshot.private.isListening
    && (availableActions.includes('listen') || availableActions.includes('concealed-kong') || availableActions.includes('added-kong'));
  const showSelfDrawDock = !isSpectator && snapshot.public.phase === 'playing' && isMyTurn && snapshot.private.isListening && availableActions.includes('hu');
  const actionDock = showResponseDock || showTurnDock || showSelfDrawDock ? <div className="mahjong-action-dock" aria-label="可选操作">
    {showResponseDock ? <>
      {responseActions.includes('hu') ? <button type="button" className="mahjong-action-circle" aria-label="胡" onClick={() => respond('hu')}>胡</button> : null}
      {responseActions.includes('peng') ? <button type="button" className="mahjong-action-circle" aria-label="碰" onClick={() => respond('peng')}>碰</button> : null}
      {responseActions.includes('chi') ? <button type="button" className="mahjong-action-circle" aria-label="吃" onClick={() => chiOptions.length === 1 ? respond('chi', { tileIds: chiOptions[0] }) : setChiPickerOpen((open) => !open)}>吃</button> : null}
      {responseActions.includes('exposed-kong') ? <button type="button" className="mahjong-action-circle" aria-label="杠" onClick={() => respond('exposed-kong')}>杠</button> : null}
      {availableActions.includes('pass') ? <button type="button" className="mahjong-action-circle secondary" aria-label="过" onClick={() => respond('pass')}>过</button> : null}
      {chiPickerOpen && chiOptions.length > 1 && snapshot.public.pendingDiscard ? <div className="mahjong-chi-picker" aria-label="选择吃牌组合">{chiOptions.map((tileIds) => {
        const claimedTile = snapshot.public.pendingDiscard!.tile;
        const handTiles = tileIds.map((id) => snapshot.private.hand.find((tile) => tile.id === id)).filter((tile): tile is MahjongTile => Boolean(tile));
        return <button type="button" className="mahjong-chi-choice" key={tileIds.join('-')} aria-label={`吃 ${handTiles.map((tile) => tile.label).join('、')}`} onClick={() => respond('chi', { tileIds })}><TileFace tile={claimedTile} /><TileFace tile={handTiles[0] ?? claimedTile} /><TileFace tile={handTiles[1] ?? claimedTile} /></button>;
      })}</div> : null}
    </> : null}
    {showTurnDock ? <>
      {availableActions.includes('listen') ? <button type="button" className="mahjong-action-circle" aria-label="听" disabled={!effectiveSelectedTileId || !listenTileIds.has(effectiveSelectedTileId)} onClick={() => effectiveSelectedTileId && action('listen', { tileId: effectiveSelectedTileId })}>听</button> : null}
      {availableActions.includes('concealed-kong') ? <button type="button" className="mahjong-action-circle" aria-label="暗杠" onClick={() => action('concealed-kong')}>暗杠</button> : null}
      {availableActions.includes('added-kong') ? <button type="button" className="mahjong-action-circle" aria-label="补杠" disabled={!selectedTile} onClick={() => selectedTile && action('added-kong', { tileId: selectedTile.id })}>补杠</button> : null}
    </> : null}
    {showSelfDrawDock ? <><button type="button" className="mahjong-action-circle" aria-label="胡" onClick={() => respond('hu')}>胡</button><button type="button" className="mahjong-action-circle secondary" aria-label="过" onClick={() => respond('pass')}>过</button></> : null}
  </div> : null;

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
      <section ref={tableRef} onClick={handleTableClick} className={`mahjong-table${settlement ? ' is-settled' : ''}${selectedTileId ? ' has-selected-tile' : ''}`} aria-label="方形麻将桌">
        {wallSides.map(({ seat, position, stacks }) => <div className={`mahjong-wall mahjong-wall-${position}`} aria-label={`${players.get(seat)?.nickname ?? '玩家'}面前剩余牌墙`} key={seat}>
          {stacks.map((stack) => <span className={`mahjong-wall-stack${stack.tiles.length === 2 ? ' double' : ''}`} key={stack.id}><TileBack replacement={stack.tiles.some((tile) => tile.replacement)} /></span>)}
        </div>)}
        {MAHJONG_SEATS.map((seat) => {
          const position = seatPosition(viewerSeat, seat);
          const player = players.get(seat);
          if (!player) return <article className={`mahjong-seat mahjong-seat-${position}`} key={seat}><div className="mahjong-player-card"><div className="mahjong-player-meta"><strong>空位</strong></div></div></article>;
          const isCurrentTurn = !isResponsePhase && snapshot.public.currentTurn === seat;
          const canRespond = isResponsePhase && seat === ownSeat && responseActions.length > 0;
          const visibleHand = seat === ownSeat ? null : revealedHands.get(seat);
          const isOwnSeat = seat === ownSeat && !isSpectator;
          return <article className={`mahjong-seat mahjong-seat-${position}${isCurrentTurn ? ' current' : ''}${canRespond ? ' responding' : ''}${isOwnSeat ? ' own' : ''}`} key={seat} aria-label={player.nickname}>
            <div className="mahjong-player-card">
              <span className="mahjong-player-avatar">{player.nickname.slice(0, 1)}</span>
              <div className="mahjong-player-meta"><strong>{player.nickname}</strong><span>{player.score} 分</span></div>
              {player.isDealer ? <span className="mahjong-player-badge dealer" aria-label="庄家">庄</span> : null}
              {player.isListening ? <span className="mahjong-player-badge listening" aria-label="听牌标识">听</span> : null}
            </div>
            {player.melds.length ? <div className="mahjong-seat-melds">{player.melds.map((meld, index) => <MeldTiles meld={meld} key={`${seat}-${index}`} />)}</div> : null}
            {!isOwnSeat && visibleHand ? <div className="mahjong-revealed-hand" aria-label={`${player.nickname}的明牌`}>{visibleHand.map((tile) => <TileFace tile={tile} key={tile.id} />)}</div> : null}
            {!isOwnSeat && !visibleHand && player.handCount > 0 ? <div className="mahjong-concealed-hand" aria-label={`${player.nickname}的未公开手牌`}>{Array.from({ length: player.handCount }, (_, index) => <TileEdge key={`${seat}-hand-${index}`} />)}</div> : null}
            {isOwnSeat ? <>
              <div className="mahjong-own-hand" aria-label="我的手牌">{displayHand.map((tile) => <TileFace key={tile.id} tile={tile} drawn={tile.id === drawnTileId} selected={tile.id === selectedTileId} listenOption={listenTileIds.has(tile.id)} pending={tile.id === draggingTileId} onClick={isMyTurn && !snapshot.private.isListening ? () => handleTileClick(tile.id) : undefined} onPointerDown={isMyTurn && !snapshot.private.isListening ? (event) => handleTilePointerDown(tile.id, event) : undefined} onPointerMove={isMyTurn && !snapshot.private.isListening ? handleTilePointerMove : undefined} onPointerUp={isMyTurn && !snapshot.private.isListening ? handleTilePointerUp : undefined} />)}</div>
              {listenPreview ? <div className="mahjong-listen-preview" role="status"><strong>{snapshot.private.isListening ? '已听牌' : '打出此牌可听'}</strong><span>胡：</span>{listenPreview.waits.map((tile) => <TileFace key={tile.id} tile={tile} />)}{snapshot.private.isListening && snapshot.private.baoTile ? <span className="mahjong-bao-preview"><b>宝</b><TileFace tile={snapshot.private.baoTile} /></span> : null}</div> : null}
            </> : null}
          </article>;
        })}
        <div className="mahjong-discard-pile" aria-label="公共弃牌区">
          <div className="mahjong-discard-tiles">{snapshot.public.discardRiver.map(({ tile }) => <TileFace tile={tile} key={tile.id} pending={snapshot.public.pendingDiscard?.tile.id === tile.id} />)}</div>
        </div>
        {actionDock}
        {settlement ? <section className="mahjong-settlement mahjong-table-settlement" role="status" aria-label="本局结算">
          <h2>本局结束</h2>
          <p>{settlementDescription}</p>
          {settlement.payments ? <div className="mahjong-score-changes">{Object.entries(settlement.payments).map(([seat, amount]) => <span key={seat}>{players.get(seat as MahjongSeat)?.nickname ?? seat}：{amount > 0 ? '+' : ''}{amount} 分</span>)}</div> : null}
          {settlement.type !== 'draw' && snapshot.public.hostSeat === ownSeat ? <button type="button" onClick={() => action('next-hand')}>开始下一局</button> : settlement.type !== 'draw' ? <small>等待房主开始下一局</small> : <small>即将开始下一局</small>}
        </section> : null}
        {animationStage ? <div className={`mahjong-deal-overlay ${animationStage}`} role="status"><div className="mahjong-dice-cube">{snapshot.public.diceRoll?.join(' · ') ?? '掷骰'}</div><strong>{animationStage === 'dice' ? '庄家掷骰' : '正在发牌'}</strong>{animationStage === 'deal' ? <div className="dealing-tiles"><TileBack /><TileBack /><TileBack /><TileBack /></div> : null}</div> : null}
      </section>
      {snapshot.private.autoDiscardPending ? <p className="mahjong-status">听牌自动摸切中…</p> : null}
      {!isSpectator && isMyTurn && snapshot.private.isListening && !availableActions.includes('hu') ? <p className="mahjong-status">你已听牌，约1秒后自动摸切。</p> : null}
    </main>
  );
}
