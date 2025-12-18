/**
 * Shared password validation utility
 * Used by both signup and admin password reset features
 */

export const PASSWORD_POLICY = {
  minLength: 8,
  maxLength: 128,
  requireNumber: false,
  requireSymbol: false,
  requireUppercase: false,
  requireLowercase: false,
} as const;

export interface PasswordValidationResult {
  isValid: boolean;
  errors: string[];
}

export function validatePassword(password: string): PasswordValidationResult {
  const errors: string[] = [];

  if (!password) {
    errors.push("Password is required");
    return { isValid: false, errors };
  }

  if (password.length < PASSWORD_POLICY.minLength) {
    errors.push(`Password must be at least ${PASSWORD_POLICY.minLength} characters`);
  }

  if (password.length > PASSWORD_POLICY.maxLength) {
    errors.push(`Password must be less than ${PASSWORD_POLICY.maxLength} characters`);
  }

  if (PASSWORD_POLICY.requireNumber && !/\d/.test(password)) {
    errors.push("Password must contain at least 1 number");
  }

  if (PASSWORD_POLICY.requireSymbol && !/[!@#$%^&*(),.?":{}|<>\-_=+\[\]\\;'`~]/.test(password)) {
    errors.push("Password must contain at least 1 symbol");
  }

  if (PASSWORD_POLICY.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push("Password must contain at least 1 uppercase letter");
  }

  if (PASSWORD_POLICY.requireLowercase && !/[a-z]/.test(password)) {
    errors.push("Password must contain at least 1 lowercase letter");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export function getPasswordRequirementsText(): string {
  const requirements: string[] = [];
  
  requirements.push(`At least ${PASSWORD_POLICY.minLength} characters`);
  
  if (PASSWORD_POLICY.requireNumber) {
    requirements.push("At least 1 number");
  }
  if (PASSWORD_POLICY.requireSymbol) {
    requirements.push("At least 1 symbol");
  }
  if (PASSWORD_POLICY.requireUppercase) {
    requirements.push("At least 1 uppercase letter");
  }
  if (PASSWORD_POLICY.requireLowercase) {
    requirements.push("At least 1 lowercase letter");
  }

  return requirements.join(" • ");
}
