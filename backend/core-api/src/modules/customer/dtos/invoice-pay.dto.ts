import { IsNumber, IsOptional, IsString, Min } from "class-validator"
import { Type } from "class-transformer"

export class InvoicePayDto {
  @IsOptional()
  @IsString()
  method?: string

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  amount?: number
}
