(() => {
    const _enableResponseMode = (player, config) => {
        const currentMode = config.mode || 'json';
        const cmcdBatchArray = (currentMode === 'json') ? [] : null;

        function sendCmcdReport(cmcdData, reportingUrl) {
            if (currentMode == 'json'){
                if (!cmcdData || cmcdData.length === 0) return;
        
                console.log(`Sending batch of ${cmcdData.length} CMCD reports.`);
                fetch(reportingUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(cmcdData),
                })
                .then(reportResponse => {
                    console.log(reportResponse.ok ? 'CMCD batch data reported successfully.' : `Reporting server responded with an error.`);
                })
                .catch(error => {
                    console.error('Error sending CMCD batch data to reporting server:', error);
                });
            } else if (currentMode === 'query') {
                if (!cmcdData) return;
                
                console.log(`Sending CMCD report via query: ${reportingUrl.toString()}`);
                fetch(reportingUrl, {
                    method: 'GET',
                })
                .then(reportResponse => {
                    console.log(reportResponse.ok ? 'CMCD query data reported successfully.' : `Reporting server responded with an error`);
                })
                .catch(error => {
                    console.error('Error sending CMCD query data to reporting server:', error);
                });
            }
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
                    if (originalRequest) {
                        
                        // Add 'ts' (timestamp) CMCD key: Time request was initiated (epoch ms).
                        key = 'ts';
                        if (typeof originalRequest.requestStartTime === 'number' && (config.includeKeys === undefined || config.includeKeys.includes(key))) {
                            value = Math.round(originalRequest.requestStartTime);
                            cmcdJsonObjectForBody[key] = value;
                            newCmcdPairs.push(`${key}=${value}`);
                        }

                        // Add 'ttfb' (Time To First Byte) CMCD key.
                        key = 'ttfb';
                        if (typeof originalRequest.timeToFirstByte === 'number' && (config.includeKeys === undefined || config.includeKeys.includes(key))) {
                            value = Math.round(originalRequest.timeToFirstByte);
                            cmcdJsonObjectForBody[key] = value;
                            newCmcdPairs.push(`${key}=${value}`);
                        }

                        // Add 'ttlb' (Time To Last Byte) CMCD key: Duration from request start to last byte.
                        key = 'ttlb';
                        if (timeMs && typeof timeMs === 'number' && (config.includeKeys === undefined || config.includeKeys.includes(key))) {
                            value = Math.round(timeMs);
                            cmcdJsonObjectForBody[key] = value;
                            newCmcdPairs.push(`${value}=${value}`);
                        }
                    }

                    // Add 'rc' (Response code) CMCD key: Response code of the HTTP Request.                       
                    key = 'rc';
                    if (response && response.statusCode && (config.includeKeys === undefined || config.includeKeys.includes(key))) {
                        value = response.statusCode
                        cmcdJsonObjectForBody[key] = value;
                        newCmcdPairs.push(`${key}=${value}`);
                    } 

                    // Add the 'url' (URL) CMCD key
                    key = 'url';
                    value = response.uri;
                    cmcdJsonObjectForBody[key] = value;
                    const escapedUrlValue = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
                    newCmcdPairs.push(`${key}="${escapedUrlValue}"`);

                    
                    // Add the 'pt' (Playhead time) CMCD key: Current playhead time in seconds if VOD or time if Live.
                    // Important: 'pt' key should be calculated at the request, not response, but we do it here for simplicity but adding some error.
                    key = 'pt';
                    if (player.isLive()) {
                        value = player.getPlayheadTimeAsDate().getTime();
                    } else {
                        value = player.getMediaElement().currentTime
                    }
                    cmcdJsonObjectForBody[key] = value;
                    newCmcdPairs.push(`${key}=${value}`);

                    // Add the 'ltc' (Live Latency) CMCD key if not found for live streams.
                    // Important: 'ltc' key should be calculated at the request, not response, but we do it here for simplicity but adding some error.
                    key = 'ltc';
                    if (player.isLive()) {
                        if (!cmcdJsonObjectForBody[key]) {
                            console.log( 'Adding live latency to CMCD data');
                            value = player.getStats().liveLatency * 1000;
                            cmcdJsonObjectForBody[key] = value;
                            newCmcdPairs.push(`${key}=${value}`);
                        }
                    }

                    const reportUrl = new URL(config.url);
                    if (currentMode == 'json'){
                        cmcdBatchArray.push(cmcdJsonObjectForBody);
                        console.log(`CMCD data added to batch. Current batch size: ${cmcdBatchArray.length}. Data:`, JSON.stringify(cmcdJsonObjectForBody));
                        
                        if (cmcdBatchArray.length >= config.batchSize) {
                            sendCmcdReport(cmcdBatchArray.slice(), reportUrl); // Send a copy of the current batch
                            cmcdBatchArray.length = 0; // Reset the batch array
                        }
                    } else if (currentMode == 'query'){
                        cmcdDataString += newCmcdPairs.join(',');
                        console.log('Response Filter - CMCD data for reporting:', cmcdDataString);
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