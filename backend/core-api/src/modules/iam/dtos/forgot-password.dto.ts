import { IsEmail, IsString, MinLength, IsOptional } from "class-validator"

export class ForgotPasswordDto {
  @IsEmail()
  email!: string
}

export class ResetPasswordDto {
  @IsEmail()
  email!: string

  @IsString()
  token!: string

  @IsString()
  @MinLength(8)
  password!: string
}

export class ChangePasswordDto {
  @IsString()
  oldPassword!: string

  @IsString()
  @MinLength(8)
  newPassword!: string
}

export class UpdateProfileDto {
  @IsString()
  @IsOptional()
  fullName?: string

  @IsString()
  @IsOptional()
  phone?: string
}
