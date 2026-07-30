'use client';

import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type DependencyList,
} from 'react';

/**
 * Autofit: shrink only when needed so content fits the panel.
 * Keeps a readable floor so spacing stays reasonable.
 */
export function useAutofitScale(deps: DependencyList = []) {
  const containerRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLElement | null>(null);
  const [style, setStyle] = useState<CSSProperties>({});

  useLayoutEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    let frame = 0;
    const supportsZoom =
      typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('zoom', '0.5');

    const reset = () => {
      content.style.zoom = '';
      content.style.transform = '';
      content.style.marginBottom = '';
      content.style.marginRight = '';
      content.style.width = '';
    };

    const fit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        reset();

        const pad = 12;
        const availH = Math.max(0, container.clientHeight - pad);
        const availW = Math.max(0, container.clientWidth - pad);
        if (availH < 48 || availW < 48) {
          setStyle({});
          return;
        }

        const needH = content.scrollHeight;
        const needW = content.scrollWidth;
        if (needH < 1 || needW < 1) {
          setStyle({});
          return;
        }

        // Only shrink when overflowing; never enlarge.
        const raw = Math.min(1, availH / needH, availW / needW);
        // Soften slightly, keep readable (avoid crushed look).
        const scale = Math.max(0.72, Number((raw * 0.99).toFixed(4)));

        if (scale >= 0.992) {
          setStyle({});
          return;
        }

        if (supportsZoom) {
          setStyle({ zoom: scale });
        } else {
          setStyle({
            transform: `scale(${scale})`,
            transformOrigin: 'center top',
            marginBottom: `${Math.round(needH * (scale - 1))}px`,
            width: '100%',
          });
        }
      });
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(container);
    ro.observe(content);

    window.addEventListener('resize', fit);
    window.visualViewport?.addEventListener('resize', fit);
    window.visualViewport?.addEventListener('scroll', fit);

    return () => {
      cancelAnimationFrame(frame);
      reset();
      ro.disconnect();
      window.removeEventListener('resize', fit);
      window.visualViewport?.removeEventListener('resize', fit);
      window.visualViewport?.removeEventListener('scroll', fit);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { containerRef, contentRef, contentStyle: style };
}
