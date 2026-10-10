/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import { Activity, Zap, RotateCcw, Cpu, Waves, Gauge, Eye, EyeOff, Lock, Play, Pause, SkipBack } from "lucide-react";

/* ---------- Circuit catalogue ---------- */
interface CircuitConfig {
  ph: number;
  wave: "h" | "f";
  controlled: boolean;
  kind: string;
  label: string;
}

const CIRCUITS: Record<string, CircuitConfig> = {};
[1, 3].forEach((ph) => (["d", "t"] as const).forEach((dv) => (["h", "f"] as const).forEach((w) => {
  CIRCUITS[`${ph}${dv}${w}`] = {
    ph,
    wave: w,
    controlled: dv === "t",
    kind: `${ph}${w}`,
    label: `${ph}-Phase ${dv === "t" ? "Thyristor" : "Diode"} ${w === "h" ? "Half-Wave" : "Full-Wave"}`,
  };
})));

const DEFAULTS = { vm: 325, freq: 50, R: 10, L: 20, alpha: 30 };
const rad = (d: number) => (d * Math.PI) / 180;
const TWO_PI = 2 * Math.PI;
const PAIRS = [["T1", "T6"], ["T1", "T2"], ["T3", "T2"], ["T3", "T4"], ["T5", "T4"], ["T5", "T6"]];

interface WaveformPoint {
  t: number;
  vs: number;
  vb: number;
  vc: number;
  vo: number;
  io: number;
  act: string[];
}

interface GenerateParams {
  circuit: string;
  vm: number;
  freq: number;
  R: number;
  L: number;
  alpha: number;
}

/* ---------- Mock waveform generator ---------- */
function generateWaveforms({ circuit, vm, freq, R, L, alpha }: GenerateParams): WaveformPoint[] {
  const cfg = CIRCUITS[circuit] || CIRCUITS["1dh"];
  const pre = cfg.controlled ? "T" : "D";
  const periods = 2;
  const warmup = 2;
  const perCycle = 300;
  const dt = 1 / freq / perCycle;
  const Lh = L / 1000;
  const a = cfg.controlled ? rad(alpha) : 0;
  const data: WaveformPoint[] = [];
  let i = 0;
  let on = false;
  let s = 1;

  for (let n = 0; n < (periods + warmup) * perCycle; n++) {
    const th = (n / perCycle) * TWO_PI;
    const ph = ((th % TWO_PI) + TWO_PI) % TWO_PI;
    const vs = vm * Math.sin(th);
    const vb = vm * Math.sin(th - TWO_PI / 3);
    const vc = vm * Math.sin(th - (2 * TWO_PI) / 3);
    let vo = 0;
    let io = 0;
    let act: string[] = [];

    if (cfg.ph === 3) {
      // pulses start at 30° + alpha (natural commutation point)
      const u = (((th - a - Math.PI / 6) % TWO_PI) + TWO_PI) % TWO_PI;
      if (cfg.wave === "f") {
        // 6-pulse bridge
        vo = Math.sqrt(3) * vm * Math.cos((u % (Math.PI / 3)) - Math.PI / 6 + a); // segment of line voltage, delayed by alpha
        act = PAIRS[Math.floor(u / (Math.PI / 3)) % 6].map((x) => pre + x.slice(1));
      } else {
        // 3-pulse, common cathode, neutral return
        const q = Math.floor(u / (TWO_PI / 3)) % 3;
        vo = vm * Math.sin(th - (q * TWO_PI) / 3);
        act = [pre + (q + 1)];
      }
      io = vo / R;
    } else {
      const sign = Math.sin(th) >= 0 ? 1 : -1;
      const half = cfg.wave === "h" ? ph : ph % Math.PI;
      const canFire = cfg.wave === "h" ? sign > 0 : true;
      if (!on && canFire && half >= a && Math.abs(vs) > 1e-6) {
        on = true;
        s = sign;
      }
      // bridge: the other pair takes over only once it is fired (alpha after zero crossing)
      if (on && cfg.wave === "f" && s !== sign && half >= a && Math.abs(vs) > 0) {
        s = sign;
      }
      if (on) {
        const v = cfg.wave === "h" ? vs : s * vs;
        if (Lh < 1e-6) {
          i = Math.max(0, v / R);
        } else {
          i += (dt * (v - R * i)) / Lh;
        }
        if (i <= 0) {
          i = 0;
          on = false;
        } else {
          vo = v;
          io = i;
          act = cfg.wave === "h" ? [pre + "1"] : s > 0 ? [pre + "1", pre + "4"] : [pre + "2", pre + "3"];
        }
      }
    }
    if (n >= warmup * perCycle) {
      data.push({
        t: +(((n - warmup * perCycle) * dt) * 1000).toFixed(3),
        vs,
        vb,
        vc,
        vo,
        io,
        act,
      });
    }
  }
  return data;
}

/* ---------- Schematic & SVG Helpers ---------- */
const WIRE = "#94a3b8";
const W = { stroke: WIRE, strokeWidth: 2, fill: "none", strokeLinejoin: "round" as const };
const Txt = (p: React.SVGProps<SVGTextElement>) => (
  <text fill="#94a3b8" fontSize="12" fontFamily="ui-monospace, monospace" {...p} />
);
const Dot = ({ x, y }: { x: number; y: number }) => <circle cx={x} cy={y} r="3.2" fill={WIRE} />;
const Arrow = ({ x, y, label }: { x: number; y: number; label: string }) => (
  <g>
    <polygon points={`${x - 6},${y - 4.5} ${x + 6},${y} ${x - 6},${y + 4.5}`} fill="#fbbf24" />
    <Txt x={x - 6} y={y - 9} fill="#fbbf24">{label}</Txt>
  </g>
);

const Device = ({ x, y, rot = 0, scr = false, on = false }: { x: number; y: number; rot?: number; scr?: boolean; on?: boolean }) => (
  <g
    transform={`translate(${x} ${y}) rotate(${rot})`}
    stroke={on ? "#fde047" : scr ? "#f472b6" : "#22d3ee"}
    strokeWidth="2"
    fill="none"
    opacity={on ? 1 : 0.6}
    style={on ? { filter: "drop-shadow(0 0 6px rgba(253,224,71,0.5))" } : undefined}
  >
    <path d="M-20 0H-8M8 0H20" stroke={on ? "#fde047" : WIRE} />
    <polygon points="-8,-9 -8,9 8,0" fill={on ? "#fde047" : "#0f172a"} fillOpacity={on ? 0.6 : 1} strokeLinejoin="round" />
    <path d="M8 -9V9" strokeWidth="3" />
    {scr && <path d="M2 3.4L10 14H22" strokeWidth="1.6" />}
  </g>
);

const Flow = ({ d, ph, dir = 1, k }: { d: string; ph: number; dir?: number; k: number }) => (
  <g fill="none" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} stroke="#fbbf24" strokeOpacity="0.25" strokeWidth={4 + 5 * k} />
    <path d={d} stroke="#fde68a" strokeWidth={2 + 2.5 * k} strokeDasharray="5 9" strokeDashoffset={-dir * ph} />
  </g>
);

const Source = ({ x, y, r = 20 }: { x: number; y: number; r?: number }) => (
  <g transform={`translate(${x} ${y})`} fill="#0f172a" stroke="#34d399" strokeWidth="2">
    <circle r={r} />
    <path d={`M${-r * 0.45} 0q${r * 0.225} ${-r * 0.45} ${r * 0.45} 0t${r * 0.45} 0`} fill="none" />
  </g>
);

const Load = ({ x, y1, y2 }: { x: number; y1: number; y2: number }) => {
  const rc = y1 + (y2 - y1) * 0.33;
  const lc = y1 + (y2 - y1) * 0.68;
  const amber = { fill: "none", stroke: "#fbbf24", strokeWidth: 2, strokeLinejoin: "round" as const };
  return (
    <g>
      <path d={`M${x} ${y1}V${rc - 20}M${x} ${rc + 20}V${lc - 20}M${x} ${lc + 20}V${y2}`} {...W} />
      <g transform={`translate(${x} ${rc}) rotate(90)`} {...amber}>
        <polyline points="-20,0 -14,0 -10.5,-6 -3.5,6 3.5,-6 10.5,6 14,0 20,0" />
      </g>
      <g transform={`translate(${x} ${lc}) rotate(90)`} {...amber}>
        <path d="M-20 0H-16a4 4 0 0 1 8 0a4 4 0 0 1 8 0a4 4 0 0 1 8 0a4 4 0 0 1 8 0H20" />
      </g>
      <Txt x={x - 24} y={rc + 4} fill="#fbbf24">R</Txt>
      <Txt x={x - 22} y={lc + 4} fill="#fbbf24">L</Txt>
      <path d={`M${x + 34} ${y1 + 8}V${y2 - 8}`} stroke="#475569" strokeWidth="1" strokeDasharray="3 3" />
      <Txt x={x + 40} y={y1 + 16} fill="#4ade80">+</Txt>
      <Txt x={x + 40} y={(y1 + y2) / 2 + 4} fill="#4ade80">vo</Txt>
      <Txt x={x + 40} y={y2 - 6} fill="#4ade80">−</Txt>
    </g>
  );
};

const PH = ["M76 45H110V105H190", "M76 120H183a7 7 0 0 1 14 0H250", "M76 195H130V135H183a7 7 0 0 1 14 0H243a7 7 0 0 1 14 0H310"];
const LEGX = [190, 250, 310];
const JY = [105, 120, 135];
const SY = [45, 120, 195];

const ThreeFlow = ({ act, ph, k, pre }: { act: string[]; ph: number; k: number; pre: string }) => {
  const X = [pre + "1", pre + "3", pre + "5"].indexOf(act[0]);
  const Y = [pre + "4", pre + "6", pre + "2"].indexOf(act[1]);
  if (X < 0 || Y < 0) return null;
  const segs: [string, number][] = [
    [PH[X], 1],
    [`M${LEGX[X]} ${JY[X]}V30H440V210H${LEGX[Y]}V${JY[Y]}`, 1],
    [PH[Y], -1],
    [`M44 ${SY[Y]}H22V${SY[X]}H44`, 1],
  ];
  return (
    <>
      {segs.map(([d, dir], i) => (
        <Flow key={i} d={d} dir={dir} ph={ph} k={k} />
      ))}
    </>
  );
};

function Schematic({ circuit, act = [], ph = 0, k = 0 }: { circuit: string; act?: string[]; ph?: number; k?: number }) {
  const cfg = CIRCUITS[circuit] || CIRCUITS["1dh"];
  const scr = cfg.controlled;
  const pre = scr ? "T" : "D";
  const kind = cfg.kind;
  const dc = scr ? "#f472b6" : "#22d3ee";
  const on = (n: number | string) => act.includes(pre + n);

  return (
    <svg viewBox="0 0 520 240" className="w-full h-full max-h-full" role="img" aria-label={`${cfg.label} schematic`}>
      {kind === "1h" && (
        <>
          <path d="M70 100V50H400M400 190H70V140" {...W} />
          {act.length > 0 && <Flow d="M70 100V50H400V190H70V140" ph={ph} k={k} />}
          <Device x={200} y={50} scr={scr} on={on(1)} />
          <Source x={70} y={120} />
          <Load x={400} y1={50} y2={190} />
          <Txt x={26} y={124} fill="#34d399">vs</Txt>
          <Txt x={192} y={30} fill={dc}>{pre}1</Txt>
          <Arrow x={320} y={50} label="io" />
        </>
      )}

      {kind === "1f" && (
        <>
          <path d="M140 40V200M300 40V200M140 40H440M140 200H440M140 120H200M240 120H300" {...W} />
          {act.length > 0 && (
            <Flow
              d={act[0] === pre + "1" ? "M200 120H140V40H440V200H300V120H240" : "M240 120H300V40H440V200H140V120H200"}
              ph={ph}
              k={k}
            />
          )}
          <Device x={140} y={80} rot={-90} scr={scr} on={on(1)} />
          <Device x={140} y={160} rot={-90} scr={scr} on={on(3)} />
          <Device x={300} y={80} rot={-90} scr={scr} on={on(2)} />
          <Device x={300} y={160} rot={-90} scr={scr} on={on(4)} />
          <Source x={220} y={120} />
          <Dot x={140} y={120} /><Dot x={300} y={120} /><Dot x={300} y={40} /><Dot x={300} y={200} />
          <Load x={440} y1={40} y2={200} />
          <Txt x={220} y={90} textAnchor="middle" fill="#34d399">vs</Txt>
          <Txt x={186} y={114} fill="#34d399">+</Txt><Txt x={246} y={114} fill="#34d399">−</Txt>
          <Txt x={122} y={84} textAnchor="end" fill={dc}>{pre}1</Txt>
          <Txt x={122} y={164} textAnchor="end" fill={dc}>{pre}3</Txt>
          <Txt x={318} y={84} fill={dc}>{pre}2</Txt>
          <Txt x={318} y={164} fill={dc}>{pre}4</Txt>
          <Arrow x={380} y={40} label="io" />
        </>
      )}

      {kind === "3f" && (
        <>
          <path d="M22 45V195M22 45H44M22 120H44M22 195H44" {...W} />
          <Dot x={22} y={120} />
          <Txt x={6} y={116}>n</Txt>
          {[45, 120, 195].map((y, kIdx) => (
            <g key={y}>
              <Source x={60} y={y} r={16} />
              <Txt x={88} y={y - 6} fill={["#f87171", "#fbbf24", "#60a5fa"][kIdx]}>{"abc"[kIdx]}</Txt>
            </g>
          ))}
          <path d="M76 45H110V105H190" {...W} />
          <path d="M76 120H183a7 7 0 0 1 14 0H250" {...W} />
          <path d="M76 195H130V135H183a7 7 0 0 1 14 0H243a7 7 0 0 1 14 0H310" {...W} />
          <path d="M190 30V210M250 30V210M310 30V210M190 30H440M190 210H440" {...W} />
          <ThreeFlow act={act} ph={ph} k={k} pre={pre} />
          {[190, 250, 310].map((x, j) => (
            <g key={x}>
              <Device x={x} y={70} rot={-90} scr={scr} on={act.includes(pre + ["1", "3", "5"][j])} />
              <Device x={x} y={170} rot={-90} scr={scr} on={act.includes(pre + ["4", "6", "2"][j])} />
            </g>
          ))}
          <Dot x={190} y={105} /><Dot x={250} y={120} /><Dot x={310} y={135} />
          <Dot x={250} y={30} /><Dot x={310} y={30} /><Dot x={250} y={210} /><Dot x={310} y={210} />
          {[["T1", 190, 70], ["T3", 250, 70], ["T5", 310, 70], ["T4", 190, 170], ["T6", 250, 170], ["T2", 310, 170]].map(([n, x, y]) => (
            <Txt key={n as string} x={(x as number) - 12} y={(y as number) + 4} textAnchor="end" fill={dc}>
              {pre + (n as string).slice(1)}
            </Txt>
          ))}
          <Load x={440} y1={30} y2={210} />
          <Arrow x={385} y={30} label="io" />
        </>
      )}

      {kind === "3h" && (
        <>
          <path d="M22 45V222M22 45H44M22 120H44M22 195H44M440 222H22" {...W} />
          <Dot x={22} y={120} /><Dot x={22} y={195} />
          <Txt x={6} y={116}>n</Txt>
          {SY.map((y) => <path key={y} d={`M76 ${y}H300`} {...W} />)}
          <path d="M300 195V20H440" {...W} />
          {act.length > 0 && (() => {
            const X = +act[0].slice(1) - 1;
            return (
              <>
                <Flow d={`M76 ${SY[X]}H300`} ph={ph} k={k} />
                <Flow d={`M300 ${SY[X]}V20H440V222H22V${SY[X]}H44`} ph={ph} k={k} />
              </>
            );
          })()}
          {SY.map((y, j) => (
            <g key={y}>
              <Source x={60} y={y} r={16} />
              <Txt x={88} y={y - 6} fill={["#f87171", "#fbbf24", "#60a5fa"][j]}>{"abc"[j]}</Txt>
              <Device x={190} y={y} scr={scr} on={on(j + 1)} />
              <Txt x={182} y={y - 14} fill={dc}>{pre}{j + 1}</Txt>
            </g>
          ))}
          <Dot x={300} y={45} /><Dot x={300} y={120} />
          <Load x={440} y1={20} y2={222} />
          <Arrow x={370} y={20} label="io" />
        </>
      )}
    </svg>
  );
}

/* ---------- UI helpers ---------- */
function Seg<T extends string | number>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (val: T) => void;
  options: [T, string][];
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-500 font-medium">{label}</span>
      <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1" role="group" aria-label={label}>
        {options.map(([v, t]) => (
          <button
            key={String(v)}
            onClick={() => onChange(v)}
            aria-pressed={value === v}
            type="button"
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 cursor-pointer ${
              value === v ? "bg-cyan-400 text-slate-950 shadow-sm" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

function Slider({
  label,
  unit,
  value,
  min,
  max,
  step = 1,
  onChange,
  disabled,
  hint,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (val: number) => void;
  disabled?: boolean;
  hint?: string;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Number.isNaN(v) ? min : v));
  return (
    <div className={`space-y-2 transition-opacity duration-200 ${disabled ? "opacity-50" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <label className="text-sm text-slate-300 flex items-center gap-1.5">
          {label} {disabled && <Lock size={12} className="text-slate-500" />}
        </label>
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={value}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            onChange={(e) => onChange(clamp(parseFloat(e.target.value)))}
            className="w-20 bg-slate-950 border border-slate-700 rounded-md px-2 py-1 text-right text-sm font-mono text-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 disabled:cursor-not-allowed"
          />
          <span className="text-xs text-slate-500 w-8">{unit}</span>
        </div>
      </div>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none accent-cyan-400 cursor-pointer disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-cyan-400/50"
      />
      <div className="flex justify-between text-[11px] text-slate-600 font-mono">
        <span>{min}</span>
        {hint && <span className="text-slate-500">{hint}</span>}
        <span>{max}</span>
      </div>
    </div>
  );
}

const Readout = ({ label, value, unit, color }: { label: string; value: string; unit: string; color: string }) => (
  <div className="bg-slate-900/50 border border-slate-800 rounded-md px-4 py-3 flex flex-col justify-center gap-1 shadow-sm">
    <div className="text-xs text-slate-400">{label}</div>
    <div className="font-mono text-xl font-medium tracking-tight" style={{ color }}>
      {value}<span className="text-xs text-slate-500 ml-1.5">{unit}</span>
    </div>
  </div>
);

const SCOPE_TRACES = [
  { key: "vs" as const, name: "Vs (V)", color: "#22d3ee" },
  { key: "vb" as const, name: "Vb (V)", color: "#f472b6", three: true },
  { key: "vc" as const, name: "Vc (V)", color: "#a78bfa", three: true },
  { key: "vo" as const, name: "Vo (V)", color: "#4ade80" },
  { key: "io" as const, name: "Io (A)", color: "#fbbf24" },
];

const Scope = React.memo(function Scope({
  data,
  show,
  yMax,
  iScale,
  phases,
}: {
  data: WaveformPoint[];
  show: { vs: boolean; vb: boolean; vc: boolean; vo: boolean; io: boolean };
  yMax: number;
  iScale: number;
  phases: number;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 8 }}>
        <CartesianGrid stroke="#1e293b" strokeOpacity={0.8} strokeDasharray="3 3" />
        <XAxis
          dataKey="t"
          height={30}
          type="number"
          domain={[0, "dataMax"]}
          tick={{ fill: "#64748b", fontSize: 11 }}
          tickFormatter={(v) => Number(v).toFixed(0)}
          unit=" ms"
          stroke="#334155"
        />
        <YAxis
          yAxisId="v"
          domain={[-yMax, yMax]}
          tickCount={5}
          allowDataOverflow
          tick={{ fill: "#64748b", fontSize: 11 }}
          stroke="#334155"
          width={56}
        />
        <YAxis
          yAxisId="i"
          orientation="right"
          domain={[-iScale, iScale]}
          tickCount={5}
          allowDataOverflow
          tick={{ fill: "#fbbf24", fontSize: 11 }}
          stroke="#334155"
          width={50}
          tickFormatter={(v) => Number(v).toFixed(0)}
        />
        <ReferenceLine yAxisId="v" y={0} stroke="#475569" strokeDasharray="3 3" />
        <Tooltip
          contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, color: '#e2e8f0', fontSize: 13 }}
          labelFormatter={(v) => `t = ${Number(v).toFixed(2)} ms`}
          formatter={(v: unknown, n: unknown) => [typeof v === "number" ? v.toFixed(1) : String(v), String(n)]}
        />
        <Legend verticalAlign="bottom" align="center" iconType="line" wrapperStyle={{ paddingTop: "12px", fontSize: 12 }} />
        {SCOPE_TRACES.filter((t) => !t.three || phases === 3).map((t) => show[t.key] && (
          <Line
            key={t.key}
            yAxisId={t.key === "io" ? "i" : "v"}
            type="monotone"
            dataKey={t.key}
            name={t.key === "vs" && phases === 3 ? "Va (V)" : t.name}
            stroke={t.color}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
});

/* ---------- Main component ---------- */
export default function App() {
  const [sel, setSel] = useState<{ ph: 1 | 3; dv: "d" | "t"; w: "h" | "f" }>({ ph: 1, dv: "d", w: "h" });
  const circuit = `${sel.ph}${sel.dv}${sel.w}`;
  const [p, setP] = useState(DEFAULTS);
  const [show, setShow] = useState({ vs: true, vb: true, vc: true, vo: true, io: true });
  const set = (k: keyof typeof DEFAULTS) => (v: number) => setP((s) => ({ ...s, [k]: v }));
  const controlled = CIRCUITS[circuit]?.controlled ?? false;

  const data = useMemo(() => generateWaveforms({ circuit, ...p }), [circuit, p]);

  const stats = useMemo(() => {
    const n = data.length || 1;
    const avg = data.reduce((a, d) => a + d.vo, 0) / n;
    const rms = Math.sqrt(data.reduce((a, d) => a + d.vo * d.vo, 0) / n);
    const iavg = data.reduce((a, d) => a + d.io, 0) / n;
    const ipk = Math.max(...data.map((d) => d.io));
    return { avg, rms, iavg, ipk };
  }, [data]);

  const N = data.length;
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(0.5);
  const [pos, setPos] = useState(0);

  useEffect(() => {
    if (!playing) return;
    let rafId: number;
    let last = performance.now();
    let isMounted = true;

    const loop = (now: number) => {
      if (!isMounted) return;
      const currentNow = typeof now === 'number' ? now : performance.now();
      const dt = Math.min(0.1, Math.max(0, (currentNow - last) / 1000));
      last = currentNow;

      setPos((q) => {
        const n = (q + dt * (N / 8) * speed) % N;
        return Number.isFinite(n) && n >= 0 ? n : 0;
      });
      rafId = window.requestAnimationFrame(loop);
    };

    rafId = window.requestAnimationFrame(loop);
    return () => {
      isMounted = false;
      window.cancelAnimationFrame(rafId);
    };
  }, [playing, speed, N]);

  const cur = data[Math.max(0, Math.min(N - 1, Math.floor(Number.isFinite(pos) ? pos : 0)))];
  const k = Math.min(1, Math.max(0, (cur?.io ?? 0) / (stats.ipk || 1)));
  const theta = cur ? (((cur.t / 1000) * p.freq * 360) % 360).toFixed(0) : "0";

  const full3 = sel.ph === 3 && sel.w === "f";
  const yMax = Math.ceil((p.vm * (full3 ? 1.8 : 1.1)) / 50) * 50 || 50;
  const iScale = Math.max(1, Math.ceil(((full3 ? Math.sqrt(3) * p.vm : p.vm) / p.R) * 1.1));

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30">
      {/* Header */}
      <header className="border-b border-slate-800 bg-[#0b1120] px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 z-10 relative">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3 mr-1 sm:mr-2 pr-3 sm:pr-4 sm:border-r sm:border-slate-800">
            <div className="p-2 rounded-lg bg-cyan-950/60 border border-cyan-800/50 shadow-inner">
              <Zap className="h-5 w-5 text-cyan-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base tracking-tight text-white">PowerSim</span>
                <span className="text-slate-500 font-normal">|</span>
                <span className="text-sm font-semibold text-cyan-300">Rakshit Soni</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-mono text-slate-400 mt-0.5">
                <span>Roll No:</span>
                <span className="font-semibold text-amber-300 bg-amber-400/10 border border-amber-400/25 px-1.5 py-0.5 rounded text-[11px]">
                  24EE10080
                </span>
              </div>
            </div>
          </div>
          <Seg<1 | 3>
            label="Supply"
            value={sel.ph}
            onChange={(v) => setSel((q) => ({ ...q, ph: v }))}
            options={[[1, "1-Phase"], [3, "3-Phase"]]}
          />
          <Seg<"d" | "t">
            label="Device"
            value={sel.dv}
            onChange={(v) => setSel((q) => ({ ...q, dv: v }))}
            options={[["d", "Diode"], ["t", "Thyristor"]]}
          />
          <Seg<"h" | "f">
            label="Rectifier"
            value={sel.w}
            onChange={(v) => setSel((q) => ({ ...q, w: v }))}
            options={[["h", "Half-Wave"], ["f", "Full-Wave"]]}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-cyan-400/90 bg-cyan-950/40 border border-cyan-800/40 px-3 py-1 rounded-full">
            {CIRCUITS[circuit]?.label}
          </span>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex flex-col lg:flex-row items-start gap-5 p-4 sm:p-6 flex-1 w-full max-w-[1600px] mx-auto">
        {/* Sidebar Controls */}
        <aside className="bg-[#0f172a] border border-slate-800 rounded-xl p-5 space-y-6 w-full lg:w-80 shrink-0 lg:sticky lg:top-6 z-10 shadow-lg">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold flex items-center gap-2 text-slate-200">
              <Cpu size={16} className="text-cyan-400" /> Parameters
            </h2>
            <button
              type="button"
              onClick={() => setP(DEFAULTS)}
              className="text-xs text-slate-400 hover:text-cyan-300 flex items-center gap-1.5 focus:outline-none rounded px-1 transition-colors cursor-pointer"
            >
              <RotateCcw size={13} /> Reset
            </button>
          </div>

          <Slider
            label="Source voltage Vm"
            unit="V"
            value={p.vm}
            min={0}
            max={500}
            step={5}
            onChange={set("vm")}
            hint={sel.ph === 3 ? "phase peak" : undefined}
          />

          <div className="space-y-2">
            <div className="text-sm text-slate-300">Frequency f</div>
            <div className="grid grid-cols-2 gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1">
              {[50, 60].map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => set("freq")(f)}
                  className={`py-1.5 rounded-md text-sm font-mono transition-colors focus:outline-none cursor-pointer ${
                    p.freq === f
                      ? "bg-cyan-400 text-slate-950 font-semibold shadow-sm"
                      : "text-slate-400 hover:bg-slate-800"
                  }`}
                >
                  {f} Hz
                </button>
              ))}
            </div>
          </div>

          <Slider label="Load resistance R" unit="Ω" value={p.R} min={1} max={100} onChange={set("R")} />
          <Slider label="Load inductance L" unit="mH" value={p.L} min={0} max={100} onChange={set("L")} />
          <Slider
            label="Firing angle α"
            unit="deg"
            value={controlled ? p.alpha : 0}
            min={0}
            max={180}
            onChange={set("alpha")}
            disabled={!controlled}
            hint={controlled ? undefined : "diodes: fixed at 0°"}
          />

          <div className="pt-5 border-t border-slate-800 space-y-3">
            <div className="text-sm text-slate-300 flex items-center gap-2">
              <Eye size={15} /> Channels
            </div>
            <div className="flex flex-wrap gap-2">
              {SCOPE_TRACES.filter((t) => !t.three || sel.ph === 3).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setShow((s) => ({ ...s, [t.key]: !s[t.key] }))}
                  aria-pressed={show[t.key]}
                  className="flex-1 min-w-[50px] flex items-center justify-center gap-1.5 py-2 rounded-md border text-xs font-mono font-medium focus:outline-none transition-colors cursor-pointer"
                  style={{
                    borderColor: show[t.key] ? t.color : "#334155",
                    color: show[t.key] ? t.color : "#64748b",
                    backgroundColor: show[t.key] ? `${t.color}15` : "transparent",
                  }}
                >
                  {show[t.key] ? <Eye size={13} /> : <EyeOff size={13} />}
                  <span>{t.key === "vs" && sel.ph === 3 ? "VA" : t.key.toUpperCase()}</span>
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Main Content Panels */}
        <main className="flex-1 space-y-5 min-w-0 flex flex-col w-full">
          {/* Top Control Bar & Live Readouts */}
          <section className="bg-[#0f172a] border border-slate-800 rounded-xl p-4 shadow-lg flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3 w-full">
              <button
                type="button"
                onClick={() => setPlaying((v) => !v)}
                className="flex items-center gap-2 px-5 py-2 rounded bg-cyan-400 text-slate-950 font-bold hover:bg-cyan-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-white transition-colors cursor-pointer"
              >
                {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                <span>{playing ? "Pause" : "Run"}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setPlaying(false);
                  setPos(0);
                }}
                title="Restart"
                className="p-2 rounded border border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white focus:outline-none transition-colors cursor-pointer"
              >
                <SkipBack size={16} />
              </button>
              <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded p-1">
                {[0.1, 0.25, 0.5, 1].map((sp) => (
                  <button
                    key={sp}
                    type="button"
                    onClick={() => setSpeed(sp)}
                    className={`px-2.5 py-1 rounded text-xs font-mono transition-colors focus:outline-none cursor-pointer ${
                      speed === sp
                        ? "bg-cyan-400 text-slate-950 font-semibold"
                        : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                    }`}
                  >
                    {sp}x
                  </button>
                ))}
              </div>
              <input
                type="range"
                min={0}
                max={Math.max(0, N - 1)}
                value={Math.floor(pos)}
                aria-label="Time position"
                onChange={(e) => {
                  setPlaying(false);
                  setPos(parseFloat(e.target.value));
                }}
                className="flex-1 min-w-[120px] h-2 bg-slate-800 rounded-lg appearance-none accent-cyan-400 cursor-pointer focus:outline-none ml-2"
              />
            </div>

            {cur && (
              <div className="flex flex-wrap items-center gap-y-2 gap-x-6 text-xs font-mono text-slate-400 px-1 mt-1 border-t border-slate-800/60 pt-2.5">
                <span>
                  t: <b className="text-slate-100 ml-1">{cur.t.toFixed(2)} ms</b>
                </span>
                <span>
                  θ: <b className="text-slate-100 ml-1">{theta}°</b>
                </span>
                <span>
                  vo: <b className="text-[#4ade80] ml-1">{cur.vo.toFixed(1)} V</b>
                </span>
                <span>
                  io: <b className="text-[#fbbf24] ml-1">{cur.io.toFixed(2)} A</b>
                </span>
                <span className="sm:ml-auto">
                  conducting:{" "}
                  <b className="text-yellow-300 bg-yellow-400/10 border border-yellow-400/20 px-2 py-0.5 rounded ml-1">
                    {cur.act.length ? cur.act.join(" + ") : "none"}
                  </b>
                </span>
              </div>
            )}
          </section>

          {/* Schematic Display */}
          <section className="bg-[#0f172a] border border-slate-800 rounded-xl p-5 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold flex items-center gap-2 text-slate-200">
                <Waves size={16} className="text-cyan-400" /> Interactive Circuit Schematic
              </h2>
              <span className="text-xs font-medium text-slate-400 font-mono">{CIRCUITS[circuit]?.label}</span>
            </div>
            <div
              className="h-64 rounded-lg bg-[#0b1120] border border-slate-800 p-2 flex items-center justify-center overflow-hidden"
              style={{
                backgroundImage: "radial-gradient(#1e293b 1.5px, transparent 1.5px)",
                backgroundSize: "20px 20px",
              }}
            >
              {cur && <Schematic circuit={circuit} act={cur.act} ph={pos * 1.4} k={k} />}
            </div>
          </section>

          {/* Oscilloscope Panels */}
          <section className="bg-[#0f172a] border border-slate-800 rounded-xl p-5 flex-1 shadow-lg flex flex-col">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-semibold flex items-center gap-2 text-slate-200">
                <Activity size={16} className="text-cyan-400" /> Real-time Oscilloscope
              </h2>
              <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
                <Gauge size={13} className="text-cyan-400" /> 2 cycles · {(1000 / p.freq).toFixed(1)} ms/cycle
              </div>
            </div>

            {/* 2x2 Layout Grid to perfectly match reference layout */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-5">
              <Readout label="Vo average" value={stats.avg.toFixed(1)} unit="V" color="#4ade80" />
              <Readout label="Vo RMS" value={stats.rms.toFixed(1)} unit="V" color="#4ade80" />
              <Readout label="Io average" value={stats.iavg.toFixed(2)} unit="A" color="#fbbf24" />
              <Readout label="Io peak" value={stats.ipk.toFixed(2)} unit="A" color="#fbbf24" />
            </div>

            {/* Main Graph Area */}
            <div className="h-[28rem] rounded-lg bg-[#0b1120] border border-slate-800 p-2 relative shadow-inner overflow-hidden">
              <Scope data={data} show={show} yMax={yMax} iScale={iScale} phases={sel.ph} />

              {/* Overlay Cursor */}
              {cur && data.length > 0 && (
                <div className="absolute inset-0 pointer-events-none p-2" aria-hidden="true">
                  <div
                    style={{
                      position: "absolute",
                      top: 12,
                      bottom: 46,
                      width: 1.5,
                      transform: "translateX(-50%)",
                      background: "rgba(248,250,252,0.35)",
                      left: `calc(56px + (100% - 118px) * ${cur.t / (data[N - 1]?.t || 1)})`,
                    }}
                  />
                  {(
                    [
                      ["vs", cur.vs, yMax, "#22d3ee"],
                      ["vo", cur.vo, yMax, "#4ade80"],
                      ["io", cur.io, iScale, "#fbbf24"],
                    ] as const
                  ).map(
                    ([key, val, ext, col]) =>
                      show[key] && (
                        <div
                          key={key}
                          style={{
                            position: "absolute",
                            width: 10,
                            height: 10,
                            borderRadius: "50%",
                            background: col,
                            border: "2px solid #0f172a",
                            transform: "translate(-50%, -50%)",
                            left: `calc(56px + (100% - 118px) * ${cur.t / (data[N - 1]?.t || 1)})`,
                            top: `calc(12px + (100% - 58px) * ${(ext - val) / (2 * ext)})`,
                          }}
                        />
                      )
                  )}
                </div>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-4">
              Waveforms are computed from a time-domain numerical rectifier model with RL load dynamics, commutation delays, and phase tracking.
            </p>
          </section>
        </main>
      </div>
    </div>
  );
}
