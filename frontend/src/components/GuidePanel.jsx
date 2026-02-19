import { C } from '../styles/theme';

const GUIDES = {
  allocation: {
    title: "Allocation Treemap",
    what: "Shows relative size of each position. Bigger box = more dollars invested.",
    why: "Instantly see concentration risk. If one box dominates, you're overexposed.",
    read: "Color = asset type (blue=ETF, purple=Stock). Size = current dollar value.",
  },
  gainloss: {
    title: "Gain/Loss Chart",
    what: "Bars show unrealized P&L for each position, sorted by dollar gain.",
    why: "Identify winners to potentially trim and losers to evaluate.",
    read: "Green bars = gains, red = losses. Length = magnitude.",
  },
  targetRadar: {
    title: "Target vs Actual Radar",
    what: "Overlay of your current allocation against your target.",
    why: "Where blue extends beyond green, you're overweight. Where green extends beyond blue, you're underweight.",
    read: "Perfect alignment = shapes overlap exactly. Big gaps = positions needing rebalancing.",
  },
  projection: {
    title: "Growth Projection",
    what: "Projected portfolio value using compound growth + monthly contributions.",
    why: "See the power of compounding. The gap between scenarios widens dramatically.",
    read: "Three scenarios shown. Shaded area = range of outcomes.",
  },
  technicals: {
    title: "Stock Technicals Panel",
    what: "Support/resistance levels, moving averages, RSI for individual holdings.",
    why: "Helps time entries for adding to positions.",
    read: "Support = price floor. Resistance = ceiling. RSI > 70 = overbought, < 30 = oversold.",
  },
};

export default function GuidePanel({ guideKey }) {
  const g = GUIDES[guideKey];
  if (!g) return null;
  return (
    <div style={{ background: '#0d1424', border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 12, lineHeight: 1.6 }}>
      <div style={{ color: C.amber, fontWeight: 700, marginBottom: 6, fontSize: 13 }}>{g.title}</div>
      <div style={{ color: C.textMuted }}><span style={{ color: C.cyan, fontWeight: 600 }}>What:</span> {g.what}</div>
      <div style={{ color: C.textMuted, marginTop: 4 }}><span style={{ color: C.green, fontWeight: 600 }}>Why:</span> {g.why}</div>
      <div style={{ color: C.textMuted, marginTop: 4 }}><span style={{ color: C.purple, fontWeight: 600 }}>Read it:</span> {g.read}</div>
    </div>
  );
}
