/**
 * Etiqueta de lo hecho sin conexión que todavía no llegó al servidor
 * (SISTEMA-79: productos y lotes; mismo estilo que cuentas y compras).
 */
export function PorEnviar() {
  return (
    <span className="ml-2 inline-block shrink-0 whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 align-middle text-[11px] font-semibold text-amber-800">
      Por enviar
    </span>
  );
}
