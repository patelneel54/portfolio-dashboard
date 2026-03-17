import { useState, useEffect, useRef } from 'react';

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

export default function useCountUp(target, duration = 800, decimals = 0) {
  const [value, setValue] = useState(0);
  const prevTarget = useRef(0);

  useEffect(() => {
    const start = prevTarget.current;
    const diff = target - start;
    if (diff === 0) return;

    const startTime = performance.now();
    let raf;

    function tick(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(progress);
      const current = start + diff * eased;
      setValue(current);

      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        prevTarget.current = target;
      }
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return decimals === 0 ? Math.round(value) : parseFloat(value.toFixed(decimals));
}
