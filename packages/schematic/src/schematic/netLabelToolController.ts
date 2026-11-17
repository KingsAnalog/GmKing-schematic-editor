import {
  netLabelAttachmentPointFromPosition,
  wireAttachmentAtPoint
} from "./netLabelModel";
import { validateNetLabelName } from "./netResolution";
import type { NetLabel, NetLabelAttachment, Point, SchematicDocument } from "./types";

export interface NetLabelToolDragSnapshot {
  id: string;
  original: NetLabelAttachment;
}

export interface NetLabelToolSnapshot {
  draft: string;
  armedName: string | null;
  error: string;
  drag: NetLabelToolDragSnapshot | null;
}

export type NetLabelToolArmResult =
  | { kind: "invalid"; message: string; snapshot: NetLabelToolSnapshot }
  | { kind: "armed"; name: string; snapshot: NetLabelToolSnapshot };

export interface NetLabelPreviewProjection {
  name: string;
  attachment: NetLabelAttachment;
}

export type NetLabelPlacementResult =
  | { kind: "unarmed" }
  | { kind: "invalid-target" }
  | { kind: "ready"; label: NetLabel };

export type NetLabelDragResult =
  | { kind: "ignored" }
  | { kind: "canceled"; labelId: string; attachment: NetLabelAttachment }
  | { kind: "unchanged"; labelId: string }
  | { kind: "changed"; labelId: string; attachment: NetLabelAttachment };

export type NetLabelRenameResult =
  | { kind: "invalid"; message: string }
  | { kind: "unchanged"; name: string }
  | { kind: "changed"; name: string };

export class SchematicNetLabelToolController {
  private draft = "";
  private armedName: string | null = null;
  private error = "";
  private drag: NetLabelToolDragSnapshot | null = null;

  snapshot(): NetLabelToolSnapshot {
    return {
      draft: this.draft,
      armedName: this.armedName,
      error: this.error,
      drag: cloneDragSnapshot(this.drag)
    };
  }

  begin() {
    this.armedName = null;
    this.error = "";
    return this.snapshot();
  }

  cancel() {
    this.armedName = null;
    this.error = "";
    this.drag = null;
    return this.snapshot();
  }

  clearDrag() {
    this.drag = null;
    return this.snapshot();
  }

  updateDraft(value: string) {
    this.draft = value;
    this.error = "";
    if (this.armedName !== value.trim()) this.armedName = null;
    return this.snapshot();
  }

  arm(value: string): NetLabelToolArmResult {
    this.draft = value;
    const validation = validateNetLabelName(value);
    if (!validation.valid) {
      this.armedName = null;
      this.error = validation.message;
      return { kind: "invalid", message: validation.message, snapshot: this.snapshot() };
    }

    this.draft = validation.name;
    this.armedName = validation.name;
    this.error = "";
    return { kind: "armed", name: validation.name, snapshot: this.snapshot() };
  }

  buildPreview(document: SchematicDocument, point: Point | null): NetLabelPreviewProjection | null {
    if (!this.armedName || !point) return null;
    const attachment = wireAttachmentAtPoint(document, point);
    return attachment
      ? { name: this.armedName, attachment: cloneAttachment(attachment) }
      : null;
  }

  preparePlacement(
    document: SchematicDocument,
    point: Point,
    preferredWireId: string | undefined,
    createId: () => string
  ): NetLabelPlacementResult {
    if (!this.armedName) return { kind: "unarmed" };
    const attachment = wireAttachmentAtPoint(document, point, preferredWireId);
    if (!attachment) return { kind: "invalid-target" };
    return {
      kind: "ready",
      label: {
        id: createId(),
        name: this.armedName,
        attachment: cloneAttachment(attachment)
      }
    };
  }

  beginDrag(label: NetLabel) {
    this.drag = {
      id: label.id,
      original: cloneAttachment(label.attachment)
    };
    return this.snapshot();
  }

  finishDrag(document: SchematicDocument, labelId: string, cellPosition: Point): NetLabelDragResult {
    const label = document.netLabels.find((candidate) => candidate.id === labelId);
    const drag = this.drag?.id === labelId ? this.drag : null;
    this.drag = null;
    if (!label || !drag) return { kind: "ignored" };

    const point = netLabelAttachmentPointFromPosition(cellPosition);
    const attachment = wireAttachmentAtPoint(document, point);
    if (!attachment) {
      return {
        kind: "canceled",
        labelId,
        attachment: cloneAttachment(drag.original)
      };
    }
    if (sameAttachment(attachment, drag.original)) {
      return { kind: "unchanged", labelId };
    }
    return {
      kind: "changed",
      labelId,
      attachment: cloneAttachment(attachment)
    };
  }

  rename(label: NetLabel, value: string): NetLabelRenameResult {
    const validation = validateNetLabelName(value);
    if (!validation.valid) return { kind: "invalid", message: validation.message };
    if (label.name === validation.name) return { kind: "unchanged", name: validation.name };
    return { kind: "changed", name: validation.name };
  }
}

function sameAttachment(left: NetLabelAttachment, right: NetLabelAttachment) {
  return left.wireId === right.wireId
    && left.point.x === right.point.x
    && left.point.y === right.point.y;
}

function cloneAttachment(attachment: NetLabelAttachment): NetLabelAttachment {
  return {
    wireId: attachment.wireId,
    point: { ...attachment.point }
  };
}

function cloneDragSnapshot(snapshot: NetLabelToolDragSnapshot | null): NetLabelToolDragSnapshot | null {
  return snapshot
    ? {
        id: snapshot.id,
        original: cloneAttachment(snapshot.original)
      }
    : null;
}
