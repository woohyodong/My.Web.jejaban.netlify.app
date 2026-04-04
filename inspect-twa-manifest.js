const { TwaManifest } = require("./.twa/node_modules/@bubblewrap/core");

(async () => {
  const manifest = await TwaManifest.fromWebManifest(
    "https://jejaban.netlify.app/manifest.webmanifest",
  );

  console.log(
    JSON.stringify(
      {
        host: manifest.host,
        startUrl: manifest.startUrl,
        name: manifest.name,
        launcherName: manifest.launcherName,
        packageId: manifest.packageId,
        appVersionCode: manifest.appVersionCode,
        display: manifest.display,
        orientation: manifest.orientation,
        themeColor: manifest.themeColor.hex(),
        backgroundColor: manifest.backgroundColor.hex(),
        iconUrl: manifest.iconUrl,
        maskableIconUrl: manifest.maskableIconUrl,
        monochromeIconUrl: manifest.monochromeIconUrl,
        shortcuts: manifest.shortcuts,
        signingKey: manifest.signingKey,
      },
      null,
      2,
    ),
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
