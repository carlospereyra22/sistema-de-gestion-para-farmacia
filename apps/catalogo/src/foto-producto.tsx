import { useState } from "react";

import { imagenDeProducto } from "./lib/api";
import { iniciales } from "./lib/carrito";

/**
 * Foto del producto. Sin foto (o si no carga), un recuadro suave con las
 * iniciales del producto: se ve prolijo aunque la farmacia no cargue fotos.
 */
export function FotoProducto({
  slug,
  productId,
  name,
  hasImage,
  version,
  className,
  chica = false,
}: {
  slug: string;
  productId: string;
  name: string;
  hasImage: boolean;
  version?: string | null;
  className: string;
  chica?: boolean;
}) {
  const [rota, setRota] = useState(false);
  if (!hasImage || rota)
    return (
      <div
        aria-hidden
        className={`${className} flex items-center justify-center bg-gradient-to-br from-teal-50 via-white to-slate-100`}
      >
        <span
          className={`font-semibold tracking-tight text-teal-700/40 ${
            chica ? "text-lg" : "text-4xl sm:text-5xl"
          }`}
        >
          {iniciales(name)}
        </span>
      </div>
    );
  return (
    <div className={`${className} bg-white`}>
      <img
        src={imagenDeProducto(slug, productId, version)}
        alt=""
        loading="lazy"
        onError={() => setRota(true)}
        className={`size-full object-contain ${chica ? "p-1" : "p-3"}`}
      />
    </div>
  );
}
