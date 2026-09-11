/* @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { standardCard } from '../../shared/src/cards';
import { CardHand } from '../src/components/CardHand';

function cardIds(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('.card')).map((card) => card.dataset.cardId ?? '');
}

describe('手牌组件', () => {
  it('默认按自动牌型顺序展示', () => {
    const cards = [
      standardCard('7', 'clubs', 'seven'),
      standardCard('5', 'clubs', 'five'),
      standardCard('6', 'clubs', 'six-1'),
      standardCard('6', 'hearts', 'six-2'),
    ];
    const { container } = render(<CardHand cards={cards} selectedIds={[]} onToggle={vi.fn()} />);

    expect(cardIds(container)).toEqual(['five', 'seven', 'six-1', 'six-2']);
    expect(screen.getByText('可拖动调整顺序')).toBeInTheDocument();
  });

  it('拖动后使用自定义顺序，并在剩余手牌变化时保留顺序', () => {
    const cards = [
      standardCard('5', 'clubs', 'five'),
      standardCard('6', 'clubs', 'six'),
      standardCard('7', 'clubs', 'seven'),
    ];
    const { container, rerender } = render(<CardHand cards={cards} selectedIds={[]} onToggle={vi.fn()} />);
    const dataTransfer = {
      effectAllowed: '',
      setData: vi.fn(),
      getData: vi.fn(() => 'seven'),
    };
    const cardButtons = container.querySelectorAll<HTMLButtonElement>('.card');
    fireEvent.dragStart(cardButtons[2], { dataTransfer });
    fireEvent.dragOver(cardButtons[0], { dataTransfer });
    fireEvent.drop(cardButtons[0], { dataTransfer });

    expect(cardIds(container)).toEqual(['seven', 'five', 'six']);
    expect(screen.getByRole('button', { name: '恢复自动排序' })).toBeInTheDocument();

    rerender(<CardHand cards={[cards[0], cards[2]]} selectedIds={[]} onToggle={vi.fn()} />);
    expect(cardIds(container)).toEqual(['seven', 'five']);
  });
});
