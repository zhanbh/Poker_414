import { useEffect, useState } from 'react';

function isPortrait(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(orientation: portrait)').matches;
}

type LockableScreenOrientation = ScreenOrientation & {
  readonly lock?: (orientation: 'landscape') => Promise<void>;
};

export function requestLandscapeLock(): void {
  const orientation = typeof window !== 'undefined'
    ? window.screen?.orientation as LockableScreenOrientation | undefined
    : undefined;
  if (!orientation || typeof orientation.lock !== 'function') return;
  try {
    void orientation.lock('landscape').catch(() => undefined);
  } catch {
    // WebView implementations may throw synchronously when orientation lock is unsupported.
  }
}

export function usePortraitOrientation(): boolean {
  const [portrait, setPortrait] = useState(isPortrait);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
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
    document.documentElement.classList.toggle('texas-orientation-fallback', portrait);
    if (portrait) requestLandscapeLock();
    return () => {
      document.documentElement.classList.remove('texas-orientation-fallback');
    };
  }, [portrait]);

  return portrait;
}

export function TexasOrientationGuard({ portrait }: { readonly portrait: boolean }) {
  if (!portrait) return null;
  return (
    <div className="texas-orientation-hint" role="status" aria-live="polite">
      <span>当前设备未自动旋转，已启用横向适配；如支持自动旋转，请将手机横过来。</span>
      <button type="button" onClick={requestLandscapeLock}>尝试切换横屏</button>
    </div>
  );
}
