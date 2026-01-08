// Dashboard Configuration Template
// Copy this file to dashboard-config.js and fill in your values
//
// SETUP INSTRUCTIONS:
// 1. Copy this file: cp dashboard-config.example.js dashboard-config.js
// 2. Generate a GitHub Personal Access Token:
//    - Go to https://github.com/settings/tokens
//    - Click "Generate new token" -> "Fine-grained token"
//    - Set expiration as needed
//    - Under "Repository access", select "Only select repositories"
//    - Choose your repository (e.g., silencelen/aspensplayground-core)
//    - Under "Permissions" -> "Repository permissions":
//      - Contents: Read-only
//      - Metadata: Read-only (auto-selected)
//    - Click "Generate token"
// 3. Replace 'YOUR_TOKEN_HERE' with your token in dashboard-config.js
//
// NOTE: dashboard-config.js is gitignored - your token will never be committed

window.DASHBOARD_CONFIG = {
  // Your GitHub Personal Access Token
  // Without a token: 60 requests/hour (per IP)
  // With a token: 5000 requests/hour
  GITHUB_TOKEN: 'YOUR_TOKEN_HERE',

  // Repository settings (change if needed)
  OWNER: 'silencelen',
  REPO: 'aspensplayground-core'
};
