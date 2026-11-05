// The invented names and codes of the demo seed (SPEC §18), in one place: scripts/seed.mjs writes them, and
// scripts/demoDocs.mjs (P-124) prints documents that use them, so the two never drift apart. No I/O here.
export const ORGS = [
  { id: "org_client", name: "Telco Demo", type: "client", slug: "telco" },
  { id: "org_asp_nord", name: "ASP Nord", type: "asp", slug: "nord" },
  { id: "org_asp_centro", name: "ASP Centro", type: "asp", slug: "centro" },
  { id: "org_asp_sud", name: "ASP Sud", type: "asp", slug: "sud" },
];
export const REGIONS = { nord: ["Lombardia", "Piemonte", "Veneto"], centro: ["Toscana", "Lazio", "Marche"], sud: ["Campania", "Puglia", "Sicilia"] };
export const MANUFACTURERS = ["Nordwave", "Altira Systems", "Kestrel Networks", "Volta Telecom"];
export const TYPES = ["Radio unit", "Baseband", "Power supply", "Transmission card", "Antenna module"];
export const SITE_COUNT = 1500;

export const CLIENT_WAREHOUSE = { code: "MAG-CLI-01", name: "Magazzino centrale Telco Demo", type: "client_warehouse", aspId: null, address: "Via dei Ricambi 1, Bologna", region: "Emilia-Romagna" };

const asps = () => ORGS.filter((o) => o.type === "asp");

// Two warehouses per ASP: MAG-NORD-01, MAG-NORD-02...
export function aspWarehouses() {
  return asps().flatMap((a) => [1, 2].map((n) => ({
    code: `MAG-${a.slug.toUpperCase()}-0${n}`, name: `Magazzino ${a.name} ${n}`, type: "asp_warehouse", aspId: a.id, address: `Via Logistica ${n}`, region: REGIONS[a.slug][n - 1],
  })));
}

// Site i (1..SITE_COUNT): SITO-00001 belongs to the first ASP, SITO-00002 to the second, and so on.
export function site(i) {
  const a = asps()[(i - 1) % 3];
  const region = REGIONS[a.slug][i % 3];
  return { code: `SITO-${String(i).padStart(5, "0")}`, name: `Stazione ${region} ${i}`, type: "site", aspId: a.id, address: `Località ${i}`, region };
}

// Sites that get no BOM of the full seed: the site of the demo (scripts/demoDocs.mjs, COPIONE_DEMO tappa 4) and the
// sites where e2e tests save their own BOM (e2e/doc-serials.phone.spec.ts). Two open BOMs at the same version on one
// site are picked by document order, so a seeded one would take the place of the demo's.
export const SITES_WITHOUT_SEEDED_BOM = ["SITO-00013", "SITO-00022", "SITO-00025"];
// The site of the i-th seeded BOM of an ASP (fullSeed.mjs), from the sites of that ASP in the order of their ids.
export const bomSite = (sitesOfAsp, i) => sitesOfAsp.filter((s) => !SITES_WITHOUT_SEEDED_BOM.includes(s.code))[i];

// The 20 models of the catalog: material codes MC400100, MC400107, ...
export function seedModels() {
  return Array.from({ length: 20 }, (_, i) => ({
    materialCode: `MC${String(400100 + i * 7)}`, model: `${["RX", "BB", "PSU", "TRX", "AM"][i % 5]}-${100 + i}`, manufacturer: MANUFACTURERS[i % 4], equipmentType: TYPES[i % 5],
  }));
}
