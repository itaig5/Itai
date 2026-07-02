// Daily snapshot job (BUILD_PROMPT step 7). In production this runs on a scheduler (Supabase
// cron) against Guesty-synced data; on the demo world it advances the sim clock one day —
// same pipeline: bookings roll in, OTB snapshot appends, outcomes measure, promos auto-end.
// Run: npm run job:snapshot   (from rms-marketing-agent/)
import { createRuntime } from '../runtime.ts';
import { advanceDay } from '../sample/simulator.ts';

const rt = createRuntime();
const summary = await advanceDay(rt);
console.log(JSON.stringify({
  job: 'daily-snapshot',
  ...summary,
}, null, 2));
