const express = require("express");
const ivm = require("isolated-vm");

const app = express();
const port = process.env.PORT || 3000;

// Error handling for uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Host-side delegate function that makes an HTTPS call.
async function fetchDelegate(url) {
  try {
    console.log("Delegate: Starting fetch for URL:", url);
    const response = await fetch(url);
    console.log("Delegate: Response status:", response.status);

    const headers = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    const data = await response.json();
    console.log("Delegate: Response data:", data);

    // Return a plain object that can be deep-copied.
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers,
      data, // full data object
    };
  } catch (err) {
    console.error("Delegate: Fetch error:", err);
    throw err;
  }
}

app.get("/", async (req, res) => {
  let isolate, context, script;
  try {
    // Create a new isolate for this request.
    isolate = new ivm.Isolate({ memoryLimit: 128 });
    context = isolate.createContextSync();
    const jail = context.global;

    // Expose a safe global.
    jail.setSync("global", jail.derefInto());
    // Expose a log function so that the isolate can log messages.
    jail.setSync("log", (...args) => {
      console.log("Isolate log:", ...args);
    });
    // Expose the fetchDelegate function to the isolate.
    const delegateRef = new ivm.Reference(fetchDelegate);
    jail.setSync("fetchDelegate", delegateRef);

    // Compile a script that calls fetchDelegate and returns its result.
    // We call fetchDelegate.apply with options to await its promise and deep-copy its result.
    const fn = await context.eval(
      `
        // Define a fetch function that uses fetchDelegate internally
        async function fetch(url, options = {}) {
          const response = await fetchDelegate.apply(undefined, [url], { result: { promise: true, copy: true } });
          return {
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
            json: async () => response.data,
            text: async () => JSON.stringify(response.data),
            blob: async () => new Blob([JSON.stringify(response.data)]),
            arrayBuffer: async () => new ArrayBuffer(0),
            clone: () => fetch(url, options)
          };
        }

        async function fetchPageContent(url, pluginServer) {
        try{
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
        } catch (error) {
          console.error('Error fetching web content:', error);
          return 'Error: Unable to generate a summary. Please try again later.';
        }
        }

        
        (async function untrusted() { 
          const result = await fetchPageContent("https://tamagui.dev/docs/intro/benchmarks", "https://plugins-server-1o4l.onrender.com");
          return result;
        })
    `,
      { reference: true }
    );
    const value = await fn.apply(undefined, [], { result: { promise: true } });
    const plainResult = value?.copySync?.();


    console.log('plainResult => ', plainResult);

    res.json({ message: "Script executed successfully in vercel", plainResult });
  } catch (err) {
    console.error("Error during isolate execution:", err);
    res.status(500).json({ error: err.message });
  } finally {
    if (context) context.release();
    if (script) script.release();
    if (isolate) isolate.dispose();
  }
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});

module.exports = app;
