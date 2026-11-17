import type { Point, WireAppearance, WireRouteMode, WireVariant } from "../types";
import {
  createEmptyWireRouteSession,
  finishWireRouteFromKeyboard,
  handleWireBlankRouteClick,
  handleWirePinRouteClick,
  wireRouteAppearance,
  wireRoutePointCount,
  wireRoutePreviewPath,
  type WireRouteIntent,
  type WireRouteSession
} from "./wireCreationModel";

export type SchematicWireRouteResult =
  | {
      kind: "pending";
      previewPoint: Point;
      status: string;
    }
  | {
      kind: "commit";
      points: Point[];
      routeMode: WireRouteMode;
    }
  | {
      kind: "invalid";
      status: string;
    };

export class SchematicWireToolController {
  private sessionValue: WireRouteSession;
  private routeModeValue: WireRouteMode = "orthogonal";

  constructor(variant: WireVariant = "signal") {
    this.sessionValue = createEmptyWireRouteSession(variant, this.routeModeValue);
  }

  get variant(): WireVariant {
    return this.sessionValue.variant;
  }

  get routeMode(): WireRouteMode {
    return this.routeModeValue;
  }

  begin(variant: WireVariant) {
    this.sessionValue = createEmptyWireRouteSession(variant, this.routeModeValue);
  }

  reset() {
    this.sessionValue = createEmptyWireRouteSession(this.sessionValue.variant, this.routeModeValue);
  }

  setRouteMode(routeMode: WireRouteMode) {
    this.routeModeValue = routeMode;
    this.sessionValue = { ...this.sessionValue, routeMode };
    return this.routeModeValue;
  }

  toggleRouteMode() {
    return this.setRouteMode(
      this.routeModeValue === "orthogonal" ? "freeAngle" : "orthogonal"
    );
  }

  cancel() {
    this.reset();
  }

  applyBlankClick(point: Point): SchematicWireRouteResult {
    return this.applyRouteIntent(handleWireBlankRouteClick(this.sessionValue, point));
  }

  applyPinClick(point: Point): SchematicWireRouteResult {
    return this.applyRouteIntent(handleWirePinRouteClick(this.sessionValue, point));
  }

  finishFromKeyboard(point: Point | null): SchematicWireRouteResult {
    return this.applyRouteIntent(finishWireRouteFromKeyboard(this.sessionValue, point));
  }

  previewPath(point: Point | null) {
    return wireRoutePreviewPath(this.sessionValue, point);
  }

  appearance(): WireAppearance {
    return wireRouteAppearance(this.sessionValue);
  }

  routePointCount() {
    return wireRoutePointCount(this.sessionValue);
  }

  private applyRouteIntent(intent: WireRouteIntent): SchematicWireRouteResult {
    if (intent.kind === "pending") {
      this.sessionValue = intent.session;
      return {
        kind: "pending",
        previewPoint: intent.previewPoint,
        status: intent.status
      };
    }

    if (intent.kind === "invalid") {
      this.sessionValue = intent.session;
      return {
        kind: "invalid",
        status: intent.status
      };
    }

    return {
      kind: "commit",
      points: intent.points,
      routeMode: intent.routeMode
    };
  }
}
