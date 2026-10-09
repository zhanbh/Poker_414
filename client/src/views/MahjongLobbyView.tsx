import { MahjongPublicSnapshot } from '../../../shared/src/protocol';
import { MAHJONG_SEATS, MahjongSeat } from '../../../shared/src/mahjong';
import { InteractionEffect, RoomInteractionEffect } from '../components/InteractionMenu';
import { RoomPurposeNotice } from '../components/RoomPurposeNotice';

export function MahjongLobbyView({ snapshot, ownSeat, spectator = false, onStart, onRemove, onLeave, testMode, interactionEffect = null }: {
  readonly snapshot: MahjongPublicSnapshot;
  readonly ownSeat: MahjongSeat | null;
  readonly spectator?: boolean;
  readonly onStart: () => void;
  readonly onRemove: (seat: MahjongSeat) => void;
  readonly onLeave: () => void;
  readonly testMode: boolean;
  readonly interactionEffect?: RoomInteractionEffect | null;
}) {
  const players = new Map(snapshot.players.map((player) => [player.seat, player]));
  const ownPlayer = snapshot.players.find((player) => player.seat === ownSeat);
  return (
    <main className="mahjong-lobby">
      {testMode ? <div className="test-mode-banner" role="status">单机四人测试模式 · 每个标签页都是独立玩家</div> : null}
      <header className="mahjong-header"><div><h1>麻将房间 {snapshot.roomId}</h1><p>四人大众麻将 · 满员后开始</p></div><span>等待开局</span></header>
      <RoomPurposeNotice />
      <section className="mahjong-lobby-table" aria-label="麻将座位">
        <div className="mahjong-lobby-felt"><strong>麻将</strong><span>{snapshot.players.length}/4 人已入座</span><small>东家为本局庄家，牌局规则后续可按地区玩法调整</small>{ownPlayer?.isHost ? <button type="button" onClick={onStart} disabled={snapshot.players.length !== 4}>开始牌局</button> : null}</div>
        {MAHJONG_SEATS.map((seat) => {
          const player = players.get(seat);
          const canRemove = Boolean(player && ownPlayer?.isHost && player.seat !== ownSeat);
          return <article className={'mahjong-lobby-seat mahjong-lobby-seat-' + seat + (player ? ' occupied' : '')} key={seat}>
            {player ? <>
              <b>{player.nickname}</b>
              <small>{player.score} 积分</small>
              {interactionEffect?.targetSeat === seat ? <InteractionEffect interaction={interactionEffect.interaction} /> : null}
              {(() => {
                const latestPhrase = [...(snapshot.chat || [])].reverse().find(
                  (msg) => msg.kind === 'phrase' && msg.senderSeat === seat && Date.now() - msg.createdAt < 3600
                );
                return latestPhrase ? <div className="player-speech-bubble" aria-label={`${player.nickname}说：${latestPhrase.text}`}>💬 {latestPhrase.text}</div> : null;
              })()}
            </> : <span>空位</span>}
            {canRemove ? <button type="button" onClick={() => onRemove(seat)}>移除</button> : null}
          </article>;
        })}
      </section>
      {spectator ? <p className="spectator-banner">观战模式 · 等待牌局开始</p> : null}
      {snapshot.spectators.length > 0 ? <section className="spectator-lobby"><h2>观战席（{snapshot.spectators.length}）</h2><p>{snapshot.spectators.map((viewer) => viewer.nickname).join('、')}</p></section> : null}
      <button type="button" className="leave-room-button" onClick={onLeave}>退出房间并重选玩法</button>
    </main>
  );
}
