import { IsString, MinLength, IsOptional } from "class-validator"

export class TenantCreateDto {
  @IsString()
  @MinLength(2)
  name!: string

  @IsString()
  @MinLength(2)
  plan!: string

  @IsString()
  @IsOptional()
  slug?: string

  @IsString()
  @IsOptional()
  planId?: string
}
