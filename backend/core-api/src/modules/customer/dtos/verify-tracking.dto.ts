import { IsString, Length } from "class-validator"

export class VerifyTrackingDto {
  @IsString()
  @Length(4, 4)
  last4!: string
}
