import type { SchematicPropertyBatchCommand } from "./propertyBatchCommands";
import { spntPosition, spntThrowCount } from "./spntSwitchModel";
import type { ComponentInstance } from "./types";

export function switchStateCycleCommand(instance: ComponentInstance): SchematicPropertyBatchCommand | null {
  if (instance.temporarilyDeleted) return null;
  if (instance.type === "switch") {
    return {
      kind: "component-variant",
      variantId: instance.variantId === "closed" ? "open" : "closed",
      moveBehavior: "moveOnly"
    };
  }
  if (instance.type === "spntSwitch") {
    return {
      kind: "component-value",
      value: String((spntPosition(instance) + 1) % (spntThrowCount(instance) + 1))
    };
  }
  return null;
}
