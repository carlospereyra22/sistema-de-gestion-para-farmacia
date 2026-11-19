import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { CalculadoraInfantil } from "./calculadora-infantil";

const dipirona = {
  mgKgToma: [8, 16] as [number, number],
  tomasPorDia: 4,
  cadaHoras: "6-8",
  maxMgToma: 500,
  desde: "3 meses y 5 kg",
  nota: "Para la fiebre suele alcanzar 10 mg/kg por toma.",
};

it("con el peso muestra los ml por toma y el máximo del día", () => {
  const html = renderToStaticMarkup(
    <CalculadoraInfantil dosis={dipirona} mgPorMl={50} pesoInicial="15" />,
  );
  expect(html).toContain("2,4-4,8 ml cada 6-8 h");
  expect(html).toContain("(120-240 mg)");
  expect(html).toContain("Máximo por día: 19,2 ml (960 mg)");
  expect(html).toContain("Para la fiebre suele alcanzar 10 mg/kg");
});

it("sin concentración pide cargarla y da los mg", () => {
  const html = renderToStaticMarkup(
    <CalculadoraInfantil dosis={dipirona} mgPorMl={null} pesoInicial="15" />,
  );
  expect(html).toContain("120-240 mg cada 6-8 h");
  expect(html).toContain("cargá la concentración del producto");
});

it("con 40 kg o más remite a la dosis de adultos", () => {
  const html = renderToStaticMarkup(
    <CalculadoraInfantil dosis={dipirona} mgPorMl={50} pesoInicial="45" />,
  );
  expect(html).toContain("se usa la dosis de adultos");
});
