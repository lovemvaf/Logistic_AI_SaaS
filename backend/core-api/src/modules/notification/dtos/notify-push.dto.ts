import { IsString, MinLength } from "class-validator"

export class NotifyPushDto {
  @IsString()
  @MinLength(2)
  deviceToken!: string

  @IsString()
  @MinLength(2)
  message!: string
}
