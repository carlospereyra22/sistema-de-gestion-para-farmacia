import { ValidationPipe } from "@nestjs/common";
import { NewPayableDto, PayableQueryDto } from "./supplier-payables.dto";
import { randomUUID } from "node:crypto";
const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});
it("validates invoice request identifiers and monetary strings at the HTTP boundary", async () => {
  const input = {
    operationId: randomUUID(),
    supplierId: randomUUID(),
    documentType: "FACTURA_A",
    pointOfSale: "3",
    documentNumber: "001",
    issuedOn: "2026-10-20",
    amountMinor: "50000000",
    dues: [{ dueOn: null, amountMinor: "50000000" }],
  };
  await expect(
    pipe.transform(input, { type: "body", metatype: NewPayableDto }),
  ).resolves.toBeInstanceOf(NewPayableDto);
  for (const change of [
    { operationId: "bad" },
    { amountMinor: 50000000 },
    { documentType: "REMITO" },
    { dues: [] },
    { amountMinor: "0.2" },
    { stock: 200 },
  ])
    await expect(
      pipe.transform(
        { ...input, ...change },
        { type: "body", metatype: NewPayableDto },
      ),
    ).rejects.toThrow();
});
it("rejects malformed filters instead of crashing string operations", async () => {
  await expect(
    pipe.transform(
      { search: ["one", "two"] },
      { type: "query", metatype: PayableQueryDto },
    ),
  ).rejects.toThrow();
  await expect(
    pipe.transform(
      { page: "-1" },
      { type: "query", metatype: PayableQueryDto },
    ),
  ).rejects.toThrow();
  await expect(
    pipe.transform(
      { due: "UNKNOWN" },
      { type: "query", metatype: PayableQueryDto },
    ),
  ).rejects.toThrow();
});
