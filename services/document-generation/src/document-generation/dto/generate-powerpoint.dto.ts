import { IsArray, IsOptional, IsString } from 'class-validator';
import { PowerPointConfig, SlideDefinition } from '../../interfaces/document-generation.interfaces';

export class GeneratePowerPointDto implements Partial<PowerPointConfig> {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  author?: string;

  @IsArray()
  slides: SlideDefinition[];

  @IsOptional()
  masterSlide?: any;

  @IsOptional()
  animations?: any[];

  @IsOptional()
  speakerNotes?: any[];

  @IsOptional()
  branding?: any;
}
