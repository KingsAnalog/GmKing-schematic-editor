import { describe, expect, it } from "vitest";
import {
  DEFAULT_DEVICE_ITEM,
  DEVICE_LIBRARIES,
  filterDeviceItems,
  getDeviceLibrary,
  unmappedDeviceTypes
} from "../../../src/schematic/deviceLibrary";

describe("device library projection", () => {
  it("maps every catalog component into a visible group", () => {
    expect(unmappedDeviceTypes()).toEqual([]);
    expect(getDeviceLibrary("all").items).toContain(DEFAULT_DEVICE_ITEM);
    expect(getDeviceLibrary("all").items.length).toBeGreaterThan(50);
    expect(DEVICE_LIBRARIES.map(library => library.id)).toContain("templates");
  });

  it("searches by hot label, reference prefix and aliases", () => {
    expect(filterDeviceItems("all", "res")[0]).toBe("resistor");
    expect(filterDeviceItems("all", "opamp")).toContain("opAmp");
    expect(filterDeviceItems("passives", "cap")).toEqual(["capacitor"]);
    expect(getDeviceLibrary("shapes").items).toEqual(["rectangle", "triangle", "circle", "polygon", "polyline", "arc"]);
    expect(filterDeviceItems("shapes", "折线")).toEqual(["polyline"]);
    expect(filterDeviceItems("shapes", "圆弧")).toEqual(["arc"]);
  });
});
