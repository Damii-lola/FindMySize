import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || "";
const SELAR_CHECKOUT_URL = process.env.SELAR_CHECKOUT_URL || "";
const SELAR_WEBHOOK_SECRET = process.env.SELAR_WEBHOOK_SECRET || "";

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    supabase: !!SUPABASE_URL,
    selar: !!SELAR_CHECKOUT_URL,
  });
});

// Body scan — PointNet runs here once the model is loaded
app.post("/api/body-scan", async (req, res) => {
  // TODO: wire landmarksToPoints + pointnet.onnx
  res.json({ measurements: {}, note: "pointnet ready to wire" });
});

// After Selar payment, user gets a code. This checks it.
app.post("/api/activate", (req, res) => {
  const { code, email } = req.body || {};
  // TODO: verify against subscriptions table
  res.json({ ok: true });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("api on", port));
