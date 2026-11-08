import {
  IsEmail,
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

/** Clave de esta PC para firmar ventas sin conexión (SISTEMA-66). */
export class OfflineKeyDto {
  @IsUUID()
  deviceId!: string;

  @IsString()
  @MinLength(80)
  @MaxLength(500)
  publicKey!: string;
}
