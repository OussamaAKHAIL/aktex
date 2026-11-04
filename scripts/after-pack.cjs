// AKTeX — post-pack hook: embed the AKTeX icon into the Windows executable.
//
// electron-builder's `signAndEditExecutable: false` keeps the CI build working
// without the winCodeSign archive, but it also leaves the default Electron icon
// on AKTeX.exe. rcedit edits the exe directly (icon/version resources) and does
// not require any signing toolchain, so the taskbar/explorer icon is correct
// while the package remains unsigned.

const path = require('path');
const fs = require('fs');

module.exports = async function afterPack(context) {
  const productFilename = context.packager.appInfo.productFilename;
  const exe = path.join(context.appOutDir, `${productFilename}.exe`);
  const icon = path.join(process.cwd(), 'assets', 'icon.ico');

  if (!fs.existsSync(exe)) {
    context.packager.info.log?.(`afterPack: exe not found at ${exe}`, 'warn');
    console.warn(`[afterPack] exe not found at ${exe}`);
    return;
  }
  if (!fs.existsSync(icon)) {
    console.warn(`[afterPack] icon not found at ${icon}`);
    return;
  }

  try {
    const { rcedit } = await import('rcedit');
    await rcedit(exe, {
      icon,
      'version-string': {
        ProductName: 'AKTeX',
        FileDescription: 'AKTeX — Offline LaTeX editor for Windows',
        CompanyName: 'AKTeX contributors',
        LegalCopyright: 'Copyright © 2026 AKTeX contributors',
      },
    });
    console.log(`[afterPack] Applied AKTeX icon to ${exe}`);
  } catch (error) {
    console.error('[afterPack] Failed to apply icon:', error);
    throw error;
  }
};
