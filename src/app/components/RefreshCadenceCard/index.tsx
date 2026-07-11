import { MetricCard } from "../ui/MetricCard";
import { Histogram } from "../ui/Histogram";
import lifebloomIcon from "../../../assets/spell-icons/lifebloom.jpg";

export function RefreshCadenceCard() {
  return (
    <MetricCard
      icon={lifebloomIcon}
      title="Refresh cadence"
      value="Median 6.4s"
      judgement="green"
      threshold="Green median 6–7s, orange 5–6s, red < 5s. Only refreshes on already-3-stacked targets count. Late cases are judged separately, by the accidental-bloom counter below."
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
      <p style={{ fontSize: "var(--text-small-size)", margin: "0 0 4px" }}>
        Interval between your Lifebloom refreshes on 3-stacked targets — too
        early wastes mana and GCDs, too late risks an accidental bloom.
      </p>
      <Histogram
        buckets={[
          {
            label: "Early (< 5.5s)",
            pct: 14,
            color: "var(--judgement-orange)",
          },
          { label: "Ideal (5.5–7s)", pct: 71, color: "var(--judgement-green)" },
          { label: "Late (> 7s)", pct: 15, color: "var(--judgement-red)" },
        ]}
      />
    </MetricCard>
  );
}
