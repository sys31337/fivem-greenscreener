const express = require('express');
const { Image } = require('image-js');
const path = require('path');
const fs = require('fs');

const app = express();
const port = 5001;

app.use(express.json());

const filePath = path.join(process.cwd(), '../images/');

app.post('/api/screener', async (req, res) => {
  try {
    const { fileName } = req.body;

    if (!fileName) {
      return res.status(400).send('fileName is required');
    }

    const file = path.join(filePath, fileName);

    if (!fs.existsSync(file)) {
      return res.status(404).send('File not found');
    }

    let image = await Image.load(file);

    // Ensure RGBA (needed for transparency)
    if (image.components === 3) {
      image = image.rgba8();
    }

    // ---------------------------
    // STEP 1: Optional initial crop (fix from your version)
    // ---------------------------
    image = image.crop({
      x: Math.floor(image.width / 4.5),
      y: 0,
      width: Math.floor(image.width - image.width / 4.5),
      height: image.height,
    });

    // ---------------------------
    // STEP 2: Remove green (make transparent)
    // ---------------------------
    for (let x = 0; x < image.width; x++) {
      for (let y = 0; y < image.height; y++) {
        const [r, g, b, a] = image.getPixelXY(x, y);

        // Better green detection
        if (g > 120 && g > r * 1.2 && g > b * 1.2) {
          image.setPixelXY(x, y, [0, 0, 0, 0]); // fully transparent
        }
      }
    }

    // ---------------------------
    // STEP 3: Auto-crop to remove empty space
    // ---------------------------
    let minX = image.width;
    let minY = image.height;
    let maxX = 0;
    let maxY = 0;

    for (let x = 0; x < image.width; x++) {
      for (let y = 0; y < image.height; y++) {
        const pixel = image.getPixelXY(x, y);

        // Keep non-transparent pixels
        if (pixel[3] > 0) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }

    // Apply crop if valid area found
    if (maxX > minX && maxY > minY) {
      image = image.crop({
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      });
    } else {
      return res.status(400).send('No subject detected after green removal');
    }

    // ---------------------------
    // STEP 4: Resize (optional)
    // ---------------------------
    image = image.resize({
      width: Math.floor(image.width / 3),
    });

    // ---------------------------
    // STEP 5: Save
    // ---------------------------
    await image.save(file);

    return res.status(200).send('Image processed successfully');

  } catch (e) {
    console.error('Processing error:', e);
    return res.status(500).send('Processing failed');
  }
});

app.listen(port, () => {
  console.log(`Screener server running at http://localhost:${port}`);
});
