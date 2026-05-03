import { useRef, useState } from "react";
import { FLAGS, type BracketMatch, type BracketRoundData } from "../WorldCupPreditor";

// ── Bracket alignment constants ───────────────────────────────────────────────
//
// .wcp-match rendered height:  2 × 34px rows + 1px divider + 2px border = 71px
// .wcp-match vertical margin:  4px top + 4px bottom = 8px
// ITEM_H = 71 + 8 = 79px  (the full vertical slot each match occupies in flex)
// BASE_GAP = 5px           (flex gap for Round of 32)
// BASE_PITCH = 84px        (distance between consecutive match-top edges in R32)
//
// For round index ri:
//   gap        = BASE_PITCH × 2^ri − ITEM_H
//   paddingTop = BASE_PITCH × (2^ri − 1) / 2
//
// This keeps every match vertically centered between its two feeder matches.

const ITEM_H     = 79;
const BASE_GAP   = 5;
const BASE_PITCH = ITEM_H + BASE_GAP; // 84

function bracketGap(ri: number): number {
  return BASE_PITCH * Math.pow(2, ri) - ITEM_H;
}
function bracketPad(ri: number): number {
  return (BASE_PITCH * (Math.pow(2, ri) - 1)) / 2;
}

// ── CDN loaders ───────────────────────────────────────────────────────────────

async function loadHtml2Canvas(): Promise<NonNullable<Window["html2canvas"]>> {
  if (window.html2canvas) return window.html2canvas;
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
    s.onload = () => resolve(window.html2canvas!);
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function loadJsPDF(): Promise<NonNullable<Window["jspdf"]>["jsPDF"]> {
  if (window.jspdf) return window.jspdf.jsPDF;
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    s.onload = () => resolve(window.jspdf!.jsPDF);
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

// ── PDF generation ────────────────────────────────────────────────────────────

type RGB = [number, number, number];

interface JsPDFDoc {
  setFillColor(r: number, g: number, b: number): JsPDFDoc;
  setDrawColor(r: number, g: number, b: number): JsPDFDoc;
  setTextColor(r: number, g: number, b: number): JsPDFDoc;
  setFont(fontName: string, fontStyle: string): JsPDFDoc;
  setFontSize(size: number): JsPDFDoc;
  setLineWidth(width: number): JsPDFDoc;
  text(
    text: string,
    x: number,
    y: number,
    options?: { align?: string; maxWidth?: number },
  ): JsPDFDoc;
  rect(x: number, y: number, w: number, h: number, style: string): JsPDFDoc;
  line(x1: number, y1: number, x2: number, y2: number): JsPDFDoc;
  addPage(format?: string, orientation?: string): JsPDFDoc;
  addImage(
    imgData: string,
    format: string,
    x: number,
    y: number,
    w: number,
    h: number,
  ): JsPDFDoc;
  save(filename: string): void;
}

const C: Record<string, RGB> = {
  dark:     [10,  12,  15],
  accent:   [240, 192, 64],
  accent2:  [61,  214, 140],
  white:    [255, 255, 255],
  offwhite: [248, 249, 251],
  border:   [210, 215, 228],
  text:     [25,  30,  45],
  dim:      [110, 118, 138],
  gold:     [240, 192, 64],
  goldLt:   [255, 250, 220],
  silver:   [155, 176, 200],
  silverLt: [238, 243, 252],
  bronze:   [212, 132, 90],
  greenLt:  [228, 252, 240],
  winBg:    [255, 250, 225],
  footerTxt:[160, 165, 180],
};

function trunc(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

async function generatePDF(
  groupRankings: Record<string, string[]>,
  selectedThirds: string[],
  rounds: BracketRoundData[],
  bracketPicks: Record<string, string>,
  champion: string | null,
): Promise<void> {
  const JsPDF = await loadJsPDF();
  const doc = new JsPDF({ orientation: "landscape", unit: "mm", format: "a4" }) as unknown as JsPDFDoc;

  const PW = 297, PH = 210, M = 10, CW = PW - 2 * M;

  const f  = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
  const d  = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);
  const tc = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
  const fd = (c: RGB, bc: RGB) => { f(c); d(bc); };

  function header(subtitle: string) {
    f(C.dark); d(C.dark);
    doc.rect(0, 0, PW, 14, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(14);
    tc(C.accent);
    doc.text("FIFA WORLD CUP 2026", M, 9.5);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7);
    tc([180, 188, 205] as RGB);
    doc.text(subtitle, PW - M, 9.5, { align: "right" });
  }

  function footer() {
    doc.setFont("helvetica", "normal"); doc.setFontSize(5);
    tc(C.footerTxt);
    const dt = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    doc.text(`Generated: ${dt}`, PW - M, PH - 3.5, { align: "right" });
    doc.text("FIFA World Cup 2026 Bracket Predictor", M, PH - 3.5);
  }

  // ── PAGE 1: Group Standings ───────────────────────────────────────────────

  header("GROUP STANDINGS & 3RD PLACE");

  doc.setFont("helvetica", "bold"); doc.setFontSize(7.5);
  tc(C.dim);
  doc.text("GROUP STAGE RESULTS", M, 19.5);

  const GROUPS_ORDER = ["A","B","C","D","E","F","G","H","I","J","K","L"];
  const GC   = 4;
  const GGAP = 3;
  const GCW  = (CW - GGAP * (GC - 1)) / GC;  // ≈ 67mm per card
  const GHDR = 6;
  const TROW = 7.5;
  const GCH  = GHDR + 4 * TROW;               // 36mm per card
  const GRP  = GCH + GGAP;                    // 39mm row pitch
  const GY0  = 22;

  const rankBg: RGB[]  = [C.gold, C.silver, C.bronze, C.border];
  const rowBg: RGB[]   = [C.goldLt, C.silverLt, C.offwhite, C.offwhite];
  const rankLbl        = ["1st", "2nd", "3rd", "4th"];

  for (let gi = 0; gi < 12; gi++) {
    const g   = GROUPS_ORDER[gi];
    const col = gi % GC;
    const row = Math.floor(gi / GC);
    const gx  = M + col * (GCW + GGAP);
    const gy  = GY0 + row * GRP;
    const teams = groupRankings[g] ?? [];

    // Card frame
    fd(C.offwhite, C.border); doc.setLineWidth(0.1);
    doc.rect(gx, gy, GCW, GCH, "FD");

    // Group header bar
    f(C.dark); doc.rect(gx, gy, GCW, GHDR, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(6.5);
    tc(C.accent);
    doc.text(`GROUP ${g}`, gx + 2.5, gy + 4.3);

    for (let ti = 0; ti < 4; ti++) {
      const team  = teams[ti] ?? "TBD";
      const ty    = gy + GHDR + ti * TROW;
      const isAdv = ti < 2 || (ti === 2 && selectedThirds.includes(g));

      // Row background
      f(rowBg[ti]); doc.rect(gx, ty, GCW, TROW, "F");

      // Row separator
      if (ti > 0) { d(C.border); doc.setLineWidth(0.05); doc.line(gx, ty, gx + GCW, ty); }

      // Rank badge
      f(rankBg[ti]); doc.rect(gx + 1.5, ty + 1.2, 7, TROW - 2.5, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(5);
      tc(ti < 2 ? C.dark : ([60, 65, 80] as RGB));
      doc.text(rankLbl[ti], gx + 5, ty + 5, { align: "center" });

      // Team name
      doc.setFont("helvetica", ti === 0 ? "bold" : "normal"); doc.setFontSize(6);
      tc(C.text);
      doc.text(trunc(team, 20), gx + 10, ty + 5.2, { maxWidth: GCW - 18 });

      // ADV / 3RD badge
      if (isAdv) {
        doc.setFont("helvetica", "bold"); doc.setFontSize(4.5);
        tc(ti < 2 ? C.accent2 : C.accent);
        doc.text(ti < 2 ? "ADV" : "3RD", gx + GCW - 1.5, ty + 5.2, { align: "right" });
      }
    }
  }

  // ── Best 3rd-place section ────────────────────────────────────────────────

  const QY0 = GY0 + 3 * GRP - GGAP + 6;  // starts just below the group grid

  doc.setFont("helvetica", "bold"); doc.setFontSize(7.5);
  tc(C.dim);
  doc.text("BEST 3RD-PLACE QUALIFIERS", M, QY0);

  const qualifiers = GROUPS_ORDER.filter(g => selectedThirds.includes(g));
  const QC   = 8;
  const QGAP = 2.5;
  const QCW  = (CW - QGAP * (QC - 1)) / QC;  // ≈ 31mm
  const QCH  = 14;

  for (let qi = 0; qi < qualifiers.length; qi++) {
    const g    = qualifiers[qi];
    const team = groupRankings[g]?.[2] ?? "TBD";
    const qx   = M + qi * (QCW + QGAP);
    const qy   = QY0 + 4;

    fd(C.greenLt, C.accent2); doc.setLineWidth(0.2);
    doc.rect(qx, qy, QCW, QCH, "FD");

    doc.setFont("helvetica", "bold"); doc.setFontSize(5);
    tc(C.dim);
    doc.text(`GROUP ${g} · 3RD`, qx + 2, qy + 4);

    doc.setFont("helvetica", "bold"); doc.setFontSize(6.5);
    tc(C.text);
    doc.text(trunc(team, 13), qx + 2, qy + 11);
  }

  if (qualifiers.length === 0) {
    doc.setFont("helvetica", "italic"); doc.setFontSize(7);
    tc(C.dim);
    doc.text("No 3rd-place teams selected", M, QY0 + 10);
  }

  footer();

  // ── PAGE 2: Knockout Bracket ──────────────────────────────────────────────

  doc.addPage("a4", "landscape");
  header("KNOCKOUT BRACKET");

  const ROUND_LABELS = ["Round of 32", "Round of 16", "Quarter-Finals", "Semi-Finals", "Final"];
  const COL_WIDTHS   = [52, 46, 46, 46, 44, 43];  // 5 rounds + champion = 277mm total
  const COL_X: number[] = [];
  let cx = M;
  for (const w of COL_WIDTHS) { COL_X.push(cx); cx += w; }

  const BY0  = 20;   // bracket content start Y (mm)
  const MH   = 9;    // match height (mm)
  const BGAP = 2;    // base gap between R32 matches (mm)
  const BP   = MH + BGAP;  // base pitch = 11mm

  const bPad = (ri: number) => BP * (Math.pow(2, ri) - 1) / 2;
  const bGap = (ri: number) => BP * Math.pow(2, ri) - MH;
  const mY   = (ri: number, mi: number) => BY0 + bPad(ri) + mi * (MH + bGap(ri));
  const mCY  = (ri: number, mi: number) => mY(ri, mi) + MH / 2;

  for (let ri = 0; ri < 5; ri++) {
    const colW    = COL_WIDTHS[ri];
    const colLeft = COL_X[ri];
    const mW      = colW - 5;   // 2.5mm padding each side
    const mX      = colLeft + 2.5;
    const roundData = rounds[ri];
    if (!roundData) continue;

    // Round header label
    doc.setFont("helvetica", "bold"); doc.setFontSize(5.5);
    tc(C.dim);
    doc.text(ROUND_LABELS[ri], colLeft + colW / 2, BY0 - 2.5, { align: "center" });

    for (let mi = 0; mi < roundData.matches.length; mi++) {
      const match  = roundData.matches[mi];
      const my     = mY(ri, mi);
      const winner = bracketPicks[match.id] ?? null;
      const { t1, t2 } = match;

      // Match box
      fd(C.offwhite, C.border); doc.setLineWidth(0.1);
      doc.rect(mX, my, mW, MH, "FD");

      // Divider
      d(C.border); doc.setLineWidth(0.08);
      doc.line(mX, my + MH / 2, mX + mW, my + MH / 2);

      // ── Team 1 row ──────────────────────────────────────────────────────
      if (winner === t1 && t1) { f(C.winBg); doc.rect(mX, my, mW, MH / 2, "F"); }
      doc.setFont("helvetica", winner === t1 && t1 ? "bold" : "normal");
      doc.setFontSize(5.5);
      tc(t1 ? (winner === t1 ? C.dark : C.text) : C.dim);
      doc.text(t1 ? trunc(t1, 18) : "TBD", mX + 1.5, my + MH / 2 - 1.4);

      if (winner === t1 && t1) {
        f(C.accent); doc.rect(mX, my, 1.5, MH / 2, "F");
      }

      // ── Team 2 row ──────────────────────────────────────────────────────
      if (winner === t2 && t2) { f(C.winBg); doc.rect(mX, my + MH / 2, mW, MH / 2, "F"); }
      doc.setFont("helvetica", winner === t2 && t2 ? "bold" : "normal");
      doc.setFontSize(5.5);
      tc(t2 ? (winner === t2 ? C.dark : C.text) : C.dim);
      doc.text(t2 ? trunc(t2, 18) : "TBD", mX + 1.5, my + MH - 1.4);

      if (winner === t2 && t2) {
        f(C.accent); doc.rect(mX, my + MH / 2, 1.5, MH / 2, "F");
      }

      // ── Connector lines to the next round ───────────────────────────────
      if (ri < 4) {
        const rightX    = mX + mW;
        const nextColX  = COL_X[ri + 1] + 2.5;
        const midX      = rightX + (nextColX - rightX) / 2;
        const thisCY    = my + MH / 2;
        const nextMi    = Math.floor(mi / 2);
        const nextCY    = mCY(ri + 1, nextMi);

        d(C.border); doc.setLineWidth(0.18);

        // Horizontal from right edge of this match to the mid-column join point
        doc.line(rightX, thisCY, midX, thisCY);

        if (mi % 2 === 0) {
          // Top of a pair: draw the vertical stem and the outgoing horizontal
          const sibling = mi + 1;
          if (sibling < roundData.matches.length) {
            const sibCY = mY(ri, sibling) + MH / 2;
            doc.line(midX, thisCY, midX, sibCY);
          }
          doc.line(midX, nextCY, nextColX, nextCY);
        }
      }
    }
  }

  // ── Champion box ──────────────────────────────────────────────────────────

  const champX  = COL_X[5] + 1;
  const champW  = COL_WIDTHS[5] - 2;
  const champCY = BY0 + BP * 8;           // vertical center of 16-match bracket
  const champH  = 26;

  fd(C.goldLt, C.accent); doc.setLineWidth(0.4);
  doc.rect(champX, champCY - champH / 2, champW, champH, "FD");

  doc.setFont("helvetica", "bold"); doc.setFontSize(5.5);
  tc(C.dim);
  doc.text("WORLD", champX + champW / 2, champCY - champH / 2 + 4.5, { align: "center" });
  doc.text("CHAMPION", champX + champW / 2, champCY - champH / 2 + 9.5, { align: "center" });

  if (champion) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(8);
    tc(C.dark);
    doc.text(trunc(champion, 14), champX + champW / 2, champCY + 3, { align: "center" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(14);
    doc.text("🏆", champX + champW / 2, champCY + 10, { align: "center" });
  } else {
    doc.setFont("helvetica", "italic"); doc.setFontSize(7);
    tc(C.dim);
    doc.text("TBD", champX + champW / 2, champCY + 3, { align: "center" });
  }

  // Also draw the connector line from the Final column to the champion box
  if (rounds[4]?.matches[0]) {
    const finalMY  = mY(4, 0);
    const finalCY  = finalMY + MH / 2;
    const finalRX  = COL_X[4] + 2.5 + COL_WIDTHS[4] - 5;
    d(C.border); doc.setLineWidth(0.18);
    doc.line(finalRX, finalCY, champX, finalCY);
  }

  footer();

  doc.save(`wc2026-bracket-${Date.now()}.pdf`);
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface BracketStageProps {
  rounds: BracketRoundData[];
  bracketPicks: Record<string, string>;
  champion: string | null;
  onPick: (matchId: string, team: string) => void;
  onBack: () => void;
  groupRankings: Record<string, string[]>;
  selectedThirds: string[];
}

// ── BracketStage ─────────────────────────────────────────────────────────────

export default function BracketStage({
  rounds, bracketPicks, champion, onPick, onBack,
  groupRankings, selectedThirds,
}: BracketStageProps) {
  const bracketRef = useRef<HTMLDivElement>(null);
  const [pngState, setPngState] = useState<"idle"|"loading"|"done"|"error">("idle");
  const [pdfState, setPdfState] = useState<"idle"|"loading"|"done"|"error">("idle");

  async function handleDownloadPNG() {
    setPngState("loading");
    try {
      const html2canvas = await loadHtml2Canvas();
      const el = bracketRef.current!;
      const prevOverflow = el.style.overflow;
      const prevWidth    = el.style.width;
      el.style.overflow = "visible";
      el.style.width    = el.scrollWidth + "px";
      const canvas = await html2canvas(el, {
        backgroundColor: "#0a0c0f", scale: 2, useCORS: true, logging: false,
        width: el.scrollWidth, height: el.scrollHeight,
      });
      el.style.overflow = prevOverflow;
      el.style.width    = prevWidth;
      const link = document.createElement("a");
      link.download = `wc2026-bracket-${Date.now()}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      setPngState("done");
      setTimeout(() => setPngState("idle"), 2500);
    } catch (e) {
      console.error(e);
      setPngState("error");
      setTimeout(() => setPngState("idle"), 3000);
    }
  }

  async function handleDownloadPDF() {
    setPdfState("loading");
    try {
      await generatePDF(groupRankings, selectedThirds, rounds, bracketPicks, champion);
      setPdfState("done");
      setTimeout(() => setPdfState("idle"), 2500);
    } catch (e) {
      console.error(e);
      setPdfState("error");
      setTimeout(() => setPdfState("idle"), 3000);
    }
  }

  function exportBtn(
    icon: string, label: string, sub: string,
    state: "idle"|"loading"|"done"|"error",
    onClick: () => void,
  ) {
    const statusColor = state === "error" ? "var(--danger)" : state === "done" ? "var(--accent2)" : "var(--dim2)";
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <button
          className={`wcp-export-btn ${state === "loading" ? "loading" : ""}`}
          onClick={onClick}
          disabled={state === "loading"}
        >
          <span className="wcp-export-icon">{icon}</span>
          <span className="wcp-export-btn-label">{label}</span>
          <span className="wcp-export-btn-sub">{sub}</span>
        </button>
        {state !== "idle" && (
          <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: "0.65rem", color: statusColor, paddingLeft: "2px" }}>
            {state === "loading" && <span style={{ marginRight: "4px", display: "inline-block", animation: "spin 1s linear infinite" }}>⟳</span>}
            {state === "loading" ? "Working…" : state === "done" ? "✓ Downloaded!" : "Something went wrong"}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="wcp-section-title">Knockout Bracket</div>
      <div className="wcp-section-desc">
        Click a team to advance them to the next round. Work left-to-right from Round of 32 to the Final.
      </div>

      <div ref={bracketRef} style={{ background: "#0a0c0f", padding: "16px 0" }}>
        <div style={{
          fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.4rem",
          letterSpacing: "0.1em", color: "#e8eaf0",
          padding: "0 16px 16px", borderBottom: "1px solid #252c38",
          marginBottom: "16px", display: "flex", alignItems: "center", gap: "12px",
        }}>
          <span style={{ color: "#f0c040" }}>FIFA World Cup 2026</span>
          <span style={{ color: "#5a6275", fontSize: "0.8rem", fontFamily: "IBM Plex Mono, monospace", letterSpacing: "0.12em" }}>
            MY BRACKET PREDICTION
          </span>
        </div>

        <div className="wcp-bracket-outer">
          <div className="wcp-bracket">
            {rounds.map((round, ri) => (
              <BracketRound
                key={ri}
                round={round}
                roundIndex={ri}
                bracketPicks={bracketPicks}
                onPick={onPick}
              />
            ))}
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignSelf: "stretch" }}>
              <div className="wcp-champion-box">
                <div className="wcp-champion-trophy">🏆</div>
                <div className="wcp-champion-label">World Champion</div>
                <div className="wcp-champion-name">
                  {champion ? (
                    <span>{FLAGS[champion]} {champion}</span>
                  ) : (
                    <span style={{ color: "var(--dim)", fontSize: "1rem", fontFamily: "IBM Plex Sans", fontStyle: "italic" }}>TBD</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="wcp-export-panel">
        <div className="wcp-export-header">
          <span className="wcp-export-title">Export Your Bracket</span>
          <span className="wcp-export-badge">Share it</span>
        </div>
        <div className="wcp-export-body">
          {exportBtn("🖼️", "Download PNG", "High-res screenshot · share anywhere", pngState, handleDownloadPNG)}
          {exportBtn("📄", "Download PDF", "2-page printable · groups + bracket", pdfState, handleDownloadPDF)}
        </div>
        <div className="wcp-export-note">
          PNG captures the bracket at 2× resolution. PDF generates a formatted document with group standings, 3rd-place qualifiers, and the full knockout bracket — no emojis, print-ready.
        </div>
      </div>

      <div className="wcp-nav">
        <button className="wcp-btn wcp-btn-secondary" onClick={onBack}>← Back</button>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── BracketRound ──────────────────────────────────────────────────────────────

interface BracketRoundProps {
  round: BracketRoundData;
  roundIndex: number;
  bracketPicks: Record<string, string>;
  onPick: (matchId: string, team: string) => void;
}

function BracketRound({ round, roundIndex, bracketPicks, onPick }: BracketRoundProps) {
  const gap = bracketGap(roundIndex);
  const pad = bracketPad(roundIndex);

  return (
    <div className="wcp-round">
      <div className="wcp-round-header">{round.label}</div>
      <div
        className="wcp-round-matches"
        style={{ gap: `${gap}px`, paddingTop: `${pad}px`, paddingBottom: `${pad}px` }}
      >
        {round.matches.map((match) => (
          <BracketMatchCard
            key={match.id}
            match={match}
            winner={bracketPicks[match.id] ?? null}
            onPick={(team) => onPick(match.id, team)}
          />
        ))}
      </div>
    </div>
  );
}

// ── BracketMatchCard ──────────────────────────────────────────────────────────

interface BracketMatchCardProps {
  match: BracketMatch;
  winner: string | null;
  onPick: (team: string) => void;
}

function BracketMatchCard({ match, winner, onPick }: BracketMatchCardProps) {
  const { t1, t2 } = match;
  return (
    <div className="wcp-match">
      <div
        className={`wcp-match-team ${winner === t1 ? "winner" : ""}`}
        onClick={() => t1 && onPick(t1)}
        title={t1 ? `Pick ${t1}` : ""}
      >
        <div className="wcp-match-team-name">
          {t1 ? (
            <><span className="wcp-match-flag">{FLAGS[t1] ?? "🏳️"}</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t1}</span></>
          ) : (
            <span style={{ color: "var(--dim)", fontStyle: "italic", fontSize: "0.78em" }}>TBD</span>
          )}
        </div>
        <div className="wcp-win-dot" />
      </div>
      <div className="wcp-match-divider" />
      <div
        className={`wcp-match-team ${winner === t2 ? "winner" : ""}`}
        onClick={() => t2 && onPick(t2)}
        title={t2 ? `Pick ${t2}` : ""}
      >
        <div className="wcp-match-team-name">
          {t2 ? (
            <><span className="wcp-match-flag">{FLAGS[t2] ?? "🏳️"}</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t2}</span></>
          ) : (
            <span style={{ color: "var(--dim)", fontStyle: "italic", fontSize: "0.78em" }}>TBD</span>
          )}
        </div>
        <div className="wcp-win-dot" />
      </div>
    </div>
  );
}
