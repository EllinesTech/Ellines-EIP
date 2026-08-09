/**
 * SOAP Connector
 * Requirement 22.2: SOAP connector type
 */

import { Injectable, Logger } from '@nestjs/common';

export interface SoapConnectorConfig {
  wsdlUrl: string;
  endpoint?: string;
  username?: string;
  password?: string;
  timeout?: number;
}

export interface SoapCallResult {
  result: any;
  rawXml: string;
  latencyMs: number;
}

@Injectable()
export class SoapConnector {
  private readonly logger = new Logger(SoapConnector.name);

  /**
   * Call a SOAP method
   */
  async call(
    config: SoapConnectorConfig,
    method: string,
    params: Record<string, any>,
  ): Promise<SoapCallResult> {
    const startTime = Date.now();
    const endpoint = config.endpoint || config.wsdlUrl.replace('?wsdl', '').replace('?WSDL', '');

    const soapBody = this.buildSoapEnvelope(method, params);
    const headers: Record<string, string> = {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': `"${method}"`,
    };

    if (config.username && config.password) {
      const credentials = Buffer.from(`${config.username}:${config.password}`).toString('base64');
      headers['Authorization'] = `Basic ${credentials}`;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: soapBody,
      signal: AbortSignal.timeout(config.timeout ?? 30000),
    });

    if (!response.ok) {
      throw new Error(`SOAP call failed: ${response.status} ${response.statusText}`);
    }

    const rawXml = await response.text();
    const result = this.parseXmlResponse(rawXml);

    return { result, rawXml, latencyMs: Date.now() - startTime };
  }

  private buildSoapEnvelope(method: string, params: Record<string, any>): string {
    const paramsXml = Object.entries(params)
      .map(([key, val]) => `<${key}>${val}</${key}>`)
      .join('');

    return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Header/>
  <soap:Body>
    <${method}>${paramsXml}</${method}>
  </soap:Body>
</soap:Envelope>`;
  }

  private parseXmlResponse(xml: string): Record<string, any> {
    // Simple XML key-value extraction (production would use xml2js)
    const result: Record<string, any> = { raw: xml };
    const matches = xml.matchAll(/<([^/>\s]+)[^>]*>([^<]+)<\/\1>/g);
    for (const match of matches) {
      result[match[1]] = match[2];
    }
    return result;
  }

  async testConnection(config: SoapConnectorConfig): Promise<boolean> {
    try {
      const response = await fetch(config.wsdlUrl, { method: 'GET' });
      return response.ok;
    } catch {
      return false;
    }
  }
}
