import "server-only";

import type { AuthenticatedUser } from "@/lib/auth";
import { query } from "@/lib/db";

export async function ensureUser(user: AuthenticatedUser) {
  await query(
    `INSERT INTO app_users (id, email)
     VALUES ($1, $2)
     ON CONFLICT (id) DO UPDATE
       SET email = EXCLUDED.email, updated_at = NOW()`,
    [user.id, user.email],
  );
}
