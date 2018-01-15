// Global variables
var sdmAddresses = []; // 
var sdmStores = [];
var sdmSet; // IntArray to check that a SDM store has been written to
var counterThreshold;
var chunkSize;
var searchQuery;
var queryInProgress = false;
var addressThreshold = 0;
var numberOfChunks = 0;

// Function to create SDM memory for the lifetime of the application
function createMemory(chunkSize, numberOfChunks) {
    sdmAddresses = [];
    sdmStores = [];

    for (i = 0; i < numberOfChunks; i++) {
        sdmAddress = new Int8Array(chunkSize);
        sdmStore = new Int8Array(chunkSize);
        sdmSet = new Int8Array(chunkSize);
        
        // Generate a random sdmAddress
        for (var j = 0; j < chunkSize; j++) {
            sdmAddress[i] = getRandomBinary();
        }
        
        // Add to memory
        sdmAddresses.push(sdmAddress);
        sdmStores.push(sdmStore);
    }
}

// function to generate a chunk of particular size
function generateChunk(chunkSize) {

    chunk = new Int8Array(chunkSize);

    for (var i = 0; i < chunk.length; i++) {
        chunk[i] = getRandomBinary();
    }
    return chunk;
}

// Function to store a chunk into memory
function storeChunk(chunk) {

    for (var i = 0; i < sdmAddresses.length; i++) {

        // Check both chunk and address are in the same hamming threshold
        if (hammingDistance(sdmAddresses[i], chunk) <= addressThreshold) {
            // Set the bit to indicate data has been stored and is accessible
            sdmSet[i] = 1;
            
            // Iterate through each storage position
            for (var j = 0; j < chunk.length; j++) {   
                
                // Store Data Positionwise
                if (isWithinCounterThreshold(sdmStores[i][j])) {
                    if (chunk[j] == 1) {
                        sdmStores[i][j] += 1;
                    } else {
                        sdmStores[i][j] -= 1;
                    }
                }
            }
        } 
    }
}

// Function to search for a chunk in memory
function searchChunk(chunk) {

    // Involves sending a search request
    searchResponse = new Int8Array(chunkSize);
    var searchPassed = false;
    // Iterating through memory
    for (var i = 0; i < sdmAddresses.length; i++) {
        
         // Check both chunk and address are in the same hamming threshold
        if (hammingDistance(sdmAddresses[i], chunk) <= addressThreshold  && hasDataStored(i)) {
          
            searchPassed = true;

            for (var j = 0; j < chunkSize; j++) {
                searchResponse[j] += sdmStores[i][j];
            }
        }  
    }

    return [searchPassed, searchResponse];
}

// Function to handle search request from another peer
function handleSearchRequest(chunk) {
    return searchChunk(chunk);
}

// Function to handle response from your search request
function handleSearchResponse(previousChunk, currentChunk) {

    // Check hamming distance between previous and current
    var distance = hammingDistance(previousChunk, currentChunk);
    
    // End Cases
    if (distance == 0) {
        // Emit response as best match found
        return "converged";
    } else if (distance == (chunkSize / 2)) {
        // Emit Error - Chunk not found
        return "diverged";
    } else {
       // Emit broadcast again and wait for responses or recursion for single node
      console.log(distance);  
    }

}

// Function to sum array of chunks into one chunk for binarizing without threshold
function sumChunksPositionwise(chunks) {

    // Create a temporary chunk with the size of the first chunk
    bipolarChunk = new Int8Array(chunks[0].length);

    // Aggregate the resultant sum
    for (var chunk of chunks) {
        for (var i = 0; i < chunk.length; i++) {
            bipolarChunk[i] += chunk[i];
          }
    }
    
    return bipolarChunk;
}

// Function to sum array of chunks into one chunk for binarizing with threshold
function sumPositionwise(chunk) {
    
        // Create a temporary chunk with the size of the first chunk
        bipolarChunk = new Int8Array(chunk.length);
    
        for (var i = 0; i < chunk.length; i++) {
           bipolarChunk[i] += chunk[i];
        }
        
        return bipolarChunk;
}
    
// Function to convert bipolar chunk to binary chunk withoug thresholding
function binarizeChunk(chunk) {

    binaryChunk = new Int8Array(chunk.length);
    for (var i = 0; i < chunk.length; i++) {
        if (chunk[i] < 0) {
            binaryChunk[i] = 0;
        } else {
            binaryChunk[i] = 1;
        }
      }
    return binaryChunk;
}

// Function to calculate the hamming distance of two chucks
function hammingDistance(address, data) {
    var distance = 0;

    for (var i = 0; i < data.length; i++) {
        if (address[i] === data[i]) {
            continue
        } else {
            distance += 1;
        }
    }

    return distance;
}

// Function to check that a value is within SDM storage location limits
function isWithinCounterThreshold(value) {

    if (value > counterThreshold[0] && value < counterThreshold[1]) {
        return true;
    } else {
        return false;
    }

}

function getRandomBinary() {
    return Math.round(Math.random()); //The maximum is inclusive and the minimum is inclusive 
}

// Function to check if that SDM Store has data written to it
function hasDataStored(index) {
   if (sdmSet[index] == 1) {
       return true;
   } else {
       return false;
   }
}

// Worker Implementation
// Listen for commands to execute
self.addEventListener('message', function(e) {
    switch (e.data.cmd) {
        case "init":
            counterThreshold = e.data.storageThreshold;
            numberOfChunks = e.data.maxChunks;
            addressThreshold = e.data.maxThreshold;
            chunkSize = e.data.chunkSize;
            createMemory(chunkSize, numberOfChunks);
            console.log(counterThreshold);
            console.log(addressThreshold);
            console.log(chunkSize);
            console.log("Memory Created successfully: " + sdmAddresses.length + " " + sdmStores.length);
            break;


        
        case "storage_request":
            for (var i = 0; i < e.data.noToGenerate; i++) {
                storeChunk(e.data.generatedChunk);
                console.log(e.data.generatedChunk);
                postMessage({cmd: "storage_response"});
            }
            break;

        case "search_request":
            response = searchChunk(e.data.chunkToSearch);
            console.log("In search request worker with chunk:");
            console.log(response[1]);
            
            // Check if peer
            if (response[0]) {
                query = {
                    cmd: "search_response",
                    id: e.data.id,
                    chunkToSearch: response[1]
                  };
                postMessage(query, [query.chunkToSearch.buffer]);
            } else {
                console.log("Search failed in worker");
                empty = new Int8Array(chunkSize);
                query = {
                    cmd: "search_response",
                    id: e.data.id,
                    chunkToSearch: empty
                  };
                postMessage(query, [query.chunkToSearch.buffer]);
            } 
            break;

        default:
            break;
    }
  }, false);