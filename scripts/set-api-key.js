#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const envPath = path.resolve(__dirname, '..', '.env');

// Function to update the .env file
function updateEnvFile(apiKey) {
  try {
    // Read the current .env file
    let envContent = fs.readFileSync(envPath, 'utf8');
    
    // Replace the placeholder with the actual API key
    envContent = envContent.replace(/ANTHROPIC_API_KEY=.*$/m, `ANTHROPIC_API_KEY=${apiKey}`);
    
    // Write the updated content back to the file
    fs.writeFileSync(envPath, envContent);
    console.log('✅ API key updated successfully!');
  } catch (error) {
    console.error('❌ Error updating API key:', error.message);
  }
}

// Main function
function main() {
  console.log('🔑 Anthropic API Key Setup');
  console.log('-------------------------');
  console.log('This script will update your .env file with your Anthropic API key.');
  console.log('You can get an API key from: https://console.anthropic.com/');
  console.log('');
  
  rl.question('Enter your Anthropic API key: ', (apiKey) => {
    if (!apiKey.trim()) {
      console.log('❌ API key cannot be empty. Exiting without changes.');
    } else {
      updateEnvFile(apiKey.trim());
    }
    rl.close();
  });
}

main(); 