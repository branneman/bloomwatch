import { describe, expect, it } from "vitest";
import { parseHash, serializeRoute, type Route } from "./hashRoute";

describe("parseHash / serializeRoute", () => {
  const cases: { name: string; hash: string; route: Route }[] = [
    { name: "empty hash", hash: "", route: { screen: "input" } },
    { name: "bare hash", hash: "#", route: { screen: "input" } },
    {
      name: "report only",
      hash: "#/r/4GYHZRdtL3bvhpc8",
      route: {
        screen: "druidPicker",
        reportCode: "4GYHZRdtL3bvhpc8",
        host: "fresh",
      },
    },
    {
      name: "report + druid",
      hash: "#/r/4GYHZRdtL3bvhpc8/d/Dassz",
      route: {
        screen: "dashboard",
        reportCode: "4GYHZRdtL3bvhpc8",
        host: "fresh",
        druidName: "Dassz",
      },
    },
    {
      name: "report + druid + fight",
      hash: "#/r/4GYHZRdtL3bvhpc8/d/Dassz/f/6",
      route: {
        screen: "fight",
        reportCode: "4GYHZRdtL3bvhpc8",
        host: "fresh",
        druidName: "Dassz",
        fightId: 6,
      },
    },
    {
      name: "report + druid + fight + epic",
      hash: "#/r/4GYHZRdtL3bvhpc8/d/Dassz/f/6/e/lifebloom",
      route: {
        screen: "fightEpic",
        reportCode: "4GYHZRdtL3bvhpc8",
        host: "fresh",
        druidName: "Dassz",
        fightId: 6,
        epicId: "lifebloom",
      },
    },
    {
      name: "report + classic host",
      hash: "#/r/4GYHZRdtL3bvhpc8/h/classic",
      route: {
        screen: "druidPicker",
        reportCode: "4GYHZRdtL3bvhpc8",
        host: "classic",
      },
    },
    {
      name: "report + classic host + druid + fight + epic",
      hash: "#/r/4GYHZRdtL3bvhpc8/h/classic/d/Dassz/f/6/e/lifebloom",
      route: {
        screen: "fightEpic",
        reportCode: "4GYHZRdtL3bvhpc8",
        host: "classic",
        druidName: "Dassz",
        fightId: 6,
        epicId: "lifebloom",
      },
    },
    { name: "about", hash: "#/about", route: { screen: "about" } },
    {
      name: "judgements, no slug",
      hash: "#/judgements",
      route: { screen: "judgements" },
    },
    {
      name: "judgements with slug",
      hash: "#/judgements/rejuv-clip-share",
      route: { screen: "judgements", slug: "rejuv-clip-share" },
    },
  ];

  for (const { name, hash, route } of cases) {
    it(`parses ${name}`, () => {
      expect(parseHash(hash)).toEqual(route);
    });

    it(`serializes ${name} back to the same hash`, () => {
      expect(serializeRoute(route)).toBe(hash === "" ? "#" : hash);
    });
  }

  it("round-trips a druid name with a space and an apostrophe", () => {
    const route: Route = {
      screen: "dashboard",
      reportCode: "4GYHZRdtL3bvhpc8",
      host: "fresh",
      druidName: "O'Bran Leafwhisper",
    };
    expect(parseHash(serializeRoute(route))).toEqual(route);
  });

  it.each([
    "#/r",
    "#/x/CODE",
    "#/r/CODE/d",
    "#/r/CODE/d/Name/f",
    "#/r/CODE/d/Name/f/notanumber",
    "#/r/CODE/d/Name/f/6/e",
    "#/r/CODE/d/Name/f/6/e/notanepic",
    "#/r/CODE/d/Name/f/6/e/gcd/extra",
    "garbage",
    "#/r/%zz",
    "#/r/CODE/d/%zz",
    "#/r/CODE/d/Name/f/6/e/%zz",
    "#/r/100%",
  ])("falls back to the input screen for malformed hash %s", (hash) => {
    expect(parseHash(hash)).toEqual({ screen: "input" });
  });

  it.each(["#/about/extra", "#/judgements/slug/extra"])(
    "falls back to the input screen for malformed hash %s",
    (hash) => {
      expect(parseHash(hash)).toEqual({ screen: "input" });
    },
  );

  it("defaults to host: fresh (not the input screen) for an unrecognized host value", () => {
    expect(parseHash("#/r/4GYHZRdtL3bvhpc8/h/bogus")).toEqual({
      screen: "druidPicker",
      reportCode: "4GYHZRdtL3bvhpc8",
      host: "fresh",
    });
  });

  it("defaults to host: fresh when the h segment has no value", () => {
    expect(parseHash("#/r/4GYHZRdtL3bvhpc8/h")).toEqual({
      screen: "druidPicker",
      reportCode: "4GYHZRdtL3bvhpc8",
      host: "fresh",
    });
  });
});
