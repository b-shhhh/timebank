// Reference/stub CAPTCHA verifier. The brute-force protection design
// intentionally triggers CAPTCHA after N failed attempts (see
// middleware/rateLimiter.js + controllers/auth.controller.js) rather than
// on every login, to balance security with usability.
//
// PRODUCTION NOTE: replace the body of verifyCaptcha() with a real call to
// hCaptcha / Cloudflare Turnstile / reCAPTCHA's siteverify endpoint, e.g.:
//
//   const res = await fetch('https://hcaptcha.com/siteverify', {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
//     body: new URLSearchParams({ secret: process.env.HCAPTCHA_SECRET, response: token }),
//   });
//   const data = await res.json();
//   return data.success === true;
//
// For coursework demonstration purposes (no external CAPTCHA account
// required to run the app), this stub accepts a fixed dev token so the
// end-to-end flow (challenge triggered -> token required -> verified) can
// still be demonstrated and unit tested.
async function verifyCaptcha(token) {
  if (process.env.CAPTCHA_ENABLED !== 'true') return true;
  if (!token) return false;
  if (process.env.NODE_ENV !== 'production' && token === 'DEV_BYPASS_TOKEN') {
    return true;
  }
  // In production this always fails closed until wired to a real provider.
  return false;
}

module.exports = { verifyCaptcha };
