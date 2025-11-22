import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db } from "./index";

async function main() {
  console.log("Running migrations...");

  try {
    await migrate(db, { migrationsFolder: "./src/db/drizzle" });
    console.log("Migrations completed!");
    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

main();

