-- Los términos amplios agotaban el tiempo de espera del sitio.
-- Las tres búsquedas acotadas fueron comprobadas con sus presentaciones y páginas.
UPDATE "MedicineCatalogItem"
SET "referenceUrl" = 'https://preciosderemedios.com.ar/result/?busqueda=Acidos+grasos+omega+3+al+90%25&combo=Acidos+grasos+omega+3+al+90%25'
WHERE "priceSource" = 'preciosderemedios'
  AND "referenceUrl" = 'https://preciosderemedios.com.ar/result/?busqueda=acido&combo=Acidos+grasos+omega+3+al+90%25';

UPDATE "MedicineCatalogItem"
SET "referenceUrl" = 'https://preciosderemedios.com.ar/result/?busqueda=Alfa+hidroxi%C3%A1cidos&combo=Alfa+hidroxi%C3%A1cidos'
WHERE "priceSource" = 'preciosderemedios'
  AND "referenceUrl" = 'https://preciosderemedios.com.ar/result/?busqueda=acido&combo=Alfa+hidroxi%C3%A1cidos';

UPDATE "MedicineCatalogItem"
SET "referenceUrl" = 'https://preciosderemedios.com.ar/result/?busqueda=vitamina+c&combo=Asc%C3%B3rbico+%C3%A1cido'
WHERE "priceSource" = 'preciosderemedios'
  AND "referenceUrl" = 'https://preciosderemedios.com.ar/result/?busqueda=vita&combo=Asc%C3%B3rbico+%C3%A1cido';
