import { IsInt, IsOptional, IsString, Min } from "class-validator"

export class BulkUploadDto {
  @IsString()
  fileName!: string

  @IsOptional()
  @IsInt()
  @Min(1)
  totalRows?: number
}
