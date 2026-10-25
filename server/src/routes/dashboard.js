import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { asyncHandler } from '../utils/http.js';
import { dashboardFor } from '../services/stats.js';

const r = Router();
r.get('/', protect, asyncHandler(async (req, res) => res.json(await dashboardFor(req.user))));
export default r;
