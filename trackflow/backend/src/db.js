const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL não configurada. Verifique o arquivo .env.");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

pool.on("error", (error) => {
  console.error("Erro inesperado no PostgreSQL:", error.message);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};
