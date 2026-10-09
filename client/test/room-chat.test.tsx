/* @vitest-environment jsdom */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it('支持发送快捷短语，且短语消息不会进入聊天记录列表', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    render(
      <RoomChat
        messages={[
          { id: 't-1', kind: 'text', senderNickname: '甲', text: '大家好', createdAt: 1 },
          { id: 'p-1', kind: 'phrase', senderNickname: '乙', text: '快点啊，等得我花儿都谢了！', createdAt: 2 },
        ]}
        members={[]}
        onSend={onSend}
      />,
    );

    expect(screen.getByText('：大家好')).toBeInTheDocument();
    // 短语消息不在聊天消息流中出现
    expect(screen.queryByText('：快点啊，等得我花儿都谢了！')).not.toBeInTheDocument();

    // 点击快捷短语按钮发送
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '你是GG还是MM？' }));
    });
    expect(onSend).toHaveBeenCalledWith({ kind: 'phrase', text: '你是GG还是MM？' });
  });

  it('支持点击语音消息播放音频', () => {
    const playMock = vi.fn().mockResolvedValue(undefined);
    const audioConstructor = vi.fn().mockImplementation(() => ({ play: playMock }));
    vi.stubGlobal('Audio', audioConstructor);
    try {
      render(
        <RoomChat
          messages={[{ id: 'v-1', kind: 'voice', senderNickname: '丙', duration: 4, audioData: 'bXAz', createdAt: 1 }]}
          members={[]}
          onSend={vi.fn()}
        />,
      );

      const voiceBtn = screen.getByRole('button', { name: /4" ▶ 点击播放/ });
      fireEvent.click(voiceBtn);
      expect(audioConstructor).toHaveBeenCalledWith('data:audio/mp3;base64,bXAz');
      expect(playMock).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
