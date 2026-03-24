/// <reference types="@citizenfx/server" />
/// <reference types="image-js" />

const fs = require('fs');
const fetch = require("node-fetch");


const resName = GetCurrentResourceName();
const mainSavePath = `resources/${resName}/images`;
const config = JSON.parse(LoadResourceFile(GetCurrentResourceName(), "config.json"));
const postProcessEndpoint = typeof config.postProcessEndpoint === 'string'
	? config.postProcessEndpoint.trim()
	: '';

try {
	if (!fs.existsSync(mainSavePath)) {
		fs.mkdirSync(mainSavePath);
	}

	onNet('takeScreenshot', async (filename, type) => {
		const savePath = `${mainSavePath}/${type}`;
		if (!fs.existsSync(savePath)) {
			fs.mkdirSync(savePath, { recursive: true });
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
				if (err) {
					console.error(`Failed to capture screenshot ${filename}.png: ${err}`);
					return;
				}

				if (config.debug) {
					console.log(`DEBUG: Screenshot saved to ${fileName}`);
				}

				if (!postProcessEndpoint) {
					return;
				}

				const body = { fileName: `${type}/${filename}.png` };

				try {
					const response = await fetch(postProcessEndpoint, {
						method: 'POST',
						body: JSON.stringify(body),
						headers: { 'Content-Type': 'application/json' }
					});

					if (!response.ok) {
						const responseText = await response.text();
						console.error(
							`Post-processing failed for ${filename}.png: ${response.status} ${response.statusText}${responseText ? ` - ${responseText}` : ''}`
						);
						return;
					}

					if (config.debug) {
						console.log(`DEBUG: Posted ${filename}.png to ${postProcessEndpoint}`);
					}
				} catch (postProcessError) {
					console.error(`Failed to POST ${filename}.png to ${postProcessEndpoint}: ${postProcessError.message}`);
				}
			}
		);
	});
} catch (error) {
	console.error(error.message);
}
