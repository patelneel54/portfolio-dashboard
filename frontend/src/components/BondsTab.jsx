import { useState, useMemo } from 'react';
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer, BarChart, Bar,
} from 'recharts';
import { api } from '../hooks/useApi';
import { C, MONO, SANS } from '../styles/theme';
import { cardStyle } from '../styles/shared';

/* ══════════════════════════════════════════════════════════════════════
   Bond Math Utilities (client-side)
   ══════════════════════════════════════════════════════════════════════ */

/** Present value of a bond given coupon rate, face value, YTM, and years to maturity */
function bondPrice(couponRate, faceValue, ytm, years) {
  if (years <= 0 || ytm < 0) return faceValue;
  const coupon = faceValue * couponRate / 2; // semiannual
  const periods = years * 2;
  const r = ytm / 2;
  let pv = 0;
  for (let t = 1; t <= periods; t++) {
    pv += coupon / Math.pow(1 + r, t);
  }
  pv += faceValue / Math.pow(1 + r, periods);
  return pv;
}

/** Macaulay duration */
function macaulayDuration(couponRate, faceValue, ytm, years) {
  if (years <= 0) return 0;
  const coupon = faceValue * couponRate / 2;
  const periods = years * 2;
  const r = ytm / 2;
  const price = bondPrice(couponRate, faceValue, ytm, years);
  let dur = 0;
  for (let t = 1; t <= periods; t++) {
    dur += (t / 2) * coupon / Math.pow(1 + r, t);
  }
  dur += (periods / 2) * faceValue / Math.pow(1 + r, periods);
  return dur / price;
}

/** Modified duration */
function modifiedDuration(couponRate, faceValue, ytm, years) {
  return macaulayDuration(couponRate, faceValue, ytm, years) / (1 + ytm / 2);
}

/** Generate price sensitivity data for rate changes */
function generateRateSensitivity(couponRate, faceValue, ytm, years) {
  const points = [];
  for (let deltaRate = -2.0; deltaRate <= 2.0; deltaRate += 0.25) {
    const newYtm = Math.max(0.001, ytm + deltaRate / 100);
    const newPrice = bondPrice(couponRate, faceValue, newYtm, years);
    const pctChange = ((newPrice - bondPrice(couponRate, faceValue, ytm, years)) / bondPrice(couponRate, faceValue, ytm, years)) * 100;
    points.push({
      rateChange: deltaRate,
      price: parseFloat(newPrice.toFixed(2)),
      pctChange: parseFloat(pctChange.toFixed(2)),
    });
  }
  return points;
}

/** Generate bond ladder data */
function generateLadder(amount, numRungs, startYear, endYear, couponRate, ytm) {
  const rungs = [];
  const step = Math.max(1, Math.floor((endYear - startYear) / (numRungs - 1)));
  const perRung = amount / numRungs;
  for (let i = 0; i < numRungs; i++) {
    const maturity = startYear + i * step;
    const price = bondPrice(couponRate, 1000, ytm, maturity);
    const annualIncome = perRung * couponRate;
    rungs.push({
      year: maturity,
      invested: parseFloat(perRung.toFixed(0)),
      bondPrice: parseFloat(price.toFixed(2)),
      annualIncome: parseFloat(annualIncome.toFixed(0)),
      yield: parseFloat((couponRate * 100).toFixed(2)),
    });
  }
  return rungs;
}

/* ══════════════════════════════════════════════════════════════════════
   Bond Type Definitions & Education
   ══════════════════════════════════════════════════════════════════════ */

const BOND_TYPES = {
  treasury: {
    name: 'U.S. Treasury',
    risk: 'Very Low',
    riskColor: C.green,
    icon: '\u{1F3DB}',
    yield: '4.0 – 5.0%',
    description: 'Backed by the U.S. government. Considered the safest bonds in the world.',
    bestFor: 'Safety-first investors, emergency reserves, and portfolio stability.',
    taxNote: 'Interest is exempt from state and local taxes.',
    types: ['T-Bills (< 1yr)', 'T-Notes (2-10yr)', 'T-Bonds (20-30yr)', 'TIPS (inflation-protected)'],
  },
  corporate_ig: {
    name: 'Investment Grade Corporate',
    risk: 'Low-Medium',
    riskColor: C.blue,
    icon: '\u{1F3E2}',
    yield: '4.5 – 6.0%',
    description: 'Bonds from strong companies (rated BBB or higher). Higher yield than Treasuries with modest risk.',
    bestFor: 'Investors seeking higher income with manageable risk.',
    taxNote: 'Interest is fully taxable at federal, state, and local levels.',
    types: ['AAA-AA (highest quality)', 'A (upper medium)', 'BBB (medium grade)'],
  },
  corporate_hy: {
    name: 'High Yield (Junk)',
    risk: 'High',
    riskColor: C.red,
    icon: '\u{1F525}',
    yield: '6.0 – 10.0%',
    description: 'Bonds from lower-rated companies (BB or below). High yields compensate for higher default risk.',
    bestFor: 'Experienced investors comfortable with volatility seeking maximum income.',
    taxNote: 'Higher risk of default. Diversification is crucial.',
    types: ['BB (speculative)', 'B (highly speculative)', 'CCC and below (near default)'],
  },
  municipal: {
    name: 'Municipal Bonds',
    risk: 'Low',
    riskColor: C.green,
    icon: '\u{1F3D9}',
    yield: '3.0 – 4.5%',
    description: 'Issued by states, cities, and counties. Often tax-free, making effective yield higher.',
    bestFor: 'High-tax-bracket investors seeking tax-advantaged income.',
    taxNote: 'Interest is typically exempt from federal taxes, and often state taxes if you buy in-state.',
    types: ['General Obligation (backed by taxes)', 'Revenue (backed by project income)'],
  },
  tips: {
    name: 'TIPS / I-Bonds',
    risk: 'Very Low',
    riskColor: C.green,
    icon: '\u{1F6E1}',
    yield: 'Real yield + inflation',
    description: 'Treasury bonds that adjust for inflation. Your principal grows with CPI.',
    bestFor: 'Protecting purchasing power during high inflation periods.',
    taxNote: 'You pay tax on the inflation adjustment each year (phantom income).',
    types: ['TIPS (traded)', 'I-Bonds (non-traded, $10K/yr limit)'],
  },
};

const CREDIT_RATINGS = [
  { rating: 'AAA', label: 'Prime', color: C.green, desc: 'Highest quality. Extremely strong capacity to pay.' },
  { rating: 'AA', label: 'High Grade', color: C.green, desc: 'Very strong capacity. Minimal credit risk.' },
  { rating: 'A', label: 'Upper Medium', color: '#4ADE80', desc: 'Strong capacity. Somewhat susceptible to economic changes.' },
  { rating: 'BBB', label: 'Medium Grade', color: C.amber, desc: 'Adequate capacity. The lowest "investment grade" rating.' },
  { rating: 'BB', label: 'Speculative', color: '#F97316', desc: 'Less vulnerable near-term, but faces uncertainties.' },
  { rating: 'B', label: 'Highly Speculative', color: C.red, desc: 'More vulnerable to adverse conditions. Higher default risk.' },
  { rating: 'CCC', label: 'Substantial Risk', color: C.red, desc: 'Currently vulnerable. Dependent on favorable conditions.' },
];

/* ══════════════════════════════════════════════════════════════════════
   Sub-components
   ══════════════════════════════════════════════════════════════════════ */

const labelSt = { fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.textMuted, fontFamily: SANS };
const numSt = { fontFamily: MONO, fontVariantNumeric: 'tabular-nums' };

const SLIDER_STYLE_ID = 'bonds-tab-slider-styles';
function ensureSliderStyles() {
  if (document.getElementById(SLIDER_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = SLIDER_STYLE_ID;
  style.textContent = `
    .bonds-slider { -webkit-appearance: none; width: 100%; height: 4px; border-radius: 2px; background: ${C.border}; outline: none; }
    .bonds-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px; border-radius: 50%; background: ${C.accent}; cursor: pointer; border: 2px solid ${C.bg}; }
    .bonds-slider::-moz-range-thumb { width: 18px; height: 18px; border-radius: 50%; background: ${C.accent}; cursor: pointer; border: 2px solid ${C.bg}; }
  `;
  document.head.appendChild(style);
}

function SliderParam({ label, value, min, max, step, format, onChange }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.textMuted, fontFamily: SANS }}>
          {label}
        </span>
        <span style={{ fontSize: 14, fontWeight: 700, fontFamily: MONO, color: C.text, fontVariantNumeric: 'tabular-nums' }}>
          {format(value)}
        </span>
      </div>
      <input
        type="range" className="bonds-slider"
        min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
        <span style={{ fontSize: 10, color: C.textDim }}>{format(min)}</span>
        <span style={{ fontSize: 10, color: C.textDim }}>{format(max)}</span>
      </div>
    </div>
  );
}

/* ── Sensitivity Chart Tooltip ── */
const SensTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div style={{
      background: C.elevated, border: `1px solid ${C.border}`, borderRadius: 10,
      padding: '10px 14px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.text, ...numSt }}>
        Rate Change: {d.rateChange >= 0 ? '+' : ''}{d.rateChange.toFixed(2)}%
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginTop: 2, ...numSt }}>
        Bond Price: ${d.price.toFixed(2)}
      </div>
      <div style={{
        fontSize: 12, fontWeight: 700, marginTop: 2, ...numSt,
        color: d.pctChange >= 0 ? C.green : C.red,
      }}>
        {d.pctChange >= 0 ? '+' : ''}{d.pctChange.toFixed(2)}%
      </div>
    </div>
  );
};

/* ── Learn Tip (expandable) ── */
const LearnTip = ({ title, children }) => {
  const [open, setOpen] = useState(false);
  return (
    <div style={{
      background: C.accent + '08', border: `1px solid ${C.accent}22`, borderRadius: 12,
      overflow: 'hidden',
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer',
          color: C.accent, fontSize: 11, fontWeight: 700, minHeight: 40,
        }}
      >
        <span>{title}</span>
        <span style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', fontSize: 14 }}>&#9660;</span>
      </button>
      {open && (
        <div style={{
          padding: '0 14px 12px', fontSize: 12, color: C.textMuted, lineHeight: 1.7,
          animation: 'fadeSlideUp 0.2s ease-out',
        }}>
          {children}
        </div>
      )}
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════════════
   Sub-tab definitions
   ══════════════════════════════════════════════════════════════════════ */

const SUB_TABS = [
  { id: 'learn', label: 'Bond Types' },
  { id: 'calculator', label: 'Calculator' },
  { id: 'ladder', label: 'Ladder Builder' },
  { id: 'portfolio', label: 'My Bonds' },
];

/* ══════════════════════════════════════════════════════════════════════
   Main Component
   ══════════════════════════════════════════════════════════════════════ */

/**
 * Bond Education & Analysis Tab — similar to OptionsTab but for fixed income.
 * All calculations client-side.
 *
 * @param {Object} props
 * @param {import('../types').Holding[]} props.holdings
 */
export default function BondsTab({ holdings }) {
  ensureSliderStyles();

  const [activeSubTab, setActiveSubTab] = useState('learn');
  const [expandedBondType, setExpandedBondType] = useState(null);

  // Calculator state
  const [faceValue, setFaceValue] = useState(1000);
  const [couponRate, setCouponRate] = useState(4.5);
  const [ytm, setYtm] = useState(5.0);
  const [yearsToMaturity, setYearsToMaturity] = useState(10);

  // Ladder state
  const [ladderAmount, setLadderAmount] = useState(50000);
  const [ladderRungs, setLadderRungs] = useState(5);
  const [ladderStart, setLadderStart] = useState(1);
  const [ladderEnd, setLadderEnd] = useState(10);
  const [ladderCoupon, setLadderCoupon] = useState(4.5);
  const [ladderYtm, setLadderYtm] = useState(5.0);

  // Portfolio bond holdings state
  const [bondMetrics, setBondMetrics] = useState({});
  const [bondLoading, setBondLoading] = useState({});

  // Identify bond holdings
  const bondHoldings = useMemo(() =>
    holdings.filter(h => h.asset_class === 'bond' || h.asset_class === 'stable_value'),
    [holdings]
  );

  // Load bond metrics on portfolio sub-tab
  const loadBondMetrics = (ticker) => {
    if (bondMetrics[ticker] || bondLoading[ticker]) return;
    setBondLoading(prev => ({ ...prev, [ticker]: true }));
    api.getBondMetrics(ticker)
      .then(data => setBondMetrics(prev => ({ ...prev, [ticker]: data })))
      .catch(() => {})
      .finally(() => setBondLoading(prev => ({ ...prev, [ticker]: false })));
  };

  // Calculator computed values
  const calcPrice = useMemo(() =>
    bondPrice(couponRate / 100, faceValue, ytm / 100, yearsToMaturity),
    [couponRate, faceValue, ytm, yearsToMaturity]
  );

  const calcDuration = useMemo(() =>
    macaulayDuration(couponRate / 100, faceValue, ytm / 100, yearsToMaturity),
    [couponRate, faceValue, ytm, yearsToMaturity]
  );

  const calcModDuration = useMemo(() =>
    modifiedDuration(couponRate / 100, faceValue, ytm / 100, yearsToMaturity),
    [couponRate, faceValue, ytm, yearsToMaturity]
  );

  const sensitivityData = useMemo(() =>
    generateRateSensitivity(couponRate / 100, faceValue, ytm / 100, yearsToMaturity),
    [couponRate, faceValue, ytm, yearsToMaturity]
  );

  const currentYield = useMemo(() =>
    calcPrice > 0 ? ((faceValue * couponRate / 100) / calcPrice * 100) : 0,
    [faceValue, couponRate, calcPrice]
  );

  // Ladder computed values
  const ladderData = useMemo(() =>
    generateLadder(ladderAmount, ladderRungs, ladderStart, ladderEnd, ladderCoupon / 100, ladderYtm / 100),
    [ladderAmount, ladderRungs, ladderStart, ladderEnd, ladderCoupon, ladderYtm]
  );

  const totalLadderIncome = useMemo(() =>
    ladderData.reduce((sum, r) => sum + r.annualIncome, 0),
    [ladderData]
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── Header ──────────────────────────────────────── */}
      <div style={{ ...cardStyle, padding: 16, background: `linear-gradient(135deg, ${C.card} 0%, #1a1a2e 100%)` }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 4 }}>
          Bond Fundamentals
        </div>
        <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.6 }}>
          Understand fixed income, build bond ladders, and analyze how interest rates affect your portfolio.
          Bonds are the foundation of a diversified portfolio — learn to use them wisely.
        </div>
      </div>

      {/* ── Sub-tab pills ───────────────────────────────── */}
      <div style={{
        display: 'flex', gap: 2,
        background: C.bg, borderRadius: 10, padding: 3,
        border: `1px solid ${C.border}`, overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
      }}>
        {SUB_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            style={{
              padding: '7px 14px', borderRadius: 8, border: 'none', minHeight: 36,
              fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
              background: activeSubTab === tab.id ? C.accent : 'transparent',
              color: activeSubTab === tab.id ? '#fff' : C.textMuted,
              transition: 'background 0.15s, color 0.15s', flexShrink: 0,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ══ LEARN TAB ════════════════════════════════════ */}
      {activeSubTab === 'learn' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, animation: 'fadeSlideUp 0.3s ease-out' }}>
          {/* Bond type cards */}
          {Object.entries(BOND_TYPES).map(([key, bond], i) => {
            const isExpanded = expandedBondType === key;
            return (
              <button
                key={key}
                onClick={() => setExpandedBondType(isExpanded ? null : key)}
                style={{
                  ...cardStyle, padding: 16, textAlign: 'left', cursor: 'pointer', width: '100%',
                  border: `1px solid ${isExpanded ? bond.riskColor + '44' : C.border}`,
                  background: isExpanded ? bond.riskColor + '08' : C.card,
                  transition: 'border-color 0.2s, background 0.2s',
                  animation: 'fadeSlideUp 0.3s ease-out both',
                  animationDelay: `${i * 0.06}s`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 24 }}>{bond.icon}</span>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{bond.name}</div>
                      <div style={{ fontSize: 11, color: C.textDim }}>Typical yield: {bond.yield}</div>
                    </div>
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                    background: bond.riskColor + '22', color: bond.riskColor,
                  }}>
                    {bond.risk}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.6 }}>
                  {bond.description}
                </div>

                {isExpanded && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}`, animation: 'fadeSlideUp 0.2s ease-out' }}>
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: C.text, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Best For</div>
                      <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.6 }}>{bond.bestFor}</div>
                    </div>
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: C.text, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Tax Treatment</div>
                      <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.6 }}>{bond.taxNote}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: C.text, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Sub-types</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {bond.types.map((t, j) => (
                          <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 4, height: 4, borderRadius: 2, background: bond.riskColor, flexShrink: 0 }} />
                            <span style={{ fontSize: 11, color: C.textMuted }}>{t}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </button>
            );
          })}

          {/* Credit Rating Guide */}
          <div style={{ ...cardStyle, padding: 16 }}>
            <div style={{ ...labelSt, marginBottom: 12 }}>Credit Rating Scale</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {CREDIT_RATINGS.map((cr, i) => (
                <div key={cr.rating} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                  background: C.elevated, borderRadius: 8,
                  animation: 'fadeSlideUp 0.25s ease-out both',
                  animationDelay: `${i * 0.04}s`,
                }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: cr.color, fontFamily: MONO, minWidth: 36 }}>{cr.rating}</span>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: C.text }}>{cr.label}</span>
                    <span style={{ fontSize: 10, color: C.textDim, marginLeft: 8 }}>{cr.desc}</span>
                  </div>
                </div>
              ))}
            </div>
            <div style={{
              marginTop: 10, padding: '8px 10px', borderRadius: 8,
              background: C.amber + '12', border: `1px solid ${C.amber}22`,
              fontSize: 11, color: C.amber, lineHeight: 1.5,
            }}>
              Investment grade: BBB and above. Below BBB = &quot;junk&quot; or &quot;high yield.&quot;
            </div>
          </div>

          {/* Learning tips */}
          <LearnTip title="Learn: The Inverse Relationship">
            <p style={{ margin: '0 0 8px' }}>When interest rates <strong style={{ color: C.red }}>go up</strong>, bond prices <strong style={{ color: C.red }}>go down</strong>, and vice versa. This is the most important concept in bond investing.</p>
            <p style={{ margin: '0 0 8px' }}>Why? Because existing bonds with lower coupons become less attractive when new bonds offer higher rates. The market adjusts by lowering the price of existing bonds.</p>
            <p style={{ margin: 0 }}>Longer-duration bonds are MORE sensitive to rate changes. A 30-year Treasury will move much more than a 2-year note for the same rate change.</p>
          </LearnTip>

          <LearnTip title="Learn: Duration — Your Risk Ruler">
            <p style={{ margin: '0 0 8px' }}><strong style={{ color: C.text }}>Duration</strong> measures how sensitive a bond is to interest rate changes. A duration of 5 means if rates rise 1%, the bond loses about 5% of its value.</p>
            <p style={{ margin: '0 0 8px' }}>Short duration (1-3 years) = less rate risk. Long duration (10+ years) = more rate risk but potentially higher yields.</p>
            <p style={{ margin: 0 }}>Pro tip: Match your bond duration to your investment horizon. If you need the money in 5 years, target bonds with ~5 year duration.</p>
          </LearnTip>
        </div>
      )}

      {/* ══ CALCULATOR TAB ═══════════════════════════════ */}
      {activeSubTab === 'calculator' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, animation: 'fadeSlideUp 0.3s ease-out' }}>
          {/* Parameters */}
          <div style={{ ...cardStyle }}>
            <div style={{ ...labelSt, marginBottom: 16 }}>Bond Parameters</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
              <SliderParam label="Face Value" value={faceValue} min={100} max={10000} step={100} format={v => `$${v.toLocaleString()}`} onChange={setFaceValue} />
              <SliderParam label="Coupon Rate" value={couponRate} min={0} max={10} step={0.25} format={v => `${v.toFixed(2)}%`} onChange={setCouponRate} />
              <SliderParam label="Yield to Maturity (YTM)" value={ytm} min={0.5} max={15} step={0.25} format={v => `${v.toFixed(2)}%`} onChange={setYtm} />
              <SliderParam label="Years to Maturity" value={yearsToMaturity} min={1} max={30} step={1} format={v => `${v}yr`} onChange={setYearsToMaturity} />
            </div>
          </div>

          {/* Results */}
          <div style={{ ...cardStyle }}>
            <div style={{ ...labelSt, marginBottom: 16 }}>Bond Valuation</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 14 }}>
              <div>
                <div style={{ fontSize: 9, color: C.textDim, textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Bond Price</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: calcPrice > faceValue ? C.green : calcPrice < faceValue ? C.red : C.text, marginTop: 2, ...numSt }}>
                  ${calcPrice.toFixed(2)}
                </div>
                <div style={{ fontSize: 10, color: C.textDim }}>
                  {calcPrice > faceValue ? 'Premium' : calcPrice < faceValue ? 'Discount' : 'At Par'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 9, color: C.textDim, textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Current Yield</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: C.amber, marginTop: 2, ...numSt }}>
                  {currentYield.toFixed(2)}%
                </div>
                <div style={{ fontSize: 10, color: C.textDim }}>Annual income / price</div>
              </div>
              <div>
                <div style={{ fontSize: 9, color: C.textDim, textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Duration</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: C.blue, marginTop: 2, ...numSt }}>
                  {calcDuration.toFixed(2)}yr
                </div>
                <div style={{ fontSize: 10, color: C.textDim }}>Macaulay</div>
              </div>
              <div>
                <div style={{ fontSize: 9, color: C.textDim, textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Mod. Duration</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: C.purple, marginTop: 2, ...numSt }}>
                  {calcModDuration.toFixed(2)}
                </div>
                <div style={{ fontSize: 10, color: C.textDim }}>Price sensitivity</div>
              </div>
              <div>
                <div style={{ fontSize: 9, color: C.textDim, textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Annual Income</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: C.green, marginTop: 2, ...numSt }}>
                  ${(faceValue * couponRate / 100).toFixed(0)}
                </div>
                <div style={{ fontSize: 10, color: C.textDim }}>Per {faceValue.toLocaleString()} face</div>
              </div>
              <div>
                <div style={{ fontSize: 9, color: C.textDim, textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Total Return</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: C.text, marginTop: 2, ...numSt }}>
                  ${(faceValue * couponRate / 100 * yearsToMaturity + faceValue - calcPrice).toFixed(0)}
                </div>
                <div style={{ fontSize: 10, color: C.textDim }}>Coupons + cap gain/loss</div>
              </div>
            </div>
          </div>

          {/* Rate Sensitivity Chart */}
          <div style={{ ...cardStyle }}>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Interest Rate Sensitivity</div>
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
                How this bond&apos;s price changes when rates move
              </div>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={sensitivityData} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
                <defs>
                  <linearGradient id="bondSensGradPos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.green} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={C.green} stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="bondSensGradNeg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.red} stopOpacity={0.02} />
                    <stop offset="100%" stopColor={C.red} stopOpacity={0.3} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={C.chartGrid} strokeDasharray="4 4" />
                <XAxis
                  dataKey="rateChange"
                  tick={{ fill: C.textDim, fontSize: 10, fontFamily: MONO }}
                  tickLine={false} axisLine={false}
                  tickFormatter={v => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`}
                />
                <YAxis
                  tick={{ fill: C.textDim, fontSize: 10, fontFamily: MONO }}
                  tickLine={false} axisLine={false}
                  tickFormatter={v => `$${v.toFixed(0)}`}
                  width={50}
                />
                <Tooltip content={<SensTooltip />} cursor={{ stroke: C.chartCrosshair, strokeDasharray: '4 4' }} />
                <ReferenceLine x={0} stroke={C.accent} strokeDasharray="4 4" label={{ value: 'Now', fill: C.accent, fontSize: 10, position: 'top' }} />
                <Area type="monotone" dataKey="price" stroke={C.accent} strokeWidth={2} fill="url(#bondSensGradPos)" dot={false} activeDot={{ r: 4, fill: C.accent }} />
              </AreaChart>
            </ResponsiveContainer>

            {/* Impact summary */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: 10, marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.border}`,
            }}>
              <div style={{ padding: 10, background: C.elevated, borderRadius: 8 }}>
                <div style={{ fontSize: 9, fontWeight: 600, color: C.red, textTransform: 'uppercase', marginBottom: 4 }}>If rates rise 1%</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.red, ...numSt }}>
                  {((-calcModDuration * 1)).toFixed(1)}%
                </div>
                <div style={{ fontSize: 10, color: C.textDim }}>~${Math.abs(calcPrice * calcModDuration * 0.01).toFixed(0)} loss</div>
              </div>
              <div style={{ padding: 10, background: C.elevated, borderRadius: 8 }}>
                <div style={{ fontSize: 9, fontWeight: 600, color: C.green, textTransform: 'uppercase', marginBottom: 4 }}>If rates fall 1%</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.green, ...numSt }}>
                  +{(calcModDuration * 1).toFixed(1)}%
                </div>
                <div style={{ fontSize: 10, color: C.textDim }}>~${Math.abs(calcPrice * calcModDuration * 0.01).toFixed(0)} gain</div>
              </div>
            </div>
          </div>

          <LearnTip title="Learn: Premium vs Discount Bonds">
            <p style={{ margin: '0 0 8px' }}>When a bond&apos;s coupon rate is <strong style={{ color: C.green }}>higher</strong> than current market yields, it trades at a <strong style={{ color: C.green }}>premium</strong> (above face value). Investors pay more for the higher income stream.</p>
            <p style={{ margin: '0 0 8px' }}>When the coupon is <strong style={{ color: C.red }}>lower</strong> than market yields, it trades at a <strong style={{ color: C.red }}>discount</strong>. You pay less, but get a lower coupon.</p>
            <p style={{ margin: 0 }}>At maturity, ALL bonds return to face value (par). So discount bonds have built-in capital gains, while premium bonds have capital losses at maturity.</p>
          </LearnTip>
        </div>
      )}

      {/* ══ LADDER BUILDER TAB ═══════════════════════════ */}
      {activeSubTab === 'ladder' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, animation: 'fadeSlideUp 0.3s ease-out' }}>
          {/* Explainer */}
          <div style={{ ...cardStyle, padding: 14, borderColor: C.accent + '33' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 4 }}>What is a Bond Ladder?</div>
            <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.6 }}>
              A bond ladder spreads your investment across bonds with staggered maturity dates. As each bond matures, you reinvest at current rates — reducing interest rate risk while maintaining steady income.
            </div>
          </div>

          {/* Parameters */}
          <div style={{ ...cardStyle }}>
            <div style={{ ...labelSt, marginBottom: 16 }}>Ladder Parameters</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
              <SliderParam label="Total Investment" value={ladderAmount} min={5000} max={500000} step={5000} format={v => `$${(v/1000).toFixed(0)}K`} onChange={setLadderAmount} />
              <SliderParam label="Number of Rungs" value={ladderRungs} min={2} max={10} step={1} format={v => `${v}`} onChange={setLadderRungs} />
              <SliderParam label="Shortest Maturity" value={ladderStart} min={1} max={5} step={1} format={v => `${v}yr`} onChange={setLadderStart} />
              <SliderParam label="Longest Maturity" value={ladderEnd} min={5} max={30} step={1} format={v => `${v}yr`} onChange={setLadderEnd} />
              <SliderParam label="Avg Coupon Rate" value={ladderCoupon} min={1} max={8} step={0.25} format={v => `${v.toFixed(2)}%`} onChange={setLadderCoupon} />
              <SliderParam label="Avg YTM" value={ladderYtm} min={1} max={10} step={0.25} format={v => `${v.toFixed(2)}%`} onChange={setLadderYtm} />
            </div>
          </div>

          {/* Ladder visualization */}
          <div style={{ ...cardStyle }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Your Bond Ladder</div>
                <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
                  {ladderRungs} rungs, ${(ladderAmount / ladderRungs).toLocaleString()} per rung
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, color: C.textDim, textTransform: 'uppercase', fontWeight: 600 }}>Annual Income</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: C.green, ...numSt }}>${totalLadderIncome.toLocaleString()}</div>
              </div>
            </div>

            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={ladderData} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
                <CartesianGrid vertical={false} stroke={C.chartGrid} strokeDasharray="4 4" />
                <XAxis
                  dataKey="year"
                  tick={{ fill: C.textDim, fontSize: 10, fontFamily: MONO }}
                  tickLine={false} axisLine={false}
                  tickFormatter={v => `${v}yr`}
                />
                <YAxis
                  tick={{ fill: C.textDim, fontSize: 10, fontFamily: MONO }}
                  tickLine={false} axisLine={false}
                  tickFormatter={v => `$${(v/1000).toFixed(0)}K`}
                  width={42}
                />
                <Tooltip
                  cursor={{ fill: C.accent + '08' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0]?.payload;
                    if (!d) return null;
                    return (
                      <div style={{
                        background: C.elevated, border: `1px solid ${C.border}`, borderRadius: 10,
                        padding: '10px 14px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                      }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Maturity: {d.year} years</div>
                        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4, ...numSt }}>Invested: ${d.invested.toLocaleString()}</div>
                        <div style={{ fontSize: 11, color: C.green, marginTop: 2, ...numSt }}>Annual income: ${d.annualIncome.toLocaleString()}</div>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="invested" fill={C.accent} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>

            {/* Ladder rungs table */}
            <div style={{ marginTop: 14, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 4px' }}>
                <thead>
                  <tr>
                    {['Maturity', 'Invested', 'Income/yr', 'Yield'].map(h => (
                      <th key={h} style={{ fontSize: 9, color: C.textDim, fontWeight: 600, textTransform: 'uppercase', padding: '4px 8px', textAlign: 'right' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ladderData.map((rung, i) => (
                    <tr key={i}>
                      <td style={{ padding: '6px 8px', background: C.elevated, borderRadius: '6px 0 0 6px', fontSize: 12, fontWeight: 700, color: C.text, textAlign: 'right', ...numSt }}>{rung.year}yr</td>
                      <td style={{ padding: '6px 8px', background: C.elevated, fontSize: 12, color: C.text, textAlign: 'right', ...numSt }}>${rung.invested.toLocaleString()}</td>
                      <td style={{ padding: '6px 8px', background: C.elevated, fontSize: 12, color: C.green, fontWeight: 600, textAlign: 'right', ...numSt }}>${rung.annualIncome.toLocaleString()}</td>
                      <td style={{ padding: '6px 8px', background: C.elevated, borderRadius: '0 6px 6px 0', fontSize: 12, color: C.amber, textAlign: 'right', ...numSt }}>{rung.yield}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <LearnTip title="Learn: Why Ladder Your Bonds?">
            <p style={{ margin: '0 0 8px' }}>A bond ladder gives you the best of both worlds: <strong style={{ color: C.text }}>predictable income</strong> like long-term bonds, with <strong style={{ color: C.text }}>reinvestment flexibility</strong> like short-term bonds.</p>
            <p style={{ margin: '0 0 8px' }}>If rates rise, your maturing short bonds can be reinvested at higher rates. If rates fall, your existing long bonds lock in the higher rate.</p>
            <p style={{ margin: 0 }}>A common strategy: build a 10-rung ladder (1-10 years). Each year, the shortest bond matures and you reinvest at the 10-year rate, automatically maintaining the ladder.</p>
          </LearnTip>
        </div>
      )}

      {/* ══ MY BONDS TAB ═════════════════════════════════ */}
      {activeSubTab === 'portfolio' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, animation: 'fadeSlideUp 0.3s ease-out' }}>
          {bondHoldings.length === 0 ? (
            <div style={{ ...cardStyle, padding: 40, textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>{'\u{1F4B0}'}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 6 }}>No Bond Holdings</div>
              <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.6, maxWidth: 300, margin: '0 auto' }}>
                Add bond funds or ETFs (like BND, AGG, TLT) to your portfolio to see bond-specific analytics here.
                You can also use the Calculator and Ladder Builder to plan your bond allocation.
              </div>
            </div>
          ) : (
            <>
              {/* Bond holdings summary */}
              <div style={{ ...cardStyle, padding: 16 }}>
                <div style={{ ...labelSt, marginBottom: 12 }}>Bond Allocation</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 9, color: C.textDim, textTransform: 'uppercase', fontWeight: 600 }}>Total Bond Value</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: C.text, ...numSt }}>
                      ${bondHoldings.reduce((s, h) => s + h.market_value, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: C.textDim, textTransform: 'uppercase', fontWeight: 600 }}>Positions</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: C.blue, ...numSt }}>{bondHoldings.length}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: C.textDim, textTransform: 'uppercase', fontWeight: 600 }}>Avg Gain/Loss</div>
                    {(() => {
                      const avgGL = bondHoldings.reduce((s, h) => s + (h.gain_loss_pct || 0), 0) / bondHoldings.length;
                      return (
                        <div style={{ fontSize: 20, fontWeight: 700, color: avgGL >= 0 ? C.green : C.red, ...numSt }}>
                          {avgGL >= 0 ? '+' : ''}{avgGL.toFixed(1)}%
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* Individual bond holdings */}
              {bondHoldings.map((h, i) => {
                const gl = h.gain_loss || 0;
                const glPct = h.gain_loss_pct || 0;
                const glColor = gl >= 0 ? C.green : C.red;
                const metrics = bondMetrics[h.ticker];
                const isLoadingMetrics = bondLoading[h.ticker];

                return (
                  <button
                    key={h.id || h.ticker}
                    onClick={() => loadBondMetrics(h.ticker)}
                    style={{
                      ...cardStyle, padding: 14, textAlign: 'left', cursor: 'pointer', width: '100%',
                      animation: 'fadeSlideUp 0.3s ease-out both',
                      animationDelay: `${i * 0.05}s`,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div>
                        <span style={{ fontSize: 14, fontWeight: 700, color: C.text, fontFamily: MONO }}>{h.ticker}</span>
                        {h.manual_name && <span style={{ fontSize: 11, color: C.textDim, marginLeft: 8 }}>{h.manual_name}</span>}
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: glColor, ...numSt }}>
                        {glPct >= 0 ? '+' : ''}{glPct.toFixed(1)}%
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 9, color: C.textDim, textTransform: 'uppercase', fontWeight: 600 }}>Value</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.text, ...numSt }}>${h.market_value.toFixed(0)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 9, color: C.textDim, textTransform: 'uppercase', fontWeight: 600 }}>Shares</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.text, ...numSt }}>{h.shares.toFixed(2)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 9, color: C.textDim, textTransform: 'uppercase', fontWeight: 600 }}>Gain/Loss</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: glColor, ...numSt }}>
                          {gl >= 0 ? '+' : ''}${Math.abs(gl).toFixed(0)}
                        </div>
                      </div>
                    </div>

                    {/* Bond-specific metrics (loaded on click) */}
                    {isLoadingMetrics && (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}`, fontSize: 11, color: C.textDim }}>
                        Loading bond metrics...
                      </div>
                    )}
                    {metrics && !isLoadingMetrics && (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}`, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                        {metrics.yield_ttm != null && (
                          <div>
                            <div style={{ fontSize: 8, color: C.textDim, textTransform: 'uppercase', fontWeight: 600 }}>Yield (TTM)</div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: C.amber, ...numSt }}>{(metrics.yield_ttm * 100).toFixed(2)}%</div>
                          </div>
                        )}
                        {metrics.effective_duration != null && (
                          <div>
                            <div style={{ fontSize: 8, color: C.textDim, textTransform: 'uppercase', fontWeight: 600 }}>Duration</div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: C.blue, ...numSt }}>{metrics.effective_duration.toFixed(1)}yr</div>
                          </div>
                        )}
                        {metrics.credit_quality && (
                          <div>
                            <div style={{ fontSize: 8, color: C.textDim, textTransform: 'uppercase', fontWeight: 600 }}>Credit</div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{metrics.credit_quality}</div>
                          </div>
                        )}
                        {metrics.total_assets != null && (
                          <div>
                            <div style={{ fontSize: 8, color: C.textDim, textTransform: 'uppercase', fontWeight: 600 }}>Fund Size</div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: C.text, ...numSt }}>
                              {metrics.total_assets >= 1e9 ? `$${(metrics.total_assets / 1e9).toFixed(1)}B` : `$${(metrics.total_assets / 1e6).toFixed(0)}M`}
                            </div>
                          </div>
                        )}
                        {metrics.expense_ratio != null && (
                          <div>
                            <div style={{ fontSize: 8, color: C.textDim, textTransform: 'uppercase', fontWeight: 600 }}>Expense</div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: C.text, ...numSt }}>{(metrics.expense_ratio * 100).toFixed(2)}%</div>
                          </div>
                        )}
                      </div>
                    )}
                    {!metrics && !isLoadingMetrics && (
                      <div style={{ marginTop: 8, fontSize: 10, color: C.accent }}>
                        Tap to load bond metrics
                      </div>
                    )}
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* ── Disclaimer ──────────────────────────────────── */}
      <div style={{
        fontSize: 10, color: C.textDim, textAlign: 'center',
        padding: '12px 0', borderTop: `1px solid ${C.border}`,
      }}>
        Bond calculations are approximations for educational purposes. Actual bond prices depend on market conditions, credit spreads, and liquidity. Not financial advice.
      </div>
    </div>
  );
}
