import { describe, expect, it } from 'vitest';
import { settleHand } from '../src/scoring';

describe('414 升级与结算', () => {
  it('按第一名队友的名次结算抓两家、抓一家和平局', () => {
    const grabOne = settleHand({
      levels: { AC: '5', BD: '7' },
      finishOrder: ['A', 'B', 'C', 'D'],
    });
    const flatAC = settleHand({
      levels: { AC: '5', BD: '7' },
      finishOrder: ['A', 'B', 'D', 'C'],
    });
    const flatBD = settleHand({
      levels: { AC: '5', BD: '7' },
      finishOrder: ['B', 'A', 'C', 'D'],
    });

    expect(grabOne.outcome).toBe('grab-one');
    expect(grabOne.levels).toEqual({ AC: '6', BD: '7' });
    expect(grabOne.nextLeader).toBe('A');
    expect(flatAC.outcome).toBe('flat');
    expect(flatAC.levels).toEqual({ AC: '5', BD: '7' });
    expect(flatAC.nextLeader).toBe('A');
    expect(flatBD.outcome).toBe('flat');
    expect(flatBD.nextLeader).toBe('B');
  });

  it('抓两家升两级，J按坎处理，A完成该队的一轮并回到3', () => {
    const grabOneFromJ = settleHand({
      levels: { AC: 'J', BD: '3' },
      finishOrder: ['A', 'B', 'C', 'D'],
    });
    const grabTwoFromJ = settleHand({
      levels: { AC: 'J', BD: '3' },
      finishOrder: ['A', 'C'],
    });
    const losingJ = settleHand({
      levels: { AC: '3', BD: 'J' },
      finishOrder: ['A', 'B', 'C', 'D'],
    });
    const completedRound = settleHand({
      levels: { AC: 'K', BD: '6' },
      finishOrder: ['A', 'C'],
    });
    const flatAtJ = settleHand({
      levels: { AC: 'J', BD: '6' },
      finishOrder: ['A', 'B', 'D', 'C'],
    });

    expect(grabOneFromJ.levels.AC).toBe('Q');
    expect(grabTwoFromJ.levels.AC).toBe('K');
    expect(losingJ.levels.BD).toBe('3');
    expect(completedRound.levels.AC).toBe('3');
    expect(completedRound.completedRounds.AC).toBe(1);
    expect(completedRound.levels.BD).toBe('6');
    expect(flatAtJ.levels.AC).toBe('J');
  });

  it('立棍和反立只结算最终模式，成功不扣对手，失败才让失败方降级', () => {
    const standSuccess = settleHand({
      levels: { AC: '5', BD: '6' },
      finishOrder: ['A', 'B'],
      mode: 'stand',
      modeTeam: 'AC',
    });
    const standFailure = settleHand({
      levels: { AC: '5', BD: '6' },
      finishOrder: ['B', 'A'],
      mode: 'stand',
      modeTeam: 'AC',
    });
    const reverseSuccess = settleHand({
      levels: { AC: '5', BD: '3' },
      finishOrder: ['B', 'A'],
      mode: 'reverse',
      modeTeam: 'BD',
    });
    const reverseFailureAtThree = settleHand({
      levels: { AC: '3', BD: '3' },
      finishOrder: ['A', 'B'],
      mode: 'reverse',
      modeTeam: 'BD',
    });

    expect(standSuccess.levels).toEqual({ AC: '9', BD: '6' });
    expect(standFailure.levels).toEqual({ AC: '3', BD: '10' });
    expect(reverseSuccess.levels).toEqual({ AC: '5', BD: 'J' });
    expect(reverseFailureAtThree.levels).toEqual({ AC: 'J', BD: '3' });
  });

  it('立棍或反立奖励跨过J时封顶在J，不应完成一轮回到3', () => {
    const standFromSeven = settleHand({
      levels: { AC: '7', BD: '3' },
      finishOrder: ['A', 'B'],
      mode: 'stand',
      modeTeam: 'AC',
    });
    const reverseFromSeven = settleHand({
      levels: { AC: '7', BD: '3' },
      finishOrder: ['A', 'B'],
      mode: 'reverse',
      modeTeam: 'AC',
    });

    expect(standFromSeven.levels).toEqual({ AC: 'J', BD: '3' });
    expect(reverseFromSeven.levels).toEqual({ AC: 'J', BD: '3' });
    expect(standFromSeven.completedRounds.AC).toBe(0);
    expect(reverseFromSeven.completedRounds.AC).toBe(0);
  });
});
