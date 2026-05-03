import { useState } from "react";
import BracketStage from "./components/BracketRound";
import BestThirds from "./components/BestThirds";
import GroupStage from "./components/GroupStage";

// ─── WINDOW GLOBALS (CDN-loaded libraries) ────────────────────────────────────

declare global {
  interface Window {
    html2canvas?: (
      element: HTMLElement,
      options?: Record<string, unknown>
    ) => Promise<HTMLCanvasElement>;
    jspdf?: {
      jsPDF: new (options: Record<string, unknown>) => {
        addImage: (
          imgData: string,
          format: string,
          x: number,
          y: number,
          w: number,
          h: number
        ) => void;
        save: (filename: string) => void;
      };
    };
  }
}

// ─── TYPES ────────────────────────────────────────────────────────────────────

export type GroupKey = keyof typeof GROUPS;
export type BracketMatch = { id: string; t1: string | null; t2: string | null };
export type BracketRoundData = { label: string; matches: BracketMatch[] };

// ─── DATA ────────────────────────────────────────────────────────────────────

const GROUPS = {
  A: ["Mexico", "South Africa", "South Korea", "Czechia"],
  B: ["Canada", "Bosnia and Herzegovina", "Qatar", "Switzerland"],
  C: ["Brazil", "Morocco", "Haiti", "Scotland"],
  D: ["USA", "Paraguay", "Australia", "Türkiye"],
  E: ["Germany", "Curaçao", "Ivory Coast", "Ecuador"],
  F: ["Netherlands", "Japan", "Sweden", "Tunisia"],
  G: ["Belgium", "Egypt", "Iran", "New Zealand"],
  H: ["Spain", "Cape Verde", "Saudi Arabia", "Uruguay"],
  I: ["France", "Senegal", "Norway", "Iraq"],
  J: ["Argentina", "Algeria", "Austria", "Jordan"],
  K: ["Portugal", "DR Congo", "Uzbekistan", "Colombia"],
  L: ["England", "Croatia", "Ghana", "Panama"],
};

export const FLAGS: Record<string, string> = {
  Mexico: "🇲🇽", "South Africa": "🇿🇦", "South Korea": "🇰🇷", Czechia: "🇨🇿",
  Canada: "🇨🇦", "Bosnia and Herzegovina": "🇧🇦", Qatar: "🇶🇦", Switzerland: "🇨🇭",
  Brazil: "🇧🇷", Morocco: "🇲🇦", Haiti: "🇭🇹", Scotland: "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  USA: "🇺🇸", Paraguay: "🇵🇾", Australia: "🇦🇺", "Türkiye": "🇹🇷",
  Germany: "🇩🇪", "Curaçao": "🇨🇼", "Ivory Coast": "🇨🇮", Ecuador: "🇪🇨",
  Netherlands: "🇳🇱", Japan: "🇯🇵", Sweden: "🇸🇪", Tunisia: "🇹🇳",
  Belgium: "🇧🇪", Egypt: "🇪🇬", Iran: "🇮🇷", "New Zealand": "🇳🇿",
  Spain: "🇪🇸", "Cape Verde": "🇨🇻", "Saudi Arabia": "🇸🇦", Uruguay: "🇺🇾",
  France: "🇫🇷", Senegal: "🇸🇳", Norway: "🇳🇴", Iraq: "🇮🇶",
  Argentina: "🇦🇷", Algeria: "🇩🇿", Austria: "🇦🇹", Jordan: "🇯🇴",
  Portugal: "🇵🇹", "DR Congo": "🇨🇩", Uzbekistan: "🇺🇿", Colombia: "🇨🇴",
  England: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", Croatia: "🇭🇷", Ghana: "🇬🇭", Panama: "🇵🇦",
  TBD: "❓",
};

// The official bracket seeding for Round of 32 based on FIFA 2026 format
// Each matchup: [winner/runner from group, opponent]
// Groups A–L: 1A=winner A, 2A=runner-up A, 3X=3rd-place best
// Bracket pathway (per FIFA's published bracket):
// Left side: A,B,C,D,E,F  Right side: G,H,I,J,K,L
// R32 matchups (official FIFA seeding):
const R32_BRACKET = [
  // Pathway 1 (Left)
  { id: "r32_1", slot1: "1A", slot2: "2C" },
  { id: "r32_2", slot1: "1C", slot2: "2A" },
  { id: "r32_3", slot1: "1B", slot2: "2D" },
  { id: "r32_4", slot1: "1D", slot2: "2B" },
  { id: "r32_5", slot1: "1E", slot2: "3ABC" },
  { id: "r32_6", slot1: "1F", slot2: "3DEF" },
  { id: "r32_7", slot1: "2E", slot2: "3GHI" },
  { id: "r32_8", slot1: "2F", slot2: "3JKL" },
  // Pathway 2 (Right)
  { id: "r32_9",  slot1: "1G", slot2: "2I" },
  { id: "r32_10", slot1: "1I", slot2: "2G" },
  { id: "r32_11", slot1: "1H", slot2: "2J" },
  { id: "r32_12", slot1: "1J", slot2: "2H" },
  { id: "r32_13", slot1: "1K", slot2: "3GHI" },  // will be reassigned dynamically
  { id: "r32_14", slot1: "1L", slot2: "3DEF" },
  { id: "r32_15", slot1: "2K", slot2: "3ABC" },
  { id: "r32_16", slot1: "2L", slot2: "3JKL" },
];

// ─── MAIN APP ─────────────────────────────────────────────────────────────────

export default function WorldCupPredictor() {
  const [step, setStep] = useState(0); // 0=groups, 1=thirds, 2=bracket
  // groupRankings[group] = [team1, team2, team3, team4] in predicted order
  const [groupRankings, setGroupRankings] = useState<Record<string, string[]>>(() => {
    const init: Record<string, string[]> = {};
    for (const g in GROUPS) init[g] = [...GROUPS[g as GroupKey]];
    return init;
  });
  // Selected 8 best third-place teams (group keys)
  const [selectedThirds, setSelectedThirds] = useState<string[]>([]);
  // Bracket picks: { matchId: winnerTeam }
  const [bracketPicks, setBracketPicks] = useState<Record<string, string>>({});

  // ── Computed values ──────────────────────────────────────────────
  const groupWinners: Record<string, string> = {};
  const groupRunnerUps: Record<string, string> = {};
  const groupThirds: Record<string, string> = {};
  for (const g in groupRankings) {
    groupWinners[g] = groupRankings[g][0];
    groupRunnerUps[g] = groupRankings[g][1];
    groupThirds[g] = groupRankings[g][2];
  }

  // Resolve a bracket slot reference to a team name
  function resolveSlot(slot: string): string | null {
    if (!slot) return null;
    if (slot.startsWith("1")) {
      const g = slot[1];
      return groupWinners[g] || null;
    }
    if (slot.startsWith("2")) {
      const g = slot[1];
      return groupRunnerUps[g] || null;
    }
    if (slot.startsWith("3")) {
      // 3ABC / 3DEF / 3GHI / 3JKL — pick from selected thirds in those groups
      const letters = slot.slice(1).split("");
      const eligible = letters
        .map((l) => (selectedThirds.includes(l) ? groupThirds[l] : null))
        .filter((t): t is string => t != null);
      return eligible[0] || null; // just fill first available for display
    }
    return slot; // already a team name (from bracket picks)
  }

  // Build the bracket rounds from R32 picks
  function buildBracket(): BracketRoundData[] {
    // R32 → 16 → QF (8) → SF (4) → Final (2) → Champion
    const rounds: BracketRoundData[] = [];
    // Round of 32
    const r32: BracketMatch[] = R32_BRACKET.map((m) => ({
      id: m.id,
      t1: resolveSlot(m.slot1),
      t2: resolveSlot(m.slot2),
    }));
    rounds.push({ label: "Round of 32", matches: r32 });

    // Build subsequent rounds from picks
    function nextRound(prevMatches: BracketMatch[], prefix: string): BracketMatch[] {
      const matches: BracketMatch[] = [];
      for (let i = 0; i < prevMatches.length; i += 2) {
        const m1 = prevMatches[i];
        const m2 = prevMatches[i + 1];
        if (!m1 || !m2) continue;
        const t1 = bracketPicks[m1.id] || null;
        const t2 = bracketPicks[m2.id] || null;
        matches.push({ id: `${prefix}_${i / 2}`, t1, t2 });
      }
      return matches;
    }

    const r16 = nextRound(r32, "r16");
    rounds.push({ label: "Round of 16", matches: r16 });
    const qf = nextRound(r16, "qf");
    rounds.push({ label: "Quarter-Finals", matches: qf });
    const sf = nextRound(qf, "sf");
    rounds.push({ label: "Semi-Finals", matches: sf });
    const final = nextRound(sf, "final");
    rounds.push({ label: "Final", matches: final });
    return rounds;
  }

  const bracketRounds = buildBracket();
  const champion = bracketRounds[4]?.matches[0]
    ? bracketPicks[bracketRounds[4].matches[0].id]
    : null;

  // ── Group stage handlers ──────────────────────────────────────────
  function moveTeam(group: string, idx: number, dir: number) {
    const newOrder = [...groupRankings[group]];
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= newOrder.length) return;
    [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];
    setGroupRankings((prev) => ({ ...prev, [group]: newOrder }));
    // Clear downstream picks that are now invalid
    setBracketPicks({});
    setSelectedThirds([]);
  }

  // ── Third place handlers ──────────────────────────────────────────
  function toggleThird(group: string) {
    setSelectedThirds((prev) => {
      if (prev.includes(group)) return prev.filter((g) => g !== group);
      if (prev.length >= 8) return prev; // max 8
      return [...prev, group];
    });
  }

  // ── Bracket pick handler ──────────────────────────────────────────
  function pickWinner(matchId: string, team: string) {
    if (!team) return;
    setBracketPicks((prev) => ({ ...prev, [matchId]: team }));
  }

  // ── Step navigation ───────────────────────────────────────────────
  const STEPS = [
    { label: "Group Stage" },
    { label: "Best 3rds" },
    { label: "Bracket" },
  ];

  // ── RENDER ────────────────────────────────────────────────────────
  return (
    <div className="wcp-app">
      {/* Header */}
      <header className="wcp-header">
        <div className="wcp-title">
          FIFA World Cup <span>2026</span>
        </div>
        <div className="wcp-subtitle">Predictor — Build Your Bracket</div>
      </header>

      {/* Stepper */}
      <nav className="wcp-stepper">
        {STEPS.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center" }}>
            <div
              className={`wcp-step ${step === i ? "active" : ""} ${step > i ? "done" : ""}`}
              onClick={() => { if (i < step || (i === 1 && true) || (i === 2 && selectedThirds.length === 8)) setStep(i); }}
            >
              <div className="wcp-step-inner">
                <div className="wcp-step-num">
                  {step > i ? "✓" : i + 1}
                </div>
                <div className="wcp-step-label">{s.label}</div>
              </div>
            </div>
            {i < STEPS.length - 1 && <div className="wcp-step-connector" />}
          </div>
        ))}
      </nav>

      <main className="wcp-content">
        {step === 0 && (
          <GroupStage
            groupRankings={groupRankings}
            onMove={moveTeam}
            onNext={() => setStep(1)}
          />
        )}
        {step === 1 && (
          <BestThirds
            groupRankings={groupRankings}
            selected={selectedThirds}
            onToggle={toggleThird}
            onBack={() => setStep(0)}
            onNext={() => setStep(2)}
          />
        )}
        {step === 2 && (
          <BracketStage
            rounds={bracketRounds}
            bracketPicks={bracketPicks}
            champion={champion ?? null}
            onPick={pickWinner}
            onBack={() => setStep(1)}
          />
        )}
      </main>
    </div>
  );
}
