# Mijo 3D — Parametric Part Studio

A zero-build, browser-based 3D part studio for lamp shades and other printable parts.
It renders a live parametric design, imports CAD/mesh files, scales each part, and exports a
print-ready binary STL.

Everything runs in the browser. There is no bundler, no backend, and no npm install required
for normal use. Three.js is loaded from a CDN.

---

## 1. Run it

The app uses ES modules and an import map, so it **must be served over HTTP**. Opening
`index.html` by double-clicking (`file://`) will show a blank viewport because the browser
blocks module imports from local files.

### Windows (Python — usually already installed)

Open PowerShell in this folder and run:

```powershell
cd C:\Users\Lenovo\random
py -m http.server 8000
```

If `py` is not available:

```powershell
python -m http.server 8000
```

Then open **http://localhost:8000** in your browser. Press `Ctrl+C` in PowerShell to stop
the server.

### Alternatives (no Python)

```powershell
cd C:\Users\Lenovo\random
npx --yes serve@14 .
```

or

```powershell
npx --yes http-server@14 -p 8000
```

The VS Code **Live Server** extension also works: right-click `index.html` → *Open with Live
Server*.

> Internet access is required on first load because Three.js and the optional file loaders
> come from a CDN. See [Offline / self-hosting](#6-offline--self-hosting) if you need to run
> without internet.

---

## 2. What was fixed

The original `app.js` was truncated in the middle of a JavaScript expression (it stopped
inside the `vAmp` slider lookup). That single syntax error prevented the **entire module**
from parsing: the renderer never started, and none of the slider listeners were ever
attached. The file has been rebuilt from scratch, so the viewport and every control now
initialize correctly.

---

## 3. Features

### Parametric design
- Six starter presets: **Pendant, Dome, Cone, Pleated, Vase, Planter**.
- Live controls for height, bottom/top radius, belly bulge, vertical ribs, rib depth,
  spiral twist, vertical waves, wall thickness, and support spokes.
- **Model scale** slider (20–400%) scales the complete design, including the bulb preview.
- Hollow-shell mode with a printable E26/E27, E14/E12, or LED-puck socket fitter and
  support spokes, or a single-surface **vase mode**.
- Optional closed bottom (vessel/planter) and closed top.

### Imported parts
- Add multiple parts at once; each gets its own scale slider (10–400%), visibility toggle,
  frame button, and remove button.
- Auto-fit normalizes each imported part to a target size (40–300 mm) or, when disabled,
  uses file units (auto / mm / cm / inch).
- 2D drawings can be laid flat on the print bed.

### Viewport
- Orbit, pan, zoom, damped camera, fit view, reset view, auto-rotate, fullscreen.
- Wireframe, grid/print bed, soft shadows, and warm LED bulb preview toggles.
- Responsive layout with a mobile control drawer, safe-area support, high-DPI clamping,
  reduced-motion support, and render pausing when the tab is hidden.

### Export
- **Download print-ready .STL** writes one binary STL containing every visible mesh, in
  millimeters, with the current design scale and row layout applied.
- The grid, print bed, bulb preview, and DXF line drawings are excluded.
- Hide parts you do not want before exporting (the eye button in the Import list).

---

## 4. Supported file types

| Format | Support | Notes |
| --- | --- | --- |
| **STL** (binary/ASCII) | Full mesh import | Triangles only, as expected. |
| **OBJ** | Geometry | `.mtl` materials/textures are not read; the studio material is used. |
| **PLY** | Mesh/point data | Vertex colors are used when present. |
| **GLB / glTF** | Scene import | **GLB recommended.** A `.gltf` that references external `.bin`/textures cannot resolve those files from a file picker. |
| **3MF** | Geometry + colors | Slicer/printer settings are ignored. |
| **FBX** | Geometry | Embedded textures load; external files do not. |
| **DAE (Collada)** | Scene import | Embedded textures load; external files do not. |
| **DXF** | 2D drawing | ASCII DXF entities are drawn as editable line geometry. Text, dimensions, hatches, and unsupported blocks are skipped. |
| **STEP / IGES** | Solid/surface tessellation | Uses the OpenCascade WASM kernel, downloaded on first use (~10 MB). Internet required unless self-hosted. |
| **DWG / DWF** | **Not parsed directly** | Proprietary binary. Convert once to DXF, then import the DXF. See below. |

Files up to **200 MB** are accepted. Very dense DXF drawings are capped at 450,000 line
segments to keep the viewport responsive.

### DWG / DWF → DXF

A browser cannot safely parse proprietary DWG/DWF binary. Convert the file once:

1. **From your CAD application** — `File → Save As → DXF`, choose **ASCII** and a recent
   release (R2013 or newer). Then drop the `.dxf` into the studio.
2. **Free ODA File Converter** —
   <https://www.opendesign.com/guestfiles/oda_file_converter>
   Select DWG/DWF input, DXF output, and convert.
3. **LibreDWG command line** (where available):
   ```powershell
   dwg2dxf "your-part.dwg" -o "your-part.dxf"
   ```

A DXF is usually a 2D drawing. If you need a solid for printing, export **STL**, **STEP**, or
**GLB** from your CAD tool instead.

---

## 5. Controls

- **Design tab** — presets and all parametric sliders.
- **Import tab** — add files, auto-fit, target size, units, per-part list.
- **View tab** — visibility, bulb, wireframe, grid, shadows, auto-rotate, camera, fullscreen.
- **Drag and drop** CAD/mesh files anywhere on the viewport.
- Keyboard: <kbd>F</kbd> fit · <kbd>G</kbd> grid · <kbd>R</kbd> reset view ·
  <kbd>W</kbd> wireframe · <kbd>?</kbd> format guide.

If a file cannot be loaded, a dialog explains why and offers a **Choose a file** button for
the recommended replacement format (for example, `.dxf` after a DWG warning).

---

## 6. Offline / self-hosting

Normal operation needs no installation. To remove the CDN dependency, host Three.js
locally:

```powershell
cd C:\Users\Lenovo\random
npm init -y
npm install three@0.160.0
```

Then change the import map in `index.html`:

```json
<script type="importmap">
  {
    "imports": {
      "three": "./node_modules/three/build/three.module.js",
      "three/addons/": "./node_modules/three/examples/jsm/"
    }
  }
</script>
```

All mesh loaders are imported through `three/addons/`, so this also covers STL, OBJ, PLY,
glTF, 3MF, FBX, and Collada.

For offline STEP/IGES:

```powershell
npm install occt-import-js@0.0.23
```

Copy `node_modules\occt-import-js\dist\` into a folder such as `vendor\occt\`, then in
`app.js` change the first OCCT base URL in `getOcct()` to:

```js
const bases = [
  './vendor/occt/',
  // ...
];
```

Serve the folder over HTTP as described in section 1.

---

## 7. Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Blank viewport, sliders do nothing | Opened with `file://`. Serve over HTTP (section 1). |
| “WebGL could not start” | Enable hardware acceleration / update the browser. |
| STEP or IGES fails | The OCCT kernel could not be downloaded. Check internet access, try again, or export STL/OBJ/GLB from CAD. |
| glTF loads without textures/geometry | The `.gltf` references external files. Re-export as a single `.glb`. |
| DWG will not load | Expected. Convert to DXF (section 4). |
| Imported part is tiny or huge | Leave **Auto-fit** on, or disable it and set the correct **File units**. |
| STL export contains parts you did not want | Hide them first; export includes every visible mesh. |
| Export refuses a very dense scene | The limit is 4 million triangles for browser memory safety. Simplify the mesh. |

---

## 8. Files

```
index.html   markup, import map, UI structure
style.css    responsive dark studio theme and mobile drawer
app.js       Three.js scene, parametric geometry, importers, DXF parser, STL export
README.md    this guide
```
