/* @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RoomChat } from '../src/components/RoomChat';

describe('房间聊天侧栏', () => {
  it('可以收起和展开，并从聊天侧栏给玩家发送互动', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    render(
      <RoomChat
        messages={[]}
        members={[{ id: 'A', nickname: '甲', label: 'A位', seat: 'A' }, { id: 'B', nickname: '乙', label: 'B位', seat: 'B' }]}
        ownSeat="A"
        onSend={onSend}
      />,
    );

    expect(screen.getByRole('region', { name: '房间聊天' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '收起聊天' }));
    expect(screen.queryByRole('region', { name: '房间聊天' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '💬 聊天' }));
    expect(screen.getByRole('region', { name: '房间聊天' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '和乙互动' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '番茄给乙' }));
    await waitFor(() => expect(onSend).toHaveBeenCalledWith({
      kind: 'interaction',
      interaction: 'tomato',
      target: { nickname: '乙', seat: 'B' },
    }));
  });
});
