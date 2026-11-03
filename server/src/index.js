import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// Placeholders — fill in Supabase URL/key and Selar webhook secret later
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "";
const SELAR_SECRET = process.env.SELAR_SECRET || "";

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, supabase: !!SUPABASE_URL });
});

// Body scan endpoint placeholder
app.post("/api/body-scan", (_req, res) => {
  res.json({ measurements: {}, note: "pointnet model not wired yet" });
});

// Activation code check (after Selar)
app.post("/api/activate", (req, res) => {
  const { code, email } = req.body || {};
  // TODO: verify code against Supabase
  res.json({ ok: true, code, email });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("api on", port));
