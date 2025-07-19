"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";

interface PhoneInputProps {
  onSubmit: (phoneNumber: string) => Promise<void>;
  isLoading?: boolean;
  error?: string | null;
}

export function PhoneInput({ onSubmit, isLoading = false, error = null }: PhoneInputProps) {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    // Basic validation
    if (!phoneNumber.trim()) {
      setLocalError("Please enter a phone number");
      return;
    }

    // Simple phone number validation (international format)
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    if (!phoneRegex.test(phoneNumber.replace(/\s/g, ""))) {
      setLocalError("Please enter a valid phone number");
      return;
    }

    await onSubmit(phoneNumber);
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Phone Verification</CardTitle>
        <CardDescription>
          Enter your phone number to get OTP via SMS
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              type="tel"
              placeholder="+1234567890"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              disabled={isLoading}
              className="text-lg"
            />
            <p className="text-sm text-muted-foreground">
              Include country code (e.g., +1 for US)
            </p>
          </div>

          {(error || localError) && (
            <Alert variant="destructive">
              <AlertDescription>{error || localError}</AlertDescription>
            </Alert>
          )}

          <Button 
            type="submit" 
            className="w-full" 
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending code...
              </>
            ) : (
              "Send Verification Code"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}