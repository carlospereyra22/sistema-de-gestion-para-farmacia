import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(12)
  password!: string;

  /** Id de esta PC (idDeEstaPc), para reconocer la sesión (SISTEMA-93). */
  @IsOptional()
  @IsUUID()
  deviceId?: string;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  currentPassword!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(256)
  newPassword!: string;
}

/**
 * Renovación de la sesión (SISTEMA-92): la pestaña manda con qué usuario
 * empezó. Si la cookie del navegador ya es de otro, la API no le entrega su
 * token. Sin el campo se comporta como antes (arranque y clientes viejos).
 */
export class RefreshDto {
  @IsOptional()
  @IsUUID()
  usuarioEsperado?: string;

  /** Id de esta PC, para reconocer la sesión (SISTEMA-93). */
  @IsOptional()
  @IsUUID()
  deviceId?: string;

  /**
   * Qué cookie renovar (SISTEMA-100): "plataforma" usa la del superadmin.
   * Sin el campo, la de la farmacia, como siempre.
   */
  @IsOptional()
  @IsIn(["plataforma"])
  sesion?: "plataforma";
}

/** Cerrar sesión: qué cookie (SISTEMA-100). Sin el campo, la de la farmacia. */
export class LogoutDto {
  @IsOptional()
  @IsIn(["plataforma"])
  sesion?: "plataforma";
}

/** Clave de esta PC para firmar ventas sin conexión (SISTEMA-66). */
export class OfflineKeyDto {
  @IsUUID()
  deviceId!: string;

  @IsString()
  @MinLength(80)
  @MaxLength(500)
  publicKey!: string;
}
