import { SetMetadata } from "@nestjs/common";

export const ALLOW_PENDING_PASSWORD_CHANGE = "allowPendingPasswordChange";

/** Rutas que un usuario puede usar mientras debe cambiar su contraseña. */
export const AllowPendingPasswordChange = () =>
  SetMetadata(ALLOW_PENDING_PASSWORD_CHANGE, true);
