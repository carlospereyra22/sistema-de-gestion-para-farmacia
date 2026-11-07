import { useCallback, useEffect, useState } from "react";
import { PlatformApiError } from "./platform-api";

/** Carga datos del panel y vuelve a pedir el código si la verificación venció. */
export function usePlatformData<T>(
  load: () => Promise<T>,
  onVerificationExpired: () => void,
) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    load()
      .then((value) => {
        if (!active) return;
        setData(value);
        setError("");
      })
      .catch((cause: unknown) => {
        if (!active) return;
        if (
          cause instanceof PlatformApiError &&
          cause.code === "PLATFORM_VERIFICATION_REQUIRED"
        )
          onVerificationExpired();
        else
          setError(
            cause instanceof Error ? cause.message : "No se pudo cargar.",
          );
      });
    return () => {
      active = false;
    };
  }, [load, onVerificationExpired, revision]);
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  return { data, error, reload };
}
