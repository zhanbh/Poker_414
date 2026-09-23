import {
  TexasCommandEnvelope,
  TexasCommandType,
  TexasSnapshot,
  TexasPublicSnapshot,
  TexasSettlement,
  TexasHandView,
  TexasPlayerView,
  RoomChatMessage,
  RoomChatPayload,
} from '../../shared/src/protocol';
import {
  compareTexasHands,
  createTexasDeck,
  evaluateTexasHand,
  texasHandCategoryLabel,
  TEXAS_BIG_BLIND,
  TEXAS_SEATS,
  TEXAS_SMALL_BLIND,
  TEXAS_STARTING_STACK,
  TexasCard,
  TexasHandValue,
  TexasSeat,
} from '../../shared/src/texas';
import { appendRoomChatMessage, createRoomChatMessage } from './room-chat';
import { Session, SessionService } from './session-service';

export interface TexasRoomServiceOptions {
  readonly inviteCode: string;
  readonly now?: () => number;
  readonly random?: () => number;
}

export interface TexasAuthResult {
  readonly sessionToken: string;
  readonly playerId: string;
}

export interface TexasCommandSuccess {
  readonly ok: true;
  readonly snapshot: TexasSnapshot;
}

export class TexasRoomServiceError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'TexasRoomServiceError';
    this.code = code;
  }
}

type TexasPhase = TexasPublicSnapshot['phase'];

interface TexasPlayer {
  readonly id: string;
  readonly seat: TexasSeat;
  nickname: string;
  connected: boolean;
  stack: number;
  totalBet: number;
  roundBet: number;
  holeCards: TexasCard[];
  folded: boolean;
  allIn: boolean;
}

interface TexasState {
  roomId: string;
  hostId: string;
  phase: TexasPhase;
  handNumber: number;
  version: number;
  players: Record<TexasSeat, TexasPlayer | null>;
  dealerSeat: TexasSeat | null;
  smallBlindSeat: TexasSeat | null;
  bigBlindSeat: TexasSeat | null;
  currentTurn: TexasSeat | null;
  community: TexasCard[];
  deck: TexasCard[];
  pot: number;
  currentBet: number;
  minRaise: number;
  actedSeats: TexasSeat[];
  settlement: TexasSettlement | null;
}

const MAX_SPECTATORS = 4;

export class TexasRoomService {
  readonly sessions = new SessionService();
  private readonly inviteCode: string;
  private readonly now: () => number;
  private readonly random: () => number;
  private state: TexasState | null = null;
  private readonly requestResults = new Map<string, Map<string, TexasCommandSuccess>>();
  private readonly waitingSessionTokens = new Set<string>();
  private chatMessages: RoomChatMessage[] = [];

  constructor(options: TexasRoomServiceOptions) {
    this.inviteCode = options.inviteCode;
    this.now = options.now ?? (() => Date.now());
    this.random = options.random ?? Math.random;
  }

  login(inviteCode: string): TexasAuthResult {
    if (inviteCode !== this.inviteCode) throw new TexasRoomServiceError('INVALID_INVITE', '邀请码错误');
    const session = this.sessions.create(this.now());
    return { sessionToken: session.sessionToken, playerId: session.playerId };
  }

  resume(sessionToken: string): TexasAuthResult {
    const session = this.sessions.get(sessionToken);
    return { sessionToken: session.sessionToken, playerId: session.playerId };
  }

  join(sessionToken: string, nickname: string, roomId: string): TexasSnapshot {
    const session = this.sessions.get(sessionToken);
    if (roomId !== 'texas') throw new TexasRoomServiceError('ROOM_NOT_FOUND', '德州扑克房间不存在');
    if (!nickname.trim()) throw new TexasRoomServiceError('INVALID_NICKNAME', '昵称不能为空');
    if (session.texasSeat || session.role === 'spectator') return this.getSnapshot(sessionToken);

    if (!this.state) {
      this.state = this.emptyState(roomId, session.playerId);
    }
    if (this.state.phase === 'lobby') {
      this.pruneDisconnectedLobbyPlayers();
      if (!this.state) {
        this.state = this.emptyState(roomId, session.playerId);
      }
    }
    if (Object.values(this.state.players).some((player) => player?.nickname === nickname.trim())) {
      throw new TexasRoomServiceError('NICKNAME_EXISTS', '昵称已经被使用，请更换昵称');
    }
    if (this.state.phase !== 'lobby') {
      const seat = this.randomOpenSeat();
      if (seat) {
        this.addPlayer(seat, session, nickname.trim());
        this.waitingSessionTokens.add(sessionToken);
        this.sessions.setIdentity(sessionToken, 'spectator', nickname.trim());
        this.state.version += 1;
        return this.getSnapshot(sessionToken);
      }
      if (!this.waitingSessionTokens.has(sessionToken) && this.sessions.listSpectators().filter((viewer) => !viewer.texasSeat).length >= MAX_SPECTATORS) {
        throw new TexasRoomServiceError('SPECTATORS_FULL', '观战位已满');
      }
      this.waitingSessionTokens.add(sessionToken);
      this.sessions.setIdentity(sessionToken, 'spectator', nickname.trim());
      return this.getSnapshot(sessionToken);
    }
    const seat = this.randomOpenSeat();
    if (!seat) {
      if (this.sessions.listSpectators().filter((viewer) => !viewer.texasSeat).length >= MAX_SPECTATORS) {
        throw new TexasRoomServiceError('SPECTATORS_FULL', '观战位已满');
      }
      this.sessions.setIdentity(sessionToken, 'spectator', nickname.trim());
      return this.getSnapshot(sessionToken);
    }
    this.addPlayer(seat, session, nickname.trim());
    this.sessions.setIdentity(sessionToken, 'player', nickname.trim());
    this.sessions.touch(sessionToken, this.now());
    this.state.version += 1;
    return this.getSnapshot(sessionToken);
  }

  private bestHand(player: TexasPlayer, community: readonly TexasCard[]): TexasHandView | undefined {
    if (player.holeCards.length + community.length < 5) return undefined;
    const value = evaluateTexasHand([...player.holeCards, ...community]);
    return { category: value.category, label: texasHandCategoryLabel(value.category) };
  }
  getSnapshot(sessionToken: string): TexasSnapshot {
    const session = this.sessions.get(sessionToken);
    const state = this.state;
    if (!state) {
      return {
        public: this.emptyPublicSnapshot(),
        private: { seat: session.texasSeat, holeCards: [] },
      };
    }
    const positionLabels = this.positionLabels();
    const players = Object.values(state.players)
      .filter((player): player is TexasPlayer => player !== null)
      .map((player): TexasPlayerView => ({
        seat: player.seat,
        positionLabel: positionLabels.get(player.seat) ?? '等待入座',
        nickname: player.nickname,
        connected: player.connected,
        stack: player.stack,
        totalBet: player.totalBet,
        roundBet: player.roundBet,
        folded: player.folded,
        allIn: player.allIn,
        isHost: player.id === state.hostId,
        waiting: this.isWaitingPlayer(player.id),
      }));
    const publicSnapshot: TexasPublicSnapshot = {
      gameId: 'texas',
      roomId: state.roomId,
      phase: state.phase,
      handNumber: state.handNumber,
      version: state.version,
      players,
      chat: [...this.chatMessages],
      spectators: this.sessions.listSpectators().filter((viewer) => !viewer.texasSeat).map((viewer) => ({
        nickname: viewer.nickname ?? '观战者',
        connected: viewer.connectionId !== null,
        waiting: this.waitingSessionTokens.has(viewer.sessionToken),
      })),
      hostSeat: Object.values(state.players).find((player) => player?.id === state.hostId)?.seat ?? null,
      dealerSeat: state.dealerSeat,
      smallBlindSeat: state.smallBlindSeat,
      bigBlindSeat: state.bigBlindSeat,
      currentTurn: state.currentTurn,
      community: [...state.community],
      pot: state.pot,
      currentBet: state.currentBet,
      minRaise: state.minRaise,
      settlement: state.settlement,
    };
    const ownPlayer = session.texasSeat ? state.players[session.texasSeat] : null;
    const ownBestHand = ownPlayer ? this.bestHand(ownPlayer, state.community) : undefined;
    const spectatorHands = Object.values(state.players)
      .filter((player): player is TexasPlayer => player !== null && !this.isWaitingPlayer(player.id))
      .map((player) => ({
        seat: player.seat,
        positionLabel: positionLabels.get(player.seat) ?? '等待入座',
        nickname: player.nickname,
        hand: [...player.holeCards],
        bestHand: this.bestHand(player, state.community),
      }));
    return {
      public: publicSnapshot,
      private: {
        seat: session.texasSeat,
        holeCards: ownPlayer ? [...ownPlayer.holeCards] : [],
        ...(ownBestHand ? { bestHand: ownBestHand } : {}),
        waiting: this.waitingSessionTokens.has(sessionToken),
        spectator: session.role === 'spectator',
        ...(session.role === 'spectator' || state.phase === 'showdown' || state.phase === 'settled' ? { spectatorHands } : {}),
      },
    };
  }

  attach(sessionToken: string, connectionId: string): { previousConnectionId: string | null } {
    const attachment = this.sessions.attach(sessionToken, connectionId, this.now());
    const session = this.sessions.get(sessionToken);
    if (this.state && session.texasSeat && this.state.players[session.texasSeat]?.id === session.playerId) {
      this.state.players[session.texasSeat]!.connected = true;
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
    if (this.state && session.texasSeat && this.state.players[session.texasSeat]) {
      this.state.players[session.texasSeat]!.connected = false;
      this.state.version += 1;
    }
  }

  leave(sessionToken: string): void {
    const session = this.sessions.get(sessionToken);
    if (session.role === 'spectator') {
      this.waitingSessionTokens.delete(sessionToken);
      if (session.texasSeat) this.removeSeat(session.texasSeat);
      else this.sessions.clearIdentity(sessionToken);
      return;
    }
    if (!session.texasSeat) {
      this.sessions.clearIdentity(sessionToken);
      return;
    }
    if (!this.state || (this.state.phase !== 'lobby' && this.state.phase !== 'showdown' && this.state.phase !== 'settled')) {
      throw new TexasRoomServiceError('HAND_IN_PROGRESS', '牌局进行中不能退出玩家位，请等待本局结束');
    }
    this.removeSeat(session.texasSeat);
    this.sessions.clearIdentity(sessionToken);
  }

  recordChat(sessionToken: string, payload: RoomChatPayload): RoomChatMessage {
    if (!this.state) throw new TexasRoomServiceError('ROOM_NOT_FOUND', '房间尚未创建');
    this.sessions.touch(sessionToken, this.now());
    const message = createRoomChatMessage(this.sessions.get(sessionToken), payload);
    this.chatMessages = appendRoomChatMessage(this.chatMessages, message);
    return message;
  }
  scan(now = this.now()): boolean {
    let changed = false;
    if (this.state && (this.state.phase === 'lobby' || this.state.phase === 'showdown' || this.state.phase === 'settled')) {
      for (const player of Object.values(this.state.players)) {
        if (!player || !this.isExpiredPlayer(player.id, now)) continue;
        this.removeSeat(player.seat);
        changed = true;
        if (!this.state) break;
      }
    }
    for (const spectator of this.sessions.listSpectators()) {
      if (!this.sessions.isInactive(spectator.sessionToken, now)) continue;
      this.waitingSessionTokens.delete(spectator.sessionToken);
      if (spectator.texasSeat) this.removeSeat(spectator.texasSeat);
      else this.sessions.clearIdentity(spectator.sessionToken);
      changed = true;
    }
    return changed;
  }

  recordActivity(sessionToken: string): TexasSnapshot {
    this.sessions.touch(sessionToken, this.now());
    return this.getSnapshot(sessionToken);
  }

  dispatch(sessionToken: string, command: TexasCommandEnvelope): TexasCommandSuccess {
    const session = this.sessions.get(sessionToken);
    this.sessions.touch(sessionToken, this.now());
    const previous = this.requestResults.get(sessionToken)?.get(command.requestId);
    if (previous) return previous;
    if (!this.state) throw new TexasRoomServiceError('ROOM_NOT_FOUND', '房间尚未创建');
    if (command.handNumber !== this.state.handNumber) throw new TexasRoomServiceError('STALE_HAND', '牌局编号已过期，请刷新视图');
    if (command.stateVersion !== this.state.version) throw new TexasRoomServiceError('STALE_VERSION', '状态版本已过期，请刷新视图');
    if ((!session.texasSeat || session.role === 'spectator') && command.type !== 'remove-player') throw new TexasRoomServiceError('NOT_SEATED', '玩家尚未入座或正在等待下一局');

    this.applyCommand(session, command.type, command.payload);
    const result: TexasCommandSuccess = { ok: true, snapshot: this.getSnapshot(sessionToken) };
    if (!this.requestResults.has(sessionToken)) this.requestResults.set(sessionToken, new Map());
    this.requestResults.get(sessionToken)!.set(command.requestId, result);
    return result;
  }

  private applyCommand(session: Session, type: TexasCommandType, payload: TexasCommandEnvelope['payload']): void {
    if (!this.state) throw new TexasRoomServiceError('ROOM_NOT_FOUND', '房间尚未创建');
    const state = this.state;
    if (type === 'start-hand') {
      this.assertHost(session);
      this.startHand();
      return;
    }
    if (type === 'next-hand') {
      this.assertHost(session);
      if (state.phase !== 'settled') throw new TexasRoomServiceError('INVALID_PHASE', '本局尚未结算');
      for (const player of Object.values(state.players)) {
        if (player) {
          player.holeCards = [];
          player.totalBet = 0;
          player.roundBet = 0;
          player.folded = false;
          player.allIn = false;
        }
      }
      state.phase = 'lobby';
      state.community = [];
      state.pot = 0;
      state.currentBet = 0;
      state.currentTurn = null;
      state.settlement = null;
      this.promoteWaiting();
      state.version += 1;
      return;
    }
    if (type === 'remove-player') {
      if (!session.texasSeat) throw new TexasRoomServiceError('NOT_SEATED', '只有在座玩家可以踢人');
      if (state.phase !== 'lobby' && state.phase !== 'settled') throw new TexasRoomServiceError('INVALID_PHASE', '牌局进行中不能移除玩家');
      const target = (payload as { readonly seat: TexasSeat }).seat;
      if (target === session.texasSeat) throw new TexasRoomServiceError('CANNOT_REMOVE_SELF', '不能移除自己');
      const targetPlayer = state.players[target];
      if (!targetPlayer) throw new TexasRoomServiceError('PLAYER_NOT_FOUND', '该座位没有玩家');
      const isHost = session.playerId === state.hostId;
      if (!isHost && targetPlayer.connected) throw new TexasRoomServiceError('KICK_FORBIDDEN', '只能踢出已断线的玩家');
      this.removeSeat(target);
      return;
    }
    if (state.phase !== 'preflop' && state.phase !== 'flop' && state.phase !== 'turn' && state.phase !== 'river') {
      throw new TexasRoomServiceError('INVALID_PHASE', '当前不在下注阶段');
    }
    const player = session.texasSeat ? state.players[session.texasSeat] : null;
    if (!player || state.currentTurn !== player.seat) throw new TexasRoomServiceError('NOT_YOUR_TURN', '还没轮到你操作');
    switch (type) {
      case 'fold':
        player.folded = true;
        state.actedSeats.push(player.seat);
        break;
      case 'check':
        if (player.roundBet !== state.currentBet) throw new TexasRoomServiceError('CHECK_NOT_ALLOWED', '当前下注额不同时不能过牌');
        state.actedSeats.push(player.seat);
        break;
      case 'call':
        this.commit(player, Math.min(state.currentBet - player.roundBet, player.stack));
        state.actedSeats.push(player.seat);
        break;
      case 'bet': {
        const amount = this.amount(payload);
        if (state.currentBet !== 0 || amount < TEXAS_BIG_BLIND) throw new TexasRoomServiceError('INVALID_BET', '下注金额无效');
        this.commit(player, Math.min(amount, player.stack));
        state.currentBet = player.roundBet;
        state.minRaise = state.currentBet;
        state.actedSeats = [player.seat];
        break;
      }
      case 'raise': {
        const requested = this.amount(payload);
        const minimum = state.currentBet + state.minRaise;
        if (requested < minimum && requested < player.roundBet + player.stack) {
          throw new TexasRoomServiceError('INVALID_RAISE', '加注必须达到最小加注额');
        }
        const target = Math.min(requested, player.roundBet + player.stack);
        if (target <= state.currentBet) throw new TexasRoomServiceError('INVALID_RAISE', '加注金额必须高于当前下注');
        const previousBet = state.currentBet;
        this.commit(player, target - player.roundBet);
        state.currentBet = Math.max(state.currentBet, player.roundBet);
        state.minRaise = Math.max(TEXAS_BIG_BLIND, state.currentBet - previousBet);
        state.actedSeats = [player.seat];
        break;
      }
      case 'all-in': {
        const previousBet = state.currentBet;
        this.commit(player, player.stack);
        if (player.roundBet > state.currentBet) {
          state.currentBet = player.roundBet;
          state.minRaise = Math.max(state.minRaise, state.currentBet - previousBet);
          state.actedSeats = [player.seat];
        } else {
          state.actedSeats.push(player.seat);
        }
        break;
      }
      default:
        throw new TexasRoomServiceError('INVALID_COMMAND', '命令类型不支持');
    }
    this.syncPot(state);
    this.advanceAfterAction();
  }

  private startHand(): void {
    if (!this.state) throw new TexasRoomServiceError('ROOM_NOT_FOUND', '房间尚未创建');
    const state = this.state;
    const players = this.orderedPlayers();
    if (players.length < 2) throw new TexasRoomServiceError('NOT_ENOUGH_PLAYERS', '至少需要两名玩家才能开始');
    if (players.filter((player) => player.stack >= TEXAS_BIG_BLIND).length < 2) throw new TexasRoomServiceError('NO_CHIPS', '至少需要两名有筹码的玩家');
    const dealer = state.dealerSeat ? this.nextSeat(state.dealerSeat) : players[0].seat;
    const active = players.filter((player) => player.stack > 0);
    const dealerPlayer = active.find((player) => player.seat === dealer) ?? active[0];
    const dealerIndex = active.findIndex((player) => player.seat === dealerPlayer.seat);
    const smallBlind = active.length === 2 ? dealerPlayer : active[(dealerIndex + 1) % active.length];
    const bigBlind = active.length === 2 ? active[(dealerIndex + 1) % active.length] : active[(dealerIndex + 2) % active.length];
    const deck = createTexasDeck(this.random);
    for (const player of players) {
      player.holeCards = [];
      player.roundBet = 0;
      player.totalBet = 0;
      player.folded = false;
      player.allIn = false;
    }
    for (let cardIndex = 0; cardIndex < 2; cardIndex += 1) {
      for (const player of active) player.holeCards.push(deck.shift()!);
    }
    state.handNumber += 1;
    state.phase = 'preflop';
    state.dealerSeat = dealerPlayer.seat;
    state.smallBlindSeat = smallBlind.seat;
    state.bigBlindSeat = bigBlind.seat;
    state.community = [];
    state.deck = deck;
    state.pot = 0;
    state.currentBet = 0;
    state.minRaise = TEXAS_BIG_BLIND;
    state.actedSeats = [];
    state.settlement = null;
    this.commit(smallBlind, Math.min(TEXAS_SMALL_BLIND, smallBlind.stack));
    this.commit(bigBlind, Math.min(TEXAS_BIG_BLIND, bigBlind.stack));
    state.currentBet = Math.max(smallBlind.roundBet, bigBlind.roundBet);
    state.actedSeats = [];
    state.currentTurn = this.nextActionSeat(bigBlind.seat);
    this.syncPot(state);
    state.version += 1;
  }

  private advanceAfterAction(): void {
    if (!this.state) return;
    const state = this.state;
    const live = this.livePlayers();
    if (live.length === 1) {
      this.settle(live);
      return;
    }
    const actionable = live.filter((player) => !player.allIn);
    const roundComplete = actionable.length === 0
      || actionable.every((player) => player.roundBet === state.currentBet && state.actedSeats.includes(player.seat));
    if (roundComplete) {
      this.advanceStreet();
      return;
    }
    state.currentTurn = this.nextActionSeat(state.currentTurn ?? live[0].seat);
    state.version += 1;
  }

  private advanceStreet(): void {
    if (!this.state) return;
    const state = this.state;
    if (this.livePlayers().filter((player) => !player.allIn).length === 0) {
      while (state.community.length < 5) state.community.push(state.deck.shift()!);
      this.settle(this.livePlayers());
      return;
    }
    if (state.phase === 'preflop') {
      state.community.push(state.deck.shift()!, state.deck.shift()!, state.deck.shift()!);
      state.phase = 'flop';
    } else if (state.phase === 'flop') {
      state.community.push(state.deck.shift()!);
      state.phase = 'turn';
    } else if (state.phase === 'turn') {
      state.community.push(state.deck.shift()!);
      state.phase = 'river';
    } else {
      this.settle(this.livePlayers());
      return;
    }
    for (const player of Object.values(state.players)) if (player) player.roundBet = 0;
    state.currentBet = 0;
    state.minRaise = TEXAS_BIG_BLIND;
    state.actedSeats = [];
    state.currentTurn = this.nextActionSeat(state.dealerSeat ?? 'A');
    state.version += 1;
  }

  private settle(live: TexasPlayer[]): void {
    if (!this.state) return;
    const state = this.state;
    while (state.community.length < 5 && state.deck.length > 0) state.community.push(state.deck.shift()!);
    const values = new Map<TexasSeat, TexasHandValue>();
    for (const player of live) values.set(player.seat, evaluateTexasHand([...player.holeCards, ...state.community]));
    const best = live.map((player) => values.get(player.seat)!).sort((left, right) => compareTexasHands(right, left))[0];
    const winners = live.filter((player) => compareTexasHands(values.get(player.seat)!, best) === 0);
    const pot = state.pot;
    const share = Math.floor(pot / winners.length);
    let remainder = pot - share * winners.length;
    const payouts: Record<string, number> = {};
    const hands: Record<string, string> = {};
    for (const player of live) hands[player.seat] = values.get(player.seat)!.category;
    for (const winner of winners) {
      const payout = share + (remainder > 0 ? 1 : 0);
      remainder -= payout > share ? 1 : 0;
      winner.stack += payout;
      payouts[winner.seat] = payout;
    }
    for (const player of Object.values(state.players)) if (player) {
      player.totalBet = 0;
      player.roundBet = 0;
      player.allIn = false;
    }
    state.pot = 0;
    state.currentTurn = null;
    state.phase = 'settled';
    state.settlement = { winners: winners.map((player) => player.seat), payouts, hands };
    state.version += 1;
  }

  private commit(player: TexasPlayer, amount: number): void {
    const safeAmount = Math.max(0, Math.min(Math.floor(amount), player.stack));
    player.stack -= safeAmount;
    player.roundBet += safeAmount;
    player.totalBet += safeAmount;
    if (player.stack === 0) player.allIn = true;
  }

  private syncPot(state: TexasState): void {
    state.pot = Object.values(state.players).reduce((sum, player) => sum + (player?.totalBet ?? 0), 0);
  }

  private livePlayers(): TexasPlayer[] {
    return this.orderedPlayers().filter((player) => !this.isWaitingPlayer(player.id) && !player.folded);
  }

  private orderedPlayers(): TexasPlayer[] {
    if (!this.state) return [];
    return TEXAS_SEATS.map((seat) => this.state!.players[seat]).filter((player): player is TexasPlayer => player !== null);
  }

  private positionLabels(): ReadonlyMap<TexasSeat, string> {
    if (!this.state) return new Map();
    const state = this.state;
    const seatedPlayers = this.orderedPlayers().filter((player) => !this.isWaitingPlayer(player.id));

    // A player who joined during a hand has a seat, but no hole cards yet and
    // must not affect the position names for the current hand.
    const handPlayers = seatedPlayers.filter((player) => state.phase === 'lobby' || player.holeCards.length > 0);
    if (handPlayers.length === 0) return new Map();

    // In the lobby show the positions for the next hand so the seats are
    // understandable before the host presses "开始牌局".
    const dealerSeat = state.phase === 'lobby'
      ? (state.dealerSeat ? this.nextSeat(state.dealerSeat) : handPlayers[0].seat)
      : state.dealerSeat;
    const dealerIndex = handPlayers.findIndex((player) => player.seat === dealerSeat);
    const rotated = dealerIndex < 0
      ? handPlayers
      : [...handPlayers.slice(dealerIndex), ...handPlayers.slice(0, dealerIndex)];
    const namesByCount: Readonly<Record<number, readonly string[]>> = {
      2: ['按钮位/小盲 BTN/SB', '大盲 BB'],
      3: ['按钮位 BTN', '小盲 SB', '大盲 BB'],
      4: ['按钮位 BTN', '小盲 SB', '大盲 BB', '枪口位 UTG'],
      5: ['按钮位 BTN', '小盲 SB', '大盲 BB', '枪口位 UTG', '关煞位 CO'],
      6: ['按钮位 BTN', '小盲 SB', '大盲 BB', '枪口位 UTG', '劫持位 HJ', '关煞位 CO'],
      7: ['按钮位 BTN', '小盲 SB', '大盲 BB', '枪口位 UTG', '中位 MP', '劫持位 HJ', '关煞位 CO'],
      8: ['按钮位 BTN', '小盲 SB', '大盲 BB', '枪口位 UTG', '枪口+1 UTG+1', '中位 MP', '劫持位 HJ', '关煞位 CO'],
    };
    const names = namesByCount[rotated.length] ?? namesByCount[8];
    return new Map(rotated.map((player, index) => [player.seat, names[index] ?? `座位 ${index + 1}`] as const));
  }

  private nextSeat(seat: TexasSeat): TexasSeat {
    const index = TEXAS_SEATS.indexOf(seat);
    for (let offset = 1; offset <= TEXAS_SEATS.length; offset += 1) {
      const candidate = TEXAS_SEATS[(index + offset) % TEXAS_SEATS.length];
      if (this.state?.players[candidate]) return candidate;
    }
    return seat;
  }

  private nextActionSeat(after: TexasSeat): TexasSeat | null {
    const live = this.livePlayers().filter((player) => !player.allIn);
    if (live.length === 0) return null;
    let candidate = after;
    for (let offset = 0; offset < TEXAS_SEATS.length; offset += 1) {
      candidate = this.nextSeat(candidate);
      const player = this.state?.players[candidate];
      if (player && !player.folded && !player.allIn) return candidate;
    }
    return live[0].seat;
  }

  private amount(payload: TexasCommandEnvelope['payload']): number {
    const amount = (payload as { readonly amount?: unknown }).amount;
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      throw new TexasRoomServiceError('INVALID_AMOUNT', '下注金额无效');
    }
    return Math.floor(amount);
  }

  private assertHost(session: Session): void {
    if (!this.state || session.playerId !== this.state.hostId) throw new TexasRoomServiceError('NOT_HOST', '只有房主可以操作');
  }

  private pruneDisconnectedLobbyPlayers(now = this.now()): void {
    if (!this.state || this.state.phase !== 'lobby') return;
    for (const player of Object.values(this.state.players)) {
      if (!this.state) break;
      if (player && this.isExpiredPlayer(player.id, now)) this.removeSeat(player.seat);
    }
  }

  private isExpiredPlayer(playerId: string, now: number): boolean {
    const session = this.sessions.findByPlayerId(playerId);
    if (!session) return false;
    if (session.connectionId === null && session.disconnectedAt === null) return false;
    return this.sessions.isInactive(session.sessionToken, now);
  }

  private addPlayer(seat: TexasSeat, session: Session, nickname: string): void {
    if (!this.state) throw new TexasRoomServiceError('ROOM_NOT_FOUND', '房间尚未创建');
    this.state.players[seat] = {
      id: session.playerId,
      seat,
      nickname,
      connected: true,
      stack: TEXAS_STARTING_STACK,
      totalBet: 0,
      roundBet: 0,
      holeCards: [],
      folded: false,
      allIn: false,
    };
    this.sessions.setTexasSeat(session.sessionToken, seat);
  }

  private isWaitingPlayer(playerId: string): boolean {
    const session = this.sessions.findByPlayerId(playerId);
    return Boolean(session && this.waitingSessionTokens.has(session.sessionToken));
  }

  private randomOpenSeat(): TexasSeat | null {
    if (!this.state) return null;
    const openSeats = TEXAS_SEATS.filter((candidate) => this.state?.players[candidate] === null);
    if (openSeats.length === 0) return null;
    const index = Math.min(openSeats.length - 1, Math.max(0, Math.floor(this.random() * openSeats.length)));
    return openSeats[index];
  }

  private removeSeat(seat: TexasSeat): void {
    if (!this.state || !this.state.players[seat]) return;
    const target = this.state.players[seat]!;
    const targetSession = this.sessions.findByPlayerId(target.id);
    if (targetSession) this.waitingSessionTokens.delete(targetSession.sessionToken);
    this.state.players[seat] = null;
    this.sessions.clearTexasSeatForPlayer(target.id);
    if (target.id === this.state.hostId) {
      this.state.hostId = this.orderedPlayers()[0]?.id ?? '';
    }
    if (this.orderedPlayers().length === 0) {
      this.state = null;
      this.chatMessages = [];
    }
    else if (this.state) this.state.version += 1;
  }

  private promoteWaiting(): void {
    if (!this.state) return;
    for (const sessionToken of [...this.waitingSessionTokens]) {
      const session = this.sessions.get(sessionToken);
      if (session.texasSeat) {
        this.waitingSessionTokens.delete(sessionToken);
        this.sessions.setIdentity(sessionToken, 'player', session.nickname?.trim() ?? '玩家');
        continue;
      }
      const seat = this.randomOpenSeat();
      if (!seat) break;
      const nickname = session.nickname?.trim();
      if (!nickname) {
        this.waitingSessionTokens.delete(sessionToken);
        continue;
      }
      this.addPlayer(seat, session, nickname);
      this.sessions.setIdentity(sessionToken, 'player', nickname);
      this.waitingSessionTokens.delete(sessionToken);
      this.state.version += 1;
    }
  }

  private emptyState(roomId: string, hostId: string): TexasState {
    return {
      roomId,
      hostId,
      phase: 'lobby',
      handNumber: 0,
      version: 0,
      players: { A: null, B: null, C: null, D: null, E: null, F: null, G: null, H: null },
      dealerSeat: null,
      smallBlindSeat: null,
      bigBlindSeat: null,
      currentTurn: null,
      community: [],
      deck: [],
      pot: 0,
      currentBet: 0,
      minRaise: TEXAS_BIG_BLIND,
      actedSeats: [],
      settlement: null,
    };
  }

  private emptyPublicSnapshot(): TexasPublicSnapshot {
    return {
      gameId: 'texas',
      roomId: 'texas',
      phase: 'lobby',
      handNumber: 0,
      version: 0,
      players: [],
      spectators: [],
      chat: [],
      hostSeat: null,
      dealerSeat: null,
      smallBlindSeat: null,
      bigBlindSeat: null,
      currentTurn: null,
      community: [],
      pot: 0,
      currentBet: 0,
      minRaise: TEXAS_BIG_BLIND,
      settlement: null,
    };
  }
}
