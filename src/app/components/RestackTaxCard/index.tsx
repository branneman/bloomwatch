import { MetricCard } from "../ui/MetricCard";
import lifebloomIcon from "../../../assets/spell-icons/lifebloom.jpg";

export function RestackTaxCard() {
  return (
    <MetricCard
      icon={lifebloomIcon}
      title="Re-stack tax"
      value="3 casts · ~2,400 mana"
      judgement="orange"
      threshold="R/O/G scales with fight length. For a fight this length (5:41), 0–2 re-stack casts is green, 3–5 is orange, 6+ is red. Excludes the opener and each target's first, free ramp."
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
      <p style={{ fontSize: "var(--text-small-size)", margin: 0 }}>
        Lifebloom casts spent rebuilding a stack that had dropped below 3 — the
        concrete cost of dropped stacks, after the opener.
      </p>
    </MetricCard>
  );
}
