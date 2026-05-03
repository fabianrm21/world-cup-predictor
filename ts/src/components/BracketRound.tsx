import { useCallback, useRef, useState } from "react";
import { FLAGS, type BracketMatch, type BracketRoundData } from "../WorldCupPreditor";

// Lazily load html2canvas and jsPDF from CDN
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

interface BracketStageProps {
  rounds: BracketRoundData[];
  bracketPicks: Record<string, string>;
  champion: string | null;
  onPick: (matchId: string, team: string) => void;
  onBack: () => void;
}

export default function BracketStage({ rounds, bracketPicks, champion, onPick, onBack }: BracketStageProps) {
  const bracketRef = useRef<HTMLDivElement>(null);
  const [exportState, setExportState] = useState("idle"); // idle | loading | done | error

  const captureCanvas = useCallback(async () => {
    const html2canvas = await loadHtml2Canvas();
    const el = bracketRef.current;
    if (!el) throw new Error("Bracket element not found");

    // Temporarily expand overflow so entire bracket is captured
    const prevOverflow = el.style.overflow;
    const prevWidth = el.style.width;
    el.style.overflow = "visible";
    el.style.width = el.scrollWidth + "px";

    const canvas = await html2canvas(el, {
      backgroundColor: "#0a0c0f",
      scale: 2,
      useCORS: true,
      logging: false,
      width: el.scrollWidth,
      height: el.scrollHeight,
    });

    el.style.overflow = prevOverflow;
    el.style.width = prevWidth;
    return canvas;
  }, []);

  async function handleDownloadPNG() {
    setExportState("loading");
    try {
      const canvas = await captureCanvas();
      const link = document.createElement("a");
      link.download = `wc2026-bracket-${Date.now()}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      setExportState("done");
      setTimeout(() => setExportState("idle"), 2500);
    } catch (e) {
      console.error(e);
      setExportState("error");
      setTimeout(() => setExportState("idle"), 3000);
    }
  }

  async function handleDownloadPDF() {
    setExportState("loading");
    try {
      const [canvas, JsPDF] = await Promise.all([captureCanvas(), loadJsPDF()]);
      const imgData = canvas.toDataURL("image/png");
      const imgW = canvas.width;
      const imgH = canvas.height;

      // Landscape A2 gives plenty of room for the wide bracket
      const pdf = new JsPDF({ orientation: "landscape", unit: "px", format: [imgW / 2, imgH / 2] });
      pdf.addImage(imgData, "PNG", 0, 0, imgW / 2, imgH / 2);
      pdf.save(`wc2026-bracket-${Date.now()}.pdf`);
      setExportState("done");
      setTimeout(() => setExportState("idle"), 2500);
    } catch (e) {
      console.error(e);
      setExportState("error");
      setTimeout(() => setExportState("idle"), 3000);
    }
  }

  const isLoading = exportState === "loading";
  const statusMsg =
    exportState === "loading" ? "Rendering bracket…" :
    exportState === "done"    ? "✓ Downloaded!" :
    exportState === "error"   ? "Something went wrong — try again" :
    null;

  return (
    <div>
      <div className="wcp-section-title">Knockout Bracket</div>
      <div className="wcp-section-desc">
        Click a team to advance them to the next round. Work left-to-right from Round of 32 to the Final.
      </div>

      {/* The ref wraps just the visual bracket for clean capture */}
      <div ref={bracketRef} style={{ background: "#0a0c0f", padding: "16px 0" }}>
        {/* Mini header for the export image */}
        <div style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: "1.4rem",
          letterSpacing: "0.1em",
          color: "#e8eaf0",
          padding: "0 16px 16px",
          borderBottom: "1px solid #252c38",
          marginBottom: "16px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
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
                isLast={ri === rounds.length - 1}
                bracketPicks={bracketPicks}
                onPick={onPick}
                gapMultiplier={Math.pow(2, ri)}
              />
            ))}
            {/* Champion display */}
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

      {/* Export panel */}
      <div className="wcp-export-panel">
        <div className="wcp-export-header">
          <span className="wcp-export-title">Export Your Bracket</span>
          <span className="wcp-export-badge">Share it</span>
        </div>
        <div className="wcp-export-body">
          <button
            className={`wcp-export-btn ${isLoading ? "loading" : ""}`}
            onClick={handleDownloadPNG}
            disabled={isLoading}
          >
            <span className="wcp-export-icon">🖼️</span>
            <span className="wcp-export-btn-label">Download PNG</span>
            <span className="wcp-export-btn-sub">High-res image · share anywhere</span>
          </button>
          <button
            className={`wcp-export-btn ${isLoading ? "loading" : ""}`}
            onClick={handleDownloadPDF}
            disabled={isLoading}
          >
            <span className="wcp-export-icon">📄</span>
            <span className="wcp-export-btn-label">Download PDF</span>
            <span className="wcp-export-btn-sub">Print-ready · landscape format</span>
          </button>
          {statusMsg && (
            <div style={{
              alignSelf: "center",
              fontFamily: "IBM Plex Mono, monospace",
              fontSize: "0.72rem",
              color: exportState === "error" ? "var(--danger)" : exportState === "done" ? "var(--accent2)" : "var(--dim2)",
              padding: "8px 4px",
            }}>
              {exportState === "loading" && (
                <span style={{ marginRight: "6px", animation: "spin 1s linear infinite", display: "inline-block" }}>⟳</span>
              )}
              {statusMsg}
            </div>
          )}
        </div>
        <div className="wcp-export-note">
          Captures the full bracket at 2× resolution. Emoji flags render as text in PDFs — PNG is recommended for sharing on social media.
        </div>
      </div>

      <div className="wcp-nav">
        <button className="wcp-btn wcp-btn-secondary" onClick={onBack}>← Back</button>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

interface BracketRoundProps {
  round: BracketRoundData;
  isLast: boolean;
  bracketPicks: Record<string, string>;
  onPick: (matchId: string, team: string) => void;
  gapMultiplier: number;
}

function BracketRound({ round, bracketPicks, onPick, gapMultiplier }: BracketRoundProps) {
  const gap = 8 * gapMultiplier;

  return (
    <div className="wcp-round">
      <div className="wcp-round-header">{round.label}</div>
      <div
        className="wcp-round-matches"
        style={{ gap: `${gap}px` }}
      >
        {round.matches.map((match) => (
          <BracketMatchCard
            key={match.id}
            match={match}
            winner={bracketPicks[match.id] || null}
            onPick={(team) => onPick(match.id, team)}
          />
        ))}
      </div>
    </div>
  );
}



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
            <>
              <span className="wcp-match-flag">{FLAGS[t1] || "🏳️"}</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t1}</span>
            </>
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
            <>
              <span className="wcp-match-flag">{FLAGS[t2] || "🏳️"}</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t2}</span>
            </>
          ) : (
            <span style={{ color: "var(--dim)", fontStyle: "italic", fontSize: "0.78em" }}>TBD</span>
          )}
        </div>
        <div className="wcp-win-dot" />
      </div>
    </div>
  );
}
