import { useRef } from 'react';
import useSwipeNavigation from '../hooks/useSwipeNavigation';

export default function SwipeContainer({ tabs, activeTab, onTabChange, children }) {
  const containerRef = useRef(null);
  const { slideStyle } = useSwipeNavigation(containerRef, tabs, activeTab, onTabChange);

  return (
    <div ref={containerRef} style={{ overflow: 'hidden' }}>
      <div style={{ ...slideStyle, willChange: 'transform' }}>
        {children}
      </div>
    </div>
  );
}
