// src/property/dto/create-asset.dto.ts
import { IsString, IsNumber, IsEnum, IsNotEmpty, Min,IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { AssetCategory } from './property.schema';

export class CreateAssetDto {
 @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsEnum(AssetCategory)
  category: AssetCategory;

  @IsString()
  @IsOptional()
  customCategory?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  rentalPriceperday: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  rentalPriceperhour: number;

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
