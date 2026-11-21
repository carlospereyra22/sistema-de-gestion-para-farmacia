import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { IconoImagen } from "./icono-imagen";
import { ICONOS_MENU_LATERAL } from "./lib/iconos-menu-lateral";

it("pinta la imagen con el color del texto, como máscara", () => {
  const html = renderToStaticMarkup(
    <IconoImagen url="/caja.png" className="size-5" />,
  );
  expect(html).toContain('aria-hidden="true"');
  expect(html).toContain("bg-current");
  expect(html).toContain("size-5");
  expect(html).toContain("mask-image:url(&quot;/caja.png&quot;)");
});

it("el menú lateral tiene un ícono propio por sección", () => {
  expect(Object.keys(ICONOS_MENU_LATERAL)).toEqual([
    "Inicio",
    "Ventas",
    "Catálogo online",
    "Productos",
    "Categorías y laboratorios",
    "Listas de precios",
    "Ofertas",
    "Inventario",
    "Caja",
    "Compras",
    "Transferencias",
    "Reportes",
    "Clientes",
    "Cuentas corrientes",
    "Cuentas por pagar",
    "Proveedores",
    "Usuarios",
    "Roles y permisos",
    "Organización",
  ]);
  for (const url of Object.values(ICONOS_MENU_LATERAL))
    expect(url).toMatch(/\.png$|^data:image\/png/);
});
