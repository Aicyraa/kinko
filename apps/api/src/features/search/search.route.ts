import { Hono } from 'hono';
import type { AppEnv } from '../../types.ts';
import { searchHandler } from './search.controller.ts';

export const search = new Hono<AppEnv>().get('/', ...searchHandler);
