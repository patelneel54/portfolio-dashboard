import { useMemo } from 'react';

export default function useStaggeredMount(index, baseDelay = 0.07) {
  return useMemo(() => ({
    animation: 'fadeSlideUp 0.35s ease-out both',
    animationDelay: `${index * baseDelay}s`,
  }), [index, baseDelay]);
}
