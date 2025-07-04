(() => {
    const _enableResponseMode = (player, config) => {
        const currentMode = config.mode || 'json';
        const cmcdBatchArray = (currentMode === 'json') ? [] : null;
        const videoElement = player.getMediaElement();

        let sequenceNumber = 0;
        let timePlay = null;
        let msd = null;
        let msdSent = false;

        videoElement.addEventListener('play', function () {
            if (timePlay == null) timePlay = new Date().getTime();
        });

        videoElement.addEventListener('playing', function () {
            if (msd == null) msd = new Date().getTime() - timePlay;
        });

        function sendCmcdReport(cmcdData, reportingUrl) {
            if (currentMode == 'json'){
                if (!cmcdData || cmcdData.length === 0) return;
        
                // console.log(`Sending batch of ${cmcdData.length} CMCD reports.`);
                fetch(reportingUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(cmcdData),
                })
                .then(reportResponse => {
                    // console.log(reportResponse.ok ? 'CMCD batch data reported successfully.' : `Reporting server responded with an error.`);
                })
                .catch(error => {
                    console.error('Error sending CMCD batch data to reporting server:', error);
                });
            } else if (currentMode === 'query') {
                if (!cmcdData) return;
                
                // console.log(`Sending CMCD report via query: ${reportingUrl.toString()}`);
                fetch(reportingUrl, {
                    method: 'GET',
                })
                .then(reportResponse => {
                    // console.log(reportResponse.ok ? 'CMCD query data reported successfully.' : `Reporting server responded with an error`);
                })
                .catch(error => {
                    console.error('Error sending CMCD query data to reporting server:', error);
                });
            }
        }

        // TODO: May need some debugging
        function getPlayerState(player) {
            const video = player.getMediaElement();
            if (!video) return;
            if (video.seeking) return 'k';
            if (player.isBuffering()) return 'r';
            if (video.ended) return 'e'
            // 4. Paused / Preloading
            if (video.paused) {
                if (video.currentTime === 0 && video.played.length === 0) {
                    return 'p'; // Prealoading
                }
                return 'a'; //Paused
            }
            // 5. Playing / Starting
            if (video.readyState < 3) {
                return 's';
            }
            return 'p';
        }

        // Add a response filter to process CMCD data and send a report.
        player.getNetworkingEngine().registerResponseFilter(function(type, response) {
            if (type === shaka.net.NetworkingEngine.RequestType.MANIFEST ||
                type === shaka.net.NetworkingEngine.RequestType.SEGMENT) {
                try {
                    const requestUri = new URL(response.uri);
                    const cmcdJsonObjectForBody = {};
                    let cmcdDataString = requestUri.searchParams.get('CMCD') || '';
                    const newCmcdPairs = [];

                    // Helper function to parse CMCD key-value string and add to JS object
                    function parseAndAddCmcdFromString(cmcdStr, targetObj) {
                        if (!cmcdStr) return;
                        const pairs = cmcdStr.split(',');
                        pairs.forEach(pair => {
                            const firstEq = pair.indexOf('=');
                            let key, value;
                            if (firstEq > 0) { // key=value
                                key = pair.substring(0, firstEq);
                                const valueStr = pair.substring(firstEq + 1);
                                if (valueStr.startsWith('"') && valueStr.endsWith('"')) { // Quoted string
                                    value = valueStr.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
                                } else { // Number or token
                                    const num = Number(valueStr);
                                    value = (!isNaN(num) && String(num) === valueStr.trim()) ? num : valueStr;
                                }
                            } else if (pair.trim()) { // Boolean key (present means true)
                                key = pair.trim();
                                value = true;
                            }
                            if (key) {
                                targetObj[key] = value;
                            }
                        });
                    }

                    // Populate cmcdJsonObjectForBody with initial CMCD data from the URL
                    parseAndAddCmcdFromString(requestUri.searchParams.get('CMCD') || '', cmcdJsonObjectForBody);
                    
                    let key, value;

                    const { originalRequest, timeMs } = response;

                    // Some old versions of Shaka Player do not have originalRequest, so we need to check for it.
                    if (originalRequest) {
                        
                        // Add 'ts' (timestamp) CMCD key: Time request was initiated (epoch ms).
                        key = 'ts';
                        if (!cmcdJsonObjectForBody[key]) {
                            if (typeof originalRequest.requestStartTime === 'number' && (config.includeKeys === undefined || config.includeKeys.includes(key))) {
                                value = Math.round(originalRequest.requestStartTime);
                                cmcdJsonObjectForBody[key] = value;
                                newCmcdPairs.push(`${key}=${value}`);
                            }
                        }

                        // Add 'ttfb' (Time To First Byte) CMCD key.
                        key = 'ttfb';
                        if (!cmcdJsonObjectForBody[key]) {
                            if (typeof originalRequest.timeToFirstByte === 'number' && (config.includeKeys === undefined || config.includeKeys.includes(key))) {
                                value = Math.round(originalRequest.timeToFirstByte);
                                cmcdJsonObjectForBody[key] = value;
                                newCmcdPairs.push(`${key}=${value}`);
                            }
                        }
                    } else {
                        // For older versions of Shaka Player, we can add 'ts' key based on the response time of the response
                        key = 'ts';
                        if (!cmcdJsonObjectForBody[key]) {
                            if (timeMs && typeof timeMs === 'number' && (config.includeKeys === undefined || config.includeKeys.includes(key))) {
                                value = (new Date()).getTime() - timeMs;
                                cmcdJsonObjectForBody[key] = value;
                                newCmcdPairs.push(`${key}=${value}`);
                            }
                        }
                    }

                    // Add 'ttlb' (Time To Last Byte) CMCD key: Duration from request start to last byte.
                    key = 'ttlb';
                    if (!cmcdJsonObjectForBody[key]) {
                        if (timeMs && typeof timeMs === 'number' && (config.includeKeys === undefined || config.includeKeys.includes(key))) {
                            value = Math.round(timeMs);
                            cmcdJsonObjectForBody[key] = value;
                            newCmcdPairs.push(`${value}=${value}`);
                        }                    
                    }

                    // Add 'rc' (Response code) CMCD key: Response code of the HTTP Request.                       
                    key = 'rc';
                    if (!cmcdJsonObjectForBody[key]) {
                        if (response && response.status && (config.includeKeys === undefined || config.includeKeys.includes(key))) {
                            value = response.status
                            cmcdJsonObjectForBody[key] = value;
                            newCmcdPairs.push(`${key}=${value}`);
                        } 
                    }

                    // Add the 'url' (URL) CMCD key
                    key = 'url';
                    if (!cmcdJsonObjectForBody[key]) {
                        value = response.uri.split('?')[0]; // Remove query parameters from the URL (tokens, CMCD, etc.)
                        cmcdJsonObjectForBody[key] = value;
                        const escapedUrlValue = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
                        newCmcdPairs.push(`${key}="${escapedUrlValue}"`);
                    }

                    
                    // Add the 'pt' (Playhead time) CMCD key: Current playhead time in seconds if VOD or time if Live.
                    // Important: 'pt' key should be calculated at the request, not response, but we do it here for simplicity but adding some error.
                    key = 'pt';
                    if (!cmcdJsonObjectForBody[key]) {
                        if (player.isLive()) {
                            value = player.getPlayheadTimeAsDate().getTime();
                        } else {
                            value = player.getMediaElement().currentTime
                        }
                        if (value > 0) {
                            cmcdJsonObjectForBody[key] = value;
                            newCmcdPairs.push(`${key}=${value}`);
                        }
                    }

                    // Add the 'ltc' (Live Latency) CMCD key if not found for live streams.
                    // Important: 'ltc' key should be calculated at the request, not response, but we do it here for simplicity but adding some error.
                    key = 'ltc';
                    if (!cmcdJsonObjectForBody[key]) {
                        if (player.isLive()) {
                            value = Math.round(player.getStats().liveLatency * 1000);
                            if ( value > 0){
                                cmcdJsonObjectForBody[key] = value;
                                newCmcdPairs.push(`${key}=${value}`);
                            }
                        }
                    }

                    // Add the 'pr' (Playback Rate) CMCD key if not found
                    // Important: 'pr' key should be calculated at the request, not response, but we do it here for simplicity but adding some error.
                    key = 'pr';
                    if (!cmcdJsonObjectForBody[key]) {
                        value = player.getPlaybackRate();
                        cmcdJsonObjectForBody[key] = value;
                        newCmcdPairs.push(`${key}=${value}`);
                    }

                    // Add the 'sta' (Live Latency) CMCD key if not found.
                    // Important: 'sta' key should be calculated at the request, not response, but we do it here for simplicity but adding some error.
                    key = 'sta';
                    if (!cmcdJsonObjectForBody[key]) {
                        value = getPlayerState(player);
                        cmcdJsonObjectForBody[key] = value;
                        newCmcdPairs.push(`${key}=${value}`);
                    }                  

                    // Add the 'msd' (Media Start Delay) CMCD key if not found.
                    // 'msd' must be sent only once per session, so we check if it was already sent.
                    key = 'msd';

                    // Remove 'msd' from the CMCD object if it was already sent by this plugin.
                    if (cmcdJsonObjectForBody[key] && msdSent){
                        delete cmcdJsonObjectForBody[key]
                    }
                    
                    // Fund 'msd' by native CMCD implementation, setting as sent.
                    if (cmcdJsonObjectForBody[key]){
                        msdSent = true;
                    }

                    // 'msd' was not sent and we have a valid msd value, so we send it.               
                    if (!msdSent && msd) {
                        value = msd;
                        msdSent = true;
                        cmcdJsonObjectForBody[key] = value;
                        newCmcdPairs.push(`${key}=${value}`);
                    }
                    
                    // Droped frames ('df') is an absolute count of dropped frames since session initiation. 
                    // This key should only be sent for content types of 'v','av' or 'o'      
                    key = 'df'
                    if (!cmcdJsonObjectForBody[key]) {
                        if (videoElement.getVideoPlaybackQuality){
                            const value = videoElement.getVideoPlaybackQuality().droppedVideoFrames;
                            cmcdJsonObjectForBody[key] = value;
                            newCmcdPairs.push(`${key}=${value}`);                            
                        }
                    }

                    // Sequence Number ('sn') A monotonically increasing integer to identify the sequence of a CMCD report to a target 
                    // within a session. This MUST be reset to zero on the start of a new session-id. 
                    // Sequence numbers increase independently per each combination of mode and target.
                    key = 'sn'
                    if (!cmcdJsonObjectForBody[key]) {
                        value = sequenceNumber;
                        cmcdJsonObjectForBody[key] = value;
                        newCmcdPairs.push(`${key}=${value}`);
                        sequenceNumber = sequenceNumber + 1;                           
                    }

                    const reportUrl = new URL(config.url);
                    if (currentMode == 'json'){
                        cmcdBatchArray.push(cmcdJsonObjectForBody);
                        // console.log(`CMCD data added to batch. Current batch size: ${cmcdBatchArray.length}. Data:`, JSON.stringify(cmcdJsonObjectForBody));
                        
                        if (cmcdBatchArray.length >= config.batchSize) {
                            sendCmcdReport(cmcdBatchArray.slice(), reportUrl); // Send a copy of the current batch
                            cmcdBatchArray.length = 0; // Reset the batch array
                        }
                    } else if (currentMode == 'query'){
                        cmcdDataString += newCmcdPairs.join(',');
                        // console.log('Response Filter - CMCD data for reporting:', cmcdDataString);
                        reportUrl.searchParams.set('CMCD', cmcdDataString);
                        sendCmcdReport(cmcdDataString, reportUrl);
                    }
                } catch (e) {
                    console.error('Error in response filter while processing CMCD for reporting:', e);
                }
            }
        });
    }

    window.responseModePlugin = {
        enableResponseMode(player, config) {
            _enableResponseMode(player, config);
        }
    }

})();