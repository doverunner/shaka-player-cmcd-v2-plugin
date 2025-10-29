# CMCD v2 Plugins for Shaka Player (CMCDv2 POC)

## Overview

This repository provides two CMCD Version 2 plugins for Shaka Player:

1. **`responseModePlugin`**: Collects server response metrics for media segment requests and reports them to a third-party server.
2. **`eventModePlugin`**: Collects player event data (playback state changes, user interactions, errors) and reports them with batch support.

Both plugins support JSON batch mode and query mode for data transmission.

These plugins can be used alongside Shaka Player's native CMCD (Common Media Client Data) features.

## Samples
This repo has three samples to try the plugins:
- `sample-shaka-3-3-1.html`: Response Mode with Shaka Player v3.3.1 (oldest version with CMCD support)
- `sample-shaka-latest.html`: Response Mode with latest Shaka Player version
- `sample-event-mode.html`: Event Mode with batch support

## Setup and Integration

### Response Mode Plugin

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

### Event Mode Plugin

Follow these steps to integrate the `eventModePlugin` into your Shaka Player application:

1.  **Include Scripts**:
    Include both Shaka Player and the `eventModePlugin.js` in your HTML file:
    ```html
    <script src="https://cdn.jsdelivr.net/npm/shaka-player@latest/dist/shaka-player.compiled.js"></script>
    <script src="eventModePlugin.js"></script>
    ```

2.  **Configure Shaka Player's CMCD** (Optional but Recommended):
    ```javascript
    player.configure({
        cmcd: {
            version: 2,
            enabled: true,
            contentId: 'your-content-id',
            sessionId: 'your-session-id', // Optional, auto-generated if not provided
            useHeaders: false,
        }
    });
    ```

3.  **Configure the `eventModePlugin`**:
    ```javascript
    const eventModePluginConfig = {
        mode: 'json',              // 'json' for batch mode, 'query' for individual requests
        batchSize: 5,              // Send batch when N events accumulated (json mode only)
        batchTimer: 30,            // Send batch every N seconds (optional, json mode only)
        timeInterval: 10,          // Send periodic 't' event every N seconds (optional)
        url: 'https://your-cmcd-collector.com/event-mode',

        // Optional: Filter specific events to report
        // events: ['ps', 't', 'e', 'm', 'um', 'pe', 'pc', 'b'],
        // ps=playState, t=timeInterval, e=error, m=mute, um=unmute,
        // pe=playerExpand, pc=playerCollapse, b=background

        // Optional: Filter specific CMCD keys to include
        // includeKeys: ['e', 'sta', 'ts', 'v', 'sid', 'cid', 'sf', 'mtp',
        //               'pr', 'bg', 'st', 'ltc', 'pt', 'msd', 'df', 'sn', 'ec']
    };
    ```

4.  **Enable the Plugin**:
    ```javascript
    // Returns a cleanup function
    const cleanup = eventModePlugin.enableEventMode(player, eventModePluginConfig);

    // Optional: Call cleanup when destroying the player
    // cleanup();
    ```

## Event Mode Features

The `eventModePlugin` provides comprehensive event tracking with the following features:

### Supported Events
- **Playback State Events (`ps`)**: play, pause, playing, waiting, seeking, ended, buffering/rebuffering
- **User Interaction Events**:
  - `m` / `um`: mute/unmute
  - `pe` / `pc`: player expand/collapse (fullscreen, picture-in-picture)
- **Background Mode (`b`)**: Tab visibility changes
- **Error Events (`e`)**: Player errors with error codes
- **Time Interval (`t`)**: Periodic reporting at configured intervals

### Batch Configuration
- **`batchSize`**: Number of events to accumulate before sending (JSON mode only)
- **`batchTimer`**: Maximum time (in seconds) to wait before sending batch (JSON mode only)
- Both triggers can work together - batch is sent when either condition is met

### CMCD Keys Included
The plugin collects the following CMCD keys:
- **Event keys**: `e` (event type), `sta` (player state), `ec` (error code)
- **Session keys**: `v` (version), `sid` (session ID), `cid` (content ID)
- **Player keys**: `sf` (streaming format), `mtp` (measured throughput), `pr` (playback rate)
- **Stream keys**: `st` (stream type), `bg` (backgrounded), `ltc` (live latency), `pt` (playhead time)
- **Metrics keys**: `ts` (timestamp), `msd` (media start delay), `df` (dropped frames), `sn` (sequence number)

## Configuration Examples

### Response Mode - JSON Batch
```javascript
const responseModePluginConfig = {
    mode: 'json',
    batchSize: 10,
    url: 'https://your-collector.com/response',
};
```

### Event Mode - JSON Batch with Filtering
```javascript
const eventModePluginConfig = {
    mode: 'json',
    batchSize: 5,
    batchTimer: 10,
    timeInterval: 30,
    url: 'https://your-collector.com/event',
    events: ['ps', 't', 'e'],  // Only playback state, time interval, and error events
    includeKeys: ['e', 'sta', 'ts', 'sid', 'cid', 'sn'],  // Limited key set
};
```

### Event Mode - Query Mode (Individual Requests)
```javascript
const eventModePluginConfig = {
    mode: 'query',
    url: 'https://your-collector.com/event',
    timeInterval: 60,  // Send time interval event every 60 seconds
};
```
