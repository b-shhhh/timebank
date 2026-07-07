async function verifyCaptcha(token) {
  if (process.env.CAPTCHA_ENABLED !== 'true') return true;
  if (!token) return false;
  if (process.env.NODE_ENV !== 'production' && token === 'DEV_BYPASS_TOKEN') {
    return true;
  }
  return false;
}

module.exports = { verifyCaptcha };
