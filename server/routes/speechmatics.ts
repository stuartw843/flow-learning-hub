import express from 'express';

const router = express.Router();

router.post('/speechmatics-credentials', async (req, res) => {
  try {
    console.log('Fetching Speechmatics credentials...');
    const resp = await fetch(
      'https://mp.speechmatics.com/v1/api_keys?type=flow',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.SPEECHMATICS_API_KEY}`,
        },
        body: JSON.stringify({
          ttl: 3600,
        }),
      },
    );

    if (!resp.ok) {
      const error = await resp.text();
      console.error('Speechmatics API error:', error);
      throw new Error(`Bad response from Speechmatics API: ${error}`);
    }

    const credentials = await resp.json();
    //console.log(credentials)
    console.log('Credentials fetched successfully');
    res.json({ token: credentials.key_value });
  } catch (error: any) {
    console.error('Error fetching Speechmatics credentials:', error);
    res.status(500).json({ 
      error: 'Failed to fetch credentials',
      details: error?.message || 'Unknown error' 
    });
  }
});

export default router;
