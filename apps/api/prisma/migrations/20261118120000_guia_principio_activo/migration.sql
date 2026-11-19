-- Guía por principio activo (SISTEMA-108): acción terapéutica y vía del padrón
-- oficial; uso y dosis habitual orientativos generados con IA.
CREATE TABLE "MedicineActiveGuide" (
    "id" UUID NOT NULL,
    "activeKey" VARCHAR(200) NOT NULL,
    "activeIngredient" TEXT NOT NULL,
    "therapeuticAction" TEXT NOT NULL DEFAULT '',
    "route" TEXT NOT NULL DEFAULT '',
    "usage" TEXT NOT NULL DEFAULT '',
    "dosage" TEXT NOT NULL DEFAULT '',
    "dosageSource" VARCHAR(20) NOT NULL DEFAULT '',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "MedicineActiveGuide_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MedicineActiveGuide_activeKey_key" ON "MedicineActiveGuide"("activeKey");
