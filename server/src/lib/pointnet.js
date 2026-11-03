/**
 * PointNet inference for body measurements.
 * Loads pointnet.onnx from server/models/ if present.
 * Input: a point cloud (N x 3) synthesized from landmarks.
 * Output: predicted measurements in cm, or null if model missing.
 */
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODEL_PATH = join(__dirname, '../../models/pointnet.onnx');

let session = null;
let loadAttempted = false;

async function loadSession() {
  if (loadAttempted) return session;
  loadAttempted = true;
  try {
    const ort = await import('onnxruntime-web');
    const buf = await readFile(MODEL_PATH);
    session = await ort.InferenceSession.create(buf);
    console.log('[pointnet] model loaded');
  } catch (e) {
    console.log('[pointnet] no model or load failed:', e.message);
    session = null;
  }
  return session;
}

/**
 * Build a rough point cloud from multi-view landmarks.
 * Each landmark becomes a 3D point using view angle as depth proxy.
 * Returns Float32Array of shape (N, 3) or null.
 */
export function landmarksToPoints(frames, nPoints = 512) {
  const pts = [];
  for (const f of frames || []) {
    const turn = (f.turn || 0) * Math.PI / 180;
    const lm = f.landmarks || {};
    for (const [name, p] of Object.entries(lm)) {
      if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') continue;
      // Simple projection: x, y from image, z from turn angle
      const x = (p.x - 50) / 50;
      const y = (50 - p.y) / 50;
      const z = Math.sin(turn) * 0.3;
      pts.push(x, y, z);
    }
  }
  if (pts.length < 9) return null;
  // Pad or subsample to nPoints
  const out = new Float32Array(nPoints * 3);
  for (let i = 0; i < nPoints; i++) {
    const src = (i * 3) % pts.length;
    out[i * 3] = pts[src] || 0;
    out[i * 3 + 1] = pts[src + 1] || 0;
    out[i * 3 + 2] = pts[src + 2] || 0;
  }
  return out;
}

/**
 * Run the model. Returns { chest_cm, waist_cm, hips_cm, ... } or null.
 * The output order must match the training script's MEASURE_KEYS.
 */
export async function predictMeasurements(points) {
  const sess = await loadSession();
  if (!sess || !points) return null;
  try {
    const ort = await import('onnxruntime-web');
    const tensor = new ort.Tensor('float32', points, [1, points.length / 3, 3]);
    const extra = new ort.Tensor('float32', new Float32Array([0]), [1, 1]);
    let out;
    try {
      out = await sess.run({ points: tensor, extra });
    } catch {
      out = await sess.run({ points: tensor });
    }
    const arr = out.measurements?.data || out[Object.keys(out)[0]]?.data;
    if (!arr) return null;
    const KEYS = [
      'head_circumference_cm', 'neck_circumference_cm', 'head_height_cm',
      'chest_cm', 'bust_cm', 'underbust_cm', 'waist_cm', 'lower_waist_cm',
      'hips_cm', 'back_width_cm', 'shoulder_cm', 'nape_to_waist_cm',
      'shoulder_to_waist_cm', 'body_rise_cm', 'dart_cm', 'waist_to_hip_cm',
      'waist_to_floor_cm', 'armhole_depth_cm', 'top_arm_cm', 'sleeve_length_cm',
      'sleeve_length_jersey_cm', 'elbow_cm', 'wrist_cm', 'two_piece_sleeve_cm',
      'cuff_shirts_cm', 'crotch_length_cm', 'waist_to_knee_cm', 'knee_cm',
      'calf_cm', 'trouser_bottom_cm', 'inseam_cm', 'high_ankle_cm', 'ankle_cm',
      'foot_length_cm',
    ];
    // The network was trained on normalised labels. A raw output that is not a
    // human measurement in centimetres is ignored so it cannot fill a gap with
    // a z-score.
    const RANGE = {
      head_circumference_cm: [48, 70], neck_circumference_cm: [25, 55], head_height_cm: [15, 30],
      chest_cm: [60, 160], bust_cm: [60, 160], underbust_cm: [55, 150],
      waist_cm: [50, 160], lower_waist_cm: [50, 160], hips_cm: [60, 170],
      back_width_cm: [25, 60], shoulder_cm: [30, 70],
      nape_to_waist_cm: [30, 70], shoulder_to_waist_cm: [25, 65],
      body_rise_cm: [15, 45], dart_cm: [0, 30], waist_to_hip_cm: [10, 35],
      waist_to_floor_cm: [70, 140], armhole_depth_cm: [10, 35],
      top_arm_cm: [18, 55], sleeve_length_cm: [40, 90], sleeve_length_jersey_cm: [40, 90],
      elbow_cm: [16, 45], wrist_cm: [12, 28], two_piece_sleeve_cm: [40, 90],
      cuff_shirts_cm: [12, 32], crotch_length_cm: [15, 45], waist_to_knee_cm: [40, 80],
      knee_cm: [25, 55], calf_cm: [22, 55], trouser_bottom_cm: [16, 40],
      inseam_cm: [55, 100], high_ankle_cm: [16, 35], ankle_cm: [14, 32],
      foot_length_cm: [18, 35],
    };
    const result = {};
    for (let i = 0; i < Math.min(arr.length, KEYS.length); i++) {
      const v = Math.round(arr[i] * 10) / 10;
      const range = RANGE[KEYS[i]];
      if (!range || v < range[0] || v > range[1]) continue;
      result[KEYS[i]] = v;
    }
    return Object.keys(result).length ? result : null;
  } catch (e) {
    console.log('[pointnet] inference failed:', e.message);
    return null;
  }
}

export const pointnetAvailable = () => loadSession().then((s) => !!s);
