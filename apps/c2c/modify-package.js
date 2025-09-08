const fs = require('fs');
// Load the existing package.json
const appName = 'c2c';

const packagePath = `dist/apps/${appName}/package.json`;

try {
  // Read the package.json file as a JSON object
  const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

  // Modify package.json as needed
  packageData.scripts = {
    ...packageData.scripts,
    start: 'node main.js',
    [`studio:${appName}`]: 'prisma studio --schema prisma/schema.prisma',
    [`migrate:${appName}`]: `prisma migrate dev --name ${appName} --schema prisma/schema.prisma`,
    [`generate:${appName}`]: `prisma generate --schema prisma/schema.prisma`,
  };

  packageData.dependencies = {
    ...packageData.dependencies,
    // Core NestJS dependencies
    '@nestjs/common': '^10.3.7',
    '@nestjs/core': '^10.3.7',
    '@nestjs/config': '^3.2.0',
    '@nestjs/platform-express': '^10.3.7',
    '@nestjs/microservices': '^10.3.7',
    '@nestjs/swagger': '^7.3.0',
    '@nestjs/event-emitter': '^2.1.1',
    '@nestjs/bull': '^10.1.0',
    '@nestjs/mapped-types': '*',
    
    // Prisma dependencies
    'prisma': '^5.20.0',
    '@prisma/client': '^5.20.0',
    
    // Rahat/Rumsan dependencies
    '@rahataid/sdk': '0.0.20',
    '@rumsan/prisma': '1.0.131',
    '@rumsan/settings': '^0.0.108',
    '@rumsan/extensions': '0.0.21',
    '@rumsan/communication': '0.0.23',
    '@rumsan/connect': '1.0.3',
    '@rumsan/react-query': '0.0.38',
    '@rumsan/sdk': '^0.0.44',
    
    // Blockchain/Web3 dependencies
    'ethers': '^6.11.1',
    'viem': '^2.10.2',
    '@safe-global/api-kit': '^2.4.1',
    '@safe-global/protocol-kit': '^4.0.1',
    '@safe-global/safe-core-sdk-types': '^5.0.1',
    
    // Queue/Redis dependencies
    'bull': '^4.12.2',
    'ioredis': '^5.3.2',
    
    // Utility dependencies
    'rxjs': '^7.8.1',
    'class-validator': '^0.14.1',
    'reflect-metadata': '^0.1.14',
    'dotenv': '^16.4.4',
    'ts-node': '^10.9.1',
    'tslib': '^2.6.2',
    'inquirer': '^12.6.1'
  };

  packageData.prisma = {
    seed: 'prisma/seed.ts',
  };

  // Write the updated package.json back to the file
  fs.writeFileSync(packagePath, JSON.stringify(packageData, null, 2), 'utf8');

  console.log('package.json updated successfully.');
} catch (err) {
  console.error('Error updating package.json:', err);
}
