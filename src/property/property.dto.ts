import { IsString, IsNumber, IsNotEmpty, Min, MinLength } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class CreateAssetDto {

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  description: string;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value.trim().toLowerCase())
  location: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @Transform(({ value }) => value.trim().toLowerCase())
  category: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  rentalPriceperhour: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  rentalPriceperday: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  rentalPriceperweek: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  rentalPricepermonth: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  rentalPriceperyear: number;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  numberOfProperty: number;
}