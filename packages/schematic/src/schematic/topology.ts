import { buildConnectivity, type ConnectivityResult } from "./connectivity";
import { resolveSchematicNets, type NetResolution } from "./netResolution";
import type { Point, SchematicContent } from "./types";

export interface SchematicDerivedTopology {
  connectivity: ConnectivityResult;
  netResolution: NetResolution;
  junctions: Point[];
  presentationJunctions: Point[];
}

/** Computes all electrical topology without changing durable schematic content. */
export function deriveSchematicTopology(content: SchematicContent): SchematicDerivedTopology {
  const connectivity = buildConnectivity(content);
  const netResolution = resolveSchematicNets(content, connectivity);
  return {
    connectivity,
    netResolution,
    junctions: connectivity.junctions.map((point) => ({ ...point })),
    presentationJunctions: connectivity.presentationJunctions.map((point) => ({ ...point }))
  };
}
