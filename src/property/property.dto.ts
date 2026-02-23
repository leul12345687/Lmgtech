import { IsString, IsNumber, IsNotEmpty, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateAssetDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsString()
  @IsNotEmpty()
  location: string;

  @IsString()
  @IsNotEmpty()
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
