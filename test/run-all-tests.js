import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

function runCommand(command, args, cwd = __dirname) {
  return new Promise((resolve, reject) => {
    console.log(`${colors.blue}Running command: ${command} ${args.join(' ')}${colors.reset}`);

    const processHandle = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      shell: true,
    });

    processHandle.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });

    processHandle.on('error', reject);
  });
}

function runTestFile(testFile) {
  return new Promise((resolve) => {
    console.log(`\n${colors.cyan}Running test module: ${testFile}${colors.reset}`);
    const startTime = Date.now();

    const processHandle = spawn('node', [testFile], {
      cwd: __dirname,
      stdio: 'inherit',
      shell: false,
    });

    processHandle.on('close', (code) => {
      const duration = Date.now() - startTime;
      if (code === 0) {
        console.log(`${colors.green}✓ Test passed: ${testFile} (${duration}ms)${colors.reset}`);
        resolve({ success: true, file: testFile, duration, exitCode: code });
      } else {
        console.error(
          `${colors.red}✗ Test failed: ${testFile} (${duration}ms) - Exit code: ${code}${colors.reset}`,
        );
        resolve({ success: false, file: testFile, duration, exitCode: code });
      }
    });

    processHandle.on('error', (error) => {
      const duration = Date.now() - startTime;
      console.error(`${colors.red}✗ Error running ${testFile}: ${error.message}${colors.reset}`);
      resolve({ success: false, file: testFile, duration, error: error.message });
    });
  });
}

async function buildProject() {
  console.log(`\n${colors.cyan}===== Building project =====${colors.reset}\n`);
  await runCommand('npm', ['run', 'build']);
}

async function discoverTestFiles() {
  const files = await fs.readdir(__dirname);
  const discoveredTests = files
    .filter(
      (file) =>
        file.startsWith('test') &&
        file.endsWith('.js') &&
        file !== 'run-all-tests.js',
    )
    .sort();

  if (discoveredTests.includes('test.js')) {
    discoveredTests.splice(discoveredTests.indexOf('test.js'), 1);
    discoveredTests.unshift('test.js');
  }

  return discoveredTests.map((file) => `./${file}`);
}

async function runTestModules() {
  console.log(`\n${colors.cyan}===== Running tests =====${colors.reset}\n`);

  const testFiles = await discoverTestFiles();
  if (testFiles.length === 0) {
    console.warn(`${colors.yellow}Warning: No test files found${colors.reset}`);
    return { success: true, results: [] };
  }

  console.log(`${colors.blue}Found ${testFiles.length} test files:${colors.reset}`);
  for (const testFile of testFiles) {
    console.log(`  - ${testFile}`);
  }

  const results = [];
  for (const testFile of testFiles) {
    results.push(await runTestFile(testFile));
  }

  const passed = results.filter((result) => result.success).length;
  const failedTests = results.filter((result) => !result.success);
  const totalDuration = results.reduce((sum, result) => sum + (result.duration || 0), 0);

  console.log(`\n${colors.bold}${colors.cyan}===== TEST SUMMARY =====${colors.reset}\n`);
  console.log(`  Total tests:     ${results.length}`);
  console.log(`  ${colors.green}✓ Passed:        ${passed}${colors.reset}`);
  console.log(
    `  ${failedTests.length > 0 ? colors.red : colors.green}✗ Failed:        ${failedTests.length}${colors.reset}`,
  );
  console.log(`  Total duration:  ${totalDuration}ms (${(totalDuration / 1000).toFixed(1)}s)`);

  if (failedTests.length > 0) {
    console.log(`\n${colors.red}${colors.bold}Failed Tests:${colors.reset}`);
    for (const test of failedTests) {
      console.log(`  ${colors.red}✗ ${test.file}${colors.reset}`);
      if (test.exitCode !== undefined) console.log(`    Exit code: ${test.exitCode}`);
      if (test.error) console.log(`    Error: ${test.error}`);
    }
  }

  console.log(`\n${colors.cyan}===== Test run completed =====${colors.reset}\n`);
  return { success: failedTests.length === 0, results };
}

async function main() {
  const overallStartTime = Date.now();
  console.log(`${colors.bold}${colors.cyan}===== LOCAL MCP TEST RUNNER =====${colors.reset}`);
  console.log(`${colors.blue}Starting test execution at ${new Date().toISOString()}${colors.reset}\n`);

  await buildProject();
  const testResult = await runTestModules();

  const overallDuration = Date.now() - overallStartTime;
  console.log(
    `${colors.blue}Total execution time: ${overallDuration}ms (${(overallDuration / 1000).toFixed(1)}s)${colors.reset}`,
  );
  process.exit(testResult.success ? 0 : 1);
}

process.on('uncaughtException', (error) => {
  console.error(`\n${colors.red}${colors.bold}UNCAUGHT EXCEPTION:${colors.reset}`);
  console.error(`${colors.red}${error.message}${colors.reset}`);
  if (error.stack) console.error(`${colors.red}${error.stack}${colors.reset}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error(`\n${colors.red}${colors.bold}UNHANDLED REJECTION:${colors.reset}`);
  console.error(`${colors.red}${String(reason)}${colors.reset}`);
  process.exit(1);
});

main().catch((error) => {
  console.error(`\n${colors.red}${colors.bold}MAIN FUNCTION ERROR:${colors.reset}`);
  console.error(`${colors.red}${error.message}${colors.reset}`);
  if (error.stack) console.error(`${colors.red}${error.stack}${colors.reset}`);
  process.exit(1);
});
