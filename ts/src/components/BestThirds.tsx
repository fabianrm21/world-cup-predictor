import { FLAGS } from "../WorldCupPreditor";

interface BestThirdsProps {
  groupRankings: Record<string, string[]>;
  selected: string[];
  onToggle: (group: string) => void;
  onBack: () => void;
  onNext: () => void;
}

export default function BestThirds({ groupRankings, selected, onToggle, onBack, onNext }: BestThirdsProps) {
  const allGroups = Object.keys(groupRankings);

  return (
    <div>
      <div className="wcp-section-title">Best 3rd-Place Teams</div>
      <div className="wcp-section-desc">
        8 of the 12 third-placed teams advance to the Round of 32. Select which 8 you think will qualify.
        <span style={{ marginLeft: "12px", color: selected.length === 8 ? "var(--accent2)" : "var(--accent)", fontFamily: "IBM Plex Mono, monospace", fontSize: "0.78rem" }}>
          {selected.length}/8 selected
        </span>
      </div>
      <div className="wcp-third-info">
        Teams are ranked by: points → goal difference → goals scored → head-to-head → fair play.
        The best 8 from all 12 groups advance to the bracket.
      </div>
      <div className="wcp-third-grid">
        {allGroups.map((g) => {
          const thirdTeam = groupRankings[g][2];
          const isSelected = selected.includes(g);
          const isExcluded = !isSelected && selected.length >= 8;
          return (
            <div
              key={g}
              className={`wcp-third-card ${isSelected ? "selected" : ""} ${isExcluded ? "excluded" : ""}`}
              onClick={() => onToggle(g)}
            >
              {isSelected && <div className="wcp-third-check">✓</div>}
              <div className="wcp-third-group">Group {g} — 3rd place</div>
              <div className="wcp-third-team">
                <span>{FLAGS[thirdTeam] || "🏳️"}</span>
                <span>{thirdTeam}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="wcp-nav">
        <button className="wcp-btn wcp-btn-secondary" onClick={onBack}>← Back</button>
        <button
          className="wcp-btn wcp-btn-primary"
          disabled={selected.length !== 8}
          onClick={onNext}
        >
          {selected.length !== 8 ? `Select ${8 - selected.length} more` : "To the Bracket →"}
        </button>
      </div>
    </div>
  );
}
