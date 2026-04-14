import { IsEmail, IsString, IsNotEmpty, IsOptional, IsEnum, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(['ADMIN', 'MEMBER'])
  @IsOptional()
  role?: string;

  @IsString()
  @MinLength(8)
  @IsOptional()
  password?: string;
}
