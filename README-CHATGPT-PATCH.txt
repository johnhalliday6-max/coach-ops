Coach Ops patched build

What changed:
- Added separate driver-only screen available at /?mode=driver or /driver.
- Office dashboard remains at the normal root URL.
- Driver screen includes:
  - Google Maps navigation button
  - live route map with National Highways closure markers
  - live road intelligence feed
  - passenger counter
  - message control box
  - call/report/breakdown/route update buttons
- RouteMap now uses emoji markers, which removes Leaflet marker PNG 404 warnings.

How to use:
1. Copy these files over your project.
2. Keep your Vercel environment variable NATIONAL_HIGHWAYS_API_KEY as it already is.
3. Run npm install if needed.
4. Commit and push to GitHub.
5. Vercel will deploy.

Driver test URL:
https://coach-ops-eight.vercel.app/?mode=driver

Office URL:
https://coach-ops-eight.vercel.app
