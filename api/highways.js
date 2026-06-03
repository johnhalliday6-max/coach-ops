import { XMLParser } from 'fast-xml-parser'

function asArray(value) {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function findFirst(obj, names) {
  if (!obj || typeof obj !== 'object') return null

  for (const name of names) {
    if (obj[name]) return obj[name]
  }

  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object') {
      const found = findFirst(value, names)
      if (found) return found
    }
  }

  return null
}

function textValue(value) {
  if (!value) return null
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (value.value) return textValue(value.value)
  if (value.values) return textValue(value.values)
  if (value.comment) return textValue(value.comment)
  if (Array.isArray(value)) return textValue(value[0])
  return null
}

function findUsefulComment(obj) {
  const possible = findFirst(obj, [
    'generalPublicComment',
    'comment',
    'description',
    'locationDescriptor',
    'supplementaryPositionalDescription',
    'eventDescription',
  ])

  const text = textValue(possible)

  if (text && text.length > 5) return text

  return 'Live road and lane closure from National Highways'
}

function findRoadFromText(text) {
  if (!text) return null

  const match = text.match(/\b(M\d+|A\d+\(M\)|A\d+|A1\(M\))\b/i)
  return match ? match[0].toUpperCase() : null
}

function clean(value, fallback) {
  const text = textValue(value)
  if (!text) return fallback
  return String(text).replace(/\s+/g, ' ').trim()
}

export default async function handler(req, res) {
  try {
    const key = process.env.NATIONAL_HIGHWAYS_API_KEY

    if (!key) {
      return res.status(500).json({ error: 'Missing National Highways API key' })
    }

    const response = await fetch(
      'https://api.data.nationalhighways.co.uk/roads/v2.0/closures',
      {
        headers: {
          'Ocp-Apim-Subscription-Key': key,
          Accept: 'application/xml',
        },
      }
    )

    const xml = await response.text()

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
      removeNSPrefix: true,
    })

    const data = parser.parse(xml)

    const situations = asArray(data?.D2Payload?.situation)

    const alerts = situations.slice(0, 12).map((situation, index) => {
      const recordRaw = situation?.situationRecord || {}
      const record =
        recordRaw?.sitRoadOrCarriagewayOrLaneManagement ||
        recordRaw?.roadOrCarriagewayOrLaneManagement ||
        recordRaw

      const detail = clean(findUsefulComment(record), 'Live road and lane closure from National Highways')

      const road =
        clean(findFirst(record, ['roadName', 'roadNumber', 'roadIdentifier', 'road']), null) ||
        findRoadFromText(detail) ||
        'National Highways'

      const location =
  clean(findFirst(record, [
    'locationDescriptor',
    'descriptor',
    'supplementaryPositionalDescription',
    'areaName',
    'namedArea',
  ]), 'Road closure')

      const startTime =
        clean(findFirst(record, ['overallStartTime', 'situationRecordCreationTime']), null)

      const endTime =
        clean(findFirst(record, ['overallEndTime']), null)

      return {
        id: index + 1,
        road,
        location,
        type: 'Road / Lane Closure',
        detail,
        speed: 'Live',
        source: 'National Highways',
        severity: clean(findFirst(record, ['severity']), 'Live'),
        startTime,
        endTime,
      }
    })

    console.log(
  JSON.stringify(
    situations[0],
    null,
    2
  )
)

    return res.status(200).json({
      ok: true,
      count: alerts.length,
      publicationTime: data?.D2Payload?.publicationTime,
      alerts,
    })
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to parse National Highways data',
      details: String(error),
    })
  }
}