export function ThermalSetupInstructions() {
  return (
    <>
      <p>
        Configurá la impresión en esta computadora. Se hace una sola vez por
        usuario de Windows.
      </p>
      <a
        href="/downloads/gestion-impresion-windows.zip?v=1.0.5"
        download
        className="inline-block rounded-lg bg-teal-700 px-4 py-2 font-medium text-white"
      >
        Descargar y configurar impresora
      </a>
      <ol className="list-inside list-decimal space-y-1 text-xs text-slate-600">
        <li>
          Conectá la térmica e instalá su driver oficial si todavía falta.
        </li>
        <li>Extraé el ZIP descargado y abrí Instalar.vbs.</li>
        <li>
          Elegí tu térmica y pulsá Configurar. Si ya existe el agente, aceptá
          recuperarlo cuando no se esté imprimiendo.
        </li>
        <li>
          Esperá «Configuración verificada», volvé aquí y pulsá «Comprobar e
          imprimir». Si el navegador solicita acceso local, permitilo para este
          sitio.
        </li>
      </ol>
      <p className="text-xs text-slate-500">
        El agente se inicia con Windows y conserva el historial para evitar
        duplicados. No necesitás instalar Node ni dejar una consola abierta.
      </p>
      <p className="text-xs text-slate-500">
        Windows x64. No incluye drivers del fabricante. El instalador aún no
        tiene firma digital propia; no omitas bloqueos de seguridad de tu
        organización. Si el acceso local está bloqueado en el navegador,
        reinstalar no lo habilita.
      </p>
    </>
  );
}
