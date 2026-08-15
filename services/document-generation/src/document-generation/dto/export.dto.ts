import { IsArray, IsOptional, IsString } from 'class-validator';

export class ExportCsvDto {
  @IsArray()
  data: Record<string, unknown>[];

  @IsOptional()
  @IsArray()
  headers?: string[];
}

export class ExportJsonDto {
  data: unknown;
}

export class ExportXmlDto {
  @IsArray()
  data: Record<string, unknown>[];

  @IsOptional()
  @IsString()
  rootElement?: string;
}

export class DeliverDocumentDto {
  @IsString()
  format: string;

  data: string; // base64-encoded document buffer

  delivery: {
    method: 'email' | 'download' | 'webhook' | 'dms_integration';
    recipients?: string[];
    subject?: string;
    message?: string;
    webhookUrl?: string;
    dmsPath?: string;
    expiryDuration?: number;
    filename?: string;
  };
}

export class ApplyBrandingDto {
  branding: {
    organizationName?: string;
    logoBase64?: string;
    primaryColor?: string;
    secondaryColor?: string;
    fontFamily?: string;
    website?: string;
    tagline?: string;
  };
}
