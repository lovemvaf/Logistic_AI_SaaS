import { IsString, IsNotEmpty, IsNumber, IsOptional, MaxLength, Matches, Min } from 'class-validator';

export class CreateOrderDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  recipientName!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[0-9+-]{9,15}$/, { message: 'Invalid phone number format' })
  recipientPhone!: string;

  @IsString()
  @IsNotEmpty()
  destinationAddress!: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  shippingFee?: number;
}
