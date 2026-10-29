// Deterministic alert ids (SPEC §11.4). One alert per object, not per piece.
export const alertId = {
  stale: (locationId: string, flow: "new" | "removed") => `stale-${locationId}-${flow}`,
  bom: (documentId: string) => `bom-${documentId}`,
  ddt: (documentId: string) => `ddt-${documentId}`,
  transfer: (shipmentId: string) => `transfer-${shipmentId}`,
  returnShipment: (shipmentId: string) => `return-${shipmentId}`,
};
