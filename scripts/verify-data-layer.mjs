#!/usr/bin/env node

/**
 * Ellines EIP 2.0 — Data Layer Verification Script
 * 
 * Verifies that all v2.0 data layer components are properly configured:
 * - PostgreSQL schema (via Prisma)
 * - Neo4j configuration
 * - InfluxDB configuration
 * - Redis configuration
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function checkEnvironmentVariables() {
  log('\n📋 Checking Environment Variables...', 'cyan');

  const envPath = join(projectRoot, '.env');
  if (!existsSync(envPath)) {
    log('❌ .env file not found', 'red');
    return false;
  }

  const envContent = readFileSync(envPath, 'utf-8');
  const requiredVars = [
    'DATABASE_URL',
    'DIRECT_URL',
    'REDIS_URL',
    'NEO4J_URI',
    'NEO4J_USERNAME',
    'NEO4J_PASSWORD',
    'INFLUXDB_URL',
    'INFLUXDB_TOKEN',
    'INFLUXDB_ORG',
    'INFLUXDB_BUCKET',
  ];

  let allFound = true;
  for (const varName of requiredVars) {
    const found = envContent.includes(`${varName}=`);
    if (found) {
      log(`✅ ${varName}`, 'green');
    } else {
      log(`❌ ${varName} not found`, 'red');
      allFound = false;
    }
  }

  return allFound;
}

function checkPrismaSchema() {
  log('\n📊 Checking Prisma Schema...', 'cyan');

  const schemaPath = join(projectRoot, 'services', 'identity', 'prisma', 'schema.prisma');
  if (!existsSync(schemaPath)) {
    log('❌ Prisma schema not found', 'red');
    return false;
  }

  const schemaContent = readFileSync(schemaPath, 'utf-8');

  // Check for v2.0 models
  const v20Models = [
    'KnowledgeGraphEntity',
    'KnowledgeGraphRelationship',
    'AiModelRegistry',
    'ModelDecisionLog',
    'ModelPerformanceLog',
    'RemediationPlaybook',
    'RemediationExecution',
    'SystemHealthMetric',
    'FederatedLearningRound',
    'FederatedLearningParticipant',
  ];

  let allFound = true;
  for (const modelName of v20Models) {
    const found = schemaContent.includes(`model ${modelName}`);
    if (found) {
      log(`✅ ${modelName} model defined`, 'green');
    } else {
      log(`❌ ${modelName} model not found`, 'red');
      allFound = false;
    }
  }

  return allFound;
}

function checkDockerCompose() {
  log('\n🐳 Checking Docker Compose Configuration...', 'cyan');

  const composePath = join(projectRoot, 'infra', 'docker', 'docker-compose.yml');
  if (!existsSync(composePath)) {
    log('❌ docker-compose.yml not found', 'red');
    return false;
  }

  const composeContent = readFileSync(composePath, 'utf-8');

  const requiredServices = ['postgres', 'redis', 'neo4j', 'influxdb'];

  let allFound = true;
  for (const service of requiredServices) {
    const found = composeContent.includes(`${service}:`);
    if (found) {
      log(`✅ ${service} service configured`, 'green');
    } else {
      log(`❌ ${service} service not found`, 'red');
      allFound = false;
    }
  }

  // Check Neo4j specific configuration
  if (composeContent.includes('neo4j:5.15')) {
    log('✅ Neo4j version 5.15 configured', 'green');
  } else {
    log('⚠️  Neo4j version not 5.15', 'yellow');
  }

  // Check InfluxDB specific configuration
  if (composeContent.includes('influxdb:2.7')) {
    log('✅ InfluxDB version 2.7 configured', 'green');
  } else {
    log('⚠️  InfluxDB version not 2.7', 'yellow');
  }

  return allFound;
}

function checkNeo4jSchema() {
  log('\n🔗 Checking Neo4j Schema Files...', 'cyan');

  const schemaPath = join(projectRoot, 'infra', 'neo4j', 'init-schema.cypher');
  const readmePath = join(projectRoot, 'infra', 'neo4j', 'README.md');

  let allFound = true;

  if (existsSync(schemaPath)) {
    log('✅ init-schema.cypher exists', 'green');

    const schemaContent = readFileSync(schemaPath, 'utf-8');

    // Check for entity type constraints
    const entityTypes = ['Person', 'Product', 'Location', 'Event', 'Document'];
    for (const entityType of entityTypes) {
      if (schemaContent.includes(`CONSTRAINT ${entityType.toLowerCase()}_id`)) {
        log(`  ✅ ${entityType} constraints defined`, 'green');
      } else {
        log(`  ❌ ${entityType} constraints missing`, 'red');
        allFound = false;
      }
    }
  } else {
    log('❌ init-schema.cypher not found', 'red');
    allFound = false;
  }

  if (existsSync(readmePath)) {
    log('✅ Neo4j README.md exists', 'green');
  } else {
    log('⚠️  Neo4j README.md not found', 'yellow');
  }

  return allFound;
}

function checkInfluxDBDocs() {
  log('\n📈 Checking InfluxDB Documentation...', 'cyan');

  const readmePath = join(projectRoot, 'infra', 'influxdb', 'README.md');

  if (existsSync(readmePath)) {
    log('✅ InfluxDB README.md exists', 'green');

    const content = readFileSync(readmePath, 'utf-8');

    // Check for measurement definitions
    const measurements = [
      'api_request',
      'system_health',
      'connector_sync',
      'self_healing_event',
      'ai_model_performance',
      'knowledge_graph_operation',
    ];

    let allFound = true;
    for (const measurement of measurements) {
      if (content.includes(`\`${measurement}\``)) {
        log(`  ✅ ${measurement} measurement documented`, 'green');
      } else {
        log(`  ⚠️  ${measurement} measurement not documented`, 'yellow');
      }
    }

    return allFound;
  } else {
    log('❌ InfluxDB README.md not found', 'red');
    return false;
  }
}

function checkRedisDocs() {
  log('\n💾 Checking Redis Documentation...', 'cyan');

  const readmePath = join(projectRoot, 'infra', 'redis', 'README.md');

  if (existsSync(readmePath)) {
    log('✅ Redis README.md exists', 'green');
    return true;
  } else {
    log('❌ Redis README.md not found', 'red');
    return false;
  }
}

function checkMainDocumentation() {
  log('\n📚 Checking Main Documentation...', 'cyan');

  const docPath = join(projectRoot, 'docs', '19_v2.0_Data_Layer_Setup.md');

  if (existsSync(docPath)) {
    log('✅ v2.0 Data Layer Setup documentation exists', 'green');
    return true;
  } else {
    log('❌ v2.0 Data Layer Setup documentation not found', 'red');
    return false;
  }
}

function checkPrismaClient() {
  log('\n🔧 Checking Prisma Client Generation...', 'cyan');

  const clientPath = join(projectRoot, 'node_modules', '.prisma', 'client');

  if (existsSync(clientPath)) {
    log('✅ Prisma Client generated', 'green');
    return true;
  } else {
    log('⚠️  Prisma Client not generated (run: npm run db:generate)', 'yellow');
    return false;
  }
}

async function main() {
  log('\n╔════════════════════════════════════════════════════════════╗', 'blue');
  log('║  Ellines EIP 2.0 — Data Layer Verification                ║', 'blue');
  log('╚════════════════════════════════════════════════════════════╝', 'blue');

  const results = {
    envVars: checkEnvironmentVariables(),
    prismaSchema: checkPrismaSchema(),
    dockerCompose: checkDockerCompose(),
    neo4jSchema: checkNeo4jSchema(),
    influxdbDocs: checkInfluxDBDocs(),
    redisDocs: checkRedisDocs(),
    mainDocs: checkMainDocumentation(),
    prismaClient: checkPrismaClient(),
  };

  // Summary
  log('\n╔════════════════════════════════════════════════════════════╗', 'blue');
  log('║  Verification Summary                                      ║', 'blue');
  log('╚════════════════════════════════════════════════════════════╝', 'blue');

  const checks = [
    ['Environment Variables', results.envVars],
    ['Prisma Schema (v2.0 models)', results.prismaSchema],
    ['Docker Compose Configuration', results.dockerCompose],
    ['Neo4j Schema', results.neo4jSchema],
    ['InfluxDB Documentation', results.influxdbDocs],
    ['Redis Documentation', results.redisDocs],
    ['Main Documentation', results.mainDocs],
    ['Prisma Client', results.prismaClient],
  ];

  for (const [name, passed] of checks) {
    const icon = passed ? '✅' : '❌';
    const color = passed ? 'green' : 'red';
    log(`${icon} ${name}`, color);
  }

  const allPassed = Object.values(results).every((r) => r);

  if (allPassed) {
    log('\n🎉 All checks passed! Data layer is properly configured.', 'green');
    log('\nNext steps:', 'cyan');
    log('1. Start services: npm run docker:up', 'cyan');
    log('2. Initialize Neo4j: See infra/neo4j/README.md', 'cyan');
    log('3. Verify connections: npm run verify:data-layer', 'cyan');
    process.exit(0);
  } else {
    log('\n⚠️  Some checks failed. Please review the output above.', 'yellow');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Error during verification:', error);
  process.exit(1);
});
