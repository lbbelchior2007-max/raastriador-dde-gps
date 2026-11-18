const express = require("express");
const { authRequired } = require("../middleware/auth");
const db = require("../db");

const router = express.Router();
router.use(authRequired);

// O usuário autenticado solicita acesso à localização da pessoa indicada.
router.post("/request", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Informe um e-mail válido." });
    }
    const person = await db.query("SELECT id, name, email FROM users WHERE email = $1", [email]);
    if (!person.rows[0]) return res.status(404).json({ error: "Não encontramos uma conta com esse e-mail." });
    const target = person.rows[0];
    if (target.id === req.user.sub) return res.status(400).json({ error: "Você não pode solicitar acesso à sua própria localização." });

    const result = await db.query(
      `INSERT INTO location_shares (requester_id, owner_id, status)
       VALUES ($1, $2, 'pending')
       ON CONFLICT (requester_id, owner_id)
       DO UPDATE SET status = 'pending', updated_at = NOW()
       WHERE location_shares.status IN ('rejected', 'revoked')
       RETURNING id, status`,
      [req.user.sub, target.id]
    );
    if (!result.rows[0]) return res.status(409).json({ error: "Já existe uma solicitação ou compartilhamento para essa pessoa." });
    res.status(201).json({ request: result.rows[0], message: `Solicitação enviada para ${target.name}.` });
  } catch (error) {
    console.error("Erro ao solicitar compartilhamento:", error.message);
    res.status(500).json({ error: "Não foi possível enviar a solicitação." });
  }
});

router.get("/", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT s.id, s.status, s.created_at,
              requester.id AS requester_id, requester.name AS requester_name, requester.email AS requester_email,
              owner.id AS owner_id, owner.name AS owner_name, owner.email AS owner_email
       FROM location_shares s
       JOIN users requester ON requester.id = s.requester_id
       JOIN users owner ON owner.id = s.owner_id
       WHERE s.requester_id = $1 OR s.owner_id = $1
       ORDER BY s.created_at DESC`,
      [req.user.sub]
    );
    res.json({ shares: result.rows });
  } catch (error) {
    console.error("Erro ao listar compartilhamentos:", error.message);
    res.status(500).json({ error: "Não foi possível listar os compartilhamentos." });
  }
});

router.patch("/:id/respond", async (req, res) => {
  try {
    const decision = req.body?.decision;
    if (!["accepted", "rejected"].includes(decision)) {
      return res.status(400).json({ error: "Decisão inválida." });
    }
    const result = await db.query(
      `UPDATE location_shares SET status = $1, updated_at = NOW()
       WHERE id = $2 AND owner_id = $3 AND status = 'pending'
       RETURNING id, status, requester_id, owner_id`,
      [decision, req.params.id, req.user.sub]
    );
    if (!result.rows[0]) return res.status(404).json({ error: "Solicitação não encontrada ou já respondida." });
    res.json({ share: result.rows[0] });
  } catch (error) {
    console.error("Erro ao responder solicitação:", error.message);
    res.status(500).json({ error: "Não foi possível responder à solicitação." });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const result = await db.query(
      `UPDATE location_shares SET status = 'revoked', updated_at = NOW()
       WHERE id = $1 AND (requester_id = $2 OR owner_id = $2) AND status = 'accepted'
       RETURNING id`,
      [req.params.id, req.user.sub]
    );
    if (!result.rows[0]) return res.status(404).json({ error: "Compartilhamento ativo não encontrado." });
    res.json({ message: "Acesso revogado." });
  } catch (error) {
    console.error("Erro ao revogar compartilhamento:", error.message);
    res.status(500).json({ error: "Não foi possível revogar o acesso." });
  }
});

module.exports = router;
