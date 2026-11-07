import { SetMetadata } from "@nestjs/common";

export const PLATFORM_VERIFICATION_OPTIONAL = "platformVerificationOptional";

/** Rutas previas al código: consultar el estado, enrolarse y verificarse. */
export const PlatformVerificationOptional = () =>
  SetMetadata(PLATFORM_VERIFICATION_OPTIONAL, true);
