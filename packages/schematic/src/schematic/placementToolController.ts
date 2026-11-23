import { mirrorComponentOrientation } from "./geometry";
import type { InstancePaletteItem } from "./instanceSelector";
import {
  buildPlacementCommit,
  buildPlacementPreviewFragment,
  type PlacementCommit,
  type PlacementProperties,
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
  private properties?: PlacementProperties;

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

  setItem(item: InstancePaletteItem, properties?: PlacementProperties) {
    if (item !== this.selectedPlacementItemValue) {
      this.resetPose();
    }
    this.selectedPlacementItemValue = item;
    this.activePlacementItemValue = item;
    this.properties = properties;
  }

  previewItem(item: InstancePaletteItem | null) {
    if (!item) {
      this.activePlacementItemValue = null;
      return;
    }
    if (item === this.selectedPlacementItemValue) this.activePlacementItemValue = item;
    else this.setItem(item);
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
    mirrorComponentOrientation(this.poseValue, axis);
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
      ...this.poseValue,
      properties: this.properties
    });
  }

  buildPreview(point: Point): SchematicDocument | null {
    if (!this.activePlacementItemValue) return null;
    return buildPlacementPreviewFragment(this.activePlacementItemValue, point, { ...this.poseValue, properties: this.properties });
  }

  private resetPose() {
    this.poseValue = { rotation: 0, mirrored: false };
  }
}
