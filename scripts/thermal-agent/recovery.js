function createRecovery({ probe, launch, log }) {
  let child = null,
    failures = 0,
    checking = false,
    stopped = false;
  return {
    async check() {
      if (checking || stopped) return;
      checking = true;
      try {
        const healthy = await probe();
        if (stopped) return;
        if (healthy) {
          failures = 0;
          return;
        }
        if (!child) {
          child = launch();
          child.on("error", (error) =>
            log(`No se pudo iniciar: ${error.message}`),
          );
          child.on("exit", () => {
            child = null;
            failures = 0;
            log("Componente detenido; se recuperara sin reenviar trabajos.");
          });
          return;
        }
        if (++failures >= 3) {
          log("Sin respuesta; reiniciando solo el proceso administrado.");
          child.kill();
          failures = 0;
        }
      } finally {
        checking = false;
      }
    },
    stop() {
      stopped = true;
      if (child) child.kill();
    },
  };
}
module.exports = { createRecovery };
