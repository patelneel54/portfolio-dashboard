import { useState, useEffect, useRef, useCallback } from 'react';
import { C } from '../styles/theme';

const THRESHOLD = 60;
const MAX_PULL = 100;
const RESISTANCE = 0.45;
const EASE_OUT = 'transform 300ms cubic-bezier(0.32, 0.72, 0, 1)';

const spinKeyframes = `
@keyframes ptr-spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
`;

if (typeof document !== 'undefined' && !document.getElementById('ptr-styles')) {
  const style = document.createElement('style');
  style.id = 'ptr-styles';
  style.textContent = spinKeyframes;
  document.head.appendChild(style);
}

export default function PullToRefresh({ onRefresh, refreshing, children }) {
  const [pullDistance, setPullDistance] = useState(0);
  const [pulling, setPulling] = useState(false);
  const [triggered, setTriggered] = useState(false);

  const startYRef = useRef(0);
  const atTopRef = useRef(false);
  const pullingRef = useRef(false);
  const containerRef = useRef(null);

  // Reset after refresh completes
  useEffect(() => {
    if (!refreshing && triggered) {
      setPullDistance(0);
      setTriggered(false);
    }
  }, [refreshing, triggered]);

  const onTouchStart = useCallback((e) => {
    if (refreshing) return;
    const scrollY = window.scrollY || document.documentElement.scrollTop;
    if (scrollY > 0) {
      atTopRef.current = false;
      return;
    }
    atTopRef.current = true;
    startYRef.current = e.touches[0].clientY;
    pullingRef.current = false;
  }, [refreshing]);

  const onTouchMove = useCallback((e) => {
    if (!atTopRef.current || refreshing) return;
    const rawDelta = e.touches[0].clientY - startYRef.current;
    if (rawDelta <= 0) {
      if (pullingRef.current) {
        setPullDistance(0);
        setPulling(false);
        pullingRef.current = false;
      }
      return;
    }
    const damped = Math.min(rawDelta * RESISTANCE, MAX_PULL);
    setPullDistance(damped);
    if (!pullingRef.current) {
      setPulling(true);
      pullingRef.current = true;
    }
  }, [refreshing]);

  const onTouchEnd = useCallback(() => {
    if (!pullingRef.current) return;
    setPulling(false);
    pullingRef.current = false;
    if (pullDistance >= THRESHOLD) {
      setTriggered(true);
      setPullDistance(THRESHOLD);
      onRefresh();
    } else {
      setPullDistance(0);
    }
  }, [pullDistance, onRefresh]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [onTouchStart, onTouchMove, onTouchEnd]);

  const progress = Math.min(pullDistance / THRESHOLD, 1);
  const isSpinning = triggered || refreshing;
  const transition = pulling ? 'none' : EASE_OUT;

  return (
    <div ref={containerRef} style={{ position: 'relative', overscrollBehavior: 'contain' }}>
      {/* Pull indicator */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: THRESHOLD,
        transform: `translateY(${pullDistance - THRESHOLD}px)`,
        transition,
        pointerEvents: 'none',
        zIndex: 10,
      }}>
        <div style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 20,
          width: 44,
          height: 44,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
        }}>
          <svg
            width={24}
            height={24}
            viewBox="0 0 24 24"
            style={{
              opacity: isSpinning ? 1 : 0.3 + progress * 0.7,
              transform: isSpinning ? undefined : `rotate(${progress * 360}deg)`,
              transition: pulling ? 'none' : 'opacity 300ms ease',
              animation: isSpinning ? 'ptr-spin 0.8s linear infinite' : 'none',
            }}
          >
            <circle
              cx="12"
              cy="12"
              r="9"
              fill="none"
              stroke={C.accent}
              strokeWidth="2.5"
              strokeDasharray={isSpinning ? '42 56.5' : `${progress * 56.5} 56.5`}
              strokeLinecap="round"
              transform="rotate(-90 12 12)"
            />
          </svg>
        </div>
      </div>

      {/* Content shifted down during pull */}
      <div style={{
        transform: pullDistance > 0 ? `translateY(${pullDistance}px)` : undefined,
        transition,
      }}>
        {children}
      </div>
    </div>
  );
}
