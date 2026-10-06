import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { MahjongCommandPayload, MahjongCommandType, MahjongSnapshot } from '../../../shared/src/protocol';
import { MAHJONG_SEATS, MahjongSeat, MahjongTile } from '../../../shared/src/mahjong';
import { RoomPurposeNotice } from '../components/RoomPurposeNotice';

const HONOR_SPRITE_COLUMNS: Record<'red', number> = { red: 4 };

function tileClass(tile: MahjongTile): string {
  if (tile.suit === 'characters') return 'wan';
  if (tile.suit === 'bamboo') return 'suo';
  if (tile.suit === 'dots') return 'tong';
  return `honor dragon-${tile.rank}`;
}

function TileFace({ tile, selected = false, listenOption = false, pending = false, drawn = false, onClick, onPointerDown, onPointerMove, onPointerUp, onPointerCancel }: {
  readonly tile: MahjongTile;
  readonly selected?: boolean;
  readonly listenOption?: boolean;
  readonly pending?: boolean;
  readonly drawn?: boolean;
  readonly onClick?: () => void;
  readonly onPointerDown?: (event: PointerEvent<HTMLButtonElement>) => void;
  readonly onPointerMove?: (event: PointerEvent<HTMLButtonElement>) => void;
  readonly onPointerUp?: (event: PointerEvent<HTMLButtonElement>) => void;
  readonly onPointerCancel?: () => void;
}) {
  const row = tile.suit === 'dots' ? 0 : tile.suit === 'bamboo' ? 1 : tile.suit === 'characters' ? 2 : 3;
  const column = typeof tile.rank === 'number' ? tile.rank - 1 : HONOR_SPRITE_COLUMNS[tile.rank];
  const face = <span className="mahjong-face-art" aria-hidden="true"><img src="/assets/mahjong-tiles.png" alt="" draggable={false} style={{ left: `${-column * 100}%`, top: `${-row * 100}%` }} /></span>;
  const className = `mahjong-face ${tileClass(tile)}${selected ? ' selected' : ''}${listenOption ? ' listen-option' : ''}${pending ? ' pending-discard' : ''}${drawn ? ' drawn' : ''}`;
  return onClick
    ? <button type="button" className={className} onClick={onClick} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel} aria-label={tile.label}>{face}</button>
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
  const [voiceBubble, setVoiceBubble] = useState<{ seat: MahjongSeat; text: string } | null>(null);
  const lastVoiceMessageIdRef = useRef(snapshot.public.chat?.at(-1)?.id ?? null);
  const voiceBubbleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tableRef = useRef<HTMLElementTagNameMap['section'] | null>(null);
  useEffect(() => {
    const messages = snapshot.public.chat ?? [];
    const previousIndex = messages.findIndex((message) => message.id === lastVoiceMessageIdRef.current);
    const fresh = lastVoiceMessageIdRef.current === null ? messages : previousIndex < 0 ? [] : messages.slice(previousIndex + 1);
    lastVoiceMessageIdRef.current = messages.at(-1)?.id ?? null;
    const voice = [...fresh].reverse().find((message) => message.kind === 'voice' && message.senderSeat && message.text);
    if (!voice?.senderSeat || !voice.text || !MAHJONG_SEATS.includes(voice.senderSeat as MahjongSeat)) return;
    if (voiceBubbleTimerRef.current) clearTimeout(voiceBubbleTimerRef.current);
    setVoiceBubble({ seat: voice.senderSeat as MahjongSeat, text: voice.text });
    voiceBubbleTimerRef.current = setTimeout(() => setVoiceBubble(null), 2000);
  }, [snapshot.public.chat]);
  useEffect(() => () => { if (voiceBubbleTimerRef.current) clearTimeout(voiceBubbleTimerRef.current); }, []);
  const pointerStartRef = useRef<{ tileId: string; x: number; y: number; moved: boolean } | null>(null);
  const suppressTileClickUntilRef = useRef(0);
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
  const postDiscardListenWaits = snapshot.private.postDiscardListenWaits ?? [];
  const listenPreview = snapshot.private.isListening
    ? { waits: snapshot.private.listenWaits ?? [] }
    : postDiscardListenWaits.length > 0
      ? { waits: postDiscardListenWaits }
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
    if (Date.now() < suppressTileClickUntilRef.current) { suppressTileClickUntilRef.current = 0; return; }
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
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 18) {
      start.moved = true;
      setDraggingTileId(start.tileId);
    }
  };
  const handleTilePointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    setDraggingTileId(null);
    if (!start?.moved) return;
    suppressTileClickUntilRef.current = Date.now() + 400;
    const table = tableRef.current;
    const bounds = table?.getBoundingClientRect();
    const dropZone = table?.querySelector('.mahjong-discard-pile')?.getBoundingClientRect();
    const insideDropZone = Boolean(dropZone
      && event.clientX >= dropZone.left && event.clientX <= dropZone.right
      && event.clientY >= dropZone.top && event.clientY <= dropZone.bottom);
    if (bounds && insideDropZone) {
      const elementAtRelease = document.elementFromPoint?.(event.clientX, event.clientY);
      const overControl = elementAtRelease instanceof Element
        && Boolean(elementAtRelease.closest('.mahjong-player-card, .mahjong-seat-melds, .mahjong-action-dock, .mahjong-table-settlement, .room-chat-shell'));
      if (overControl) return;
      discardTile(start.tileId);
    }
  };
  const handleTilePointerCancel = () => {
    pointerStartRef.current = null;
    setDraggingTileId(null);
  };
  const chiOptions = snapshot.private.chiOptions ?? [];
  const settlement = snapshot.public.settlement;
  const settlementDescription = settlement?.type === 'draw'
    ? '流局 · 本局不计分 · 原庄家不变'
    : settlement
      ? `${settlement.winnerNickname ?? settlement.winnerSeat ?? ''} 获胜 · ${settlement.isBaoZhongBao ? '宝中宝' : settlement.winPattern === 'big-wind' ? '大风' : settlement.winPattern === 'bao' ? '搂宝' : settlement.type === 'self-draw' ? '自摸' : '平和'}${settlement.isCardang && !settlement.isBaoZhongBao ? ' · 卡当' : ''}`
      : '';
  const players = new Map(snapshot.public.players.map((player) => [player.seat, player]));
  const winAnnouncement = snapshot.public.winAnnouncement;
  const winType = winAnnouncement?.isBaoZhongBao ? '宝中宝'
    : winAnnouncement?.winPattern === 'big-wind' ? '大风'
      : winAnnouncement?.winPattern === 'bao' ? winAnnouncement.isCardang ? '搂宝 · 卡当' : '搂宝'
        : winAnnouncement?.isCardang ? '卡当'
          : winAnnouncement?.type === 'self-draw' ? '自摸' : '平和';
  const discarderNickname = winAnnouncement?.payingSeat ? players.get(winAnnouncement.payingSeat)?.nickname ?? winAnnouncement.payingSeat : null;
  const transfers = settlement?.transfers ?? [];
  const transferDetail = (transfer: typeof transfers[number]) => transfer.fan && settlement?.baseScore
    ? `${transfer.fan}番×${settlement.baseScore}=${transfer.amount}分`
    : `${transfer.amount}`;
  const scoreRows = settlement ? snapshot.public.players.map((player) => {
    const change = settlement.payments?.[player.seat] ?? 0;
    const received = transfers.filter((transfer) => transfer.to === player.seat)
      .map((transfer) => `收 ${players.get(transfer.from)?.nickname ?? transfer.from} ${transferDetail(transfer)}`);
    const paid = transfers.filter((transfer) => transfer.from === player.seat)
      .map((transfer) => `付 ${players.get(transfer.to)?.nickname ?? transfer.to} ${transferDetail(transfer)}`);
    return {
      seat: player.seat,
      nickname: player.nickname,
      before: player.score - change,
      after: player.score,
      change,
      isWinner: settlement.winnerSeat === player.seat,
      isDiscarder: settlement.payingSeat === player.seat,
      flow: [...received, ...paid].join(' · ') || '无积分变化',
    };
  }) : [];
  const revealedHands = new Map([
    ...(snapshot.private.opponentHands ?? []),
    ...(snapshot.public.revealedHands ?? []),
  ].map((opponent) => [opponent.seat, opponent.hand]));
  const wallCount = snapshot.public.wallCount;
  const viewerSeat = ownSeat ?? 'A';
  const wallSides = snapshot.public.wallLayout.sides.map((side) => {
    const position = seatPosition(viewerSeat, side.seat);
    const stacks = side.stacks
      ? side.stacks.map((stack) => ({
        id: `${side.seat}-stack-${stack.index}`,
        count: stack.liveTiles + stack.replacementTiles,
        replacement: stack.replacementTiles > 0,
      }))
      : Array.from({ length: Math.ceil((side.liveTiles + side.replacementTiles) / 2) }, (_, index) => ({
        id: `${side.seat}-stack-${index}`,
        count: Math.min(2, side.liveTiles + side.replacementTiles - index * 2),
        replacement: index * 2 >= side.liveTiles,
      }));
    return {
      seat: side.seat,
      position,
      stacks: position === 'bottom' || position === 'left' ? stacks.reverse() : stacks,
    };
  });
  const showPostDiscardListenDock = !isSpectator && snapshot.public.phase === 'playing' && postDiscardListenWaits.length > 0;
  const showResponseDock = !showPostDiscardListenDock && !isSpectator && snapshot.public.phase === 'playing' && isResponsePhase && (responseActions.length > 0 || availableActions.includes('pass'));
  const showTurnDock = !isSpectator && snapshot.public.phase === 'playing' && isMyTurn && !snapshot.private.isListening
    && (availableActions.includes('listen') || availableActions.includes('concealed-kong') || availableActions.includes('added-kong'));
  const showSelfDrawDock = !isSpectator && snapshot.public.phase === 'playing' && isMyTurn && snapshot.private.isListening && availableActions.includes('hu');
  const actionDock = showPostDiscardListenDock || showResponseDock || showTurnDock || showSelfDrawDock ? <div className="mahjong-action-dock" aria-label="可选操作">
    {showPostDiscardListenDock ? <><button type="button" className="mahjong-action-circle" aria-label="听" onClick={() => respond('listen')}>听</button><button type="button" className="mahjong-action-circle secondary" aria-label="暂不听" onClick={() => respond('pass')}>不听</button></> : null}
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
      <header className="mahjong-header"><div><h1>麻将对局</h1><p>{snapshot.public.phase === 'settled' ? '本局已结算' : winAnnouncement ? `${winAnnouncement.winnerNickname} 胡牌！` : showPostDiscardListenDock ? '已出牌 · 请确认是否听牌' : isResponsePhase ? '响应阶段 · 等待可操作玩家' : snapshot.public.currentTurn ? `轮到${players.get(snapshot.public.currentTurn)?.nickname ?? snapshot.public.currentTurn}出牌` : '牌局进行中'} · 牌墙剩余 {wallCount}</p></div><button type="button" className="leave-room-button" onClick={onLeave}>退出房间</button></header>
      <RoomPurposeNotice />
      <section ref={tableRef} onClick={handleTableClick} className={`mahjong-table${settlement ? ' is-settled' : ''}${selectedTileId ? ' has-selected-tile' : ''}`} aria-label="方形麻将桌">
        {wallSides.map(({ seat, position, stacks }) => <div className={`mahjong-wall mahjong-wall-${position}`} aria-label={`${players.get(seat)?.nickname ?? '玩家'}面前剩余牌墙`} key={seat}>
          {stacks.map((stack) => <span className={`mahjong-wall-stack${stack.count === 2 ? ' double' : ''}${stack.count === 0 ? ' empty' : ''}`} key={stack.id}>{stack.count > 0 ? <TileBack replacement={stack.replacement} /> : null}</span>)}
        </div>)}
        {MAHJONG_SEATS.map((seat) => {
          const position = seatPosition(viewerSeat, seat);
          const player = players.get(seat);
          if (!player) return <article className={`mahjong-seat mahjong-seat-${position}`} key={seat}><div className="mahjong-player-card"><div className="mahjong-player-meta"><strong>空位</strong></div></div></article>;
          const isCurrentTurn = !isResponsePhase && snapshot.public.currentTurn === seat;
          const canRespond = isResponsePhase && seat === ownSeat && responseActions.length > 0;
          const visibleHand = seat === ownSeat ? null : revealedHands.get(seat);
          const isOwnSeat = seat === ownSeat && !isSpectator;
          return <article className={`mahjong-seat mahjong-seat-${position}${isCurrentTurn ? ' current' : ''}${canRespond ? ' responding' : ''}${isOwnSeat ? ' own' : ''}${winAnnouncement?.winnerSeat === seat ? ' winner-announced' : ''}${winAnnouncement?.payingSeat === seat ? ' discarder-announced' : ''}`} key={seat} aria-label={player.nickname}>
            <div className="mahjong-player-card">
              <span className="mahjong-player-avatar">{player.nickname.slice(0, 1)}</span>
              <div className="mahjong-player-meta"><strong>{player.nickname}</strong><span>{player.score} 分</span></div>
              {player.isDealer ? <span className="mahjong-player-badge dealer" aria-label="庄家">庄</span> : null}
              {player.isListening ? <span className="mahjong-player-badge listening" aria-label="听牌标识">听</span> : null}
              {winAnnouncement?.winnerSeat === seat ? <span className="mahjong-win-badge" aria-label="胡牌玩家">胡!</span> : null}
              {winAnnouncement?.payingSeat === seat ? <span className="mahjong-discarder-badge" aria-label="点炮玩家">点炮</span> : null}
              {voiceBubble?.seat === seat ? <span className="mahjong-voice-bubble" role="status">{voiceBubble.text}</span> : null}
            </div>
            {player.melds.length ? <div className="mahjong-seat-melds">{player.melds.map((meld, index) => <MeldTiles meld={meld} key={`${seat}-${index}`} />)}</div> : null}
            {!isOwnSeat && visibleHand ? <div className="mahjong-revealed-hand" aria-label={`${player.nickname}的明牌`}>{visibleHand.map((tile) => <TileFace tile={tile} key={tile.id} />)}</div> : null}
            {!isOwnSeat && !visibleHand && player.handCount > 0 ? <div className="mahjong-concealed-hand" aria-label={`${player.nickname}的未公开手牌`}>{Array.from({ length: player.handCount }, (_, index) => <TileEdge key={`${seat}-hand-${index}`} />)}</div> : null}
            {isOwnSeat ? <>
              <div className="mahjong-own-hand" aria-label="我的手牌">{displayHand.map((tile) => <TileFace key={tile.id} tile={tile} drawn={tile.id === drawnTileId} selected={tile.id === selectedTileId} listenOption={listenTileIds.has(tile.id)} pending={tile.id === draggingTileId} onClick={isMyTurn && !snapshot.private.isListening ? () => handleTileClick(tile.id) : undefined} onPointerDown={isMyTurn && !snapshot.private.isListening ? (event) => handleTilePointerDown(tile.id, event) : undefined} onPointerMove={isMyTurn && !snapshot.private.isListening ? handleTilePointerMove : undefined} onPointerUp={isMyTurn && !snapshot.private.isListening ? handleTilePointerUp : undefined} onPointerCancel={isMyTurn && !snapshot.private.isListening ? handleTilePointerCancel : undefined} />)}</div>
              {listenPreview ? <div className="mahjong-listen-preview" role="status"><strong>{snapshot.private.isListening ? '已听牌' : showPostDiscardListenDock ? '已出牌，可选择听牌' : '打出此牌可听'}</strong><span>胡：</span>{listenPreview.waits.map((tile) => <TileFace key={tile.id} tile={tile} />)}{snapshot.private.isListening && snapshot.private.baoTile ? <span className="mahjong-bao-preview"><b>宝</b><TileFace tile={snapshot.private.baoTile} /></span> : null}</div> : null}
            </> : null}
          </article>;
        })}
        <div className="mahjong-discard-pile" aria-label="公共弃牌区">
          <div className="mahjong-discard-tiles">{snapshot.public.discardRiver.map(({ tile }) => <TileFace tile={tile} key={tile.id} pending={snapshot.public.pendingDiscard?.tile.id === tile.id} />)}</div>
        </div>
        {actionDock}
        {winAnnouncement ? <div className={`mahjong-win-announcement${discarderNickname ? ' from-discard' : ''}`} role="status" aria-label={`${winAnnouncement.winnerNickname}${winType}${discarderNickname ? `，${discarderNickname}点炮` : ''}`}>
          <span className="mahjong-win-kicker">本局胡牌</span><strong>{winType}</strong><span>{winAnnouncement.winnerNickname} 胡牌</span>
          {discarderNickname ? <span className="mahjong-win-cause">{discarderNickname} 点炮</span> : null}
        </div> : null}
        {settlement ? <section className="mahjong-settlement mahjong-table-settlement" role="status" aria-label="本局结算">
          <h2>本局结束</h2>
          <p>{settlementDescription}</p>
          <div className="mahjong-score-ledger" aria-label="本局积分流水">{scoreRows.map((row) => <div className={`mahjong-score-row${row.seat === ownSeat ? ' mine' : ''}`} key={row.seat}><strong>{row.nickname}{row.seat === ownSeat ? '（我）' : ''}{row.isWinner ? <span className="mahjong-score-role winner">胡牌</span> : null}{row.isDiscarder ? <span className="mahjong-score-role discarder">点炮</span> : null}</strong><span>{row.before} → {row.after}</span><b className={row.change >= 0 ? 'positive' : 'negative'}>{row.change > 0 ? '+' : ''}{row.change} 分</b><small>{row.flow}</small></div>)}</div>
          {settlement.type !== 'draw' && snapshot.public.hostSeat === ownSeat ? <button type="button" onClick={() => action('next-hand')}>开始下一局</button> : settlement.type !== 'draw' ? <small>等待房主开始下一局</small> : <small>即将开始下一局</small>}
        </section> : null}
        {animationStage ? <div className={`mahjong-deal-overlay ${animationStage}`} role="status"><div className="mahjong-dice-cube">{snapshot.public.diceRoll?.join(' · ') ?? '掷骰'}</div><strong>{animationStage === 'dice' ? '庄家掷骰' : '正在发牌'}</strong>{animationStage === 'deal' ? <div className="dealing-tiles"><TileBack /><TileBack /><TileBack /><TileBack /></div> : null}</div> : null}
      </section>
      {snapshot.private.autoDiscardPending ? <p className="mahjong-status">听牌自动摸切中…</p> : null}
      {!isSpectator && isMyTurn && snapshot.private.isListening && !availableActions.includes('hu') ? <p className="mahjong-status">你已听牌，约1秒后自动摸切。</p> : null}
    </main>
  );
}
