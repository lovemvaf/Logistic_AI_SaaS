import { IsEmail, IsString, MinLength } from "class-validator"

export class NotifyEmailDto {
  @IsEmail()
  to!: string

  @IsString()
  @MinLength(2)
  subject!: string

  @IsString()
  @MinLength(2)
  body!: string
}
