const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const pool = new Pool({
  connectionString: process.env.SUPABASE_DB_URL, // Use connection pooling URL
});

async function run() {
  console.log('Creating tariff tables...');
  
  const sql = `
    CREATE TABLE IF NOT EXISTS tariff_config (
      id INTEGER PRIMARY KEY CHECK (id = 1), -- Single row config
      energy_rate_per_kwh NUMERIC NOT NULL DEFAULT 12,
      time_rate_per_minute NUMERIC DEFAULT 2,
      time_billing_enabled BOOLEAN DEFAULT true,
      updated_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS grid_tariff_config (
      id INTEGER PRIMARY KEY CHECK (id = 1), -- Single row config
      buying_price_per_kwh NUMERIC NOT NULL DEFAULT 5.0,
      system_loss_percentage NUMERIC NOT NULL DEFAULT 4.2,
      updated_at TIMESTAMPTZ DEFAULT now()
    );

    -- RLS for config tables
    ALTER TABLE tariff_config ENABLE ROW LEVEL SECURITY;
    ALTER TABLE grid_tariff_config ENABLE ROW LEVEL SECURITY;

    -- Using DO block for policies to avoid "policy already exists" error
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies WHERE tablename = 'tariff_config' AND policyname = 'tariff_config_read_all'
        ) THEN
            CREATE POLICY "tariff_config_read_all" ON tariff_config FOR SELECT TO authenticated USING (true);
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM pg_policies WHERE tablename = 'grid_tariff_config' AND policyname = 'grid_tariff_config_read_all'
        ) THEN
            CREATE POLICY "grid_tariff_config_read_all" ON grid_tariff_config FOR SELECT TO authenticated USING (true);
        END IF;
    END
    $$;

    -- Insert default row if not exists
    INSERT INTO tariff_config (id, energy_rate_per_kwh, time_rate_per_minute, time_billing_enabled) 
    VALUES (1, 12, 2, true) 
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO grid_tariff_config (id, buying_price_per_kwh, system_loss_percentage) 
    VALUES (1, 5.0, 4.2) 
    ON CONFLICT (id) DO NOTHING;
  `;

  try {
    await pool.query(sql);
    console.log('Tables created and populated successfully.');
  } catch (err) {
    console.error('Error executing query:', err);
  } finally {
    await pool.end();
  }
}

run();
