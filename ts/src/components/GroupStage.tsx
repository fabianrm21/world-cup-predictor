import GroupCard from "./GroupCard";

interface GroupStageProps {
  groupRankings: Record<string, string[]>;
  onMove: (group: string, idx: number, dir: number) => void;
  onNext: () => void;
}


export default function GroupStage({ groupRankings, onMove, onNext }: GroupStageProps) {
  return (
    <div>
      <div className="wcp-section-title">Group Stage Predictions</div>
      <div className="wcp-section-desc">
        Drag each group's standings into your predicted finishing order. Use the ▲▼ arrows to reorder.
        The top 2 teams advance automatically; 3rd place may advance as one of the 8 best third-placed teams.
      </div>
      <div className="wcp-groups-grid">
        {Object.entries(groupRankings).map(([group, teams]) => (
          <GroupCard key={group} group={group} teams={teams} onMove={onMove} />
        ))}
      </div>
      <div className="wcp-nav">
        <button className="wcp-btn wcp-btn-primary" onClick={onNext}>
          Next: Best 3rd Teams →
        </button>
      </div>
    </div>
  );
}
