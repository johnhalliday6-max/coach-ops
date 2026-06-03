Coach Ops Supabase persistence patch

This patch keeps the existing in-memory fallback, but if these Vercel Environment Variables exist it will persist tracking, routes and requests to Supabase:

SUPABASE_URL=https://mnzeumytiwqivkmjjfdl.supabase.co
SUPABASE_ANON_KEY=<your Supabase publishable/anon key>

Also accepts:
SUPABASE_PUBLISHABLE_KEY
VITE_SUPABASE_ANON_KEY
VITE_SUPABASE_PUBLISHABLE_KEY

What changed:
- /api/tracking saves/loads latest vehicle GPS from Supabase vehicles table.
- /api/routes saves/loads route data from Supabase routes table.
- /api/requests saves/loads driver requests from Supabase incidents table.
- Driver route is also saved to phone localStorage as an emergency fallback.
- Added saved UK places for Esk Valley Coaches, Scarborough Railway Station, Manchester Airport T2, Birch Services, Scarborough Spa and York Racecourse.
- Added Clear Route / Stops button.

Before deploy:
1. Add SUPABASE_URL and SUPABASE_ANON_KEY to Vercel project Environment Variables for Production and Preview.
2. Commit and push.
3. Test /api/tracking and /api/routes after deploy.
