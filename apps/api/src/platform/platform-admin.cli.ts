import { hash } from "@node-rs/argon2";
import { PrismaClient } from "@prisma/client";

import {
  createPlatformAdmin,
  listPlatformAdmins,
  PlatformCommandError,
  resetPlatformCode,
  revokePlatformAdmin,
} from "./platform-admin.commands";

// Comando de servidor para las cuentas de plataforma. La clave entra por stdin: un
// argumento o una variable quedarían a la vista en la lista de procesos y en los logs.
const USO =
  "Uso: plataforma <crear <correo> | revocar <correo> | resetear-codigo <correo> | listar>";

async function readPassword(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  const password = Buffer.concat(chunks)
    .toString("utf8")
    .replace(/\r?\n$/, "");
  if (password.length < 16 || password.length > 256)
    throw new PlatformCommandError(
      "La clave tiene que tener de 16 a 256 caracteres.",
    );
  return password;
}

async function main(): Promise<void> {
  const [command, email] = process.argv.slice(2);
  if (!command || (command !== "listar" && !email))
    throw new PlatformCommandError(USO);
  const prisma = new PrismaClient({ log: [] });
  try {
    switch (command) {
      case "crear":
        await createPlatformAdmin(
          prisma,
          email!,
          await hash(await readPassword()),
        );
        console.log(
          "Cuenta creada. Al entrar va a tener que configurar su código.",
        );
        break;
      case "revocar":
        await revokePlatformAdmin(prisma, email!);
        console.log("Acceso revocado y sesiones cerradas.");
        break;
      case "resetear-codigo":
        await resetPlatformCode(prisma, email!);
        console.log(
          "Código reseteado. Al entrar va a tener que configurarlo otra vez.",
        );
        break;
      case "listar":
        for (const admin of await listPlatformAdmins(prisma))
          console.log(
            `${admin.user.email} | ${admin.active ? "activa" : "revocada"} | ${admin.totpConfirmedAt ? "con código" : "sin código"}`,
          );
        break;
      default:
        throw new PlatformCommandError(USO);
    }
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  // Nunca se imprime el error completo: puede contener datos de la consulta.
  console.error(
    error instanceof PlatformCommandError
      ? error.message
      : "No se completó el comando. Verificá la conexión y las migraciones.",
  );
  process.exitCode = 1;
});
