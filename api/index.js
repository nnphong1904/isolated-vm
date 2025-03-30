const express = require("express");
const { runServerPlugin } = require("./functions");
const app = express();
const bodyParser = require("body-parser");
// parse application/json
const port = process.env.PORT || 3000;

app.use(bodyParser.json());

// Error handling for uncaught exceptions
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

app.post("/", async (req, res) => {
  try {
    const { code, params, userSettings, id, name } = req.body;
    const result = await runServerPlugin({
      id,
      name,
      code,
      params,
      userSettings,
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
