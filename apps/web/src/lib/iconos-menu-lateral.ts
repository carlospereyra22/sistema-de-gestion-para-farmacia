import caja from "../assets/iconos/menu-lateral/caja.png";
import catalogoOnline from "../assets/iconos/menu-lateral/catalogo-online.png";
import categoriasYLaboratorios from "../assets/iconos/menu-lateral/categorias-y-laboratorios.png";
import clientes from "../assets/iconos/menu-lateral/clientes.png";
import compras from "../assets/iconos/menu-lateral/compras.png";
import cuentasCorrientes from "../assets/iconos/menu-lateral/cuentas-corrientes.png";
import cuentasPorPagar from "../assets/iconos/menu-lateral/cuentas-por-pagar.png";
import inicio from "../assets/iconos/menu-lateral/inicio.png";
import inventario from "../assets/iconos/menu-lateral/inventario.png";
import listasDePrecios from "../assets/iconos/menu-lateral/listas-de-precios.png";
import ofertas from "../assets/iconos/menu-lateral/ofertas.png";
import organizacion from "../assets/iconos/menu-lateral/organizacion.png";
import productos from "../assets/iconos/menu-lateral/productos.png";
import proveedores from "../assets/iconos/menu-lateral/proveedores.png";
import reportes from "../assets/iconos/menu-lateral/reportes.png";
import rolesYPermisos from "../assets/iconos/menu-lateral/roles-y-permisos.png";
import transferencias from "../assets/iconos/menu-lateral/transferencias.png";
import usuarios from "../assets/iconos/menu-lateral/usuarios.png";
import ventas from "../assets/iconos/menu-lateral/ventas.png";

// Íconos propios del menú lateral (SISTEMA-110). Las imágenes están en
// src/assets/iconos/menu-lateral (ver el README de src/assets/iconos). Se
// dibujan con IconoImagen (icono-imagen.tsx).
export const ICONOS_MENU_LATERAL = {
  Inicio: inicio,
  Ventas: ventas,
  "Catálogo online": catalogoOnline,
  Productos: productos,
  "Categorías y laboratorios": categoriasYLaboratorios,
  "Listas de precios": listasDePrecios,
  Ofertas: ofertas,
  Inventario: inventario,
  Caja: caja,
  Compras: compras,
  Transferencias: transferencias,
  Reportes: reportes,
  Clientes: clientes,
  "Cuentas corrientes": cuentasCorrientes,
  "Cuentas por pagar": cuentasPorPagar,
  Proveedores: proveedores,
  // Administración
  Usuarios: usuarios,
  "Roles y permisos": rolesYPermisos,
  Organización: organizacion,
} as const;

// PRUEBA LOCAL de íconos a color (SISTEMA-110): las imágenes están en
// public/iconos-prueba, que git ignora en esta PC. Sólo en desarrollo: en
// producción siempre se usan los de arriba. Borrar cuando se decida.
const PRUEBA_COLOR = {
  Inicio: "inicio",
  Ventas: "ventas",
  "Catálogo online": "catalogo-online",
  Productos: "productos",
  "Categorías y laboratorios": "categorias-y-laboratorios",
  "Listas de precios": "listas-de-precios",
  Ofertas: "ofertas",
  Inventario: "inventario",
  Caja: "caja",
  Compras: "compras",
  Transferencias: "transferencias",
  Reportes: "reportes",
  Clientes: "clientes",
  "Cuentas corrientes": "cuentas-corrientes",
  "Cuentas por pagar": "cuentas-por-pagar",
  Proveedores: "proveedores",
} as const;

// Apagada: se volvió a los íconos de línea. Poner en true para verlos a color.
const USAR_PRUEBA_COLOR = false;

export const ICONOS_COLOR_PRUEBA: Partial<Record<string, string>> =
  USAR_PRUEBA_COLOR && import.meta.env.DEV
    ? Object.fromEntries(
        Object.entries(PRUEBA_COLOR).flatMap(([seccion, archivo]) =>
          archivo ? [[seccion, `/iconos-prueba/${archivo}.png`]] : [],
        ),
      )
    : {};
