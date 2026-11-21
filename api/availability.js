
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
    return res.status(405).json({
      ok: false,
      error: "فقط درخواست GET مجاز است."
    });
  }

  const date = req.query?.date;

  if (
    typeof date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date)
  ) {
    return res.status(400).json({
      ok: false,
      error: "تاریخ معتبر نیست."
    });
  }

  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return res.status(400).json({
      ok: false,
      error: "تاریخ معتبر نیست."
    });
  }

  const now = new Date();
  const afghanNow = new Date(
    now.getTime() + 270 * 60 * 1000
  );

  const today = [
    afghanNow.getUTCFullYear(),
    String(afghanNow.getUTCMonth() + 1).padStart(2, "0"),
    String(afghanNow.getUTCDate()).padStart(2, "0")
  ].join("-");

  if (date < today) {
    return res.status(200).json({
      ok: true,
      available: []
    });
  }

  try {
    const result = await pool.query(
      `SELECT booking_time, COUNT(*)::int AS total
       FROM zeno_bookings
       WHERE booking_date = $1
       AND status <> 'cancelled'
       GROUP BY booking_time`,
      [date]
    );

    const booked = new Map(
      result.rows.map(row => [
        row.booking_time,
        row.total
      ])
    );

    const available = [];

    for (let hour = 8; hour < 22; hour++) {
      for (const minute of ["00", "30"]) {
        const time =
          String(hour).padStart(2, "0") + ":" + minute;

        const bookingTime = time.split(":").map(Number);

        if (date === today) {
          const selectedMinutes =
            bookingTime[0] * 60 + bookingTime[1];

          const currentMinutes =
            afghanNow.getUTCHours() * 60 +
            afghanNow.getUTCMinutes();

          if (selectedMinutes <= currentMinutes) continue;
        }

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
    console.error("ZENO availability error:", error);

    return res.status(500).json({
      ok: false,
      error: "خطا در بررسی ساعت‌های خالی."
    });
  }
}
