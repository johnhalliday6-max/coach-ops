Coach Ops tracking test patch

Driver URL:
https://coach-ops-eight.vercel.app/?mode=driver

Flow:
1. Select 23031 / YJ72 CGG.
2. Tap Continue.
3. Tap Start Tracking.
4. Allow location permission on the phone.
5. Keep the page open.
6. On the office page select 23031 and watch the map marker.

Important:
This uses a simple Vercel serverless in-memory tracking endpoint for testing.
It is good enough for a quick proof of concept, but a proper database/realtime service
(Supabase/Firebase/etc.) is needed for production reliable tracking.
