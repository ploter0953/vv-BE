const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting VtuberVerse Backend...');

// Function to deploy Discord commands
async function deployCommands() {
  return new Promise((resolve, reject) => {
    console.log('📡 Deploying Discord slash commands...');
    
    const deployProcess = spawn('node', ['deploy-commands.js'], {
      stdio: 'inherit',
      cwd: __dirname
    });

    deployProcess.on('close', (code) => {
      if (code === 0) {
        console.log('✅ Discord commands deployed successfully!');
        resolve();
      } else {
        console.log('⚠️ Discord commands deployment failed, but continuing with server start...');
        resolve(); // Continue anyway
      }
    });

    deployProcess.on('error', (error) => {
      console.log('⚠️ Error deploying Discord commands:', error.message);
      console.log('⚠️ Continuing with server start...');
      resolve(); // Continue anyway
    });
  });
}

// Function to start the server
function startServer() {
  console.log('🌐 Starting server...');
  
  const serverProcess = spawn('node', ['server.js'], {
    stdio: 'inherit',
    cwd: __dirname
  });

  serverProcess.on('close', (code) => {
    console.log(`Server exited with code ${code}`);
    process.exit(code);
  });

  serverProcess.on('error', (error) => {
    console.error('❌ Error starting server:', error);
    process.exit(1);
  });
}

// Main startup sequence
async function main() {
  try {
    // Deploy commands first
    await deployCommands();
    
    // Then start the server
    startServer();
  } catch (error) {
    console.error('❌ Startup error:', error);
    process.exit(1);
  }
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down...');
  process.exit(0);
});

// Start the application
main();