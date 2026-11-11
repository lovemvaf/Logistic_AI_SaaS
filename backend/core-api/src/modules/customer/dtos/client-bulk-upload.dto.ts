import { IsArray, ValidateNested } from "class-validator"
import { Type } from "class-transformer"
import { ClientOrderCreateDto } from "./client-order-create.dto"

export class ClientBulkUploadDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClientOrderCreateDto)
  orders!: ClientOrderCreateDto[]
}
