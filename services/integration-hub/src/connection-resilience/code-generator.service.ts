import { Injectable, Logger } from '@nestjs/common';
import {
  ConnectionMethod,
  GeneratedConnectorCode,
  SystemIdentifier,
} from './types';

/**
 * CodeGenerator Service
 * Automatically generates connector code for unsupported systems
 */
@Injectable()
export class CodeGeneratorService {
  private readonly logger = new Logger(CodeGeneratorService.name);

  /**
   * Generate connector code for a system
   */
  async generateConnectorCode(
    system: SystemIdentifier,
    methods: ConnectionMethod[],
    language: 'typescript' | 'python' | 'java' = 'typescript',
  ): Promise<GeneratedConnectorCode> {
    this.logger.log(`Generating ${language} connector code for ${system.id}`);

    const primaryMethod = methods[0];
    const backupMethods = methods.slice(1);

    let sourceCode = '';
    let dependencies: string[] = [];
    let testCases: string[] = [];

    if (language === 'typescript') {
      const result = this.generateTypeScriptConnector(system, primaryMethod, backupMethods);
      sourceCode = result.code;
      dependencies = result.dependencies;
      testCases = result.testCases;
    } else if (language === 'python') {
      const result = this.generatePythonConnector(system, primaryMethod, backupMethods);
      sourceCode = result.code;
      dependencies = result.dependencies;
      testCases = result.testCases;
    } else if (language === 'java') {
      const result = this.generateJavaConnector(system, primaryMethod, backupMethods);
      sourceCode = result.code;
      dependencies = result.dependencies;
      testCases = result.testCases;
    }

    return {
      systemId: system.id,
      systemName: system.name,
      sourceCode,
      language,
      dependencies,
      testCases,
      generatedAt: new Date(),
      requiresApproval: true,
      approvalStatus: 'pending',
    };
  }

  /**
   * Generate TypeScript connector
   */
  private generateTypeScriptConnector(
    system: SystemIdentifier,
    primaryMethod: ConnectionMethod,
    backupMethods: ConnectionMethod[],
  ): { code: string; dependencies: string[]; testCases: string[] } {
    const methodConfigs = [primaryMethod, ...backupMethods]
      .map(
        (m) =>
          `  { type: '${m.type}', config: ${JSON.stringify(m.config, null, 2)}, priority: ${m.priority} }`,
      )
      .join(',\n');

    const code = `
/**
 * Auto-generated connector for ${system.name}
 * System ID: ${system.id}
 * Generated: ${new Date().toISOString()}
 */

import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class ${this.toPascalCase(system.id)}Connector {
  private readonly logger = new Logger('${system.id}Connector');
  private currentMethodIndex = 0;
  
  private connectionMethods = [
${methodConfigs}
  ];

  constructor() {
    this.logger.log('${system.name} connector initialized');
  }

  /**
   * Connect to ${system.name}
   */
  async connect(): Promise<any> {
    for (let i = 0; i < this.connectionMethods.length; i++) {
      try {
        this.currentMethodIndex = i;
        const method = this.connectionMethods[i];
        this.logger.debug(\`Attempting connection via \${method.type}\`);
        
        const connection = await this.connectViaMethod(method);
        this.logger.log(\`Successfully connected via \${method.type}\`);
        return connection;
      } catch (error) {
        this.logger.warn(\`Connection via \${this.connectionMethods[i].type} failed: \${error.message}\`);
        if (i === this.connectionMethods.length - 1) {
          throw new Error(\`All connection methods failed for ${system.name}\`);
        }
      }
    }
  }

  /**
   * Connect via specific method
   */
  private async connectViaMethod(method: any): Promise<any> {
    switch (method.type) {
      case 'api':
        return this.connectViaApi(method.config);
      case 'database':
        return this.connectViaDatabase(method.config);
      case 'message_queue':
        return this.connectViaMessageQueue(method.config);
      case 'file_sync':
        return this.connectViaFileSync(method.config);
      case 'screen_scrape':
        return this.connectViaScreenScrape(method.config);
      case 'webhook':
        return this.connectViaWebhook(method.config);
      default:
        throw new Error(\`Unknown connection method: \${method.type}\`);
    }
  }

  private connectViaApi(config: any): Promise<any> {
    return axios.get(\`\${config.endpoint}/health\`, { timeout: 5000 });
  }

  private connectViaDatabase(config: any): Promise<any> {
    // Database connection logic
    return Promise.resolve({ connected: true, type: 'database' });
  }

  private connectViaMessageQueue(config: any): Promise<any> {
    // Message queue connection logic
    return Promise.resolve({ connected: true, type: 'message_queue' });
  }

  private connectViaFileSync(config: any): Promise<any> {
    // File sync connection logic
    return Promise.resolve({ connected: true, type: 'file_sync' });
  }

  private connectViaScreenScrape(config: any): Promise<any> {
    // Screen scraping logic
    return Promise.resolve({ connected: true, type: 'screen_scrape' });
  }

  private connectViaWebhook(config: any): Promise<any> {
    // Webhook registration logic
    return Promise.resolve({ connected: true, type: 'webhook' });
  }

  /**
   * Disconnect from ${system.name}
   */
  async disconnect(): Promise<void> {
    this.logger.log('Disconnecting from ${system.name}');
  }

  /**
   * Fetch data from ${system.name}
   */
  async fetchData(query: string): Promise<any> {
    const connection = await this.connect();
    // Implementation would fetch actual data based on connection type
    return { query, data: [] };
  }
}
`;

    const dependencies = ['@nestjs/common', 'axios'];
    const testCases = [
      'should initialize connector',
      'should connect via primary method',
      'should failover to backup method',
      'should disconnect successfully',
      'should fetch data',
      'should handle connection errors',
    ];

    return { code, dependencies, testCases };
  }

  /**
   * Generate Python connector
   */
  private generatePythonConnector(
    system: SystemIdentifier,
    primaryMethod: ConnectionMethod,
    backupMethods: ConnectionMethod[],
  ): { code: string; dependencies: string[]; testCases: string[] } {
    const methodList = [primaryMethod, ...backupMethods]
      .map((m) => `    {'type': '${m.type}', 'config': ${JSON.stringify(m.config)}, 'priority': ${m.priority}}`)
      .join(',\n');

    const code = `
"""
Auto-generated connector for ${system.name}
System ID: ${system.id}
Generated: ${new Date().toISOString()}
"""

import logging
import requests
from typing import Any, Dict, List

logger = logging.getLogger(__name__)


class ${this.toPascalCase(system.id)}Connector:
    """Connector for ${system.name}"""

    def __init__(self):
        self.connection_methods = [
${methodList}
        ]
        self.current_method_index = 0
        logger.info(f'${system.name} connector initialized')

    async def connect(self) -> Any:
        """Connect to ${system.name}"""
        for i, method in enumerate(self.connection_methods):
            try:
                self.current_method_index = i
                logger.debug(f"Attempting connection via {method['type']}")
                connection = await self.connect_via_method(method)
                logger.info(f"Successfully connected via {method['type']}")
                return connection
            except Exception as error:
                logger.warning(f"Connection via {method['type']} failed: {str(error)}")
                if i == len(self.connection_methods) - 1:
                    raise Exception(f"All connection methods failed for ${system.name}")
        return None

    async def connect_via_method(self, method: Dict) -> Any:
        """Connect via specific method"""
        if method['type'] == 'api':
            return await self.connect_via_api(method['config'])
        elif method['type'] == 'database':
            return await self.connect_via_database(method['config'])
        elif method['type'] == 'message_queue':
            return await self.connect_via_message_queue(method['config'])
        elif method['type'] == 'file_sync':
            return await self.connect_via_file_sync(method['config'])
        elif method['type'] == 'screen_scrape':
            return await self.connect_via_screen_scrape(method['config'])
        elif method['type'] == 'webhook':
            return await self.connect_via_webhook(method['config'])
        else:
            raise ValueError(f"Unknown connection method: {method['type']}")

    async def connect_via_api(self, config: Dict) -> Any:
        """Connect via API"""
        try:
            response = requests.get(f"{config['endpoint']}/health", timeout=5)
            return response.json()
        except Exception as e:
            raise Exception(f"API connection failed: {str(e)}")

    async def disconnect(self) -> None:
        """Disconnect from ${system.name}"""
        logger.info("Disconnecting from ${system.name}")

    async def fetch_data(self, query: str) -> Any:
        """Fetch data from ${system.name}"""
        connection = await self.connect()
        return {'query': query, 'data': []}
`;

    const dependencies = ['requests', 'asyncio', 'logging'];
    const testCases = [
      'test_connector_initialization',
      'test_connect_via_primary_method',
      'test_failover_to_backup_method',
      'test_disconnect',
      'test_fetch_data',
      'test_connection_errors',
    ];

    return { code, dependencies, testCases };
  }

  /**
   * Generate Java connector
   */
  private generateJavaConnector(
    system: SystemIdentifier,
    primaryMethod: ConnectionMethod,
    backupMethods: ConnectionMethod[],
  ): { code: string; dependencies: string[]; testCases: string[] } {
    const code = `
/**
 * Auto-generated connector for ${system.name}
 * System ID: ${system.id}
 * Generated: ${new Date().toISOString()}
 */

package com.ellines.connectors.generated;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

public class ${this.toPascalCase(system.id)}Connector {
    private static final Logger logger = LoggerFactory.getLogger(${this.toPascalCase(system.id)}Connector.class);
    private List<Map<String, Object>> connectionMethods;
    private int currentMethodIndex = 0;

    public ${this.toPascalCase(system.id)}Connector() {
        initializeConnectionMethods();
        logger.info("${system.name} connector initialized");
    }

    private void initializeConnectionMethods() {
        connectionMethods = new ArrayList<>();
        // Add connection methods here
    }

    /**
     * Connect to ${system.name}
     */
    public Object connect() throws Exception {
        for (int i = 0; i < connectionMethods.size(); i++) {
            try {
                currentMethodIndex = i;
                Map<String, Object> method = connectionMethods.get(i);
                logger.debug("Attempting connection via " + method.get("type"));
                
                Object connection = connectViaMethod(method);
                logger.info("Successfully connected via " + method.get("type"));
                return connection;
            } catch (Exception e) {
                logger.warn("Connection via " + connectionMethods.get(i).get("type") + " failed: " + e.getMessage());
                if (i == connectionMethods.size() - 1) {
                    throw new Exception("All connection methods failed for ${system.name}");
                }
            }
        }
        return null;
    }

    private Object connectViaMethod(Map<String, Object> method) throws Exception {
        String type = (String) method.get("type");
        Map<String, Object> config = (Map<String, Object>) method.get("config");
        
        switch (type) {
            case "api":
                return connectViaApi(config);
            case "database":
                return connectViaDatabase(config);
            case "message_queue":
                return connectViaMessageQueue(config);
            case "file_sync":
                return connectViaFileSync(config);
            case "screen_scrape":
                return connectViaScreenScrape(config);
            case "webhook":
                return connectViaWebhook(config);
            default:
                throw new Exception("Unknown connection method: " + type);
        }
    }

    private Object connectViaApi(Map<String, Object> config) throws Exception {
        // API connection implementation
        return new Object();
    }

    private Object connectViaDatabase(Map<String, Object> config) throws Exception {
        // Database connection implementation
        return new Object();
    }

    private Object connectViaMessageQueue(Map<String, Object> config) throws Exception {
        // Message queue connection implementation
        return new Object();
    }

    private Object connectViaFileSync(Map<String, Object> config) throws Exception {
        // File sync implementation
        return new Object();
    }

    private Object connectViaScreenScrape(Map<String, Object> config) throws Exception {
        // Screen scraping implementation
        return new Object();
    }

    private Object connectViaWebhook(Map<String, Object> config) throws Exception {
        // Webhook registration implementation
        return new Object();
    }

    /**
     * Disconnect from ${system.name}
     */
    public void disconnect() {
        logger.info("Disconnecting from ${system.name}");
    }

    /**
     * Fetch data from ${system.name}
     */
    public Object fetchData(String query) throws Exception {
        Object connection = connect();
        // Fetch implementation
        return null;
    }
}
`;

    const dependencies = ['org.slf4j:slf4j-api', 'org.apache.httpcomponents:httpclient'];
    const testCases = [
      'testConnectorInitialization',
      'testConnectViaPrimaryMethod',
      'testFailoverToBackupMethod',
      'testDisconnect',
      'testFetchData',
      'testConnectionErrors',
    ];

    return { code, dependencies, testCases };
  }

  /**
   * Convert string to PascalCase
   */
  private toPascalCase(str: string): string {
    return str
      .split(/[-_]/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
  }
}
