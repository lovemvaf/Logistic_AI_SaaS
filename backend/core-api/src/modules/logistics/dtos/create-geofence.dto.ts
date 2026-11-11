import { IsString, MinLength } from "class-validator"

export class CreateGeofenceDto {
  @IsString()
  @MinLength(2)
  name!: string

  @IsString()
  @MinLength(3)
  zoneType!: string
}
