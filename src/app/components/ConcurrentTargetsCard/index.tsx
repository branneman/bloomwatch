import { MetricCard } from "../ui/MetricCard";
import { StackedBar } from "../ui/StackedBar";
import lifebloomIcon from "../../../assets/spell-icons/lifebloom.jpg";

export function ConcurrentTargetsCard() {
  return (
    <MetricCard
      icon={lifebloomIcon}
      title="Concurrent LB3 targets"
      value="Avg 1.6 · Peak 2"
      note="Informational — no judgement"
      threshold="No R/O/G — the right number of concurrent targets depends on your assignments, not a universal target."
    >
      <span
        style={{
          fontSize: "var(--text-small-size)",
          fontStyle: "italic",
          color: "var(--text)",
        }}
      >
        Sample — not yet computed
      </span>
      <p style={{ fontSize: "var(--text-small-size)", margin: "0 0 12px" }}>
        How many targets simultaneously had your LB3, as a share of the fight.
        Maintaining multiple tanks at once is recognized as the skill it is.
      </p>
      <StackedBar
        segments={[
          { label: "0 targets", pct: 3, color: "var(--border)" },
          { label: "1 target", pct: 41, color: "var(--accent-border)" },
          { label: "2 targets", pct: 56, color: "var(--accent)" },
        ]}
      />
    </MetricCard>
  );
}
