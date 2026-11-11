import { IsEmail, IsString, IsOptional } from "class-validator"

export class LoginRequestDto {
  @IsEmail()
  email!: string

  @IsString()
  password!: string
}
