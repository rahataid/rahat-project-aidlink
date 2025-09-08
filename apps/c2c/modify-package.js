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
    // Prisma related
    prisma: '^5.20.0',
    '@prisma/client': '^5.20.0',
    'prisma-dbml-generator': '^0.12.0',
    'prisma-docs-generator': '^0.8.0',
    'prisma-json-schema-generator': '^5.1.1',
    
    // NestJS core dependencies
    '@nestjs/common': '^10.3.7',
    '@nestjs/core': '^10.3.7',
    '@nestjs/microservices': '^10.3.7',
    '@nestjs/config': '^3.2.0',
    '@nestjs/platform-express': '^10.3.7',
    '@nestjs/swagger': '^7.3.0',
    '@nestjs/event-emitter': '^2.1.1',
    
    // Rahat/Rumsan packages
    '@rumsan/extensions': '^0.0.21',
    '@rumsan/prisma': '1.0.131',
    '@rumsan/sdk': '^0.0.44',
    '@rumsan/settings': '^0.0.108',
    '@rumsan/communication': '0.0.23',
    '@rahataid/sdk': '0.0.20',
    
    // Other runtime dependencies
    'class-validator': '^0.14.1',
    'reflect-metadata': '^0.1.14',
    'rxjs': '^7.8.1',
    'ts-node': '^10.9.1',
    'dotenv': '^16.4.4',
    'viem': '^2.10.2',
    'ioredis': '^5.3.2',
    'tslib': '^2.6.2'
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
