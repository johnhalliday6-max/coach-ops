export default async function handler(req, res) {
  try {
    const key = process.env.VITE_HIGHWAYS_API_KEY

    if (!key) {
      return res.status(500).json({ error: 'Missing National Highways API key' })
    }

    const response = await fetch(
      'https://api.data.nationalhighways.co.uk/roads/v2.0/closures',
      {
        headers: {
          'Ocp-Apim-Subscription-Key': key,
        },
      }
    )

    const data = await response.json()

    return res.status(200).json(data)
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to fetch National Highways data',
      details: String(error),
    })
  }
}