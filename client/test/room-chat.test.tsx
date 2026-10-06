/* @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RoomChat } from '../src/components/RoomChat';

describe('房间聊天侧栏', () => {
  it('移除快捷语音入口，并仅以文字兼容显示历史语音消息', () => {
    const audioConstructor = vi.fn();
    vi.stubGlobal('Audio', audioConstructor);
    try {
      const { container } = render(<RoomChat messages={[{ id: 'voice-1', kind: 'voice', senderNickname: '乙', senderSeat: 'B', voiceId: 'quick', text: '快一点，大家都等着呢！', createdAt: 1 }]} members={[]} onSend={vi.fn()} />);
      expect(container.querySelector('.room-chat-message.voice')?.textContent).toContain('快一点，大家都等着呢！');
      expect(screen.queryByText('让我想一想。')).not.toBeInTheDocument();
      expect(screen.queryByText('快捷语音')).not.toBeInTheDocument();
      expect(audioConstructor).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('聊天可收起和展开，并且收起时只保留一个入口', () => {
    render(<RoomChat messages={[]} members={[]} onSend={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '收起聊天' }));
    expect(screen.getAllByRole('button')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '💬 聊天' }));
    expect(screen.getByRole('region', { name: '房间聊天' })).toBeInTheDocument();
  });
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
