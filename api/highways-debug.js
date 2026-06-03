import { XMLParser } from 'fast-xml-parser'

export default async function handler(req, res) {
  const key = process.env.NATIONAL_HIGHWAYS_API_KEY

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

  const situation = Array.isArray(data?.D2Payload?.situation)
    ? data.D2Payload.situation[0]
    : data?.D2Payload?.situation

  return res.status(200).json(situation)
}