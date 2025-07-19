"use client";

import { useGetAAL } from '@/hooks/react-query/phone-verification';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Shield, ShieldAlert, ShieldCheck, ShieldX, Phone } from 'lucide-react';

/**
 * AALStatusDisplay component shows the current AAL status and what action is required.
 * Useful for debugging and understanding the MFA flow.
 */
export function AALStatusDisplay() {
  const { data: aalData, isLoading: aalLoading, error: aalError } = useGetAAL();

  if (aalLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            MFA Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Checking MFA status...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (aalError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldX className="w-5 h-5 text-red-500" />
            MFA Status Error
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertDescription>
              Failed to check MFA status: {aalError instanceof Error ? aalError?.message : 'Unknown error'}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (!aalData) {
    return null;
  }

  const getStatusIcon = () => {
    // Check if new user needs phone verification enrollment
    if (aalData?.phone_verification_required && 
        aalData.current_level === "aal1" && 
        aalData.next_level === "aal1") {
      return <Phone className="w-5 h-5 text-orange-500" />;
    }

    switch (aalData?.action_required) {
      case 'none':
        return <ShieldCheck className="w-5 h-5 text-green-500" />;
      case 'verify_mfa':
        return <ShieldAlert className="w-5 h-5 text-yellow-500" />;
      case 'reauthenticate':
        return <ShieldX className="w-5 h-5 text-red-500" />;
      default:
        return <Shield className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusColor = () => {
    // Check if new user needs phone verification enrollment
    if (aalData?.phone_verification_required && 
        aalData.current_level === "aal1" && 
        aalData.next_level === "aal1") {
      return 'bg-orange-100 text-orange-800';
    }

    switch (aalData?.action_required) {
      case 'none':
        return 'bg-green-100 text-green-800';
      case 'verify_mfa':
        return 'bg-yellow-100 text-yellow-800';
      case 'reauthenticate':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getActionDescription = () => {
    const current = aalData?.current_level;
    const next = aalData?.next_level;
    const isNewUser = aalData?.phone_verification_required;
    
    if (current === 'aal1' && next === 'aal1') {
      if (isNewUser) {
        return 'As a new user, you are required to set up phone verification for enhanced security.';
      } else {
        return 'MFA is not enrolled for this account. You can optionally set up MFA for enhanced security.';
      }
    } else if (current === 'aal1' && next === 'aal2') {
      return 'MFA is enrolled but not verified. Please complete MFA verification to access all features.';
    } else if (current === 'aal2' && next === 'aal2') {
      return 'MFA is fully verified and active. Your account has enhanced security.';
    } else if (current === 'aal2' && next === 'aal1') {
      return 'MFA settings have changed. Please sign in again to refresh your session.';
    } else {
      return `Unknown AAL combination: ${current} → ${next}`;
    }
  };

  const getEffectiveAction = () => {
    // Check if new user needs phone verification enrollment
    if (aalData?.phone_verification_required && 
        aalData.current_level === "aal1" && 
        aalData.next_level === "aal1") {
      return 'ENROLL MFA';
    }

    return aalData?.action_required?.replace('_', ' ').toUpperCase() || 'UNKNOWN';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {getStatusIcon()}
          Multi-Factor Authentication Status
        </CardTitle>
        <CardDescription>
          Current security level and required actions
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-600">Current Level</label>
            <Badge variant="outline" className="ml-2">
              {aalData.current_level?.toUpperCase() || 'Unknown'}
            </Badge>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600">Next Level</label>
            <Badge variant="outline" className="ml-2">
              {aalData.next_level?.toUpperCase() || 'Unknown'}
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-600">Action Required</label>
            <Badge className={`ml-2 ${getStatusColor()}`}>
              {getEffectiveAction()}
            </Badge>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600">User Type</label>
            <Badge variant="outline" className="ml-2">
              {aalData?.phone_verification_required ? 'NEW USER' : 'EXISTING USER'}
            </Badge>
          </div>
        </div>

        {aalData && (
          <div>
            <label className="text-sm font-medium text-gray-600">Phone Verification Required</label>
            <Badge 
              variant={aalData.phone_verification_required ? "destructive" : "secondary"}
              className="ml-2"
            >
              {aalData.phone_verification_required ? 'YES' : 'NO'}
            </Badge>
            {aalData.user_created_at && (
              <p className="text-xs text-gray-500 mt-1">
                Account created: {new Date(aalData.user_created_at).toLocaleDateString()}
              </p>
            )}
          </div>
        )}

        {aalData.current_authentication_methods && aalData.current_authentication_methods.length > 0 && (
          <div>
            <label className="text-sm font-medium text-gray-600">Authentication Methods</label>
            <div className="flex flex-wrap gap-1 mt-1">
              {aalData.current_authentication_methods.map((method, index) => (
                <Badge key={index} variant="secondary" className="text-xs">
                  {method}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <Alert>
          <AlertDescription>
            {aalData.message || getActionDescription()}
          </AlertDescription>
        </Alert>

        <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded">
          <strong>AAL Flow Reference:</strong>
          <ul className="mt-1 space-y-1">
            <li>• aal1 → aal1: No MFA enrolled{aalData?.phone_verification_required ? ' (new users must enroll)' : ' (optional for existing users)'}</li>
            <li>• aal1 → aal2: MFA enrolled, verification required</li>
            <li>• aal2 → aal2: MFA verified and active</li>
            <li>• aal2 → aal1: MFA disabled, reauthentication needed</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
} 