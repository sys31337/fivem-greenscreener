const express = require('express');
const imagejs = require('image-js');
const path = require('path');
const fs = require('fs');
const app = express();
const port = 5001;

// Middleware to handle raw binary data
app.use(express.json());

const filePath = path.join(process.cwd(), '../images/')

app.post('/api/screener', async (req, res) => {
  try {
    const { fileName } = req.body;
    console.log('first')
    console.log('fileName', fileName)
    if (!req.body || req.body.length === 0) return res.status(400).send('No image provided');

    try {
      const file = path.join(filePath, fileName);
      let image = await imagejs.Image.load(file);
      const coppedImage = image.crop({ x: image.width / 4.5, width: image.height });

      image.data = coppedImage.data;
      image.width = coppedImage.width;
      image.height = coppedImage.height;
      for (let x = 0; x < image.width; x++) {
        for (let y = 0; y < image.height; y++) {
          const pixelArr = image.getPixelXY(x, y);
          const r = pixelArr[0];
          const g = pixelArr[1];
          const b = pixelArr[2];

          if (g > r + b) {
            image.setPixelXY(x, y, [255, 255, 255, 0]);
          }
        }
      }

      image.resize({ width: image.width / 3 }).save(file);
    } catch (e) {
      console.error('Image format error:', e);
      return res.status(400).send('Unsupported image format');
    }

  } catch (e) {
    console.error('Processing error:', e);
    res.status(500).send('Processing failed');
  }
});

app.listen(port, () => {
  console.log(`Screener server running at http://localhost:${port}`);
});
