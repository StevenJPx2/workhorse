/**
 * HTML templates for OAuth callback pages.
 *
 * @module @jiratown/core/auth/oauth-html
 */

/**
 * Success HTML page shown after OAuth completes.
 */
export function successHtml(): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <title>Authentication Successful</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    .container {
      text-align: center;
      padding: 40px;
      background: rgba(255,255,255,0.1);
      border-radius: 16px;
      backdrop-filter: blur(10px);
    }
    h1 { margin-bottom: 10px; }
    p { opacity: 0.9; }
    .icon { font-size: 64px; margin-bottom: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">✓</div>
    <h1>Authentication Successful!</h1>
    <p>You can close this window and return to Jiratown.</p>
  </div>
</body>
</html>`;
}

/**
 * Error HTML page shown if OAuth fails.
 */
export function errorHtml(message: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <title>Authentication Failed</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #ff6b6b 0%, #ee5a5a 100%);
      color: white;
    }
    .container {
      text-align: center;
      padding: 40px;
      background: rgba(255,255,255,0.1);
      border-radius: 16px;
      backdrop-filter: blur(10px);
      max-width: 500px;
    }
    h1 { margin-bottom: 10px; }
    p { opacity: 0.9; }
    .icon { font-size: 64px; margin-bottom: 20px; }
    .error {
      background: rgba(0,0,0,0.2);
      padding: 15px;
      border-radius: 8px;
      margin-top: 20px;
      font-family: monospace;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">✕</div>
    <h1>Authentication Failed</h1>
    <p>Something went wrong during authentication.</p>
    <div class="error">${escapeHtml(message)}</div>
    <p style="margin-top: 20px;">Please close this window and try again.</p>
  </div>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
