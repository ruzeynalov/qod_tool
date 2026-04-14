import { IsString, IsOptional, IsEmail, IsEnum } from 'class-validator';

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  username?: string;

  @IsString()
  @IsOptional()
  avatarUrl?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsEnum(['ADMIN', 'MEMBER'])
  @IsOptional()
  role?: string;
}
