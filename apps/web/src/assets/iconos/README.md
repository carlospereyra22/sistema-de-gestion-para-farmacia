# Íconos propios del sistema

Imágenes de íconos hechas para el sistema (SISTEMA-110). Una carpeta por lugar
donde se usan:

- `menu-lateral/`: menú lateral de la gestión. Se conectan en
  `src/lib/iconos-menu-lateral.ts`.
- `organizacion/`: pestañas de Organización (datos generales, facturación,
  sucursales, tickets y comprobantes). Se conectan en
  `src/lib/iconos-organizacion.ts`.

## Cómo agregar o cambiar uno

1. PNG cuadrado, fondo transparente, de 64 × 64 px, con el dibujo en un solo
   color (el color no importa: se pinta con el del menú).
2. Nombre en minúsculas, sin tildes y con guiones, igual que la sección:
   `cuentas-por-pagar.png`, `listas-de-precios.png`.
3. Guardarlo en la carpeta del lugar donde va y, si es nuevo, sumarlo al mapa de
   `src/lib/iconos-menu-lateral.ts`.

Todas las secciones tienen imagen propia (Pedidos y Preventa desde SISTEMA-119). Administración (usuarios, roles y permisos, organización) también usa estas imágenes.
