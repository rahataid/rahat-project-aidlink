const fs = require('fs');
const path = require('path');

// Load the existing package.json
const appName = 'c2c';
const packagePath = `dist/apps/${appName}/package.json`;
const rootPackagePath = path.join(__dirname, '../../package.json');

try {
  // Read the root package.json to get all dependencies
  const rootPackageData = JSON.parse(fs.readFileSync(rootPackagePath, 'utf8'));

  // Read the generated package.json file
  const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

  // Extract production dependencies from root package.json
  const productionDependencies = {};
  if (rootPackageData.dependencies) {
    Object.keys(rootPackageData.dependencies).forEach(dep => {
      // Skip workspace dependencies and link dependencies
      if (!rootPackageData.dependencies[dep].startsWith('link:') &&
        !rootPackageData.dependencies[dep].startsWith('workspace:')) {
        productionDependencies[dep] = rootPackageData.dependencies[dep];
      }
    });
  }

  // Modify package.json as needed
  packageData.scripts = {
    ...packageData.scripts,
    start: 'node main.js',
    [`studio:${appName}`]: 'prisma studio --schema prisma/schema.prisma',
    [`migrate:${appName}`]: `prisma migrate dev --name ${appName} --schema prisma/schema.prisma`,
    [`generate:${appName}`]: `prisma generate --schema prisma/schema.prisma`,
  };

  // Use production dependencies from root package.json
  packageData.dependencies = {
    ...packageData.dependencies,
    ...productionDependencies,
    // Ensure these specific dependencies are included
    prisma: '^5.20.0',
    'ts-node': '^10.9.1',
    '@prisma/client': '^5.20.0',
    'dotenv': '^16.4.4',
    "inquirer": "^12.6.1"
  };

  packageData.prisma = {
    schema: 'prisma/schema.prisma',
    seed: 'prisma/seed.ts',
  };

  // Write the updated package.json back to the file
  fs.writeFileSync(packagePath, JSON.stringify(packageData, null, 2), 'utf8');

  console.log('package.json updated successfully with all dependencies.');
} catch (err) {
  console.error('Error updating package.json:', err);
}
