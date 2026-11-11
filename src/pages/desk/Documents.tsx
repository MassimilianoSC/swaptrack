import * as React from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { useSession } from "@/app/session";
import { watchDocuments, type SwDocument } from "@/lib/data/documents";
import type { Row } from "@/lib/data/db";
import { PageHeader, Badge } from "@/components/ui/card";
import { DataTable } from "@/components/DataTable";
import { Button } from "@/components/ui/button";
import { Loading, ErrorState } from "@/components/states";
import { formatInstant } from "@/lib/utils";
import { useNames } from "@/lib/names";

// §11 Documents list (ddt_in, ddt_return, bom).
export default function Documents() {
  const { t, i18n } = useTranslation();
  const { claims } = useSession();
  const names = useNames();
  const [all, setAll] = React.useState<Row<SwDocument>[] | null>(null);
  const [loadError, setLoadError] = React.useState(false);
  React.useEffect(() => claims?.orgId ? watchDocuments({ role: claims.role!, orgId: claims.orgId }, setAll, () => setLoadError(true)) : undefined, [claims]);
  if (loadError) return <ErrorState message={t("errors.load_failed")} />;
  if (!all) return <Loading />;
  const canCreate = ["client_admin", "asp_admin", "asp_warehouse"].includes(claims?.role ?? "");
  return (
    <div className="space-y-6">
      <PageHeader title={t("nav.documents")} subtitle={t("documents.subtitle")} actions={canCreate ? <Button asChild><Link to="/documents/new" data-testid="documents-new"><Plus className="h-4 w-4" />{t("documents.new")}</Link></Button> : null} />
      <DataTable testId="documents-table" rows={all} rowHref={(r) => `/documents/${r.id}`} columns={[
        { key: "k", header: t("documents.kind"), render: (r) => <Badge>{t(`documents.kinds.${r.kind}`)}</Badge> },
        { key: "n", header: t("documents.number"), value: (r) => r.number, className: "font-mono" },
        { key: "loc", header: t("items.location"), value: (r) => names.place(r.locationId) },
        { key: "v", header: t("documents.version"), value: (r) => r.version },
        { key: "s", header: t("common.status"), render: (r) => <Badge tone={r.status === "open" ? "warning" : r.status === "checked" ? "primary" : "success"}>{t(`documents.statuses.${r.status}`)}</Badge> },
        { key: "a", header: t("shipments.created_at"), value: (r) => formatInstant(r.createdAt?.toDate?.() ?? null, i18n.language) },
        { key: "o", header: "", render: (r) => <Link to={`/documents/${r.id}`} className="text-primary hover:underline" data-testid={`documents-row-${r.id}`}>{t("common.open")}</Link> },
      ]} />
    </div>
  );
}
