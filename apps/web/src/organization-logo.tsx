import { useEffect, useMemo, useState } from "react";
import { getTicketHeader } from "./lib/api";
import { logoPreview } from "./lib/ticket-logo";
import { applyOrganizationFavicon } from "./lib/organization-favicon";

export function OrganizationLogo({
  token,
  organizationId,
  revision,
}: {
  token?: string;
  organizationId?: string;
  revision: number;
}) {
  const [logo, setLogo] = useState<{
    organizationId: string;
    raster?: string;
  }>();
  useEffect(() => {
    if (!token || !organizationId) return;
    let active = true;
    void getTicketHeader(token, organizationId)
      .then((data) => {
        if (active) setLogo({ organizationId, raster: data.logoRaster });
      })
      .catch(() => {
        /* The default logo remains available if settings cannot load. */
      });
    return () => {
      active = false;
    };
  }, [token, organizationId, revision]);
  const raster =
    logo?.organizationId === organizationId ? logo?.raster : undefined;
  const src = useMemo(() => logoPreview(raster), [raster]);
  useEffect(() => applyOrganizationFavicon(src), [src]);
  return (
    <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
      <img
        src={src}
        alt="Logo de la organización"
        className="size-full object-contain"
      />
    </span>
  );
}
