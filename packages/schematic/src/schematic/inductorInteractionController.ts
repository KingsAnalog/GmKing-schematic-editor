import { addInductorCoupling, documentInductorCouplings, findInductorCoupling, resetInductorCouplingCoefficient, setInductorCouplingColor, updateInductorCoupling as updateInductorCouplingModel } from "./inductorCouplingModel";
import { setInductorDotTerminal, setInductorTap, type InductorDotTerminal, type InductorTap } from "./inductorModel";
import type { ComponentInstance, SchematicDocument } from "./types";
import type { PointerClickTarget } from "./pointerClickRoutingModel";
import type { SchematicPropertyPanelControllerCallbacks } from "./propertyPanelController";

/** Owns inductor property changes and the two-click coupling interaction. */
export class SchematicInductorInteractionController {
  pendingSourceId: string | null = null;
  constructor(private readonly options: {
    document: SchematicDocument;
    selectedComponent(): ComponentInstance | undefined | null;
    selectedComponents(): ComponentInstance[];
    select(id: string, refresh: boolean): void;
    renderDocument(): void;
    renderCouplings(): void;
    renderEndpoints(id: string): void;
    commit(): void;
    status(message: string): void;
    focus(): void;
    refreshUi(): void;
    createId(): string;
  }) {}
  cancel() { this.pendingSourceId = null; }
  callbacks(): SchematicPropertyPanelControllerCallbacks {
    return {
      onComponentInductorTapChange: (tap) => this.setSelectedInductorTap(tap),
      onComponentInductorDotChange: (terminal) => this.setSelectedInductorDot(terminal),
      onInductorCouplingSelect: (couplingId) => this.selectInductorCoupling(couplingId),
      onInductorCouplingAdd: () => this.beginSelectedInductorCouplingPick(),
      onInductorCouplingCreate: () => this.createSelectedInductorCoupling(),
      onInductorCouplingCoefficientChange: (couplingId, value) =>
        this.changeInductorCoupling(couplingId, { coefficient: value, coefficientAuto: false }, "Updated coupling parameter."),
      onInductorCouplingAutoName: (couplingId) => this.autoNameInductorCoupling(couplingId),
      onInductorCouplingLabelModeChange: (couplingId, labelMode) =>
        this.changeInductorCoupling(couplingId, { labelMode }, "Updated coupling label."),
      onInductorCouplingShowLabelChange: (couplingId, showLabel) =>
        this.changeInductorCoupling(couplingId, { showLabel }, showLabel ? "Coupling label shown." : "Coupling label hidden."),
      onInductorCouplingShowArcChange: (couplingId, showArc) =>
        this.changeInductorCoupling(couplingId, { showArc }, showArc ? "Coupling arc shown." : "Coupling arc hidden."),
      onInductorCouplingShowCoreChange: (couplingId, showCore) =>
        this.changeInductorCoupling(couplingId, { showCore }, showCore ? "Magnetic core shown." : "Magnetic core hidden."),
      onInductorCouplingFlip: (couplingId) => this.flipInductorCoupling(couplingId),
      onInductorCouplingColorChange: (couplingId, color) => this.changeInductorCouplingColor(couplingId, color)
    };
  }
  setSelectedInductorTap(tap: InductorTap) {
    const component = this.options.selectedComponent();
    if (!component || !setInductorTap(component, tap)) return;
    this.options.renderDocument();
    this.options.commit();
    this.options.status(tap === "none" ? "Removed inductor center tap."
      : `Placed 1:1 center tap on the ${tap} side.`);
  }

  setSelectedInductorDot(terminal: InductorDotTerminal) {
    const component = this.options.selectedComponent();
    if (!component || !setInductorDotTerminal(component, terminal)) return;
    this.options.renderDocument();
    this.options.commit();
    this.options.status(terminal === "none" ? "Removed inductor dot." : `Marked inductor terminal ${terminal.toUpperCase()}.`);
  }

  selectInductorCoupling(couplingId: string) {
    if (!documentInductorCouplings(this.options.document).some((coupling) => coupling.id === couplingId)) return;
    this.options.select(couplingId, true);
  }

  beginSelectedInductorCouplingPick() {
    const component = this.options.selectedComponent();
    if (!component || component.type !== "inductor") return;
    const hasPartner = this.options.document.components.some((candidate) =>
      candidate.type === "inductor"
      && candidate.id !== component.id
      && !candidate.temporarilyDeleted
      && !findInductorCoupling(this.options.document, component.id, candidate.id)
    );
    if (!hasPartner) {
      this.options.status("No uncoupled inductor is available.");
      return;
    }
    this.pendingSourceId = component.id;
    this.options.focus();
    this.options.status(`Couple ${component.ref}: click another inductor; Esc cancels.`);
  }

  createSelectedInductorCoupling() {
    const inductors = this.options.selectedComponents().filter((component) => component.type === "inductor");
    if (inductors.length !== 2) return;
    this.createInductorCoupling(inductors[0].id, inductors[1].id);
  }

  createInductorCoupling(firstId: string, secondId: string) {
    const beforeCount = documentInductorCouplings(this.options.document).length;
    const coupling = addInductorCoupling(this.options.document, firstId, secondId, this.options.createId());
    if (!coupling || documentInductorCouplings(this.options.document).length === beforeCount) {
      this.options.status("These inductors are already coupled.");
      return false;
    }
    this.options.select(coupling.id, false);
    this.options.renderDocument();
    this.options.commit();
    this.options.status(`Coupled ${coupling.coefficient}.`);
    return true;
  }

  applyInductorCouplingPartnerPick(target: PointerClickTarget) {
    const sourceId = this.pendingSourceId;
    if (!sourceId) return;
    const source = this.options.document.components.find((component) =>
      component.id === sourceId && component.type === "inductor" && !component.temporarilyDeleted
    );
    if (!source) {
      this.pendingSourceId = null;
      this.options.status("The source inductor is no longer available.");
      return;
    }
    const targetId = target.kind === "component"
      ? target.id
      : target.kind === "pin"
        ? target.componentId
        : null;
    const partner = targetId
      ? this.options.document.components.find((component) => component.id === targetId)
      : null;
    if (!partner || partner.type !== "inductor" || partner.temporarilyDeleted) {
      this.options.status(`Couple ${source.ref}: click another inductor; Esc cancels.`);
      return;
    }
    if (partner.id === source.id) {
      this.options.status("Choose a different inductor.");
      return;
    }
    if (findInductorCoupling(this.options.document, source.id, partner.id)) {
      this.options.status("These inductors are already coupled. Choose another inductor or press Esc.");
      return;
    }
    if (this.createInductorCoupling(source.id, partner.id)) {
      this.pendingSourceId = null;
      this.options.refreshUi();
    }
  }

  autoNameInductorCoupling(couplingId: string) {
    if (!resetInductorCouplingCoefficient(this.options.document, couplingId)) return;
    this.options.renderCouplings();
    this.options.commit();
    this.options.status("Restored automatic coupling parameter name.");
  }

  changeInductorCoupling(
    couplingId: string,
    patch: Parameters<typeof updateInductorCouplingModel>[2],
    status: string
  ) {
    if (!updateInductorCouplingModel(this.options.document, couplingId, patch)) return;
    this.options.renderCouplings();
    this.options.renderEndpoints(couplingId);
    this.options.commit();
    this.options.status(status);
  }

  flipInductorCoupling(couplingId: string) {
    const coupling = documentInductorCouplings(this.options.document).find((candidate) => candidate.id === couplingId);
    if (!coupling) return;
    this.changeInductorCoupling(
      couplingId,
      { arcFlipped: !coupling.arcFlipped },
      "Flipped coupling arc."
    );
  }

  changeInductorCouplingColor(couplingId: string, color: string | null) {
    if (!setInductorCouplingColor(this.options.document, couplingId, color)) return;
    this.options.renderCouplings();
    this.options.commit();
    this.options.status(color ? "Changed coupling color." : "Restored default coupling color.");
  }
}
