import os
import logging
from typing import Optional
import mailtrap as mt
from core.utils.config import config

logger = logging.getLogger(__name__)

class EmailService:
    def __init__(self):
        self.api_token = os.getenv('MAILTRAP_API_TOKEN')
        self.sender_email = os.getenv('MAILTRAP_SENDER_EMAIL', 'hey@omnisciencelabs.com')
        self.sender_name = os.getenv('MAILTRAP_SENDER_NAME', 'Omni Team')
        self.hello_email = os.getenv('MAILTRAP_SENDER_EMAIL', 'hello@omnisciencelabs.com')

        if not self.api_token:
            logger.warning("MAILTRAP_API_TOKEN not found in environment variables")
            self.client = None
        else:
            self.client = mt.MailtrapClient(token=self.api_token)

    def send_welcome_email(self, user_email: str, user_name: Optional[str] = None) -> bool:
        if not self.client:
            logger.error("Cannot send email: MAILTRAP_API_TOKEN not configured")
            return False

        if not user_name:
            user_name = user_email.split('@')[0].title()

        subject = "🎉 Welcome to Omni — Let's Get Started"
        html_content = self._get_welcome_email_template(user_name)
        text_content = self._get_welcome_email_text(user_name)

        return self._send_email(
            to_email=user_email,
            to_name=user_name,
            subject=subject,
            html_content=html_content,
            text_content=text_content
        )

    def send_referral_email(
        self,
        recipient_email: str,
        recipient_name: str,
        sender_name: str,
        referral_url: str
    ) -> bool:
        if not self.client:
            logger.error("Cannot send email: MAILTRAP_API_TOKEN not configured")
            return False

        subject = "🎉 You're invited!"
        html_content = self._get_referral_email_template(recipient_name, sender_name, referral_url)
        text_content = self._get_referral_email_text(recipient_name, sender_name, referral_url)

        try:
            sender_email_to_use = self.hello_email

            logger.info(f"Attempting to send referral email from {sender_email_to_use} to {recipient_email}")

            mail = mt.Mail(
                sender=mt.Address(email=sender_email_to_use, name='Omni'),
                to=[mt.Address(email=recipient_email, name=recipient_name)],
                subject=subject,
                text=text_content,
                html=html_content,
                category="referral"
            )

            response = self.client.send(mail)

            logger.info(f"Referral email sent to {recipient_email} from {sender_name}. Response: {response}")
            return True

        except Exception as e:
            error_type = type(e).__name__
            error_details = str(e)
            logger.error(f"Error sending referral email to {recipient_email}: {error_details}")
            logger.error(f"Error type: {error_type}")
            logger.error(f"Mailtrap API Token present: {bool(self.api_token)}, Token prefix: {self.api_token[:8] if self.api_token else 'None'}...")
            logger.error(f"Sender email: {sender_email_to_use}")

            if hasattr(e, 'response'):
                logger.error(f"Response status: {e.response.status_code if hasattr(e.response, 'status_code') else 'unknown'}")
                logger.error(f"Response body: {e.response.text if hasattr(e.response, 'text') else 'unknown'}")

            return False

    def _send_email(
        self,
        to_email: str,
        to_name: str,
        subject: str,
        html_content: str,
        text_content: str
    ) -> bool:
        try:
            mail = mt.Mail(
                sender=mt.Address(email=self.sender_email, name=self.sender_name),
                to=[mt.Address(email=to_email, name=to_name)],
                subject=subject,
                text=text_content,
                html=html_content,
                category="welcome"
            )

            response = self.client.send(mail)

            logger.debug(f"Welcome email sent to {to_email}. Response: {response}")
            return True

        except Exception as e:
            logger.error(f"Error sending email to {to_email}: {str(e)}")
            return False

    def _get_welcome_email_template(self, user_name: str) -> str:
        return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Omni</title>
  <style>
    body {{
      font-family: Arial, sans-serif;
      background-color: #ffffff;
      color: #000000;
      margin: 0;
      padding: 0;
      line-height: 1.6;
    }}
    .container {{
      max-width: 600px;
      margin: 40px auto;
      padding: 30px;
      background-color: #ffffff;
    }}
    .logo-container {{
      text-align: center;
      margin-bottom: 30px;
      padding: 10px 0;
    }}
    .logo {{
      max-width: 100%;
      height: auto;
      max-height: 60px;
      display: inline-block;
    }}
    h1 {{
      font-size: 24px;
      color: #000000;
      margin-bottom: 20px;
    }}
    p {{
      margin-bottom: 16px;
    }}
    a {{
      color: #3366cc;
      text-decoration: none;
    }}
    a:hover {{
      text-decoration: underline;
    }}
    .button {{
      display: inline-block;
      margin-top: 30px;
      background-color: #3B82F6;
      color: white !important;
      padding: 14px 24px;
      text-align: center;
      text-decoration: none;
      font-weight: bold;
      border-radius: 6px;
      border: none;
    }}
    .button:hover {{
      background-color: #2563EB;
      text-decoration: none;
    }}
    .emoji {{
      font-size: 20px;
    }}
  </style>
</head>
<body>
  <div class="container">
    <div class="logo-container">
      <img src="https://becomeomni.com/favicon.ico" alt="Omni Logo" class="logo">
    </div>

    <p>Hi {user_name},</p>

    <p><em><strong>Welcome to <a href="https://becomeomni.com/">Omni</a> — we're excited to have you on board!</strong></em></p>


    <p>Let us know if you need help getting started or have questions — we're always here.

    <p>Thanks again, and welcome to the Omni community!</p>
  </div>
</body>
</html>"""

    def _get_welcome_email_text(self, user_name: str) -> str:
        return f"""Hi {user_name},

Welcome to https://becomeomni.com/ — we're excited to have you on board!

Let us know if you need help getting started or have questions — we're always here.

Thanks again, and welcome to the Omni community!

---
© 2025 Omniscience Labs. All rights reserved.
You received this email because you signed up for an Omni account."""

    def _get_referral_email_template(self, recipient_name: str, sender_name: str, referral_url: str) -> str:
        content = f"""<table cellpadding="0" cellspacing="0" border="0" style="padding:30px 15px; font-family:Inter, Arial, sans-serif; color:#000000;">
  <tr>
    <td>
      <p style="margin:0 0 16px 0; font-size:15px; line-height:1.6;">
        Hi <strong>{recipient_name}</strong>,  👋
      </p>
      <p style="margin:0 0 20px 0; font-size:15px; line-height:1.6;">
        <strong>{sender_name}</strong> has invited you to join Omni using a personal referral code.
        When you sign up using this link, both you and {sender_name} will receive 100 in non-expiring credits 🎁
      </p>
      <p style="margin:0 0 10px 0; font-weight:600;">
        What You Both Get
      </p>
      <table cellpadding="0" cellspacing="0" border="0" style="background:#fafafa; border:1px solid #e5e7eb; border-radius:16px; padding:16px; margin:0 0 20px 0;">
        <tr>
          <td style="font-size:14px; line-height:1.6;">
            <ul style="margin:0; padding-left:18px;">
              <li>100 non-expiring credits to be used in the platform</li>
            </ul>
          </td>
        </tr>
      </table>
      <br/>
      <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 20px auto;">
        <tr>
          <td>
            <a href="{referral_url}" style="background:#000000; color:#ffffff; padding:12px 24px; text-decoration:none; font-size:15px; font-weight:500; border-radius:16px; display:inline-block;">
              Claim Your Invite
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>"""

        return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Omni</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #fafafa; color: #1a1a1a;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 520px; margin: 0 auto; padding: 40px 20px;">
    <tr>
      <td>
        <div style="text-align: center; margin-bottom: 40px;">
          <img src="https://becomeomni.com/favicon.ico" alt="Omni" style="height: 24px; width: auto; display: inline-block;" />
        </div>
        <div style="background-color: #ffffff; border-radius: 16px; padding: 40px 32px;">
          {content}
        </div>
        <div style="text-align: center; margin-top: 32px;">
          <p style="font-size: 12px; color: #999; margin: 0;">
            &copy; Omniscience Labs. All rights reserved.
          </p>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>"""

    def _get_referral_email_text(self, recipient_name: str, sender_name: str, referral_url: str) -> str:
        return f"""Hi {recipient_name},

{sender_name} has invited you to join Omni using a personal referral code.

When you sign up using this link, both you and {sender_name} will receive 100 in non-expiring credits 🎁

What You Both Get:
• 100 non-expiring credits to be used in the platform

Claim your invite: {referral_url}

---
© Omniscience Labs. All rights reserved."""

    def send_low_credit_alert_email(
        self,
        user_email: str,
        user_name: Optional[str] = None,
        balance: float = 0.0
    ) -> bool:
        if not self.client:
            logger.error("Cannot send email: MAILTRAP_API_TOKEN not configured")
            return False

        if not user_name:
            user_name = user_email.split('@')[0].title()

        subject = "⚠️ Your Omni credits are running low"
        html_content = self._get_low_credit_alert_template(user_name, balance)
        text_content = self._get_low_credit_alert_text(user_name, balance)

        try:
            mail = mt.Mail(
                sender=mt.Address(email=self.sender_email, name=self.sender_name),
                to=[mt.Address(email=user_email, name=user_name)],
                subject=subject,
                text=text_content,
                html=html_content,
                category="low_credit_alert"
            )

            response = self.client.send(mail)
            logger.info(f"Low credit alert email sent to {user_email} (balance: ${balance:.2f}). Response: {response}")
            return True

        except Exception as e:
            logger.error(f"Error sending low credit alert email to {user_email}: {str(e)}")
            return False

    def _get_low_credit_alert_template(self, user_name: str, balance: float) -> str:
        return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your credits are running low</title>
</head>
<body style="margin:0; padding:0; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color:#fafafa; color:#1a1a1a;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:520px; margin:0 auto; padding:40px 20px;">
    <tr>
      <td>
        <div style="text-align:center; margin-bottom:32px;">
          <img src="https://becomeomni.com/favicon.ico" alt="Omni" style="height:32px; width:auto; display:inline-block;" />
        </div>
        <div style="background-color:#ffffff; border-radius:16px; padding:40px 32px; border:1px solid #e5e7eb;">
          <p style="margin:0 0 8px 0; font-size:24px;">⚠️</p>
          <h1 style="margin:0 0 16px 0; font-size:20px; font-weight:700; color:#111827;">Your credits are running low</h1>
          <p style="margin:0 0 20px 0; font-size:15px; line-height:1.6; color:#374151;">
            Hi <strong>{user_name}</strong>,
          </p>
          <p style="margin:0 0 20px 0; font-size:15px; line-height:1.6; color:#374151;">
            Your Omni credit balance has dropped to <strong style="color:#DC2626;">${balance:.2f}</strong>.
            To avoid any interruption to your agents and workflows, please top up your credits.
          </p>
          <table cellpadding="0" cellspacing="0" border="0" style="background:#fef3c7; border:1px solid #fcd34d; border-radius:12px; padding:16px; margin:0 0 24px 0; width:100%;">
            <tr>
              <td style="font-size:14px; line-height:1.6; color:#92400e;">
                <strong>Current balance:</strong> ${balance:.2f}<br/>
                <strong>Minimum to run agents:</strong> $0.01
              </td>
            </tr>
          </table>
          <table cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;">
            <tr>
              <td>
                <a href="https://becomeomni.com/" style="background:#000000; color:#ffffff; padding:12px 28px; text-decoration:none; font-size:15px; font-weight:600; border-radius:12px; display:inline-block;">
                  Top Up Credits →
                </a>
              </td>
            </tr>
          </table>
          <p style="margin:0; font-size:13px; line-height:1.6; color:#9ca3af;">
            You can also set up auto top-up in your billing settings so this never happens again.
          </p>
        </div>
        <div style="text-align:center; margin-top:32px;">
          <p style="font-size:12px; color:#9ca3af; margin:0;">
            &copy; Omniscience Labs. All rights reserved.<br/>
            You received this because your Omni credit balance fell below $1.00.
          </p>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>"""

    def _get_low_credit_alert_text(self, user_name: str, balance: float) -> str:
        return f"""Hi {user_name},

Your Omni credit balance has dropped to ${balance:.2f}.

To avoid any interruption to your agents and workflows, please top up your credits.

Current balance: ${balance:.2f}
Minimum to run agents: $0.01

Top up your credits here: https://becomeomni.com/

You can also set up auto top-up in your billing settings so this never happens again.

---
© Omniscience Labs. All rights reserved.
You received this because your Omni credit balance fell below $1.00."""


email_service = EmailService()
