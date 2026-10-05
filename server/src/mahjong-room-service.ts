import {
  MahjongAction,
  MahjongCommandEnvelope,
  MahjongCommandType,
  MahjongPrivateSnapshot,
  MahjongPublicSnapshot,
  MahjongWallLayout,
  MahjongSettlement,
  MahjongSnapshot,
  RoomChatMessage,
  RoomChatPayload,
} from '../../shared/src/protocol';
import {
  createMahjongDeck,
  findChiOptions,
  findTilesByKey,
  hasMahjongListenYao,
  hasMahjongPairStructure,
  hasMahjongSequence,
  isBigWindWin,
  isMahjongCardangWait,
  isWinningMahjongHand,
  mahjongWaits,
  MahjongMeldKind,
  MahjongMeld,
  MahjongSeat,
  MahjongTile,
  MAHJONG_SEAT_LABELS,
  MAHJONG_SEATS,
  matchingTileCount,
  nextMahjongSeat,
  sortMahjongTiles,
  tileKey,
} from '../../shared/src/mahjong';
import { isValidNickname } from '../../shared/src/validation';
import { appendRoomChatMessage, createRoomChatMessage } from './room-chat';
import { Session, SessionService } from './session-service';

export interface MahjongRoomServiceOptions {
  readonly inviteCode: string;
  readonly now?: () => number;
  readonly random?: () => number;
}

export interface MahjongAuthResult {
  readonly sessionToken: string;
  readonly playerId: string;
}

export interface MahjongCommandSuccess {
  readonly ok: true;
  readonly snapshot: MahjongSnapshot;
}

export class MahjongRoomServiceError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'MahjongRoomServiceError';
    this.code = code;
  }
}

interface MahjongPlayer {
  readonly id: string;
  readonly seat: MahjongSeat;
  nickname: string;
  connected: boolean;
  score: number;
  isListening: boolean;
  mustListenAfterChi: boolean;
  listenWaits: MahjongTile[];
  listenBao: MahjongTile | null;
  lastDrawnTileId: string | null;
  hand: MahjongTile[];
  melds: MahjongMeld[];
  discards: MahjongTile[];
}

interface PendingResponses {
  readonly seat: MahjongSeat;
  readonly tile: MahjongTile;
  readonly discarderWasListening: boolean;
  readonly options: Partial<Record<MahjongSeat, MahjongAction[]>>;
  readonly passed: MahjongSeat[];
}

interface PendingListenDecision {
  readonly seat: MahjongSeat;
  readonly tile: MahjongTile;
  readonly waits: MahjongTile[];
}

interface PendingWin {
  readonly settlement: MahjongSettlement;
  readonly announceAt: number;
  settleAt: number;
  announced: boolean;
}

interface WallPosition {
  readonly seat: MahjongSeat;
  readonly stack: number;
  readonly layer: 0 | 1;
}

interface MahjongState {
  roomId: string;
  hostId: string;
  phase: MahjongPublicSnapshot['phase'];
  handNumber: number;
  version: number;
  players: Record<MahjongSeat, MahjongPlayer | null>;
  dealerSeat: MahjongSeat;
  currentTurn: MahjongSeat | null;
  awaitingDiscard: boolean;
  wall: MahjongTile[];
  replacementWall: MahjongTile[];
  wallPositions: WallPosition[];
  replacementPositions: WallPosition[];
  wallBreakSide: MahjongSeat | null;
  replacementWallSide: MahjongSeat | null;
  wallBreakStack: number | null;
  diceRoll: [number, number] | null;
  autoDiscardAt: number | null;
  nextHandAt: number | null;
  pending: PendingResponses | null;
  pendingListen: PendingListenDecision | null;
  pendingWin: PendingWin | null;
  lastDiscard: { seat: MahjongSeat; tile: MahjongTile } | null;
  discardRiver: Array<{ seat: MahjongSeat; tile: MahjongTile }>;
  settlement: MahjongSettlement | null;
}

const MAX_SPECTATORS = 4;
const TOTAL_TILE_COUNT = 136;
const FLOW_WALL_THRESHOLD = Math.ceil(TOTAL_TILE_COUNT * 0.15);
const LISTENING_DISCARD_DELAY_MS = 1_000;
const WIN_ANNOUNCE_DELAY_MS = 1_000;
const WIN_EFFECT_DURATION_MS = 900;
const DRAW_RESTART_DELAY_MS = 2_000;

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const value = Math.max(0, Math.min(0.999999, random()));
    const swapIndex = Math.floor(value * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function removeTileIds(hand: MahjongTile[], ids: readonly string[]): MahjongTile[] {
  const selected = new Set(ids);
  if (selected.size !== ids.length || ids.some((id) => !hand.some((tile) => tile.id === id))) {
    throw new MahjongRoomServiceError('TILE_NOT_OWNED', '选择的牌不在手牌中');
  }
  return hand.filter((tile) => !selected.has(tile.id));
}

function makeInitialWallLayout(dealerSeat: MahjongSeat, diceRoll: readonly [number, number]): Pick<MahjongState, 'wallPositions' | 'replacementPositions' | 'wallBreakSide' | 'replacementWallSide' | 'wallBreakStack'> {
  // From the dealer's view, count stacks left-to-right on the opposite wall.
  // Dealing and ordinary draws move clockwise from the cut; kong draws and bao
  // inspection approach that same cut from the reserved segment's far end.
  const wallBreakSide = MAHJONG_SEATS[(MAHJONG_SEATS.indexOf(dealerSeat) + 2) % MAHJONG_SEATS.length]!;
  const wallBreakStack = diceRoll[0] + diceRoll[1];
  const positions = (seat: MahjongSeat, start: number, end: number): WallPosition[] =>
    Array.from({ length: end - start }, (_, offset) => [
      { seat, stack: start + offset, layer: 0 as const },
      { seat, stack: start + offset, layer: 1 as const },
    ]).flat();
  const wallPositions = positions(wallBreakSide, wallBreakStack, 17);
  let side = nextMahjongSeat(wallBreakSide);
  for (let count = 0; count < 3; count += 1) {
    wallPositions.push(...positions(side, 0, 17));
    side = nextMahjongSeat(side);
  }
  return {
    wallPositions,
    replacementPositions: positions(wallBreakSide, 0, wallBreakStack),
    wallBreakSide,
    replacementWallSide: wallBreakSide,
    wallBreakStack,
  };
}

export class MahjongRoomService {
  readonly sessions = new SessionService();
  private readonly inviteCode: string;
  private readonly now: () => number;
  private readonly random: () => number;
  private state: MahjongState | null = null;
  private readonly requestResults = new Map<string, Map<string, MahjongCommandSuccess>>();
  private chatMessages: RoomChatMessage[] = [];

  constructor(options: MahjongRoomServiceOptions) {
    this.inviteCode = options.inviteCode;
    this.now = options.now ?? (() => Date.now());
    this.random = options.random ?? Math.random;
  }

  login(inviteCode: string): MahjongAuthResult {
    if (inviteCode !== this.inviteCode) throw new MahjongRoomServiceError('INVALID_INVITE', '邀请码错误');
    const session = this.sessions.create(this.now());
    return { sessionToken: session.sessionToken, playerId: session.playerId };
  }

  resume(sessionToken: string): MahjongAuthResult {
    const session = this.sessions.get(sessionToken);
    return { sessionToken: session.sessionToken, playerId: session.playerId };
  }

  join(sessionToken: string, nickname: string, roomId: string): MahjongSnapshot {
    const session = this.sessions.get(sessionToken);
    if (roomId !== 'mahjong') throw new MahjongRoomServiceError('ROOM_NOT_FOUND', '麻将房间不存在');
    if (!isValidNickname(nickname)) throw new MahjongRoomServiceError('INVALID_NICKNAME', '昵称仅支持1–12位中文、字母、数字或下划线');
    if (session.mahjongSeat || session.role === 'spectator') return this.getSnapshot(sessionToken);
    if (!this.state) this.state = this.emptyState(roomId, session.playerId);
    if (Object.values(this.state.players).some((player) => player?.nickname === nickname.trim())) {
      throw new MahjongRoomServiceError('NICKNAME_EXISTS', '昵称已经被使用，请更换昵称');
    }
    if (this.state.phase !== 'lobby') return this.joinSpectator(sessionToken, nickname.trim());
    const seat = MAHJONG_SEATS.find((candidate) => this.state?.players[candidate] === null);
    if (!seat) return this.joinSpectator(sessionToken, nickname.trim());
    this.addPlayer(seat, session, nickname.trim());
    this.sessions.setIdentity(sessionToken, 'player', nickname.trim());
    this.sessions.touch(sessionToken, this.now());
    this.state.version += 1;
    return this.getSnapshot(sessionToken);
  }

  getSnapshot(sessionToken: string): MahjongSnapshot {
    const session = this.sessions.get(sessionToken);
    if (!this.state) return { public: this.emptyPublicSnapshot(), private: this.emptyPrivateSnapshot(session) };
    const state = this.state;
    const visiblePending = state.pending ?? state.pendingListen;
    const players = Object.values(state.players)
      .filter((player): player is MahjongPlayer => player !== null)
      .map((player) => ({
        seat: player.seat,
        seatLabel: MAHJONG_SEAT_LABELS[player.seat],
        nickname: player.nickname,
        connected: player.connected,
        handCount: player.hand.length,
        score: player.score,
        isListening: player.isListening,
        melds: player.melds.map((meld) => ({
          kind: meld.kind,
          tiles: meld.kind === 'concealed-kong' && player.seat !== session.mahjongSeat ? [] : [...meld.tiles],
        })),
        discards: [...player.discards],
        isDealer: player.seat === state.dealerSeat,
        isHost: player.id === state.hostId,
      }));
    const publicSnapshot: MahjongPublicSnapshot = {
      gameId: 'mahjong',
      roomId: state.roomId,
      phase: state.phase,
      handNumber: state.handNumber,
      version: state.version,
      players,
      spectators: this.sessions.listSpectators().map((viewer) => ({ nickname: viewer.nickname ?? '观战者', connected: viewer.connectionId !== null })),
      chat: [...this.chatMessages],
      hostSeat: Object.values(state.players).find((player) => player?.id === state.hostId)?.seat ?? null,
      dealerSeat: state.dealerSeat,
      currentTurn: state.currentTurn,
      awaitingDiscard: state.awaitingDiscard,
      pendingDiscard: visiblePending ? { seat: visiblePending.seat, tile: visiblePending.tile } : null,
      responseSeats: state.pending && !state.pendingListen && !state.pendingWin
        ? Object.keys(state.pending.options).filter((seat) => !state.pending!.passed.includes(seat as MahjongSeat)) as MahjongSeat[]
        : [],
      wallCount: state.wall.length + state.replacementWall.length,
      wallLayout: this.wallLayout(state),
      diceRoll: state.diceRoll,
      lastDiscard: state.lastDiscard,
      discardRiver: state.discardRiver.map((discard) => ({ ...discard })),
      winAnnouncement: state.pendingWin?.announced && state.pendingWin.settlement.winnerSeat
        ? {
          winnerSeat: state.pendingWin.settlement.winnerSeat,
          winnerNickname: state.pendingWin.settlement.winnerNickname ?? state.pendingWin.settlement.winnerSeat,
          type: state.pendingWin.settlement.type as 'self-draw' | 'discard-win',
          winPattern: state.pendingWin.settlement.winPattern ?? 'standard',
        }
        : null,
      ...(state.phase === 'settled' ? {
        revealedHands: Object.values(state.players)
          .filter((player): player is MahjongPlayer => player !== null)
          .map((player) => {
            const winningTile = state.settlement?.type === 'discard-win' && state.settlement.winnerSeat === player.seat
              ? state.settlement.winningTile
              : undefined;
            return { seat: player.seat, nickname: player.nickname, hand: sortMahjongTiles([...player.hand, ...(winningTile ? [winningTile] : [])]) };
          }),
      } : {}),
      settlement: state.settlement,
    };
    const ownPlayer = session.mahjongSeat ? state.players[session.mahjongSeat] : null;
    const available = ownPlayer ? this.availableActions(ownPlayer) : [];
    const listenOptions = ownPlayer && state.phase === 'playing' && state.currentTurn === ownPlayer.seat && state.awaitingDiscard
      && !state.pending && !ownPlayer.isListening && this.canDeclareListen(ownPlayer)
      ? this.listenPreviews(ownPlayer)
      : [];
    const privateSnapshot: MahjongPrivateSnapshot = {
      seat: session.mahjongSeat,
      hand: ownPlayer ? sortMahjongTiles(ownPlayer.hand) : [],
      availableActions: available,
      ...(state.pendingListen && ownPlayer && state.pendingListen.seat === ownPlayer.seat
        ? { postDiscardListenWaits: state.pendingListen.waits }
        : {}),
      ...(listenOptions.length ? {
        listenTileIds: listenOptions.map((option) => option.discardTileId),
        listenOptions,
      } : {}),
      ...(ownPlayer?.lastDrawnTileId ? { drawnTileId: ownPlayer.lastDrawnTileId } : {}),
      ...(ownPlayer ? { isListening: ownPlayer.isListening } : {}),
      ...(ownPlayer ? { autoDiscardPending: state.phase === 'playing'
        && state.autoDiscardAt !== null && state.currentTurn === ownPlayer.seat } : {}),
      ...(ownPlayer?.isListening ? {
        discardableTileId: ownPlayer.lastDrawnTileId ?? undefined,
        listenWaits: ownPlayer.listenWaits,
        baoTile: ownPlayer.listenBao ?? undefined,
        opponentHands: Object.values(state.players)
          .filter((player): player is MahjongPlayer => player !== null && player.seat !== ownPlayer.seat)
          .map((player) => ({ seat: player.seat, nickname: player.nickname, hand: sortMahjongTiles(player.hand) })),
      } : {}),
      ...(ownPlayer && state.pending && available.includes('chi') ? { chiOptions: this.privateChiOptions(ownPlayer, state.pending) } : {}),
      spectator: session.role === 'spectator',
      ...(session.role === 'spectator' && state.phase === 'settled' ? {
        spectatorHands: Object.values(state.players)
          .filter((player): player is MahjongPlayer => player !== null)
          .map((player) => ({ seat: player.seat, nickname: player.nickname, hand: sortMahjongTiles(player.hand) })),
      } : {}),
    };
    return { public: publicSnapshot, private: privateSnapshot };
  }

  private wallLayout(state: MahjongState): MahjongWallLayout {
    return {
      breakSide: state.wallBreakSide,
      replacementSide: state.replacementWallSide,
      breakStack: state.wallBreakStack,
      sides: MAHJONG_SEATS.map((seat) => ({
        seat,
        liveTiles: state.wallPositions.filter((position) => position.seat === seat).length,
        replacementTiles: state.replacementPositions.filter((position) => position.seat === seat).length,
        stacks: Array.from({ length: 17 }, (_, index) => ({
          index,
          liveTiles: state.wallPositions.filter((position) => position.seat === seat && position.stack === index).length,
          replacementTiles: state.replacementPositions.filter((position) => position.seat === seat && position.stack === index).length,
        })),
      })),
    };
  }

  attach(sessionToken: string, connectionId: string): { previousConnectionId: string | null } {
    const attachment = this.sessions.attach(sessionToken, connectionId, this.now());
    const session = this.sessions.get(sessionToken);
    if (this.state && session.mahjongSeat && this.state.players[session.mahjongSeat]?.id === session.playerId) {
      this.state.players[session.mahjongSeat]!.connected = true;
      this.state.version += 1;
    }
    return attachment;
  }

  isConnectionOwner(sessionToken: string, connectionId: string): boolean {
    return this.sessions.get(sessionToken).connectionId === connectionId;
  }

  disconnect(sessionToken: string, connectionId: string): void {
    if (!this.sessions.detach(sessionToken, connectionId, this.now())) return;
    const session = this.sessions.get(sessionToken);
    if (this.state && session.mahjongSeat && this.state.players[session.mahjongSeat]) {
      this.state.players[session.mahjongSeat]!.connected = false;
      this.state.version += 1;
    }
  }

  leave(sessionToken: string): void {
    const session = this.sessions.get(sessionToken);
    if (session.role === 'spectator') {
      this.sessions.clearIdentity(sessionToken);
      return;
    }
    if (!session.mahjongSeat) {
      this.sessions.clearIdentity(sessionToken);
      return;
    }
    if (this.state && this.state.phase === 'playing') throw new MahjongRoomServiceError('HAND_IN_PROGRESS', '牌局进行中不能退出，请等待本局结束');
    this.removeSeat(session.mahjongSeat);
    this.sessions.clearIdentity(sessionToken);
    this.clearChatIfEmpty();
  }

  recordChat(sessionToken: string, payload: RoomChatPayload): RoomChatMessage {
    if (!this.state) throw new MahjongRoomServiceError('ROOM_NOT_FOUND', '房间尚未创建');
    this.sessions.touch(sessionToken, this.now());
    const message = createRoomChatMessage(this.sessions.get(sessionToken), payload);
    this.chatMessages = appendRoomChatMessage(this.chatMessages, message);
    return message;
  }

  recordActivity(sessionToken: string): MahjongSnapshot {
    this.sessions.touch(sessionToken, this.now());
    return this.getSnapshot(sessionToken);
  }

  scan(now = this.now()): boolean {
    let changed = false;
    if (this.state && (this.state.phase === 'lobby' || this.state.phase === 'settled')) {
      for (const player of Object.values(this.state.players)) {
        if (!player) continue;
        const session = this.sessions.findByPlayerId(player.id);
        if (!session || !this.sessions.isInactive(session.sessionToken, now)) continue;
        this.removeSeat(player.seat);
        changed = true;
        if (!this.state) break;
      }
    }
    for (const spectator of this.sessions.listSpectators()) {
      if (!this.sessions.isInactive(spectator.sessionToken, now)) continue;
      this.sessions.clearIdentity(spectator.sessionToken);
      changed = true;
    }
    this.clearChatIfEmpty();
    return changed;
  }

  tick(now = this.now()): boolean {
    const state = this.state;
    if (!state) return false;
    if (state.pendingWin) {
      if (!state.pendingWin.announced && now >= state.pendingWin.announceAt) {
        state.pendingWin.announced = true;
        state.pendingWin.settleAt = now + WIN_EFFECT_DURATION_MS;
        state.version += 1;
        return true;
      }
      if (state.pendingWin.announced && now >= state.pendingWin.settleAt) {
        this.settle(state.pendingWin.settlement);
        return true;
      }
      return false;
    }
    if (state.phase === 'playing' && state.autoDiscardAt !== null && now >= state.autoDiscardAt && state.currentTurn) {
      const player = state.players[state.currentTurn];
      const tileId = player?.lastDrawnTileId;
      state.autoDiscardAt = null;
      if (player?.isListening && tileId && state.awaitingDiscard) this.discard(player.seat, tileId);
      return true;
    }
    if (state.phase === 'settled' && state.settlement?.type === 'draw' && state.nextHandAt !== null && now >= state.nextHandAt) {
      this.startHand();
      return true;
    }
    return false;
  }

  dispatch(sessionToken: string, command: MahjongCommandEnvelope): MahjongCommandSuccess {
    const session = this.sessions.get(sessionToken);
    this.sessions.touch(sessionToken, this.now());
    const previous = this.requestResults.get(sessionToken)?.get(command.requestId);
    if (previous) return previous;
    if (!this.state) throw new MahjongRoomServiceError('ROOM_NOT_FOUND', '房间尚未创建');
    if (command.handNumber !== this.state.handNumber) throw new MahjongRoomServiceError('STALE_HAND', '牌局编号已过期，请刷新视图');
    if (command.stateVersion !== this.state.version) throw new MahjongRoomServiceError('STALE_VERSION', '状态版本已过期，请刷新视图');
    if ((!session.mahjongSeat || session.role === 'spectator') && command.type !== 'remove-player') throw new MahjongRoomServiceError('NOT_SEATED', '玩家尚未入座或正在观战');
    this.applyCommand(session, command.type, command.payload);
    const result: MahjongCommandSuccess = { ok: true, snapshot: this.getSnapshot(sessionToken) };
    if (!this.requestResults.has(sessionToken)) this.requestResults.set(sessionToken, new Map());
    this.requestResults.get(sessionToken)!.set(command.requestId, result);
    return result;
  }

  private applyCommand(session: Session, type: MahjongCommandType, payload: MahjongCommandEnvelope['payload']): void {
    if (!this.state) throw new MahjongRoomServiceError('ROOM_NOT_FOUND', '房间尚未创建');
    const state = this.state;
    if (state.pendingWin) throw new MahjongRoomServiceError('WIN_ANIMATION', '胡牌展示中，请稍候结算');
    switch (type) {
      case 'start-hand':
        this.assertHost(session);
        this.startHand();
        return;
      case 'next-hand':
        this.assertHost(session);
        if (state.phase !== 'settled') throw new MahjongRoomServiceError('INVALID_PHASE', '本局尚未结束');
        this.returnToLobby();
        return;
      case 'remove-player': {
        this.assertHost(session);
        if (state.phase !== 'lobby' && state.phase !== 'settled') throw new MahjongRoomServiceError('INVALID_PHASE', '牌局进行中不能移除玩家');
        const targetSeat = (payload as { readonly seat: MahjongSeat }).seat;
        if (targetSeat === session.mahjongSeat) throw new MahjongRoomServiceError('CANNOT_REMOVE_SELF', '不能移除自己');
        if (!state.players[targetSeat]) throw new MahjongRoomServiceError('PLAYER_NOT_FOUND', '该座位没有玩家');
        this.removeSeat(targetSeat);
        return;
      }
      case 'discard':
        this.discard(session.mahjongSeat!, (payload as { readonly tileId: string }).tileId);
        return;
      case 'listen':
        this.listen(session.mahjongSeat!, (payload as { readonly tileId?: string }).tileId);
        return;
      case 'pass':
        this.pass(session.mahjongSeat!);
        return;
      case 'hu':
        this.hu(session.mahjongSeat!);
        return;
      case 'chi':
      case 'peng':
      case 'exposed-kong':
        this.claim(session.mahjongSeat!, type, payload as { readonly tileIds?: readonly string[]; readonly discardTileId?: string });
        return;
      case 'added-kong':
        this.addedKong(session.mahjongSeat!, (payload as { readonly tileId: string }).tileId);
        return;
      case 'concealed-kong':
        this.concealedKong(session.mahjongSeat!, (payload as { readonly tileIds?: readonly string[] }).tileIds);
        return;
      default:
        throw new MahjongRoomServiceError('INVALID_COMMAND', '命令类型不支持');
    }
  }

  private startHand(): void {
    if (!this.state) throw new MahjongRoomServiceError('ROOM_NOT_FOUND', '房间尚未创建');
    if (this.state.phase !== 'lobby' && this.state.phase !== 'settled') throw new MahjongRoomServiceError('HAND_IN_PROGRESS', '牌局尚未结束');
    if (this.state.phase === 'settled') this.returnToLobby();
    if (MAHJONG_SEATS.some((seat) => !this.state?.players[seat])) throw new MahjongRoomServiceError('NOT_ENOUGH_PLAYERS', '需要四名玩家才能开始');
    const deck = shuffle(createMahjongDeck(), this.random);
    const dealer = this.state.dealerSeat;
    const diceRoll: [number, number] = [1 + Math.floor(this.random() * 6), 1 + Math.floor(this.random() * 6)];
    const layout = makeInitialWallLayout(dealer, diceRoll);
    const replacementWall = deck.splice(-layout.replacementPositions.length);
    const players = this.state.players;
    for (const seat of MAHJONG_SEATS) {
      players[seat]!.hand = sortMahjongTiles(deck.splice(0, 13));
      players[seat]!.melds = [];
      players[seat]!.discards = [];
      players[seat]!.isListening = false;
      players[seat]!.mustListenAfterChi = false;
      players[seat]!.listenWaits = [];
      players[seat]!.listenBao = null;
      players[seat]!.lastDrawnTileId = null;
    }
    this.state.discardRiver = [];
    const dealerTile = deck.shift()!;
    players[dealer]!.hand.push(dealerTile);
    players[dealer]!.lastDrawnTileId = dealerTile.id;
    layout.wallPositions.splice(0, 53);
    this.state = {
      ...this.state,
      phase: 'playing',
      version: this.state.version + 1,
      handNumber: this.state.handNumber + 1,
      wall: deck,
      replacementWall,
      ...layout,
      currentTurn: dealer,
      awaitingDiscard: true,
      diceRoll,
      autoDiscardAt: null,
      nextHandAt: null,
      pending: null,
      pendingListen: null,
      pendingWin: null,
      lastDiscard: null,
      settlement: null,
    };
  }

  private discard(seat: MahjongSeat, tileId: string): void {
    const state = this.requirePlaying();
    if (state.pending || !state.awaitingDiscard || state.currentTurn !== seat) throw new MahjongRoomServiceError('NOT_YOUR_TURN', '当前还不能出牌');
    const player = this.requirePlayer(seat);
    const tile = player.hand.find((candidate) => candidate.id === tileId);
    if (!tile) throw new MahjongRoomServiceError('TILE_NOT_OWNED', '选择的牌不在手牌中');
    if (player.mustListenAfterChi) throw new MahjongRoomServiceError('MUST_LISTEN_AFTER_CHI', '这次隔位吃牌后必须听牌并打出一张牌');
    if (player.isListening && player.lastDrawnTileId !== tileId) throw new MahjongRoomServiceError('LISTEN_LOCKED', '听牌后只能打出刚摸到的牌');
    const postDiscardWaits = !player.isListening && player.melds.some((meld) => meld.kind !== 'concealed-kong')
      ? this.validListenWaits(player.hand.filter((candidate) => candidate.id !== tileId), player.melds.length, player.melds)
      : [];
    const baoSeatsBeforeDiscard = this.baoSeatsFor(tile);
    player.hand = removeTileIds(player.hand, [tileId]);
    player.lastDrawnTileId = null;
    state.autoDiscardAt = null;
    player.discards.push(tile);
    state.discardRiver.push({ seat, tile });
    this.refreshListenerBao();
    state.lastDiscard = { seat, tile };
    state.awaitingDiscard = false;
    state.pending = this.createPending(seat, tile, baoSeatsBeforeDiscard, player.isListening);
    state.pendingListen = postDiscardWaits.length > 0 ? { seat, tile, waits: postDiscardWaits } : null;
    state.version += 1;
    if (!state.pendingListen && !state.pending) this.advanceAfterNoResponse();
  }

  private listen(seat: MahjongSeat, tileId?: string): void {
    const state = this.requirePlaying();
    if (state.pendingListen) {
      if (state.pendingListen.seat !== seat || (tileId && tileId !== state.pendingListen.tile.id)) {
        throw new MahjongRoomServiceError('INVALID_ACTION', '当前不能确认听牌');
      }
      const player = this.requirePlayer(seat);
      player.isListening = true;
      player.listenWaits = state.pendingListen.waits;
      state.pendingListen = null;
      this.refreshListenerBao();
      state.version += 1;
      if (!state.pending) this.advanceAfterNoResponse();
      return;
    }
    if (state.pending || !state.awaitingDiscard || state.currentTurn !== seat) throw new MahjongRoomServiceError('NOT_YOUR_TURN', '当前还不能听牌');
    const player = this.requirePlayer(seat);
    if (player.isListening) throw new MahjongRoomServiceError('ALREADY_LISTENING', '已经听牌');
    if (!tileId) throw new MahjongRoomServiceError('INVALID_ACTION', '请选择要打出的牌');
    const tile = player.hand.find((candidate) => candidate.id === tileId);
    if (!tile) throw new MahjongRoomServiceError('TILE_NOT_OWNED', '选择的牌不在手牌中');
    const hand = removeTileIds(player.hand, [tileId]);
    const waits = this.validListenWaits(hand, player.melds.length, player.melds);
    if (!player.melds.some((meld) => meld.kind !== 'concealed-kong')) throw new MahjongRoomServiceError('CLOSED_HAND', '听牌前必须开门，先吃、碰或明杠一组牌');
    if (waits.length === 0) throw new MahjongRoomServiceError('NOT_LISTENING', '打出这张牌后不满足听牌条件');
    const baoSeatsBeforeDiscard = this.baoSeatsFor(tile);
    player.hand = hand;
    player.isListening = true;
    player.mustListenAfterChi = false;
    player.listenWaits = waits;
    player.lastDrawnTileId = null;
    player.discards.push(tile);
    state.discardRiver.push({ seat, tile });
    this.refreshListenerBao();
    state.lastDiscard = { seat, tile };
    state.awaitingDiscard = false;
    state.pending = this.createPending(seat, tile, baoSeatsBeforeDiscard, true);
    state.version += 1;
    if (!state.pending || Object.keys(state.pending.options).length === 0) this.advanceAfterNoResponse();
  }

  private pass(seat: MahjongSeat): void {
    const state = this.requirePlaying();
    if (state.pendingListen) {
      if (state.pendingListen.seat !== seat) throw new MahjongRoomServiceError('INVALID_ACTION', '当前没有可跳过的操作');
      state.pendingListen = null;
      state.version += 1;
      if (!state.pending) this.advanceAfterNoResponse();
      return;
    }
    if (!state.pending) {
      const player = this.requirePlayer(seat);
      const drawnTile = player.lastDrawnTileId ? player.hand.find((tile) => tile.id === player.lastDrawnTileId) : undefined;
      if (player.isListening && state.currentTurn === seat && state.awaitingDiscard && drawnTile && this.canSelfDrawHu(player, drawnTile)) {
        this.discard(seat, drawnTile.id);
        return;
      }
      throw new MahjongRoomServiceError('INVALID_ACTION', '当前没有可跳过的操作');
    }
    if (!state.pending.options[seat]) throw new MahjongRoomServiceError('INVALID_ACTION', '当前没有可跳过的操作');
    if (this.claimPriority(state.pending).seat !== seat) throw new MahjongRoomServiceError('CLAIM_PRIORITY', '有优先级更高的玩家正在响应');
    if (!state.pending.passed.includes(seat)) state.pending.passed.push(seat);
    state.version += 1;
    if (Object.keys(state.pending.options).every((candidate) => state.pending!.passed.includes(candidate as MahjongSeat))) this.advanceAfterNoResponse();
  }

  private hu(seat: MahjongSeat): void {
    const state = this.requirePlaying();
    if (state.pendingWin) throw new MahjongRoomServiceError('WIN_ANIMATION', '胡牌展示中，请稍候结算');
    if (state.pendingListen) throw new MahjongRoomServiceError('INVALID_ACTION', '等待出牌玩家确认是否听牌');
    const player = this.requirePlayer(seat);
    const winningTile = state.pending?.tile;
    if (state.pending && this.claimPriority(state.pending).seat !== seat) {
      throw new MahjongRoomServiceError('CLAIM_PRIORITY', '按出牌顺序，前面的玩家优先响应');
    }
    const onDiscard = Boolean(state.pending);
    const lastDrawn = player.lastDrawnTileId ? player.hand.find((tile) => tile.id === player.lastDrawnTileId) : undefined;
    const tile = winningTile ?? lastDrawn;
    const waitKeys = new Set(player.listenWaits.map(tileKey));
    const matchingReadyWait = Boolean(tile && waitKeys.has(tileKey(tile)));
    const bigWind = Boolean(!onDiscard && tile && isBigWindWin(player.hand.filter((handTile) => handTile.id !== tile.id), tile, player.melds));
    const isBaoTile = Boolean(tile && player.listenBao && tileKey(tile) === tileKey(player.listenBao));
    const baoWin = !onDiscard && isBaoTile;
    const allowed = player.isListening
      && Boolean(tile)
      && player.melds.length < 4
      && player.hand.filter((handTile) => handTile.id !== tile?.id).length >= 4
      && hasMahjongPairStructure(player.hand.filter((handTile) => handTile.id !== tile?.id), player.melds)
      && hasMahjongSequence(player.hand.filter((handTile) => handTile.id !== tile?.id), player.melds)
      && (onDiscard
        ? !isBaoTile && Boolean(state.pending?.options[seat]?.includes('hu'))
        : state.currentTurn === seat && state.awaitingDiscard && (matchingReadyWait || bigWind || baoWin));
    if (!allowed) throw new MahjongRoomServiceError('INVALID_ACTION', '当前不能胡牌');
    const winPattern = bigWind ? 'big-wind' : baoWin ? 'bao' : 'standard';
    const waitingHand = onDiscard ? player.hand : player.hand.filter((handTile) => handTile.id !== tile!.id);
    const structuralWaits = player.listenWaits.filter((wait) => isWinningMahjongHand([...waitingHand, wait], player.melds.length));
    const isCardang = !bigWind && structuralWaits.length === 1
      && isMahjongCardangWait(waitingHand, structuralWaits[0]!, player.melds.length)
      && (baoWin || tileKey(structuralWaits[0]!) === tileKey(tile!));
    const isBaoZhongBao = baoWin && isCardang && tileKey(structuralWaits[0]!) === tileKey(tile!);
    if (onDiscard && state.pending) this.removeClaimedDiscard(state.pending);
    const settlement: MahjongSettlement = {
      winnerSeat: seat,
      winnerNickname: player.nickname,
      type: winningTile ? 'discard-win' : 'self-draw',
      winPattern,
      isCardang,
      isBaoZhongBao,
      ...(onDiscard ? { discarderWasListening: state.pending!.discarderWasListening } : {}),
      ...(winningTile ? { payingSeat: state.pending!.seat, winningTile } : {}),
    };
    state.pending = null;
    state.currentTurn = null;
    state.awaitingDiscard = false;
    state.autoDiscardAt = null;
    const announceAt = this.now() + WIN_ANNOUNCE_DELAY_MS;
    state.pendingWin = {
      settlement,
      announceAt,
      settleAt: announceAt + WIN_EFFECT_DURATION_MS,
      announced: false,
    };
    state.version += 1;
  }

  private claim(seat: MahjongSeat, action: 'chi' | 'peng' | 'exposed-kong', payload: { readonly tileIds?: readonly string[]; readonly discardTileId?: string }): void {
    const state = this.requirePlaying();
    if (state.pendingListen) throw new MahjongRoomServiceError('INVALID_ACTION', '等待出牌玩家确认是否听牌');
    if (!state.pending || !state.pending.options[seat]?.includes(action)) throw new MahjongRoomServiceError('INVALID_ACTION', '当前不能执行该操作');
    const resolution = this.claimPriority(state.pending);
    if (resolution.seat !== seat || !resolution.actions.includes(action)) throw new MahjongRoomServiceError('CLAIM_PRIORITY', '有更靠前或优先级更高的玩家正在响应');
    const player = this.requirePlayer(seat);
    if (player.melds.length >= 3) throw new MahjongRoomServiceError('SINGLE_TILE_WAIT', '不能吃碰杠到只剩一张手牌');
    const pending = state.pending;
    const discard = pending.tile;
    let usedTiles: MahjongTile[];
    let chiRequiresListen = false;
    if (action === 'chi') {
      const requested = payload.tileIds ?? [];
      const option = this.chiPlans(player, discard, pending.seat)
        .find((plan) => requested.length === 2 && plan.tiles.every((tile) => requested.includes(tile.id)));
      if (!option) throw new MahjongRoomServiceError('INVALID_ACTION', '没有合法的吃牌组合');
      usedTiles = option.tiles;
      chiRequiresListen = option.requiresListen;
    } else {
      const count = action === 'exposed-kong' ? 3 : 2;
      usedTiles = findTilesByKey(player.hand, tileKey(discard), count);
      if (usedTiles.length !== count) throw new MahjongRoomServiceError('INVALID_ACTION', '手牌数量不足');
    }
    this.removeClaimedDiscard(pending);
    player.hand = removeTileIds(player.hand, usedTiles.map((tile) => tile.id));
    const meldKind: MahjongMeldKind = action === 'chi' ? 'chi' : action === 'peng' ? 'peng' : 'exposed-kong';
    player.melds.push({ kind: meldKind, tiles: sortMahjongTiles([discard, ...usedTiles]) });
    player.mustListenAfterChi = chiRequiresListen;
    this.refreshListenerBao();
    state.pending = null;
    state.lastDiscard = null;
    state.currentTurn = seat;
    state.awaitingDiscard = true;
    state.autoDiscardAt = null;
    if (action === 'exposed-kong') this.drawKongReplacement(player);
    else player.lastDrawnTileId = null;
    state.version += 1;
  }

  private removeClaimedDiscard(pending: PendingResponses): void {
    const source = this.state?.players[pending.seat];
    if (source) source.discards = source.discards.filter((tile) => tile.id !== pending.tile.id);
    if (this.state) this.state.discardRiver = this.state.discardRiver.filter((discard) => discard.tile.id !== pending.tile.id);
  }

  private concealedKong(seat: MahjongSeat, tileIds?: readonly string[]): void {
    const state = this.requirePlaying();
    if (state.pending || state.currentTurn !== seat || !state.awaitingDiscard) throw new MahjongRoomServiceError('INVALID_ACTION', '当前不能暗杠');
    const player = this.requirePlayer(seat);
    if (player.isListening) throw new MahjongRoomServiceError('LISTEN_LOCKED', '听牌后不能暗杠');
    if (player.melds.length >= 3) throw new MahjongRoomServiceError('SINGLE_TILE_WAIT', '不能暗杠到只剩一张手牌');
    const selected = tileIds?.length === 4 ? tileIds.map((id) => player.hand.find((tile) => tile.id === id)).filter((tile): tile is MahjongTile => Boolean(tile)) : [];
    const tile = selected[0] ?? player.hand.find((candidate) => matchingTileCount(player.hand, candidate) === 4);
    if (!tile || matchingTileCount(player.hand, tile) !== 4) throw new MahjongRoomServiceError('INVALID_ACTION', '没有可以暗杠的牌');
    const tiles = findTilesByKey(player.hand, tileKey(tile), 4);
    player.hand = removeTileIds(player.hand, tiles.map((candidate) => candidate.id));
    player.melds.push({ kind: 'concealed-kong', tiles: sortMahjongTiles(tiles) });
    this.drawKongReplacement(player);
    state.version += 1;
  }

  private addedKong(seat: MahjongSeat, tileId: string): void {
    const state = this.requirePlaying();
    if (state.pending || state.currentTurn !== seat || !state.awaitingDiscard) throw new MahjongRoomServiceError('INVALID_ACTION', '当前不能补杠');
    const player = this.requirePlayer(seat);
    if (player.isListening) throw new MahjongRoomServiceError('LISTEN_LOCKED', '听牌后不能补杠');
    const tile = player.hand.find((candidate) => candidate.id === tileId);
    const meldIndex = tile ? player.melds.findIndex((candidate) => candidate.kind === 'peng' && tileKey(candidate.tiles[0]!) === tileKey(tile)) : -1;
    const meld = meldIndex >= 0 ? player.melds[meldIndex] : undefined;
    if (!tile || !meld) throw new MahjongRoomServiceError('INVALID_ACTION', '没有可以补杠的碰牌');
    player.hand = removeTileIds(player.hand, [tile.id]);
    player.melds[meldIndex] = { kind: 'added-kong', tiles: sortMahjongTiles([...meld.tiles, tile]) };
    this.drawKongReplacement(player);
    state.version += 1;
  }

  private createPending(seat: MahjongSeat, tile: MahjongTile, baoSeatsBeforeDiscard: ReadonlySet<MahjongSeat>, discarderWasListening: boolean): PendingResponses | null {
    const options: Partial<Record<MahjongSeat, MahjongAction[]>> = {};
    for (const candidate of MAHJONG_SEATS) {
      if (candidate === seat) continue;
      const player = this.state?.players[candidate];
      if (!player) continue;
      const actions: MahjongAction[] = [];
      const structuralWait = player.listenWaits.some((wait) => tileKey(wait) === tileKey(tile))
        && isWinningMahjongHand([...player.hand, tile], player.melds.length);
      const isBaoTile = baoSeatsBeforeDiscard.has(candidate)
        || Boolean(player.listenBao && tileKey(player.listenBao) === tileKey(tile));
      if (player.isListening && player.melds.length < 4 && player.hand.length >= 4
        && hasMahjongPairStructure(player.hand, player.melds)
        && hasMahjongSequence(player.hand, player.melds) && structuralWait && !isBaoTile) actions.push('hu');
      if (!player.isListening && player.melds.length < 3 && matchingTileCount(player.hand, tile) >= 3) actions.push('exposed-kong');
      else if (!player.isListening && player.melds.length < 3 && matchingTileCount(player.hand, tile) >= 2) actions.push('peng');
      if (!player.isListening && this.chiPlans(player, tile, seat).length > 0) actions.push('chi');
      if (actions.length > 0) options[candidate] = actions;
    }
    return Object.keys(options).length > 0 ? { seat, tile, discarderWasListening, options, passed: [] } : null;
  }

  private advanceAfterNoResponse(): void {
    const state = this.requirePlaying();
    const lastSeat = state.pending?.seat ?? state.lastDiscard?.seat ?? state.currentTurn!;
    state.pending = null;
    const next = nextMahjongSeat(lastSeat);
    state.currentTurn = next;
    state.awaitingDiscard = true;
    const player = this.requirePlayer(next);
    this.drawFromWall(player);
    state.version += 1;
  }

  private drawFromWall(player: MahjongPlayer): void {
    if (!this.state) return;
    if (this.state.wall.length + this.state.replacementWall.length <= FLOW_WALL_THRESHOLD) {
      this.settle({ winnerSeat: null, type: 'draw' });
      return;
    }
    const tile = this.state.wall.shift();
    if (!tile) {
      this.settle({ winnerSeat: null, type: 'draw' });
      return;
    }
    this.state.wallPositions.shift();
    player.hand.push(tile);
    player.hand = sortMahjongTiles(player.hand);
    player.lastDrawnTileId = tile.id;
    this.refreshListenerBao();
    this.state.autoDiscardAt = player.isListening && !this.canSelfDrawHu(player, tile)
      ? this.now() + LISTENING_DISCARD_DELAY_MS
      : null;
  }

  private drawKongReplacement(player: MahjongPlayer): void {
    if (!this.state) return;
    if (this.state.wall.length + this.state.replacementWall.length <= FLOW_WALL_THRESHOLD) {
      this.settle({ winnerSeat: null, type: 'draw' });
      return;
    }
    const tile = this.state.replacementWall.pop();
    if (!tile) {
      this.settle({ winnerSeat: null, type: 'draw' });
      return;
    }
    this.state.replacementPositions.pop();
    player.hand.push(tile);
    player.hand = sortMahjongTiles(player.hand);
    player.lastDrawnTileId = tile.id;
    this.refreshListenerBao();
    this.state.autoDiscardAt = player.isListening && !this.canSelfDrawHu(player, tile)
      ? this.now() + LISTENING_DISCARD_DELAY_MS
      : null;
  }

  private availableActions(player: MahjongPlayer): MahjongAction[] {
    const state = this.state;
    if (!state || state.phase !== 'playing' || state.pendingWin) return [];
    if (state.pendingListen) return state.pendingListen.seat === player.seat ? ['listen', 'pass'] : [];
    if (state.pending) {
      if (!state.pending.options[player.seat]) return [];
      const priority = this.claimPriority(state.pending);
      return priority.seat === player.seat ? [...priority.actions, 'pass'] : [];
    }
    if (state.currentTurn !== player.seat || !state.awaitingDiscard) return [];
    if (player.isListening) {
      const drawnTile = player.lastDrawnTileId ? player.hand.find((tile) => tile.id === player.lastDrawnTileId) : undefined;
      return drawnTile && this.canSelfDrawHu(player, drawnTile) ? ['hu', 'pass'] : [];
    }
    const actions: MahjongAction[] = player.mustListenAfterChi ? [] : ['discard'];
    {
      if (this.canDeclareListen(player)) actions.push('listen');
      if (player.melds.length < 3 && player.hand.some((tile) => matchingTileCount(player.hand, tile) === 4)) actions.push('concealed-kong');
      if (player.hand.some((tile) => player.melds.some((meld) => meld.kind === 'peng' && tileKey(meld.tiles[0]!) === tileKey(tile)))) actions.push('added-kong');
    }
    return actions;
  }

  private baoForPlayer(player: MahjongPlayer, playerHand: readonly MahjongTile[] = player.hand): MahjongTile | null {
    const state = this.state;
    if (!state) return null;
    const visibleTiles = Object.values(state.players).flatMap((candidate) => candidate
      ? [...candidate.discards, ...candidate.melds.flatMap((meld) => meld.kind !== 'concealed-kong' || candidate.seat === player.seat ? meld.tiles : [])]
      : []);
    const knownTiles = [...visibleTiles, ...playerHand];
    for (let index = state.replacementWall.length - 1; index >= 0; index -= 1) {
      const candidate = state.replacementWall[index]!;
      const visibleCopies = knownTiles.filter((tile) => tileKey(tile) === tileKey(candidate)).length;
      if (visibleCopies < 3) return candidate;
    }
    return null;
  }

  private baoSeatsFor(tile: MahjongTile): Set<MahjongSeat> {
    // Keep the pre-discard bao identity: revealing this tile may rotate bao immediately.
    return new Set(MAHJONG_SEATS.filter((seat) => {
      const bao = this.state?.players[seat]?.listenBao;
      return bao && tileKey(bao) === tileKey(tile);
    }));
  }

  private refreshListenerBao(): void {
    if (!this.state) return;
    for (const player of Object.values(this.state.players)) {
      if (player?.isListening) player.listenBao = this.baoForPlayer(player);
    }
  }

  private validListenWaits(hand: MahjongTile[], meldCount: number, melds: readonly MahjongMeld[]): MahjongTile[] {
    if (meldCount >= 4 || hand.length < 4 || !hasMahjongPairStructure(hand, melds) || !hasMahjongSequence(hand, melds)) return [];
    return mahjongWaits(hand, meldCount, melds)
      .filter((tile) => hasMahjongListenYao(hand, tile, melds));
  }

  private listenDiscardOptions(player: MahjongPlayer): MahjongTile[] {
    return this.listenPreviews(player)
      .map((option) => player.hand.find((tile) => tile.id === option.discardTileId))
      .filter((tile): tile is MahjongTile => Boolean(tile));
  }

  private listenPreviews(player: MahjongPlayer): NonNullable<MahjongPrivateSnapshot['listenOptions']> {
    if (!this.state || player.isListening || !player.melds.some((meld) => meld.kind !== 'concealed-kong')) return [];
    return player.hand.flatMap((discard) => {
      const remaining = player.hand.filter((tile) => tile.id !== discard.id);
      const waits = this.validListenWaits(remaining, player.melds.length, player.melds);
      if (waits.length === 0) return [];
      return [{ discardTileId: discard.id, waits }];
    });
  }

  private canDeclareListen(player: MahjongPlayer): boolean {
    return !player.isListening
      && player.melds.some((meld) => meld.kind !== 'concealed-kong')
      && this.listenDiscardOptions(player).length > 0;
  }

  private chiPlans(player: MahjongPlayer, discard: MahjongTile, fromSeat: MahjongSeat): Array<{ tiles: MahjongTile[]; requiresListen: boolean }> {
    if (player.melds.length >= 3) return [];
    const options = findChiOptions(player.hand, discard);
    if (nextMahjongSeat(fromSeat) === player.seat) return options.map((tiles) => ({ tiles, requiresListen: false }));
    if (!this.state || player.isListening) return [];
    const plans: Array<{ tiles: MahjongTile[]; requiresListen: boolean }> = [];
    for (const tiles of options) {
      const afterClaim = player.hand.filter((tile) => !tiles.some((used) => used.id === tile.id));
      const melds: MahjongMeld[] = [...player.melds, { kind: 'chi', tiles: sortMahjongTiles([discard, ...tiles]) }];
      const canListenAfterClaim = afterClaim.some((discardTile) => {
        const afterDiscard = afterClaim.filter((tile) => tile.id !== discardTile.id);
        return this.validListenWaits(afterDiscard, melds.length, melds).length > 0;
      });
      if (canListenAfterClaim) plans.push({ tiles, requiresListen: true });
    }
    return plans;
  }

  private privateChiOptions(player: MahjongPlayer, pending: PendingResponses): string[][] {
    return this.chiPlans(player, pending.tile, pending.seat).map((plan) => plan.tiles.map((tile) => tile.id));
  }

  private actionPriority(action: MahjongAction, seat: MahjongSeat, fromSeat: MahjongSeat): number {
    if (action === 'hu') return 3;
    if (action === 'peng' || action === 'exposed-kong') return 2;
    if (action === 'chi') return seat === nextMahjongSeat(fromSeat) ? 1 : 1.5;
    return 0;
  }

  private claimPriority(pending: PendingResponses): { seat: MahjongSeat | null; actions: MahjongAction[] } {
    const waitingSeats = Object.keys(pending.options)
      .map((seat) => seat as MahjongSeat)
      .filter((seat) => !pending.passed.includes(seat));
    const bestPriority = Math.max(0, ...waitingSeats.flatMap((seat) => (pending.options[seat] ?? []).map((action) => this.actionPriority(action, seat, pending.seat))));
    if (bestPriority === 0) return { seat: null, actions: [] };
    const orderedSeats: MahjongSeat[] = [];
    let current = nextMahjongSeat(pending.seat);
    for (let index = 0; index < 3; index += 1) {
      orderedSeats.push(current);
      current = nextMahjongSeat(current);
    }
    const seat = orderedSeats.find((candidate) => waitingSeats.includes(candidate)
      && (pending.options[candidate] ?? []).some((action) => this.actionPriority(action, candidate, pending.seat) === bestPriority)) ?? null;
    return {
      seat,
      actions: seat ? (pending.options[seat] ?? []).filter((action) => this.actionPriority(action, seat, pending.seat) === bestPriority) : [],
    };
  }

  private canSelfDrawHu(player: MahjongPlayer, tile: MahjongTile): boolean {
    return player.isListening
      && player.melds.length < 4
      && player.hand.filter((handTile) => handTile.id !== tile.id).length >= 4
      && hasMahjongPairStructure(player.hand.filter((handTile) => handTile.id !== tile.id), player.melds)
      && hasMahjongSequence(player.hand.filter((handTile) => handTile.id !== tile.id), player.melds)
      && (
        player.listenWaits.some((wait) => tileKey(wait) === tileKey(tile))
        || isBigWindWin(player.hand.filter((handTile) => handTile.id !== tile.id), tile, player.melds)
        || Boolean(player.listenBao && tileKey(player.listenBao) === tileKey(tile))
      );
  }

  private settle(settlement: MahjongSettlement): void {
    if (!this.state) return;
    const baseScore = 5;
    const payments: Partial<Record<MahjongSeat, number>> = {};
    const transfers: Array<{ from: MahjongSeat; to: MahjongSeat; fan: number; amount: number }> = [];
    const transfer = (from: MahjongSeat, to: MahjongSeat, fan: number) => {
      const amount = fan * baseScore;
      transfers.push({ from, to, fan, amount });
      payments[from] = (payments[from] ?? 0) - amount;
      payments[to] = (payments[to] ?? 0) + amount;
    };
    const specialWin = settlement.winPattern === 'bao' || settlement.winPattern === 'big-wind';
    const fanFor = (seat: MahjongSeat, onDiscard: boolean): number => {
      if (settlement.isBaoZhongBao) return 12;
      const player = this.state!.players[seat];
      const closed = player ? player.melds.every((meld) => meld.kind === 'concealed-kong') : false;
      let fan = specialWin ? 3 : closed ? 3 : onDiscard ? 1 : 2;
      if (settlement.isCardang) fan *= 2;
      return fan;
    };
    if (settlement.winnerSeat && settlement.type === 'discard-win' && settlement.payingSeat) {
      const losers = MAHJONG_SEATS.filter((seat) => seat !== settlement.winnerSeat);
      const discarderListening = settlement.discarderWasListening ?? this.state.players[settlement.payingSeat]?.isListening ?? false;
      if (discarderListening) {
        for (const seat of losers) transfer(seat, settlement.winnerSeat, fanFor(seat, true));
      } else {
        const fan = losers.reduce((sum, seat) => sum + (seat === settlement.payingSeat ? 3 * (settlement.isCardang ? 2 : 1) : fanFor(seat, true)), 0);
        transfer(settlement.payingSeat, settlement.winnerSeat, fan);
      }
    } else if (settlement.winnerSeat && settlement.type === 'self-draw') {
      for (const seat of MAHJONG_SEATS) {
        if (seat === settlement.winnerSeat) continue;
        transfer(seat, settlement.winnerSeat, fanFor(seat, false));
      }
    }
    for (const [seat, delta] of Object.entries(payments) as [MahjongSeat, number][]) {
      const player = this.state.players[seat];
      if (player) player.score += delta;
    }
    this.state.phase = 'settled';
    this.state.version += 1;
    this.state.currentTurn = null;
    this.state.awaitingDiscard = false;
    this.state.autoDiscardAt = null;
    this.state.nextHandAt = settlement.type === 'draw' ? this.now() + DRAW_RESTART_DELAY_MS : null;
    this.state.pending = null;
    this.state.pendingListen = null;
    this.state.pendingWin = null;
    this.state.settlement = { ...settlement, baseScore, payments, transfers };
  }

  private returnToLobby(): void {
    if (!this.state) return;
    const keepDealer = this.state.settlement?.type === 'draw'
      || this.state.settlement?.winnerSeat === this.state.dealerSeat;
    this.state.phase = 'lobby';
    this.state.version += 1;
    this.state.currentTurn = null;
    this.state.awaitingDiscard = false;
    this.state.wall = [];
    this.state.replacementWall = [];
    this.state.wallPositions = [];
    this.state.replacementPositions = [];
    this.state.wallBreakSide = null;
    this.state.replacementWallSide = null;
    this.state.wallBreakStack = null;
    this.state.diceRoll = null;
    this.state.autoDiscardAt = null;
    this.state.nextHandAt = null;
    this.state.pending = null;
    this.state.pendingListen = null;
    this.state.pendingWin = null;
    this.state.lastDiscard = null;
    this.state.settlement = null;
    if (!keepDealer) this.state.dealerSeat = nextMahjongSeat(this.state.dealerSeat);
    for (const player of Object.values(this.state.players)) {
      if (player) {
        player.hand = [];
        player.melds = [];
        player.discards = [];
        player.isListening = false;
        player.mustListenAfterChi = false;
        player.listenWaits = [];
        player.listenBao = null;
        player.lastDrawnTileId = null;
      }
    }
  }

  private joinSpectator(sessionToken: string, nickname: string): MahjongSnapshot {
    if (this.sessions.listSpectators().filter((viewer) => !viewer.mahjongSeat).length >= MAX_SPECTATORS) throw new MahjongRoomServiceError('SPECTATORS_FULL', '观战位已满');
    this.sessions.setIdentity(sessionToken, 'spectator', nickname);
    this.sessions.touch(sessionToken, this.now());
    return this.getSnapshot(sessionToken);
  }

  private addPlayer(seat: MahjongSeat, session: Session, nickname: string): void {
    if (!this.state) throw new MahjongRoomServiceError('ROOM_NOT_FOUND', '麻将房间不存在');
    this.state.players[seat] = {
      id: session.playerId, seat, nickname, connected: true, score: 1000,
      isListening: false, mustListenAfterChi: false, listenWaits: [], listenBao: null, lastDrawnTileId: null,
      hand: [], melds: [], discards: [],
    };
    this.sessions.setMahjongSeat(session.sessionToken, seat);
  }

  private removeSeat(seat: MahjongSeat): void {
    if (!this.state || !this.state.players[seat]) return;
    const player = this.state.players[seat]!;
    this.state.players[seat] = null;
    this.sessions.clearMahjongSeatForPlayer(player.id);
    if (player.id === this.state.hostId) this.state.hostId = Object.values(this.state.players).find((candidate) => candidate !== null)?.id ?? '';
    this.state.version += 1;
    if (Object.values(this.state.players).every((candidate) => candidate === null)) {
      this.state = null;
      this.chatMessages = [];
    }
  }

  private requirePlaying(): MahjongState {
    if (!this.state || this.state.phase !== 'playing') throw new MahjongRoomServiceError('INVALID_PHASE', '当前不在牌局中');
    return this.state;
  }

  private requirePlayer(seat: MahjongSeat): MahjongPlayer {
    const player = this.state?.players[seat];
    if (!player) throw new MahjongRoomServiceError('NOT_SEATED', '玩家尚未入座');
    return player;
  }

  private assertHost(session: Session): void {
    if (!this.state || session.playerId !== this.state.hostId) throw new MahjongRoomServiceError('NOT_HOST', '只有房主可以操作');
  }

  private emptyState(roomId: string, hostId: string): MahjongState {
    return {
      roomId,
      hostId,
      phase: 'lobby',
      handNumber: 0,
      version: 0,
      players: { A: null, B: null, C: null, D: null },
      dealerSeat: 'A',
      currentTurn: null,
      awaitingDiscard: false,
      wall: [],
      replacementWall: [],
      wallPositions: [],
      replacementPositions: [],
      wallBreakSide: null,
      replacementWallSide: null,
      wallBreakStack: null,
      diceRoll: null,
      autoDiscardAt: null,
      nextHandAt: null,
      pending: null,
      pendingListen: null,
      pendingWin: null,
      lastDiscard: null,
      discardRiver: [],
      settlement: null,
    };
  }

  private emptyPublicSnapshot(): MahjongPublicSnapshot {
    return {
      gameId: 'mahjong', roomId: 'mahjong', phase: 'lobby', handNumber: 0, version: 0, players: [], spectators: [], chat: [],
      hostSeat: null, dealerSeat: null, currentTurn: null, awaitingDiscard: false, pendingDiscard: null, responseSeats: [], wallCount: 0,
      wallLayout: { breakSide: null, replacementSide: null, breakStack: null, sides: MAHJONG_SEATS.map((seat) => ({ seat, liveTiles: 0, replacementTiles: 0, stacks: [] })) }, diceRoll: null,
      lastDiscard: null, discardRiver: [], settlement: null,
    };
  }

  private emptyPrivateSnapshot(session: Session): MahjongPrivateSnapshot {
    return { seat: session.mahjongSeat, hand: [], availableActions: [], spectator: session.role === 'spectator' };
  }

  private clearChatIfEmpty(): void {
    if (!this.state || Object.values(this.state.players).every((player) => player === null)) this.chatMessages = [];
  }
}
