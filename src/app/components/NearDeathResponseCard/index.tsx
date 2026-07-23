import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import {
  computeNearDeathResponse,
  type NearDeathResponseResult,
} from "../../../metrics/nearDeathResponse";
import type { Host } from "../../../report/parseReportInput";
import type { ResolvedAbility } from "../../../abilities/resolveAbilities";
import { formatDuration } from "../../../report/fightRows";
import { buildFightTimeUrl } from "../../../report/wclLinks";
import { MetricCard } from "../ui/MetricCard";
import { CrisisCard } from "../ui/CrisisCard";
import { Alert } from "../ui/Alert";
import {
  parseTalentPoints,
  SWIFTMEND_MIN_RESTORATION,
  NATURES_SWIFTNESS_MIN_RESTORATION,
} from "../../../report/archetypeDetection";
import { describeIneligibleCooldowns } from "../ui/cooldownEligibilityNote";

export interface NearDeathResponseCardProps {
  accessToken: string;
  reportCode: string;
  host: Host;
  fight: Fight;
  druidId: number;
  healingAbilityIds: Set<number>;
  swiftmendAbilityIds: Set<number>;
  naturesSwiftnessAbilityIds: Set<number>;
  lifebloomAbilityIds: Set<number>;
  rejuvenationAbilityIds: Set<number>;
  regrowthAbilityIds: Set<number>;
  resolvedAbilities: Map<number, ResolvedAbility>;
  targetNames: Map<number, string>;
  fetchEvents: (
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
    includeResources?: boolean,
  ) => Promise<WclEvent[]>;
}

type FetchResult =
  | {
      accessToken: string;
      result: NearDeathResponseResult;
      hasSwiftmend: boolean;
      hasNaturesSwiftness: boolean;
    }
  | { accessToken: string; error: string };

const ICON =
  "https://wow.zamimg.com/images/wow/icons/large/spell_holy_layonhands.jpg";

const THRESHOLD =
  "A crisis is a raider's HP dropping to <=15% (provisional) and surviving. The response window runs from that reading until HP recovers, the target dies (excluded; tracked separately under Death forensics), or the fight ends. Good if you landed a new reactive healing cast in that window, with a distinct \"clear save\" callout for an unambiguous burst save (Nature's Swiftness into Healing Touch or Regrowth, or a Swiftmend that consumed a Rejuvenation). Otherwise, on a maintained target (or with no clear tank assignment) good/fair/bad comes from the same unspent-resource tally used in Death forensics (Swiftmend ready / Nature's Swiftness ready / a GCD available). A crisis on a target you're not maintaining reads fair when a resource was ready to help even though it wasn't your assignment, and stays context only otherwise.";

export function NearDeathResponseCard({
  accessToken,
  reportCode,
  host,
  fight,
  druidId,
  healingAbilityIds,
  swiftmendAbilityIds,
  naturesSwiftnessAbilityIds,
  lifebloomAbilityIds,
  rejuvenationAbilityIds,
  regrowthAbilityIds,
  resolvedAbilities,
  targetNames,
  fetchEvents,
}: NearDeathResponseCardProps) {
  const [result, setResult] = useState<FetchResult | null>(null);

  useEffect(() => {
    const fightArg = {
      id: fight.id,
      startTime: fight.startTime,
      endTime: fight.endTime,
    };
    Promise.all([
      fetchEvents(accessToken, reportCode, fightArg, "DamageTaken", true),
      fetchEvents(accessToken, reportCode, fightArg, "Healing", true),
      fetchEvents(accessToken, reportCode, fightArg, "Deaths"),
      fetchEvents(accessToken, reportCode, fightArg, "Casts", true),
      fetchEvents(accessToken, reportCode, fightArg, "Buffs"),
      fetchEvents(accessToken, reportCode, fightArg, "CombatantInfo"),
    ])
      .then(
        ([
          damageEvents,
          healingEvents,
          deathEvents,
          castEvents,
          buffEvents,
          combatantInfoEvents,
        ]) => {
          try {
            const talents = parseTalentPoints(combatantInfoEvents, druidId);
            const restoration = talents === null ? 0 : talents[2];
            const hasSwiftmend = restoration >= SWIFTMEND_MIN_RESTORATION;
            const hasNaturesSwiftness =
              restoration >= NATURES_SWIFTNESS_MIN_RESTORATION;
            const computed = computeNearDeathResponse(
              damageEvents,
              healingEvents,
              deathEvents,
              castEvents,
              buffEvents,
              druidId,
              healingAbilityIds,
              swiftmendAbilityIds,
              naturesSwiftnessAbilityIds,
              lifebloomAbilityIds,
              hasSwiftmend,
              hasNaturesSwiftness,
              fight.startTime,
              fight.endTime,
              resolvedAbilities,
              rejuvenationAbilityIds,
              regrowthAbilityIds,
            );
            // A failed talent read (no CombatantInfo match) is genuinely
            // unknown eligibility, not confirmed ineligibility -- collapsing
            // it to false here (as the judgement math above already does,
            // unchanged) would make the display layer assert "this build
            // can't reach Swiftmend/Nature's Swiftness" when that isn't
            // actually known. Show both rows and skip the note in that
            // case, matching this project's existing precedent of leaving
            // unknown talent data unflagged rather than guessing either
            // way.
            const displayHasSwiftmend = talents === null ? true : hasSwiftmend;
            const displayHasNaturesSwiftness =
              talents === null ? true : hasNaturesSwiftness;
            setResult({
              accessToken,
              result: computed,
              hasSwiftmend: displayHasSwiftmend,
              hasNaturesSwiftness: displayHasNaturesSwiftness,
            });
          } catch (err) {
            setResult({
              accessToken,
              error:
                err instanceof Error
                  ? err.message
                  : "Failed to calculate the near-death response audit.",
            });
          }
        },
      )
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Anything else already escalated to the full-screen recovery
        // overlay by the wrapped fetchEvents (see wcl/client.ts's
        // withErrorReporting) — nothing to render locally.
      });
  }, [
    accessToken,
    reportCode,
    fight.id,
    fight.startTime,
    fight.endTime,
    druidId,
    healingAbilityIds,
    swiftmendAbilityIds,
    naturesSwiftnessAbilityIds,
    lifebloomAbilityIds,
    resolvedAbilities,
    rejuvenationAbilityIds,
    regrowthAbilityIds,
    fetchEvents,
  ]);

  const isCurrent = result !== null && result.accessToken === accessToken;

  if (!isCurrent) {
    return (
      <MetricCard
        icon={ICON}
        title="Near-death response"
        threshold={THRESHOLD}
        rationaleSlug="crisis-response"
      >
        <p>Calculating…</p>
      </MetricCard>
    );
  }

  if ("error" in result) {
    return (
      <MetricCard
        icon={ICON}
        title="Near-death response"
        threshold={THRESHOLD}
        rationaleSlug="crisis-response"
      >
        <p role="alert">{result.error}</p>
      </MetricCard>
    );
  }

  const { crises, flaggedCount, judgement } = result.result;
  const { hasSwiftmend, hasNaturesSwiftness } = result;
  const ineligibleNote = describeIneligibleCooldowns(
    hasSwiftmend,
    hasNaturesSwiftness,
  );

  return (
    <MetricCard
      icon={ICON}
      title="Near-death response"
      value={
        crises.length === 0
          ? "No crises"
          : `${flaggedCount} of ${crises.length} crises flagged`
      }
      judgement={judgement}
      threshold={THRESHOLD}
      rationaleSlug="crisis-response"
    >
      {crises.length === 0 ? (
        <p>No crises this fight.</p>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-3)",
          }}
        >
          {crises.map((crisis) => (
            <CrisisCard
              key={`${crisis.targetId}-${crisis.timestampMs}`}
              target={
                targetNames.get(crisis.targetId) ?? `Target #${crisis.targetId}`
              }
              time={
                <a
                  href={buildFightTimeUrl(
                    host,
                    reportCode,
                    fight.id,
                    crisis.timestampMs,
                    crisis.timestampMs,
                  )}
                  target="_blank"
                  rel="noreferrer"
                >
                  {formatDuration(crisis.timestampMs - fight.startTime)}
                </a>
              }
              hitPointsPct={crisis.hitPointsPct}
              maintained={crisis.maintained}
              judged={crisis.judged}
              responded={crisis.responded}
              swiftmendReady={crisis.swiftmendReady}
              nsReady={crisis.nsReady}
              idlePreceding={crisis.idlePreceding}
              hasSwiftmend={hasSwiftmend}
              hasNaturesSwiftness={hasNaturesSwiftness}
              judgement={crisis.judgement}
              clearSave={crisis.clearSave}
              saveKind={crisis.saveKind}
              prepped={crisis.prepped}
            />
          ))}
        </div>
      )}
      <div style={{ marginTop: "var(--space-4)" }}>
        <Alert tone="warning">
          A survived crisis is not automatically good or bad process by itself;
          this audits your readiness and reaction only; not assignments or
          positioning, and not whether anyone else&apos;s response was enough.
        </Alert>
      </div>
      {ineligibleNote && (
        <div style={{ marginTop: "var(--space-3)" }}>
          <Alert tone="warning">{ineligibleNote}</Alert>
        </div>
      )}
    </MetricCard>
  );
}
