import type { Request, Response } from 'express';
import * as d from '../services/dashboard.service.js';

const range = (req: Request) => { const q = req.query as { from?: string; to?: string }; return d.resolveRange(q.from, q.to); };
const ok = (res: Response, data: unknown) => res.json({ success: true, data });

export const summary = async (req: Request, res: Response) => ok(res, await d.summary(range(req)));
export const salesChart = async (req: Request, res: Response) => ok(res, { points: await d.salesChart(range(req)) });
export const bestSellers = async (req: Request, res: Response) => ok(res, { items: await d.bestSellers(range(req)) });
export const recentOrders = async (_req: Request, res: Response) => ok(res, { items: await d.recentOrders() });
export const lowStock = async (_req: Request, res: Response) => ok(res, { items: await d.lowStock() });
