import React, { useState, useEffect, useRef, useCallback } from "react";
import * as XLSX from "xlsx";
import {
  Check, X, Loader2,
  ArrowLeft,
  ShieldAlert, ShieldCheck, Ticket, ScrollText, Crosshair, ClipboardList, FilePenLine, Search
} from "lucide-react";

/* ══════════════════════════════════════════════════════════════
   TALON // Command HUD  v4  —  Andrew Makris
   Energy-core centerpiece · hue-cycling scheme (blue→purple→red→
   green→yellow) · side widget rails · bottom chat command bar
   Built-in Claude · persistent widgets
   ══════════════════════════════════════════════════════════════ */

const store = {
  async get(k, fb) { try { const r = await window.storage.get(k); return r ? JSON.parse(r.value) : fb; } catch { return fb; } },
  async set(k, v) { try { await window.storage.set(k, JSON.stringify(v), false); } catch {} },
};

let _uid = 0;
const useUID = (p) => useRef(`${p}${++_uid}`).current;
const reduced = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

/* workspace profiles — each carries its own identity + accent */
const WORKSPACE = { label: "TALON", tag: "MECHANICAL ORCHARD · SEC OPS", hue: 152 };

/* ── data viz ─────────────────────────────────────────────── */
function Sparkline({ data, w = 130, h = 40, grid = true }) {
  const id = useUID("sl");
  if (!data || data.length < 2) return <svg width={w} height={h} />;
  const min = Math.min(...data), max = Math.max(...data), rng = max - min || 1;
  const step = w / (data.length - 1);
  const pts = data.map((v, i) => [i * step, h - 5 - ((v - min) / rng) * (h - 10)]);
  const line = pts.map((p) => p.map((n) => n.toFixed(1)).join(",")).join(" ");
  return (
    <svg width={w} height={h} className="spark" preserveAspectRatio="none">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="var(--acc2)" /><stop offset="100%" stopColor="var(--acc)" /></linearGradient>
        <linearGradient id={id + "f"} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--fill)" /><stop offset="100%" stopColor="transparent" /></linearGradient>
      </defs>
      {grid && <line x1="0" x2={w} y1={h / 2} y2={h / 2} className="spark-grid" />}
      <polygon points={`0,${h} ${line} ${w},${h}`} fill={`url(#${id}f)`} />
      <polyline points={line} fill="none" stroke={`url(#${id})`} strokeWidth="1.8" className="spark-line" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.5" className="spark-dot" />
    </svg>
  );
}

function Ring({ pct, size = 88, label }) {
  const id = useUID("rg");
  const r = size / 2 - 10, c = 2 * Math.PI * r;
  const off = c - (Math.min(100, Math.max(0, pct)) / 100) * c;
  return (
    <div className="ring-wrap">
      <svg width={size} height={size}>
        <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="var(--acc2)" /><stop offset="100%" stopColor="var(--acc)" /></linearGradient></defs>
        <g>{Array.from({ length: 40 }, (_, i) => {
          const a = (i / 40) * 2 * Math.PI, r1 = r + 5, r2 = r + (i % 5 === 0 ? 9 : 7);
          return <line key={i} x1={size / 2 + Math.cos(a) * r1} y1={size / 2 + Math.sin(a) * r1} x2={size / 2 + Math.cos(a) * r2} y2={size / 2 + Math.sin(a) * r2} className="ring-tick" opacity={i % 5 === 0 ? .8 : .3} />;
        })}</g>
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-bg" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={`url(#${id})`} className="ring-fg" strokeDasharray={c} strokeDashoffset={off} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div className="ring-txt"><span className="ring-pct">{Math.round(pct)}<em>%</em></span>{label && <span className="ring-lbl">{label}</span>}</div>
    </div>
  );
}

function Sigil({ s = 90 }) {
  return (
    <svg viewBox="0 0 120 120" className="sigil" width={s} height={s}>
      <g fill="none" stroke="currentColor">
        <polygon points="60,6 108,33 108,87 60,114 12,87 12,33" strokeWidth="1.4" opacity=".55" />
        <polygon points="60,20 96,40 96,80 60,100 24,80 24,40" strokeWidth="1" opacity=".32" />
        <circle cx="60" cy="60" r="4" strokeWidth="1.2" />
        <line x1="60" y1="6" x2="60" y2="24" strokeWidth="1" /><line x1="60" y1="96" x2="60" y2="114" strokeWidth="1" />
        <line x1="12" y1="60" x2="30" y2="60" strokeWidth="1" /><line x1="90" y1="60" x2="108" y2="60" strokeWidth="1" />
      </g>
      <text x="60" y="67" className="sigil-txt" textAnchor="middle">AM</text>
    </svg>
  );
}

/* ── ENERGY CORE (centerpiece) ────────────────────────────── */
function EnergyCore() {
  const [g] = useState(() => {
    const cx = 200, cy = 200;
    const baseR = 148;
    const seedA = Math.random() * 6, seedB = Math.random() * 6, seedC = Math.random() * 6;
    const ringAt = (ang) => baseR + Math.sin(ang * 3 + seedA) * 15 + Math.sin(ang * 5 + seedB) * 9 + Math.sin(ang * 8 + seedC) * 5;

    const ringA = [], ringB = [];
    const N = 260;
    for (let i = 0; i < N; i++) {
      const ang = (i / N) * Math.PI * 2 + Math.random() * 0.02;
      const depth = Math.sin(ang * 2 + seedA);
      const r = ringAt(ang) + (Math.random() - 0.5) * 16;
      const x = cx + Math.cos(ang) * r, y = cy + Math.sin(ang) * r * (0.94 + depth * 0.05);
      const p = {
        x: x.toFixed(1), y: y.toFixed(1),
        r: (0.5 + Math.random() * 1.3 + Math.max(0, depth) * 0.6).toFixed(1),
        o: (0.28 + Math.random() * 0.45 + Math.max(0, depth) * 0.15).toFixed(2),
        c: Math.random() < 0.07 ? "#c9a3ff" : Math.random() < 0.12 ? "#ffffff" : (Math.random() < 0.4 ? "var(--acc2)" : "var(--acc)"),
      };
      (i % 2 === 0 ? ringA : ringB).push(p);
    }

    const threads = [];
    for (let i = 0; i < 13; i++) {
      const ang = Math.random() * Math.PI * 2, r0 = ringAt(ang) - 20;
      const x0 = cx + Math.cos(ang) * r0, y0 = cy + Math.sin(ang) * r0;
      const bend = (Math.random() - 0.5) * 30;
      const mx = (x0 + cx) / 2 + Math.cos(ang + Math.PI / 2) * bend, my = (y0 + cy) / 2 + Math.sin(ang + Math.PI / 2) * bend;
      threads.push({ d: `M${x0.toFixed(1)},${y0.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} 200,200`, o: (0.1 + Math.random() * 0.26).toFixed(2), w: (0.3 + Math.random() * 0.6).toFixed(2) });
    }

    const bolts = [];
    for (let i = 0; i < 5; i++) {
      const ang = Math.random() * Math.PI * 2;
      let x = cx + Math.cos(ang) * (ringAt(ang) + 4), y = cy + Math.sin(ang) * (ringAt(ang) + 4);
      let d = `M${x.toFixed(1)},${y.toFixed(1)}`;
      for (let s = 1; s <= 4; s++) {
        const t = s / 4;
        const tx = cx + (x - cx) * (1 - t) + (Math.random() - 0.5) * 14;
        const ty = cy + (y - cy) * (1 - t) + (Math.random() - 0.5) * 14;
        d += ` L${tx.toFixed(1)},${ty.toFixed(1)}`;
      }
      bolts.push({ d, o: (0.14 + Math.random() * 0.24).toFixed(2) });
    }

    const blinks = Array.from({ length: 4 }, () => { const a = Math.random() * Math.PI * 2, r = ringAt(a); return { x: (cx + Math.cos(a) * r).toFixed(1), y: (cy + Math.sin(a) * r).toFixed(1) }; });

    // scattered background starfield — small dim stars at all radii, for galaxy depth
    const stars = [];
    for (let i = 0; i < 110; i++) {
      const ang = Math.random() * Math.PI * 2, r = Math.random() * 182;
      stars.push({ x: (cx + Math.cos(ang) * r).toFixed(1), y: (cy + Math.sin(ang) * r).toFixed(1), rad: (0.3 + Math.random() * 0.9).toFixed(1), o: (0.12 + Math.random() * 0.45).toFixed(2) });
    }
    // faint spiral arms curling out from the core, like galaxy dust lanes
    const spirals = [];
    for (let s = 0; s < 2; s++) {
      const dir = s % 2 === 0 ? 1 : -1, a0 = Math.random() * 6;
      let d = "";
      for (let t = 0; t <= 60; t++) {
        const theta = a0 + dir * t * 0.11, rad = 10 + t * 2.9;
        const x = cx + Math.cos(theta) * rad, y = cy + Math.sin(theta) * rad * 0.9;
        d += (t === 0 ? "M" : " L") + x.toFixed(1) + "," + y.toFixed(1);
      }
      spirals.push({ d, dur: (60 + Math.random() * 40).toFixed(0), dir: Math.random() < 0.5 ? "normal" : "reverse" });
    }

    // 8 extra atom-style ring assemblies (3 rings each) — all centered on the core, intertwining
    const colorPool = ["var(--acc)", "var(--acc2)", "var(--glow)", "#c9a3ff"];
    const sizeTiers = [0.66, 0.84, 1.0, 1.17, 1.34]; // deliberate small/medium/large clusters, so some end up matching
    const extraOrbits = [];
    for (let a = 0; a < 8; a++) {
      const tier = sizeTiers[Math.floor(Math.random() * sizeTiers.length)];
      const rx = 132 * tier * (0.93 + Math.random() * 0.14);
      const ry = rx * (0.32 + Math.random() * 0.38);
      const baseRot = Math.random() * 360;
      for (let r = 0; r < 3; r++) {
        extraOrbits.push({
          rx: rx.toFixed(1), ry: ry.toFixed(1), rot: (baseRot + r * 60).toFixed(1),
          color: colorPool[Math.floor(Math.random() * colorPool.length)],
          o: (0.14 + Math.random() * 0.32).toFixed(2), w: (0.5 + Math.random() * 0.8).toFixed(2),
          dur: (36 + Math.random() * 74).toFixed(0), dir: Math.random() < 0.5 ? "normal" : "reverse",
        });
      }
    }
    return { ringA, ringB, threads, bolts, blinks, extraOrbits, stars, spirals };
  });
  const [noMotion] = useState(() => reduced());
  return (
    <div className="core-persp">
    <div className="core-wrap">
      <div className="core-halo" />
      <svg viewBox="0 0 400 400" className="core-svg">
        <defs>
          <radialGradient id="coreGrad"><stop offset="0%" stopColor="#ffffff" stopOpacity=".98" /><stop offset="22%" stopColor="var(--acc2)" stopOpacity=".9" /><stop offset="60%" stopColor="var(--acc)" stopOpacity=".35" /><stop offset="100%" stopColor="var(--acc)" stopOpacity="0" /></radialGradient>
          <radialGradient id="coreGradInner" cx="42%" cy="38%"><stop offset="0%" stopColor="#ffffff" stopOpacity="1" /><stop offset="45%" stopColor="#ffffff" stopOpacity=".5" /><stop offset="100%" stopColor="#ffffff" stopOpacity="0" /></radialGradient>
          <filter id="bloom" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.4" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          <filter id="bloomBig" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="5" /></filter>
          <filter id="softBlur" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="0.6" /></filter>
        </defs>

        {/* background starfield — scattered dim stars across the whole disc, for galaxy depth */}
        <g className="core-stars">
          {g.stars.map((s, i) => <circle key={i} cx={s.x} cy={s.y} r={s.rad} fill="#ffffff" opacity={s.o} />)}
        </g>
        {/* faint spiral dust lanes curling out from the core */}
        {g.spirals.map((s, i) => (
          <g key={i} style={{ transformBox: "fill-box", transformOrigin: "center", animation: noMotion ? "none" : `spin ${s.dur}s linear infinite ${s.dir}` }}>
            <path d={s.d} fill="none" stroke="var(--acc2)" strokeWidth="0.6" strokeOpacity=".22" strokeLinecap="round" filter="url(#softBlur)" />
          </g>
        ))}
        {/* dense particle torus — two depth layers, independent slow rotation for a living, turbulent surface */}
        <g className="core-spin" filter="url(#softBlur)">
          {g.ringA.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={p.r} fill={p.c} opacity={p.o} />)}
        </g>
        <g className="core-arc2" filter="url(#softBlur)">
          {g.ringB.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={p.r} fill={p.c} opacity={p.o} />)}
        </g>
        {/* thin threads bridging the dark gap into the core */}
        <g className="core-threads" filter="url(#bloom)">
          {g.threads.map((t, i) => <path key={i} d={t.d} fill="none" stroke="var(--glow)" strokeWidth={t.w} strokeOpacity={t.o} strokeLinecap="round" />)}
        </g>
        {/* occasional jagged discharge */}
        <g className="core-bolts" filter="url(#bloom)">
          {g.bolts.map((b, i) => <path key={i} d={b.d} fill="none" stroke="#eaf6ff" strokeWidth="0.7" strokeOpacity={b.o} strokeLinecap="round" />)}
        </g>
        {/* atom-style orbit rings — continuous closed loops for structure amid the chaos */}
        <g className="core-orbit1"><ellipse cx="200" cy="200" rx="180" ry="92" fill="none" stroke="var(--acc)" strokeWidth="1.1" opacity=".55" filter="url(#bloom)" /></g>
        <g className="core-orbit2"><ellipse cx="200" cy="200" rx="160" ry="82" fill="none" stroke="var(--acc2)" strokeWidth="1" opacity=".5" filter="url(#bloom)" transform="rotate(60 200 200)" /></g>
        <g className="core-orbit3"><ellipse cx="200" cy="200" rx="172" ry="88" fill="none" stroke="var(--glow)" strokeWidth="1" opacity=".45" filter="url(#bloom)" transform="rotate(120 200 200)" /></g>
        {/* 8 more intertwining atom assemblies, each ring spinning at its own random speed/direction */}
        <g className="core-extra-orbits">
          {g.extraOrbits.map((o, i) => (
            <g key={i} style={{ transformBox: "fill-box", transformOrigin: "center", animation: noMotion ? "none" : `spin ${o.dur}s linear infinite ${o.dir}` }}>
              <ellipse cx="200" cy="200" rx={o.rx} ry={o.ry} fill="none" stroke={o.color} strokeWidth={o.w} opacity={o.o} filter="url(#bloom)" transform={`rotate(${o.rot} 200 200)`} />
            </g>
          ))}
        </g>
        {/* hot core — small, tight, and very bright — the one clean focal point */}
        <circle cx="200" cy="200" r="62" fill="url(#coreGrad)" filter="url(#bloom)" className="core-pulse" />
        <circle cx="200" cy="200" r="34" fill="url(#coreGradInner)" className="core-pulse2" />
        {/* random blinking sparks along the ring */}
        <g className="core-blink">
          {g.blinks.map((b, i) => <circle key={i} cx={b.x} cy={b.y} r="2.6" fill="var(--glow)" />)}
        </g>
      </svg>
      <div className="core-cog"><Cog /></div>
    </div>
    </div>
  );
}
function Cog() {
  return (
    <svg viewBox="0 0 40 40" width="40" height="40" className="cog">
      <g fill="none" stroke="currentColor" strokeWidth="1.4">
        <circle cx="20" cy="20" r="6" />
        {Array.from({ length: 10 }, (_, i) => { const a = (i / 10) * Math.PI * 2; return <line key={i} x1={20 + Math.cos(a) * 9} y1={20 + Math.sin(a) * 9} x2={20 + Math.cos(a) * 13} y2={20 + Math.sin(a) * 13} />; })}
      </g>
    </svg>
  );
}

/* ── shell ────────────────────────────────────────────────── */
function Panel({ label, right, children, className = "" }) {
  return (
    <section className={`panel ${className}`}>
      <span className="cnr tl" /><span className="cnr tr" /><span className="cnr bl" /><span className="cnr br" />
      <header className="panel-hd"><span className="led" /><span className="panel-lbl">{label}</span><span className="panel-right">{right}</span></header>
      <div className="panel-body">{children}</div>
    </section>
  );
}
function Eq() { return <div className="eq">{[0, 1, 2, 3, 4].map((i) => <span key={i} style={{ animationDelay: `${i * .12}s` }} />)}</div>; }

const SIGIL_QUIPS = [
  "Somewhere a false positive is lying to someone right now.",
  "That ticket queue isn't going to triage itself.",
  "Application risk report's been sitting there a while.",
  "PKI report's due whether it's ready or not.",
  "Falcon Con would be a good excuse for a trip.",
  "You built a whole HUD instead of clearing the queue. Bold.",
];

function TopBar({ profile }) {
  const [now, setNow] = useState(new Date());
  const [boot] = useState(Date.now());
  const [quip, setQuip] = useState(null);
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  const time = now.toLocaleTimeString("en-US", { hour12: true });
  const date = now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "2-digit", year: "numeric" });
  const up = Math.floor((Date.now() - boot) / 1000), p2 = (n) => String(n).padStart(2, "0");
  const showQuip = () => { setQuip(SIGIL_QUIPS[Math.floor(Math.random() * SIGIL_QUIPS.length)]); setTimeout(() => setQuip(null), 3200); };
  return (
    <div className="topbar">
      <div className="tb-left"><span className="tb-sigil" onClick={showQuip} role="button" tabIndex={0}><Sigil s={38} />{quip && <span className="tb-quip">{quip}</span>}</span><div><span className="callsign">{profile.label}</span><span className="tb-sub">{profile.tag} <i className="led sm" /></span></div></div>
      <div className="tb-clock"><span className="clk">{time}</span><span className="tb-date">{date} · LOCAL</span></div>
      <div className="tb-right"><div className="integrity"><span className="int-lbl">SYS INTEGRITY</span><div className="int-bar"><i /></div><Eq /></div><span className="tb-sub2">UPTIME {p2(Math.floor(up / 3600))}:{p2(Math.floor(up % 3600 / 60))}:{p2(up % 60)} · NODE MAKRIS-01</span></div>
    </div>
  );
}

function ScreenFrame() {
  return (<div className="frame" aria-hidden="true"><span className="fc fc-tl" /><span className="fc fc-tr" /><span className="fc fc-bl"><b>TALON v4.0</b></span><span className="fc fc-br"><b>SECURE // 33.87°N 112.14°W</b></span></div>);
}

const BOOT_MIDDLE = ["SPIN UP CORE", "MOUNT WIDGETS", "SYNC THREAT FEEDS", "WARM UP ENERGY CORE", "CALIBRATE SENSORS", "LOAD MAKRIS PROFILE", "CHECK SIX", "LOAD WIDGET STATE"];
function pickRandom(arr, n) {
  const pool = [...arr]; const out = [];
  for (let i = 0; i < n && pool.length; i++) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
}

function Boot({ done }) {
  const [lines, setLines] = useState([]); const [prog, setProg] = useState(0);
  useEffect(() => {
    if (reduced()) { done(); return; }
    const seq = ["INIT KERNEL", ...pickRandom(BOOT_MIDDLE, 3), "LINK TALON", "SYSTEMS ONLINE"]; let i = 0;
    const t = setInterval(() => { setLines((p) => [...p, seq[i]]); setProg((i + 1) / seq.length * 100); i++; if (i >= seq.length) { clearInterval(t); setTimeout(done, 460); } }, 200);
    return () => clearInterval(t);
  }, [done]);
  return (<div className="boot"><div className="boot-in"><div className="boot-title">TALON</div><div className="boot-log">{lines.map((l, i) => <div key={i} className="boot-line">▸ {l} <span className="ok">OK</span></div>)}</div><div className="boot-prog"><i style={{ width: `${prog}%` }} /></div></div></div>);
}

/* ── MECHANICAL ORCHARD workspace tools ── */
function Delta({ v }) {
  if (!v) return <span className="delta zero">—</span>;
  return v > 0 ? <span className="delta up">▲ {v}</span> : <span className="delta down">▼ {Math.abs(v)}</span>;
}

function svgTrendChart(hist) {
  if (!hist.length) return `<div style="color:#556780">No history yet.</div>`;
  const W = 680, H = 220, PAD = 40;
  const max = Math.max(...hist.map((s) => s.iru), ...hist.map((s) => s.s1), 1);
  const stepX = hist.length > 1 ? (W - 2 * PAD) / (hist.length - 1) : 0;
  const pt = (v, i) => { const x = PAD + i * stepX; const y = H - PAD - (v / max) * (H - 2 * PAD); return [x, y]; };
  const line = (key) => hist.map((s, i) => pt(s[key], i).map((n) => n.toFixed(1)).join(",")).join(" ");
  const dots = (key, color) => hist.map((s, i) => { const [x, y] = pt(s[key], i); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" fill="${color}" />`; }).join("");
  const xLabels = hist.map((s, i) => `<text x="${(PAD + i * stepX).toFixed(1)}" y="${H - 8}" font-size="9" fill="#556780" text-anchor="middle">${new Date(s.ts).toLocaleDateString(undefined, { month: "numeric", day: "numeric" })}</text>`).join("");
  const gridY = [0, 0.25, 0.5, 0.75, 1].map((f) => { const y = H - PAD - f * (H - 2 * PAD); return `<line x1="${PAD}" x2="${W - PAD}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#152030" stroke-width="1" /><text x="${PAD - 6}" y="${(y + 3).toFixed(1)}" font-size="9" fill="#556780" text-anchor="end">${Math.round(f * max)}</text>`; }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="background:#0a121c;border:1px solid #1c2a3a">
    ${gridY}
    <polyline points="${line("iru")}" fill="none" stroke="#5ecbff" stroke-width="2" />
    <polyline points="${line("s1")}" fill="none" stroke="#ffb347" stroke-width="2" />
    ${dots("iru", "#5ecbff")}${dots("s1", "#ffb347")}
    ${xLabels}
    <circle cx="${W - 160}" cy="16" r="4" fill="#5ecbff" /><text x="${W - 150}" y="20" font-size="10" fill="#dcefff">IRU</text>
    <circle cx="${W - 90}" cy="16" r="4" fill="#ffb347" /><text x="${W - 80}" y="20" font-size="10" fill="#dcefff">S1</text>
  </svg>`;
}

function buildVulnReportHTML(hist) {
  const cur = hist[hist.length - 1], prev = hist[hist.length - 2];
  const fmt = (n) => (n == null ? "—" : n);
  const dstr = (c, p) => (c == null || p == null ? "—" : c - p === 0 ? "±0" : c - p > 0 ? `+${c - p}` : `${c - p}`);
  const dcls = (c, p) => (c == null || p == null ? "" : c - p > 0 ? "up" : c - p < 0 ? "down" : "");
  const rows = [
    ["IRU Active", prev?.iru, cur?.iru],
    ["S1 Active (deduped)", prev?.s1, cur?.s1],
    ["S1 Critical", prev?.s1Sev?.Critical, cur?.s1Sev?.Critical],
    ["S1 High", prev?.s1Sev?.High, cur?.s1Sev?.High],
    ["S1 Medium", prev?.s1Sev?.Medium, cur?.s1Sev?.Medium],
    ["S1 Low", prev?.s1Sev?.Low, cur?.s1Sev?.Low],
  ];
  const rowsHtml = rows.map(([label, p, c]) => `<tr><td>${label}</td><td>${fmt(p)}</td><td>${fmt(c)}</td><td class="${dcls(c, p)}">${dstr(c, p)}</td></tr>`).join("");
  const cveRows = (cur?.s1Cves || []).map((x) => `<tr><td>${x.cve}</td><td>${x.sev || "—"}</td><td>${x.count}</td></tr>`).join("") || `<tr><td colspan="3" class="muted">No CVE-level data in this snapshot</td></tr>`;
  const appRows = (cur?.s1Apps || []).map((x) => `<tr><td>${x.app}</td><td>${x.worst || "—"}</td><td>${x.count}</td></tr>`).join("") || `<tr><td colspan="3" class="muted">No application-level data in this snapshot</td></tr>`;
  const histRows = hist.map((h) => `<tr><td>${new Date(h.ts).toLocaleDateString()}</td><td>${h.iru}</td><td>${h.s1}</td><td>${h.s1Sev?.Critical ?? "—"}</td><td>${h.s1Sev?.High ?? "—"}</td><td>${h.s1Sev?.Medium ?? "—"}</td><td>${h.s1Sev?.Low ?? "—"}</td></tr>`).join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>TALON Vuln Delta Report</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Oxanium:wght@600;700&family=JetBrains+Mono:wght@400;500&display=swap');
*{box-sizing:border-box}
body{background:#070b12;color:#dcefff;font-family:'JetBrains Mono',monospace;margin:0;padding:40px;font-size:13px}
h1{font-family:'Oxanium',sans-serif;letter-spacing:.12em;color:#5ecbff;font-size:22px;margin:0 0 4px}
.meta{color:#7d93ad;font-size:11px;letter-spacing:.08em;margin-bottom:28px}
h2{font-family:'Oxanium',sans-serif;letter-spacing:.1em;color:#5ecbff;font-size:13px;border-bottom:1px solid #1c2a3a;padding-bottom:6px;margin:30px 0 12px}
table{width:100%;border-collapse:collapse;margin-bottom:8px}
th,td{border:1px solid #1c2a3a;padding:6px 10px;text-align:left;font-size:12px}
th{background:#0e1826;color:#5ecbff;letter-spacing:.06em}
td.up{color:#ffb347}td.down{color:#7ee8c9}td.muted{color:#556780;text-align:center}
.no-print{margin-top:24px}
button{background:#0e1826;border:1px solid #1c2a3a;color:#5ecbff;font-family:'JetBrains Mono',monospace;padding:8px 16px;cursor:pointer;letter-spacing:.08em}
@media print{.no-print{display:none}body{padding:20px}}
</style></head>
<body>
<h1>TALON // MO VULN DELTA REPORT</h1>
<div class="meta">Generated ${new Date().toLocaleString()} · ${hist.length} snapshot${hist.length !== 1 ? "s" : ""} in history</div>
<h2>SUMMARY — PREVIOUS VS CURRENT</h2>
<table><tr><th>Metric</th><th>Previous</th><th>Current</th><th>Δ</th></tr>${rowsHtml}</table>
<h2>TREND — TOTAL FINDINGS OVER TIME</h2>
${svgTrendChart(hist)}
<h2>TOP CVEs (CURRENT SNAPSHOT)</h2>
<table><tr><th>CVE / Vulnerability</th><th>Severity</th><th>Endpoints</th></tr>${cveRows}</table>
<h2>TOP VULNERABLE APPLICATIONS (CURRENT SNAPSHOT)</h2>
<table><tr><th>Application</th><th>Worst Severity</th><th>Findings</th></tr>${appRows}</table>
<h2>FULL SNAPSHOT HISTORY</h2>
<table><tr><th>Date</th><th>IRU</th><th>S1</th><th>Crit</th><th>High</th><th>Med</th><th>Low</th></tr>${histRows}</table>
<div class="no-print"><button onclick="window.print()">PRINT / SAVE AS PDF</button></div>
</body></html>`;
}

function useAgentHealth() {
  const [status, setStatus] = useState("checking"); // 'up' | 'down' | 'checking'
  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const res = await fetch("http://localhost:8787/health", { cache: "no-store" });
        if (!alive) return;
        setStatus(res.ok ? "up" : "down");
      } catch { if (alive) setStatus("down"); }
    };
    check();
    const id = setInterval(check, 12000);
    return () => { alive = false; clearInterval(id); };
  }, []);
  return status;
}
function AgentStatusTag() {
  const status = useAgentHealth();
  const label = status === "up" ? "LOCAL AGENT ONLINE" : status === "down" ? "LOCAL AGENT OFFLINE" : "CHECKING AGENT…";
  const cls = status === "up" ? "on" : status === "down" ? "off" : "";
  return <span className={`agent-tag ${cls}`}><span className="agent-dot" />{label}</span>;
}

function computeS1Aggregate(rows) {
  const sample = rows[0] || {};
  const keyFor = (names) => Object.keys(sample).find((k) => names.some((n) => k.toLowerCase().includes(n)));
  const epKey = keyFor(["endpoint"]), appKey = keyFor(["application", "software"]), sevKey = keyFor(["severity"]), stKey = keyFor(["status"]);
  const cveKey = keyFor(["cve", "vulnerability", "vuln name", "vuln title"]);
  const sevOrder = ["Critical", "High", "Medium", "Low"];
  const seen = new Set(); const sev = { Critical: 0, High: 0, Medium: 0, Low: 0 }; const cveMap = {}; const appMap = {}; let total = 0;
  rows.forEach((r) => {
    const status = stKey ? String(r[stKey]).toLowerCase() : "";
    if (/remediated|false positive/.test(status)) return;
    const dk = `${epKey ? r[epKey] : ""}::${appKey ? r[appKey] : ""}`;
    if (seen.has(dk)) return; seen.add(dk); total++;
    const sevVal = sevKey ? String(r[sevKey]).trim().toLowerCase() : "";
    const norm = sevOrder.find((s) => sevVal.startsWith(s.toLowerCase()));
    if (norm) sev[norm] = (sev[norm] || 0) + 1;
    if (cveKey) {
      const cv = String(r[cveKey]).trim();
      if (cv) { if (!cveMap[cv]) cveMap[cv] = { count: 0, sev: norm || "" }; cveMap[cv].count++; }
    }
    if (appKey) {
      const av = String(r[appKey]).trim();
      if (av) {
        if (!appMap[av]) appMap[av] = { count: 0, worst: "" };
        appMap[av].count++;
        if (norm && (!appMap[av].worst || sevOrder.indexOf(norm) < sevOrder.indexOf(appMap[av].worst))) appMap[av].worst = norm;
      }
    }
  });
  const cves = Object.entries(cveMap).sort((a, b) => b[1].count - a[1].count).slice(0, 8).map(([cve, v]) => ({ cve, count: v.count, sev: v.sev }));
  const apps = Object.entries(appMap).sort((a, b) => b[1].count - a[1].count).slice(0, 8).map(([app, v]) => ({ app, count: v.count, worst: v.worst }));
  return { total, sev, cves, apps, epKey, sevKey, cveKey, appKey };
}

function VulnDelta() {
  const [hist, setHist] = useState([]); const [iru, setIru] = useState(""); const [s1, setS1] = useState("");
  const [s1Sev, setS1Sev] = useState(null); const [s1Cves, setS1Cves] = useState(null); const [s1Apps, setS1Apps] = useState(null);
  const [note, setNote] = useState(""); const [ready, setReady] = useState(false);
  useEffect(() => { (async () => { setHist(await store.get("mo:vulns", [])); setReady(true); })(); }, []);
  useEffect(() => { if (ready) store.set("mo:vulns", hist); }, [hist, ready]);
  const aggregateS1Rows = (rows, sourceLabel) => {
    const { total, sev, cves, apps, epKey, sevKey, cveKey, appKey } = computeS1Aggregate(rows);
    setS1(String(total)); setS1Sev(sev); setS1Cves(cves.length ? cves : null); setS1Apps(apps.length ? apps : null);
    setNote(epKey || sevKey ? `${sourceLabel}: ${total} active (deduped Endpoint×App, filtered)${cveKey ? `, ${cves.length} distinct CVEs` : ""}${appKey ? `, ${apps.length} apps` : ""} → S1` : `${sourceLabel}: ${total} rows → S1 (no Endpoint/Severity columns found — raw count only)`);
  };
  const applyS1Workbook = (wb, sourceLabel) => {
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    aggregateS1Rows(rows, sourceLabel);
  };
  const applyIruWorkbook = (wb, sourceLabel) => {
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    const data = rows.filter((r) => r && r.some((c) => c !== undefined && c !== ""));
    const count = Math.max(0, data.length - 1);
    setIru(String(count));
    setNote(`${sourceLabel}: ${count} rows → IRU`);
  };
  const importFile = async (e, which) => {
    const f = e.target.files?.[0]; if (!f) return;
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
      if (which === "s1") applyS1Workbook(wb, f.name); else applyIruWorkbook(wb, f.name);
    } catch (ex) { setNote("Import failed: " + ex.message); }
    e.target.value = "";
  };
  const snapshot = () => {
    if (!iru && !s1) { setNote("Enter or import counts first"); return; }
    setHist((h) => [...h.slice(-19), { ts: Date.now(), iru: parseInt(iru) || 0, s1: parseInt(s1) || 0, s1Sev, s1Cves, s1Apps }]);
    setNote("Snapshot logged " + new Date().toLocaleDateString());
  };
  const cur = hist[hist.length - 1], prev = hist[hist.length - 2];
  const d = (k) => cur && prev ? cur[k] - prev[k] : 0;
  const dSev = (k) => cur?.s1Sev && prev?.s1Sev ? (cur.s1Sev[k] || 0) - (prev.s1Sev[k] || 0) : 0;
  const arrow = (v) => !v ? "" : v > 0 ? ` ▲${v}` : ` ▼${Math.abs(v)}`;
  const totals = hist.map((h) => h.iru + h.s1);
  const exportReport = () => {
    if (!hist.length) { setNote("Log at least one snapshot first"); return; }
    try {
      const blob = new Blob([buildVulnReportHTML(hist)], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `MO_Vuln_Delta_Report_${new Date().toISOString().slice(0, 10)}.html`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      setNote("Report downloaded — open the .html file, then Cmd/Ctrl+P → Save as PDF");
    } catch (ex) { setNote("Report export failed — " + ex.message); }
  };
  const exportXLSX = () => {
    if (!hist.length) { setNote("Log at least one snapshot first"); return; }
    try {
      const bytes = buildVulnDeltaXlsx(hist);
      const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `MO_Vuln_Delta_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      setNote("XLSX exported — " + new Date().toLocaleTimeString());
    } catch (ex) { setNote("XLSX export failed — " + ex.message); }
  };
  return (
    <Panel label="VULN DELTA // IRU · S1" right={`${hist.length} SNAPSHOTS`}>
      <div className="vrow">
        <span className="vsrc">IRU</span><span className="vcur">{cur ? cur.iru : "—"}</span><Delta v={d("iru")} />
        <input className="vin" value={iru} onChange={(e) => setIru(e.target.value)} placeholder="count" inputMode="numeric" />
        <label className="vfile">FILE<input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => importFile(e, "iru")} hidden /></label>
      </div>
      <div className="vrow">
        <span className="vsrc">S1</span><span className="vcur">{cur ? cur.s1 : "—"}</span><Delta v={d("s1")} />
        <input className="vin" value={s1} onChange={(e) => { setS1(e.target.value); setS1Sev(null); setS1Cves(null); setS1Apps(null); }} placeholder="count" inputMode="numeric" />
        <label className="vfile">FILE<input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => importFile(e, "s1")} hidden /></label>
      </div>
      {cur?.s1Sev && <div className="log-metrics">
        <span className="lm crit">CRIT {cur.s1Sev.Critical || 0}{arrow(dSev("Critical"))}</span>
        <span className="lm err">HIGH {cur.s1Sev.High || 0}{arrow(dSev("High"))}</span>
        <span className="lm warn">MED {cur.s1Sev.Medium || 0}{arrow(dSev("Medium"))}</span>
        <span className="lm info">LOW {cur.s1Sev.Low || 0}{arrow(dSev("Low"))}</span>
      </div>}
      {cur?.s1Cves?.length > 0 && <div className="log-anom">
        <span className="la-hd">TOP CVEs — S1</span>
        {cur.s1Cves.map((c, i) => <div key={i} className="la-row">▸ {c.cve}{c.sev ? ` · ${c.sev}` : ""} — {c.count} endpoint{c.count > 1 ? "s" : ""}</div>)}
      </div>}
      {cur?.s1Apps?.length > 0 && <div className="log-anom">
        <span className="la-hd">TOP VULNERABLE APPS — S1</span>
        {cur.s1Apps.map((a, i) => <div key={i} className="la-row">▸ {a.app}{a.worst ? ` · ${a.worst}` : ""} — {a.count} finding{a.count > 1 ? "s" : ""}</div>)}
      </div>}

      {totals.length > 1 && <div className="vtrend"><span className="vt-lbl">TOTAL TREND</span><Sparkline data={totals} w={200} h={40} /></div>}
      <div className="vfoot"><button className="mini-btn wide" onClick={snapshot}>LOG SNAPSHOT</button><span className="vnote">{note}</span></div>
      <div className="tk-btns vexport">
        <button className="mini-btn wide" disabled={!hist.length} onClick={exportReport}>REPORT · DOWNLOAD HTML</button>
        <button className="mini-btn wide" disabled={!hist.length} onClick={exportXLSX}>EXPORT · XLSX</button>
      </div>
    </Panel>
  );
}

const TICKET_SOURCES = ["Pondurance", "SentinelOne", "InfoSec", "IT Support"];
const SEVERITIES_TICKET = ["Low", "Medium", "High", "Urgent"];
const SEC_CATEGORY_KB = {
  "Malware / PUP Detection": { mitre: "T1204 — User Execution", steps: [
    "Isolate affected endpoint from the network",
    "Confirm detection via a secondary scan/tool if available",
    "Review process tree for persistence mechanisms",
    "Remove or quarantine the malicious artifact",
    "Verify a clean rescan before returning the endpoint to network",
  ] },
  "Phishing Report": { mitre: "T1566 — Phishing", steps: [
    "Retrieve full headers; confirm sender/reply-to spoofing",
    "Check for prior clicks or replies from other recipients",
    "Block sender domain and any embedded URLs",
    "Purge the message from mailboxes if malicious is confirmed",
    "Notify affected user(s) and log for awareness tracking",
  ] },
  "Unauthorized Access Attempt": { mitre: "T1078 — Valid Accounts", steps: [
    "Confirm source IP/geolocation against expected baseline",
    "Check for MFA bypass or failed MFA challenges",
    "Force a password reset if compromise is suspected",
    "Review the account for suspicious activity after the attempt",
    "Add the source IP to a watchlist/block if malicious",
  ] },
  "Failed Login / Brute Force": { mitre: "T1110 — Brute Force", steps: [
    "Confirm login attempt volume and source",
    "Check whether account lockout policy triggered correctly",
    "Block the source IP if external and malicious",
    "Verify no successful login occurred among the attempts",
    "Notify the user if their account was targeted",
  ] },
  "Data Exfiltration Alert": { mitre: "T1041 — Exfiltration Over C2 Channel", steps: [
    "Identify data volume, destination, and protocol",
    "Determine whether the transfer matches a known business process",
    "Isolate the endpoint if an unauthorized transfer is confirmed",
    "Preserve logs/evidence for investigation",
    "Escalate to the IR process if data sensitivity is high",
  ] },
  "Policy Violation": { mitre: null, steps: [
    "Document the specific policy violated",
    "Gather supporting evidence (logs, screenshots)",
    "Notify the appropriate manager/HR per policy",
    "Determine whether a technical control gap enabled the violation",
    "Close with a documented outcome",
  ] },
  "Endpoint Offline / Agent Issue": { mitre: null, steps: [
    "Confirm last check-in time and reason code",
    "Check for network/VPN connectivity issues",
    "Restart or reinstall the agent service if unresponsive",
    "Verify agent reporting resumes",
    "Escalate to the endpoint team if it persists past 24h",
  ] },
  "Other / Uncategorized": { mitre: null, steps: [
    "Document findings",
    "Reclassify once root cause is known",
    "Escalate if severity is unclear",
  ] },
};
const IT_CATEGORY_KB = {
  "Access Request": { steps: [
    "Verify requester identity and manager approval",
    "Confirm least-privilege scope of the access requested",
    "Provision access per the approved scope",
    "Notify the requester of completion",
    "Log the grant for periodic access review",
  ] },
  "Password / Account Lockout": { steps: [
    "Verify identity via a secondary factor before reset",
    "Reset the password or unlock the account",
    "Confirm MFA enrollment is current",
    "Notify the user that credentials are restored",
    "Advise on password manager / MFA best practices if this is a repeat issue",
  ] },
  "Hardware Issue": { steps: [
    "Confirm device asset tag and warranty status",
    "Attempt basic troubleshooting (reboot, cable/peripheral check)",
    "Escalate to vendor support if a hardware fault is confirmed",
    "Provide a loaner if downtime is business-impacting",
    "Document the resolution and any parts replaced",
  ] },
  "Software Issue": { steps: [
    "Confirm software version and reproduce the issue",
    "Check for known issues or a pending update",
    "Apply the fix, patch, or reinstall as appropriate",
    "Confirm the user can complete their task afterward",
    "Document root cause if this is a recurring issue",
  ] },
  "Other / Uncategorized": { steps: [
    "Document the reported issue",
    "Triage and reclassify once root cause is known",
  ] },
};

function TicketAnalyzer() {
  const [src, setSrc] = useState("Pondurance");
  const isIT = src === "IT Support";
  const kb = isIT ? IT_CATEGORY_KB : SEC_CATEGORY_KB;
  const categories = Object.keys(kb);
  const [category, setCategory] = useState(categories[0]);
  const [severity, setSeverity] = useState("Medium");
  const [asset, setAsset] = useState("");
  const [desc, setDesc] = useState("");
  const [actions, setActions] = useState("");
  const [resolution, setResolution] = useState("");
  const [out, setOut] = useState(""); const [copied, setCopied] = useState(false);
  const [resolved, setResolved] = useState([]); const [resNote, setResNote] = useState(""); const [saved, setSaved] = useState(false); const [ready, setReady] = useState(false);
  useEffect(() => { setCategory(Object.keys(isIT ? IT_CATEGORY_KB : SEC_CATEGORY_KB)[0]); }, [src]);
  useEffect(() => { (async () => { setResolved(await store.get("mo:tickets", [])); setReady(true); })(); }, []);
  useEffect(() => { if (ready) store.set("mo:tickets", resolved); }, [resolved, ready]);
  const entry = kb[category] || kb[categories[0]];
  const buildSummary = () => {
    const lines = [
      `SOURCE: ${src}`,
      `CATEGORY: ${category}`,
      `SEVERITY: ${severity}`,
      asset.trim() ? `AFFECTED: ${asset.trim()}` : null,
      entry.mitre ? `MITRE ATT&CK: ${entry.mitre}` : null,
      "",
      "DESCRIPTION:",
      desc.trim() || "(none provided)",
      "",
      "RECOMMENDED STEPS:",
      ...entry.steps.map((s, i) => `${i + 1}. ${s}`),
    ].filter((l) => l !== null);
    setOut(lines.join("\n"));
  };
  const buildCloseout = () => {
    const lines = [
      `${isIT ? "ISSUE SUMMARY" : "INCIDENT SUMMARY"}: ${desc.trim() || "(none provided)"}`,
      "",
      "ACTIONS TAKEN:",
      actions.trim() || "(fill in the specific actions performed)",
      "",
      `RESOLUTION: ${resolution.trim() || "Resolved"}`,
      "",
      `${isIT ? "PREVENTION SUGGESTION" : "PREVENTATIVE RECOMMENDATION"}: ${entry.steps[entry.steps.length - 1]}`,
    ];
    setOut(lines.join("\n"));
  };
  const copy = () => { navigator.clipboard?.writeText(out).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); }); };
  const markResolved = () => {
    if (!desc.trim() && !asset.trim()) return;
    setResolved((r) => [...r.slice(-49), { ts: Date.now(), src, category, ticket: (asset.trim() || desc.trim() || category), note: resNote.trim(), result: out || "" }]);
    setResNote(""); setSaved(true); setTimeout(() => setSaved(false), 1400);
  };
  const removeResolved = (ts) => setResolved((r) => r.filter((x) => x.ts !== ts));
  return (
    <Panel label="TICKET OPS // MULTI-SOURCE" right={src.toUpperCase()}>
      <div className="tk-src">{TICKET_SOURCES.map((s) => <button key={s} className={`tk-tab ${src === s ? "on" : ""}`} onClick={() => setSrc(s)}>{s}</button>)}</div>
      <div className="row-in" style={{ marginBottom: 9 }}>
        <select className="tk-select" value={category} onChange={(e) => setCategory(e.target.value)}>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {!isIT && <select className="tk-select" value={severity} onChange={(e) => setSeverity(e.target.value)}>
          {SEVERITIES_TICKET.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>}
      </div>
      <div className="row-in" style={{ marginBottom: 9 }}>
        <input value={asset} onChange={(e) => setAsset(e.target.value)} placeholder={isIT ? "Affected user / device…" : "Affected endpoint / user / asset…"} />
      </div>
      <textarea className="tk-in" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description of what happened…" />
      <div className="tk-btns"><button className="mini-btn wide" onClick={buildSummary}>BUILD TICKET SUMMARY</button></div>
      <div className="row-in" style={{ marginTop: 9, marginBottom: 9 }}>
        <input value={actions} onChange={(e) => setActions(e.target.value)} placeholder="Actions taken (comma-separated)…" />
      </div>
      <div className="row-in" style={{ marginBottom: 9 }}>
        <input value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="Resolution / outcome…" />
      </div>
      <div className="tk-btns"><button className="mini-btn wide" onClick={buildCloseout}>BUILD CLOSE-OUT</button></div>
      {out && <div className="tk-out"><button className="code-btn tk-copy" onClick={copy}>{copied ? "COPIED" : "COPY"}</button><pre>{out}</pre></div>}
      <div className="row-in hunt-log-row">
        <input value={resNote} onChange={(e) => setResNote(e.target.value)} placeholder="Resolution note (optional)…" />
        <button className="mini-btn" disabled={!desc.trim() && !asset.trim()} onClick={markResolved}>{saved ? <Check size={14} /> : "RESOLVED"}</button>
      </div>
      {resolved.length > 0 && <div className="hunt-hist">
        <span className="la-hd">RESOLVED TICKETS — {resolved.length}</span>
        {resolved.slice().reverse().slice(0, 12).map((r) => (
          <div key={r.ts} className="ticket-row">
            <span className="mail-dot on" />
            <div className="ticket-txt">
              <span className="ticket-sub">{r.src} — {r.ticket.slice(0, 70)}{r.ticket.length > 70 ? "…" : ""}</span>
              <span className="ticket-meta">{new Date(r.ts).toLocaleString()}{r.note ? ` · ${r.note}` : ""}</span>
            </div>
            <button className="ticket-del" onClick={() => removeResolved(r.ts)} aria-label="remove"><X size={12} /></button>
          </div>
        ))}
      </div>}
    </Panel>
  );
}

function interpretReport(report) {
  if (!report?.summary) return "";
  const { summary, anomalies } = report;
  const { sev, total } = summary;
  const errRate = total ? (sev.error + sev.crit) / total : 0;
  const status = sev.crit > 0 ? "CRITICAL" : errRate > 0.15 ? "ELEVATED" : errRate > 0.05 ? "WATCH" : "NOMINAL";
  const flags = anomalies.filter((a) => !/^No significant drift|^Baseline established/.test(a));
  const lines = [`STATUS: ${status}`];
  if (sev.crit > 0) lines.push(`${sev.crit} critical/emergency line(s) present — check these first.`);
  if (errRate > 0.15) lines.push(`Error/critical rate is ${(errRate * 100).toFixed(0)}% of total lines, above the 15% watch threshold.`);
  if (flags.length) {
    const rank = (s) => /spike/i.test(s) ? 0 : /new active ip/i.test(s) ? 1 : /new recurring/i.test(s) ? 2 : 3;
    const ranked = flags.slice().sort((a, b) => rank(a) - rank(b));
    lines.push("Flagged for review, in priority order:");
    ranked.forEach((a, i) => lines.push(`${i + 1}. ${a}`));
  } else {
    lines.push("No anomalies flagged against baseline.");
  }
  return lines.join("\n");
}

function SyslogAnalyzer() {
  const [hist, setHist] = useState([]); const [report, setReport] = useState(null); const [busy, setBusy] = useState(false); const [ready, setReady] = useState(false); const [expl, setExpl] = useState("");
  useEffect(() => { (async () => { const d = await store.get("mo:syslog", { hist: [] }); setHist(d.hist || []); setReady(true); })(); }, []);
  useEffect(() => { if (ready) store.set("mo:syslog", { hist }); }, [hist, ready]);
  const analyze = async (e) => {
    const f = e.target.files?.[0]; if (!f) return; setBusy(true); setReport(null); setExpl("");
    try {
      const lines = (await f.text()).split(/\r?\n/).filter(Boolean).slice(0, 50000);
      const sev = { crit: 0, error: 0, warn: 0, info: 0 }, sigs = {}, ips = {}, ipRe = /\b\d{1,3}(\.\d{1,3}){3}\b/;
      for (const ln of lines) {
        const low = ln.toLowerCase();
        if (/crit|fatal|emerg/.test(low)) sev.crit++; else if (/error|fail/.test(low)) sev.error++; else if (/warn/.test(low)) sev.warn++; else sev.info++;
        const ip = ln.match(ipRe); if (ip) ips[ip[0]] = (ips[ip[0]] || 0) + 1;
        const sig = ln.replace(/\d+/g, "#").replace(/\s+/g, " ").trim().slice(0, 80); sigs[sig] = (sigs[sig] || 0) + 1;
      }
      const summary = { ts: Date.now(), name: f.name, total: lines.length, sev,
        topSigs: Object.entries(sigs).sort((a, b) => b[1] - a[1]).slice(0, 8),
        topIps: Object.entries(ips).sort((a, b) => b[1] - a[1]).slice(0, 6) };
      const anomalies = [];
      if (hist.length) {
        const avgErr = hist.reduce((s, h) => s + h.sev.error + h.sev.crit, 0) / hist.length;
        if (sev.error + sev.crit > avgErr * 1.5 + 5) anomalies.push(`Error/critical volume ${sev.error + sev.crit} vs baseline ~${Math.round(avgErr)} — spike.`);
        const kSig = new Set(hist.flatMap((h) => h.topSigs.map((x) => x[0])));
        summary.topSigs.forEach(([sig, c]) => { if (!kSig.has(sig) && c > 3) anomalies.push(`New recurring event (${c}x): ${sig}`); });
        const kIp = new Set(hist.flatMap((h) => h.topIps.map((x) => x[0])));
        summary.topIps.forEach(([ip, c]) => { if (!kIp.has(ip) && c > 5) anomalies.push(`New active IP ${ip} (${c} lines)`); });
        if (!anomalies.length) anomalies.push("No significant drift vs baseline.");
      } else anomalies.push("Baseline established. Import more logs over time to detect drift.");
      const rep = { summary, anomalies };
      setReport(rep); setHist((h) => [...h.slice(-9), summary]);
      setExpl(interpretReport(rep));
    } catch (ex) { setReport({ summary: null, anomalies: ["Parse failed: " + ex.message] }); }
    finally { setBusy(false); e.target.value = ""; }
  };
  const s = report?.summary;
  return (
    <Panel label="SYSLOG BASELINE" right={`${hist.length} IN BASELINE`}>
      <label className="log-drop">{busy ? "ANALYZING…" : "IMPORT LOG FILE (.log / .txt)"}<input type="file" accept=".log,.txt,.csv" onChange={analyze} hidden /></label>
      {s && <div className="log-metrics"><span className="lm crit">CRIT {s.sev.crit}</span><span className="lm err">ERR {s.sev.error}</span><span className="lm warn">WARN {s.sev.warn}</span><span className="lm info">{s.total} LINES</span></div>}
      {report && <div className="log-anom"><span className="la-hd">ANOMALIES</span>{report.anomalies.map((a, i) => <div key={i} className="la-row">▸ {a}</div>)}</div>}
      {expl && <div className="tk-out"><pre>{expl}</pre></div>}
    </Panel>
  );
}

const IOC_TYPES = ["IP Address", "File Hash", "Domain", "Process Name", "Username"];
const QUERY_TEMPLATES = {
  "IP Address": {
    s1: (v) => `NetworkConnection.event.direction IN ("outbound","inbound") AND (DstIP = "${v}" OR SrcIP = "${v}")`,
    logscale: (v) => `#event_simpleName=NetworkConnect* | in(field=RemoteAddressIP4, values=["${v}"])`,
  },
  "File Hash": {
    s1: (v) => `TgtFileSHA256 = "${v}" OR TgtFileMD5 = "${v}"`,
    logscale: (v) => `#event_simpleName=/^(ProcessRollup2|SyntheticProcessRollup2)$/ | SHA256Hash="${v}" OR MD5Hash="${v}"`,
  },
  "Domain": {
    s1: (v) => `DNS.Request = "${v}" OR Url.Domain = "${v}"`,
    logscale: (v) => `#event_simpleName=DnsRequest | DomainName="${v}"`,
  },
  "Process Name": {
    s1: (v) => `TgtProcName = "${v}"`,
    logscale: (v) => `#event_simpleName=/^(ProcessRollup2|SyntheticProcessRollup2)$/ | FileName="${v}"`,
  },
  "Username": {
    s1: (v) => `User.Name = "${v}"`,
    logscale: (v) => `#event_simpleName=UserLogon | UserName="${v}"`,
  },
};

function ThreatHuntOps() {
  const [threat, setThreat] = useState("");
  const [background, setBackground] = useState("");
  const [iocType, setIocType] = useState(IOC_TYPES[0]);
  const [iocValue, setIocValue] = useState("");
  const [iocs, setIocs] = useState([]);
  const [steps, setSteps] = useState("");
  const [findings, setFindings] = useState("");
  const [hist, setHist] = useState([]);
  const [ready, setReady] = useState(false);

  useEffect(() => { (async () => { setHist(await store.get("mo:hunts", [])); setReady(true); })(); }, []);
  useEffect(() => { if (ready) store.set("mo:hunts", hist); }, [hist, ready]);

  const addIoc = () => {
    if (!iocValue.trim()) return;
    setIocs((p) => [...p, { type: iocType, value: iocValue.trim() }]);
    setIocValue("");
  };
  const removeIoc = (idx) => setIocs((p) => p.filter((_, i) => i !== idx));

  const log = () => {
    if (!threat.trim() && !iocs.length) return;
    setHist((h) => [...h.slice(-24), { ts: Date.now(), threat: threat.trim() || "Untitled", iocs: iocs.length, findings: findings.trim() || "No findings" }]);
    setFindings(""); setThreat(""); setBackground(""); setIocs([]); setSteps("");
  };

  const stepList = steps.split("\n").map((s) => s.trim()).filter(Boolean);

  return (
    <Panel label="THREAT HUNT OPS" right={`${hist.length} LOGGED`}>
      <div className="row-in" style={{ marginBottom: 9 }}>
        <input value={threat} onChange={(e) => setThreat(e.target.value)} placeholder="Threat / campaign name…" />
      </div>
      <textarea className="tk-in" value={background} onChange={(e) => setBackground(e.target.value)} placeholder="Background (what tipped this off, what you're hunting for)…" />
      <div className="row-in" style={{ margin: "9px 0" }}>
        <select className="tk-select" value={iocType} onChange={(e) => setIocType(e.target.value)}>
          {IOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input value={iocValue} onChange={(e) => setIocValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addIoc()} placeholder="Value…" />
        <button className="mini-btn" onClick={addIoc}>ADD</button>
      </div>
      {iocs.length > 0 && (
        <div className="hunt-parsed">
          {iocs.map((ioc, idx) => (
            <div key={idx} className="hunt-ioc-block">
              <div className="hunt-ioc-hd"><span className="chip">{ioc.type}: {ioc.value}</span><button className="ticket-del" onClick={() => removeIoc(idx)} aria-label="remove"><X size={12} /></button></div>
              <div className="code-blk"><div className="code-bar"><span className="code-lang">SentinelOne Deep Visibility</span></div><pre className="code-pre"><code>{QUERY_TEMPLATES[ioc.type].s1(ioc.value)}</code></pre></div>
              <div className="code-blk"><div className="code-bar"><span className="code-lang">Falcon LogScale</span></div><pre className="code-pre"><code>{QUERY_TEMPLATES[ioc.type].logscale(ioc.value)}</code></pre></div>
            </div>
          ))}
          <div className="vnote">Starting-point syntax based on common field names — verify against your actual LogScale/S1 schema before running.</div>
        </div>
      )}
      <textarea className="tk-in" style={{ marginTop: 9 }} value={steps} onChange={(e) => setSteps(e.target.value)} placeholder="Hunt steps, one per line…" />
      {stepList.length > 0 && <div className="log-anom"><span className="la-hd">HUNT STEPS</span>{stepList.map((s, idx) => <div key={idx} className="la-row">▸ {s}</div>)}</div>}
      <div className="row-in hunt-log-row"><input value={findings} onChange={(e) => setFindings(e.target.value)} placeholder="FINDINGS (blank = no findings)…" /><button className="mini-btn" onClick={log}><Check size={14} /></button></div>
      {hist.length > 0 && (
        <div className="hunt-hist">
          <span className="la-hd">HUNT LOG</span>
          {hist.slice().reverse().slice(0, 8).map((h) => (
            <div key={h.ts} className="mail-row"><span className={`mail-dot ${h.findings !== "No findings" ? "on" : ""}`} /><div className="mail-txt"><span className="mail-sub">{h.threat}</span><span className="mail-meta">{new Date(h.ts).toLocaleDateString()} · {h.iocs} IOCs · {h.findings}</span></div></div>
          ))}
        </div>
      )}
    </Panel>
  );
}

/* ── pure-JS .pptx generator — no external libraries, hand-rolled ZIP + OOXML ── */
function pptxCrc32(bytes) {
  if (!pptxCrc32._table) {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); table[n] = c; }
    pptxCrc32._table = table;
  }
  const table = pptxCrc32._table; let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) crc = table[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function pptxU32(v, o, x) { v.setUint32(o, x, true); }
function pptxU16(v, o, x) { v.setUint16(o, x, true); }
function buildZip(files) {
  const encoder = new TextEncoder(); const localParts = []; const centralParts = []; let offset = 0;
  for (const f of files) {
    const nameBytes = encoder.encode(f.name);
    const data = typeof f.data === "string" ? encoder.encode(f.data) : f.data;
    const crc = pptxCrc32(data); const size = data.length; const localOffset = offset;
    const lfh = new Uint8Array(30 + nameBytes.length); const lv = new DataView(lfh.buffer);
    pptxU32(lv, 0, 0x04034b50); pptxU16(lv, 4, 20); pptxU16(lv, 6, 0); pptxU16(lv, 8, 0); pptxU16(lv, 10, 0); pptxU16(lv, 12, 0x21);
    pptxU32(lv, 14, crc); pptxU32(lv, 18, size); pptxU32(lv, 22, size); pptxU16(lv, 26, nameBytes.length); pptxU16(lv, 28, 0);
    lfh.set(nameBytes, 30);
    localParts.push(lfh, data); offset += lfh.length + data.length;
    const cdh = new Uint8Array(46 + nameBytes.length); const cv = new DataView(cdh.buffer);
    pptxU32(cv, 0, 0x02014b50); pptxU16(cv, 4, 20); pptxU16(cv, 6, 20); pptxU16(cv, 8, 0); pptxU16(cv, 10, 0); pptxU16(cv, 12, 0); pptxU16(cv, 14, 0x21);
    pptxU32(cv, 16, crc); pptxU32(cv, 20, size); pptxU32(cv, 24, size); pptxU16(cv, 28, nameBytes.length); pptxU16(cv, 30, 0); pptxU16(cv, 32, 0);
    pptxU16(cv, 34, 0); pptxU16(cv, 36, 0); pptxU32(cv, 38, 0); pptxU32(cv, 42, localOffset);
    cdh.set(nameBytes, 46); centralParts.push(cdh);
  }
  const centralOffset = offset; const centralSize = centralParts.reduce((s, p) => s + p.length, 0);
  const eocd = new Uint8Array(22); const ev = new DataView(eocd.buffer);
  pptxU32(ev, 0, 0x06054b50); pptxU16(ev, 4, 0); pptxU16(ev, 6, 0); pptxU16(ev, 8, files.length); pptxU16(ev, 10, files.length);
  pptxU32(ev, 12, centralSize); pptxU32(ev, 16, centralOffset); pptxU16(ev, 20, 0);
  const allParts = [...localParts, ...centralParts, eocd]; const totalLen = allParts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(totalLen); let pos = 0; for (const p of allParts) { out.set(p, pos); pos += p.length; }
  return out;
}

const SLIDE_W = 12192000, SLIDE_H = 6858000;
function escXML(s) { return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;"); }

/* ── pure-JS styled .xlsx generator (Vuln Delta export) — hand-rolled, same
   buildZip/escXML primitives as the PPTX/DOCX generators below. The bundled
   'xlsx' library's community build silently drops cell styling on write
   (verified: setting cell.s + {cellStyles:true} produces no style output at
   all), so real fills/fonts/borders and a native chart require building the
   OOXML by hand instead. ── */
const XLSX_STY = { DEFAULT: 0, HEADER: 1, BOLD: 2, CRIT: 3, HIGH: 4, MED: 5, LOW: 6, BAD: 8, GOOD: 9, BORDERED: 10, TITLE: 11 };
function xlsxSeverityStyle(sev) {
  const s = (sev || "").toLowerCase();
  if (s === "critical") return XLSX_STY.CRIT;
  if (s === "high") return XLSX_STY.HIGH;
  if (s === "medium") return XLSX_STY.MED;
  if (s === "low") return XLSX_STY.LOW;
  return XLSX_STY.DEFAULT;
}
function xlsxDeltaStyle(v) { return v > 0 ? XLSX_STY.BAD : v < 0 ? XLSX_STY.GOOD : XLSX_STY.DEFAULT; }
function xlsxColLetter(n) { let s = ""; n++; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; }
function xlsxStylesXML() {
  const fonts = [
    `<font><sz val="11"/><color rgb="FF1F2937"/><name val="Calibri"/></font>`,
    `<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>`,
    `<font><b/><sz val="11"/><color rgb="FF1F2937"/><name val="Calibri"/></font>`,
    `<font><b/><sz val="11"/><color rgb="FFB91C1C"/><name val="Calibri"/></font>`,
    `<font><b/><sz val="11"/><color rgb="FFC2410C"/><name val="Calibri"/></font>`,
    `<font><b/><sz val="11"/><color rgb="FFA16207"/><name val="Calibri"/></font>`,
    `<font><b/><sz val="11"/><color rgb="FF15803D"/><name val="Calibri"/></font>`,
    `<font><b/><sz val="16"/><color rgb="FF1F2937"/><name val="Calibri"/></font>`,
  ];
  const fills = [
    `<fill><patternFill patternType="none"/></fill>`,
    `<fill><patternFill patternType="gray125"/></fill>`,
    `<fill><patternFill patternType="solid"><fgColor rgb="FF1F2937"/><bgColor indexed="64"/></patternFill></fill>`,
    `<fill><patternFill patternType="solid"><fgColor rgb="FFFEE2E2"/><bgColor indexed="64"/></patternFill></fill>`,
    `<fill><patternFill patternType="solid"><fgColor rgb="FFFFEDD5"/><bgColor indexed="64"/></patternFill></fill>`,
    `<fill><patternFill patternType="solid"><fgColor rgb="FFFEF9C3"/><bgColor indexed="64"/></patternFill></fill>`,
    `<fill><patternFill patternType="solid"><fgColor rgb="FFDCFCE7"/><bgColor indexed="64"/></patternFill></fill>`,
  ];
  const thinBorder = `<border><left style="thin"><color rgb="FFD1D5DB"/></left><right style="thin"><color rgb="FFD1D5DB"/></right><top style="thin"><color rgb="FFD1D5DB"/></top><bottom style="thin"><color rgb="FFD1D5DB"/></bottom><diagonal/></border>`;
  const borders = [`<border><left/><right/><top/><bottom/><diagonal/></border>`, thinBorder];
  const xfs = [
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>`,
    `<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>`,
    `<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>`,
    `<xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>`,
    `<xf numFmtId="0" fontId="4" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>`,
    `<xf numFmtId="0" fontId="5" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>`,
    `<xf numFmtId="0" fontId="6" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>`,
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>`,
    `<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>`,
    `<xf numFmtId="0" fontId="6" fillId="0" borderId="0" xfId="0" applyFont="1"/>`,
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>`,
    `<xf numFmtId="0" fontId="7" fillId="0" borderId="0" xfId="0" applyFont="1"/>`,
  ];
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<fonts count="${fonts.length}">${fonts.join("")}</fonts>` +
    `<fills count="${fills.length}">${fills.join("")}</fills>` +
    `<borders count="${borders.length}">${borders.join("")}</borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="${xfs.length}">${xfs.join("")}</cellXfs>` +
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
}
function xlsxSheetXML(rows, colWidths, drawingRelId) {
  const rowsXML = rows.map((row, ri) => {
    const r = ri + 1;
    const cells = row.map((cell, ci) => {
      if (cell == null) return "";
      const ref = `${xlsxColLetter(ci)}${r}`;
      const s = cell.s != null ? ` s="${cell.s}"` : "";
      if (typeof cell.v === "number") return `<c r="${ref}"${s}><v>${cell.v}</v></c>`;
      return `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${escXML(cell.v ?? "")}</t></is></c>`;
    }).join("");
    return `<row r="${r}">${cells}</row>`;
  }).join("");
  const maxCols = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const cols = colWidths ? `<cols>${colWidths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` : "";
  const dim = `A1:${xlsxColLetter(Math.max(0, maxCols - 1))}${Math.max(1, rows.length)}`;
  const drawing = drawingRelId ? `<drawing r:id="${drawingRelId}"/>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><dimension ref="${dim}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${rowsXML}</sheetData>${drawing}</worksheet>`;
}
function xlsxContentTypesXML(sheetCount, hasChart) {
  const overrides = [];
  for (let i = 1; i <= sheetCount; i++) overrides.push(`<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`);
  if (hasChart) {
    overrides.push(`<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`);
    overrides.push(`<Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`);
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${overrides.join("")}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
}
function xlsxRootRelsXML() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
}
function xlsxAppXML(sheetNames) {
  const titles = sheetNames.map((n) => `<vt:lpstr>${escXML(n)}</vt:lpstr>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>TALON HUD</Application><TitlesOfParts><vt:vector size="${sheetNames.length}" baseType="lpstr">${titles}</vt:vector></TitlesOfParts><Company>Mechanical Orchard</Company></Properties>`;
}
function xlsxWorkbookXML(sheetNames) {
  const sheets = sheetNames.map((name, i) => `<sheet name="${escXML(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets}</sheets></workbook>`;
}
function xlsxWorkbookRelsXML(sheetCount) {
  const rels = [];
  for (let i = 1; i <= sheetCount; i++) rels.push(`<Relationship Id="rId${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i}.xml"/>`);
  rels.push(`<Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join("")}</Relationships>`;
}
function xlsxSheetRelsXML(drawingTarget) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="${drawingTarget}"/></Relationships>`;
}
function xlsxDrawingXML() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>8</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>18</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>22</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="Chart 1"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId1"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>`;
}
function xlsxDrawingRelsXML() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart1.xml"/></Relationships>`;
}
function xlsxLineSeries(idx, name, color, sheetName, catCol, valCol, categories, values) {
  const catRange = `${sheetName}!$${catCol}$2:$${catCol}$${categories.length + 1}`;
  const valRange = `${sheetName}!$${valCol}$2:$${valCol}$${values.length + 1}`;
  const catPts = categories.map((c, i) => `<c:pt idx="${i}"><c:v>${escXML(c)}</c:v></c:pt>`).join("");
  const valPts = values.map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join("");
  return `<c:ser><c:idx val="${idx}"/><c:order val="${idx}"/><c:tx><c:v>${escXML(name)}</c:v></c:tx><c:spPr><a:ln w="28575"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:ln></c:spPr><c:marker><c:symbol val="circle"/><c:size val="5"/><c:spPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></c:spPr></c:marker><c:cat><c:strRef><c:f>${escXML(catRange)}</c:f><c:strCache><c:ptCount val="${categories.length}"/>${catPts}</c:strCache></c:strRef></c:cat><c:val><c:numRef><c:f>${escXML(valRange)}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${values.length}"/>${valPts}</c:numCache></c:numRef></c:val><c:smooth val="0"/></c:ser>`;
}
function xlsxLineChartXML(title, sheetName, categories, seriesDefs) {
  const series = seriesDefs.map((s, i) => xlsxLineSeries(i, s.name, s.color, sheetName, s.catCol, s.valCol, categories, s.values)).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${escXML(title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/><c:plotArea><c:layout/><c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${series}<c:marker val="1"/><c:axId val="111111111"/><c:axId val="222222222"/></c:lineChart><c:catAx><c:axId val="111111111"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:txPr><a:bodyPr rot="-2700000" vert="horz"/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="800"/></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr><c:crossAx val="222222222"/></c:catAx><c:valAx><c:axId val="222222222"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:majorGridlines/><c:crossAx val="111111111"/></c:valAx></c:plotArea><c:legend><c:legendPos val="b"/></c:legend><c:plotVisOnly val="1"/></c:chart></c:chartSpace>`;
}
function buildVulnDeltaXlsx(hist) {
  const cur = hist[hist.length - 1], prev = hist[hist.length - 2];
  const dv = (c, p) => (c != null && p != null ? c - p : "");
  const S = XLSX_STY;
  const summaryRows = [
    [{ v: "MO VULN DELTA — SUMMARY", s: S.TITLE }],
    [],
    [{ v: "Metric", s: S.HEADER }, { v: "Previous", s: S.HEADER }, { v: "Current", s: S.HEADER }, { v: "Delta", s: S.HEADER }],
    [{ v: "IRU Active", s: S.BORDERED }, { v: prev?.iru ?? "", s: S.BORDERED }, { v: cur.iru, s: S.BORDERED }, { v: dv(cur.iru, prev?.iru), s: xlsxDeltaStyle(dv(cur.iru, prev?.iru)) }],
    [{ v: "S1 Active (deduped)", s: S.BORDERED }, { v: prev?.s1 ?? "", s: S.BORDERED }, { v: cur.s1, s: S.BORDERED }, { v: dv(cur.s1, prev?.s1), s: xlsxDeltaStyle(dv(cur.s1, prev?.s1)) }],
    [{ v: "S1 Critical", s: S.CRIT }, { v: prev?.s1Sev?.Critical ?? "", s: S.BORDERED }, { v: cur.s1Sev?.Critical ?? "", s: S.CRIT }, { v: dv(cur.s1Sev?.Critical, prev?.s1Sev?.Critical), s: xlsxDeltaStyle(dv(cur.s1Sev?.Critical, prev?.s1Sev?.Critical)) }],
    [{ v: "S1 High", s: S.HIGH }, { v: prev?.s1Sev?.High ?? "", s: S.BORDERED }, { v: cur.s1Sev?.High ?? "", s: S.HIGH }, { v: dv(cur.s1Sev?.High, prev?.s1Sev?.High), s: xlsxDeltaStyle(dv(cur.s1Sev?.High, prev?.s1Sev?.High)) }],
    [{ v: "S1 Medium", s: S.MED }, { v: prev?.s1Sev?.Medium ?? "", s: S.BORDERED }, { v: cur.s1Sev?.Medium ?? "", s: S.MED }, { v: dv(cur.s1Sev?.Medium, prev?.s1Sev?.Medium), s: xlsxDeltaStyle(dv(cur.s1Sev?.Medium, prev?.s1Sev?.Medium)) }],
    [{ v: "S1 Low", s: S.LOW }, { v: prev?.s1Sev?.Low ?? "", s: S.BORDERED }, { v: cur.s1Sev?.Low ?? "", s: S.LOW }, { v: dv(cur.s1Sev?.Low, prev?.s1Sev?.Low), s: xlsxDeltaStyle(dv(cur.s1Sev?.Low, prev?.s1Sev?.Low)) }],
  ];
  const cveSheetRows = [
    [{ v: "CVE / Vulnerability", s: S.HEADER }, { v: "Severity", s: S.HEADER }, { v: "Endpoints", s: S.HEADER }],
    ...(cur.s1Cves || []).map((c) => [{ v: c.cve, s: S.BORDERED }, { v: c.sev || "", s: xlsxSeverityStyle(c.sev) }, { v: c.count, s: S.BORDERED }]),
  ];
  const appSheetRows = [
    [{ v: "Application", s: S.HEADER }, { v: "Worst Severity", s: S.HEADER }, { v: "Findings", s: S.HEADER }],
    ...(cur.s1Apps || []).map((a) => [{ v: a.app, s: S.BORDERED }, { v: a.worst || "", s: xlsxSeverityStyle(a.worst) }, { v: a.count, s: S.BORDERED }]),
  ];
  const historyRows = [
    [{ v: "Date", s: S.HEADER }, { v: "IRU", s: S.HEADER }, { v: "S1", s: S.HEADER }, { v: "Critical", s: S.HEADER }, { v: "High", s: S.HEADER }, { v: "Medium", s: S.HEADER }, { v: "Low", s: S.HEADER }],
    ...hist.map((h) => [
      { v: new Date(h.ts).toLocaleDateString(), s: S.BORDERED },
      { v: h.iru, s: S.BORDERED }, { v: h.s1, s: S.BORDERED },
      { v: h.s1Sev?.Critical ?? "", s: S.CRIT }, { v: h.s1Sev?.High ?? "", s: S.HIGH },
      { v: h.s1Sev?.Medium ?? "", s: S.MED }, { v: h.s1Sev?.Low ?? "", s: S.LOW },
    ]),
  ];
  const hasChart = hist.length > 1;
  const sheetNames = ["Summary", "Top CVEs", "Top Applications", "History"];
  const files = [
    { name: "[Content_Types].xml", data: xlsxContentTypesXML(sheetNames.length, hasChart) },
    { name: "_rels/.rels", data: xlsxRootRelsXML() },
    { name: "xl/workbook.xml", data: xlsxWorkbookXML(sheetNames) },
    { name: "xl/_rels/workbook.xml.rels", data: xlsxWorkbookRelsXML(sheetNames.length) },
    { name: "xl/styles.xml", data: xlsxStylesXML() },
    { name: "xl/worksheets/sheet1.xml", data: xlsxSheetXML(summaryRows, [24, 12, 12, 10]) },
    { name: "xl/worksheets/sheet2.xml", data: xlsxSheetXML(cveSheetRows, [22, 12, 12]) },
    { name: "xl/worksheets/sheet3.xml", data: xlsxSheetXML(appSheetRows, [22, 16, 12]) },
    { name: "xl/worksheets/sheet4.xml", data: xlsxSheetXML(historyRows, [12, 8, 8, 10, 8, 10, 8], hasChart ? "rId1" : null) },
  ];
  if (hasChart) {
    files.push({ name: "xl/worksheets/_rels/sheet4.xml.rels", data: xlsxSheetRelsXML("../drawings/drawing1.xml") });
    files.push({ name: "xl/drawings/drawing1.xml", data: xlsxDrawingXML() });
    files.push({ name: "xl/drawings/_rels/drawing1.xml.rels", data: xlsxDrawingRelsXML() });
    files.push({ name: "xl/charts/chart1.xml", data: xlsxLineChartXML("IRU vs S1 Active Vulnerabilities", "History",
      hist.map((h) => new Date(h.ts).toLocaleDateString()),
      [
        { name: "IRU", color: "5ecbff", catCol: "A", valCol: "B", values: hist.map((h) => h.iru) },
        { name: "S1", color: "ffb347", catCol: "A", valCol: "C", values: hist.map((h) => h.s1) },
      ]) });
  }
  files.push({ name: "docProps/core.xml", data: coreXML("MO Vuln Delta") });
  files.push({ name: "docProps/app.xml", data: xlsxAppXML(sheetNames) });
  return buildZip(files);
}

function contentTypesXML(n) { let o = []; for (let i = 1; i <= n; i++) o.push(`<Override PartName="/ppt/slides/slide${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/><Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/><Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>${o.join("")}</Types>`; }
function rootRelsXML() { return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`; }
function coreXML(title) { const now = new Date().toISOString(); return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escXML(title)}</dc:title><dc:creator>TALON HUD</dc:creator><cp:lastModifiedBy>TALON HUD</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`; }
function appXML(n) { return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>TALON HUD</Application><Slides>${n}</Slides><Company>Mechanical Orchard</Company></Properties>`; }
function presentationXML(n) { const ids = []; for (let i = 1; i <= n; i++) ids.push(`<p:sldId id="${255 + i}" r:id="rId${i + 1}"/>`);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${ids.join("")}</p:sldIdLst><p:sldSz cx="${SLIDE_W}" cy="${SLIDE_H}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`; }
function presentationRelsXML(n) { const rels = [`<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>`];
  for (let i = 1; i <= n; i++) rels.push(`<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i}.xml"/>`);
  rels.push(`<Relationship Id="rId${n + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>`);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join("")}</Relationships>`; }
function presPropsXML() { return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentationPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>`; }
function viewPropsXML() { return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:viewPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr></p:viewPr>`; }
function tableStylesXML() { return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:tblStyleLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`; }
function themeXML(accentHex) { return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="TALON"><a:themeElements><a:clrScheme name="TALON"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="0B1220"/></a:dk2><a:lt2><a:srgbClr val="E6F0FA"/></a:lt2><a:accent1><a:srgbClr val="${accentHex}"/></a:accent1><a:accent2><a:srgbClr val="7EE8C9"/></a:accent2><a:accent3><a:srgbClr val="FFB347"/></a:accent3><a:accent4><a:srgbClr val="8AA0B8"/></a:accent4><a:accent5><a:srgbClr val="1C2A3A"/></a:accent5><a:accent6><a:srgbClr val="0E1826"/></a:accent6><a:hlink><a:srgbClr val="${accentHex}"/></a:hlink><a:folHlink><a:srgbClr val="7EE8C9"/></a:folHlink></a:clrScheme><a:fontScheme name="TALON"><a:majorFont><a:latin typeface="Calibri"/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/></a:minorFont></a:fontScheme><a:fmtScheme name="TALON"><a:fillStyleLst><a:solidFill><a:schemeClr val="accent1"/></a:solidFill><a:solidFill><a:schemeClr val="accent1"/></a:solidFill><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="12700"><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="dk2"/></a:solidFill><a:solidFill><a:schemeClr val="dk2"/></a:solidFill><a:solidFill><a:schemeClr val="dk2"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`; }
function slideMasterXML() { return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:bg><p:bgPr><a:solidFill><a:schemeClr val="dk2"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>`; }
function slideMasterRelsXML() { return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>`; }
function slideLayoutXML() { return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:overrideClrMapping bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:clrMapOvr></p:sldLayout>`; }
function slideLayoutRelsXML() { return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`; }
function slideRelsXML() { return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`; }

let pptxShapeId = 1;
function pptxNextId() { return ++pptxShapeId; }
const PPTX_MARGIN = 548640, PPTX_CONTENT_W = SLIDE_W - PPTX_MARGIN * 2;
function pptxTitleBar(text, accentHex) {
  const id = pptxNextId();
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Title ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${PPTX_MARGIN}" y="365760"/><a:ext cx="${PPTX_CONTENT_W}" cy="731520"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square" anchor="b"/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="3200" b="1"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:rPr><a:t>${escXML(text)}</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="${pptxNextId()}" name="Rule"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${PPTX_MARGIN}" y="1120000"/><a:ext cx="${PPTX_CONTENT_W}" cy="18000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${accentHex}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody></p:sp>`;
}
function pptxBulletsBox(x, y, cx, cy, heading, lines, accentHex) {
  const id = pptxNextId(); const paras = [];
  if (heading) paras.push(`<a:p><a:r><a:rPr lang="en-US" sz="1600" b="1"><a:solidFill><a:srgbClr val="${accentHex}"/></a:solidFill></a:rPr><a:t>${escXML(heading)}</a:t></a:r></a:p>`);
  const items = (lines || []).filter(Boolean);
  if (items.length === 0) paras.push(`<a:p><a:r><a:rPr lang="en-US" sz="1400" i="1"><a:solidFill><a:srgbClr val="8AA0B8"/></a:solidFill></a:rPr><a:t>No entry this week.</a:t></a:r></a:p>`);
  else for (const line of items) paras.push(`<a:p><a:pPr marL="228600" indent="-228600"><a:buFont typeface="Arial"/><a:buChar char="&#8226;"/></a:pPr><a:r><a:rPr lang="en-US" sz="1400"><a:solidFill><a:srgbClr val="E6F0FA"/></a:solidFill></a:rPr><a:t>${escXML(line)}</a:t></a:r></a:p>`);
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Body ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square"/><a:lstStyle/>${paras.join("")}</p:txBody></p:sp>`;
}
function pptxTable(x, y, cx, cy, headers, rows, accentHex) {
  const id = pptxNextId(); const colW = Math.floor(cx / headers.length);
  const grid = headers.map(() => `<a:gridCol w="${colW}"/>`).join("");
  const rowH = Math.max(320000, Math.floor((cy - 457200) / Math.max(rows.length, 1)));
  const mkCell = (text, isHeader) => `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="${isHeader ? 1300 : 1200}" b="${isHeader ? 1 : 0}"><a:solidFill><a:srgbClr val="0B1220"/></a:solidFill></a:rPr><a:t>${escXML(text)}</a:t></a:r></a:p></a:txBody><a:tcPr anchor="ctr"><a:solidFill><a:srgbClr val="${isHeader ? accentHex : "FFFFFF"}"/></a:solidFill></a:tcPr></a:tc>`;
  const headRowXML = `<a:tr h="457200">${headers.map((h) => mkCell(h, true)).join("")}</a:tr>`;
  const bodyRowsXML = rows.map((r) => `<a:tr h="${rowH}">${r.map((c) => mkCell(c, false)).join("")}</a:tr>`).join("");
  return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="Table ${id}"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1" bandRow="1"/><a:tblGrid>${grid}</a:tblGrid>${headRowXML}${bodyRowsXML}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
}
function pptxSlideXML(shapesXML) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="0B1220"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${shapesXML}</p:spTree></p:cSld><p:clrMapOvr><a:overrideClrMapping bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:clrMapOvr></p:sld>`;
}
function pptxBuildTitleSlide(weekOf, accentHex) {
  pptxShapeId = 1; const id = pptxNextId();
  const shapes = `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="CoverTitle"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${PPTX_MARGIN}" y="2743200"/><a:ext cx="${PPTX_CONTENT_W}" cy="914400"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr anchor="ctr"/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="4400" b="1"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:rPr><a:t>Mechanical Orchard — PKI Report</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="${pptxNextId()}" name="CoverSub"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${PPTX_MARGIN}" y="3657600"/><a:ext cx="${PPTX_CONTENT_W}" cy="457200"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="2000"><a:solidFill><a:srgbClr val="${accentHex}"/></a:solidFill></a:rPr><a:t>${escXML(weekOf)}</a:t></a:r></a:p></p:txBody></p:sp>`;
  return pptxSlideXML(shapes);
}
function pptxBuildBulletsSlide(title, sections, accentHex) {
  pptxShapeId = 1; let shapes = pptxTitleBar(title, accentHex);
  const top = 1320000, usableH = SLIDE_H - top - 365760, each = Math.floor(usableH / sections.length);
  sections.forEach((s, i) => { shapes += pptxBulletsBox(PPTX_MARGIN, top + i * each, PPTX_CONTENT_W, each, s.heading, s.lines, accentHex); });
  return pptxSlideXML(shapes);
}
function pptxBuildTableSlide(title, tables, accentHex) {
  pptxShapeId = 1; let shapes = pptxTitleBar(title, accentHex);
  for (const t of tables) shapes += pptxTable(t.x, t.y, t.cx, t.cy, t.headers, t.rows, accentHex);
  return pptxSlideXML(shapes);
}
function pptxSplitLines(text) { return (text || "").split(/\n+/).map((l) => l.trim()).filter(Boolean); }

function buildPKIPptx(form, hist) {
  const ACCENT = "5ECBFF";
  const slidesXML = [];
  slidesXML.push(pptxBuildTitleSlide(form.weekOf, ACCENT));
  slidesXML.push(pptxBuildBulletsSlide("Weekly Highlights & Incidents", [
    { heading: "Weekly Highlights", lines: pptxSplitLines(form.highlights) },
    { heading: "S1 Incidents", lines: pptxSplitLines(form.s1Incidents) },
  ], ACCENT));
  slidesXML.push(pptxBuildBulletsSlide("Ticket Summary", [
    { heading: "Pondurance Tickets", lines: pptxSplitLines(form.ponduranceTickets) },
    { heading: "IT Tickets", lines: pptxSplitLines(form.itTickets) },
    { heading: "InfoSec Tickets", lines: pptxSplitLines(form.infosecTickets) },
  ], ACCENT));
  const half = Math.floor((SLIDE_W - PPTX_MARGIN * 2 - 300000) / 2);
  slidesXML.push(pptxBuildTableSlide("Vulnerability Summary", [
    { headers: ["S1 Vulns", "Count"], x: PPTX_MARGIN, y: 1500000, cx: half, cy: 2200000, rows: [["Critical", form.s1Vulns.critical], ["High", form.s1Vulns.high], ["Medium", form.s1Vulns.medium], ["Low", form.s1Vulns.low]] },
    { headers: ["IRU Vulns", "Count"], x: PPTX_MARGIN + half + 300000, y: 1500000, cx: half, cy: 2200000, rows: [["Critical", form.iruVulns.critical], ["High", form.iruVulns.high], ["Medium", form.iruVulns.medium], ["Low", form.iruVulns.low]] },
  ], ACCENT));
  slidesXML.push(pptxBuildTableSlide("Compliance Scores", [
    { headers: ["Framework", "Score"], x: PPTX_MARGIN, y: 1500000, cx: SLIDE_W - PPTX_MARGIN * 2, cy: 1800000, rows: [["ISO 27001", form.compliance.iso27001 + "%"], ["SOC 1", form.compliance.soc1 + "%"], ["SOC 2", form.compliance.soc2 + "%"]] },
  ], ACCENT));
  slidesXML.push(pptxBuildBulletsSlide("To-Dos For Next Week", [{ heading: null, lines: pptxSplitLines(form.todos) }], ACCENT));
  if (hist && hist.length > 1) {
    const recent = hist.slice(-6);
    slidesXML.push(pptxBuildTableSlide(`Trend — Last ${recent.length} Weeks`, [
      { headers: ["Week", "S1 Crit", "S1 High", "IRU Crit", "IRU High"], x: PPTX_MARGIN, y: 1500000, cx: SLIDE_W - PPTX_MARGIN * 2, cy: 2400000, rows: recent.map((h) => [h.weekOf, h.s1Vulns.critical, h.s1Vulns.high, h.iruVulns.critical, h.iruVulns.high]) },
    ], ACCENT));
  }
  const slideCount = slidesXML.length;
  const files = [
    { name: "[Content_Types].xml", data: contentTypesXML(slideCount) },
    { name: "_rels/.rels", data: rootRelsXML() },
    { name: "docProps/core.xml", data: coreXML("MO PKI Report — " + form.weekOf) },
    { name: "docProps/app.xml", data: appXML(slideCount) },
    { name: "ppt/presentation.xml", data: presentationXML(slideCount) },
    { name: "ppt/_rels/presentation.xml.rels", data: presentationRelsXML(slideCount) },
    { name: "ppt/presProps.xml", data: presPropsXML() },
    { name: "ppt/viewProps.xml", data: viewPropsXML() },
    { name: "ppt/tableStyles.xml", data: tableStylesXML() },
    { name: "ppt/theme/theme1.xml", data: themeXML(ACCENT) },
    { name: "ppt/slideMasters/slideMaster1.xml", data: slideMasterXML() },
    { name: "ppt/slideMasters/_rels/slideMaster1.xml.rels", data: slideMasterRelsXML() },
    { name: "ppt/slideLayouts/slideLayout1.xml", data: slideLayoutXML() },
    { name: "ppt/slideLayouts/_rels/slideLayout1.xml.rels", data: slideLayoutRelsXML() },
  ];
  slidesXML.forEach((xml, i) => { files.push({ name: `ppt/slides/slide${i + 1}.xml`, data: xml }); files.push({ name: `ppt/slides/_rels/slide${i + 1}.xml.rels`, data: slideRelsXML() }); });
  return buildZip(files);
}

/* ── MO shield logo (embedded, base64 PNG) ── */
const MO_LOGO_B64 = "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";
function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
const MO_LOGO_PNG_BYTES = base64ToBytes(MO_LOGO_B64);
const MO_DARK = "1B3A33", MO_GREEN = "2D623D", MO_MUTED = "5B6B63";

/* ── pure-JS .docx generator — reuses buildZip from the pptx generator above ── */
function docxContentTypesXML() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
}
function docxRootRelsXML() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
}
function docxCoreXML(title) {
  const now = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escXML(title)}</dc:title><dc:creator>TALON HUD</dc:creator><cp:lastModifiedBy>TALON HUD</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;
}
function docxAppXML() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>TALON HUD</Application><Company>Mechanical Orchard</Company></Properties>`;
}
function docxDocumentRelsXML() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/></Relationships>`;
}
function docxStylesXML() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`;
}
function docxPPara(runsXML, opts = {}) {
  const spacing = `<w:spacing w:before="${opts.before ?? 0}" w:after="${opts.after ?? 160}"/>`;
  const jc = opts.center ? `<w:jc w:val="center"/>` : "";
  const border = opts.borderBottom ? `<w:pBdr><w:bottom w:val="single" w:sz="${opts.borderSz || 12}" w:space="4" w:color="${opts.borderColor || MO_GREEN}"/></w:pBdr>` : "";
  return `<w:p><w:pPr>${spacing}${jc}${border}</w:pPr>${runsXML}</w:p>`;
}
function docxRun(text, opts = {}) {
  const rpr = [];
  if (opts.b) rpr.push("<w:b/>");
  if (opts.i) rpr.push("<w:i/>");
  if (opts.color) rpr.push(`<w:color w:val="${opts.color}"/>`);
  if (opts.sz) rpr.push(`<w:sz w:val="${opts.sz}"/>`);
  if (opts.caps) rpr.push("<w:caps/>");
  return `<w:r>${rpr.length ? `<w:rPr>${rpr.join("")}</w:rPr>` : ""}<w:t xml:space="preserve">${escXML(text)}</w:t></w:r>`;
}
function docxLogoParagraph(cxEmu, cyEmu) {
  return `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="120"/></w:pPr><w:r><w:drawing>
<wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
<wp:extent cx="${cxEmu}" cy="${cyEmu}"/>
<wp:effectExtent l="0" t="0" r="0" b="0"/>
<wp:docPr id="1" name="Logo"/>
<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
<pic:nvPicPr><pic:cNvPr id="0" name="Logo"/><pic:cNvPicPr/></pic:nvPicPr>
<pic:blipFill><a:blip r:embed="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cxEmu}" cy="${cyEmu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>
</pic:pic>
</a:graphicData>
</a:graphic>
</wp:inline>
</w:drawing></w:r></w:p>`;
}
function procClassifyLine(line) {
  const t = line.trim();
  if (!t) return { type: "blank" };
  if (/^[A-Z][A-Z0-9 /&\-']{3,}:?$/.test(t) && t === t.toUpperCase()) return { type: "heading", text: t.replace(/:$/, "") };
  if (/^(\d+[.)]|[-•*])\s+/.test(t)) return { type: "bullet", text: t.replace(/^(\d+[.)]|[-•*])\s+/, "") };
  return { type: "body", text: t };
}
function docxBodyParagraphsXML(draftText) {
  const lines = (draftText || "").split(/\n/);
  const out = [];
  for (const line of lines) {
    const c = procClassifyLine(line);
    if (c.type === "blank") continue;
    if (c.type === "heading") out.push(docxPPara(docxRun(c.text, { b: true, color: MO_GREEN, sz: 26 }), { before: 220, after: 100 }));
    else if (c.type === "bullet") out.push(docxPPara(docxRun("•  " + c.text, {}), { before: 20, after: 60 }));
    else out.push(docxPPara(docxRun(c.text, {}), { before: 20, after: 120 }));
  }
  return out.join("");
}
function docxDocumentXML({ title, draft }) {
  const today = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  const logoCx = 685800, logoCy = 810000;
  const body = [
    docxLogoParagraph(logoCx, logoCy),
    docxPPara(docxRun("MECHANICAL ORCHARD", { b: true, color: MO_DARK, sz: 32 }), { center: true, after: 20 }),
    docxPPara(docxRun("INFORMATION SECURITY — PROCEDURE DOCUMENTATION", { color: MO_MUTED, sz: 18, caps: true }), { center: true, after: 260, borderBottom: true }),
    docxPPara(docxRun(title || "Untitled Procedure", { b: true, color: MO_DARK, sz: 30 }), { before: 120, after: 40 }),
    docxPPara(docxRun(`Prepared by A. Makris  ·  ${today}`, { color: MO_MUTED, sz: 18 }), { after: 300 }),
    docxBodyParagraphsXML(draft),
    docxPPara(docxRun("Mechanical Orchard — Information Security", { color: MO_MUTED, sz: 16 }), { center: true, before: 400 }),
  ].join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080"/></w:sectPr></w:body></w:document>`;
}
function buildProcedureDocx({ title, draft }) {
  const files = [
    { name: "[Content_Types].xml", data: docxContentTypesXML() },
    { name: "_rels/.rels", data: docxRootRelsXML() },
    { name: "docProps/core.xml", data: docxCoreXML(title || "Procedure") },
    { name: "docProps/app.xml", data: docxAppXML() },
    { name: "word/document.xml", data: docxDocumentXML({ title, draft }) },
    { name: "word/_rels/document.xml.rels", data: docxDocumentRelsXML() },
    { name: "word/styles.xml", data: docxStylesXML() },
    { name: "word/media/image1.png", data: MO_LOGO_PNG_BYTES },
  ];
  return buildZip(files);
}

/* ── MO-themed printable HTML report (for Print / Save as PDF) ── */
function buildProcedureReportHTML({ title, draft }) {
  const today = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  const lines = (draft || "").split(/\n/);
  const bodyHtml = lines.map((line) => {
    const c = procClassifyLine(line);
    if (c.type === "blank") return "";
    if (c.type === "heading") return `<h2>${escXML(c.text)}</h2>`;
    if (c.type === "bullet") return `<li>${escXML(c.text)}</li>`;
    return `<p>${escXML(c.text)}</p>`;
  }).join("\n");
  // wrap consecutive <li> into <ul>
  const wrapped = bodyHtml.replace(/(<li>.*?<\/li>\n?)+/gs, (m) => `<ul>${m}</ul>`);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escXML(title || "Procedure")}</title>
<style>
body{background:#f5f1e8;color:#1b1f1d;font-family:Georgia,'Times New Roman',serif;margin:0;padding:50px;max-width:760px;margin:0 auto}
.hd{text-align:center;margin-bottom:10px}
.hd img{width:70px;margin-bottom:10px}
.hd h1{font-family:Arial,sans-serif;color:#${MO_DARK};letter-spacing:.06em;font-size:22px;margin:0}
.hd .sub{font-family:Arial,sans-serif;color:#${MO_MUTED};letter-spacing:.08em;font-size:11px;text-transform:uppercase;border-bottom:3px solid #${MO_GREEN};display:inline-block;padding-bottom:10px;margin-top:6px}
h2.title{font-family:Arial,sans-serif;color:#${MO_DARK};font-size:19px;margin:26px 0 2px}
.meta{font-family:Arial,sans-serif;color:#${MO_MUTED};font-size:12px;margin-bottom:20px}
h2{font-family:Arial,sans-serif;color:#${MO_GREEN};font-size:14px;letter-spacing:.04em;margin:22px 0 6px}
p{line-height:1.6;margin:4px 0}
ul{margin:4px 0 10px;padding-left:22px}
li{line-height:1.6;margin:2px 0}
.ft{text-align:center;font-family:Arial,sans-serif;color:#${MO_MUTED};font-size:11px;margin-top:40px}
.no-print{text-align:center;margin-top:30px}
button{background:#${MO_DARK};color:#f5f1e8;border:none;padding:10px 20px;font-family:Arial,sans-serif;letter-spacing:.05em;cursor:pointer;border-radius:4px}
@media print{.no-print{display:none}body{padding:20px}}
</style></head>
<body>
<div class="hd">
<img src="data:image/png;base64,${MO_LOGO_B64}" alt="Mechanical Orchard"/>
<h1>MECHANICAL ORCHARD</h1>
<div class="sub">Information Security — Procedure Documentation</div>
</div>
<h2 class="title">${escXML(title || "Untitled Procedure")}</h2>
<div class="meta">Prepared by A. Makris · ${today}</div>
${wrapped}
<div class="ft">Mechanical Orchard — Information Security</div>
<div class="no-print"><button onclick="window.print()">PRINT / SAVE AS PDF</button></div>
</body></html>`;
}


const PKI_BLANK = {
  weekOf: "", highlights: "", s1Incidents: "", ponduranceTickets: "", itTickets: "", infosecTickets: "",
  s1Vulns: { critical: 0, high: 0, medium: 0, low: 0 },
  iruVulns: { critical: 0, high: 0, medium: 0, low: 0 },
  compliance: { iso27001: 0, soc1: 0, soc2: 0 },
  todos: "",
};

function defaultWeekLabel() {
  const d = new Date();
  return `Week of ${d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
}

function buildPKISummary(f) {
  const lines = [`MO PKI REPORT — ${f.weekOf || "(no date set)"}`, ""];
  const section = (label, val) => { if (val && val.trim()) lines.push(label, val.trim(), ""); };
  section("WEEKLY HIGHLIGHTS", f.highlights);
  section("S1 INCIDENTS", f.s1Incidents);
  section("PONDURANCE TICKETS", f.ponduranceTickets);
  section("IT TICKETS", f.itTickets);
  section("INFOSEC TICKETS", f.infosecTickets);
  lines.push("S1 VULNS", `Critical: ${f.s1Vulns.critical}, High: ${f.s1Vulns.high}, Medium: ${f.s1Vulns.medium}, Low: ${f.s1Vulns.low}`, "");
  lines.push("IRU VULNS", `Critical: ${f.iruVulns.critical}, High: ${f.iruVulns.high}, Medium: ${f.iruVulns.medium}, Low: ${f.iruVulns.low}`, "");
  lines.push("COMPLIANCE SCORES", `ISO 27001: ${f.compliance.iso27001}%, SOC 1: ${f.compliance.soc1}%, SOC 2: ${f.compliance.soc2}%`, "");
  section("TO-DOS FOR NEXT WEEK", f.todos);
  return lines.join("\n");
}

function PKIReport() {
  const [hist, setHist] = useState([]);
  const [form, setForm] = useState({ ...PKI_BLANK, weekOf: defaultWeekLabel() });
  const [editingTs, setEditingTs] = useState(null);
  const [ready, setReady] = useState(false);
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => { (async () => {
    const h = await store.get("mo:pki", []);
    setHist(h);
    if (h.length) {
      const last = h[h.length - 1];
      setForm({ ...PKI_BLANK, weekOf: defaultWeekLabel(), s1Vulns: { ...last.s1Vulns }, iruVulns: { ...last.iruVulns }, compliance: { ...last.compliance } });
    }
    setReady(true);
  })(); }, []);
  useEffect(() => { if (ready) store.set("mo:pki", hist); }, [hist, ready]);

  const setNum = (section, key, val) => setForm((f) => ({ ...f, [section]: { ...f[section], [key]: parseInt(val) || 0 } }));
  const setText = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const filled = (v) => typeof v === "string" ? v.trim().length > 0 : true;
  const CHECKLIST = [
    { key: "highlights", label: "WEEKLY HIGHLIGHTS", type: "text" },
    { key: "s1Incidents", label: "S1 INCIDENTS", type: "text" },
    { key: "ponduranceTickets", label: "PONDURANCE TICKETS", type: "text" },
    { key: "itTickets", label: "IT TICKETS", type: "text" },
    { key: "infosecTickets", label: "INFOSEC TICKETS", type: "text" },
    { key: "s1Vulns", label: "S1 VULNS — CRIT / HIGH / MED / LOW", type: "sev4" },
    { key: "iruVulns", label: "IRU VULNS — CRIT / HIGH / MED / LOW", type: "sev4" },
    { key: "compliance", label: "COMPLIANCE — ISO 27001 / SOC 1 / SOC 2", type: "comp3" },
    { key: "todos", label: "TO-DOS FOR NEXT WEEK", type: "text" },
  ];

  const newWeek = () => {
    const last = hist[hist.length - 1];
    setForm({ ...PKI_BLANK, weekOf: defaultWeekLabel(), s1Vulns: last ? { ...last.s1Vulns } : { ...PKI_BLANK.s1Vulns }, iruVulns: last ? { ...last.iruVulns } : { ...PKI_BLANK.iruVulns }, compliance: last ? { ...last.compliance } : { ...PKI_BLANK.compliance } });
    setEditingTs(null); setNote("");
  };
  const loadWeek = (entry) => { setForm({ ...entry }); setEditingTs(entry.ts); setNote(`Editing ${entry.weekOf}`); };
  const removeWeek = (ts) => { setHist((p) => p.filter((x) => x.ts !== ts)); if (ts === editingTs) newWeek(); };
  const save = () => {
    if (editingTs) {
      setHist((h) => h.map((e) => e.ts === editingTs ? { ...form, ts: editingTs } : e));
      setNote("Updated " + form.weekOf);
    } else {
      const entry = { ...form, ts: Date.now() };
      setHist((h) => [...h.slice(-51), entry]);
      setNote("Logged " + form.weekOf);
      setEditingTs(entry.ts);
    }
  };
  const copySummary = () => {
    navigator.clipboard?.writeText(buildPKISummary(form)).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); });
  };
  const exportXLSX = () => {
    const wb = XLSX.utils.book_new();
    const rows = [
      ["Section", "Value"],
      ["Week Of", form.weekOf],
      ["Weekly Highlights", form.highlights],
      ["S1 Incidents", form.s1Incidents],
      ["Pondurance Tickets", form.ponduranceTickets],
      ["IT Tickets", form.itTickets],
      ["InfoSec Tickets", form.infosecTickets],
      ["S1 Vulns — Critical", form.s1Vulns.critical], ["S1 Vulns — High", form.s1Vulns.high], ["S1 Vulns — Medium", form.s1Vulns.medium], ["S1 Vulns — Low", form.s1Vulns.low],
      ["IRU Vulns — Critical", form.iruVulns.critical], ["IRU Vulns — High", form.iruVulns.high], ["IRU Vulns — Medium", form.iruVulns.medium], ["IRU Vulns — Low", form.iruVulns.low],
      ["Compliance — ISO 27001", form.compliance.iso27001], ["Compliance — SOC 1", form.compliance.soc1], ["Compliance — SOC 2", form.compliance.soc2],
      ["To-Dos For Next Week", form.todos],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "PKI Report");
    const histRows = [["Week Of", "S1 Crit", "S1 High", "S1 Med", "S1 Low", "IRU Crit", "IRU High", "IRU Med", "IRU Low", "ISO 27001", "SOC 1", "SOC 2"],
      ...hist.map((h) => [h.weekOf, h.s1Vulns.critical, h.s1Vulns.high, h.s1Vulns.medium, h.s1Vulns.low, h.iruVulns.critical, h.iruVulns.high, h.iruVulns.medium, h.iruVulns.low, h.compliance.iso27001, h.compliance.soc1, h.compliance.soc2])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(histRows), "History");
    XLSX.writeFile(wb, `MO_PKI_Report_${form.weekOf.replace(/[^\w]+/g, "_")}.xlsx`);
    setNote("XLSX exported — raw data backup / for further analysis");
  };
  const exportPPTX = () => {
    try {
      const bytes = buildPKIPptx(form, hist);
      const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `MO_PKI_Report_${form.weekOf.replace(/[^\w]+/g, "_")}.pptx`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      setNote("PPTX generated and downloaded — " + form.weekOf);
    } catch (ex) { setNote("PPTX generation failed — " + ex.message); }
  };

  return (
    <Panel label="PKI REPORT" right={`${hist.length} WEEKS LOGGED`}>
      <div className="row-in pki-weekbar">
        <input value={form.weekOf} onChange={(e) => setText("weekOf", e.target.value)} placeholder="Week label…" />
        {editingTs && <button className="mini-btn" onClick={newWeek} title="Start a new week">+</button>}
      </div>
      {CHECKLIST.map((s) => {
        const isChecked = s.type === "text" ? filled(form[s.key])
          : s.type === "sev4" ? Object.values(form[s.key]).some((v) => v !== 0)
          : s.type === "comp3" ? Object.values(form[s.key]).some((v) => v > 0)
          : true;
        return (
          <div key={s.key} className="pki-section">
            <div className="pki-hd">
              <span className={`pki-chk ${isChecked ? "on" : ""}`}>{isChecked && <Check size={11} />}</span>
              <span className="pki-lbl">{s.label}</span>
            </div>
            {s.type === "text" && <textarea className="tk-in pki-ta" value={form[s.key]} onChange={(e) => setText(s.key, e.target.value)} placeholder="Optional — leave blank to skip…" />}
            {s.type === "sev4" && (
              <div className="pki-grid">
                {["critical", "high", "medium", "low"].map((k) => (
                  <div className="pki-num" key={k}><label>{k.toUpperCase()}</label><input type="number" min="0" value={form[s.key][k]} onChange={(e) => setNum(s.key, k, e.target.value)} /></div>
                ))}
              </div>
            )}
            {s.type === "comp3" && (
              <div className="pki-grid pki-grid3">
                {[["iso27001", "ISO 27001"], ["soc1", "SOC 1"], ["soc2", "SOC 2"]].map(([k, l]) => (
                  <div className="pki-num" key={k}><label>{l}</label><input type="number" min="0" max="100" value={form.compliance[k]} onChange={(e) => setNum("compliance", k, e.target.value)} /></div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <div className="tk-btns">
        <button className="mini-btn wide" onClick={save}>{editingTs ? "UPDATE THIS WEEK" : "LOG THIS WEEK"}</button>
      </div>
      <div className="tk-btns">
        <button className="mini-btn wide" onClick={exportPPTX}>EXPORT PPTX</button>
      </div>
      <div className="tk-btns">
        <button className="mini-btn wide" onClick={copySummary}>{copied ? "COPIED" : "COPY SUMMARY"}</button>
        <button className="mini-btn wide" onClick={exportXLSX}>EXPORT XLSX</button>
      </div>
      {note && <div className="vnote">{note}</div>}
      {hist.length > 0 && <div className="hunt-hist">
        <span className="la-hd">REPORT HISTORY</span>
        {hist.slice().reverse().slice(0, 12).map((h) => (
          <div key={h.ts} className="ticket-row">
            <span className="mail-dot on" />
            <div className="ticket-txt">
              <button className="pki-hist-link" onClick={() => loadWeek(h)}>{h.weekOf}</button>
              <span className="ticket-meta">S1 {h.s1Vulns.critical}/{h.s1Vulns.high}/{h.s1Vulns.medium}/{h.s1Vulns.low} · IRU {h.iruVulns.critical}/{h.iruVulns.high}/{h.iruVulns.medium}/{h.iruVulns.low}</span>
            </div>
            <button className="ticket-del" onClick={() => removeWeek(h.ts)} aria-label="remove"><X size={12} /></button>
          </div>
        ))}
      </div>}
    </Panel>
  );
}

const VULN_SEVERITIES = ["Critical", "High", "Medium", "Low"];
const VULN_SLA = {
  Critical: { days: 15, action: "Patch or apply a compensating control within 15 days." },
  High: { days: 30, action: "Patch or apply a compensating control within 30 days." },
  Medium: { days: 90, action: "Patch within the next standard patch cycle (~90 days)." },
  Low: { days: 180, action: "Patch within the next maintenance window (~180 days)." },
};
const VULN_REMEDIATION_CHECKLIST = [
  "Confirm affected asset inventory and exposure (internal vs. internet-facing)",
  "Apply the vendor patch or documented fix if available",
  "If unpatchable now, apply a compensating control (isolate, restrict access, disable the affected feature/service)",
  "Verify remediation via rescan or manual confirmation",
  "Document evidence and close with a resolution note",
];

function VulnAnalyzer() {
  const [cve, setCve] = useState(""); const [app, setApp] = useState(""); const [severity, setSeverity] = useState("High");
  const [exploited, setExploited] = useState(false);
  const [desc, setDesc] = useState(""); const [out, setOut] = useState(""); const [copied, setCopied] = useState(false);
  const [note, setNote] = useState(""); const [hist, setHist] = useState([]); const [ready, setReady] = useState(false); const [saveNote, setSaveNote] = useState("");

  useEffect(() => { (async () => { setHist(await store.get("mo:vulnfixes", [])); setReady(true); })(); }, []);
  useEffect(() => { if (ready) store.set("mo:vulnfixes", hist); }, [hist, ready]);

  const analyze = () => {
    if (!cve.trim() && !desc.trim()) return;
    const sla = VULN_SLA[severity];
    const dueDate = new Date(Date.now() + sla.days * 86400000).toLocaleDateString();
    const lines = [
      `CVE: ${cve.trim() || "(none provided)"}`,
      `AFFECTED APPLICATION: ${app.trim() || "(none provided)"}`,
      `SEVERITY: ${severity}`,
      exploited ? "STATUS: Actively exploited in the wild — accelerated timeline applies." : null,
      "",
      "SLA:",
      exploited ? "Remediate immediately — within 24-48 hours (actively exploited)." : `${sla.action} Target due date: ${dueDate}.`,
      "",
      "DESCRIPTION:",
      desc.trim() || "(none provided)",
      "",
      "REMEDIATION CHECKLIST:",
      ...VULN_REMEDIATION_CHECKLIST.map((s, i) => `${i + 1}. ${s}`),
    ].filter((l) => l !== null);
    setOut(lines.join("\n"));
  };
  const copy = () => { navigator.clipboard?.writeText(out).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); }); };
  const logMitigated = () => {
    if (!cve.trim() && !app.trim()) return;
    setHist((h) => [...h.slice(-99), { ts: Date.now(), cve: cve.trim() || "—", app: app.trim() || "—", severity, note: saveNote.trim(), analysis: out }]);
    setCve(""); setApp(""); setDesc(""); setOut(""); setSaveNote(""); setSeverity("High"); setExploited(false);
  };
  const removeEntry = (ts) => setHist((h) => h.filter((x) => x.ts !== ts));
  const exportXLSX = () => {
    if (!hist.length) { setNote("Log at least one mitigated vuln first"); return; }
    const wb = XLSX.utils.book_new();
    const rows = [["Date", "CVE", "Application", "Severity", "Note"], ...hist.map((h) => [new Date(h.ts).toLocaleDateString(), h.cve, h.app, h.severity, h.note])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Mitigated Vulns");
    XLSX.writeFile(wb, `MO_Mitigated_Vulns_${new Date().toISOString().slice(0, 10)}.xlsx`);
    setNote("XLSX exported — " + new Date().toLocaleTimeString());
  };
  const sevCounts = VULN_SEVERITIES.map((s) => ({ s, n: hist.filter((h) => h.severity === s).length }));

  return (
    <Panel label="VULN ANALYZER" right={`${hist.length} MITIGATED`}>
      <div className="row-in" style={{ marginBottom: 9 }}>
        <input value={cve} onChange={(e) => setCve(e.target.value)} placeholder="CVE ID (e.g. CVE-2024-12345)…" />
      </div>
      <div className="row-in" style={{ marginBottom: 9 }}>
        <input value={app} onChange={(e) => setApp(e.target.value)} placeholder="Affected application / version…" />
      </div>
      <div className="tk-src">{VULN_SEVERITIES.map((s) => <button key={s} className={`tk-tab ${severity === s ? "on" : ""}`} onClick={() => setSeverity(s)}>{s}</button>)}</div>
      <label className="vuln-exploited-toggle"><input type="checkbox" checked={exploited} onChange={(e) => setExploited(e.target.checked)} /> Actively exploited in the wild (e.g. CISA KEV)</label>
      <textarea className="tk-in" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Vulnerability description / scanner finding (kept as reference — not analyzed)…" />
      <div className="tk-btns"><button className="mini-btn wide" onClick={analyze}>BUILD SLA & CHECKLIST</button></div>
      {out && <div className="tk-out"><button className="code-btn tk-copy" onClick={copy}>{copied ? "COPIED" : "COPY"}</button><pre>{out}</pre></div>}
      <div className="row-in hunt-log-row">
        <input value={saveNote} onChange={(e) => setSaveNote(e.target.value)} placeholder="Resolution note (optional)…" />
        <button className="mini-btn" disabled={!cve.trim() && !app.trim()} onClick={logMitigated}><Check size={14} /></button>
      </div>
      <div className="tk-btns vexport">
        <button className="mini-btn wide" disabled={!hist.length} onClick={exportXLSX}>EXPORT XLSX</button>
      </div>
      {note && <div className="vnote">{note}</div>}
      {hist.length > 0 && <div className="log-metrics" style={{ marginTop: 10 }}>
        {sevCounts.map(({ s, n }) => <span key={s} className={`lm ${s === "Critical" ? "crit" : s === "High" ? "err" : s === "Medium" ? "warn" : "info"}`}>{s.toUpperCase()} {n}</span>)}
      </div>}
      {hist.length > 0 && <div className="hunt-hist">
        <span className="la-hd">MITIGATED VULNS</span>
        {hist.slice().reverse().slice(0, 15).map((h) => (
          <div key={h.ts} className="ticket-row">
            <span className="mail-dot on" />
            <div className="ticket-txt">
              <span className="ticket-sub">{h.cve} — {h.app}</span>
              <span className="ticket-meta">{h.severity} · {new Date(h.ts).toLocaleDateString()}{h.note ? ` · ${h.note}` : ""}</span>
            </div>
            <button className="ticket-del" onClick={() => removeEntry(h.ts)} aria-label="remove"><X size={12} /></button>
          </div>
        ))}
      </div>}
    </Panel>
  );
}

function IOCCheck() {
  const [value, setValue] = useState(""); const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); const [note, setNote] = useState("");
  const [hist, setHist] = useState([]);
  useEffect(() => { (async () => setHist(await store.get("mo:iocchecks", [])))(); }, []);
  const check = async () => {
    const v = value.trim(); if (!v || busy) return;
    setBusy(true); setNote(""); setResult(null);
    try {
      const res = await fetch(`http://localhost:8787/ioc?value=${encodeURIComponent(v)}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data);
      const entry = { ts: Date.now(), ...data };
      const next = [...hist.slice(-29), entry];
      setHist(next); await store.set("mo:iocchecks", next);
    } catch (ex) {
      setNote("Lookup failed — " + (ex.message || "is sentinelone_local_agent.py running with VIRUSTOTAL_API_KEY set?"));
    } finally { setBusy(false); }
  };
  const verdictClass = (r) => !r || !r.found ? "" : r.malicious > 0 ? "crit" : r.suspicious > 0 ? "warn" : "info";
  const verdictLabel = (r) => !r.found ? "NOT FOUND IN VT" : `${r.malicious}/${r.total} FLAGGED MALICIOUS`;
  const vtUrl = (r) => r.type === "hash" ? `https://www.virustotal.com/gui/file/${encodeURIComponent(r.value)}`
    : r.type === "ip" ? `https://www.virustotal.com/gui/ip-address/${encodeURIComponent(r.value)}`
    : `https://www.virustotal.com/gui/domain/${encodeURIComponent(r.value)}`;
  return (
    <Panel label="IOC QUICK-CHECK" right={`${hist.length} LOOKED UP`}>
      <div className="row-in" style={{ marginBottom: 9 }}>
        <input value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && check()} placeholder="Hash, IP, or domain…" />
        <button className="mini-btn" disabled={busy || !value.trim()} onClick={check}>{busy ? <Loader2 size={14} className="spin" /> : "CHECK"}</button>
      </div>
      <div className="agent-tag-row"><AgentStatusTag /></div>
      {result && <div className={`tk-out ioc-result ${verdictClass(result)}`}>
        <div className="ioc-verdict"><span className="ioc-type">{result.type.toUpperCase()}</span><span>{verdictLabel(result)}</span></div>
        {result.found && <div className="ioc-breakdown">
          <span>MALICIOUS {result.malicious}</span><span>SUSPICIOUS {result.suspicious}</span>
          <span>HARMLESS {result.harmless}</span><span>UNDETECTED {result.undetected}</span>
        </div>}
        <div className="ioc-links">
          <a href={vtUrl(result)} target="_blank" rel="noreferrer" className="code-btn">OPEN IN VIRUSTOTAL</a>
          {result.type === "ip" && <a href={`https://www.abuseipdb.com/check/${encodeURIComponent(result.value)}`} target="_blank" rel="noreferrer" className="code-btn">ABUSEIPDB</a>}
          {result.type === "ip" && <a href={`https://www.shodan.io/host/${encodeURIComponent(result.value)}`} target="_blank" rel="noreferrer" className="code-btn">SHODAN</a>}
        </div>
      </div>}
      {note && <div className="vnote">{note}</div>}
      {hist.length > 0 && <div className="hunt-hist">
        <span className="la-hd">RECENT LOOKUPS</span>
        {hist.slice().reverse().slice(0, 12).map((h) => (
          <div key={h.ts} className="ticket-row">
            <span className={`mail-dot ${h.found && h.malicious > 0 ? "on" : ""}`} />
            <div className="ticket-txt">
              <span className="ticket-sub">{h.value}</span>
              <span className="ticket-meta">{h.type} · {h.found ? `${h.malicious}/${h.total} malicious` : "not found"} · {new Date(h.ts).toLocaleString()}</span>
            </div>
          </div>
        ))}
      </div>}
    </Panel>
  );
}

function ProcedureWriter() {
  const [title, setTitle] = useState("");
  const [purpose, setPurpose] = useState(""); const [scope, setScope] = useState(""); const [trigger, setTrigger] = useState("");
  const [prerequisites, setPrerequisites] = useState(""); const [steps, setSteps] = useState("");
  const [rollback, setRollback] = useState(""); const [references, setReferences] = useState("");
  const [draft, setDraft] = useState("");
  const [hist, setHist] = useState([]); const [ready, setReady] = useState(false);
  const [editingTs, setEditingTs] = useState(null); const [note, setNote] = useState("");

  useEffect(() => { (async () => { setHist(await store.get("mo:procedures", [])); setReady(true); })(); }, []);
  useEffect(() => { if (ready) store.set("mo:procedures", hist); }, [hist, ready]);

  const buildDraft = () => {
    const listLines = (text, numbered, bullet) => {
      const items = text.split("\n").map((s) => s.trim()).filter(Boolean);
      if (!items.length) return null;
      return items.map((s, i) => numbered ? `${i + 1}. ${s}` : bullet ? `- ${s}` : s);
    };
    const sections = [];
    if (purpose.trim()) sections.push(["PURPOSE", [purpose.trim()]]);
    if (scope.trim()) sections.push(["SCOPE", [scope.trim()]]);
    if (trigger.trim()) sections.push(["TRIGGER / DETECTION CRITERIA", [trigger.trim()]]);
    const prereqLines = listLines(prerequisites, true); if (prereqLines) sections.push(["PREREQUISITES", prereqLines]);
    const stepLines = listLines(steps, true); if (stepLines) sections.push(["PROCEDURE", stepLines]);
    const rollbackLines = listLines(rollback, true); if (rollbackLines) sections.push(["ROLLBACK", rollbackLines]);
    const refLines = listLines(references, false, true); if (refLines) sections.push(["REFERENCES", refLines]);
    if (!sections.length) return;
    setDraft(sections.map(([hd, lns]) => `${hd}\n${lns.join("\n")}`).join("\n\n"));
  };
  const save = () => {
    if (!title.trim() && !draft.trim()) return;
    if (editingTs) { setHist((h) => h.map((e) => e.ts === editingTs ? { ts: editingTs, title, draft } : e)); setNote("Updated " + (title || "procedure")); }
    else { const entry = { ts: Date.now(), title: title || "Untitled Procedure", draft }; setHist((h) => [...h.slice(-49), entry]); setEditingTs(entry.ts); setNote("Saved " + entry.title); }
  };
  const loadEntry = (e) => { setTitle(e.title); setDraft(e.draft); setEditingTs(e.ts); setNote("Editing " + e.title); };
  const newProcedure = () => { setTitle(""); setPurpose(""); setScope(""); setTrigger(""); setPrerequisites(""); setSteps(""); setRollback(""); setReferences(""); setDraft(""); setEditingTs(null); setNote(""); };
  const removeEntry = (ts) => { setHist((h) => h.filter((x) => x.ts !== ts)); if (ts === editingTs) newProcedure(); };

  const exportDocx = () => {
    if (!draft.trim()) { setNote("Build or write a draft first"); return; }
    try {
      const bytes = buildProcedureDocx({ title, draft });
      const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${(title || "Procedure").replace(/[^\w]+/g, "_")}.docx`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      setNote("DOCX downloaded — " + (title || "Untitled Procedure"));
    } catch (ex) { setNote("DOCX export failed — " + ex.message); }
  };
  const exportPrintable = () => {
    if (!draft.trim()) { setNote("Build or write a draft first"); return; }
    try {
      const blob = new Blob([buildProcedureReportHTML({ title, draft })], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${(title || "Procedure").replace(/[^\w]+/g, "_")}.html`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      setNote("Report downloaded — open the .html file, then Cmd/Ctrl+P → Save as PDF");
    } catch (ex) { setNote("Report export failed — " + ex.message); }
  };

  return (
    <Panel label="PROCEDURE WRITER" right={`${hist.length} SAVED`}>
      <div className="row-in" style={{ marginBottom: 9 }}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Procedure title…" />
        {editingTs && <button className="mini-btn" onClick={newProcedure} title="Start a new procedure">+</button>}
      </div>
      <textarea className="tk-in" style={{ minHeight: 44 }} value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Purpose — why this procedure exists…" />
      <textarea className="tk-in" style={{ minHeight: 44, marginTop: 7 }} value={scope} onChange={(e) => setScope(e.target.value)} placeholder="Scope — what this covers / doesn't cover…" />
      <textarea className="tk-in" style={{ minHeight: 44, marginTop: 7 }} value={trigger} onChange={(e) => setTrigger(e.target.value)} placeholder="Trigger / detection criteria — when to run this…" />
      <textarea className="tk-in" style={{ marginTop: 7 }} value={prerequisites} onChange={(e) => setPrerequisites(e.target.value)} placeholder="Prerequisites, one per line (optional)…" />
      <textarea className="tk-in" style={{ marginTop: 7 }} value={steps} onChange={(e) => setSteps(e.target.value)} placeholder="Procedure steps, one per line…" />
      <textarea className="tk-in" style={{ minHeight: 44, marginTop: 7 }} value={rollback} onChange={(e) => setRollback(e.target.value)} placeholder="Rollback steps, one per line (optional)…" />
      <textarea className="tk-in" style={{ minHeight: 44, marginTop: 7 }} value={references} onChange={(e) => setReferences(e.target.value)} placeholder="References / related docs, one per line (optional)…" />
      <div className="tk-btns" style={{ marginTop: 9 }}><button className="mini-btn wide" onClick={buildDraft}>BUILD DRAFT FROM SECTIONS</button></div>

      <div className="pki-hd" style={{ marginTop: 6 }}><span className="pki-lbl">DRAFT (EDITABLE)</span></div>
      <textarea className="tk-in proc-draft" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Built draft appears here — edit freely, or write one by hand…" />

      <div className="tk-btns vexport">
        <button className="mini-btn wide" onClick={save}>{editingTs ? "UPDATE SAVED" : "SAVE PROCEDURE"}</button>
      </div>
      <div className="tk-btns vexport">
        <button className="mini-btn wide" onClick={exportDocx}>EXPORT DOCX</button>
        <button className="mini-btn wide" onClick={exportPrintable}>PRINT · PDF</button>
      </div>
      {note && <div className="vnote">{note}</div>}

      {hist.length > 0 && <div className="hunt-hist">
        <span className="la-hd">SAVED PROCEDURES</span>
        {hist.slice().reverse().slice(0, 15).map((h) => (
          <div key={h.ts} className="ticket-row">
            <span className="mail-dot on" />
            <div className="ticket-txt">
              <button className="pki-hist-link" onClick={() => loadEntry(h)}>{h.title}</button>
              <span className="ticket-meta">{new Date(h.ts).toLocaleDateString()}</span>
            </div>
            <button className="ticket-del" onClick={() => removeEntry(h.ts)} aria-label="remove"><X size={12} /></button>
          </div>
        ))}
      </div>}
    </Panel>
  );
}

function MOTile({ icon: I, label, sub, stat, onOpen }) {
  return (
    <button className="motile" onClick={onOpen}>
      <span className="motile-ic"><I size={22} /></span>
      <div className="motile-body"><span className="motile-lbl">{label}</span><span className="motile-sub">{sub}</span></div>
      {stat != null && <span className="motile-stat">{stat}</span>}
      <span className="motile-go">OPEN ▸</span>
    </button>
  );
}

const MO_TOOLS = [
  { key: "vuln", label: "VULN DELTA", comp: <VulnDelta /> },
  { key: "vulnfix", label: "VULN ANALYZER", comp: <VulnAnalyzer /> },
  { key: "ticket", label: "TICKET OPS", comp: <TicketAnalyzer /> },
  { key: "syslog", label: "SYSLOG BASELINE", comp: <SyslogAnalyzer /> },
  { key: "hunt", label: "THREAT HUNT OPS", comp: <ThreatHuntOps /> },
  { key: "pki", label: "PKI REPORT", comp: <PKIReport /> },
  { key: "proc", label: "PROCEDURE WRITER", comp: <ProcedureWriter /> },
  { key: "ioc", label: "IOC QUICK-CHECK", comp: <IOCCheck /> },
];

function MODashboard() {
  const [view, setView] = useState(null);
  const [stats, setStats] = useState({ vuln: null, base: 0, hunts: 0, pki: 0, vulnfix: 0, proc: 0, ioc: 0 });
  useEffect(() => { (async () => {
    const v = await store.get("mo:vulns", []); const sy = await store.get("mo:syslog", { hist: [] }); const hu = await store.get("mo:hunts", []); const pk = await store.get("mo:pki", []); const vf = await store.get("mo:vulnfixes", []); const pr = await store.get("mo:procedures", []); const ic = await store.get("mo:iocchecks", []);
    const cur = v[v.length - 1];
    setStats({ vuln: cur ? cur.iru + cur.s1 : null, base: (sy.hist || []).length, hunts: hu.length, pki: pk.length, vulnfix: vf.length, proc: pr.length, ioc: ic.length });
  })(); }, [view]);
  return (
    <main className="mo-wrap">
      <div className={view ? "hide" : "mo-hub"}>
        <aside className="rail">
          <MOTile icon={ShieldAlert} label="VULN DELTA" sub="IRU · S1 trend" stat={stats.vuln != null ? stats.vuln : "—"} onOpen={() => setView("vuln")} />
          <MOTile icon={ShieldCheck} label="VULN ANALYZER" sub="CVE remediation" stat={stats.vulnfix} onOpen={() => setView("vulnfix")} />
          <MOTile icon={Ticket} label="TICKET OPS" sub="Pondurance · S1 · IT · InfoSec" stat={null} onOpen={() => setView("ticket")} />
          <MOTile icon={ClipboardList} label="PKI REPORT" sub="weekly checklist" stat={stats.pki} onOpen={() => setView("pki")} />
        </aside>
        <div className="center"><EnergyCore /></div>
        <aside className="rail">
          <MOTile icon={ScrollText} label="SYSLOG BASELINE" sub="anomaly watch" stat={stats.base} onOpen={() => setView("syslog")} />
          <MOTile icon={Crosshair} label="THREAT HUNT OPS" sub="Phantom Hunter" stat={stats.hunts} onOpen={() => setView("hunt")} />
          <MOTile icon={FilePenLine} label="PROCEDURE WRITER" sub="formal write-ups" stat={stats.proc} onOpen={() => setView("proc")} />
          <MOTile icon={Search} label="IOC QUICK-CHECK" sub="hash · IP · domain" stat={stats.ioc} onOpen={() => setView("ioc")} />
        </aside>
      </div>
      {MO_TOOLS.map((t) => (
        <div key={t.key} className={view === t.key ? "mo-page" : "hide"}>
          <div className="mo-pagehd"><button className="mo-back" onClick={() => setView(null)}><ArrowLeft size={14} /> DASHBOARD</button><span className="mo-pagettl">{t.label}</span></div>
          <div className="mo-pagebody">{t.comp}</div>
        </div>
      ))}
    </main>
  );
}

export default function HUD() {
  const rootRef = useRef(null);
  const [booting, setBooting] = useState(true);
  useEffect(() => {
    const root = rootRef.current; if (!root) return;
    if (!reduced()) {
      let h = WORKSPACE.hue, raf;
      const tick = () => { h = (h + 0.14) % 360; root.style.setProperty("--hue", h.toFixed(1)); raf = requestAnimationFrame(tick); };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }
    root.style.setProperty("--hue", String(WORKSPACE.hue));
  }, []);
  return (
    <div className="hud-root" ref={rootRef}>
      <style>{CSS}</style>
      <div className="bg-glow" /><div className="bg-grid" /><div className="scan" /><div className="vignette" />
      <ScreenFrame />
      {booting && <Boot done={() => setBooting(false)} />}
      <TopBar profile={WORKSPACE} />
      <MODashboard />
      <footer className="foot"><span>TALON HUD v4.0</span><span>· A. MAKRIS ·</span><span>NO LIMIT TO HUMAN DREAMS</span></footer>
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Quicksand:wght@600;700;800&family=Nunito:wght@500;600;700;800&family=Space+Mono:wght@400;700&display=swap');

.hud-root{
  --hue:210; --void:#04060b;
  --acc:hsl(var(--hue),95%,63%);
  --acc2:hsl(calc(var(--hue) - 34),100%,70%);
  --glow:hsl(var(--hue),100%,66%);
  --dim:hsl(var(--hue),24%,58%);
  --line:hsla(var(--hue),88%,62%,.22);
  --faint:hsla(var(--hue),88%,62%,.08);
  --fill:hsla(var(--hue),90%,60%,.24);
  --panel:rgba(9,15,25,.74); --ice:#dcefff; --warn:#ffb347;
  --fD:'Quicksand',sans-serif; --fU:'Nunito',sans-serif; --fM:'Space Mono',ui-monospace,monospace;
  --gap:16px;
  position:relative;min-height:100vh;width:100%;overflow-x:hidden;
  background:var(--void);color:var(--ice);font-family:var(--fU);font-size:14px;font-weight:600;
}
.hud-root *{box-sizing:border-box}
.hud-root ::selection{background:hsla(var(--hue),90%,60%,.32)}
.hud-root :focus-visible{outline:1px solid var(--acc);outline-offset:2px}
.hud-root ::-webkit-scrollbar{width:5px;height:5px}
.hud-root ::-webkit-scrollbar-thumb{background:var(--dim);border-radius:3px}

.bg-glow{position:fixed;inset:0;pointer-events:none;z-index:0;background:radial-gradient(70% 60% at 50% 42%,hsla(var(--hue),80%,45%,.16),transparent 62%)}
.bg-grid{position:fixed;inset:0;pointer-events:none;z-index:0;opacity:.08;
  background-image:linear-gradient(hsla(var(--hue),90%,60%,.5) 1px,transparent 1px),linear-gradient(90deg,hsla(var(--hue),90%,60%,.5) 1px,transparent 1px);
  background-size:46px 46px;-webkit-mask:radial-gradient(130% 100% at 50% 40%,#000,transparent 82%);mask:radial-gradient(130% 100% at 50% 40%,#000,transparent 82%)}
.vignette{position:fixed;inset:0;pointer-events:none;z-index:1;background:radial-gradient(130% 120% at 50% 40%,transparent 55%,rgba(0,0,0,.7))}
.scan{position:fixed;inset:0;pointer-events:none;z-index:6;mix-blend-mode:screen;opacity:.25;background:linear-gradient(hsla(var(--hue),90%,60%,.05),transparent 3px);background-size:100% 4px}
.scan::after{content:"";position:absolute;left:0;right:0;height:150px;background:linear-gradient(hsla(var(--hue),90%,60%,.07),transparent);animation:scanmove 9s linear infinite}
@keyframes scanmove{0%{top:-150px}100%{top:100%}}

.frame{position:fixed;inset:12px;pointer-events:none;z-index:2}
.fc{position:absolute;width:32px;height:32px}
.fc::before,.fc::after{content:"";position:absolute;background:var(--line)}
.fc::before{width:32px;height:1px}.fc::after{width:1px;height:32px}
.fc-tl::before,.fc-tl::after{top:0;left:0}.fc-tr::before,.fc-tr::after{top:0;right:0}
.fc-bl::before,.fc-bl::after{bottom:0;left:0}.fc-br::before,.fc-br::after{bottom:0;right:0}
.fc b{position:absolute;bottom:-2px;white-space:nowrap;font-family:var(--fM);font-size:8.5px;letter-spacing:.05em;color:var(--dim);opacity:.7}
.fc-bl b{left:42px}.fc-br b{right:42px}

.topbar,.stage,.foot{position:relative;z-index:3}

.mo-grid{position:relative;z-index:3;display:grid;grid-template-columns:repeat(2,1fr);gap:18px;max-width:1480px;margin:0 auto;padding:18px 30px;align-items:start}
.mini-btn.wide{flex:1 1 0;width:auto;min-width:0;background:linear-gradient(135deg,var(--acc2),var(--acc));color:var(--void);font-family:var(--fD);font-weight:700;letter-spacing:.04em;font-size:11px;padding:9px 14px;border-color:transparent;box-shadow:0 4px 16px hsla(var(--hue),90%,60%,.28)}
.mini-btn.wide:hover{background:linear-gradient(135deg,var(--acc2),var(--acc));filter:brightness(1.12);box-shadow:0 6px 22px hsla(var(--hue),90%,60%,.42);color:var(--void)}
.vrow{display:flex;align-items:center;gap:8px;margin-bottom:9px}
.vsrc{font-family:var(--fD);font-size:12px;font-weight:700;color:var(--acc);width:30px}
.vcur{font-family:var(--fD);font-size:20px;font-weight:700;width:44px;background:linear-gradient(135deg,var(--acc2),var(--acc));-webkit-background-clip:text;background-clip:text;color:transparent}
.delta{font-family:var(--fM);font-size:10px;width:46px}
.delta.up{color:var(--warn)}.delta.down{color:var(--acc2)}.delta.zero{color:var(--dim)}
.vin{flex:1;min-width:0;background:linear-gradient(165deg,rgba(0,0,0,.4),rgba(0,0,0,.22));border:1px solid var(--line);color:var(--ice);font-family:var(--fM);font-size:11px;padding:6px 8px;outline:none;border-radius:8px;box-shadow:inset 0 1px 3px rgba(0,0,0,.4);transition:border-color .15s,box-shadow .15s}
.vin:focus{border-color:var(--acc);box-shadow:inset 0 1px 3px rgba(0,0,0,.4),0 0 0 3px hsla(var(--hue),90%,60%,.15)}.vin::placeholder{color:var(--dim)}
.vfile{font-family:var(--fM);font-size:9px;letter-spacing:.04em;color:var(--acc);border:1px solid var(--line);padding:7px 9px;cursor:pointer;white-space:nowrap}
.vfile:hover{background:hsla(var(--hue),90%,60%,.15)}
.vtrend{display:flex;align-items:center;gap:8px;margin:8px 0}
.vt-lbl{font-family:var(--fM);font-size:9px;letter-spacing:.04em;color:var(--dim);width:64px}
.vfoot{display:flex;align-items:center;gap:10px;margin-top:8px}
.vnote{font-family:var(--fM);font-size:9px;color:var(--dim)}
.agent-tag-row{margin:6px 0 10px}
.agent-tag{display:inline-flex;align-items:center;gap:5px;font-family:var(--fM);font-size:8.5px;letter-spacing:.05em;color:var(--dim)}
.agent-dot{width:6px;height:6px;border-radius:50%;background:var(--dim);flex:none;transition:.2s}
.agent-tag.on{color:#7CFFB2}.agent-tag.on .agent-dot{background:#7CFFB2;box-shadow:0 0 6px #7CFFB2}
.agent-tag.off{color:#ff6b6b}.agent-tag.off .agent-dot{background:#ff6b6b;box-shadow:0 0 6px #ff6b6b}
.ioc-result{padding:11px 13px}
.ioc-verdict{display:flex;align-items:center;gap:8px;font-family:var(--fD);font-weight:700;font-size:12.5px;margin-bottom:6px}
.ioc-type{font-family:var(--fM);font-size:8.5px;letter-spacing:.05em;background:rgba(255,255,255,.08);padding:2px 7px;border-radius:6px;color:var(--dim)}
.ioc-result.crit .ioc-verdict{color:#ff6b6b}.ioc-result.warn .ioc-verdict{color:#ffb648}.ioc-result.info .ioc-verdict{color:#7CFFB2}
.ioc-breakdown{display:flex;gap:12px;flex-wrap:wrap;font-family:var(--fM);font-size:9px;letter-spacing:.04em;color:var(--dim);margin-bottom:9px}
.ioc-links{display:flex;gap:7px;flex-wrap:wrap}
.ioc-links a{text-decoration:none}
.vexport{margin-top:8px}
.tk-src{display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap}
.tk-tab{background:rgba(0,0,0,.28);border:1px solid var(--faint);color:var(--dim);cursor:pointer;font-family:var(--fM);font-size:10px;letter-spacing:.02em;padding:5px 10px;border-radius:7px;transition:.15s}
.tk-tab:hover{color:var(--acc);border-color:var(--line)}
.tk-tab.on{color:var(--void);background:linear-gradient(135deg,var(--acc2),var(--acc));border-color:transparent;box-shadow:0 0 12px hsla(var(--hue),90%,60%,.4)}
.tk-in{width:100%;height:82px;resize:vertical;background:linear-gradient(165deg,rgba(0,0,0,.4),rgba(0,0,0,.22));border:1px solid var(--line);color:var(--ice);font-family:var(--fM);font-size:11px;padding:8px;outline:none;margin-bottom:9px;border-radius:10px;box-shadow:inset 0 1px 3px rgba(0,0,0,.4);transition:border-color .15s,box-shadow .15s}
.tk-in:focus{border-color:var(--acc);box-shadow:inset 0 1px 3px rgba(0,0,0,.4),0 0 0 3px hsla(var(--hue),90%,60%,.15)}.tk-in::placeholder{color:var(--dim)}
.tk-btns{display:flex;gap:8px;margin-bottom:10px}
.tk-out{position:relative;border:1px solid var(--line);background:linear-gradient(165deg,rgba(0,0,0,.45),rgba(0,0,0,.28));border-radius:12px;max-height:220px;overflow:auto}
.tk-out pre{margin:0;padding:11px 12px;font-family:var(--fM);font-size:11.5px;line-height:1.5;color:#e9f6ff;white-space:pre-wrap}
.tk-copy{position:absolute;top:6px;right:6px}
.log-drop{display:block;text-align:center;font-family:var(--fM);font-size:10px;letter-spacing:.04em;color:var(--acc);border:1px dashed var(--line);padding:15px;cursor:pointer;margin-bottom:10px}
.log-drop:hover{background:hsla(var(--hue),90%,60%,.08)}
.log-metrics{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}
.lm{font-family:var(--fM);font-size:10px;letter-spacing:.02em;padding:4px 10px;border:1px solid var(--faint);border-radius:999px;font-weight:600}
.lm.crit{color:#ff8080;background:rgba(255,107,107,.12);border-color:rgba(255,107,107,.35)}
.lm.err{color:var(--warn);background:hsla(30,100%,60%,.12);border-color:hsla(30,100%,60%,.35)}
.lm.warn{color:#ffd479;background:rgba(255,212,121,.1);border-color:rgba(255,212,121,.3)}
.lm.info{color:var(--dim);background:rgba(255,255,255,.04);border-color:var(--faint)}
.log-anom{margin-bottom:10px}
.la-hd{font-family:var(--fM);font-size:9px;letter-spacing:.05em;color:var(--acc);display:block;margin-bottom:5px}
.la-row{font-family:var(--fM);font-size:10.5px;color:var(--ice);margin:3px 0;line-height:1.4}
.mail-row{display:flex;align-items:flex-start;gap:8px;padding:7px 8px;margin:0 -8px;border-top:1px solid var(--faint);border-radius:8px;transition:background .15s}
.mail-row:hover{background:hsla(var(--hue),90%,60%,.06)}
.mail-dot{width:7px;height:7px;border-radius:50%;background:var(--dim);margin-top:4px;flex:none}
.mail-dot.on{background:var(--acc);box-shadow:0 0 6px var(--glow)}
.mail-txt{flex:1;display:flex;flex-direction:column;min-width:0;gap:2px}
.mail-sub{font-size:12px;color:var(--ice);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mail-meta{font-family:var(--fM);font-size:9px;color:var(--dim)}
.hunt-parsed{margin-top:4px}
.hunt-iocs{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}
.chip{background:hsla(var(--hue),90%,60%,.14);border:1px solid var(--line);border-radius:99px;padding:3px 10px;font-family:var(--fM);font-size:9.5px;letter-spacing:.03em;color:var(--acc2)}
.hunt-ioc-block{margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid var(--faint)}
.hunt-ioc-block:last-child{border-bottom:none}
.hunt-ioc-hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}
.hunt-log-row{margin-top:10px}
.hunt-hist{margin-top:14px;padding-top:10px;border-top:1px solid var(--faint);max-height:180px;overflow-y:auto}
.ticket-row{display:flex;align-items:flex-start;gap:8px;padding:7px 8px;margin:0 -8px;border-top:1px solid var(--faint);border-radius:8px;transition:background .15s}
.ticket-row:hover{background:hsla(var(--hue),90%,60%,.06)}
.ticket-txt{flex:1;display:flex;flex-direction:column;min-width:0}
.ticket-sub{font-size:12px;color:var(--ice);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ticket-meta{font-family:var(--fM);font-size:9px;color:var(--dim)}
.ticket-del{background:none;border:none;color:var(--dim);cursor:pointer;opacity:.5;flex:none}
.ticket-del:hover{color:var(--warn);opacity:1}
.pki-weekbar{margin-bottom:14px}
.pki-section{margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid var(--faint)}
.pki-hd{display:flex;align-items:center;gap:8px;margin-bottom:7px}
.pki-chk{width:16px;height:16px;border-radius:5px;border:1px solid var(--line);display:grid;place-items:center;color:var(--acc2);flex:none;background:rgba(0,0,0,.25)}
.pki-chk.on{background:hsla(var(--hue),90%,60%,.22);border-color:var(--acc);box-shadow:0 0 8px hsla(var(--hue),90%,60%,.35)}
.pki-lbl{font-family:var(--fD);font-size:11.5px;font-weight:700;letter-spacing:.02em;color:var(--acc)}
.pki-ta{height:64px}
.proc-draft{height:280px;font-family:var(--fM);line-height:1.5}
.pki-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.pki-grid.pki-grid3{grid-template-columns:repeat(3,1fr)}
.pki-num{display:flex;flex-direction:column;gap:3px}
.pki-num label{font-family:var(--fM);font-size:8.5px;color:var(--dim);letter-spacing:.04em}
.pki-num input{background:rgba(0,0,0,.32);border:1px solid var(--line);color:var(--ice);font-family:var(--fM);font-size:12px;padding:6px 8px;border-radius:7px;outline:none;width:100%}
.pki-num input:focus{border-color:var(--acc)}
.pki-hist-link{background:none;border:none;color:var(--ice);font-size:12px;cursor:pointer;padding:0;text-align:left;text-decoration:underline;text-decoration-color:var(--faint)}
.pki-hist-link:hover{color:var(--acc)}
@media (max-width:1040px){.mo-grid{grid-template-columns:1fr;padding:16px 18px}}
.mo-wrap{position:relative;z-index:3;max-width:1480px;margin:0 auto;padding:18px 30px}
.hide{display:none!important}
.mo-hub{display:grid;grid-template-columns:290px 1fr 290px;gap:24px;align-items:center}
.motile{position:relative;display:flex;align-items:center;gap:12px;width:100%;text-align:left;cursor:pointer;background:var(--panel);border:1px solid var(--line);color:var(--ice);padding:16px 16px 20px;border-radius:16px;transition:transform .18s,box-shadow .18s,border-color .18s}
.motile:hover{transform:translateY(-2px);box-shadow:0 0 22px hsla(var(--hue),90%,60%,.22);border-color:var(--acc)}
.motile-ic{display:grid;place-items:center;width:46px;height:46px;border-radius:50%;border:1px solid var(--line);color:var(--acc);background:radial-gradient(circle,hsla(var(--hue),90%,60%,.14),transparent 70%);box-shadow:inset 0 0 10px hsla(var(--hue),90%,60%,.1);flex:none}
.motile-body{display:flex;flex-direction:column;min-width:0;flex:1}
.motile-lbl{font-family:var(--fD);font-size:13px;font-weight:700;letter-spacing:.04em;color:var(--acc)}
.motile-sub{font-family:var(--fM);font-size:9px;letter-spacing:.02em;color:var(--dim);margin-top:3px}
.motile-stat{font-family:var(--fD);font-size:24px;font-weight:700;background:linear-gradient(135deg,var(--acc2),var(--acc));-webkit-background-clip:text;background-clip:text;color:transparent}
.motile-go{position:absolute;bottom:8px;right:14px;font-family:var(--fM);font-size:8px;letter-spacing:.06em;color:var(--dim)}
.mo-page{max-width:1040px;margin:0 auto}
.mo-pagehd{display:flex;align-items:center;gap:16px;margin-bottom:18px}
.mo-back{display:flex;align-items:center;gap:6px;background:rgba(0,0,0,.3);border:1px solid var(--line);color:var(--acc);cursor:pointer;font-family:var(--fD);font-size:11px;font-weight:600;letter-spacing:.04em;padding:8px 14px;border-radius:9px;}
.mo-back:hover{background:hsla(var(--hue),90%,60%,.15)}
.mo-pagettl{font-family:var(--fD);font-size:16px;font-weight:700;letter-spacing:.07em;color:var(--ice)}
.mo-page .panel-body{padding:22px;font-size:15px}
.mo-page .panel-lbl{font-size:13px}
.mo-page .panel-right{font-size:11px}
.mo-page .vsrc{font-size:14px;width:38px}
.mo-page .vcur{font-size:28px;width:56px}
.mo-page .delta{font-size:12px;width:60px}
.mo-page .vin{font-size:13px;padding:8px 10px}
.mo-page .vfile{font-size:11px;padding:9px 12px}
.mo-page .vt-lbl{font-size:11px;width:80px}
.mo-page .vnote{font-size:11px}
.mo-page .lm{font-size:12px;padding:6px 10px}
.mo-page .la-hd{font-size:11px}
.mo-page .la-row{font-size:13px}
.mo-page .tk-tab{font-size:12px;padding:7px 14px}
.mo-page .tk-in{font-size:13px;height:120px}
.mo-page .tk-out pre{font-size:13.5px}
.mo-page .code-lang{font-size:11px}
.mo-page .code-pre{font-size:14px}
.mo-page .mail-sub{font-size:14px}
.mo-page .mail-meta{font-size:11px}
.mo-page .ticket-sub{font-size:14px}
.mo-page .ticket-meta{font-size:11px}
.mo-page .ring-pct{font-size:28px}
.mo-page .ring-lbl{font-size:9px}
.mo-page .amb-lbl{font-size:11px;width:52px}
.mo-page .amb-v{font-size:13px}
.mo-page .repo-in{font-size:13px}
.mo-page .repo-row{font-size:13px}
.mo-page .repo-note{font-size:9px}
.mo-page .chip{font-size:12px}
.mo-page .empty{font-size:12px}
.mo-page .row-in input{font-size:13px;padding:10px 12px}
.mo-page .mini-btn{font-size:16px;padding:8px 14px}
.mo-page .log-drop{font-size:12px;padding:20px}
.mo-page .lm.crit,.mo-page .lm.err,.mo-page .lm.warn,.mo-page .lm.info{font-size:12px}
@media (max-width:1040px){.mo-hub{grid-template-columns:1fr}.mo-hub .rail{flex-direction:column}.mo-wrap{padding:16px 18px}}

.topbar{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:20px;max-width:1480px;margin:0 auto;padding:16px 30px;border-bottom:1px solid var(--line)}
.tb-left{display:flex;align-items:center;gap:12px}
.tb-sigil{color:var(--acc);filter:drop-shadow(0 0 7px hsla(var(--hue),90%,60%,.5));position:relative;cursor:pointer}
.tb-quip{position:absolute;top:120%;left:0;white-space:nowrap;background:var(--panel);border:1px solid var(--line);padding:8px 12px;border-radius:10px;font-family:var(--fM);font-size:10.5px;color:var(--ice);box-shadow:0 6px 18px rgba(0,0,0,.55);animation:quipfade .25s ease;z-index:20}
@keyframes quipfade{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
.callsign{font-family:var(--fD);font-size:24px;font-weight:700;letter-spacing:.12em;color:var(--acc);text-shadow:0 0 16px hsla(var(--hue),90%,60%,.5);display:block;line-height:1}
.tb-sub{display:flex;align-items:center;gap:6px;font-family:var(--fM);font-size:9px;letter-spacing:.05em;color:var(--dim);margin-top:6px}
.tb-sub2{display:block;font-family:var(--fM);font-size:9px;letter-spacing:.05em;color:var(--dim);margin-top:6px;text-align:right}
.led{width:6px;height:6px;border-radius:50%;background:var(--acc);box-shadow:0 0 8px var(--glow);flex:none;animation:blink 1.7s ease-in-out infinite}
.led.sm{width:5px;height:5px}@keyframes blink{0%,100%{opacity:1}50%{opacity:.25}}
.tb-clock{text-align:center}
.clk{font-family:var(--fD);font-size:30px;font-weight:700;letter-spacing:.06em;color:var(--ice);text-shadow:0 0 14px hsla(var(--hue),90%,60%,.35)}
.tb-date{display:block;font-family:var(--fM);font-size:9px;letter-spacing:.07em;color:var(--dim);margin-top:4px}
.tb-right{justify-self:end;text-align:right}
.integrity{display:flex;align-items:center;gap:9px;justify-content:flex-end}
.int-lbl{font-family:var(--fM);font-size:9px;letter-spacing:.05em;color:var(--acc)}
.int-bar{width:90px;height:6px;background:rgba(0,0,0,.5);border:1px solid var(--line);overflow:hidden;position:relative}
.int-bar i{position:absolute;inset:0;width:92%;background:linear-gradient(90deg,var(--acc2),var(--acc));box-shadow:0 0 9px var(--glow)}
.int-bar i::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.55),transparent);animation:shine 2.6s linear infinite}
@keyframes shine{0%{transform:translateX(-100%)}100%{transform:translateX(240%)}}
.eq{display:flex;gap:2px;align-items:flex-end;height:13px}
.eq span{width:2.5px;height:100%;background:var(--acc);box-shadow:0 0 4px var(--glow);animation:eq .9s ease-in-out infinite;transform-origin:bottom}
@keyframes eq{0%,100%{transform:scaleY(.3)}50%{transform:scaleY(1)}}

/* ── stage: rail | core | rail ── */
.rail{display:flex;flex-direction:column;gap:var(--gap);min-width:0}
.center{display:flex;align-items:center;justify-content:center;min-height:min(60vh,540px)}

/* ── energy core ── */
.core-persp{perspective:1400px}
.core-wrap{position:relative;width:min(52vh,500px);aspect-ratio:1;transform-style:preserve-3d;animation:coretilt 13s ease-in-out infinite;filter:drop-shadow(0 30px 46px rgba(0,0,0,.55)) drop-shadow(0 0 50px hsla(var(--hue),90%,60%,.28))}
@keyframes coretilt{0%,100%{transform:rotateX(13deg) rotateY(-7deg)}50%{transform:rotateX(9deg) rotateY(7deg)}}
.core-halo{position:absolute;inset:-8%;border-radius:50%;background:radial-gradient(circle,hsla(var(--hue),90%,55%,.22),transparent 62%);filter:blur(14px);animation:halo 6s ease-in-out infinite}
@keyframes halo{0%,100%{opacity:.7;transform:scale(1)}50%{opacity:1;transform:scale(1.04)}}
.core-svg{position:relative;width:100%;height:100%;display:block}
.core-wire ellipse{fill:none;stroke:var(--line);stroke-width:.6}
.core-spin{transform-box:fill-box;transform-origin:center;animation:spin 80s linear infinite}
.core-spin2{transform-box:fill-box;transform-origin:center;animation:spin 120s linear infinite reverse}
.core-arc{transform-box:fill-box;transform-origin:center;animation:spin 8s linear infinite}
.core-arc2{transform-box:fill-box;transform-origin:center;animation:spin 55s linear infinite reverse}
.core-arc-rev{transform-box:fill-box;transform-origin:center;animation:spin 14s linear infinite reverse}
.core-rim{transform-box:fill-box;transform-origin:center;animation:spin 40s linear infinite}
.core-threads{transform-box:fill-box;transform-origin:center;animation:spin 95s linear infinite reverse}
.core-orbit1{transform-box:fill-box;transform-origin:center;animation:spin 70s linear infinite}
.core-orbit2{transform-box:fill-box;transform-origin:center;animation:spin 88s linear infinite reverse}
.core-orbit3{transform-box:fill-box;transform-origin:center;animation:spin 63s linear infinite}
.core-bolts{animation:flicker 3.6s ease-in-out infinite}
@keyframes flicker{0%,100%{opacity:.5}8%{opacity:1}12%{opacity:.3}45%{opacity:.7}52%{opacity:.2}80%{opacity:.9}}
.core-flare{transform-box:fill-box;transform-origin:center;animation:spin 30s linear infinite reverse}
.core-blink circle{animation:blink 2.2s ease-in-out infinite}
.core-blink circle:nth-child(2){animation-delay:.4s}
.core-blink circle:nth-child(3){animation-delay:.8s}
.core-blink circle:nth-child(4){animation-delay:1.2s}
@keyframes blink{0%,100%{opacity:.25}50%{opacity:1}}
.core-pulse{animation:pulse 4.5s ease-in-out infinite}
.core-pulse2{animation:pulse2 3.2s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:.9}50%{opacity:1;transform:scale(1.03);transform-box:fill-box;transform-origin:center}}
@keyframes pulse2{0%,100%{opacity:.7;transform:scale(.96)}50%{opacity:1;transform:scale(1.08);transform-box:fill-box;transform-origin:center}}
.core-cog{position:absolute;right:2%;bottom:2%;color:var(--acc);opacity:.55}
.cog{animation:spin 12s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}

/* ── panel ── */
.panel{position:relative;background:linear-gradient(165deg,rgba(16,24,38,.82),rgba(8,13,22,.78));border:1px solid var(--line);border-radius:16px;box-shadow:inset 0 1px 0 hsla(var(--hue),90%,70%,.16),inset 0 0 40px hsla(var(--hue),90%,60%,.04),0 10px 30px rgba(0,0,0,.55),0 2px 8px rgba(0,0,0,.35);transition:box-shadow .25s,transform .25s,border-color .25s}
.panel:hover{box-shadow:inset 0 1px 0 hsla(var(--hue),90%,70%,.22),inset 0 0 50px hsla(var(--hue),90%,60%,.07),0 14px 36px rgba(0,0,0,.6),0 0 22px hsla(var(--hue),90%,60%,.14);transform:translateY(-2px);border-color:hsla(var(--hue),90%,65%,.4)}
.cnr{display:none}
.cnr.tl{top:3px;left:3px;border-right:0;border-bottom:0}.cnr.tr{top:3px;right:3px;border-left:0;border-bottom:0}
.cnr.bl{bottom:3px;left:3px;border-right:0;border-top:0}.cnr.br{bottom:3px;right:3px;border-left:0;border-top:0}
.panel-hd{display:flex;align-items:center;gap:8px;padding:11px 15px;border-bottom:1px solid hsla(var(--hue),90%,60%,.16);background:linear-gradient(90deg,hsla(var(--hue),90%,60%,.1),hsla(var(--hue),90%,60%,.02) 60%,transparent)}
.panel-lbl{font-family:var(--fD);font-size:11px;font-weight:700;letter-spacing:.07em;color:var(--acc);text-shadow:0 0 12px hsla(var(--hue),90%,65%,.5)}
.panel-right{margin-left:auto;font-family:var(--fM);font-size:9px;letter-spacing:.04em;color:var(--dim)}
.panel-body{padding:17px}

.dock{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;justify-items:center}
.dock-btn{display:flex;flex-direction:column;align-items:center;gap:6px;text-decoration:none;color:var(--ice)}
.dock-ring{display:grid;place-items:center;width:46px;height:46px;border-radius:50%;border:1px solid var(--line);color:var(--acc);background:radial-gradient(circle,hsla(var(--hue),90%,60%,.12),transparent 70%);box-shadow:inset 0 0 10px hsla(var(--hue),90%,60%,.08);transition:.18s}
.dock-btn:hover .dock-ring{border-color:var(--acc);color:var(--acc2);box-shadow:0 0 18px hsla(var(--hue),90%,60%,.45);transform:translateY(-2px)}
.dock-name{font-family:var(--fM);font-size:8px;letter-spacing:.04em;color:var(--dim)}

.tasks{display:flex;flex-direction:column;gap:8px;margin-bottom:12px;max-height:150px;overflow-y:auto}
.all-clear{font-family:var(--fD);font-size:12px;font-weight:700;color:var(--acc2);letter-spacing:.03em;text-align:center;padding:8px;border:1px solid var(--line);border-radius:10px;background:hsla(var(--hue),90%,60%,.08)}
.task{display:flex;align-items:center;gap:10px;font-size:13px}
.task-done .task-t{text-decoration:line-through;color:var(--dim)}
.chk{width:19px;height:19px;flex:none;border:1px solid var(--line);background:rgba(0,0,0,.32);display:grid;place-items:center;color:var(--acc2);cursor:pointer;border-radius:8px;}
.chk:hover{border-color:var(--acc);box-shadow:0 0 10px hsla(var(--hue),90%,60%,.3)}.chk-empty{width:6px;height:6px}
.task-t{flex:1;color:var(--ice)}.task-x{background:none;border:none;color:var(--dim);cursor:pointer;opacity:.5}.task-x:hover{color:var(--warn);opacity:1}
.empty{font-family:var(--fM);font-size:10px;color:var(--dim);letter-spacing:.04em;padding:6px 0}
.row-in{display:flex;gap:7px}
.row-in input{flex:1;min-width:0;background:linear-gradient(165deg,rgba(0,0,0,.4),rgba(0,0,0,.22));border:1px solid var(--line);color:var(--ice);font-family:var(--fM);font-size:11px;padding:8px 10px;outline:none;letter-spacing:.01em;border-radius:10px;box-shadow:inset 0 1px 3px rgba(0,0,0,.4);transition:border-color .15s,box-shadow .15s}
.row-in input:focus{border-color:var(--acc);box-shadow:inset 0 1px 3px rgba(0,0,0,.4),0 0 0 3px hsla(var(--hue),90%,60%,.15)}.row-in input::placeholder{color:var(--dim)}
.tk-select{flex:1;min-width:0;background:linear-gradient(165deg,rgba(0,0,0,.4),rgba(0,0,0,.22));border:1px solid var(--line);color:var(--ice);font-family:var(--fM);font-size:11px;padding:8px 10px;outline:none;letter-spacing:.01em;border-radius:10px;box-shadow:inset 0 1px 3px rgba(0,0,0,.4);cursor:pointer}
.tk-select:focus{border-color:var(--acc);box-shadow:inset 0 1px 3px rgba(0,0,0,.4),0 0 0 3px hsla(var(--hue),90%,60%,.15)}
.tk-select option{background:#0a0e16;color:var(--ice)}
.vuln-exploited-toggle{display:flex;align-items:center;gap:7px;font-family:var(--fM);font-size:10.5px;letter-spacing:.02em;color:var(--dim);margin:9px 0;cursor:pointer}
.vuln-exploited-toggle input{accent-color:var(--acc);width:13px;height:13px;cursor:pointer}
.mini-btn{background:linear-gradient(165deg,hsla(var(--hue),90%,60%,.16),hsla(var(--hue),90%,60%,.06));border:1px solid hsla(var(--hue),90%,60%,.35);color:var(--acc);cursor:pointer;padding:6px 11px;display:grid;place-items:center;font-family:var(--fM);font-size:14px;min-width:34px;flex:none;border-radius:9px;transition:background .18s,box-shadow .18s,transform .1s,color .18s}
.mini-btn:hover{background:linear-gradient(165deg,hsla(var(--hue),90%,60%,.3),hsla(var(--hue),90%,60%,.12));color:var(--acc2);box-shadow:0 0 16px hsla(var(--hue),90%,60%,.3);transform:translateY(-1px)}
.mini-btn:active{transform:translateY(0)}
.mini-btn:disabled{opacity:.4;cursor:default;transform:none;box-shadow:none}

.cut{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
.cut-cur{font-family:var(--fD);font-size:34px;font-weight:700;color:var(--ice);text-shadow:0 0 12px hsla(var(--hue),90%,60%,.3)}
.cut-cur em{font-family:var(--fM);font-size:11px;font-style:normal;color:var(--dim);margin-left:3px}
.cut-tag{display:block;font-family:var(--fM);font-size:9px;letter-spacing:.04em;margin-top:4px}
.cut-tag.ok{color:var(--acc2)}.cut-tag.warn{color:var(--warn)}

.spark-line{filter:drop-shadow(0 0 4px hsla(var(--hue),90%,60%,.55))}
.spark-grid{stroke:var(--faint);stroke-width:1}
.spark-dot{fill:var(--acc2);filter:drop-shadow(0 0 4px var(--acc2))}

.cert{display:flex;align-items:center;gap:18px}
.ring-wrap{position:relative;display:grid;place-items:center;flex:none}
.ring-bg{fill:none;stroke:var(--faint);stroke-width:6}
.ring-fg{fill:none;stroke-width:6;stroke-linecap:round;filter:drop-shadow(0 0 5px hsla(var(--hue),90%,60%,.55));transition:stroke-dashoffset .5s}
.ring-tick{stroke:var(--acc)}
.ring-txt{position:absolute;text-align:center}
.ring-pct{font-family:var(--fD);font-size:22px;font-weight:700;background:linear-gradient(135deg,var(--acc2),var(--acc));-webkit-background-clip:text;background-clip:text;color:transparent}.ring-pct em{font-family:var(--fM);font-size:11px;font-style:normal;color:var(--dim);-webkit-text-fill-color:var(--dim)}
.ring-lbl{display:block;font-family:var(--fM);font-size:7.5px;letter-spacing:.04em;color:var(--dim);margin-top:1px}
.cert-side{flex:1;min-width:0;display:flex;flex-direction:column;gap:13px}
.cert-ctl{display:flex;align-items:center;gap:8px;justify-content:space-between}
.cert-set{font-family:var(--fM);font-size:9px;letter-spacing:.04em;color:var(--dim)}

.amb-row{display:flex;align-items:center;gap:10px;margin-bottom:8px}
.amb-lbl{font-family:var(--fM);font-size:9px;letter-spacing:.04em;color:var(--dim);width:42px}
.amb-v{font-family:var(--fM);font-size:11px;color:var(--acc);width:32px;text-align:right;margin-left:auto}
.amb-foot{display:flex;flex-direction:column;gap:4px;margin-top:10px;padding-top:10px;border-top:1px solid var(--faint);font-family:var(--fM);font-size:8.5px;letter-spacing:.03em;color:var(--dim)}

/* ── shared code-block / copy-button styling (query blocks, ticket/vuln output) ── */
.code-blk{margin:8px 0;border:1px solid var(--line);background:rgba(0,0,0,.4);border-radius:12px;}
.code-bar{display:flex;align-items:center;gap:8px;padding:6px 10px;border-bottom:1px solid hsla(var(--hue),90%,60%,.15);background:linear-gradient(90deg,hsla(var(--hue),90%,60%,.1),transparent)}
.code-lang{font-family:var(--fM);font-size:9px;letter-spacing:.05em;color:var(--acc);text-transform:uppercase;margin-right:auto}
.code-btn{background:rgba(0,0,0,.35);border:1px solid var(--line);color:var(--acc);cursor:pointer;font-family:var(--fM);font-size:8.5px;letter-spacing:.04em;padding:3px 8px;border-radius:6px;transition:.15s}
.code-btn:hover{background:hsla(var(--hue),90%,60%,.22);color:var(--acc2);border-color:hsla(var(--hue),90%,60%,.4)}
.code-pre{margin:0;padding:11px 12px;overflow-x:auto;font-family:var(--fM);font-size:12px;line-height:1.5;color:#e9f6ff}

.foot{display:flex;gap:16px;justify-content:center;padding:12px;font-family:var(--fM);font-size:9px;letter-spacing:.06em;color:var(--dim);border-top:1px solid var(--faint);max-width:1480px;margin:6px auto 0}
.spin{animation:spin 1s linear infinite}

.boot{position:fixed;inset:0;z-index:30;background:radial-gradient(circle at 50% 45%,#06111c,#04060b 72%);display:grid;place-items:center;animation:bootout .45s ease .5s forwards}
@keyframes bootout{to{opacity:0;visibility:hidden}}
.boot-in{width:min(320px,80vw);text-align:center}
.boot-title{font-family:var(--fD);font-size:46px;font-weight:700;letter-spacing:.14em;color:var(--acc);text-shadow:0 0 22px hsla(var(--hue),90%,60%,.55);margin-bottom:20px;padding-left:.4em}
.boot-log{font-family:var(--fM);font-size:11px;letter-spacing:.03em;color:var(--dim);text-align:left;min-height:110px}
.boot-line{margin:5px 0}.boot-line .ok{color:var(--acc2);float:right}
.boot-prog{height:5px;background:rgba(0,0,0,.5);border:1px solid var(--line);margin-top:14px;overflow:hidden}
.boot-prog i{display:block;height:100%;background:linear-gradient(90deg,var(--acc2),var(--acc));box-shadow:0 0 9px var(--glow);transition:width .2s}

@media (max-width:1040px){
  .stage{grid-template-columns:1fr;gap:var(--gap);padding:var(--gap) 18px}
  .center{order:-1;min-height:auto}
  .rail{flex-direction:row;flex-wrap:wrap}.rail .panel{flex:1;min-width:240px}
  .topbar{grid-template-columns:1fr;gap:10px;text-align:center;padding:16px}
  .tb-left{justify-content:center}.tb-right{justify-self:center;text-align:center}.integrity{justify-content:center}.tb-sub2{text-align:center}
  .frame{display:none}
}
@media (prefers-reduced-motion:reduce){
  .core-spin,.core-spin2,.core-arc,.core-arc2,.core-arc-rev,.core-threads,.core-bolts,.core-flare,.core-orbit1,.core-orbit2,.core-orbit3,.core-blink circle,.core-rim,.core-pulse,.core-pulse2,.core-halo,.core-wrap,.cog,.scan::after,.spin,.led,.eq span,.int-bar i::after{animation:none!important}
}
`;
