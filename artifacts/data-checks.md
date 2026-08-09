# Data-layer reasoning

No database access, so this is inferred from what's observable in the product and its API responses.

## Expected writes

**Sending a message to the agent.** The API returns a `session_id`, so conversations are grouped rather than stored as loose messages. I'd expect a `sessions` table (id, user_id nullable for pre-login, created_at) and a `messages` table (id, session_id, role or is_user flag, content, created_at). Pre-login chat works without an account, so `user_id` has to be nullable, and the session is the only thread linking those messages together.

**Creating an account.** A `users` row (id, email, phone, country, gender, full_name, created_at). Email showed a verified badge and ID verification had its own status, so those are separate fields rather than one "verified" boolean: `email_verified_at` and `id_verification_status`. Phone had no verification indicator at all, which suggests no corresponding column.

Signup also triggers side effects. A wallet address appeared without me creating one, so there's likely a `wallets` row (id, user_id, address, created_at) written during registration. 100 ASK landed in the balance and the notification panel explained why, so rewards are recorded as events rather than as a running total: a `reward_events` table (id, user_id, amount, reason, created_at). The survey later credited 25 ASK and the balance moved to 125, consistent with the balance being derived from summed events.

## Verification queries

Confirm a signup wrote everything it should, with no orphaned or missing side effects:

```sql
SELECT u.id, u.email, u.created_at,
       w.address AS wallet_address,
       COUNT(r.id) AS reward_events,
       COALESCE(SUM(r.amount), 0) AS balance
FROM users u
LEFT JOIN wallets w ON w.user_id = u.id
LEFT JOIN reward_events r ON r.user_id = u.id
WHERE u.created_at > NOW() - INTERVAL '1 day'
GROUP BY u.id, u.email, u.created_at, w.address;
```

A signup with a NULL wallet address or zero reward events means a side effect silently failed.

Check messages aren't orphaned and every session has both sides of the conversation:

```sql
SELECT s.id AS session_id,
       COUNT(*) FILTER (WHERE m.is_user) AS user_messages,
       COUNT(*) FILTER (WHERE NOT m.is_user) AS agent_messages,
       MIN(m.created_at) AS first_message,
       MAX(m.created_at) AS last_message
FROM sessions s
JOIN messages m ON m.session_id = s.id
WHERE s.created_at > NOW() - INTERVAL '1 day'
GROUP BY s.id
HAVING COUNT(*) FILTER (WHERE NOT m.is_user) = 0;
```

Sessions with user messages but no agent replies point at failed responses, matching the "I ran into an issue" state I hit in the product.

Catch messages whose session no longer exists:

```sql
SELECT COUNT(*) AS orphaned_messages
FROM messages m
LEFT JOIN sessions s ON s.id = m.session_id
WHERE s.id IS NULL;
```

## Pipeline integrity check

For analytics, I'd assert that every user's summed `reward_events` equals the balance shown in the wallet. If they diverge, either an event was written without updating the balance or the balance was adjusted outside the event log, and both are worth catching before the number reaches a dashboard someone trusts.
