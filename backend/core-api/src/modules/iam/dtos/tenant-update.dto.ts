import { IsString, IsOptional, IsEnum, MaxLength } from "class-validator";

export enum TenantStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  DELETED = 'DELETED'
}

export class UpdateTenantDto {
  @IsString()
  @IsOptional()
  @MaxLength(200)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  slug?: string;

  @IsString()
  @IsOptional()
  logoUrl?: string;

  @IsString()
  @IsOptional()
  planId?: string;

  @IsEnum(TenantStatus)
  @IsOptional()
  status?: TenantStatus;
}
