export function normaliseVehiclePart(value) {
  return String(value || "").trim().toUpperCase();
}

export function vehicleCompany(vehicle) {
  return String(vehicle?.company || vehicle?.category || vehicle?.operator || "Unassigned").trim() || "Unassigned";
}

export function vehicleScopeKey(vehicle) {
  const company = normaliseVehiclePart(vehicleCompany(vehicle));
  const fleet = normaliseVehiclePart(vehicle?.fleetNo || vehicle?.vehicle || vehicle?.vehicleId);
  const reg = normaliseVehiclePart(vehicle?.reg);
  if (!fleet && !reg) return "";
  return [company, fleet, reg].filter(Boolean).join("::");
}

export function vehicleLookupParams(vehicle) {
  const params = new URLSearchParams();
  const fleet = normaliseVehiclePart(vehicle?.fleetNo || vehicle?.vehicle || vehicle?.vehicleId);
  const reg = normaliseVehiclePart(vehicle?.reg);
  const company = vehicleCompany(vehicle);
  const scope = vehicleScopeKey(vehicle);
  if (fleet) params.set("vehicle", fleet);
  if (reg) params.set("reg", reg);
  if (company) params.set("company", company);
  if (scope) params.set("vehicleKey", scope);
  return params.toString();
}
