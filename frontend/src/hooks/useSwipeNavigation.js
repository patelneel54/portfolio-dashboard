import { useState, useEffect, useRef, useCallback } from 'react';

const MIN_THRESHOLD = 50;
const DIRECTION_LOCK_THRESHOLD = 15;
const HV_RATIO = 2;
const TRANSITION_MS = 180;

export default function useSwipeNavigation(containerRef, tabs, activeTab, onTabChange) {
  const [slideStyle, setSlideStyle] = useState({ transform: 'translateX(0)', transition: 'none' });

  const touchRef = useRef(null);
  const swipingRef = useRef(false);
  const animatingRef = useRef(false);
  const abandonedRef = useRef(false);
  const tabsRef = useRef(tabs);
  const activeTabRef = useRef(activeTab);
  const onTabChangeRef = useRef(onTabChange);

  useEffect(() => { tabsRef.current = tabs; }, [tabs]);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  useEffect(() => { onTabChangeRef.current = onTabChange; }, [onTabChange]);

  const snapBack = useCallback(() => {
    setSlideStyle({ transform: 'translateX(0)', transition: `transform ${TRANSITION_MS}ms ease-out` });
    setTimeout(() => {
      animatingRef.current = false;
      setSlideStyle({ transform: 'translateX(0)', transition: 'none' });
    }, TRANSITION_MS);
  }, []);

  const animateToTab = useCallback((direction, newTabId) => {
    animatingRef.current = true;
    const vw = window.innerWidth;
    const exitX = direction === 'left' ? -vw : vw;

    setSlideStyle({ transform: `translateX(${exitX}px)`, transition: `transform ${TRANSITION_MS}ms ease-out` });

    setTimeout(() => {
      onTabChangeRef.current(newTabId);
      setSlideStyle({ transform: `translateX(${-exitX}px)`, transition: 'none' });

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setSlideStyle({ transform: 'translateX(0)', transition: `transform ${TRANSITION_MS}ms ease-out` });
          setTimeout(() => {
            animatingRef.current = false;
            setSlideStyle({ transform: 'translateX(0)', transition: 'none' });
          }, TRANSITION_MS);
        });
      });
    }, TRANSITION_MS);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onTouchStart = (e) => {
      if (animatingRef.current) return;
      if (e.target.closest('[data-no-swipe], .recharts-wrapper')) return;

      const t = e.touches[0];
      touchRef.current = { x: t.clientX, y: t.clientY };
      swipingRef.current = false;
      abandonedRef.current = false;
    };

    const onTouchMove = (e) => {
      if (!touchRef.current || abandonedRef.current) return;

      const t = e.touches[0];
      const dx = t.clientX - touchRef.current.x;
      const dy = t.clientY - touchRef.current.y;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      if (!swipingRef.current) {
        // Not yet committed — decide direction
        if (absDy > 10 && absDy > absDx) {
          // Vertical scroll wins — abandon swipe detection
          abandonedRef.current = true;
          touchRef.current = null;
          return;
        }
        if (absDx >= DIRECTION_LOCK_THRESHOLD && absDx >= absDy * HV_RATIO) {
          swipingRef.current = true;
        } else {
          return;
        }
      }

      // Committed to swiping — compute offset with boundary damping
      const currentIdx = tabsRef.current.indexOf(activeTabRef.current);
      let offsetX;
      if (dx > 0 && currentIdx === 0) {
        offsetX = dx * 0.25;
      } else if (dx < 0 && currentIdx === tabsRef.current.length - 1) {
        offsetX = dx * 0.25;
      } else {
        offsetX = dx;
      }

      setSlideStyle({ transform: `translateX(${offsetX}px)`, transition: 'none' });
    };

    const onTouchEnd = () => {
      if (!touchRef.current && !swipingRef.current) return;

      if (swipingRef.current) {
        // Read current transform to get final offset
        const inner = el.firstElementChild;
        const matrix = inner && window.getComputedStyle(inner).transform;
        let currentOffset = 0;
        if (matrix && matrix !== 'none') {
          const parts = matrix.match(/matrix.*\((.+)\)/);
          if (parts) {
            const values = parts[1].split(', ');
            currentOffset = parseFloat(values[4]) || 0;
          }
        }

        const currentIdx = tabsRef.current.indexOf(activeTabRef.current);

        if (Math.abs(currentOffset) >= MIN_THRESHOLD) {
          if (currentOffset < 0 && currentIdx < tabsRef.current.length - 1) {
            animateToTab('left', tabsRef.current[currentIdx + 1]);
          } else if (currentOffset > 0 && currentIdx > 0) {
            animateToTab('right', tabsRef.current[currentIdx - 1]);
          } else {
            snapBack();
          }
        } else {
          snapBack();
        }
      }

      touchRef.current = null;
      swipingRef.current = false;
      abandonedRef.current = false;
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [containerRef, animateToTab, snapBack]);

  return { slideStyle };
}
