import { resolveComponentDef } from "./catalog";
import { componentPinPoint } from "./connectivity";
import { netNameForPin, type NetResolution } from "./netResolution";
import { deriveSchematicTopology } from "./topology";
import type { ExtractedNetlist, SchematicContent, SchematicDocument } from "./types";

export { componentPinPoint };

export function extractNetlist(document: SchematicDocument, resolution?: NetResolution): ExtractedNetlist;
export function extractNetlist(document: SchematicContent, resolution?: NetResolution): ExtractedNetlist;
export function extractNetlist(
  document: SchematicContent,
  resolution: NetResolution = deriveSchematicTopology(document).netResolution
): ExtractedNetlist {
  const pinPoints = resolution.connectivity.pins.map((pin) => ({
    ...pin,
    netId: netNameForPin(resolution, pin.componentId, pin.pinId)
  }));
  const pinsByComponent = new Map<string, Map<string, (typeof pinPoints)[number]>>();
  pinPoints.forEach((pin) => {
    let componentPins = pinsByComponent.get(pin.componentId);
    if (!componentPins) {
      componentPins = new Map();
      pinsByComponent.set(pin.componentId, componentPins);
    }
    if (!componentPins.has(pin.pinId)) componentPins.set(pin.pinId, pin);
  });
  const nets = new Map(Array.from(resolution.nets, ([name, net]) => [name, net.points]));

  const activeComponents = document.components.filter((component) => !component.temporarilyDeleted);
  const components = activeComponents.map((instance) => {
    const def = resolveComponentDef(instance);
    const instancePins = pinsByComponent.get(instance.id);
    const pins: Record<string, string> = {};
    def.pins.forEach((pin) => {
      const netPin = instancePins?.get(pin.id);
      pins[pin.id] = netPin?.netId ?? "";
    });
    return { instance, def, pins };
  });
  return { nets, pins: pinPoints, components, diagnostics: resolution.connectivity.diagnostics };
}
