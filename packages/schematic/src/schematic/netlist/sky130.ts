import type { ProcessProfile } from "./model";

export const SKY130_PROFILE: ProcessProfile = {
  id: "sky130",
  label: "SkyWater SKY130",
  devices: {
    nmos: {
      master: "sky130_fd_pr__nfet_01v8",
      terminals: ["d", "g", "s", "b"],
      params: { w: "w", l: "l", m: "m", nf: "nf" },
      required: ["w", "l"]
    },
    pmos: {
      master: "sky130_fd_pr__pfet_01v8",
      terminals: ["d", "g", "s", "b"],
      params: { w: "w", l: "l", m: "m", nf: "nf" },
      required: ["w", "l"]
    }
  }
};

export const PROCESS_PROFILES = { sky130: SKY130_PROFILE } as const;
