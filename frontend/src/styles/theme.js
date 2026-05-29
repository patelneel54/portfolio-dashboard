export const C = {
  bg: "#0B0B0F",
  card: "#16161D",
  cardHover: "#1E1E27",
  elevated: "#26263A",
  border: "#2A2A3A",
  borderActive: "#3D3D55",
  text: "#F0F0F5",
  textMuted: "#8E8EA0",
  textDim: "#5A5A6E",
  green: "#00DC5A",
  greenBg: "#00DC5A18",
  red: "#FF3B30",
  redBg: "#FF3B3018",
  blue: "#636AFF",
  purple: "#A855F7",
  amber: "#FFB020",
  cyan: "#00C9DB",
  pink: "#F472B6",
  accent: "#636AFF",
  chartGrid: "#1A1A28",
  chartCrosshair: "#4A4A60",
};

// Lighter accent for primary-button hover (pointer devices). See design-system/components.html.
export const ACCENT_HOVER = "#757DFF";

// ── Design-system scales (mirror styles/tokens.css) ──────────────────────────
// Radius — mostly soft. xl (16) is the default card; md (8) is for inputs; pills use `pill`.
export const RADIUS = { xs: 4, sm: 6, md: 8, lg: 10, xl: 16, pill: 9999 };

// Spacing — base-4. Card padding is 24 (xl), stat-grid gap 8 (sm), section gap 16 (lg).
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, huge: 56 };

// Elevation — shadows are for true overlays only; on-page cards stack via border + surface tint.
export const SHADOW = {
  card: "0 1px 0 rgba(255,255,255,0.02) inset",
  pop: "0 8px 32px rgba(0,0,0,0.4)", // popovers, sheets, modal cards
  bar: "0 -4px 20px rgba(0,0,0,0.4)", // bottom tab bar lift
};

// Motion — fast for state changes, base for larger transitions; ease-out throughout.
export const MOTION = { fast: "0.15s", base: "0.3s", ease: "ease-out" };

export const TICKER_COLORS = [
  "#00DC5A", "#636AFF", "#FF6B6B", "#FFB020", "#00C9DB", "#A855F7", "#F472B6",
  "#00DC5A99", "#636AFF99", "#FF6B6B99", "#FFB02099", "#00C9DB99", "#A855F799",
  "#00DC5ACC", "#636AFFCC", "#FF6B6BCC", "#FFB020CC", "#00C9DBCC", "#A855F7CC",
  "#F472B6CC",
];

export const TYPE_COLORS = { ETF: '#636AFF', Stock: '#A855F7', Fund: '#00DC5A', Crypto: '#F7931A' };
export const ACCOUNT_COLORS = { brokerage: '#636AFF', '401k': '#A855F7', crypto: '#F7931A' };
export const MONO = "'JetBrains Mono', monospace";
export const SANS = "'DM Sans', -apple-system, sans-serif";

export const ASSET_CLASS_COLORS = {
  large_cap: '#636AFF',
  mid_cap: '#A855F7',
  small_cap: '#00C9DB',
  international: '#00DC5A',
  bond: '#FFB020',
  stable_value: '#636AFF',
  specialty: '#F472B6',
  target_date: '#00C9DB',
  money_market: '#5A5A6E',
  blended: '#A855F7',
  crypto: '#F7931A',
  unclassified: '#3D3D55',
};

export const ASSET_CLASS_LABELS = {
  large_cap: 'Large Cap',
  mid_cap: 'Mid Cap',
  small_cap: 'Small Cap',
  international: 'International',
  bond: 'Bond / Fixed Income',
  stable_value: 'Stable Value',
  specialty: 'Specialty / REIT',
  target_date: 'Target Date',
  money_market: 'Money Market',
  blended: 'Blended',
  crypto: 'Crypto',
  unclassified: 'Other',
};
