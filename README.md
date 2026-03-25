# fivem-greenscreener

`fivem-greenscreener` captures screenshots of GTA V clothing, props, objects, weapons, and vehicles against a green screen. It saves the raw screenshots into this resource's `images/` folder and can optionally POST each saved file to an HTTP endpoint for automatic post-processing.

## What Is Included

- The FiveM resource in the project root:
  captures screenshots in game and saves them to `images/clothing`, `images/objects`, and `images/vehicles`.
- The optional post-processing app in `screener/app.js`:
  receives `{ "fileName": "..." }`, loads the saved image, removes the green background, and overwrites the image.

## Important Folder Rule

Place this resource directly inside `resources/`.

Do not put it inside a subfolder such as `resources/[scripts]/fivem-greenscreener`, because the server-side save path uses `resources/<resourceName>/images`.

## Dependencies

- [`screenshot-basic`](https://github.com/citizenfx/screenshot-basic)
- Node.js
- `npm` or `yarn`

If you use QB vehicle definitions, `qb-core` must be started before this resource.

## Install

### 1. Install the resource dependencies

From the resource root:

```powershell
cd resources/fivem-greenscreener
npm install
```

### 2. Install the optional screener service dependencies

Only do this if you want automatic green-screen removal through HTTP POST:

```powershell
cd resources/fivem-greenscreener/screener
npm install
```

### 3. Configure `config.json`

The new `postProcessEndpoint` value controls where each saved image is POSTed.

```json
"postProcessEndpoint": "http://localhost:5001/api/screener"
```

Notes:

- Set it to `""` to disable automatic POST requests entirely.
- If you run the bundled screener app on another host or port, update this URL to match.
- Screenshots are still saved locally even if post-processing is disabled.
- `defaultPedAppearance.shared` is the base outfit applied before each clothing or prop screenshot.
- You can add `defaultPedAppearance.male` or `defaultPedAppearance.female` blocks with the same structure to override the shared base outfit per gender.

### 4. Start the optional screener service

From the `screener/` folder:

```powershell
cd resources/fivem-greenscreener/screener
node app.js
```

Default bundled endpoint:

```text
http://localhost:5001/api/screener
```

### 5. Ensure the resources in `server.cfg`

```cfg
ensure screenshot-basic
ensure fivem-greenscreener
```

If `useQBVehicles` is `true`, also make sure `qb-core` starts before `fivem-greenscreener`.

## Output Folders

- Clothing and props: `images/clothing`
- Objects and weapons: `images/objects`
- Vehicles: `images/vehicles`

## Redo Queue

Failed clothing and prop post-processing entries are tracked in `redo-queue.json`.

The file is read dynamically each time you run the redo command, so you can edit it without restarting the resource.

Format:

```json
{
  "clothing": {
    "male": {
      "1": [0, 16, 82],
      "4": [11, 433]
    },
    "female": {}
  },
  "props": {
    "male": {
      "0": [220, 237],
      "1": [57, 58, 81]
    },
    "female": {}
  }
}
```

## In-Game Commands

### `/screenshot`

Captures every configured clothing component and prop for both freemode male and freemode female peds.

Use:

```text
/screenshot
```

What it uses:

- `cameraSettings` from `config.json`
- `includeTextures`
- `overwriteExistingImages`

### `/customscreenshot`

Captures one clothing or prop component, one drawable or all drawables, for male, female, or both. You can also pass a custom camera JSON object.

Syntax:

```text
/customscreenshot [component] [drawable|all|all:startIndex] [clothing|props] [male|female|both] [cameraJson(optional)]
```

Examples:

```text
/customscreenshot 11 17 clothing male
/customscreenshot 11 all clothing female
/customscreenshot 3 all:80 clothing male
/customscreenshot 0 all props both
/customscreenshot 0 all:25 props male
/customscreenshot 11 17 clothing male {"fov":55,"rotation":{"x":0,"y":0,"z":15},"zPos":0.26}
```

Resume notes:

- `all` starts from drawable or prop `0`.
- `all:80` starts from drawable or prop `80`.
- This works for both `clothing` and `props`.

Built-in component ids:

Clothing:

- `1` Masks
- `3` Torsos
- `4` Legs
- `5` Bags
- `6` Shoes
- `7` Accessories
- `8` Undershirts
- `9` Body Armors
- `11` Tops

Props:

- `0` Hats
- `1` Glasses
- `2` Ears
- `6` Watches
- `7` Bracelets

### `/screenshotobject`

Captures a single object model. You can pass a model name, numeric hash, or weapon hash. Weapon hashes are converted to the weapon model automatically.

Syntax:

```text
/screenshotobject [modelName|hash]
```

Examples:

```text
/screenshotobject prop_cs_cardbox_01
/screenshotobject 2240524752
```

### `/screenshotvehicle`

Captures one vehicle or every vehicle. If you pass one color id, it is used for both primary and secondary color. If you pass two, they are applied separately.

Syntax:

```text
/screenshotvehicle [model|all] [primaryColor(optional)] [secondaryColor(optional)]
```

Examples:

```text
/screenshotvehicle zentorno
/screenshotvehicle zentorno 1
/screenshotvehicle zentorno 1 111
/screenshotvehicle all
/screenshotvehicle all 1 1
```

Vehicle notes:

- When `useQBVehicles` is `false`, the command loops over `GetAllVehicleModels()`.
- When `useQBVehicles` is `true`, it uses `QBCore.Shared.Vehicles`.
- Vehicle classes are filtered by `includedVehicleClasses` in `config.json`.

### `/stopscreen`

Stops the current capture run, re-enables player control, and resumes weather sync where supported.

Use:

```text
/stopscreen
```

### `/redoscreenshots`

Reads `redo-queue.json` live from disk and re-runs every clothing and prop entry listed there for the selected gender.

Syntax:

```text
/redoscreenshots [male|female|both]
```

Examples:

```text
/redoscreenshots
/redoscreenshots male
/redoscreenshots female
```

## Key Config Values

From `config.json`:

- `debug`: prints extra logs.
- `includeTextures`: captures every texture variation instead of only the default texture.
- `overwriteExistingImages`: when `false`, existing PNG files are skipped.
- `postProcessEndpoint`: URL the server posts `{ fileName }` to after each screenshot is saved.
- `defaultPedAppearance`: base components, props, and hair color that stay on the ped for each screenshot while only the target clothing slot or prop is changed.
- `useQBVehicles`: switch vehicle iteration from native vehicle models to QB vehicles.
- `vehicleSpawnTimeout`: timeout in milliseconds before a vehicle spawn attempt is treated as failed.
- `cameraSettings`: per-component camera position, rotation, and FOV presets used by `/screenshot` and by `/customscreenshot` when no override JSON is provided.

## Typical Workflow

1. Start the screener service with `node app.js` if you want automatic background removal.
2. Start your FiveM server with `ensure screenshot-basic` and `ensure fivem-greenscreener`.
3. Join the server.
4. Run one of the in-game commands above.
5. Collect the generated PNGs from `images/`.

## Troubleshooting

- Nothing is being POSTed:
  check `postProcessEndpoint` in `config.json` and make sure the HTTP service is running.
- Images save but keep the green background:
  the FiveM resource is working, but the post-processing endpoint is disabled, unreachable, or returning an error.
- Vehicle screenshots are missing some models:
  confirm the vehicle's class is enabled in `includedVehicleClasses`.
- Custom camera JSON seems ignored:
  use valid JSON with double quotes, for example `{"fov":55,"rotation":{"x":0,"y":0,"z":15},"zPos":0.26}`.
- Resuming from `all:n` does not work:
  make sure the second argument is exactly in the form `all:80` with a non-negative number after the colon.

## Credits

- Automatic green-screen removal idea and processing support: [@hakanesnn](https://github.com/hakanesnn)
- Green-screen box resource inspiration: [@jimgordon20](https://github.com/jimgordon20/jim_g_green_screen)
