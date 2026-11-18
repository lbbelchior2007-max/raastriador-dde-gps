const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../db");

const router = express.Router();

function createToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "8h" }
  );
}

router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password || password.length < 8) {
      return res.status(400).json({ error: "Informe nome, e-mail e senha com pelo menos 8 caracteres." });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await db.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email`,
      [String(name).trim(), normalizedEmail, passwordHash]
    );

    const user = result.rows[0];
    return res.status(201).json({ user, token: createToken(user) });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "Este e-mail já está cadastrado." });
    console.error("Falha no cadastro:", error.message);
    return res.status(500).json({ error: "Não foi possível concluir o cadastro." });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "Informe e-mail e senha." });

    const result = await db.query(
      "SELECT id, name, email, password_hash FROM users WHERE email = $1",
      [String(email).trim().toLowerCase()]
    );
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: "E-mail ou senha incorretos." });
    }

    return res.json({
      user: { id: user.id, name: user.name, email: user.email },
      token: createToken(user)
    });
  } catch (error) {
    console.error("Falha no login:", error.message);
    return res.status(500).json({ error: "Não foi possível entrar." });
  }
});

module.exports = router;
