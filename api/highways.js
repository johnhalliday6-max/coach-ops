import { XMLParser } from 'fast-xml-parser'

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
    })

    const data = parser.parse(xml)

    const situations = data?.D2Payload?.situation || []

    const list = Array.isArray(situations) ? situations : [situations]

    const alerts = list.slice(0, 12).map((item, index) => {
      const record = item?.situationRecord?.sitRoadOrCarriagewayOrLaneManagement || item?.situationRecord || {}

      return {
        id: index + 1,
        road: record?.roadName || record?.roadNumber || 'National Highways',
        location: record?.locationDescriptor || record?.idG || 'Road closure',
        type: 'Road / Lane Closure',
        detail: record?.generalPublicComment?.comment?.value || 'Live closure record from National Highways',
        speed: 'Live',
        source: 'National Highways',
        severity: record?.severity || 'Live',
      }
    })

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