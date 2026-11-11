import { IsArray, IsOptional, IsString } from "class-validator"

export class OptimizeRoutingDto {
  @IsOptional()
  @IsString()
  jobName?: string

  @IsArray()
  @IsString({ each: true })
  orderIds!: string[]
}
