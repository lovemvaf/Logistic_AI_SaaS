import { IsOptional, IsString } from "class-validator"

export class DispatchTripDto {
  @IsOptional()
  @IsString()
  driverId?: string

  @IsOptional()
  @IsString()
  vehicleId?: string
}
