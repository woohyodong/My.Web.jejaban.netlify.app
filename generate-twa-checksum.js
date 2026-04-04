const fs = require("fs/promises");
const path = require("path");
const { computeChecksum } = require("./.twa/node_modules/@bubblewrap/cli/dist/lib/cmds/shared");

async function main() {
  const targetDirectory = path.resolve(__dirname, "twa-android");
  const manifestFile = path.join(targetDirectory, "twa-manifest.json");
  const checksumFile = path.join(targetDirectory, "manifest-checksum.txt");
  const manifestContents = await fs.readFile(manifestFile);
  const checksum = computeChecksum(manifestContents);
  await fs.writeFile(checksumFile, checksum);
  console.log(`Wrote checksum to ${checksumFile}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
