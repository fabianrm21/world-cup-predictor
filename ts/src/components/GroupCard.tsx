import { FLAGS } from "../WorldCupPreditor";

interface GroupCardProps {
  group: string;
  teams: string[];
  onMove: (group: string, idx: number, dir: number) => void;
}

export default function GroupCard({ group, teams, onMove }: GroupCardProps) {
  const rankLabels = ["1st", "2nd", "3rd", "4th"];
  const rankClasses = ["rank-1", "rank-2", "rank-3", ""];
  const badgeClasses = ["rank-badge-1", "rank-badge-2", "rank-badge-3", "rank-badge-4"];

  return (
    <div className="wcp-group-card">
      <div className="wcp-group-header">
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span className="wcp-group-letter">GROUP {group}</span>
        </div>
        <span className="wcp-group-label">4 teams</span>
      </div>
      <div className="wcp-group-teams">
        {teams.map((team, idx) => (
          <div key={team} className={`wcp-team-row ${rankClasses[idx]}`}>
            <div className="wcp-team-name">
              <span className={`wcp-rank-badge ${badgeClasses[idx]}`}>{rankLabels[idx]}</span>
              <span style={{ fontSize: "1.1em" }}>{FLAGS[team] || "🏳️"}</span>
              <span>{team}</span>
            </div>
            <div className="wcp-rank-arrows">
              <button
                className="wcp-rank-arrow"
                onClick={() => onMove(group, idx, -1)}
                disabled={idx === 0}
                title="Move up"
              >▲</button>
              <button
                className="wcp-rank-arrow"
                onClick={() => onMove(group, idx, 1)}
                disabled={idx === teams.length - 1}
                title="Move down"
              >▼</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
