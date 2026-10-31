import { request } from "node:https";

// Fixed destination, no redirects or retries. Keep certificate/hostname checks.
// Exclude finite-field DHE: WSFE currently offers parameters rejected by Node.
export function postProductionWsfe(
  body: string,
  action: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = request(
      "https://servicios1.afip.gov.ar/wsfev1/service.asmx",
      {
        method: "POST",
        minVersion: "TLSv1.2",
        ciphers: "ECDHE+AESGCM:ECDHE+CHACHA20",
        rejectUnauthorized: true,
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          "Content-Length": Buffer.byteLength(body),
          SOAPAction: action,
        },
      },
      (response) => {
        // SOAP faults commonly use 500; never follow redirects with credentials.
        if (response.statusCode !== 200 && response.statusCode !== 500) {
          response.destroy();
          clearTimeout(timer);
          reject(new Error("ARCA transport status"));
          return;
        }
        let size = 0;
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 1000000) {
            response.destroy();
            req.destroy(new Error("ARCA transport size"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("error", () => {
          clearTimeout(timer);
          reject(new Error("ARCA transport response"));
        });
        response.on("end", () => {
          clearTimeout(timer);
          resolve(Buffer.concat(chunks).toString("utf8"));
        });
      },
    );
    const timer = setTimeout(
      () => req.destroy(new Error("ARCA transport timeout")),
      20000,
    );
    req.on("error", () => {
      clearTimeout(timer);
      reject(new Error("ARCA transport failure"));
    });
    req.end(body);
  });
}
