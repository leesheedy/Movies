const path = require("path");
const fs = require("fs");
const axios = require("axios");
const cheerio = require("cheerio");

function createProviderContext() {
  return {
    axios,
    cheerio,
    commonHeaders: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  };
}

function ensureBuildExists() {
  const distDir = path.join(__dirname, "dist");
  if (!fs.existsSync(distDir)) {
    throw new Error("Build output not found. Run `npm run build` first.");
  }
  return distDir;
}

function loadProviderModule(provider, moduleName) {
  const modulePath = path.join(ensureBuildExists(), provider, `${moduleName}.js`);
  if (!fs.existsSync(modulePath)) {
    throw new Error(`Module not found: ${provider}/${moduleName}.js`);
  }

  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

async function quickTest(provider, moduleName, functionName, params = {}) {
  const loaded = loadProviderModule(provider, moduleName);
  const fn = loaded[functionName];

  if (typeof fn !== "function") {
    throw new Error(
      `Function not found: ${functionName} in ${provider}/${moduleName}.js`
    );
  }

  const mergedParams = {
    ...params,
    providerContext: params.providerContext || createProviderContext(),
    signal: params.signal || new AbortController().signal,
  };

  const startedAt = Date.now();
  const result = await fn(mergedParams);
  const elapsed = Date.now() - startedAt;

  console.log(`✅ ${provider}/${moduleName}.${functionName} passed in ${elapsed}ms`);
  console.log(JSON.stringify(result, null, 2));
  return result;
}

async function batchTest(configs = []) {
  const results = [];

  for (const config of configs) {
    const { provider, module, function: functionName, params } = config;
    try {
      await quickTest(provider, module, functionName, params);
      results.push({ config, ok: true });
    } catch (error) {
      console.error(
        `❌ ${provider}/${module}.${functionName} failed: ${error.message}`
      );
      results.push({ config, ok: false, error: error.message });
    }
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n📊 Batch completed: ${passed}/${results.length} passed`);
  return results;
}

module.exports = {
  quickTest,
  batchTest,
};
