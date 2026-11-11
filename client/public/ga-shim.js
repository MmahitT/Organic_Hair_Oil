// Google's gtag() must push the `arguments` object into dataLayer (arrays are ignored). This one-line shim lives here,
// outside the linted app code, and is only ever loaded AFTER the visitor accepts analytics cookies.
window.dataLayer = window.dataLayer || [];
window.gtag = function gtag() { window.dataLayer.push(arguments); };
