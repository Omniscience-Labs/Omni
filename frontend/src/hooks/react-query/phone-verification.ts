import { useMutation, useQuery } from '@tanstack/react-query';
import { phoneVerificationService } from '@/lib/api/phone-verification';

interface PhoneSubmitData {
  phone_number: string;
  country_code: string;
}

interface PhoneVerifyData {
  phone_number: string;
  otp_code: string;
}

interface PhoneStatusResponse {
  is_verified: boolean;
  phone_number?: string;
  verification_required: boolean;
}

// React Query hooks
export const usePhoneVerificationStatus = () => {
  return useQuery({
    queryKey: ['phone-verification-status'],
    queryFn: phoneVerificationService.getStatus,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  });
};

export const useSubmitPhone = () => {
  return useMutation({
    mutationFn: phoneVerificationService.submitPhoneNumber,
  });
};

export const useVerifyOtp = () => {
  return useMutation({
    mutationFn: phoneVerificationService.verifyOTP,
  });
};

export const useResendOtp = () => {
  return useMutation({
    mutationFn: phoneVerificationService.resendOTP,
  });
};

export const useRemovePhoneVerification = () => {
  return useMutation({
    mutationFn: phoneVerificationService.removePhoneVerification,
  });
};