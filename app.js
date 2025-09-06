const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");
const sharp = require("sharp");

const app = express();
const PORT = process.env.PORT || 5000;

// Multer setup
const upload = multer({ dest: "uploads/" });

const INPUT_ZIP = "input.zip";
const OUTPUT_ZIP = "enhanced_output.zip";
const EXTRACT_FOLDER = "input_pngs";
const OUTPUT_FOLDER = "enhanced_pngs";

// Ensure uploads folder exists
if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");

// ---------------- Upload page ----------------
app.get("/", (req, res) => {
  res.send(`
    <h2>PNG Enhancer Bot (Node.js)</h2>
    <form method="post" enctype="multipart/form-data" action="/upload">
      <input type="file" name="zipfile" />
      <button type="submit">Upload & Enhance</button>
    </form>
    <form method="post" action="/enhance-existing">
      <button type="submit">Enhance Existing ZIP</button>
    </form>
  `);
});

// ---------------- Upload new ZIP ----------------
app.post("/upload", upload.single("zipfile"), (req, res) => {
  const filePath = req.file.path;
  fs.renameSync(filePath, INPUT_ZIP);
  enhanceZIP().then(() => res.download(OUTPUT_ZIP));
});

// ---------------- Enhance existing ZIP ----------------
app.post("/enhance-existing", (req, res) => {
  if (!fs.existsSync(INPUT_ZIP)) return res.send("No ZIP found.");
  enhanceZIP().then(() => res.download(OUTPUT_ZIP));
});

// ---------------- Core enhancement function ----------------
async function enhanceZIP() {
  // Clean old folders
  [EXTRACT_FOLDER, OUTPUT_FOLDER].forEach(f => {
    if (fs.existsSync(f)) fs.rmSync(f, { recursive: true, force: true });
    fs.mkdirSync(f);
  });

  // Extract ZIP
  const zip = new AdmZip(INPUT_ZIP);
  zip.extractAllTo(EXTRACT_FOLDER, true);

  // Recursively process PNGs
  async function processFolder(src, dest) {
    const files = fs.readdirSync(src, { withFileTypes: true });
    for (let f of files) {
      const srcPath = path.join(src, f.name);
      const destPath = path.join(dest, f.name);
      if (f.isDirectory()) {
        fs.mkdirSync(destPath, { recursive: true });
        await processFolder(srcPath, destPath);
      } else if (f.isFile() && f.name.toLowerCase().endsWith(".png")) {
        // Enhance PNG using sharp (upscale 2x)
        const image = sharp(srcPath);
        const metadata = await image.metadata();
        await image
          .resize(metadata.width * 2, metadata.height * 2) // simple 2x upscale
          .toFile(destPath);
      }
    }
  }

  await processFolder(EXTRACT_FOLDER, OUTPUT_FOLDER);

  // Re-zip enhanced images
  const outZip = new AdmZip();
  function addFolderToZip(folder, zipFolder) {
    const files = fs.readdirSync(folder, { withFileTypes: true });
    for (let f of files) {
      const fullPath = path.join(folder, f.name);
      const zipPath = path.join(zipFolder, f.name);
      if (f.isDirectory()) addFolderToZip(fullPath, zipPath);
      else outZip.addLocalFile(fullPath, zipFolder);
    }
  }
  addFolderToZip(OUTPUT_FOLDER, "");
  outZip.writeZip(OUTPUT_ZIP);
}

// ---------------- Start server ----------------
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));