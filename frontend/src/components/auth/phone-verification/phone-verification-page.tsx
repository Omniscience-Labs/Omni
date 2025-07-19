"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PhoneInput } from "./phone-input";
import { OtpVerification } from "./otp-verification";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";

interface PhoneVerificationPageProps {
  onSuccess?: () => void;
}

export function PhoneVerificationPage({ onSuccess }: PhoneVerificationPageProps) {
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const router = useRouter();

  const handlePhoneSubmit = async (phone: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch("/api/phone/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ phone_number: phone }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to send verification code");
      }

      setPhoneNumber(phone);
      setFactorId(data.factor_id);
      setStep("otp");
      setSuccess("Verification code sent to your phone");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send verification code");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpVerify = async (otp: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch("/api/phone/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          phone_number: phoneNumber,
          otp_code: otp,
          factor_id: factorId
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Invalid verification code");
      }

      setSuccess("Phone number verified successfully!");
      
      // Redirect to dashboard after 1 second
      setTimeout(() => {
        if (onSuccess) {
          onSuccess();
        } else {
          router.push("/dashboard");
        }
      }, 1000);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid verification code");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch("/api/phone/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ phone_number: phoneNumber }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to resend verification code");
      }

      setSuccess("New verification code sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resend verification code");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Phone Verification
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            {step === "phone" 
              ? "Enter your phone number to receive a verification code"
              : "Enter the 6-digit code sent to your phone"
            }
          </p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert>
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        {step === "phone" ? (
          <PhoneInput
            onSubmit={handlePhoneSubmit}
            isLoading={isLoading}
            error={error}
          />
        ) : (
          <OtpVerification
            phoneNumber={phoneNumber}
            onVerify={handleOtpVerify}
            onResend={handleResendCode}
            isLoading={isLoading}
            error={error}
          />
        )}
      </div>
    </div>
  );
}