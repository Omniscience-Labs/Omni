"""
Manual test script for the low-credit alert email.

USAGE (from the backend/ directory):

  Production sending (requires domain to be verified in MailTrap):
    python scripts/test_low_credit_alert.py --email user@example.com

  Sandbox / testing mode (no domain verification needed — get inbox ID from
  MailTrap dashboard → Email Testing → your inbox → Integration):
    python scripts/test_low_credit_alert.py --email user@example.com --sandbox --inbox-id 1234567

Options:
  --email       Recipient email address (required)
  --name        Recipient display name (optional, derived from email if omitted)
  --balance     Simulated credit balance shown in the email (default: 0.50)
  --sandbox     Use MailTrap sandbox/testing mode (no domain verification needed)
  --inbox-id    MailTrap inbox ID, required when --sandbox is set
"""

import argparse
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv()

import mailtrap as mt


def _get_client(sandbox: bool, inbox_id: int | None) -> mt.MailtrapClient:
    token = os.getenv("MAILTRAP_API_TOKEN")
    if not token:
        print("❌  MAILTRAP_API_TOKEN is not set in .env")
        sys.exit(1)

    if sandbox:
        return mt.MailtrapClient(token=token, api_host="sandbox.api.mailtrap.io")

    return mt.MailtrapClient(token=token)


def send_alert(
    *,
    to_email: str,
    to_name: str,
    balance: float,
    sender_email: str,
    sender_name: str,
    sandbox: bool,
    inbox_id: int | None,
) -> bool:
    client = _get_client(sandbox, inbox_id)

    from core.services.email import email_service

    html_content = email_service._get_low_credit_alert_template(to_name, balance)
    text_content = email_service._get_low_credit_alert_text(to_name, balance)

    mail = mt.Mail(
        sender=mt.Address(email=sender_email, name=sender_name),
        to=[mt.Address(email=to_email, name=to_name)],
        subject="⚠️ Your Omni credits are running low",
        html=html_content,
        text=text_content,
        category="low_credit_alert",
    )

    try:
        if sandbox and inbox_id:
            # Sandbox endpoint embeds inbox_id in the URL; the library doesn't
            # support this, so we call the API directly.
            import requests

            token = os.getenv("MAILTRAP_API_TOKEN")
            url = f"https://sandbox.api.mailtrap.io/api/send/{inbox_id}"
            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            }
            resp = requests.post(url, headers=headers, json=mail.api_data)
            if not resp.ok:
                print(f"❌  MailTrap sandbox error {resp.status_code}: {resp.text}")
                return False
            response = resp.json()
        else:
            response = client.send(mail)
        print(f"   MailTrap response: {response}")
        return True
    except Exception as e:
        print(f"❌  MailTrap error: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(
        description="Send a test low-credit alert email via MailTrap"
    )
    parser.add_argument("--email", required=True, help="Recipient email address")
    parser.add_argument("--name", default=None, help="Recipient display name")
    parser.add_argument(
        "--balance", type=float, default=0.50, help="Simulated balance (default: 0.50)"
    )
    parser.add_argument(
        "--sandbox",
        action="store_true",
        help="Use MailTrap sandbox (no domain verification)",
    )
    parser.add_argument(
        "--inbox-id",
        type=int,
        default=None,
        help="MailTrap inbox ID (required for --sandbox)",
    )
    args = parser.parse_args()

    if args.sandbox and not args.inbox_id:
        print("❌  --inbox-id is required when using --sandbox mode.")
        print("    Find it in MailTrap → Email Testing → your inbox → Integration.")
        sys.exit(1)

    sender_email = os.getenv("MAILTRAP_SENDER_EMAIL", "support@omnisciencelabs.com")
    sender_name = os.getenv("MAILTRAP_SENDER_NAME", "Omni Team")
    to_name = args.name or args.email.split("@")[0].replace(".", " ").title()
    mode = "SANDBOX" if args.sandbox else "PRODUCTION"

    print(f"\n📧  Sending low-credit alert email [{mode}]")
    print(f"    To      : {args.email} ({to_name})")
    print(f"    Balance : ${args.balance:.2f}")
    print(f"    From    : {sender_email} ({sender_name})")
    if args.sandbox:
        print(f"    Inbox ID: {args.inbox_id}")
    print()

    ok = send_alert(
        to_email=args.email,
        to_name=to_name,
        balance=args.balance,
        sender_email=sender_email,
        sender_name=sender_name,
        sandbox=args.sandbox,
        inbox_id=args.inbox_id,
    )

    if ok:
        print("✅  Email sent successfully!")
        if args.sandbox:
            print("    Check MailTrap → Email Testing → your inbox.")
        else:
            print("    Check your inbox (or MailTrap sending logs).")
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()
