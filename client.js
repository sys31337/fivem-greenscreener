/// <reference types="@citizenfx/client" />

const config = JSON.parse(LoadResourceFile(GetCurrentResourceName(), 'config.json'));

const Delay = (ms) => new Promise((res) => setTimeout(res, ms));

let cam;
let camInfo;
let ped;
let interval;
const playerId = PlayerId();
let QBCore = null;
const pendingRedoQueueRequests = new Map();
let redoQueueRequestId = 0;
const defaultPedAppearanceFallback = {
	components: {
		0: { drawable: 0, texture: 1, palette: 0 },
		1: { drawable: 0, texture: 0, palette: 0 },
		2: { drawable: -1, texture: 0, palette: 0 },
		3: { drawable: -1, texture: 0, palette: 0 },
		4: { drawable: -1, texture: 0, palette: 0 },
		5: { drawable: 0, texture: 0, palette: 0 },
		6: { drawable: -1, texture: 0, palette: 0 },
		7: { drawable: 0, texture: 0, palette: 0 },
		8: { drawable: -1, texture: 0, palette: 0 },
		9: { drawable: 0, texture: 0, palette: 0 },
		11: { drawable: -1, texture: 0, palette: 0 }
	},
	props: {
		0: { drawable: -1, texture: 0 },
		1: { drawable: -1, texture: 0 },
		2: { drawable: -1, texture: 0 },
		6: { drawable: -1, texture: 0 },
		7: { drawable: -1, texture: 0 }
	},
	hairColor: {
		primary: 45,
		secondary: 15
	}
};

if (config.useQBVehicles) {
	QBCore = exports[config.coreResourceName].GetCoreObject();
}

onNet('receiveRedoQueue', (requestId, redoQueue) => {
	const pendingRequest = pendingRedoQueueRequests.get(requestId);

	if (!pendingRequest) {
		return;
	}

	pendingRedoQueueRequests.delete(requestId);
	clearTimeout(pendingRequest.timeout);
	pendingRequest.resolve(redoQueue);
});

async function takeScreenshotForComponent(pedType, type, component, drawable, texture, cameraSettings) {
	const cameraInfo = cameraSettings ? cameraSettings : config.cameraSettings[type][component];

	setWeatherTime();

	await Delay(500);

	if (!camInfo || camInfo.zPos !== cameraInfo.zPos || camInfo.fov !== cameraInfo.fov) {
		camInfo = cameraInfo;

		if (cam) {
			DestroyAllCams(true);
			DestroyCam(cam, true);
			cam = null;
		}

		SetEntityRotation(ped, config.greenScreenRotation.x, config.greenScreenRotation.y, config.greenScreenRotation.z, 0, false);
		SetEntityCoordsNoOffset(ped, config.greenScreenPosition.x, config.greenScreenPosition.y, config.greenScreenPosition.z, false, false, false);

		await Delay(50);

		const [playerX, playerY, playerZ] = GetEntityCoords(ped);
		const [fwdX, fwdY, fwdZ] = GetEntityForwardVector(ped);

		const fwdPos = {
			x: playerX + fwdX * 1.2,
			y: playerY + fwdY * 1.2,
			z: playerZ + fwdZ + camInfo.zPos,
		};

		cam = CreateCamWithParams('DEFAULT_SCRIPTED_CAMERA', fwdPos.x, fwdPos.y, fwdPos.z, 0, 0, 0, camInfo.fov, true, 0);

		PointCamAtCoord(cam, playerX, playerY, playerZ + camInfo.zPos);
		SetCamActive(cam, true);
		RenderScriptCams(true, false, 0, true, false, 0);
	}

	await Delay(50);

	SetEntityRotation(ped, camInfo.rotation.x, camInfo.rotation.y, camInfo.rotation.z, 2, false);

	emitNet(
		'takeScreenshot',
		`${pedType}_${type == 'PROPS' ? 'prop_' : ''}${component}_${drawable}${texture ? `_${texture}`: ''}`,
		'clothing',
		{
			pedType,
			type,
			component,
			drawable,
			texture: texture ?? 0
		}
	);
	await Delay(2000);
	return;
}

async function takeScreenshotForObject(object, hash) {

	setWeatherTime();

	await Delay(500);

	if (cam) {
		DestroyAllCams(true);
		DestroyCam(cam, true);
		cam = null;
	}

	let [[minDimX, minDimY, minDimZ], [maxDimX, maxDimY, maxDimZ]] = GetModelDimensions(hash);
	let modelSize = {
		x: maxDimX - minDimX,
		y: maxDimY - minDimY,
		z: maxDimZ - minDimZ
	}
	let fov = Math.min(Math.max(modelSize.x, modelSize.z) / 0.15 * 10, 60);


	const [objectX, objectY, objectZ] = GetEntityCoords(object, false);
	const [fwdX, fwdY, fwdZ] = GetEntityForwardVector(object);

	const center = {
		x: objectX + (minDimX + maxDimX) / 2,
		y: objectY + (minDimY + maxDimY) / 2,
		z: objectZ + (minDimZ + maxDimZ) / 2,
	}

	const fwdPos = {
		x: center.x + fwdX * 1.2 + Math.max(modelSize.x, modelSize.z) / 2,
		y: center.y + fwdY * 1.2 + Math.max(modelSize.x, modelSize.z) / 2,
		z: center.z + fwdZ,
	};

	console.log(modelSize.x, modelSize.z)

	cam = CreateCamWithParams('DEFAULT_SCRIPTED_CAMERA', fwdPos.x, fwdPos.y, fwdPos.z, 0, 0, 0, fov, true, 0);

	PointCamAtCoord(cam, center.x, center.y, center.z);
	SetCamActive(cam, true);
	RenderScriptCams(true, false, 0, true, false, 0);

	await Delay(50);

	emitNet('takeScreenshot', `${hash}`, 'objects');

	await Delay(2000);

	return;

}

async function takeScreenshotForVehicle(vehicle, hash, model) {
	setWeatherTime();

	await Delay(500);

	if (cam) {
		DestroyAllCams(true);
		DestroyCam(cam, true);
		cam = null;
	}

	let [[minDimX, minDimY, minDimZ], [maxDimX, maxDimY, maxDimZ]] = GetModelDimensions(hash);
	let modelSize = {
		x: maxDimX - minDimX,
		y: maxDimY - minDimY,
		z: maxDimZ - minDimZ
	}
	let fov = Math.min(Math.max(modelSize.x, modelSize.y, modelSize.z) / 0.15 * 10, 60);

	const [objectX, objectY, objectZ] = GetEntityCoords(vehicle, false);

	const center = {
		x: objectX + (minDimX + maxDimX) / 2,
		y: objectY + (minDimY + maxDimY) / 2,
		z: objectZ + (minDimZ + maxDimZ) / 2,
	}

	let camPos = {
		x: center.x + (Math.max(modelSize.x, modelSize.y, modelSize.z) + 2) * Math.cos(340),
		y: center.y + (Math.max(modelSize.x, modelSize.y, modelSize.z) + 2) * Math.sin(340),
		z: center.z + modelSize.z / 2,
	}

	cam = CreateCamWithParams('DEFAULT_SCRIPTED_CAMERA', camPos.x, camPos.y, camPos.z, 0, 0, 0, fov, true, 0);

	PointCamAtCoord(cam, center.x, center.y, center.z);
	SetCamActive(cam, true);
	RenderScriptCams(true, false, 0, true, false, 0);

	await Delay(50);

	emitNet('takeScreenshot', `${model}`, 'vehicles');

	await Delay(2000);

	return;

}

function SetPedOnGround() {
	const [x, y, z] = GetEntityCoords(ped, false);
	const [retval, ground] = GetGroundZFor_3dCoord(x, y, z, 0, false);
	SetEntityCoords(ped, x, y, ground, false, false, false, false);

}

function getDefaultPedAppearance(pedType) {
	const defaultPedAppearance = config.defaultPedAppearance || {};
	const sharedAppearance = defaultPedAppearance.shared || {};
	const pedAppearance = defaultPedAppearance[pedType] || {};

	return {
		components: {
			...defaultPedAppearanceFallback.components,
			...(sharedAppearance.components || {}),
			...(pedAppearance.components || {})
		},
		props: {
			...defaultPedAppearanceFallback.props,
			...(sharedAppearance.props || {}),
			...(pedAppearance.props || {})
		},
		hairColor: {
			...defaultPedAppearanceFallback.hairColor,
			...(sharedAppearance.hairColor || {}),
			...(pedAppearance.hairColor || {})
		}
	};
}

function ClearAllPedProps(propsToClear) {
	for (const prop of propsToClear) {
		ClearPedProp(ped, parseInt(prop));
	}
}

function ApplyDefaultPedProps(defaultProps) {
	for (const [propId, propSettings] of Object.entries(defaultProps)) {
		const drawable = propSettings.drawable ?? -1;
		const texture = propSettings.texture ?? 0;
		const component = parseInt(propId);

		if (drawable < 0) {
			ClearPedProp(ped, component);
			continue;
		}

		SetPedPropIndex(ped, component, drawable, texture, 0);
	}
}

function ApplyDefaultPedComponents(defaultComponents) {
	for (const [componentId, componentSettings] of Object.entries(defaultComponents)) {
		SetPedComponentVariation(
			ped,
			parseInt(componentId),
			componentSettings.drawable ?? 0,
			componentSettings.texture ?? 0,
			componentSettings.palette ?? 0
		);
	}
}

async function ResetPedComponents(pedType) {

	if (config.debug) console.log(`DEBUG: Resetting Ped Components`);
	const defaultPedAppearance = getDefaultPedAppearance(pedType);
	const propsToClear = new Set([
		...Object.keys(config.cameraSettings.PROPS || {}),
		...Object.keys(defaultPedAppearance.props || {})
	]);

	SetPedDefaultComponentVariation(ped);

	await Delay(150);

	ApplyDefaultPedComponents(defaultPedAppearance.components);
	SetPedHairColor(
		ped,
		defaultPedAppearance.hairColor.primary ?? defaultPedAppearanceFallback.hairColor.primary,
		defaultPedAppearance.hairColor.secondary ?? defaultPedAppearanceFallback.hairColor.secondary
	);
	ClearAllPedProps(propsToClear);
	ApplyDefaultPedProps(defaultPedAppearance.props);

	return;
}

function setWeatherTime() {
	if (config.debug) console.log(`DEBUG: Setting Weather & Time`);
	SetRainLevel(0.0);
	SetWeatherTypePersist('EXTRASUNNY');
	SetWeatherTypeNow('EXTRASUNNY');
	SetWeatherTypeNowPersist('EXTRASUNNY');
	NetworkOverrideClockTime(18, 0, 0);
	NetworkOverrideClockMillisecondsPerGameMinute(1000000);
}

function stopWeatherResource() {
	if (config.debug) console.log(`DEBUG: Stopping Weather Resource`);
	if ((GetResourceState('qb-weathersync') == 'started') || (GetResourceState('qbx_weathersync') == 'started')) {
		TriggerEvent('qb-weathersync:client:DisableSync');
		return true;
	} else if (GetResourceState('weathersync') == 'started') {
		TriggerEvent('weathersync:toggleSync')
		return true;
	} else if (GetResourceState('esx_wsync') == 'started') {
		SendNUIMessage({
			error: 'weathersync',
		});
		return false;
	} else if (GetResourceState('cd_easytime') == 'started') {
		TriggerEvent('cd_easytime:PauseSync', false)
		return true;
	} else if (GetResourceState('vSync') == 'started' || GetResourceState('Renewed-Weathersync') == 'started') {
		TriggerEvent('vSync:toggle', false)
		return true;
	}
	return true;
};

function startWeatherResource() {
	if (config.debug) console.log(`DEBUG: Starting Weather Resource again`);
	if ((GetResourceState('qb-weathersync') == 'started') || (GetResourceState('qbx_weathersync') == 'started')) {
		TriggerEvent('qb-weathersync:client:EnableSync');
	} else if (GetResourceState('weathersync') == 'started') {
		TriggerEvent('weathersync:toggleSync')
	} else if (GetResourceState('cd_easytime') == 'started') {
		TriggerEvent('cd_easytime:PauseSync', true)
	} else if (GetResourceState('vSync') == 'started' || GetResourceState('Renewed-Weathersync') == 'started') {
		TriggerEvent('vSync:toggle', true)
	}
}

async function LoadComponentVariation(ped, component, drawable, texture) {
	texture = texture || 0;

	if (config.debug) console.log(`DEBUG: Loading Component Variation: ${component} ${drawable} ${texture}`);

	SetPedPreloadVariationData(ped, component, drawable, texture);
	while (!HasPedPreloadVariationDataFinished(ped)) {
		await Delay(50);
	}
	SetPedComponentVariation(ped, component, drawable, texture, 0);

	return;
}

async function LoadPropVariation(ped, component, prop, texture) {
	texture = texture || 0;

	if (config.debug) console.log(`DEBUG: Loading Prop Variation: ${component} ${prop} ${texture}`);

	SetPedPreloadPropData(ped, component, prop, texture);
	while (!HasPedPreloadPropDataFinished(ped)) {
		await Delay(50);
	}
	ClearPedProp(ped, component);
	SetPedPropIndex(ped, component, prop, texture, 0);

	return;
}

function createGreenScreenVehicle(vehicleHash, vehicleModel) {
	return new Promise(async(resolve, reject) => {
		if (config.debug) console.log(`DEBUG: Spawning Vehicle ${vehicleModel}`);
		const timeout = setTimeout(() => {
			resolve(null);
		}, config.vehicleSpawnTimeout)
		if (!HasModelLoaded(vehicleHash)) {
			RequestModel(vehicleHash);
			while (!HasModelLoaded(vehicleHash)) {
				await Delay(100);
			}
		}
		const vehicle = CreateVehicle(vehicleHash, config.greenScreenVehiclePosition.x, config.greenScreenVehiclePosition.y, config.greenScreenVehiclePosition.z, 0, true, true);
		if (vehicle === 0) {
			clearTimeout(timeout);
			resolve(null);
		}
		clearTimeout(timeout);
		resolve(vehicle);
	});
}

function parseCustomScreenshotSelectionArg(selectionArg) {
	const normalizedSelectionArg = (selectionArg || '').toLowerCase().trim();

	if (normalizedSelectionArg === 'all') {
		return {
			mode: 'all',
			startIndex: 0
		};
	}

	if (normalizedSelectionArg.startsWith('all:')) {
		const startIndex = parseInt(normalizedSelectionArg.slice(4), 10);

		if (isNaN(startIndex) || startIndex < 0) {
			return null;
		}

		return {
			mode: 'all',
			startIndex
		};
	}

	const value = parseInt(normalizedSelectionArg, 10);

	if (isNaN(value) || value < 0) {
		return null;
	}

	return {
		mode: 'single',
		value
	};
}

function getModelHashesForGender(gender) {
	if (gender == 'male') {
		return [GetHashKey('mp_m_freemode_01')];
	}

	if (gender == 'female') {
		return [GetHashKey('mp_f_freemode_01')];
	}

	if (gender == 'both') {
		return [GetHashKey('mp_m_freemode_01'), GetHashKey('mp_f_freemode_01')];
	}

	return [];
}

function getPedTypeFromModelHash(modelHash) {
	return modelHash === GetHashKey('mp_m_freemode_01') ? 'male' : 'female';
}

function normalizeRedoValues(values) {
	if (!Array.isArray(values)) {
		return [];
	}

	return [...new Set(
		values
			.map((value) => parseInt(value, 10))
			.filter((value) => !isNaN(value) && value >= 0)
	)].sort((a, b) => a - b);
}

function hasRedoEntriesForPedType(redoQueue, pedType) {
	const clothingEntries = Object.values(redoQueue?.clothing?.[pedType] || {}).some((values) => normalizeRedoValues(values).length > 0);
	const propEntries = Object.values(redoQueue?.props?.[pedType] || {}).some((values) => normalizeRedoValues(values).length > 0);

	return clothingEntries || propEntries;
}

function requestRedoQueueFromServer() {
	return new Promise((resolve, reject) => {
		redoQueueRequestId += 1;
		const requestId = `${GetGameTimer()}_${redoQueueRequestId}`;
		const timeout = setTimeout(() => {
			pendingRedoQueueRequests.delete(requestId);
			reject(new Error('Timed out while reading redo-queue.json'));
		}, 5000);

		pendingRedoQueueRequests.set(requestId, {
			resolve,
			reject,
			timeout
		});

		emitNet('requestRedoQueue', requestId);
	});
}

async function captureRedoEntriesForType(pedType, type, queueEntries) {
	for (const [componentId, values] of Object.entries(queueEntries || {})) {
		const component = parseInt(componentId, 10);
		const normalizedValues = normalizeRedoValues(values);
		const cameraSettings = config.cameraSettings?.[type]?.[component];

		if (isNaN(component) || normalizedValues.length === 0) {
			continue;
		}

		if (!cameraSettings) {
			console.log(`ERROR: No camera settings found for ${type} component ${component}`);
			continue;
		}

		await ResetPedComponents(pedType);
		await Delay(150);

		const maxVariationCount = type === 'CLOTHING'
			? GetNumberOfPedDrawableVariations(ped, component)
			: GetNumberOfPedPropDrawableVariations(ped, component);

		for (let index = 0; index < normalizedValues.length; index++) {
			const drawable = normalizedValues[index];

			if (drawable >= maxVariationCount) {
				console.log(`ERROR: Skipping ${type} component ${component} drawable ${drawable} because it exceeds the available range (${maxVariationCount - 1})`);
				continue;
			}

			SendNUIMessage({
				type: `${cameraSettings.name} redo`,
				value: index + 1,
				max: normalizedValues.length,
			});

			if (type === 'CLOTHING') {
				const textureVariationCount = GetNumberOfPedTextureVariations(ped, component, drawable);

				if (config.includeTextures) {
					for (let texture = 0; texture < textureVariationCount; texture++) {
						await LoadComponentVariation(ped, component, drawable, texture);
						await takeScreenshotForComponent(pedType, type, component, drawable, texture);
					}
				} else {
					await LoadComponentVariation(ped, component, drawable);
					await takeScreenshotForComponent(pedType, type, component, drawable);
				}
			} else if (type === 'PROPS') {
				const textureVariationCount = GetNumberOfPedPropTextureVariations(ped, component, drawable);

				if (config.includeTextures) {
					for (let texture = 0; texture < textureVariationCount; texture++) {
						await LoadPropVariation(ped, component, drawable, texture);
						await takeScreenshotForComponent(pedType, type, component, drawable, texture);
					}
				} else {
					await LoadPropVariation(ped, component, drawable);
					await takeScreenshotForComponent(pedType, type, component, drawable);
				}
			}
		}
	}
}


RegisterCommand('screenshot', async (source, args) => {
	const modelHashes = [GetHashKey('mp_m_freemode_01'), GetHashKey('mp_f_freemode_01')];

	SendNUIMessage({
		start: true,
	});

	if (!stopWeatherResource()) return;

	DisableIdleCamera(true);


	await Delay(100);

	for (const modelHash of modelHashes) {
		if (IsModelValid(modelHash)) {
			if (!HasModelLoaded(modelHash)) {
				RequestModel(modelHash);
				while (!HasModelLoaded(modelHash)) {
					await Delay(100);
				}
			}

			SetPlayerModel(playerId, modelHash);
			await Delay(150);
			SetModelAsNoLongerNeeded(modelHash);

			await Delay(150);

			ped = PlayerPedId();

			const pedType = modelHash === GetHashKey('mp_m_freemode_01') ? 'male' : 'female';
			SetEntityRotation(ped, config.greenScreenRotation.x, config.greenScreenRotation.y, config.greenScreenRotation.z, 0, false);
			SetEntityCoordsNoOffset(ped, config.greenScreenPosition.x, config.greenScreenPosition.y, config.greenScreenPosition.z, false, false, false);
			FreezeEntityPosition(ped, true);
			// SetEntityAlpha(ped, 0, false)
			await Delay(50);
			SetPlayerControl(playerId, false);

			interval = setInterval(() => {
				ClearPedTasksImmediately(ped);
			}, 1);

			for (const type of Object.keys(config.cameraSettings)) {
				for (const stringComponent of Object.keys(config.cameraSettings[type])) {
					await ResetPedComponents(pedType);
					await Delay(150);
					const component = parseInt(stringComponent);
					if (type === 'CLOTHING') {
						const drawableVariationCount = GetNumberOfPedDrawableVariations(ped, component);
						for (let drawable = 0; drawable < drawableVariationCount; drawable++) {
							const textureVariationCount = GetNumberOfPedTextureVariations(ped, component, drawable);
							SendNUIMessage({
								type: config.cameraSettings[type][component].name,
								value: drawable,
								max: drawableVariationCount,
							});
							if (config.includeTextures) {
								for (let texture = 0; texture < textureVariationCount; texture++) {
									await LoadComponentVariation(ped, component, drawable, texture);
									await takeScreenshotForComponent(pedType, type, component, drawable, texture);
								}
							} else {
								await LoadComponentVariation(ped, component, drawable);
								await takeScreenshotForComponent(pedType, type, component, drawable);
							}
						}
					} else if (type === 'PROPS') {
						const propVariationCount = GetNumberOfPedPropDrawableVariations(ped, component);
						for (let prop = 0; prop < propVariationCount; prop++) {
							const textureVariationCount = GetNumberOfPedPropTextureVariations(ped, component, prop);
							SendNUIMessage({
								type: config.cameraSettings[type][component].name,
								value: prop,
								max: propVariationCount,
							});

							if (config.includeTextures) {
								for (let texture = 0; texture < textureVariationCount; texture++) {
									await LoadPropVariation(ped, component, prop, texture);
									await takeScreenshotForComponent(pedType, type, component, prop, texture);
								}
							} else {
								await LoadPropVariation(ped, component, prop);
								await takeScreenshotForComponent(pedType, type, component, prop);
							}
						}
					}
				}
			}
			SetModelAsNoLongerNeeded(modelHash);
			SetPlayerControl(playerId, true);
			FreezeEntityPosition(ped, false);
			clearInterval(interval);
		}
	}
	SetPedOnGround();
	startWeatherResource();
	SendNUIMessage({
		end: true,
	});
	DestroyAllCams(true);
	DestroyCam(cam, true);
	RenderScriptCams(false, false, 0, true, false, 0);
	camInfo = null;
	cam = null;
});

RegisterCommand('customscreenshot', async (source, args) => {

	const type = args[2].toUpperCase();
	const component = parseInt(args[0]);
	const selection = parseCustomScreenshotSelectionArg(args[1]);
	const gender = args[3].toLowerCase();
	let cameraSettings;

	if (!selection) {
		console.log('ERROR: Invalid drawable/prop argument. Use a number, all, or all:<startIndex>');
		return;
	}

	const modelHashes = getModelHashesForGender(gender);

	if (modelHashes.length === 0) {
		console.log('ERROR: Invalid gender. Use male, female, or both');
		return;
	}

	if (args[4] != null) {
		let cameraSettingsJson = '';
		for (let i = 4; i < args.length; i++) {
			cameraSettingsJson += args[i] + ' ';
		}

		cameraSettings = JSON.parse(cameraSettingsJson.trim());
	}


	if (!stopWeatherResource()) return;

	DisableIdleCamera(true);


	await Delay(100);

	for (const modelHash of modelHashes) {
		if (IsModelValid(modelHash)) {
			if (!HasModelLoaded(modelHash)) {
				RequestModel(modelHash);
				while (!HasModelLoaded(modelHash)) {
					await Delay(100);
				}
			}

			SetPlayerModel(playerId, modelHash);
			await Delay(150);
			SetModelAsNoLongerNeeded(modelHash);

			await Delay(150);

			ped = PlayerPedId();

			interval = setInterval(() => {
				ClearPedTasksImmediately(ped);
			}, 1);

			const pedType = getPedTypeFromModelHash(modelHash);
			SetEntityRotation(ped, config.greenScreenRotation.x, config.greenScreenRotation.y, config.greenScreenRotation.z, 0, false);
			SetEntityCoordsNoOffset(ped, config.greenScreenPosition.x, config.greenScreenPosition.y, config.greenScreenPosition.z, false, false, false);
			FreezeEntityPosition(ped, true);
			await Delay(50);
			SetPlayerControl(playerId, false);

			await ResetPedComponents(pedType);
			await Delay(150);

			if (selection.mode === 'all') {
				SendNUIMessage({
					start: true,
				});
				if (type === 'CLOTHING') {
					const drawableVariationCount = GetNumberOfPedDrawableVariations(ped, component);
					for (let drawable = selection.startIndex; drawable < drawableVariationCount; drawable++) {
						const textureVariationCount = GetNumberOfPedTextureVariations(ped, component, drawable);
						SendNUIMessage({
							type: config.cameraSettings[type][component].name,
							value: drawable,
							max: drawableVariationCount,
						});
						if (config.includeTextures) {
							for (let texture = 0; texture < textureVariationCount; texture++) {
								await LoadComponentVariation(ped, component, drawable, texture);
								await takeScreenshotForComponent(pedType, type, component, drawable, texture, cameraSettings);
							}
						} else {
							await LoadComponentVariation(ped, component, drawable);
							await takeScreenshotForComponent(pedType, type, component, drawable, null, cameraSettings);
						}
					}
				} else if (type === 'PROPS') {
					const propVariationCount = GetNumberOfPedPropDrawableVariations(ped, component);
					for (let prop = selection.startIndex; prop < propVariationCount; prop++) {
						const textureVariationCount = GetNumberOfPedPropTextureVariations(ped, component, prop);
						SendNUIMessage({
							type: config.cameraSettings[type][component].name,
							value: prop,
							max: propVariationCount,
						});

						if (config.includeTextures) {
							for (let texture = 0; texture < textureVariationCount; texture++) {
								await LoadPropVariation(ped, component, prop, texture);
								await takeScreenshotForComponent(pedType, type, component, prop, texture, cameraSettings);
							}
						} else {
							await LoadPropVariation(ped, component, prop);
							await takeScreenshotForComponent(pedType, type, component, prop, null, cameraSettings);
						}
					}
				}
			} else {
				if (type === 'CLOTHING') {
					const textureVariationCount = GetNumberOfPedTextureVariations(ped, component, selection.value);

					if (config.includeTextures) {
						for (let texture = 0; texture < textureVariationCount; texture++) {
							await LoadComponentVariation(ped, component, selection.value, texture);
							await takeScreenshotForComponent(pedType, type, component, selection.value, texture, cameraSettings);
						}
					} else {
						await LoadComponentVariation(ped, component, selection.value);
						await takeScreenshotForComponent(pedType, type, component, selection.value, null, cameraSettings);
					}
				} else if (type === 'PROPS') {
					const textureVariationCount = GetNumberOfPedPropTextureVariations(ped, component, selection.value);

					if (config.includeTextures) {
						for (let texture = 0; texture < textureVariationCount; texture++) {
							await LoadPropVariation(ped, component, selection.value, texture);
							await takeScreenshotForComponent(pedType, type, component, selection.value, texture, cameraSettings);
						}
					} else {
						await LoadPropVariation(ped, component, selection.value);
						await takeScreenshotForComponent(pedType, type, component, selection.value, null, cameraSettings);
					}
				}
			}
			SetPlayerControl(playerId, true);
			FreezeEntityPosition(ped, false);
			clearInterval(interval);
		}
	}
	SetPedOnGround();
	startWeatherResource();
	SendNUIMessage({
		end: true,
	});
	DestroyAllCams(true);
	DestroyCam(cam, true);
	RenderScriptCams(false, false, 0, true, false, 0);
	camInfo = null;
	cam = null;
});

RegisterCommand('screenshotobject', async (source, args) => {
	let modelHash = isNaN(Number(args[0])) ? GetHashKey(args[0]) : Number(args[0]);
	const ped = GetPlayerPed(-1);

	if (IsWeaponValid(modelHash)) {
		modelHash = GetWeapontypeModel(modelHash);
	}

	if (!stopWeatherResource()) return;

	DisableIdleCamera(true);


	await Delay(100);

	if (IsModelValid(modelHash)) {
		if (!HasModelLoaded(modelHash)) {
			RequestModel(modelHash);
			while (!HasModelLoaded(modelHash)) {
				await Delay(100);
			}
		}
	} else {
		console.log('ERROR: Invalid object model');
		return;
	}


	SetEntityCoords(ped, config.greenScreenHiddenSpot.x, config.greenScreenHiddenSpot.y, config.greenScreenHiddenSpot.z, false, false, false);

	SetPlayerControl(playerId, false);

	if (config.debug) console.log(`DEBUG: Spawning Object ${modelHash}`);

	const object = CreateObjectNoOffset(modelHash, config.greenScreenPosition.x, config.greenScreenPosition.y, config.greenScreenPosition.z, false, true, true);

	SetEntityRotation(object, config.greenScreenRotation.x, config.greenScreenRotation.y, config.greenScreenRotation.z, 0, false);

	FreezeEntityPosition(object, true);

	await Delay(50);

	await takeScreenshotForObject(object, modelHash);


	DeleteEntity(object);
	SetPlayerControl(playerId, true);
	SetModelAsNoLongerNeeded(modelHash);
	startWeatherResource();
	DestroyAllCams(true);
	DestroyCam(cam, true);
	RenderScriptCams(false, false, 0, true, false, 0);
	cam = null;
});

RegisterCommand('stopscreen', async (source, args) => {
	startWeatherResource();
	clearInterval(interval);
	SetPlayerControl(playerId, true);
	FreezeEntityPosition(ped, false);
})

RegisterCommand('redoscreenshots', async (source, args) => {
	const gender = (args[0] || 'both').toLowerCase();
	const modelHashes = getModelHashesForGender(gender);

	if (modelHashes.length === 0) {
		console.log('ERROR: Invalid gender. Use male, female, or both');
		return;
	}

	let redoQueue;

	try {
		redoQueue = await requestRedoQueueFromServer();
	} catch (error) {
		console.log(`ERROR: ${error.message}`);
		return;
	}

	const pedTypesToProcess = modelHashes.map((modelHash) => getPedTypeFromModelHash(modelHash));

	if (!pedTypesToProcess.some((pedType) => hasRedoEntriesForPedType(redoQueue, pedType))) {
		console.log('INFO: redo-queue.json has no clothing or prop entries to redo for the selected gender');
		return;
	}

	SendNUIMessage({
		start: true,
	});

	if (!stopWeatherResource()) return;

	DisableIdleCamera(true);

	await Delay(100);

	for (const modelHash of modelHashes) {
		const pedType = getPedTypeFromModelHash(modelHash);

		if (!hasRedoEntriesForPedType(redoQueue, pedType)) {
			continue;
		}

		if (IsModelValid(modelHash)) {
			if (!HasModelLoaded(modelHash)) {
				RequestModel(modelHash);
				while (!HasModelLoaded(modelHash)) {
					await Delay(100);
				}
			}

			SetPlayerModel(playerId, modelHash);
			await Delay(150);
			SetModelAsNoLongerNeeded(modelHash);

			await Delay(150);

			ped = PlayerPedId();

			interval = setInterval(() => {
				ClearPedTasksImmediately(ped);
			}, 1);

			SetEntityRotation(ped, config.greenScreenRotation.x, config.greenScreenRotation.y, config.greenScreenRotation.z, 0, false);
			SetEntityCoordsNoOffset(ped, config.greenScreenPosition.x, config.greenScreenPosition.y, config.greenScreenPosition.z, false, false, false);
			FreezeEntityPosition(ped, true);
			await Delay(50);
			SetPlayerControl(playerId, false);

			await captureRedoEntriesForType(pedType, 'CLOTHING', redoQueue?.clothing?.[pedType]);
			await captureRedoEntriesForType(pedType, 'PROPS', redoQueue?.props?.[pedType]);

			SetPlayerControl(playerId, true);
			FreezeEntityPosition(ped, false);
			clearInterval(interval);
		}
	}

	SetPedOnGround();
	startWeatherResource();
	SendNUIMessage({
		end: true,
	});
	DestroyAllCams(true);
	DestroyCam(cam, true);
	RenderScriptCams(false, false, 0, true, false, 0);
	camInfo = null;
	cam = null;
})

RegisterCommand('screenshotvehicle', async (source, args) => {
	const vehicles = (config.useQBVehicles && QBCore != null) ? Object.keys(QBCore.Shared.Vehicles) : GetAllVehicleModels();
	const ped = PlayerPedId();
	const type = args[0].toLowerCase();
	const primarycolor = args[1] ? parseInt(args[1]) : null;
	const secondarycolor = args[2] ? parseInt(args[2]) : null;

	if (!stopWeatherResource()) return;


	DisableIdleCamera(true);
	SetEntityCoords(ped, config.greenScreenHiddenSpot.x, config.greenScreenHiddenSpot.y, config.greenScreenHiddenSpot.z, false, false, false);
	SetPlayerControl(playerId, false);

	ClearAreaOfVehicles(config.greenScreenPosition.x, config.greenScreenPosition.y, config.greenScreenPosition.z, 10, false, false, false, false, false);

	await Delay(100);

	if (type === 'all') {
		SendNUIMessage({
			start: true,
		});
		for (const vehicleModel of vehicles) {
			const vehicleHash = GetHashKey(vehicleModel);
			if (!IsModelValid(vehicleHash)) continue;


			const vehicleClass = GetVehicleClassFromName(vehicleHash);

			if (!config.includedVehicleClasses[vehicleClass]) {
				SetModelAsNoLongerNeeded(vehicleHash);
				continue;
			}

			SendNUIMessage({
				type: vehicleModel,
				value: vehicles.indexOf(vehicleModel) + 1,
				max: vehicles.length + 1
			});

			const vehicle = await createGreenScreenVehicle(vehicleHash, vehicleModel);

			if (vehicle === 0 || vehicle === null) {
				SetModelAsNoLongerNeeded(vehicleHash);
				console.log(`ERROR: Could not spawn vehicle. Broken Vehicle: ${vehicleModel}`);
				continue;
			}

			SetEntityRotation(vehicle, config.greenScreenVehicleRotation.x, config.greenScreenVehicleRotation.y, config.greenScreenVehicleRotation.z, 0, false);

			FreezeEntityPosition(vehicle, true);

			SetVehicleWindowTint(vehicle, 1);

			if (primarycolor) SetVehicleColours(vehicle, primarycolor, secondarycolor || primarycolor);

			await Delay(50);

			await takeScreenshotForVehicle(vehicle, vehicleHash, vehicleModel);

			DeleteEntity(vehicle);
			SetModelAsNoLongerNeeded(vehicleHash);
		}
		SendNUIMessage({
			end: true,
		});
	} else {
		const vehicleModel = type;
		const vehicleHash = GetHashKey(vehicleModel);
		if (IsModelValid(vehicleHash)) {



			SendNUIMessage({
				type: vehicleModel,
				value: vehicles.indexOf(vehicleModel) + 1,
				max: vehicles.length + 1
			});

			const vehicle = await createGreenScreenVehicle(vehicleHash, vehicleModel);

			if (vehicle === 0 || vehicle === null) {
				SetModelAsNoLongerNeeded(vehicleHash);
				console.log(`ERROR: Could not spawn vehicle. Broken Vehicle: ${vehicleModel}`);
				return;
			}

			SetEntityRotation(vehicle, config.greenScreenVehicleRotation.x, config.greenScreenVehicleRotation.y, config.greenScreenVehicleRotation.z, 0, false);

			FreezeEntityPosition(vehicle, true);

			SetVehicleWindowTint(vehicle, 1);

			if (primarycolor) SetVehicleColours(vehicle, primarycolor, secondarycolor || primarycolor);

			await Delay(50);

			await takeScreenshotForVehicle(vehicle, vehicleHash, vehicleModel);

			DeleteEntity(vehicle);
			SetModelAsNoLongerNeeded(vehicleHash);
		} else {
			console.log('ERROR: Invalid vehicle model');
		}
	}
	SetPlayerControl(playerId, true);
	startWeatherResource();
	DestroyAllCams(true);
	DestroyCam(cam, true);
	RenderScriptCams(false, false, 0, true, false, 0);
	cam = null;
});



setImmediate(() => {
	emit('chat:addSuggestions', [
		{
			name: '/screenshot',
			help: 'generate clothing screenshots',
		},
		{
			name: '/customscreenshot',
			help: 'generate custom cloting screenshots',
			params: [
				{name:"component", help:"The clothing component to take a screenshot of"},
				{name:"drawable/all/all:start", help:"A single variation, all variations, or all starting from a specific index"},
				{name:"props/clothing", help:"PROPS or CLOTHING"},
				{name:"male/female/both", help:"The gender to take a screenshot of"},
				{name:"camera settings", help:"The camera settings to use for the screenshot (optional)"},
			]
		},
		{
			name: '/screenshotobject',
			help: 'generate object screenshots',
			params: [
				{name:"object", help:"The object hash to take a screenshot of"},
			]
		},
		{
			name: '/screenshotvehicle',
			help: 'generate vehicle screenshots',
			params: [
				{name:"model/all", help:"The vehicle model or 'all' to take a screenshot of all vehicles"},
				{name:"primarycolor", help:"The primary vehicle color to take a screenshot of (optional) See: https://wiki.rage.mp/index.php?title=Vehicle_Colors"},
				{name:"secondarycolor", help:"The secondary vehicle color to take a screenshot of (optional) See: https://wiki.rage.mp/index.php?title=Vehicle_Colors"},
			]
		},
		{
			name: '/redoscreenshots',
			help: 'redo clothing and prop screenshots from redo-queue.json',
			params: [
				{name:"male/female/both", help:"The gender queue to redo (optional, defaults to both)"},
			]
		}
	])
  });

on('onResourceStop', (resName) => {
	if (GetCurrentResourceName() != resName) return;

	startWeatherResource();
	clearInterval(interval);
	SetPlayerControl(playerId, true);
	FreezeEntityPosition(ped, false);
});
