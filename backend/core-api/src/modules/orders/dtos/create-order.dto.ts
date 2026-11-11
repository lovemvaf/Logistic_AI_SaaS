import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

export class CreateOrderItemDto {
  @IsString()
  @MinLength(1)
  productId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}

/**
 * Body của `POST /api/v1/orders`.
 *
 * DTO này trước đây mô tả `{ trackingCode, recipient }` - hoàn toàn không khớp
 * với controller (dùng items / recipientName / recipientPhone / ...) nên mọi
 * request thật đều bị ValidationPipe chặn với `forbidNonWhitelisted`.
 */
export class CreateOrderDto {
  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  clientOrderRef?: string;

  @IsString()
  @MinLength(2)
  recipientName!: string;

  @IsString()
  @MinLength(2)
  recipientPhone!: string;

  @IsString()
  @MinLength(2)
  recipientAddress!: string;

  @IsOptional()
  @IsNumber()
  codAmount?: number;

  @IsOptional()
  @IsNumber()
  shippingFee?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];
}
