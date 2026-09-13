import "server-only";

import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { schemaStatements } from "@/db/schema";

const globalForDatabase = globalThis as typeof globalThis & {
  postgresPool?: Pool;
  postgresSchemaPromise?: Promise<void>;
};

function databaseUrl() {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL environment variable is not set");
  return value.includes("://") ? value : `postgres://${value}`;
}

function shouldUseSsl(connectionString: string) {
  if (process.env.DATABASE_SSL === "disable") return false;
  const hostname = new URL(connectionString).hostname;
  return hostname !== "localhost" && hostname !== "127.0.0.1";
}

export function getDatabasePool() {
  if (!globalForDatabase.postgresPool) {
    const connectionString = databaseUrl();
    globalForDatabase.postgresPool = new Pool({
      connectionString,
      // Port 6432 is PgBouncer. A small app-side pool avoids multiplying connections.
      max: 5,
      min: 0,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 10_000,
      allowExitOnIdle: true,
      ssl: shouldUseSsl(connectionString),
    });

    globalForDatabase.postgresPool.on("error", (error) => {
      console.error("[database] idle PostgreSQL client error", error);
    });
  }

  return globalForDatabase.postgresPool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: readonly unknown[] = [],
) {
  return getDatabasePool().query<T>(text, [...values]);
}

export async function withDatabaseClient<T>(work: (client: PoolClient) => Promise<T>) {
  const client = await getDatabasePool().connect();
  try {
    return await work(client);
  } finally {
    client.release();
  }
}

export async function initializeDatabase() {
  globalForDatabase.postgresSchemaPromise ??= withDatabaseClient(async (client) => {
    for (const statement of schemaStatements) await client.query(statement);
  }).catch((error) => {
    globalForDatabase.postgresSchemaPromise = undefined;
    throw error;
  });

  return globalForDatabase.postgresSchemaPromise;
}

export async function testDatabaseConnection() {
  const result = await query<{ database: string; server_time: Date }>(
    "SELECT current_database() AS database, NOW() AS server_time",
  );
  return result.rows[0];
}
