
import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 2
});

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    return res.status(405).json({ ok: false });
  }

  const date = req.query?.date;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({
      ok: false,
      error: "تاریخ معتبر نیست."
    });
  }

  const [y, m, d] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(y, m - 1, d));

  if (
    parsed.getUTCFullYear() !== y ||
    parsed.getUTCMonth() !== m - 1 ||
    parsed.getUTCDate() !== d
  ) {
    return res.status(400).json({
      ok: false,
      error: "تاریخ معتبر نیست."
    });
  }

  const now = new Date();
  const local = new Date(now.getTime() + 270 * 60000);

  const today = [
    local.getUTCFullYear(),
    String(local.getUTCMonth() + 1).padStart(2, "0"),
    String(local.getUTCDate()).padStart(2, "0")
  ].join("-");

  if (date < today) {
    return res.status(200).json({
      ok: true,
      available: []
    });
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS zeno_bookings (
        id TEXT PRIMARY KEY,
        customer_name VARCHAR(80) NOT NULL,
        phone VARCHAR(20) NOT NULL,
        service VARCHAR(30) NOT NULL,
        booking_date DATE NOT NULL,
        booking_time VARCHAR(5) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    const result = await pool.query(
      `SELECT booking_time, COUNT(*)::int AS total
       FROM zeno_bookings
       WHERE booking_date = $1
       AND status <> 'cancelled'
       GROUP BY booking_time`,
      [date]
    );

    const booked = new Map(
      result.rows.map(row => [row.booking_time, row.total])
    );

    const available = [];

    for (let h = 8; h < 22; h++) {
      for (const min of ["00", "30"]) {
        const time =
          String(h).padStart(2, "0") + ":" + min;

        const minutes = h * 60 + Number(min);
        const current =
          local.getUTCHours() * 60 + local.getUTCMinutes();

        if (date === today && minutes <= current) continue;

        if ((booked.get(time) || 0) < 2) {
          available.push(time);
        }
      }
    }

    return res.status(200).json({
      ok: true,
      date,
      capacity: 2,
      available
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      ok: false,
      error: "خطا در اتصال دیتابیس."
    });
  }
}
