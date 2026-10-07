/**
 * Migration: Add App Settings
 */

const { identityDb } = require("../db-config");

async function migrateSettings() {
  console.log("Checking settings table in identityDb...");
  try {
    const hasSettings = await identityDb.schema.hasTable("app_settings");
    if (!hasSettings) {
      console.log("  → creating app_settings");
      await identityDb.schema.createTable("app_settings", (t) => {
        t.string("id").primary().defaultTo("global"); // Only one row, id = 'global'
        t.string("currency", 10).defaultTo("USD");
        t.string("date_format", 30).defaultTo("MMM d, yyyy");
        t.string("timezone", 50).defaultTo("UTC");
        t.timestamp("updated_at", { useTz: true }).defaultTo(identityDb.fn.now());
      });
      console.log("    ✚ app_settings");
      
      // Insert default global settings
      await identityDb("app_settings").insert({
        id: "global",
        currency: "USD",
        date_format: "MMM d, yyyy",
        timezone: "UTC",
      });
    }

    console.log("Settings migration complete.");
  } catch (err) {
    console.error("Failed to migrate settings:", err);
    process.exit(1);
  }
}

migrateSettings().then(() => process.exit(0));
