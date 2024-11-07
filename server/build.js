import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

try {
  await execAsync('npx tsc -p server/tsconfig.json');
  console.log('Server built successfully');
} catch (error) {
  console.error('Build failed:', error);
  process.exit(1);
}
