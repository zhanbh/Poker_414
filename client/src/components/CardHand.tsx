import { DragEvent, useEffect, useMemo, useState } from 'react';
import { Card, Rank, sortCards } from '../../../shared/src/cards';

export function cardLabel(card: Card): string {
  return card.kind === 'joker' ? (card.joker === 'small' ? '小王' : '大王') : `${card.rank}${{ clubs: '♣', diamonds: '♦', hearts: '♥', spades: '♠' }[card.suit]}`;
}

export function cardColorClass(card: Card): string {
  return card.kind === 'joker'
    ? `joker ${card.joker}`
    : card.suit === 'diamonds' || card.suit === 'hearts' ? 'red' : 'black';
}

function cardClassName(card: Card, selected: boolean): string {
  return ['card', cardColorClass(card), selected ? 'selected' : ''].filter(Boolean).join(' ');
}

export function CardHand({
  cards,
  main = null,
  selectedIds,
  onToggle,
  dimmed = false,
  resetKey,
}: {
  readonly cards: readonly Card[];
  readonly main?: Rank | null;
  readonly selectedIds: readonly string[];
  readonly onToggle: (card: Card) => void;
  readonly dimmed?: boolean;
  readonly resetKey?: number;
}) {
  const automaticCards = useMemo(() => sortCards(cards, main), [cards, main]);
  const [customOrder, setCustomOrder] = useState<string[] | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const cardIdsKey = cards.map((card) => card.id).join('|');

  useEffect(() => {
    setCustomOrder(null);
  }, [resetKey, cardIdsKey]);

  const orderedCards = useMemo(() => {
    if (!customOrder) return automaticCards;
    const cardsById = new Map(cards.map((card) => [card.id, card]));
    const ordered = customOrder
      .map((id) => cardsById.get(id))
      .filter((card): card is Card => Boolean(card));
    const knownIds = new Set(customOrder);
    return [...ordered, ...automaticCards.filter((card) => !knownIds.has(card.id))];
  }, [automaticCards, cards, customOrder]);

  const onDragStart = (event: DragEvent<HTMLButtonElement>, cardId: string) => {
    if (dimmed) return;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', cardId);
    setDraggingId(cardId);
  };

  const onDrop = (event: DragEvent<HTMLButtonElement>, targetId: string) => {
    event.preventDefault();
    const sourceId = event.dataTransfer.getData('text/plain') || draggingId;
    if (!sourceId || sourceId === targetId) {
      setDraggingId(null);
      setDragOverId(null);
      return;
    }

    const nextOrder = orderedCards.map((card) => card.id);
    const sourceIndex = nextOrder.indexOf(sourceId);
    const targetIndex = nextOrder.indexOf(targetId);
    if (sourceIndex === -1 || targetIndex === -1) return;
    nextOrder.splice(sourceIndex, 1);
    nextOrder.splice(nextOrder.indexOf(targetId), 0, sourceId);
    setCustomOrder(nextOrder);
    setDraggingId(null);
    setDragOverId(null);
  };

  return (
    <section className="hand-panel">
      <div className="hand-toolbar">
        <strong>我的手牌</strong>
        {customOrder ? <button type="button" onClick={() => setCustomOrder(null)}>恢复自动排序</button> : <span>可拖动调整顺序</span>}
      </div>
      <div className={`card-hand${dimmed ? ' dimmed' : ''}`} aria-label={dimmed ? '已弃牌的手牌' : '我的手牌'}>
      {orderedCards.map((card) => (
        <button
          className={`${cardClassName(card, selectedIds.includes(card.id))}${draggingId === card.id ? ' dragging' : ''}${dragOverId === card.id ? ' drag-over' : ''}`}
          key={card.id}
          type="button"
          disabled={dimmed}
          draggable={!dimmed}
          data-card-id={card.id}
          aria-label={cardLabel(card)}
          title="可拖动调整顺序"
          onClick={() => onToggle(card)}
          onDragStart={(event) => onDragStart(event, card.id)}
          onDragOver={(event) => { event.preventDefault(); setDragOverId(card.id); }}
          onDrop={(event) => onDrop(event, card.id)}
          onDragEnd={() => { setDraggingId(null); setDragOverId(null); }}
        >
          {cardLabel(card)}
        </button>
      ))}
      </div>
    </section>
  );
}
