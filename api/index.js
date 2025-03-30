const express = require("express");
const { runServerPlugin } = require("./functions");
const app = express();
const port = process.env.PORT || 3000;

// Error handling for uncaught exceptions
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

app.get("/", async (req, res) => {
  try {
    const code = `
      async function fetchPageContent(url, pluginServer) {
        const response = await fetch(
          \`\${pluginServer}/web-page-reader/get-content?url=\${encodeURIComponent(url)}\`
        );

        if (!response.ok) {
          throw new Error(
            \`Failed to fetch web content: \${response.status} - \${response.statusText}\`
          );
        }
        const data = await response.json();
        return data.responseObject;
      }

      async function read_web_page_content(params, userSettings) {
        const { url } = params;
        const { pluginServer } = userSettings;
        if (!pluginServer) {
          throw new Error(
            "Missing plugin server URL. Please set it in the plugin settings."
          );
        }

        const cleanPluginServer = pluginServer.replace(/\\/$/, '');


        try {
          return await fetchPageContent(url, cleanPluginServer);
        } catch (error) {
          console.error("Error summarizing webpage:", error);
          return "Error: Unable to generate a summary. Please try again later.";
        }
      }
    `;
    const result = await runServerPlugin({
      id: "read_web_page_content",
      name: "read_web_page_content",
      code: code,
      params: { url: "https://tamagui.dev/docs/intro/benchmarks" },
      userSettings: {
        pluginServer: "https://plugins-server-1o4l.onrender.com",
      },
    });

    res.json({ message: "Script executed successfully in vercel", result });
  } catch (err) {
    console.error("Error during isolate execution:", err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});

module.exports = app;
