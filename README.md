# CMCD v2 Plugins for Shaka Player (CMCDv2 POC)

## Overview

The `responseModePlugin` is a JavaScript module designed to work with Shaka Player. Its primary purpose is to enable CMCD Version 2 'Response Mode' to collect data related to server responses for media segment requests and report these metrics to a third-party server. Currently, the plugin supports two modes: JSON Mode and Query Mode.

This plugin can be used alongside Shaka Player's native CMCD (Common Media Client Data) features.

## Samples
This repo has two samples to try the plugin, `sample-shaka-3-3-1.html` and `sample-shaka-latest.html`. One showcases how this plugin works with the oldest Shaka Player version that has support for CMCD (v3.3.1), and the other with the latest version of Shaka Player published on NPM.

## Setup and Integration

Follow these steps to integrate the `responseModePlugin` into your Shaka Player application:

1.  **Include Scripts**:
    Make sure both Shaka Player and the `responseModePlugin.js` are included in your HTML file before your application logic:
    ```html
    <script src="path/to/shaka-player.compiled.js"></script>
    <script src="path/to/responseModePlugin.js"></script>
    ```

    Also, you can use jsDelivr to get this soruces
    ```html
    <script src="https://cdn.jsdelivr.net/npm/shaka-player@4.14.14/dist/shaka-player.compiled.js"></script>
    <script src="https://cdn.jsdelivr.net/gh/qualabs/shaka-player-cmcd-v2-plugin/responseModePlugin.js"></script>
    ```

2.  **Initialize Shaka Player**:
    Set up your Shaka Player instance as usual.
    ```javascript
    // Install built-in polyfills.
    shaka.polyfill.installAll();

    // Check for browser support.
    if (shaka.Player.isBrowserSupported()) {
        initPlayer();
    } else {
        console.error('Browser not supported!');
    }

    async function initPlayer() {
        const video = document.getElementById('video');
        const player = new shaka.Player();
        await player.attach(video);
        window.player = player; // Optional: for debugging

        // ... (Shaka Player CMCD configuration - see below)
        // ... (responseModePlugin configuration - see below)

        // Load a manifest
        try {
            await player.load(manifestUri);
            console.log('The video has now been loaded!');
        } catch (e) {
            console.error('Error loading manifest:', e);
        }
    }
    ```

3.  **(Optional but Recommended) Configure Shaka Player's CMCD**:
    The plugin can gather CMCD data generated from Request Mode and includes it on the Response Mode report. If Shaka Player's CMCD is not enabled, only keys on `includeKeys` will be included on the Response Mode report. 
    If you are using CMCD for requests, configure it on the player. The `responseModePlugin` complements this by providing response-side metrics.
    ```javascript
    player.configure({
        cmcd: {
            version: 2,
            enabled: true,
            // Change the contentId value, it's a unique identifier for the content.
            contentId: 'your-content-id',
            //sessionId: 'your-unique-session-id', // Auto generate UUID or uncomment to fix a session id
            useHeaders: false, //The plugin only works with CMCD in queryparams
        }
    });
    ```

4.  **Configure the `responseModePlugin`**:
    Create a configuration object for the plugin.
    ```javascript
    const reportingUrlString = 'https://collector-gcloud-function-560723680185.us-east1.run.app/cmcd/response-mode';
    
    const responseModePluginConfig = {
        mode: 'json', // Specify 'json' or 'query'. 
        batchSize: 8, // Batch is only availabe with json mode
        url: reportingUrlString, // The URL object for the reporting endpoint
        // includeKeys: ['ts', 'ttfb', 'ttlb', 'url', 'pt', 'rc', 'ltc'] // Will send all keys if not configured, Available keys: ['ts', 'ttfb', 'ttlb', 'url', 'pt', 'rc', 'ltc]
    };
    ```

5.  **Enable the Plugin**:
    After the player is created and configured, enable the `responseModePlugin`.
    ```javascript
    // In your initPlayer function, after player creation and configuration:
    responseModePlugin.enableResponseMode(player, responseModePluginConfig);
    ```
