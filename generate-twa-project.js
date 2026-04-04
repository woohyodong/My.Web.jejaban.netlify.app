const fs = require("fs/promises");
const path = require("path");
const {
  BufferedLog,
  ConsoleLog,
  TwaGenerator,
  TwaManifest,
} = require("./.twa/node_modules/@bubblewrap/core");

const targetDirectory = path.resolve(__dirname, "twa-android");
const webManifestUrl = "https://jejaban.netlify.app/manifest.webmanifest";
const signingKeyPath = "d:\\03.woojjajja\\03.service\\woojjajja_200901_keystore.keystore";
const signingKeyAlias = "woojjajja";

async function main() {
  await fs.mkdir(targetDirectory, { recursive: true });

  const manifest = await TwaManifest.fromWebManifest(webManifestUrl);
  manifest.packageId = "app.netlify.jejaban.twa";
  manifest.signingKey.path = signingKeyPath;
  manifest.signingKey.alias = signingKeyAlias;

  await manifest.saveToFile(path.join(targetDirectory, "twa-manifest.json"));

  const generator = new TwaGenerator();
  const log = new BufferedLog(new ConsoleLog("Generating TWA"));
  const progress = () => {};

  await generator.createTwaProject(targetDirectory, manifest, log, progress);
  log.flush();

  console.log(`Generated TWA project at ${targetDirectory}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
