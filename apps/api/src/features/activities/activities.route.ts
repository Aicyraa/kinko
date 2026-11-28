import { Hono } from 'hono';
import type { AppEnv } from '../../types.ts';
import { listActivitiesHandler } from './activities.controller.ts';

export const activities = new Hono<AppEnv>().get('/', ...listActivitiesHandler);
