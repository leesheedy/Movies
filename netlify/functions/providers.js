const fs = require("fs");
const path = require("path");

const ALLOWED_VALUES = [
  "drive",
  "world4u",
  "mod",
  "uhd",
  "filmyfly",
  "hdhub4u",
  "a111477",
  "kissKh",
];

function loadManifest() {
  const manifestPath = path.resolve(__dirname, "..", "..", "manifest.json");
  const contents = fs.readFileSync(manifestPath, "utf8");
  return JSON.parse(contents);
}

exports.handler = async () => {
  try {
    const manifest = loadManifest();
    const providers = ALLOWED_VALUES.map((value) =>
      manifest.find((provider) => provider.value === value)
    )
      .filter(Boolean)
      .map((provider) => ({
        ...provider,
        disabled: false,
      }));

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify(providers),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ error: error.message }),
    };
  }
};
