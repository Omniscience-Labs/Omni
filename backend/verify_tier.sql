-- Verify your current tier and role
SELECT 
    u.email,
    ur.role as admin_role,
    ca.tier as billing_tier,
    ca.balance,
    ca.expiring_credits,
    ca.non_expiring_credits
FROM auth.users u
LEFT JOIN user_roles ur ON ur.user_id = u.id
LEFT JOIN credit_accounts ca ON ca.account_id = u.id
WHERE u.email = 'varnika@latent-labs.ai';


