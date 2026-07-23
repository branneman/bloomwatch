// Death forensics / Crisis response both show a per-death or per-crisis row
// for Swiftmend/Nature's Swiftness readiness. That row is meaningless (and
// misleading, read as a missed opportunity) when a build's talents can
// never reach the ability at all -- the two resources gate independently
// (Nature's Swiftness needs 20 Restoration, Swiftmend needs 30), so a build
// can lack either one, both, or neither. This composes the one-line note
// shown once per fight to explain which row(s), if any, were omitted.
export function describeIneligibleCooldowns(
  hasSwiftmend: boolean,
  hasNaturesSwiftness: boolean,
): string | null {
  if (!hasSwiftmend && !hasNaturesSwiftness) {
    return "This build's talents can't reach Swiftmend or Nature's Swiftness; those rows aren't shown.";
  }
  if (!hasSwiftmend) {
    return "This build's talents can't reach Swiftmend; that row isn't shown.";
  }
  if (!hasNaturesSwiftness) {
    return "This build's talents can't reach Nature's Swiftness; that row isn't shown.";
  }
  return null;
}
