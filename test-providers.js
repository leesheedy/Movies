const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { startDevServer } = require("./dev-server");

/**
 * Provider testing utility
 */
class ProviderTester {
  constructor(serverUrl = "http://localhost:3001") {
    this.serverUrl = serverUrl;
    this.axios = axios.create({
      baseURL: serverUrl,
      timeout: 10000,
    });
  }

  /**
   * Test server connectivity
   */
  async testConnection() {
    try {
      const response = await this.axios.get("/health");
      console.log("✅ Server connection OK");
      return true;
    } catch (error) {
      console.error("❌ Server connection failed:", error.message);
      return false;
    }
  }

  /**
   * Test manifest endpoint
   */
  async testManifest() {
    try {
      const response = await this.axios.get("/manifest.json");
      const providers = response.data;

      console.log(`✅ Manifest OK - Found ${providers.length} providers:`);
      providers.forEach((p) => {
        console.log(`  📦 ${p.display_name} (${p.value}) v${p.version}`);
      });

      return providers;
    } catch (error) {
      console.error("❌ Manifest test failed:", error.message);
      return null;
    }
  }

  /**
   * Test individual provider modules
   */
  async testProvider(providerName) {
    console.log(`\n🧪 Testing provider: ${providerName}`);

    const modules = ["catalog", "posts", "meta", "stream", "episodes"];
    const results = {};

    for (const module of modules) {
      try {
        const response = await this.axios.get(
          `/dist/${providerName}/${module}.js`
        );
        results[module] = {
          success: true,
          size: response.data.length,
          hasExports: response.data.includes("exports."),
        };
        console.log(`  ✅ ${module}.js (${results[module].size} bytes)`);
      } catch (error) {
        results[module] = {
          success: false,
          error: error.response?.status === 404 ? "Not found" : error.message,
        };
        const isOptional = module === "episodes";
        const icon = isOptional ? "⚠️ " : "❌";
        console.log(
          `  ${icon} ${module}.js - ${results[module].error}${
            isOptional ? " (optional)" : ""
          }`
        );
      }
    }

    return results;
  }

  /**
   * Test all providers
   */
  async testAllProviders() {
    console.log("🚀 Starting comprehensive provider test...\n");

    // Test connection
    const connected = await this.testConnection();
    if (!connected) return { ok: false, reason: "connection" };

    // Test manifest
    const providers = await this.testManifest();
    if (!providers) return { ok: false, reason: "manifest" };

    // Test each provider
    const results = {};
    for (const provider of providers) {
      results[provider.value] = await this.testProvider(provider.value);
    }

    // Summary
    console.log("\n📊 Test Summary:");
    console.log("=".repeat(50));

    let totalProviders = 0;
    let passedProviders = 0;

    for (const [providerName, modules] of Object.entries(results)) {
      totalProviders++;
      const requiredModules = ["catalog", "posts", "meta", "stream"];
      const passedRequired = requiredModules.every(
        (mod) => modules[mod]?.success
      );

      if (passedRequired) {
        passedProviders++;
        console.log(`✅ ${providerName} - All required modules OK`);
      } else {
        console.log(`❌ ${providerName} - Missing required modules`);
      }
    }

    console.log(
      `\n📈 Results: ${passedProviders}/${totalProviders} providers passed`
    );

    if (passedProviders === totalProviders) {
      console.log("🎉 All providers are ready for testing!");
    } else {
      console.log("⚠️  Some providers need attention before testing.");
    }

    return { ok: passedProviders === totalProviders, results };
  }

  /**
   * Trigger rebuild on server
   */
  async rebuild() {
    try {
      console.log("🔨 Triggering rebuild...");
      const response = await this.axios.post("/build");
      console.log("✅ Rebuild completed");
      return true;
    } catch (error) {
      console.error(
        "❌ Rebuild failed:",
        error.response?.data?.error || error.message
      );
      return false;
    }
  }

  /**
   * Get server status
   */
  async getStatus() {
    try {
      const response = await this.axios.get("/status");
      const status = response.data;

      console.log("📊 Server Status:");
      console.log(`  🟢 Status: ${status.status}`);
      console.log(`  🔌 Port: ${status.port}`);
      console.log(`  📦 Providers: ${status.providers}`);
      console.log(`  🕐 Last Build: ${status.buildTime || "Never"}`);

      if (status.providerList.length > 0) {
        console.log("  📋 Available Providers:");
        status.providerList.forEach((p) => console.log(`    • ${p}`));
      }

      return status;
    } catch (error) {
      console.error("❌ Failed to get status:", error.message);
      return null;
    }
  }
}

/**
 * CLI interface
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "test";
  const providerName = args[1];
  const shouldStartServer = args.includes("--with-server");

  const tester = new ProviderTester();
  let devServer = null;

  try {
    if (shouldStartServer) {
      devServer = await startDevServer();
    }

    switch (command) {
      case "test": {
        if (providerName && !providerName.startsWith("--")) {
          await tester.testProvider(providerName);
          return;
        }
        const summary = await tester.testAllProviders();
        if (!summary?.ok) {
          process.exitCode = 1;
        }
        return;
      }

      case "status":
        await tester.getStatus();
        return;

      case "rebuild": {
        const ok = await tester.rebuild();
        if (!ok) process.exitCode = 1;
        return;
      }

      case "connection": {
        const ok = await tester.testConnection();
        if (!ok) process.exitCode = 1;
        return;
      }

      case "manifest": {
        const providers = await tester.testManifest();
        if (!providers) process.exitCode = 1;
        return;
      }

      default:
        console.log(`
Usage: node test-providers.js [command] [provider] [--with-server]

Commands:
  test [provider]  - Test all providers or specific provider
  status          - Show server status
  rebuild         - Trigger rebuild
  connection      - Test server connection
  manifest        - Test manifest endpoint

Options:
  --with-server   - Start a local dev server before testing

Examples:
  node test-providers.js test --with-server   # Test all providers with auto server
  node test-providers.js test vidsrc          # Test specific provider
  node test-providers.js status               # Show status
  node test-providers.js rebuild              # Rebuild and test
      `);
    }
  } finally {
    if (devServer) {
      await devServer.stop();
    }
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = ProviderTester;
