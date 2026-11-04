// Vercel Express entry point. Local development continues through npm start.
import {createApp} from './src/server.js';
import express from 'express';
const app=express();
app.disable('x-powered-by');
app.use(await createApp({seed:false}));
export default app;
