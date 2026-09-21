import { SEQUENCE_RANKS } from './cards';

export type Seat = 'A' | 'B' | 'C' | 'D';
export type Team = 'AC' | 'BD';
export type Level = (typeof SEQUENCE_RANKS)[number];

export const LEVELS = SEQUENCE_RANKS;

export type SettlementMode = 'normal' | 'stand' | 'reverse';
export type SettlementOutcome = 'grab-two' | 'grab-one' | 'flat' | 'stand-success' | 'stand-failure' | 'reverse-success' | 'reverse-failure';

export interface TeamLevels {
  readonly AC: Level;
  readonly BD: Level;
}

export interface CompletedRounds {
  readonly AC: number;
  readonly BD: number;
}

export interface SettlementInput {
  readonly levels: TeamLevels;
  readonly completedRounds?: CompletedRounds;
  readonly finishOrder: readonly Seat[];
  readonly mode?: SettlementMode;
  readonly modeTeam?: Team;
}

export interface SettlementResult {
  readonly levels: TeamLevels;
  readonly completedRounds: CompletedRounds;
  readonly outcome: SettlementOutcome;
  readonly winnerTeam: Team;
  readonly nextLeader: Seat;
}

export function teamOf(seat: Seat): Team {
  return seat === 'A' || seat === 'C' ? 'AC' : 'BD';
}

export function teamLabel(team: Team): string {
  return team === 'AC' ? '1队' : '2队';
}

function otherTeam(team: Team): Team {
  return team === 'AC' ? 'BD' : 'AC';
}

export function applyLevelDelta(
  level: Level,
  delta: number,
  capAt?: Level,
): { readonly level: Level; readonly completedRound: boolean } {
  if (delta < 0) {
    if (level === 'J') return { level: '3', completedRound: false };
    const nextIndex = Math.max(0, LEVELS.indexOf(level) + delta);
    return { level: LEVELS[nextIndex], completedRound: false };
  }

  const nextIndex = LEVELS.indexOf(level) + delta;
  if (capAt && nextIndex >= LEVELS.indexOf(capAt)) {
    return { level: capAt, completedRound: false };
  }
  if (nextIndex >= LEVELS.length - 1) {
    return { level: '3', completedRound: true };
  }
  return { level: LEVELS[nextIndex], completedRound: false };
}

function updateTeam(
  levels: TeamLevels,
  completedRounds: CompletedRounds,
  team: Team,
  delta: number,
  capAt?: Level,
): { readonly levels: TeamLevels; readonly completedRounds: CompletedRounds } {
  const change = applyLevelDelta(levels[team], delta, capAt);
  return {
    levels: { ...levels, [team]: change.level },
    completedRounds: {
      ...completedRounds,
      [team]: completedRounds[team] + (change.completedRound ? 1 : 0),
    },
  };
}

function applyJLoss(
  levels: TeamLevels,
  team: Team,
): TeamLevels {
  return levels[team] === 'J' ? { ...levels, [team]: '3' } : levels;
}

export function settleHand(input: SettlementInput): SettlementResult {
  const first = input.finishOrder[0];
  if (!first) throw new Error('结算至少需要一名有效玩家');

  const completedRounds = input.completedRounds ?? { AC: 0, BD: 0 };
  let levels = input.levels;
  let rounds = completedRounds;
  const firstTeam = teamOf(first);
  const mode = input.mode ?? 'normal';

  if (mode !== 'normal') {
    if (!input.modeTeam) throw new Error('立棍或反立结算必须提供队伍');
    const succeeded = firstTeam === input.modeTeam;
    const amount = mode === 'stand' ? 4 : 8;
    if (succeeded) {
      const updated = updateTeam(levels, rounds, input.modeTeam, amount, 'J');
      levels = updated.levels;
      rounds = updated.completedRounds;
      return {
        levels,
        completedRounds: rounds,
        outcome: mode === 'stand' ? 'stand-success' : 'reverse-success',
        winnerTeam: input.modeTeam,
        nextLeader: first,
      };
    }

    const winner = otherTeam(input.modeTeam);
    const winnerUpdate = updateTeam(levels, rounds, winner, amount, 'J');
    const loserUpdate = updateTeam(winnerUpdate.levels, winnerUpdate.completedRounds, input.modeTeam, -amount);
    return {
      levels: loserUpdate.levels,
      completedRounds: loserUpdate.completedRounds,
      outcome: mode === 'stand' ? 'stand-failure' : 'reverse-failure',
      winnerTeam: winner,
      nextLeader: first,
    };
  }

  const teammatePosition = input.finishOrder.findIndex((seat, index) => index > 0 && teamOf(seat) === firstTeam);
  if (teammatePosition === 1) {
    const updated = updateTeam(levels, rounds, firstTeam, 2);
    levels = applyJLoss(updated.levels, otherTeam(firstTeam));
    rounds = updated.completedRounds;
    return { levels, completedRounds: rounds, outcome: 'grab-two', winnerTeam: firstTeam, nextLeader: first };
  }

  if (teammatePosition === 2) {
    const updated = updateTeam(levels, rounds, firstTeam, 1);
    levels = applyJLoss(updated.levels, otherTeam(firstTeam));
    rounds = updated.completedRounds;
    return { levels, completedRounds: rounds, outcome: 'grab-one', winnerTeam: firstTeam, nextLeader: first };
  }

  return { levels, completedRounds: rounds, outcome: 'flat', winnerTeam: firstTeam, nextLeader: first };
}
