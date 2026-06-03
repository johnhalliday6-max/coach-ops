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
          Accept: 'application/json',
        },
      }
    )

    const text = await response.text()

    return res.status(200).json({
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get('content-type'),
      preview: text.slice(0, 1000),
    })
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to fetch National Highways data',
      details: String(error),
    })
  }
}