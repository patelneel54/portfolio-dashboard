import { C, MONO } from './theme';

export const cardStyle = {
  background: C.card,
  borderRadius: 12,
  border: `1px solid ${C.border}`,
  padding: 20,
};

export const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  fontSize: 16,
  fontFamily: MONO,
  background: '#0d1424',
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
  borderRadius: 8,
  padding: '10px 16px',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  minHeight: 44,
};

export const buttonSecondary = {
  background: 'transparent',
  border: `1px solid ${C.border}`,
  color: C.textMuted,
  borderRadius: 8,
  padding: '10px 16px',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  minHeight: 44,
};

export const sectionTitle = {
  margin: '0 0 14px',
  fontSize: 14,
  fontWeight: 700,
  color: C.textMuted,
};

export const labelStyle = {
  fontSize: 10,
  color: C.textMuted,
  textTransform: 'uppercase',
  letterSpacing: 1,
  fontWeight: 600,
};

export const tableHeader = {
  padding: '8px 10px',
  textAlign: 'left',
  color: C.textDim,
  fontWeight: 600,
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: 0.8,
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
