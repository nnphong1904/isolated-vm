const ivm = require("isolated-vm");

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

async function runUnstructuredCode({ id, untrustedCode }) {
  let isolate, context;

  try {
    isolate = new ivm.Isolate({ memoryLimit: 128 });
    context = isolate.createContextSync();
    const jail = context.global;

    // Expose a safe global.
    jail.setSync("global", jail.derefInto());
    // Expose a log function so that the isolate can log messages.
    jail.setSync("console.log", (...args) => {
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
   
        ${untrustedCode}
      `,
      { reference: true }
    );
    const value = await fn.apply(undefined, [], { result: { promise: true } });
    const plainResult = value?.copySync?.();
    return plainResult;
  } catch (err) {
    console.error("Error during isolate execution:", err);
    throw err;
  } finally {
    if (context) context.release();
    if (isolate) isolate.dispose();
  }
}

async function runServerPlugin({ id, name, code, params, userSettings }) {
  const idWithFallback = id || name;
  const wrappedCode = `
          ${code}
          (async function untrusted() { 
            const result = await ${name}(${JSON.stringify(params)}, ${JSON.stringify(userSettings)})
            return result;
          })
    `;

  return await runUnstructuredCode({
    id: idWithFallback,
    untrustedCode: wrappedCode,
  });
}

module.exports = {
  runServerPlugin,
};
