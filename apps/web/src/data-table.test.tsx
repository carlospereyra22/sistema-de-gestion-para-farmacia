import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  CellText,
  DataTable,
  DataTableCell,
  DataTableEmpty,
  DataTableRow,
  RowIconAction,
  StatusLabel,
} from "./data-table";

describe("tabla compartida", () => {
  it("explica una columna con un ícono y su globo", () => {
    const html = renderToStaticMarkup(
      <DataTable
        label="Productos"
        columns={[
          {
            label: "Stock",
            align: "right",
            hint: { title: "Qué incluye", text: "Unidades para vender." },
          },
        ]}
      >
        {null}
      </DataTable>,
    );
    expect(html).toContain('aria-label="Qué incluye"');
    expect(html).toContain('role="tooltip"');
    expect(html).toContain("Unidades para vender.");
    expect(html).toContain("normal-case");
  });

  it("usa encabezado de 12 px, números alineados y una sola tipografía", () => {
    const html = renderToStaticMarkup(
      <DataTable
        label="Productos"
        columns={[{ label: "Producto" }, { label: "Público", align: "right" }]}
        footer={<nav>Páginas</nav>}
      >
        <DataTableRow>
          <DataTableCell>
            <CellText primary="ACTRON" secondary="400 mg x 20" />
          </DataTableCell>
          <DataTableCell align="right" numeric>
            $ 8.275,00
          </DataTableCell>
        </DataTableRow>
      </DataTable>,
    );
    expect(html).toContain('aria-label="Productos"');
    expect(html).toMatch(/<thead class="[^"]*text-xs[^"]*uppercase/);
    expect(html).toMatch(
      /<th scope="col" class="[^"]*text-right[^"]*">Público/,
    );
    expect(html).toMatch(/<td class="[^"]*text-right[^"]*tabular-nums/);
    expect(html).toContain("400 mg x 20");
    expect(html).not.toContain("font-mono");
    expect(html).not.toMatch(/text-\[10px\]/);
    expect(html.indexOf("Páginas")).toBeGreaterThan(html.indexOf("</table>"));
  });

  it("omite la línea secundaria vacía y muestra el estado con punto y texto", () => {
    const html = renderToStaticMarkup(
      <>
        <CellText primary="Sin presentación" />
        <StatusLabel tone="danger">Sin stock</StatusLabel>
      </>,
    );
    expect(html.match(/<span/g)).toHaveLength(3);
    expect(html).toContain("bg-rose-500");
    expect(html).toContain("Sin stock");
  });

  it("los botones de acción son íconos con nombre accesible y tooltip", () => {
    const html = renderToStaticMarkup(
      <RowIconAction
        tone="danger"
        label="Eliminar ACTRON"
        title="Eliminar definitivamente"
        onClick={() => undefined}
      >
        <svg />
      </RowIconAction>,
    );
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-label="Eliminar ACTRON"');
    expect(html).toContain('title="Eliminar definitivamente"');
    expect(html).toContain("bg-rose-50");
  });

  it("ocupa todas las columnas en la fila vacía", () => {
    const html = renderToStaticMarkup(
      <table>
        <tbody>
          <DataTableEmpty colSpan={9}>No hay productos.</DataTableEmpty>
        </tbody>
      </table>,
    );
    expect(html).toContain('colSpan="9"');
  });
});
