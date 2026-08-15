import { IsArray, IsOptional, IsString } from 'class-validator';
import { PDFConfig, PDFSection } from '../../interfaces/document-generation.interfaces';

export class GeneratePdfDto implements Partial<PDFConfig> {
  @IsOptional()
  @IsString()
  title?: string;

  @IsArray()
  sections: PDFSection[];

  @IsOptional()
  layout?: any;

  @IsOptional()
  header?: any;

  @IsOptional()
  footer?: any;

  @IsOptional()
  branding?: any;
}
