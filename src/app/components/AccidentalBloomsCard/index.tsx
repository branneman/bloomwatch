import { MetricCard } from "../ui/MetricCard";
import lifebloomIcon from "../../../assets/spell-icons/lifebloom.jpg";

export function AccidentalBloomsCard() {
  return (
    <MetricCard
      icon={lifebloomIcon}
      title="Accidental blooms"
      value="1"
      judgement="orange"
      threshold="Green 0, orange 1–2, red ≥ 3 per fight. An accidental bloom is a re-application of Lifebloom on the same target within 3s of it blooming — the stack was rebuilt, not deliberately reset."
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
      <ul
        style={{
          margin: "0 0 4px",
          paddingLeft: "16px",
          fontSize: "var(--text-small-size)",
        }}
      >
        <li>2:53 — Offtank</li>
      </ul>
    </MetricCard>
  );
}
