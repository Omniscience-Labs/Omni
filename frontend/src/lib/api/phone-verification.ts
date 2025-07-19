import { backendApi } from '@/lib/api-client';

export interface PhoneVerificationStatus {
  is_verified: boolean;
  phone_number?: string;
  verification_required: boolean;
}

export interface PhoneVerificationSubmit {
  phone_number: string;
  country_code: string;
}

export interface PhoneVerificationVerify {
  phone_number: string;
  otp_code: string;
}

export interface PhoneVerificationResponse {
  success: boolean;
  message?: string;
  requires_otp?: boolean;
}

export interface OTPVerificationResponse {
  success: boolean;
  message?: string;
  is_verified?: boolean;
}

export const phoneVerificationService = {
  /**
   * Get phone verification status for the current user
   */
  async getStatus(): Promise<PhoneVerificationStatus> {
    const response = await backendApi.get('/mfa/phone/status');
    return response.data;
  },

  /**
   * Submit phone number for verification
   */
  async submitPhoneNumber(data: PhoneVerificationSubmit): Promise<PhoneVerificationResponse> {
    const response = await backendApi.post('/mfa/phone/submit', data);
    return response.data;
  },

  /**
   * Verify OTP code for phone verification
   */
  async verifyOTP(data: PhoneVerificationVerify): Promise<OTPVerificationResponse> {
    const response = await backendApi.post('/mfa/phone/verify', data);
    return response.data;
  },

  /**
   * Resend OTP code to phone number
   */
  async resendOTP(phoneNumber: string): Promise<PhoneVerificationResponse> {
    const response = await backendApi.post('/mfa/phone/resend', { phone_number: phoneNumber });
    return response.data;
  },

  /**
   * Remove phone verification from account
   */
  async removePhoneVerification(): Promise<PhoneVerificationResponse> {
    const response = await backendApi.delete('/mfa/phone/remove');
    return response.data;
  }
};