import { backendApi } from '@/lib/api-client';
import { createClient } from '@/lib/supabase/client';



export interface FactorInfo {
  id: string;
  friendly_name?: string;
  factor_type?: string;
  status?: string;
  phone?: string;
  created_at?: string;
  updated_at?: string;
}

export interface PhoneVerificationEnroll {
  friendly_name: string;
  phone_number: string;
}

export interface PhoneVerificationChallenge {
  factor_id: string;
}

export interface PhoneVerificationVerify {
  factor_id: string;
  challenge_id: string;
  code: string;
}

export interface PhoneVerificationChallengeAndVerify {
  factor_id: string;
  code: string;
}

export interface PhoneVerificationResponse {
  success: boolean;
  message?: string;
  id?: string;
  expires_at?: string;
}

export interface EnrollFactorResponse {
  id: string;
  friendly_name: string;
  phone_number: string;
  qr_code?: string;
  secret?: string;
}

export interface ChallengeResponse {
  id: string;
  expires_at?: string;
}

export interface ListFactorsResponse {
  factors: FactorInfo[];
}

export interface AALResponse {
  current_level?: string;
  next_level?: string;
  current_authentication_methods?: string[];
  // Add action guidance based on AAL status
  action_required?: string;
  message?: string;
  // Phone verification requirement fields
  phone_verification_required?: boolean;
  user_created_at?: string;
  cutoff_date?: string;
  // Computed verification status fields (same as PhoneVerificationStatus)
  verification_required?: boolean;
  is_verified?: boolean;
  factors?: FactorInfo[];
}




export const phoneVerificationService = {



  /**
   * Enroll phone number for SMS-based 2FA
   */
  async enrollPhoneNumber(data: PhoneVerificationEnroll): Promise<EnrollFactorResponse> {
    const response = await backendApi.post<EnrollFactorResponse>('/mfa/enroll', data);
    return response.data;
  },

  /**
   * Create a challenge for an enrolled phone factor (sends SMS)
   */
  async createChallenge(data: PhoneVerificationChallenge): Promise<ChallengeResponse> {
    const response = await backendApi.post<ChallengeResponse>('/mfa/challenge', data);
    return response.data;
  },

  /**
   * Verify SMS code for phone verification
   */
  async verifyChallenge(data: PhoneVerificationVerify): Promise<PhoneVerificationResponse> {
    try {
      const response = await backendApi.post('/mfa/verify', data);
      
      // After successful verification, refresh the Supabase session
      // This ensures the frontend client gets the updated session with AAL2 tokens
      try {
        const supabase = createClient();
        await supabase.auth.refreshSession();
        console.log("🔄 Frontend Supabase session refreshed after verification");
      } catch (refreshError) {
        console.warn("⚠️ Failed to refresh Supabase session:", refreshError);
      }
      
      return {
        success: response.data.success || true,
        message: response.data.message || 'SMS code verified successfully'
      };
    } catch (error) {
      console.error("❌ Verify challenge failed:", error);
      throw error;
    }
  },

  /**
   * Create challenge and verify in one step
   */
  async challengeAndVerify(data: PhoneVerificationChallengeAndVerify): Promise<PhoneVerificationResponse> {
    const response = await backendApi.post('/mfa/challenge-and-verify', data);
    return {
      success: response.data.success || true,
      message: response.data.message || 'SMS challenge created and verified successfully'
    };
  },

  /**
   * Resend SMS code (create new challenge for existing factor)
   */
  async resendSMS(factorId: string): Promise<ChallengeResponse> {
    const response = await backendApi.post<ChallengeResponse>('/mfa/challenge', { factor_id: factorId });
    return response.data;
  },

  /**
   * List all enrolled MFA factors
   */
  async listFactors(): Promise<ListFactorsResponse> {
    const response = await backendApi.get<ListFactorsResponse>('/mfa/factors');
    return response.data;
  },

  /**
   * Remove phone verification from account
   */
  async unenrollFactor(factorId: string): Promise<PhoneVerificationResponse> {
    const response = await backendApi.post('/mfa/unenroll', { factor_id: factorId });
    return {
      success: response.data.success || true,
      message: response.data.message || 'Phone factor unenrolled successfully'
    };
  },

  /**
   * Get Authenticator Assurance Level
   */
  async getAAL(): Promise<AALResponse> {
    const response = await backendApi.get<AALResponse>('/mfa/aal');
    return response.data;
  }
};