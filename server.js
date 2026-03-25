/// <reference types="@citizenfx/server" />
/// <reference types="image-js" />

const fs = require('fs');
const path = require('path');
const fetch = require("node-fetch");


const resName = GetCurrentResourceName();
const resourcePath = GetResourcePath(resName);
const mainSavePath = `resources/${resName}/images`;
const redoQueuePath = path.join(resourcePath, 'redo-queue.json');
const config = JSON.parse(LoadResourceFile(GetCurrentResourceName(), "config.json"));
const postProcessEndpoint = typeof config.postProcessEndpoint === 'string'
	? config.postProcessEndpoint.trim()
	: '';

function getEmptyRedoQueue() {
	return {
		clothing: {
			male: {},
			female: {}
		},
		props: {
			male: {},
			female: {}
		}
	};
}

function normalizeRedoQueue(queueData) {
	const normalizedQueue = getEmptyRedoQueue();

	for (const category of Object.keys(normalizedQueue)) {
		for (const gender of Object.keys(normalizedQueue[category])) {
			const entries = queueData?.[category]?.[gender] || {};

			for (const [componentId, values] of Object.entries(entries)) {
				if (!Array.isArray(values)) {
					continue;
				}

				const normalizedValues = [...new Set(
					values
						.map((value) => parseInt(value, 10))
						.filter((value) => !isNaN(value) && value >= 0)
				)].sort((a, b) => a - b);

				if (normalizedValues.length > 0) {
					normalizedQueue[category][gender][componentId] = normalizedValues;
				}
			}
		}
	}

	return normalizedQueue;
}

function ensureRedoQueueFile() {
	if (!fs.existsSync(redoQueuePath)) {
		fs.writeFileSync(redoQueuePath, JSON.stringify(getEmptyRedoQueue(), null, 2));
	}
}

function readRedoQueue() {
	ensureRedoQueueFile();

	try {
		const queueContent = fs.readFileSync(redoQueuePath, 'utf8');
		return normalizeRedoQueue(JSON.parse(queueContent));
	} catch (error) {
		console.error(`Failed to read redo queue: ${error.message}`);
		return getEmptyRedoQueue();
	}
}

function writeRedoQueue(queueData) {
	fs.writeFileSync(redoQueuePath, JSON.stringify(normalizeRedoQueue(queueData), null, 2));
}

function getRedoEntryLocation(screenshotMetadata) {
	if (!screenshotMetadata) {
		return null;
	}

	const category = screenshotMetadata.type === 'PROPS' ? 'props' : 'clothing';
	const gender = screenshotMetadata.pedType;
	const componentId = String(screenshotMetadata.component);
	const drawable = parseInt(screenshotMetadata.drawable, 10);

	if (!['male', 'female'].includes(gender) || isNaN(drawable) || drawable < 0 || !componentId) {
		return null;
	}

	return {
		category,
		gender,
		componentId,
		drawable
	};
}

function addRedoQueueEntry(screenshotMetadata) {
	const entryLocation = getRedoEntryLocation(screenshotMetadata);

	if (!entryLocation) {
		return;
	}

	const redoQueue = readRedoQueue();
	const entries = redoQueue[entryLocation.category][entryLocation.gender][entryLocation.componentId] || [];

	if (!entries.includes(entryLocation.drawable)) {
		entries.push(entryLocation.drawable);
		entries.sort((a, b) => a - b);
		redoQueue[entryLocation.category][entryLocation.gender][entryLocation.componentId] = entries;
		writeRedoQueue(redoQueue);
	}
}

function removeRedoQueueEntry(screenshotMetadata) {
	const entryLocation = getRedoEntryLocation(screenshotMetadata);

	if (!entryLocation) {
		return;
	}

	const redoQueue = readRedoQueue();
	const entries = redoQueue[entryLocation.category][entryLocation.gender][entryLocation.componentId] || [];
	const filteredEntries = entries.filter((value) => value !== entryLocation.drawable);

	if (filteredEntries.length === entries.length) {
		return;
	}

	if (filteredEntries.length === 0) {
		delete redoQueue[entryLocation.category][entryLocation.gender][entryLocation.componentId];
	} else {
		redoQueue[entryLocation.category][entryLocation.gender][entryLocation.componentId] = filteredEntries;
	}

	writeRedoQueue(redoQueue);
}

function formatScreenshotMetadata(screenshotMetadata) {
	const entryLocation = getRedoEntryLocation(screenshotMetadata);

	if (!entryLocation) {
		return '';
	}

	return ` [${entryLocation.category} ${entryLocation.gender} component ${entryLocation.componentId} drawable ${entryLocation.drawable}]`;
}

try {
	if (!fs.existsSync(mainSavePath)) {
		fs.mkdirSync(mainSavePath, { recursive: true });
	}

	ensureRedoQueueFile();

	onNet('requestRedoQueue', (requestId) => {
		const redoQueue = readRedoQueue();
		emitNet('receiveRedoQueue', source, requestId, redoQueue);
	});

	onNet('takeScreenshot', async (filename, type, screenshotMetadata = null) => {
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

						if (response.status === 400) {
							addRedoQueueEntry(screenshotMetadata);
						}

						console.error(
							`Post-processing failed for ${filename}.png${formatScreenshotMetadata(screenshotMetadata)}: ${response.status} ${response.statusText}${responseText ? ` - ${responseText}` : ''}`
						);
						return;
					}

					removeRedoQueueEntry(screenshotMetadata);

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
