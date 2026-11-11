import { IsNumber, IsString, IsNotEmpty, MaxLength, Min, Max } from 'class-validator';

export class SosAlertDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  message!: string;
}

export class UpdateTripDto {
  @IsString()
  @IsNotEmpty()
  status!: string;
}
