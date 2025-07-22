# Google OAuth Setup Guide

This guide will help you configure Google Sign-In for your Suna application to avoid common errors like "Access blocked: This app's request is invalid".

## Prerequisites

- A Google Cloud Console account
- Your Supabase project URL and anon key

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a project" → "New Project"
3. Enter a project name (e.g., "Suna App")
4. Click "Create"

## Step 2: Configure OAuth Consent Screen

1. In the Google Cloud Console, go to "APIs & Services" → "OAuth consent screen"
2. Select "External" user type (unless you have a Google Workspace account)
3. Click "Create"
4. Fill in the required fields:
   - **App name**: Your application name (e.g., "Suna")
   - **User support email**: Your email address
   - **App logo**: Optional, but recommended
   - **App domain**: Your domain (for local dev, skip this)
   - **Authorized domains**: Add your domain(s)
   - **Developer contact information**: Your email address
5. Click "Save and Continue"
6. **Scopes**: Click "Add or Remove Scopes"
   - Select `.../auth/userinfo.email`
   - Select `.../auth/userinfo.profile`
   - Select `openid`
   - Click "Update"
7. Click "Save and Continue"
8. **Test users**: Add test email addresses if in testing mode
9. Click "Save and Continue"
10. Review and click "Back to Dashboard"

## Step 3: Create OAuth 2.0 Credentials

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth client ID"
3. Select "Web application" as the application type
4. Configure the client:
   - **Name**: "Suna Web Client" (or any name you prefer)
   - **Authorized JavaScript origins**:
     - Add `http://localhost:3000` (for local development)
     - Add `https://yourdomain.com` (for production)
     - Add your Supabase URL (e.g., `https://yourproject.supabase.co`)
   - **Authorized redirect URIs**:
     - Add `http://localhost:3000/auth/callback` (for local development)
     - Add `https://yourdomain.com/auth/callback` (for production)
     - Add your Supabase auth callback URL: `https://yourproject.supabase.co/auth/v1/callback`
5. Click "Create"
6. **Important**: Copy the "Client ID" - you'll need this

## Step 4: Configure Supabase

1. Go to your [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Go to "Authentication" → "Providers"
4. Find "Google" and enable it
5. Add your Google OAuth credentials:
   - **Client ID**: Paste the Client ID from Step 3
   - **Client Secret**: Leave empty (not needed for web applications)
6. **Authorized Client IDs**: Add your Client ID here as well
7. Click "Save"

## Step 5: Configure Your Application

1. Add the Google Client ID to your environment variables:

   **Frontend** (`frontend/.env.local`):
   ```env
   NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-client-id-here
   ```

2. Restart your development server

## Step 6: Test Your Setup

1. Open your application in a browser
2. Click the "Continue with Google" button
3. You should see the Google sign-in popup
4. Select an account and authorize the application
5. You should be redirected back to your application and logged in

## Common Issues and Solutions

### "Access blocked: This app's request is invalid"

This error usually means:
- **Missing redirect URI**: Make sure all your redirect URIs are added in Google Cloud Console
- **Wrong Client ID**: Verify you're using the correct Client ID
- **OAuth consent screen not configured**: Complete all required fields in the consent screen

### "redirect_uri_mismatch"

- Check that your redirect URIs in Google Cloud Console exactly match your application URLs
- Include the protocol (`http://` or `https://`)
- Don't include trailing slashes
- For local development, use `http://localhost:3000`, not `http://127.0.0.1:3000`

### "invalid_client"

- Verify your Client ID is correct in the environment variables
- Make sure you're using the Web application client ID, not a different type
- Check that the OAuth client hasn't been deleted in Google Cloud Console

### Google button doesn't appear

- Check browser console for errors
- Verify `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is set in your environment
- Make sure the Google Identity Services script is loading

## Production Deployment

When deploying to production:

1. Update Google Cloud Console:
   - Add your production domain to "Authorized JavaScript origins"
   - Add your production callback URL to "Authorized redirect URIs"
   - Update the OAuth consent screen with production information

2. Update your production environment variables:
   - Set `NEXT_PUBLIC_GOOGLE_CLIENT_ID` in your deployment platform

3. Verify Supabase settings:
   - Ensure Google provider is enabled
   - Confirm the Client ID is set correctly

## Security Best Practices

1. **Never commit your Client ID to version control** - always use environment variables
2. **Use HTTPS in production** - Google requires secure connections for OAuth
3. **Restrict your OAuth client** - Only add the domains you actually use
4. **Review permissions regularly** - Remove unused test users and unnecessary scopes
5. **Monitor usage** - Check Google Cloud Console for unusual activity

## Publishing Your App

If you want to remove the "unverified app" warning:

1. Go to "OAuth consent screen" in Google Cloud Console
2. Click "Publish App"
3. Google may require verification for certain scopes
4. Follow the verification process if required

## Need Help?

If you're still experiencing issues:
1. Check the browser console for detailed error messages
2. Verify all URLs and IDs are correctly copied
3. Ensure your Supabase project is properly configured
4. Try using an incognito/private browser window to rule out cache issues 