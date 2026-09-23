import { useEffect, useState } from 'react';

function isPortrait(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(orientation: portrait)').matches;
}

type LockableScreenOrientation = ScreenOrientation & {
  readonly lock?: (orientation: 'landscape') => Promise<void>;
};

function requestLandscapeLock(): void {
  const orientation = typeof window !== 'undefined'
    ? window.screen?.orientation as LockableScreenOrientation | undefined
    : undefined;
  if (!orientation || typeof orientation.lock !== 'function') return;
  void orientation.lock('landscape').catch(() => undefined);
}

export function TexasOrientationGuard() {
  const [portrait, setPortrait] = useState(isPortrait);

  useEffect(() => {
    const media = window.matchMedia('(orientation: portrait)');
    const update = () => setPortrait(media.matches);
    update();
    const listener = () => update();
    if (typeof media.addEventListener === 'function') media.addEventListener('change', listener);
    else media.addListener?.(listener);
    return () => {
      if (typeof media.removeEventListener === 'function') media.removeEventListener('change', listener);
      else media.removeListener?.(listener);
    };
  }, []);

  useEffect(() => {
    if (portrait) requestLandscapeLock();
  }, [portrait]);

  if (!portrait) return null;
  return <div className="texas-orientation-guard" role="dialog" aria-modal="true" aria-label="横屏提示">
    <div className="texas-orientation-icon" aria-hidden="true">↻</div>
    <h2>请将手机横屏</h2>
    <p>德州扑克桌需要横向显示。请打开手机自动旋转，并将手机横过来。</p>
    <button type="button" onClick={requestLandscapeLock}>尝试切换横屏</button>
    <small>如果没有自动旋转，请在手机快捷设置中开启“自动旋转”。</small>
  </div>;
}