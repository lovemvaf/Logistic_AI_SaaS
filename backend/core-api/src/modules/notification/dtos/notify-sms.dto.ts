import { IsString, MinLength } from "class-validator"

export class NotifySmsDto {
  @IsString()
  @MinLength(8)
  to!: string

  @IsString()
  @MinLength(2)
  message!: string
}
