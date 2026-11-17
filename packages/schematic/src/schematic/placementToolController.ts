import type { InstancePaletteItem } from "./instanceSelector";
import {
  buildPlacementCommit,
  buildPlacementPreviewFragment,
  type PlacementCommit,
  type PlacementIdFactory,
  type PlacementRefFactory
} from "./placementModel";
import { isSchematicTemplateId } from "./templates";
import type { Point, SchematicDocument } from "./types";

export type PlacementToolPose = {
  rotation: number;
  mirrored: boolean;
};

export type PlacementPreviewTransformResult =
  | { kind: "updated"; pose: PlacementToolPose }
  | { kind: "template"; pose: PlacementToolPose };

export class SchematicPlacementToolController {
  private selectedPlacementItemValue: InstancePaletteItem;
  private activePlacementItemValue: InstancePaletteItem | null;
  private poseValue: PlacementToolPose = { rotation: 0, mirrored: false };

  constructor(defaultItem: InstancePaletteItem = "resistor", options: { activeItem?: InstancePaletteItem | null } = {}) {
    this.selectedPlacementItemValue = defaultItem;
    this.activePlacementItemValue = options.activeItem === undefined ? defaultItem : options.activeItem;
  }

  get selectedItem(): InstancePaletteItem {
    return this.selectedPlacementItemValue;
  }

  get activeItem(): InstancePaletteItem | null {
    return this.activePlacementItemValue;
  }

  get pose(): PlacementToolPose {
    return { ...this.poseValue };
  }

  setItem(item: InstancePaletteItem) {
    if (item !== this.selectedPlacementItemValue) {
      this.resetPose();
    }
    this.selectedPlacementItemValue = item;
    this.activePlacementItemValue = item;
  }

  previewItem(item: InstancePaletteItem | null) {
    if (!item) {
      this.activePlacementItemValue = null;
      return;
    }
    this.setItem(item);
  }

  activeItemIsTemplate() {
    return !!this.activePlacementItemValue && isSchematicTemplateId(this.activePlacementItemValue);
  }

  rotatePreview(): PlacementPreviewTransformResult {
    if (this.activeItemIsTemplate()) return { kind: "template", pose: this.pose };
    this.poseValue = {
      ...this.poseValue,
      rotation: (this.poseValue.rotation + 90) % 360
    };
    return { kind: "updated", pose: this.pose };
  }

  mirrorPreview(axis: "x" | "y"): PlacementPreviewTransformResult {
    if (this.activeItemIsTemplate()) return { kind: "template", pose: this.pose };
    this.poseValue = axis === "x"
      ? {
          ...this.poseValue,
          mirrored: !this.poseValue.mirrored
        }
      : {
          rotation: (360 - this.poseValue.rotation) % 360,
          mirrored: !this.poseValue.mirrored
        };
    return { kind: "updated", pose: this.pose };
  }

  buildCommit(
    point: Point,
    options: {
      createId: PlacementIdFactory;
      nextRef: PlacementRefFactory;
    }
  ): PlacementCommit | null {
    if (!this.activePlacementItemValue) return null;
    return buildPlacementCommit(this.activePlacementItemValue, point, {
      ...options,
      ...this.poseValue
    });
  }

  buildPreview(point: Point): SchematicDocument | null {
    if (!this.activePlacementItemValue) return null;
    return buildPlacementPreviewFragment(this.activePlacementItemValue, point, this.poseValue);
  }

  private resetPose() {
    this.poseValue = { rotation: 0, mirrored: false };
  }
}
