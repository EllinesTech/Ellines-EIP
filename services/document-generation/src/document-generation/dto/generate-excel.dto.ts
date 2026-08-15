import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ExcelConfig, SheetDefinition } from '../../interfaces/document-generation.interfaces';

export class GenerateExcelDto implements Partial<ExcelConfig> {
  @IsOptional()
  @IsString()
  title?: string;

  @IsArray()
  sheets: SheetDefinition[];

  @IsOptional()
  formulas?: any[];

  @IsOptional()
  charts?: any[];

  @IsOptional()
  formatting?: any;

  @IsOptional()
  branding?: any;
}
