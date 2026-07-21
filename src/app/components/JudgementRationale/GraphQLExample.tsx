import { Disclosure } from "../ui/Disclosure";
import styles from "./index.module.css";

// A real, slightly-trimmed version of the query src/wcl/events.ts actually
// sends — kept as one worked example rather than an exhaustive API
// reference, which lives in the repository's own README instead.
const EXAMPLE_QUERY = `query {
  rateLimitData { limitPerHour pointsSpentThisHour }
  reportData {
    report(code: "4GYHZRdtL3bvhpc8") {
      events(
        fightIDs: [6]
        dataType: Buffs
        startTime: 0
        endTime: 300000
        includeResources: true
      ) {
        data
        nextPageTimestamp
      }
    }
  }
}`;

export function GraphQLExample() {
  return (
    <Disclosure summary="See a real example query">
      <p>
        This is the actual shape of the request Bloomwatch sends to fetch one
        fight&apos;s Lifebloom buff events — the same query LB3 uptime, refresh
        cadence, and accidental blooms are all built from:
      </p>
      <pre className={styles.query}>
        <code>{EXAMPLE_QUERY}</code>
      </pre>
    </Disclosure>
  );
}
