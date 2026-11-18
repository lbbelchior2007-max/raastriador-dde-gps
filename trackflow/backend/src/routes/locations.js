const express = require("express");
const { authRequired } = require("../middleware/auth");
const db = require("../db");

const router = express.Router();

router.get("/me/latest", authRequired, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT latitude, longitude, accuracy, speed, heading, recorded_at
       FROM location_points
       WHERE user_id = $1
       ORDER BY recorded_at DESC LIMIT 1`,
      [req.user.sub]
    );
    res.json({ location: result.rows[0] || null });
  } catch (error) {
    console.error("Falha ao consultar localização:", error.message);
    res.status(500).json({ error: "Não foi possível consultar a localização." });
  }
});

router.get("/me/history", authRequired, async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    const result = await db.query(
      `SELECT latitude, longitude, accuracy, speed, recorded_at
       FROM location_points
       WHERE user_id = $1
       ORDER BY recorded_at DESC LIMIT $2`,
      [req.user.sub, limit]
    );
    res.json({ locations: result.rows });
  } catch (error) {
    console.error("Falha ao consultar histórico:", error.message);
    res.status(500).json({ error: "Não foi possível consultar o histórico." });
  }
});


router.get("/shared", authRequired, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT DISTINCT ON (u.id) u.id AS user_id, u.name,
              lp.latitude, lp.longitude, lp.accuracy, lp.speed, lp.heading, lp.recorded_at
       FROM location_shares s
       JOIN users u ON u.id = s.owner_id
       JOIN location_points lp ON lp.user_id = u.id
       WHERE s.requester_id = $1 AND s.status = 'accepted'
         AND lp.recorded_at >= s.updated_at
       ORDER BY u.id, lp.recorded_at DESC`,
      [req.user.sub]
    );
    res.json({ locations: result.rows });
  } catch (error) {
    console.error("Falha ao consultar posições compartilhadas:", error.message);
    res.status(500).json({ error: "Não foi possível consultar posições compartilhadas." });
  }
});

module.exports = router;
