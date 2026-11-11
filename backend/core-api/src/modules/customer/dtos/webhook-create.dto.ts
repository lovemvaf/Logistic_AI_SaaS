import { IsArray, IsString, MinLength } from "class-validator"

export class WebhookCreateDto {
  @IsString()
  @MinLength(8)
  url!: string

  @IsArray()
  events!: string[]
}
