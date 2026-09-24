import { useState } from 'react';
import { RoomChatInteraction } from '../../../shared/src/protocol';

export interface RoomInteractionTarget {
  readonly id: string;
  readonly nickname: string;
  readonly label: string;
  readonly seat?: string;
}

export interface RoomInteractionEffect {
  readonly id: string;
  readonly targetSeat: string;
  readonly interaction: RoomChatInteraction;
}

export const INTERACTIONS: ReadonlyArray<{
  readonly kind: RoomChatInteraction;
  readonly label: string;
  readonly icon: string;
}> = [
  { kind: 'tomato', label: '番茄', icon: '🍅' },
  { kind: 'water', label: '泼水', icon: '💦' },
  { kind: 'heart', label: '比心', icon: '💖' },
  { kind: 'kiss', label: '亲吻', icon: '💋' },
];

export function interactionLabel(interaction: RoomChatInteraction): string {
  return INTERACTIONS.find((item) => item.kind === interaction)?.label ?? '互动';
}

export function interactionIcon(interaction: RoomChatInteraction): string {
  return INTERACTIONS.find((item) => item.kind === interaction)?.icon ?? '✨';
}

export function InteractionEffect({ interaction }: { readonly interaction: RoomChatInteraction }) {
  return (
    <span className="room-interaction-effect" aria-label={`${interactionLabel(interaction)}动画`}>
      {interactionIcon(interaction)}
    </span>
  );
}

export function InteractionMenu({
  target,
  onInteract,
}: {
  readonly target: RoomInteractionTarget;
  readonly onInteract: (target: RoomInteractionTarget, interaction: RoomChatInteraction) => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const choose = async (interaction: RoomChatInteraction) => {
    setSending(true);
    try {
      await onInteract(target, interaction);
      setOpen(false);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="room-interaction" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        className="room-interaction-trigger"
        aria-label={`和${target.nickname}互动`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        disabled={sending}
      >
        互动
      </button>
      {open ? (
        <div className="room-interaction-options" role="menu" aria-label={`给${target.nickname}发送互动`}>
          {INTERACTIONS.map((item) => (
            <button
              key={item.kind}
              type="button"
              role="menuitem"
              aria-label={`${item.label}给${target.nickname}`}
              title={`${item.label}给${target.nickname}`}
              onClick={() => void choose(item.kind)}
              disabled={sending}
            >
              {item.icon}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
