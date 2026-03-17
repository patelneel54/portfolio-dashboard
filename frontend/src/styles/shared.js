import { C, MONO, SANS } from './theme';

export const cardStyle = {
  background: C.card,
  borderRadius: 16,
  border: `1px solid ${C.border}`,
  padding: 24,
};

export const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  fontSize: 16,
  fontFamily: MONO,
  background: C.elevated,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  color: C.text,
  outline: 'none',
  boxSizing: 'border-box',
};

export const buttonPrimary = {
  background: C.accent,
  color: '#fff',
  border: 'none',
  borderRadius: 10,
  padding: '10px 16px',
  fontSize: 14,
  fontWeight: 600,
  fontFamily: SANS,
  cursor: 'pointer',
  minHeight: 44,
  transition: 'background 0.15s, opacity 0.15s',
};

export const buttonSecondary = {
  background: 'transparent',
  border: `1px solid ${C.border}`,
  color: C.textMuted,
  borderRadius: 10,
  padding: '10px 16px',
  fontSize: 12,
  fontWeight: 600,
  fontFamily: SANS,
  cursor: 'pointer',
  minHeight: 44,
  transition: 'background 0.15s, border-color 0.15s, color 0.15s',
};

export const sectionTitle = {
  margin: '0 0 14px',
  fontSize: 18,
  fontWeight: 700,
  fontFamily: SANS,
  color: C.textMuted,
};

export const labelStyle = {
  fontSize: 11,
  color: C.textMuted,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  fontWeight: 500,
  fontFamily: SANS,
};

export const tableHeader = {
  padding: '8px 10px',
  textAlign: 'left',
  color: C.textDim,
  fontWeight: 500,
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  fontFamily: SANS,
};

export const tooltipStyle = {
  background: C.elevated,
  border: `1px solid ${C.border}`,
  borderRadius: 10,
  padding: '10px 14px',
  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
};

export const srOnly = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0,0,0,0)',
  whiteSpace: 'nowrap',
};

export const badge = (color) => ({
  fontSize: 9,
  padding: '2px 6px',
  borderRadius: 4,
  fontWeight: 700,
  textTransform: 'uppercase',
  background: color + '22',
  color,
});

export const dangerButton = {
  background: C.red + '22',
  color: C.red,
  border: `1px solid ${C.red}44`,
  borderRadius: 8,
  padding: '10px 24px',
  fontSize: 13,
  fontWeight: 600,
  fontFamily: SANS,
  cursor: 'pointer',
  minHeight: 44,
  transition: 'background 0.15s, opacity 0.15s',
};

export const inputGroupWrapper = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
};

export const inputAddon = {
  position: 'absolute',
  fontSize: 13,
  fontFamily: MONO,
  color: C.textDim,
  pointerEvents: 'none',
  userSelect: 'none',
};
