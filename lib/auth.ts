import "server-only";

import { headers } from "next/headers";

export type AuthenticatedUser = {
  id: string;
  email: string | null;
};

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const requestHeaders = await headers();
  const id = requestHeaders.get("oai-authenticated-user-id");
  if (!id) return null;

  return {
    id,
    email: requestHeaders.get("oai-authenticated-user-email"),
  };
}
