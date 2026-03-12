import { C } from '../styles/theme';

const shimmerKeyframes = `
@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
`;

// Inject keyframes once
if (typeof document !== 'undefined' && !document.getElementById('skeleton-styles')) {
  const style = document.createElement('style');
  style.id = 'skeleton-styles';
  style.textContent = shimmerKeyframes;
  document.head.appendChild(style);
}

const shimmerOverlay = {
  position: 'absolute',
  top: 0, left: 0, right: 0, bottom: 0,
  background: `linear-gradient(90deg, transparent 0%, ${C.cardHover}88 50%, transparent 100%)`,
  animation: 'shimmer 1.5s ease-in-out infinite',
  willChange: 'transform',
};

const baseStyle = {
  background: C.card,
  borderRadius: 8,
  position: 'relative',
  overflow: 'hidden',
};

export function SkeletonCard({ height = 80, style: extra }) {
  return (
    <div style={{ ...baseStyle, border: `1px solid ${C.border}`, borderRadius: 12, height, ...extra }}>
      <div style={shimmerOverlay} />
    </div>
  );
}

export function SkeletonText({ width = '60%', height = 12, style: extra }) {
  return (
    <div style={{ ...baseStyle, width, height, borderRadius: 4, ...extra }}>
      <div style={shimmerOverlay} />
    </div>
  );
}

export function SkeletonChart({ height = 300, style: extra }) {
  return (
    <div style={{ ...baseStyle, border: `1px solid ${C.border}`, borderRadius: 12, height, ...extra }}>
      <div style={{ padding: 20 }}>
        <SkeletonText width="30%" height={14} style={{ marginBottom: 12 }} />
        <SkeletonText width="50%" height={10} />
      </div>
      <div style={shimmerOverlay} />
    </div>
  );
}

export default function SkeletonLoader() {
  return (
    <div style={{ padding: '16px 12px', maxWidth: 1200, margin: '0 auto', paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
      {/* Header skeleton */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <SkeletonText width={220} height={22} style={{ marginBottom: 8 }} />
          <SkeletonText width={100} height={12} />
        </div>
        <div style={{ display: 'flex', gap: 5 }}>
          <SkeletonText width={70} height={36} style={{ borderRadius: 6 }} />
          <SkeletonText width={70} height={36} style={{ borderRadius: 6 }} />
        </div>
      </div>

      {/* Stats row skeleton — 2x2 grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 16 }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} style={{ ...baseStyle, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px' }}>
            <SkeletonText width="40%" height={10} style={{ marginBottom: 8 }} />
            <SkeletonText width="60%" height={20} style={{ marginBottom: 6 }} />
            <SkeletonText width="50%" height={10} />
            <div style={shimmerOverlay} />
          </div>
        ))}
      </div>

      {/* Content cards skeleton */}
      <SkeletonChart height={280} style={{ marginBottom: 16 }} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
        <SkeletonCard height={160} />
        <SkeletonCard height={120} />
      </div>
    </div>
  );
}
