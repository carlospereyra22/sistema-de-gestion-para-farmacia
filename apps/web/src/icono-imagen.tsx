// Ícono de imagen que se pinta con el color del texto (currentColor), como
// máscara: gris en el menú, verde en la sección activa y claro en modo oscuro
// (SISTEMA-110).
export function IconoImagen({
  url,
  className = "",
}: {
  url: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      data-icono-imagen=""
      className={`inline-block shrink-0 bg-current ${className}`}
      style={{
        maskImage: `url("${url}")`,
        WebkitMaskImage: `url("${url}")`,
        maskSize: "contain",
        WebkitMaskSize: "contain",
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskPosition: "center",
      }}
    />
  );
}
