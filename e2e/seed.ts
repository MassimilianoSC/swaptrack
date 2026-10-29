// Facts about the emulator seed the tests rely on (scripts/seed.mjs and scripts/fullSeed.mjs).
// fullSeed reads the ASPs from Firestore, ordered by document id: Centro, Nord, Sud. Hence:
//   piece idx 0 -> Centro, code SNC-000001; idx 1 -> Nord, code SNN-000002; idx 2 -> Sud, code SNS-000003 ...
//   shipments: sh_in_0 within Centro, sh_in_1 within Nord; sh_bt_0 Centro -> Nord, sh_bt_1 Nord -> Sud, sh_bt_2 Sud -> Centro
//   alerts: stale-loc_MAG-CENTRO-01-new, stale-loc_MAG-NORD-01-new, ddt-doc_ddtin_0 (Centro), ddt-doc_ddtin_1 (Nord)
//   anomalies: an_0 Centro, an_1 Nord, an_2 Sud, an_3 Centro ...
//   documents: doc_ddtin_0 Centro, doc_ddtin_1 Nord; doc_bom_0 Centro, doc_bom_1 Nord
// seed.mjs assigns the sites in its own order (Nord, Centro, Sud): SITO-00001 Nord, SITO-00002 Centro, SITO-00003 Sud.
// If the seed changes, this is the only file to update.
export const SEED = {
  centro: {
    orgId: "org_asp_centro",
    itemCode: "SNC-000001",
    itemId: "it_SNC-000001",
    warehouse: "MAG-CENTRO-01",
    site: "SITO-00002",
    shipmentWithin: "sh_in_0",
    transfersWithOthers: ["sh_bt_0", "sh_bt_2"],
    ddtAlertDoc: "doc_ddtin_0",
    anomaly: "an_0",
  },
  nord: {
    orgId: "org_asp_nord",
    itemCode: "SNN-000002",
    itemId: "it_SNN-000002",
    warehouse: "MAG-NORD-01",
    site: "SITO-00001",
    shipmentWithin: "sh_in_1",
    transferNordSud: "sh_bt_1",
    ddtAlertDoc: "doc_ddtin_1",
    staleAlertLocationId: "loc_MAG-NORD-01",
    anomaly: "an_1",
  },
  clientWarehouse: "MAG-CLI-01",
  // Catalog and sorting: the first model of the catalog (by id) is RX-100, a "Radio unit"; the only seeded
  // sorting rule sends radio units to "Ricondizionamento" (cat_refurbish).
  firstModel: { model: "RX-100", equipmentType: "Radio unit" },
  sorting: { radioCategoryId: "cat_refurbish", radioCategoryLabelIt: "Ricondizionamento" },
} as const;
