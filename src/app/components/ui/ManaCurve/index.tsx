import styles from "./index.module.css";

export interface ManaCurveProps {
  points: { timestampMs: number; pct: number }[];
  fightStartMs: number;
  fightEndMs: number;
  endingPct: number;
}

const WIDTH = 640;
const HEIGHT = 140;
const PAD = 8;

function toXY(t: number, pct: number): [number, number] {
  const x = PAD + t * (WIDTH - PAD * 2);
  const y = PAD + (1 - pct / 100) * (HEIGHT - PAD * 2);
  return [x, y];
}

export function ManaCurve({
  points,
  fightStartMs,
  fightEndMs,
  endingPct,
}: ManaCurveProps) {
  const fightDurationMs = fightEndMs - fightStartMs;
  const normalized = points.map((point) => ({
    t: (point.timestampMs - fightStartMs) / fightDurationMs,
    pct: point.pct,
  }));

  const linePath = normalized
    .map((point, index) => {
      const [x, y] = toXY(point.t, point.pct);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const areaPath = `${linePath} L${(WIDTH - PAD).toFixed(1)},${(
    HEIGHT - PAD
  ).toFixed(1)} L${PAD.toFixed(1)},${(HEIGHT - PAD).toFixed(1)} Z`;
  const [endX, endY] = toXY(1, endingPct);

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className={styles.chart}
      role="img"
      aria-label={`Mana curve, ending at ${Math.round(endingPct)}%`}
    >
      <path d={areaPath} className={styles.area} />
      <path d={linePath} className={styles.line} />
      <circle cx={endX} cy={endY} r="4.5" className={styles.endMarker} />
    </svg>
  );
}
