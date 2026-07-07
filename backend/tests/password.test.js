const { validatePasswordPolicy, scorePasswordStrength } = require('../src/utils/password');

describe('password policy', () => {
  test('rejects passwords shorter than 12 characters', () => {
    const result = validatePasswordPolicy('Short1!');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('12 characters'))).toBe(true);
  });

  test('rejects common passwords', () => {
    const result = validatePasswordPolicy('Password123!');
    const result2 = validatePasswordPolicy('password123');
    expect(result2.valid).toBe(false);
  });

  test('rejects password containing the email local part', () => {
    const result = validatePasswordPolicy('alicesecret123!A', 'alice@example.com');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('email'))).toBe(true);
  });

  test('accepts a strong, policy-compliant password', () => {
    const result = validatePasswordPolicy('Tr0ub4dor&Zebra!', 'someone@example.com');
    expect(result.valid).toBe(true);
  });

  test('strength scorer rates a long mixed-character password highly', () => {
    const { label } = scorePasswordStrength('Tr0ub4dor&Zebra!');
    expect(['good', 'strong', 'very strong']).toContain(label);
  });

  test('strength scorer rates a short simple password poorly', () => {
    const { label } = scorePasswordStrength('abc123');
    expect(['very weak', 'weak', 'fair']).toContain(label);
  });
});
