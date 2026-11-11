import { IsString, Length } from 'class-validator';

export class MfaVerifyDto {
  @IsString()
  @Length(6, 6)
  token!: string;
}

export class MfaEnableDto {
  @IsString()
  secret!: string;

  @IsString()
  @Length(6, 6)
  token!: string;
}
