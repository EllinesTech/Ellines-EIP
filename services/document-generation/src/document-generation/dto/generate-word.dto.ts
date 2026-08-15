import { IsArray, IsOptional, IsString } from 'class-validator';
import { WordConfig, ContentSection } from '../../interfaces/document-generation.interfaces';

export class GenerateWordDto implements Partial<WordConfig> {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  author?: string;

  @IsArray()
  sections: ContentSection[];

  @IsOptional()
  styles?: any[];

  @IsOptional()
  branding?: any;
}
