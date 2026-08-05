export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { initializeDatabase, testDatabaseConnection } = await import("@/lib/db");
  try {
    await initializeDatabase();
    const result = await testDatabaseConnection();
    console.info(`[database] connected to ${result.database} at ${new Date(result.server_time).toISOString()}`);
  } catch (error) {
    console.error("[database] startup connection check failed", error);
    throw error;
  }
}
