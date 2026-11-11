import { IsString } from "class-validator"

export class InvoicePayDto {
  @IsString()
  method!: string
}
