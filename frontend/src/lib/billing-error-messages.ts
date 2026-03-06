/**
 * Returns alert title, subtitle, and toast message for billing errors based on error_code.
 * Used when opening the payment/pricing modal.
 */
export function getBillingErrorAlert(
  errorCode?: string | null,
  balance?: string | null
): { alertTitle: string; alertSubtitle: string; toastMessage: string } {
  switch (errorCode) {
    case 'INSUFFICIENT_CREDITS':
      if (balance) {
        return {
          alertTitle: 'You ran out of credits',
          alertSubtitle: `Your current balance is ${balance} credits. Upgrade your plan to continue.`,
          toastMessage: `Your balance is ${balance} credits. Upgrade your plan to continue.`,
        };
      }
      return {
        alertTitle: 'You ran out of credits',
        alertSubtitle: 'Upgrade your plan to get more credits and continue using the AI assistant.',
        toastMessage: 'You ran out of credits. Upgrade your plan to continue.',
      };
    case 'MONTHLY_LIMIT_EXCEEDED':
      return {
        alertTitle: 'Monthly limit exceeded',
        alertSubtitle: 'You\'ve used your monthly credit allowance. Contact your administrator to increase your monthly limit.',
        toastMessage: 'You\'ve used your monthly credit allowance. Contact your administrator to increase your monthly limit.',
      };
    case 'INSUFFICIENT_POOL_BALANCE':
      return {
        alertTitle: 'Credit pool exhausted',
        alertSubtitle: 'The shared credit pool is below minimum threshold. Contact your administrator to add credits.',
        toastMessage: 'The shared credit pool is below minimum threshold. Contact your administrator to add credits.',
      };
    default:
      if (balance) {
        return {
          alertTitle: 'You ran out of credits',
          alertSubtitle: `Your current balance is ${balance} credits. Upgrade your plan to continue.`,
          toastMessage: `Your balance is ${balance} credits. Upgrade your plan to continue.`,
        };
      }
      return {
        alertTitle: 'You ran out of credits',
        alertSubtitle: 'Upgrade your plan to get more credits and continue using the AI assistant.',
        toastMessage: 'You ran out of credits. Upgrade your plan to continue.',
      };
  }
}

/**
 * Parse error_code from human-readable error string (keyword matching).
 * Catches backend messages such as:
 * - INSUFFICIENT_POOL_BALANCE: "Enterprise credit pool is empty...", "The shared credit pool is below minimum threshold"
 * - MONTHLY_LIMIT_EXCEEDED: "Monthly spending limit of $X exceeded...", "Monthly spending limit exceeded"
 * - INSUFFICIENT_CREDITS: "Insufficient credits. Your balance is X credits...", "Billing check failed: ..."
 */
export function parseBillingErrorCode(error: string | null | undefined): string | null {
  if (!error || typeof error !== 'string') return null;
  if (/pool/i.test(error) && /empty|exhausted|below|threshold/i.test(error)) return 'INSUFFICIENT_POOL_BALANCE';
  if (/monthly/i.test(error) && /limit|spending/i.test(error)) return 'MONTHLY_LIMIT_EXCEEDED';
  if (/insufficient|out of credits|balance.*credit|credit.*balance/i.test(error)) return 'INSUFFICIENT_CREDITS';
  return null;
}

/** Extract credit balance from error string (e.g. "Your balance is 5 credits" -> "5") */
export function parseBillingBalance(error: string | null | undefined): string | null {
  if (!error || typeof error !== 'string') return null;
  const match = error.match(/balance is (-?\d+)\s*credits/i);
  return match ? match[1] : null;
}
