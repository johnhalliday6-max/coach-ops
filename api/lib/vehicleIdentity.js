export function cleanVehiclePart(value) {
  return String(value || '').trim().toUpperCase()
}

export function vehicleCompany(value) {
  return String(value?.company || value?.category || value?.operator || 'Unassigned').trim() || 'Unassigned'
}

export function vehicleScopeKey(value) {
  const company = cleanVehiclePart(vehicleCompany(value))
  const fleet = cleanVehiclePart(value?.fleetNo || value?.vehicle || value?.vehicleId)
  const reg = cleanVehiclePart(value?.reg)
  return [company, fleet, reg].filter(Boolean).join('::')
}

export function parseScopedVehicleKey(value) {
  const clean = cleanVehiclePart(value)
  const parts = clean.split('::').filter(Boolean)
  if (parts.length >= 3) {
    return { company: parts[0], fleetNo: parts[1], reg: parts.slice(2).join('::') }
  }
  return { company: '', fleetNo: clean, reg: '' }
}

export function requestVehicleScope(query = {}) {
  const vehicleKey = cleanVehiclePart(query.vehicleKey)
  if (vehicleKey) return vehicleKey
  return vehicleScopeKey({
    company: query.company,
    category: query.category,
    operator: query.operator,
    fleetNo: query.vehicle || query.fleetNo || query.vehicleId,
    reg: query.reg,
  })
}

export function bodyVehicleScope(body = {}) {
  const vehicleKey = cleanVehiclePart(body.vehicleKey || body.scopeKey)
  return vehicleKey || vehicleScopeKey(body)
}

export function legacyVehicleKeys(value = {}) {
  return [
    cleanVehiclePart(value.fleetNo || value.vehicle || value.vehicleId),
    cleanVehiclePart(value.reg),
  ].filter(Boolean)
}
