import { IsOptional, IsString, MinLength, IsNumber } from "class-validator"

export class ClientOrderCreateDto {
  @IsOptional()
  @IsString()
  clientOrderRef?: string

  @IsString()
  @MinLength(2)
  recipientName!: string

  @IsString()
  recipientPhone!: string

  @IsString()
  recipientAddress!: string

  @IsOptional()
  @IsNumber()
  codAmount?: number

  @IsOptional()
  @IsNumber()
  shippingFee?: number
}
