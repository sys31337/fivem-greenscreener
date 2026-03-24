/// <reference types="@citizenfx/server" />
/// <reference types="image-js" />

const fs = require('fs');
const http = require('http');
const fetch = require("node-fetch");


const resName = GetCurrentResourceName();
const mainSavePath = `resources/${resName}/images`;
const config = JSON.parse(LoadResourceFile(GetCurrentResourceName(), "config.json"));

try {
	if (!fs.existsSync(mainSavePath)) {
		fs.mkdirSync(mainSavePath);
	}

	onNet('takeScreenshot', async (filename, type) => {
		const savePath = `${mainSavePath}/${type}`;
		if (!fs.existsSync(savePath)) {
			fs.mkdirSync(savePath);
		}

		const fullFilePath = savePath + "/" + filename + ".png";

		// Check if file exists and overwrite is disabled
		if (!config.overwriteExistingImages && fs.existsSync(fullFilePath)) {
			if (config.debug) {
				console.log(
					`DEBUG: Skipping existing file: ${filename}.png (overwriteExistingImages = false)`
				);
			}
			return;
		}

		if (config.debug) {
			console.log(`DEBUG: Processing screenshot: ${filename}.png`);
		}

		exports['screenshot-basic'].requestClientScreenshot(
			source,
			{
				fileName: fullFilePath,
				encoding: 'png',
				quality: 1.0,
			},
			async (err, fileName) => {
				const body = {fileName: `${type}/${filename}.png`};
				const req = await fetch('http://localhost:5001/api/screener', {
					method: 'POST',
					body: JSON.stringify(body),
					headers: { 'Content-Type': 'application/json' }
				})
				console.log(JSON.stringify(req))
			}
		);
	});
} catch (error) {
	console.error(error.message);
}
